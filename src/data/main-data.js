import { createDataWorkerClient } from './data-worker-client.js';
import { createPersistentDataCache } from './persistent-data-cache.js';
import { computeDailyStats, computeMonthlyStats, computeYearlyStats } from './stats.js';

export function createMainDataHandlers(context) {
  const { settings, DEFAULT_SETTINGS, dashboardState, downloadCsv, describeError } = context;
  const perfMonitor = context?.perfMonitor || null;
  const pageId = typeof context?.pageId === 'string' ? context.pageId : '';

  const DATA_WORKER_URL = new URL(
    'data-worker.js?v=2026-02-25-transfer-worker-2',
    window.location.href
  ).toString();
  const DATA_CACHE_PREFIX = 'edDashboard:dataCache:';
  const DATA_CACHE_SCHEMA_VERSION = 2;
  const DATA_CACHE_ARTIFACT_KINDS = new Set(['full', 'daily-lite', 'daily-plus-agg']);
  const inMemoryDataCache = new Map();
  const persistentDataCache =
    context?.persistentDataCache && typeof context.persistentDataCache === 'object'
      ? context.persistentDataCache
      : createPersistentDataCache();
  const dataWorkerClient = createDataWorkerClient({ workerUrl: DATA_WORKER_URL });
  let dataWorkerCounter = 0;
  let deferredHydrationCounter = 0;
  let kpiWorkerDatasetHandle = null;
  let kpiWorkerDatasetRefs = {
    records: null,
    dailyStats: null,
    calculationsKey: '',
    calculationDefaultsKey: '',
  };

  function startPerfSpan(label, meta = {}) {
    if (!perfMonitor || typeof perfMonitor.start !== 'function') {
      return null;
    }
    try {
      return perfMonitor.start(label, {
        page: pageId || undefined,
        ...meta,
      });
    } catch (_error) {
      return null;
    }
  }

  function finishPerfSpan(handle, meta = {}) {
    if (!handle || !perfMonitor || typeof perfMonitor.finish !== 'function') {
      return;
    }
    try {
      perfMonitor.finish(handle, meta);
    } catch (_error) {
      // ignore instrumentation failures
    }
  }

  function toCompactObjectKey(value) {
    if (!value || typeof value !== 'object') {
      return '';
    }
    const keys = Object.keys(value).sort();
    if (!keys.length) {
      return '';
    }
    const pairs = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const raw = value[key];
      let normalized = raw;
      if (raw instanceof Date) {
        normalized = raw.toISOString();
      } else if (typeof raw === 'object' && raw !== null) {
        normalized = '[obj]';
      }
      pairs.push(`${key}:${String(normalized)}`);
    }
    return pairs.join('|');
  }

  function normalizeFetchProfile(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (raw === 'daily-lite' || raw === 'daily-plus-agg' || raw === 'full') {
      return raw;
    }
    return 'full';
  }

  function getCacheArtifactKindFromFetchProfile(fetchProfile) {
    const normalized = normalizeFetchProfile(fetchProfile);
    if (normalized === 'daily-lite') {
      return 'daily-lite';
    }
    if (normalized === 'daily-plus-agg') {
      return 'daily-plus-agg';
    }
    return 'full';
  }

  function getDataCacheKey(url, artifactKind = 'full') {
    if (!url) {
      return '';
    }
    const normalizedArtifactKind = DATA_CACHE_ARTIFACT_KINDS.has(String(artifactKind))
      ? String(artifactKind)
      : 'full';
    return `${DATA_CACHE_PREFIX}${encodeURIComponent(url)}::${normalizedArtifactKind}`;
  }

  function cloneHospitalByDeptStayAgg(agg) {
    if (!agg || typeof agg !== 'object') {
      return null;
    }
    const byYear = agg.byYear && typeof agg.byYear === 'object' ? agg.byYear : null;
    if (!byYear) {
      return { byYear: Object.create(null) };
    }
    const clone = { byYear: Object.create(null) };
    const yearKeys = Object.keys(byYear);
    for (let i = 0; i < yearKeys.length; i += 1) {
      const yearKey = yearKeys[i];
      const yearSource = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
      clone.byYear[yearKey] = Object.create(null);
      const departments = Object.keys(yearSource);
      for (let j = 0; j < departments.length; j += 1) {
        const department = departments[j];
        const srcBucket = yearSource[department] || {};
        clone.byYear[yearKey][department] = {
          count_lt4: Number.isFinite(srcBucket.count_lt4) ? srcBucket.count_lt4 : 0,
          count_4_8: Number.isFinite(srcBucket.count_4_8) ? srcBucket.count_4_8 : 0,
          count_8_16: Number.isFinite(srcBucket.count_8_16) ? srcBucket.count_8_16 : 0,
          count_gt16: Number.isFinite(srcBucket.count_gt16) ? srcBucket.count_gt16 : 0,
          count_unclassified: Number.isFinite(srcBucket.count_unclassified)
            ? srcBucket.count_unclassified
            : 0,
          total: Number.isFinite(srcBucket.total) ? srcBucket.total : 0,
        };
      }
    }
    return clone;
  }

  function mergeHospitalByDeptStayAgg(baseAgg, extraAgg) {
    const target = cloneHospitalByDeptStayAgg(baseAgg) || { byYear: Object.create(null) };
    const source = extraAgg && typeof extraAgg === 'object' ? extraAgg : null;
    const byYear = source?.byYear && typeof source.byYear === 'object' ? source.byYear : null;
    if (!byYear) {
      return target;
    }
    Object.keys(byYear).forEach((yearKey) => {
      if (!target.byYear[yearKey]) {
        target.byYear[yearKey] = Object.create(null);
      }
      const yearSource = byYear[yearKey] && typeof byYear[yearKey] === 'object' ? byYear[yearKey] : {};
      Object.keys(yearSource).forEach((department) => {
        if (!target.byYear[yearKey][department]) {
          target.byYear[yearKey][department] = {
            count_lt4: 0,
            count_4_8: 0,
            count_8_16: 0,
            count_gt16: 0,
            count_unclassified: 0,
            total: 0,
          };
        }
        const srcBucket = yearSource[department] || {};
        const dstBucket = target.byYear[yearKey][department];
        dstBucket.count_lt4 += Number.isFinite(srcBucket.count_lt4) ? srcBucket.count_lt4 : 0;
        dstBucket.count_4_8 += Number.isFinite(srcBucket.count_4_8) ? srcBucket.count_4_8 : 0;
        dstBucket.count_8_16 += Number.isFinite(srcBucket.count_8_16) ? srcBucket.count_8_16 : 0;
        dstBucket.count_gt16 += Number.isFinite(srcBucket.count_gt16) ? srcBucket.count_gt16 : 0;
        dstBucket.count_unclassified += Number.isFinite(srcBucket.count_unclassified)
          ? srcBucket.count_unclassified
          : 0;
        dstBucket.total += Number.isFinite(srcBucket.total) ? srcBucket.total : 0;
      });
    });
    return target;
  }

  function createCacheEntry(entry) {
    const timestamp = typeof entry?.timestamp === 'number' ? entry.timestamp : Date.now();
    const schemaVersion = Number.isInteger(entry?.schemaVersion)
      ? entry.schemaVersion
      : DATA_CACHE_SCHEMA_VERSION;
    return {
      schemaVersion,
      artifactKind: DATA_CACHE_ARTIFACT_KINDS.has(String(entry?.artifactKind))
        ? String(entry.artifactKind)
        : 'full',
      etag: entry?.etag || '',
      lastModified: entry?.lastModified || '',
      signature: entry?.signature || '',
      timestamp,
      records: Array.isArray(entry?.records) ? entry.records : [],
      dailyStats: Array.isArray(entry?.dailyStats) ? entry.dailyStats : [],
      hospitalByDeptStayAgg:
        entry?.hospitalByDeptStayAgg && typeof entry.hospitalByDeptStayAgg === 'object'
          ? entry.hospitalByDeptStayAgg
          : null,
    };
  }

  function normalizeCacheEntry(entry, cacheTier = 'memory') {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const schemaVersion = Number.isInteger(entry?.schemaVersion) ? entry.schemaVersion : 0;
    if (schemaVersion !== DATA_CACHE_SCHEMA_VERSION) {
      return null;
    }
    return {
      schemaVersion,
      artifactKind: DATA_CACHE_ARTIFACT_KINDS.has(String(entry?.artifactKind))
        ? String(entry.artifactKind)
        : 'full',
      cacheTier: String(cacheTier || 'memory'),
      etag: entry?.etag || '',
      lastModified: entry?.lastModified || '',
      signature: entry?.signature || '',
      timestamp: typeof entry?.timestamp === 'number' ? entry.timestamp : Date.now(),
      records: Array.isArray(entry?.records) ? entry.records : [],
      dailyStats: Array.isArray(entry?.dailyStats) ? entry.dailyStats : [],
      hospitalByDeptStayAgg:
        entry?.hospitalByDeptStayAgg && typeof entry.hospitalByDeptStayAgg === 'object'
          ? entry.hospitalByDeptStayAgg
          : null,
    };
  }

  function attachSourceId(records, sourceId) {
    const list = Array.isArray(records) ? records : [];
    const tagged = new Array(list.length);
    for (let index = 0; index < list.length; index += 1) {
      const record = list[index];
      if (!record || typeof record !== 'object') {
        tagged[index] = { sourceId };
        continue;
      }
      if (record.sourceId === sourceId) {
        tagged[index] = record;
        continue;
      }
      tagged[index] = { ...record, sourceId };
    }
    return tagged;
  }

  function mergeDailyStatsSeries(seriesList = []) {
    const mergedByDate = new Map();
    for (let i = 0; i < seriesList.length; i += 1) {
      const list = Array.isArray(seriesList[i]) ? seriesList[i] : [];
      for (let j = 0; j < list.length; j += 1) {
        const row = list[j];
        const date = typeof row?.date === 'string' ? row.date : '';
        if (!date) {
          continue;
        }
        if (!mergedByDate.has(date)) {
          mergedByDate.set(date, {
            date,
            count: 0,
            night: 0,
            ems: 0,
            discharged: 0,
            hospitalized: 0,
            totalTime: 0,
            durations: 0,
            hospitalizedTime: 0,
            hospitalizedDurations: 0,
          });
        }
        const target = mergedByDate.get(date);
        target.count += Number(row?.count || 0);
        target.night += Number(row?.night || 0);
        target.ems += Number(row?.ems || 0);
        target.discharged += Number(row?.discharged || 0);
        target.hospitalized += Number(row?.hospitalized || 0);
        target.totalTime += Number(row?.totalTime || 0);
        target.durations += Number(row?.durations || 0);
        target.hospitalizedTime += Number(row?.hospitalizedTime || 0);
        target.hospitalizedDurations += Number(row?.hospitalizedDurations || 0);
      }
    }
    return Array.from(mergedByDate.values())
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((row) => ({
        ...row,
        avgTime: row.durations > 0 ? row.totalTime / row.durations : 0,
        avgHospitalizedTime:
          row.hospitalizedDurations > 0 ? row.hospitalizedTime / row.hospitalizedDurations : 0,
      }));
  }

  async function readDataCache(url, options = {}) {
    const allowPersistentCache = options?.allowPersistentCache !== false;
    const cachePolicy = String(options?.cachePolicy || 'memory-first');
    const fetchProfile = normalizeFetchProfile(options?.fetchProfile || 'full');
    const artifactKind = getCacheArtifactKindFromFetchProfile(fetchProfile);
    const key = getDataCacheKey(url, artifactKind);
    if (!key) {
      return null;
    }
    const readMemory = () => {
      const handle = startPerfSpan('data-cache-read-memory', {
        page: pageId || undefined,
        profilis: fetchProfile,
        artefaktas: artifactKind,
      });
      try {
        const rawEntry = inMemoryDataCache.has(key) ? inMemoryDataCache.get(key) : null;
        const normalized = rawEntry ? normalizeCacheEntry(rawEntry, 'memory') : null;
        if (!normalized || normalized.artifactKind !== artifactKind) {
          return null;
        }
        return normalized;
      } finally {
        finishPerfSpan(handle, {
          cacheTier: 'memory',
          hit: inMemoryDataCache.has(key),
          artefaktas: artifactKind,
        });
      }
    };
    const readPersistent = async () => {
      if (!allowPersistentCache || typeof persistentDataCache?.get !== 'function') {
        return null;
      }
      const readHandle = startPerfSpan('data-cache-read-persistent', {
        page: pageId || undefined,
        profilis: fetchProfile,
        artefaktas: artifactKind,
      });
      try {
        const rawCached = await persistentDataCache.get(key);
        finishPerfSpan(readHandle, {
          cacheTier: 'persistent',
          hit: Boolean(rawCached),
          artefaktas: artifactKind,
        });
        const materializeHandle = startPerfSpan('data-cache-persistent-materialize', {
          page: pageId || undefined,
          profilis: fetchProfile,
          artefaktas: artifactKind,
        });
        const cached = normalizeCacheEntry(rawCached, 'persistent');
        finishPerfSpan(materializeHandle, {
          cacheTier: 'persistent',
          hit: Boolean(cached && cached.artifactKind === artifactKind),
          artefaktas: artifactKind,
          recordsCount: Array.isArray(cached?.records) ? cached.records.length : 0,
          dailyCount: Array.isArray(cached?.dailyStats) ? cached.dailyStats.length : 0,
        });
        if (cached && cached.artifactKind === artifactKind) {
          inMemoryDataCache.set(key, createCacheEntry(cached));
        } else if (cached && cached.artifactKind !== artifactKind) {
          return null;
        }
        return cached;
      } catch (_error) {
        finishPerfSpan(readHandle, {
          cacheTier: 'persistent',
          hit: false,
          klaida: true,
          artefaktas: artifactKind,
        });
        return null;
      }
    };

    if (cachePolicy === 'network-first') {
      return readMemory();
    }
    if (cachePolicy === 'persistent-first') {
      const persistentEntry = await readPersistent();
      if (persistentEntry) {
        return persistentEntry;
      }
      return readMemory();
    }
    const memoryEntry = readMemory();
    if (memoryEntry) {
      return memoryEntry;
    }
    return readPersistent();
  }

  async function writeDataCache(url, payload, options = {}) {
    const fetchProfile = normalizeFetchProfile(options?.fetchProfile || 'full');
    const artifactKind = getCacheArtifactKindFromFetchProfile(fetchProfile);
    const key = getDataCacheKey(url, artifactKind);
    if (!key) {
      return;
    }

    const allowPersistentCache = options?.allowPersistentCache !== false;
    const entry = createCacheEntry({
      ...payload,
      artifactKind,
      schemaVersion: DATA_CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    });
    inMemoryDataCache.set(key, entry);
    if (!allowPersistentCache || typeof persistentDataCache?.set !== 'function') {
      return;
    }
    const handle = startPerfSpan('data-cache-write-persistent', {
      page: pageId || undefined,
      recordsCount: Array.isArray(entry?.records) ? entry.records.length : 0,
      dailyCount: Array.isArray(entry?.dailyStats) ? entry.dailyStats.length : 0,
      profilis: fetchProfile,
      artefaktas: artifactKind,
    });
    try {
      await persistentDataCache.set(key, entry);
      finishPerfSpan(handle, { cacheTier: 'persistent', ok: true });
    } catch (_error) {
      finishPerfSpan(handle, { cacheTier: 'persistent', ok: false });
      // ignore persistent cache failures
    }
  }

  async function clearDataCache(url, options = {}) {
    const allowPersistentCache = options?.allowPersistentCache !== false;
    const explicitArtifactKind = options?.artifactKind;
    const artifactKinds =
      explicitArtifactKind && DATA_CACHE_ARTIFACT_KINDS.has(String(explicitArtifactKind))
        ? [String(explicitArtifactKind)]
        : Array.from(DATA_CACHE_ARTIFACT_KINDS);
    for (let index = 0; index < artifactKinds.length; index += 1) {
      const key = getDataCacheKey(url, artifactKinds[index]);
      if (!key) {
        continue;
      }
      inMemoryDataCache.delete(key);
      if (!allowPersistentCache || typeof persistentDataCache?.delete !== 'function') {
        continue;
      }
      try {
        await persistentDataCache.delete(key);
      } catch (_error) {
        // ignore persistent cache failures
      }
    }
  }

  function runWorkerJob(message, { onProgress, onPartialResult, signal } = {}) {
    if (typeof Worker !== 'function') {
      return Promise.reject(new Error('Naršyklė nepalaiko Web Worker.'));
    }
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Užklausa nutraukta.', 'AbortError'));
    }
    dataWorkerCounter += 1;
    const jobId = `data-job-${Date.now()}-${dataWorkerCounter}`;
    const worker = new Worker(DATA_WORKER_URL);
    const requestType = String(message?.type || '');
    return new Promise((resolve, reject) => {
      let abortHandler = null;
      const cleanup = () => {
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
        try {
          worker.terminate();
        } catch (error) {
          console.warn('Nepavyko uždaryti duomenų workerio:', error);
        }
      };
      worker.addEventListener('message', (event) => {
        const handlerPerf = startPerfSpan('data-worker-message-handle', {
          page: pageId || undefined,
          tipas: requestType,
        });
        const data = event.data;
        if (!data || data.id !== jobId) {
          finishPerfSpan(handlerPerf, { matched: false });
          return;
        }
        if (data.status === 'progress') {
          if (typeof onProgress === 'function') {
            onProgress(data.payload || {});
          }
          finishPerfSpan(handlerPerf, { status: 'progress', matched: true });
          return;
        }
        if (data.status === 'partial') {
          if (typeof onPartialResult === 'function') {
            onPartialResult({
              phase: data.phase || '',
              payload: data.payload || null,
              meta: data.meta || null,
            });
          }
          finishPerfSpan(handlerPerf, {
            status: 'partial',
            matched: true,
            recordsCount: Number(data?.meta?.recordsCount || 0),
            dailyCount: Number(data?.meta?.dailyStatsCount || 0),
          });
          return;
        }
        cleanup();
        if (data.status === 'error') {
          const error = new Error(data.error?.message || 'Worker klaida.');
          error.name = data.error?.name || error.name;
          if (data.error?.stack) {
            error.stack = data.error.stack;
          }
          finishPerfSpan(handlerPerf, { status: 'error', matched: true });
          reject(error);
          return;
        }
        const materializePerf = startPerfSpan('data-worker-success-materialize', {
          page: pageId || undefined,
          tipas: requestType,
        });
        if (data.payload && typeof data.payload === 'object' && data.meta && typeof data.meta === 'object') {
          try {
            Object.defineProperty(data.payload, '__workerMeta', {
              value: data.meta,
              enumerable: false,
              configurable: true,
            });
          } catch (_error) {
            // ignore if payload is not extensible
          }
        }
        finishPerfSpan(materializePerf, {
          status: 'success',
          matched: true,
          recordsCount: Number(data?.meta?.recordsCount || 0),
          dailyCount: Number(data?.meta?.dailyStatsCount || 0),
          workerComputeMs: Number.isFinite(Number(data?.meta?.computeDurationMs))
            ? Number(data.meta.computeDurationMs)
            : null,
        });
        finishPerfSpan(handlerPerf, {
          status: 'success',
          matched: true,
          recordsCount: Number(data?.meta?.recordsCount || 0),
          dailyCount: Number(data?.meta?.dailyStatsCount || 0),
        });
        resolve(data.payload);
      });
      worker.addEventListener('error', (event) => {
        cleanup();
        reject(event.error || new Error(event.message || 'Worker klaida.'));
      });
      if (signal) {
        abortHandler = () => {
          cleanup();
          reject(new DOMException('Užklausa nutraukta.', 'AbortError'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
      try {
        worker.postMessage({
          id: jobId,
          ...message,
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  function runDataWorker(csvText, options, jobOptions = {}) {
    const message = { type: 'transformCsv', csvText, options };
    if (Number.isInteger(jobOptions.progressStep) && jobOptions.progressStep > 0) {
      message.progressStep = jobOptions.progressStep;
    }
    return runWorkerJob(message, jobOptions);
  }

  function canUseKpiWorkerDatasetHandles(payload) {
    if (context?.enableWorkerDatasetHandles === false) {
      return false;
    }
    const records = payload?.records;
    const dailyStats = payload?.dailyStats;
    return Array.isArray(records) || Array.isArray(dailyStats);
  }

  async function releaseKpiWorkerDatasetHandle(handle) {
    const datasetHandle = String(handle || '');
    if (!datasetHandle) {
      return;
    }
    try {
      await dataWorkerClient.request({ type: 'releaseDataset', datasetHandle });
    } catch (_error) {
      // ignore stale worker/session errors
    }
  }

  async function ensureKpiWorkerDatasetHandle(payload) {
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const dailyStats = Array.isArray(payload?.dailyStats) ? payload.dailyStats : [];
    const calculationsKey = toCompactObjectKey(payload?.calculations || {});
    const calculationDefaultsKey = toCompactObjectKey(payload?.calculationDefaults || {});
    const sameDataset =
      kpiWorkerDatasetHandle &&
      kpiWorkerDatasetRefs.records === records &&
      kpiWorkerDatasetRefs.dailyStats === dailyStats &&
      kpiWorkerDatasetRefs.calculationsKey === calculationsKey &&
      kpiWorkerDatasetRefs.calculationDefaultsKey === calculationDefaultsKey;
    if (sameDataset) {
      return kpiWorkerDatasetHandle;
    }

    const previousHandle = kpiWorkerDatasetHandle;
    const storeResult = await dataWorkerClient.request({
      type: 'storeDataset',
      datasetType: 'kpi-primary',
      records,
      dailyStats,
      calculations: payload?.calculations || {},
      calculationDefaults: payload?.calculationDefaults || {},
    });
    const nextHandle = String(storeResult?.datasetHandle || '');
    if (!nextHandle) {
      throw new Error('Worker negrąžino KPI dataset handle.');
    }
    kpiWorkerDatasetHandle = nextHandle;
    kpiWorkerDatasetRefs = {
      records,
      dailyStats,
      calculationsKey,
      calculationDefaultsKey,
    };
    if (previousHandle && previousHandle !== nextHandle) {
      void releaseKpiWorkerDatasetHandle(previousHandle);
    }
    return nextHandle;
  }

  async function runKpiWorkerJob(payload) {
    const fallbackToLegacy = async () => runWorkerJob({ type: 'applyKpiFilters', ...(payload || {}) });
    if (!canUseKpiWorkerDatasetHandles(payload)) {
      return fallbackToLegacy();
    }
    try {
      const datasetHandle = await ensureKpiWorkerDatasetHandle(payload || {});
      return await dataWorkerClient.request({
        type: 'applyKpiFiltersByHandle',
        datasetHandle,
        filters: payload?.filters || {},
        defaultFilters: payload?.defaultFilters || {},
        windowDays: payload?.windowDays,
        calculations: payload?.calculations || {},
        calculationDefaults: payload?.calculationDefaults || {},
        resultMode: payload?.resultMode || 'full',
      });
    } catch (error) {
      dataWorkerClient.reset(error);
      if (kpiWorkerDatasetHandle) {
        kpiWorkerDatasetHandle = null;
      }
      kpiWorkerDatasetRefs = {
        records: null,
        dailyStats: null,
        calculationsKey: '',
        calculationDefaultsKey: '',
      };
      return fallbackToLegacy();
    }
  }

  async function runKpiWorkerDetailJob(payload) {
    const requestType = String(payload?.type || '');
    if (!requestType) {
      throw new Error('Nenurodytas KPI worker detalios užklausos tipas.');
    }
    if (
      requestType !== 'getKpiDateKeysByHandle' &&
      requestType !== 'getKpiRecordsForDateByHandle' &&
      requestType !== 'computeKpiLastShiftHourlyByHandle'
    ) {
      throw new Error(`Nepalaikomas KPI worker detalios užklausos tipas: ${requestType}`);
    }
    if (!canUseKpiWorkerDatasetHandles(payload)) {
      throw new Error('KPI worker detalios užklausos reikalauja bent dailyStats arba records.');
    }
    try {
      const datasetHandle = await ensureKpiWorkerDatasetHandle(payload || {});
      const requestPayload = { ...(payload || {}) };
      delete requestPayload.type;
      delete requestPayload.records;
      delete requestPayload.dailyStats;
      delete requestPayload.datasetHandle;
      return await dataWorkerClient.request({
        ...requestPayload,
        type: requestType,
        datasetHandle,
        filters: payload?.filters || {},
        defaultFilters: payload?.defaultFilters || {},
        calculations: payload?.calculations || {},
        calculationDefaults: payload?.calculationDefaults || {},
      });
    } catch (error) {
      dataWorkerClient.reset(error);
      if (kpiWorkerDatasetHandle) {
        kpiWorkerDatasetHandle = null;
      }
      kpiWorkerDatasetRefs = {
        records: null,
        dailyStats: null,
        calculationsKey: '',
        calculationDefaultsKey: '',
      };
      throw error;
    }
  }

  function runSummariesWorkerJob(payload, jobOptions = {}) {
    return runWorkerJob({ type: 'computeSummariesReports', ...(payload || {}) }, jobOptions);
  }

  async function loadCsvSource(
    config,
    workerOptions,
    {
      required = false,
      sourceId = 'primary',
      label = '',
      cachePolicy = 'memory-first',
      allowPersistentCache = true,
      fetchProfile = 'full',
    } = {}
  ) {
    const normalizedFetchProfile = normalizeFetchProfile(fetchProfile);
    const trimmedUrl = (config?.url ?? '').trim();
    const missingMessage = config?.missingMessage || 'Nenurodytas duomenų URL.';
    const result = {
      records: [],
      dailyStats: [],
      meta: {
        sourceId,
        url: trimmedUrl,
        label: label || sourceId,
        cacheTier: 'network',
        schemaVersion: DATA_CACHE_SCHEMA_VERSION,
        fetchProfile: normalizedFetchProfile,
      },
      hospitalByDeptStayAgg: null,
      usingFallback: false,
      lastErrorMessage: '',
      error: null,
    };
    const onChunk = typeof config?.onChunk === 'function' ? config.onChunk : null;
    const onWorkerProgress = typeof config?.onWorkerProgress === 'function' ? config.onWorkerProgress : null;
    const signal = config?.signal || null;
    const onPartialResult = typeof config?.onPartialResult === 'function' ? config.onPartialResult : null;
    const workerProgressStep = onWorkerProgress
      ? Number.isInteger(config?.workerProgressStep) && config.workerProgressStep > 0
        ? config.workerProgressStep
        : 400
      : null;

    const assignDataset = (dataset, metaOverrides = {}) => {
      result.records = dataset.records;
      result.dailyStats = dataset.dailyStats;
      result.hospitalByDeptStayAgg =
        dataset?.hospitalByDeptStayAgg && typeof dataset.hospitalByDeptStayAgg === 'object'
          ? dataset.hospitalByDeptStayAgg
          : null;
      result.meta = { ...result.meta, ...metaOverrides };
    };

    if (!trimmedUrl) {
      result.lastErrorMessage = missingMessage;
      result.error = missingMessage;
      if (required) {
        const error = new Error(missingMessage);
        error.diagnostic = { type: 'config', sourceId, reason: 'missing-url' };
        throw error;
      }
      return result;
    }

    const cacheEntry = await readDataCache(trimmedUrl, {
      cachePolicy,
      allowPersistentCache,
      fetchProfile: normalizedFetchProfile,
    });

    try {
      let download = await downloadCsv(trimmedUrl, { cacheInfo: cacheEntry, onChunk, signal });
      if (download.status === 304) {
        if (cacheEntry?.records && cacheEntry?.dailyStats) {
          assignDataset(
            {
              records: cacheEntry.records,
              dailyStats: cacheEntry.dailyStats,
              hospitalByDeptStayAgg: cacheEntry.hospitalByDeptStayAgg,
            },
            {
              etag: cacheEntry.etag,
              lastModified: cacheEntry.lastModified,
              signature: cacheEntry.signature,
              cacheStatus: download.cacheStatus,
              fromCache: true,
              cacheTier: cacheEntry.cacheTier || 'memory',
              schemaVersion: cacheEntry.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
              recordsCount: Array.isArray(cacheEntry.records) ? cacheEntry.records.length : 0,
              dailyStatsCount: Array.isArray(cacheEntry.dailyStats) ? cacheEntry.dailyStats.length : 0,
              artifactKind:
                cacheEntry.artifactKind || getCacheArtifactKindFromFetchProfile(normalizedFetchProfile),
            }
          );
          return result;
        }
        await clearDataCache(trimmedUrl, { allowPersistentCache });
        download = await downloadCsv(trimmedUrl, { onChunk, signal });
      }

      const dataset = await runDataWorker(download.text, workerOptions, {
        onProgress: onWorkerProgress,
        onPartialResult:
          typeof onPartialResult === 'function'
            ? (partial) => {
                onPartialResult({
                  sourceId,
                  label: label || sourceId,
                  phase: partial?.phase || '',
                  payload: partial?.payload || null,
                });
              }
            : null,
        progressStep: workerProgressStep,
        signal,
      });
      assignDataset(
        {
          records: Array.isArray(dataset?.records) ? dataset.records : [],
          dailyStats: Array.isArray(dataset?.dailyStats) ? dataset.dailyStats : [],
          hospitalByDeptStayAgg: dataset?.hospitalByDeptStayAgg || null,
        },
        {
          etag: download.etag,
          lastModified: download.lastModified,
          signature: download.signature,
          cacheStatus: download.cacheStatus,
          fromCache: false,
          cacheTier: 'network',
          schemaVersion: DATA_CACHE_SCHEMA_VERSION,
          recordsCount: Array.isArray(dataset?.records) ? dataset.records.length : 0,
          dailyStatsCount: Array.isArray(dataset?.dailyStats) ? dataset.dailyStats.length : 0,
          workerMeta: dataset?.__workerMeta || null,
        }
      );
      const cacheArtifactKind = getCacheArtifactKindFromFetchProfile(normalizedFetchProfile);
      const cachePayload =
        cacheArtifactKind === 'daily-lite'
          ? {
              etag: download.etag,
              lastModified: download.lastModified,
              signature: download.signature,
              records: [],
              dailyStats: result.dailyStats,
              hospitalByDeptStayAgg: null,
            }
          : cacheArtifactKind === 'daily-plus-agg'
            ? {
                etag: download.etag,
                lastModified: download.lastModified,
                signature: download.signature,
                records: [],
                dailyStats: result.dailyStats,
                hospitalByDeptStayAgg: result.hospitalByDeptStayAgg,
              }
            : {
                etag: download.etag,
                lastModified: download.lastModified,
                signature: download.signature,
                records: result.records,
                dailyStats: result.dailyStats,
                hospitalByDeptStayAgg: result.hospitalByDeptStayAgg,
              };
      await writeDataCache(trimmedUrl, cachePayload, {
        allowPersistentCache,
        fetchProfile: normalizedFetchProfile,
      });
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      const errorInfo = describeError(error, { code: 'DATA_FETCH' });
      console.error(errorInfo.log, error);
      result.lastErrorMessage = errorInfo.userMessage;
      result.error = errorInfo.userMessage;
      if (cacheEntry?.records && cacheEntry?.dailyStats) {
        console.warn(`Naudojami talpyklos duomenys dėl klaidos (${sourceId}).`);
        assignDataset(
          {
            records: cacheEntry.records,
            dailyStats: cacheEntry.dailyStats,
            hospitalByDeptStayAgg: cacheEntry.hospitalByDeptStayAgg,
          },
          {
            etag: cacheEntry.etag,
            lastModified: cacheEntry.lastModified,
            signature: cacheEntry.signature,
            fromCache: true,
            fallbackReason: errorInfo.userMessage,
            cacheTier: cacheEntry.cacheTier || 'memory',
            schemaVersion: cacheEntry.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
            recordsCount: Array.isArray(cacheEntry.records) ? cacheEntry.records.length : 0,
            dailyStatsCount: Array.isArray(cacheEntry.dailyStats) ? cacheEntry.dailyStats.length : 0,
            artifactKind:
              cacheEntry.artifactKind || getCacheArtifactKindFromFetchProfile(normalizedFetchProfile),
          }
        );
        return result;
      }
      if (required) {
        throw error;
      }
      return result;
    }
  }

  async function fetchData(options = {}) {
    const requestedFetchProfile = normalizeFetchProfile(options?.fetchProfile || 'full');
    const shouldDeferFullRecords = options?.deferFullRecords === true && requestedFetchProfile !== 'full';
    if (shouldDeferFullRecords) {
      const baseOptions = { ...options, fetchProfile: requestedFetchProfile, deferFullRecords: false };
      const liteResult = await fetchData(baseOptions);
      deferredHydrationCounter += 1;
      const hydrationToken = `deferred-full-records-${Date.now()}-${deferredHydrationCounter}`;
      const nextMeta = {
        ...(liteResult?.meta || {}),
        fetchProfile: requestedFetchProfile,
        recordsState: 'deferred',
      };
      return {
        ...(liteResult || {}),
        meta: nextMeta,
        deferredHydration: {
          token: hydrationToken,
          kind: 'full-records',
          fetchProfile: 'full',
          hydrate: async (overrideOptions = {}) =>
            fetchData({
              ...options,
              ...overrideOptions,
              fetchProfile: 'full',
              deferFullRecords: false,
            }),
        },
      };
    }

    const includeYearlyStats = options?.includeYearlyStats !== false;
    const allowPersistentCache = options?.allowPersistentCache !== false;
    const cachePolicy = String(options?.cachePolicy || 'memory-first');
    const fetchProfile = requestedFetchProfile;
    const fetchArtifactKind = getCacheArtifactKindFromFetchProfile(fetchProfile);
    const needsFullRecords = fetchProfile === 'full';
    const skipHistorical = options?.skipHistorical === true;
    const csvSettings = settings?.csv || DEFAULT_SETTINGS.csv;
    const signal = options?.signal || null;
    const mainConfig = {
      url: settings?.dataSource?.url || DEFAULT_SETTINGS.dataSource.url,
      missingMessage: 'Nenurodytas pagrindinis duomenų URL.',
      onChunk: typeof options?.onPrimaryChunk === 'function' ? options.onPrimaryChunk : null,
      onWorkerProgress: typeof options?.onWorkerProgress === 'function' ? options.onWorkerProgress : null,
      onPartialResult: typeof options?.onPrimaryPartial === 'function' ? options.onPrimaryPartial : null,
      signal,
    };
    const workerOptions = {
      csvSettings,
      trueValues: (csvSettings?.trueValues ?? '').trim() || DEFAULT_SETTINGS.csv.trueValues,
      hospitalizedValues:
        (csvSettings?.hospitalizedValues ?? '').trim() || DEFAULT_SETTINGS.csv.hospitalizedValues,
      nightKeywords: (csvSettings?.nightKeywords ?? '').trim() || DEFAULT_SETTINGS.csv.nightKeywords,
      dayKeywords: (csvSettings?.dayKeywords ?? '').trim() || DEFAULT_SETTINGS.csv.dayKeywords,
      calculations: settings?.calculations || DEFAULT_SETTINGS.calculations,
    };
    const historicalConfig = settings?.dataSource?.historical || DEFAULT_SETTINGS.dataSource.historical;
    const historicalEnabled = !skipHistorical && Boolean(historicalConfig?.enabled);
    const historicalLabel = historicalConfig?.label || 'Istorinis CSV';
    let historicalMeta = null;
    const normalizedHistoricalConfig =
      historicalEnabled && historicalConfig?.url
        ? {
            url: historicalConfig.url,
            missingMessage: 'Nenurodytas papildomo istorinio šaltinio URL.',
            onChunk: typeof options?.onHistoricalChunk === 'function' ? options.onHistoricalChunk : null,
            onWorkerProgress:
              typeof options?.onWorkerProgress === 'function' ? options.onWorkerProgress : null,
            onPartialResult:
              typeof options?.onHistoricalPartial === 'function' ? options.onHistoricalPartial : null,
            signal,
          }
        : null;
    const historicalShouldAttempt =
      Boolean(normalizedHistoricalConfig) && (normalizedHistoricalConfig.url ?? '').trim().length > 0;

    const primaryPromise = loadCsvSource(mainConfig, workerOptions, {
      required: true,
      sourceId: 'primary',
      label: 'Pagrindinis CSV',
      cachePolicy,
      allowPersistentCache,
      fetchProfile,
    });
    const historicalPromise =
      historicalEnabled && historicalShouldAttempt
        ? loadCsvSource(normalizedHistoricalConfig, workerOptions, {
            required: false,
            sourceId: 'historical',
            label: historicalLabel,
            cachePolicy,
            allowPersistentCache,
            fetchProfile,
          })
        : Promise.resolve(null);

    const [primaryResult, historicalResult] = await Promise.all([primaryPromise, historicalPromise]);

    const baseRecordsRaw = Array.isArray(primaryResult.records) ? primaryResult.records : [];
    const baseRecords = needsFullRecords ? attachSourceId(baseRecordsRaw, 'primary') : [];
    const baseDaily = Array.isArray(primaryResult.dailyStats) ? primaryResult.dailyStats : [];
    let combinedHospitalByDeptStayAgg =
      needsFullRecords || fetchProfile === 'daily-plus-agg'
        ? mergeHospitalByDeptStayAgg(primaryResult.hospitalByDeptStayAgg, null)
        : null;
    let combinedRecords = needsFullRecords ? baseRecords.slice() : [];
    const usingFallback = false;
    const warnings = [];
    const primaryUrl = (settings?.dataSource?.url ?? '').trim();
    const sources = [
      {
        id: 'primary',
        label: 'Pagrindinis CSV',
        url: primaryResult.meta?.url || primaryUrl,
        fromCache: Boolean(primaryResult.meta?.fromCache),
        cacheTier: primaryResult.meta?.cacheTier || 'network',
        schemaVersion: primaryResult.meta?.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
        fromFallback: Boolean(primaryResult.meta?.fromFallback),
        usingFallback: false,
        lastErrorMessage: primaryResult.lastErrorMessage || '',
        error: primaryResult.error || '',
        recordsCount: Number(primaryResult.meta?.recordsCount || baseRecords.length || 0),
        dailyStatsCount: Number(primaryResult.meta?.dailyStatsCount || baseDaily.length || 0),
        workerComputeMs: Number.isFinite(Number(primaryResult.meta?.workerMeta?.computeDurationMs))
          ? Number(primaryResult.meta.workerMeta.computeDurationMs)
          : null,
        used: needsFullRecords ? baseRecords.length > 0 : baseDaily.length > 0,
        enabled: true,
      },
    ];

    if (primaryResult.error && primaryResult.meta?.fromCache) {
      warnings.push(`Pagrindinis CSV: ${primaryResult.error}`);
    }

    if (historicalEnabled) {
      if (historicalShouldAttempt && historicalResult) {
        historicalMeta = historicalResult.meta || null;
        const historicalRecordsRaw = Array.isArray(historicalResult.records) ? historicalResult.records : [];
        const historicalRecords = needsFullRecords ? attachSourceId(historicalRecordsRaw, 'historical') : [];
        if (needsFullRecords && historicalRecords.length) {
          if (combinedRecords.length === 0) {
            combinedRecords = historicalRecords.slice();
          } else {
            const merged = new Array(combinedRecords.length + historicalRecords.length);
            for (let index = 0; index < combinedRecords.length; index += 1) {
              merged[index] = combinedRecords[index];
            }
            for (let index = 0; index < historicalRecords.length; index += 1) {
              merged[combinedRecords.length + index] = historicalRecords[index];
            }
            combinedRecords = merged;
          }
        }
        if (needsFullRecords || fetchProfile === 'daily-plus-agg') {
          combinedHospitalByDeptStayAgg = mergeHospitalByDeptStayAgg(
            combinedHospitalByDeptStayAgg,
            historicalResult.hospitalByDeptStayAgg
          );
        }
        if (historicalResult.error) {
          warnings.push(`${historicalLabel}: ${historicalResult.error}`);
        }
        sources.push({
          id: 'historical',
          label: historicalLabel,
          url: historicalResult.meta?.url || (historicalConfig.url ?? ''),
          fromCache: Boolean(historicalResult.meta?.fromCache),
          cacheTier: historicalResult.meta?.cacheTier || 'network',
          schemaVersion: historicalResult.meta?.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
          fromFallback: Boolean(historicalResult.meta?.fromFallback),
          usingFallback: false,
          lastErrorMessage: historicalResult.lastErrorMessage || '',
          error: historicalResult.error || '',
          recordsCount: Number(historicalResult.meta?.recordsCount || historicalRecords.length || 0),
          dailyStatsCount: Number(
            historicalResult.meta?.dailyStatsCount || historicalResult.dailyStats?.length || 0
          ),
          workerComputeMs: Number.isFinite(Number(historicalResult.meta?.workerMeta?.computeDurationMs))
            ? Number(historicalResult.meta.workerMeta.computeDurationMs)
            : null,
          used: needsFullRecords
            ? historicalRecords.length > 0
            : Array.isArray(historicalResult.dailyStats) && historicalResult.dailyStats.length > 0,
          enabled: true,
        });
      } else {
        sources.push({
          id: 'historical',
          label: historicalLabel,
          url: historicalConfig.url || '',
          fromCache: false,
          cacheTier: 'network',
          schemaVersion: DATA_CACHE_SCHEMA_VERSION,
          fromFallback: false,
          usingFallback: false,
          lastErrorMessage: '',
          error: '',
          used: false,
          enabled: true,
        });
        warnings.push(`${historicalLabel}: Nenurodytas papildomo istorinio šaltinio URL.`);
      }
    } else {
      sources.push({
        id: 'historical',
        label: historicalLabel,
        url: historicalConfig.url || '',
        fromCache: false,
        cacheTier: 'network',
        schemaVersion: DATA_CACHE_SCHEMA_VERSION,
        fromFallback: false,
        usingFallback: false,
        lastErrorMessage: '',
        error: '',
        used: false,
        enabled: false,
      });
    }

    dashboardState.usingFallback = usingFallback;
    dashboardState.lastErrorMessage = '';

    const meta = {
      primary: {
        ...(primaryResult.meta || {}),
        sourceId: 'primary',
        cacheTier: primaryResult.meta?.cacheTier || 'network',
        schemaVersion: primaryResult.meta?.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
        artifactKind:
          primaryResult.meta?.artifactKind ||
          getCacheArtifactKindFromFetchProfile(primaryResult.meta?.fetchProfile),
      },
      historical: historicalMeta
        ? {
            ...historicalMeta,
            sourceId: 'historical',
            cacheTier: historicalMeta?.cacheTier || 'network',
            schemaVersion: historicalMeta?.schemaVersion || DATA_CACHE_SCHEMA_VERSION,
            artifactKind:
              historicalMeta?.artifactKind ||
              getCacheArtifactKindFromFetchProfile(historicalMeta?.fetchProfile),
          }
        : null,
      schemaVersion: DATA_CACHE_SCHEMA_VERSION,
      fetchProfile,
      recordsState: needsFullRecords ? 'full' : 'none',
      artifactKind: fetchArtifactKind,
      sources,
      warnings,
    };

    const hasBaseDaily = Array.isArray(baseDaily) && baseDaily.length > 0;
    const combinedDaily =
      hasBaseDaily && (!needsFullRecords || combinedRecords.length === baseRecords.length)
        ? baseDaily.slice()
        : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS);
    const combinedYearlyStats = includeYearlyStats
      ? computeYearlyStats(computeMonthlyStats(combinedDaily.slice()))
      : [];

    return {
      records: needsFullRecords ? combinedRecords : [],
      primaryRecords: needsFullRecords ? baseRecords : [],
      dailyStats: combinedDaily,
      primaryDaily: baseDaily.slice(),
      hospitalByDeptStayAgg:
        needsFullRecords || fetchProfile === 'daily-plus-agg' ? combinedHospitalByDeptStayAgg : null,
      yearlyStats: combinedYearlyStats,
      meta,
    };
  }

  return {
    fetchData,
    runDataWorker,
    runKpiWorkerJob,
    runKpiWorkerDetailJob,
    runSummariesWorkerJob,
    mergeDailyStatsSeries,
  };
}
