/*
 * Entry point for the classic web worker runtime.
 * Keep this file orchestration-only and move transformations into helper scripts.
 */

importScripts(
  './data-worker-csv-parse.js',
  './data-worker-transforms.js',
  './data-worker-ed-transform.js',
  './data-worker-kpi-filters.js',
  './data-worker-protocol.js'
);

if (typeof self.initDataWorker === 'function') {
  self.initDataWorker();
}
