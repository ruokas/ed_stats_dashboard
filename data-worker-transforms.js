/*
 * Main dashboard transform implementation moved to a dedicated module.
 * Keep this entry file minimal for maintainability.
 */

const WORKER_TRANSFORMS_VERSION = '2026-03-05-main-transform-split-1';

importScripts(
  `./data-worker-main-transform.js?v=${WORKER_TRANSFORMS_VERSION}`,
  `./data-worker-main-summaries-transform.js?v=${WORKER_TRANSFORMS_VERSION}`
);
