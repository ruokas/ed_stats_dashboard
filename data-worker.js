/*
 * Entry point for the classic web worker runtime.
 * Keep this file orchestration-only and move transformations into helper scripts.
 */

const WORKER_HELPERS_VERSION = '2026-02-25-kpi-detail-jobs-1';

importScripts(
  `./data-worker-csv-parse.js?v=${WORKER_HELPERS_VERSION}`,
  `./data-worker-transforms.js?v=${WORKER_HELPERS_VERSION}`,
  `./data-worker-ed-transform.js?v=${WORKER_HELPERS_VERSION}`,
  `./data-worker-kpi-filters.js?v=${WORKER_HELPERS_VERSION}`,
  `./data-worker-protocol.js?v=${WORKER_HELPERS_VERSION}`
);

if (typeof self.initDataWorker === 'function') {
  self.initDataWorker();
}
