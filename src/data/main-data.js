import { computeDailyStats, computeMonthlyStats, computeYearlyStats } from './stats.js';

export function createMainDataHandlers(context) {
  const { settings, DEFAULT_SETTINGS, dashboardState, downloadCsv, describeError } = context;

  const DATA_WORKER_URL = new URL('data-worker.js?v=2026-02-07-3', window.location.href).toString();
  const DATA_CACHE_PREFIX = 'edDashboard:dataCache:';
  const inMemoryDataCache = new Map();
  let dataWorkerCounter = 0;

  function getDataCacheKey(url) {
    if (!url) {
      return '';
    }
    return `${DATA_CACHE_PREFIX}${encodeURIComponent(url)}`;
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
    return {
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

  function readDataCache(url) {
    const key = getDataCacheKey(url);
    if (!key) {
      return null;
    }

    if (inMemoryDataCache.has(key)) {
      const cached = inMemoryDataCache.get(key);
      return {
        etag: cached?.etag || '',
        lastModified: cached?.lastModified || '',
        signature: cached?.signature || '',
        timestamp: typeof cached?.timestamp === 'number' ? cached.timestamp : Date.now(),
        records: Array.isArray(cached?.records) ? cached.records : [],
        dailyStats: Array.isArray(cached?.dailyStats) ? cached.dailyStats : [],
        hospitalByDeptStayAgg:
          cached?.hospitalByDeptStayAgg && typeof cached.hospitalByDeptStayAgg === 'object'
            ? cached.hospitalByDeptStayAgg
            : null,
      };
    }
    return null;
  }

  function writeDataCache(url, payload) {
    const key = getDataCacheKey(url);
    if (!key) {
      return;
    }

    const entry = createCacheEntry({ ...payload, timestamp: Date.now() });
    inMemoryDataCache.set(key, entry);
  }

  function clearDataCache(url) {
    const key = getDataCacheKey(url);
    if (!key) {
      return;
    }

    inMemoryDataCache.delete(key);
  }

  function runWorkerJob(message, { onProgress, signal } = {}) {
    if (typeof Worker !== 'function') {
      return Promise.reject(new Error('Naršyklė nepalaiko Web Worker.'));
    }
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Užklausa nutraukta.', 'AbortError'));
    }
    dataWorkerCounter += 1;
    const jobId = `data-job-${Date.now()}-${dataWorkerCounter}`;
    const worker = new Worker(DATA_WORKER_URL);
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
        const data = event.data;
        if (!data || data.id !== jobId) {
          return;
        }
        if (data.status === 'progress') {
          if (typeof onProgress === 'function') {
            onProgress(data.payload || {});
          }
          return;
        }
        cleanup();
        if (data.status === 'error') {
          const error = new Error(data.error?.message || 'Worker klaida.');
          error.name = data.error?.name || error.name;
          if (data.error?.stack) {
            error.stack = data.error.stack;
          }
          reject(error);
          return;
        }
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

  function runKpiWorkerJob(payload) {
    return runWorkerJob({ type: 'applyKpiFilters', ...payload });
  }

  async function loadCsvSource(
    config,
    workerOptions,
    { required = false, sourceId = 'primary', label = '' } = {}
  ) {
    const trimmedUrl = (config?.url ?? '').trim();
    const missingMessage = config?.missingMessage || 'Nenurodytas duomenų URL.';
    const result = {
      records: [],
      dailyStats: [],
      meta: {
        sourceId,
        url: trimmedUrl,
        label: label || sourceId,
      },
      hospitalByDeptStayAgg: null,
      usingFallback: false,
      lastErrorMessage: '',
      error: null,
    };
    const onChunk = typeof config?.onChunk === 'function' ? config.onChunk : null;
    const onWorkerProgress = typeof config?.onWorkerProgress === 'function' ? config.onWorkerProgress : null;
    const signal = config?.signal || null;
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

    const cacheEntry = readDataCache(trimmedUrl);

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
            }
          );
          return result;
        }
        clearDataCache(trimmedUrl);
        download = await downloadCsv(trimmedUrl, { onChunk, signal });
      }

      const dataset = await runDataWorker(download.text, workerOptions, {
        onProgress: onWorkerProgress,
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
        }
      );
      writeDataCache(trimmedUrl, {
        etag: download.etag,
        lastModified: download.lastModified,
        signature: download.signature,
        records: result.records,
        dailyStats: result.dailyStats,
        hospitalByDeptStayAgg: result.hospitalByDeptStayAgg,
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
    const skipHistorical = options?.skipHistorical === true;
    const csvSettings = settings?.csv || DEFAULT_SETTINGS.csv;
    const signal = options?.signal || null;
    const mainConfig = {
      url: settings?.dataSource?.url || DEFAULT_SETTINGS.dataSource.url,
      missingMessage: 'Nenurodytas pagrindinis duomenų URL.',
      onChunk: typeof options?.onPrimaryChunk === 'function' ? options.onPrimaryChunk : null,
      onWorkerProgress: typeof options?.onWorkerProgress === 'function' ? options.onWorkerProgress : null,
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
            signal,
          }
        : null;
    const historicalShouldAttempt =
      Boolean(normalizedHistoricalConfig) && (normalizedHistoricalConfig.url ?? '').trim().length > 0;

    const primaryPromise = loadCsvSource(mainConfig, workerOptions, {
      required: true,
      sourceId: 'primary',
      label: 'Pagrindinis CSV',
    });
    const historicalPromise =
      historicalEnabled && historicalShouldAttempt
        ? loadCsvSource(normalizedHistoricalConfig, workerOptions, {
            required: false,
            sourceId: 'historical',
            label: historicalLabel,
          })
        : Promise.resolve(null);

    const [primaryResult, historicalResult] = await Promise.all([primaryPromise, historicalPromise]);

    const baseRecordsRaw = Array.isArray(primaryResult.records) ? primaryResult.records : [];
    const baseRecords = attachSourceId(baseRecordsRaw, 'primary');
    const baseDaily = Array.isArray(primaryResult.dailyStats) ? primaryResult.dailyStats : [];
    let combinedHospitalByDeptStayAgg = mergeHospitalByDeptStayAgg(primaryResult.hospitalByDeptStayAgg, null);
    let combinedRecords = baseRecords.slice();
    const usingFallback = false;
    const warnings = [];
    const primaryUrl = (settings?.dataSource?.url ?? '').trim();
    const sources = [
      {
        id: 'primary',
        label: 'Pagrindinis CSV',
        url: primaryResult.meta?.url || primaryUrl,
        fromCache: Boolean(primaryResult.meta?.fromCache),
        fromFallback: Boolean(primaryResult.meta?.fromFallback),
        usingFallback: false,
        lastErrorMessage: primaryResult.lastErrorMessage || '',
        error: primaryResult.error || '',
        used: baseRecords.length > 0,
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
        const historicalRecords = attachSourceId(historicalRecordsRaw, 'historical');
        if (historicalRecords.length) {
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
        combinedHospitalByDeptStayAgg = mergeHospitalByDeptStayAgg(
          combinedHospitalByDeptStayAgg,
          historicalResult.hospitalByDeptStayAgg
        );
        if (historicalResult.error) {
          warnings.push(`${historicalLabel}: ${historicalResult.error}`);
        }
        sources.push({
          id: 'historical',
          label: historicalLabel,
          url: historicalResult.meta?.url || (historicalConfig.url ?? ''),
          fromCache: Boolean(historicalResult.meta?.fromCache),
          fromFallback: Boolean(historicalResult.meta?.fromFallback),
          usingFallback: false,
          lastErrorMessage: historicalResult.lastErrorMessage || '',
          error: historicalResult.error || '',
          used: historicalRecords.length > 0,
          enabled: true,
        });
      } else {
        sources.push({
          id: 'historical',
          label: historicalLabel,
          url: historicalConfig.url || '',
          fromCache: false,
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
      primary: { ...(primaryResult.meta || {}), sourceId: 'primary' },
      historical: historicalMeta ? { ...historicalMeta, sourceId: 'historical' } : null,
      sources,
      warnings,
    };

    const hasBaseDaily = Array.isArray(baseDaily) && baseDaily.length > 0;
    const combinedDaily =
      combinedRecords.length === baseRecords.length && hasBaseDaily
        ? baseDaily.slice()
        : computeDailyStats(combinedRecords, settings?.calculations, DEFAULT_SETTINGS);
    const combinedYearlyStats = computeYearlyStats(computeMonthlyStats(combinedDaily.slice()));

    return {
      records: combinedRecords,
      primaryRecords: baseRecords,
      dailyStats: combinedDaily,
      primaryDaily: baseDaily.slice(),
      hospitalByDeptStayAgg: combinedHospitalByDeptStayAgg,
      yearlyStats: combinedYearlyStats,
      meta,
    };
  }

  return {
    fetchData,
    runDataWorker,
    runKpiWorkerJob,
  };
}
