/*
 * Entry point for the classic web worker runtime.
 * Keep this file orchestration-only and move transformations into helper scripts.
 */

importScripts('./data-worker-transforms.js', './data-worker-protocol.js');

if (typeof self.initDataWorker === 'function') {
  self.initDataWorker();
}
