/*
 * Worker protocol layer for data-worker.js.
 * Keeps message contracts stable while delegating heavy transforms to data-worker-transforms.js.
 */

/**
 * @typedef {'transformCsv' | 'transformEdCsv' | 'applyKpiFilters' | 'storeDataset' | 'releaseDataset' | 'applyKpiFiltersByHandle' | 'getKpiDateKeysByHandle' | 'getKpiRecordsForDateByHandle' | 'computeKpiLastShiftHourlyByHandle' | 'computeSummariesReports'} WorkerRequestType
 */

/**
 * @typedef {{
 *   id: string;
 *   type: WorkerRequestType;
 *   csvText?: string;
 *   options?: object;
 *   progressStep?: number;
 *   filters?: object;
 *   defaultFilters?: object;
 *   windowDays?: number;
 *   records?: object[];
 *   dailyStats?: object[];
 *   calculations?: object;
 *   calculationDefaults?: object;
 *   datasetHandle?: string;
 *   datasetType?: string;
 *   resultMode?: string;
 *   selectedDate?: string | null;
 *   lastShiftHourlyMetric?: string;
 * }} WorkerRequest
 */

/**
 * @typedef {{
 *   id: string;
 *   status: 'success' | 'error' | 'progress' | 'partial';
 *   phase?: string;
 *   payload?: unknown;
 *   meta?: object;
 *   error?: { message: string; name?: string; stack?: string };
 * }} WorkerResponse
 */

function serializeError(error) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'Unknown error') };
  }
  return {
    message: error.message || 'Unknown error',
    name: error.name || 'Error',
    stack: error.stack || '',
  };
}

function createProgressReporter(id, step = 500) {
  const normalizedStep = Number.isInteger(step) && step > 0 ? step : 500;
  let lastSent = 0;
  return (current = 0, total = 0) => {
    if (!id) {
      return;
    }
    const now = Date.now();
    if (current < total && now - lastSent < 100 && current % normalizedStep !== 0) {
      return;
    }
    lastSent = now;
    /** @type {WorkerResponse} */
    const progressMessage = { id, status: 'progress', payload: { current, total } };
    self.postMessage(progressMessage);
  };
}

function createPartialReporter(id) {
  return (phase = '', payload = null) => {
    if (!id || !phase) {
      return;
    }
    /** @type {WorkerResponse} */
    const partialMessage = {
      id,
      status: 'partial',
      phase: String(phase),
      payload,
      meta: buildPayloadMeta(payload),
    };
    self.postMessage(partialMessage);
  };
}

function buildPayloadMeta(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const meta = {};
  if (Array.isArray(payload.records)) {
    meta.recordsCount = payload.records.length;
  }
  if (Array.isArray(payload.dailyStats)) {
    meta.dailyStatsCount = payload.dailyStats.length;
  }
  if (typeof payload.datasetHandle === 'string') {
    meta.datasetHandle = payload.datasetHandle;
  }
  return Object.keys(meta).length ? meta : null;
}

/**
 * @param {MessageEvent<WorkerRequest>} event
 */
function handleWorkerMessage(event) {
  const { id, type } = event.data || {};
  if (!id || !type) {
    return;
  }
  try {
    let payload;
    const computeStart = typeof performance?.now === 'function' ? performance.now() : Number(Date.now());
    if (type === 'transformCsv') {
      const { csvText, options, progressStep } = event.data;
      const reportProgress =
        Number.isInteger(progressStep) && progressStep > 0 ? createProgressReporter(id, progressStep) : null;
      const reportPartial = createPartialReporter(id);
      payload = transformCsvWithStats(csvText, options, {
        reportProgress,
        reportPartial,
        progressStep,
      });
    } else if (type === 'transformEdCsv') {
      const { csvText, options } = event.data;
      payload = transformEdCsvWithSummary(csvText, options || {});
    } else if (type === 'applyKpiFilters') {
      payload = applyKpiFiltersInWorker(event.data);
    } else if (type === 'storeDataset') {
      if (typeof storeKpiDatasetInWorker !== 'function') {
        throw new Error('storeDataset job nepalaikomas šiame worker yje.');
      }
      payload = storeKpiDatasetInWorker(event.data);
    } else if (type === 'releaseDataset') {
      if (typeof releaseKpiDatasetInWorker !== 'function') {
        throw new Error('releaseDataset job nepalaikomas šiame worker yje.');
      }
      payload = releaseKpiDatasetInWorker(event.data);
    } else if (type === 'applyKpiFiltersByHandle') {
      if (typeof applyKpiFiltersByHandleInWorker !== 'function') {
        throw new Error('applyKpiFiltersByHandle job nepalaikomas šiame worker yje.');
      }
      payload = applyKpiFiltersByHandleInWorker(event.data);
    } else if (type === 'getKpiDateKeysByHandle') {
      if (typeof getKpiDateKeysByHandleInWorker !== 'function') {
        throw new Error('getKpiDateKeysByHandle job nepalaikomas šiame worker yje.');
      }
      payload = getKpiDateKeysByHandleInWorker(event.data);
    } else if (type === 'getKpiRecordsForDateByHandle') {
      if (typeof getKpiRecordsForDateByHandleInWorker !== 'function') {
        throw new Error('getKpiRecordsForDateByHandle job nepalaikomas šiame worker yje.');
      }
      payload = getKpiRecordsForDateByHandleInWorker(event.data);
    } else if (type === 'computeKpiLastShiftHourlyByHandle') {
      if (typeof computeKpiLastShiftHourlyByHandleInWorker !== 'function') {
        throw new Error('computeKpiLastShiftHourlyByHandle job nepalaikomas šiame worker yje.');
      }
      payload = computeKpiLastShiftHourlyByHandleInWorker(event.data);
    } else if (type === 'computeSummariesReports') {
      if (typeof computeSummariesReportsInWorker !== 'function') {
        throw new Error('computeSummariesReports job nepalaikomas šiame worker yje.');
      }
      payload = computeSummariesReportsInWorker(event.data);
    } else {
      throw new Error(`Nepalaikomas worker uzklausos tipas: ${String(type)}`);
    }

    const computeEnd = typeof performance?.now === 'function' ? performance.now() : Number(Date.now());
    const payloadMeta = buildPayloadMeta(payload) || {};
    payloadMeta.computeDurationMs = Number((computeEnd - computeStart).toFixed(2));
    /** @type {WorkerResponse} */
    const successMessage = { id, status: 'success', payload, meta: payloadMeta };
    self.postMessage(successMessage);
  } catch (error) {
    /** @type {WorkerResponse} */
    const errorMessage = {
      id,
      status: 'error',
      error: serializeError(error),
    };
    self.postMessage(errorMessage);
  }
}

function initDataWorker() {
  self.addEventListener('message', handleWorkerMessage);
}

self.initDataWorker = initDataWorker;
