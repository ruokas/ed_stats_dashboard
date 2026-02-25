/*
 * Main dashboard transform implementation moved to a dedicated module.
 * Keep this entry file minimal for maintainability.
 */

const WORKER_TRANSFORMS_VERSION = '2026-02-24-kpi-helper-fix-1';

importScripts(`./data-worker-main-transform.js?v=${WORKER_TRANSFORMS_VERSION}`);
