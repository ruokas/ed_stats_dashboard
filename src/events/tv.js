// Compatibility shim kept for clients that still load older module graphs.
// TV mode was removed; keep a safe no-op export to avoid dynamic import failures.
export function initTvMode() {}
