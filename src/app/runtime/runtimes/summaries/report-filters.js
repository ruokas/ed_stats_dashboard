export function parsePositiveIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return Number.parseInt(String(fallback ?? 0), 10);
}
