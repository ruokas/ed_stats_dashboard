// Compatibility shim kept for incremental migration away from the legacy monolith.
// New runtime code should import from `./full-page-app.js` or page-specific runners.
export { startFullPageApp } from './full-page-app.js';
