export function createDataWorkerClient(options = {}) {
  const WorkerCtor = options?.WorkerCtor ?? globalThis.Worker;
  const workerUrl = String(options?.workerUrl || '');

  let worker = null;
  let requestCounter = 0;
  let isDisposed = false;
  const pending = new Map();

  function cleanupPendingEntry(id) {
    const entry = pending.get(id);
    if (!entry) {
      return null;
    }
    pending.delete(id);
    if (entry.signal && entry.abortHandler) {
      try {
        entry.signal.removeEventListener('abort', entry.abortHandler);
      } catch (_error) {
        // ignore
      }
    }
    return entry;
  }

  function rejectAllPending(error) {
    const entries = Array.from(pending.entries());
    pending.clear();
    entries.forEach(([_id, entry]) => {
      if (entry?.signal && entry.abortHandler) {
        try {
          entry.signal.removeEventListener('abort', entry.abortHandler);
        } catch (_error) {
          // ignore
        }
      }
      try {
        entry?.reject?.(error instanceof Error ? error : new Error(String(error || 'Worker klaida.')));
      } catch (_error) {
        // ignore
      }
    });
  }

  function teardownWorker() {
    if (!worker) {
      return;
    }
    try {
      worker.terminate();
    } catch (_error) {
      // ignore
    }
    worker = null;
  }

  function handleWorkerMessage(event) {
    const data = event?.data;
    const id = data?.id;
    if (!id || !pending.has(id)) {
      return;
    }
    const entry = pending.get(id);
    if (!entry) {
      return;
    }
    if (data.status === 'progress') {
      if (typeof entry.onProgress === 'function') {
        entry.onProgress(data.payload || {});
      }
      return;
    }
    if (data.status === 'partial') {
      if (typeof entry.onPartialResult === 'function') {
        entry.onPartialResult({
          phase: data.phase || '',
          payload: data.payload || null,
          meta: data.meta || null,
        });
      }
      return;
    }

    cleanupPendingEntry(id);
    if (data.status === 'error') {
      const error = new Error(data.error?.message || 'Worker klaida.');
      error.name = data.error?.name || error.name;
      if (data.error?.stack) {
        error.stack = data.error.stack;
      }
      entry.reject(error);
      return;
    }

    const payload = data.payload;
    if (payload && typeof payload === 'object' && data.meta && typeof data.meta === 'object') {
      try {
        Object.defineProperty(payload, '__workerMeta', {
          value: data.meta,
          enumerable: false,
          configurable: true,
        });
      } catch (_error) {
        // ignore if object is sealed
      }
    }
    entry.resolve(payload);
  }

  function handleWorkerError(event) {
    const error = event?.error || new Error(event?.message || 'Worker klaida.');
    teardownWorker();
    rejectAllPending(error);
  }

  function ensureWorker() {
    if (isDisposed) {
      throw new Error('Worker klientas jau uždarytas.');
    }
    if (typeof WorkerCtor !== 'function') {
      throw new Error('Naršyklė nepalaiko Web Worker.');
    }
    if (!worker) {
      worker = new WorkerCtor(workerUrl);
      worker.addEventListener('message', handleWorkerMessage);
      worker.addEventListener('error', handleWorkerError);
    }
    return worker;
  }

  function request(message, options = {}) {
    if (!message || typeof message !== 'object') {
      return Promise.reject(new Error('Nenurodytas worker pranešimas.'));
    }
    const signal = options?.signal || null;
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Užklausa nutraukta.', 'AbortError'));
    }
    let activeWorker;
    try {
      activeWorker = ensureWorker();
    } catch (error) {
      return Promise.reject(error);
    }

    requestCounter += 1;
    const id = `dwc-${Date.now()}-${requestCounter}`;
    return new Promise((resolve, reject) => {
      let abortHandler = null;
      if (signal) {
        abortHandler = () => {
          const entry = cleanupPendingEntry(id);
          if (entry) {
            entry.reject(new DOMException('Užklausa nutraukta.', 'AbortError'));
          }
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
      pending.set(id, {
        resolve,
        reject,
        onProgress: typeof options?.onProgress === 'function' ? options.onProgress : null,
        onPartialResult: typeof options?.onPartialResult === 'function' ? options.onPartialResult : null,
        signal,
        abortHandler,
      });
      try {
        activeWorker.postMessage({ id, ...message });
      } catch (error) {
        cleanupPendingEntry(id);
        reject(error);
      }
    });
  }

  function reset(reason) {
    teardownWorker();
    rejectAllPending(reason || new Error('Worker klientas paleistas iš naujo.'));
  }

  function dispose() {
    isDisposed = true;
    reset(new Error('Worker klientas uždarytas.'));
  }

  return {
    request,
    ensureReady() {
      ensureWorker();
      return Promise.resolve();
    },
    reset,
    dispose,
  };
}
