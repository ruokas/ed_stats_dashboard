/*
 * Worker protocol layer for data-worker.js.
 * Keeps message contracts stable while delegating heavy transforms to data-worker-transforms.js.
 */

/**
 * @typedef {'transformCsv' | 'transformEdCsv' | 'applyKpiFilters'} WorkerRequestType
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
 * }} WorkerRequest
 */

/**
 * @typedef {{
 *   id: string;
 *   status: 'success' | 'error' | 'progress';
 *   payload?: unknown;
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
    if (type === 'transformCsv') {
      const { csvText, options, progressStep } = event.data;
      const reportProgress =
        Number.isInteger(progressStep) && progressStep > 0 ? createProgressReporter(id, progressStep) : null;
      payload = transformCsvWithStats(csvText, options, { reportProgress, progressStep });
    } else if (type === 'transformEdCsv') {
      const { csvText, options } = event.data;
      payload = transformEdCsvWithSummary(csvText, options || {});
    } else if (type === 'applyKpiFilters') {
      payload = applyKpiFiltersInWorker(event.data);
    } else {
      return;
    }

    /** @type {WorkerResponse} */
    const successMessage = { id, status: 'success', payload };
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
