export function buildFilterSummary({ entries = [], emptyText = '', noDataText = '' }) {
  const parts = (Array.isArray(entries) ? entries : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  if (!parts.length) {
    return emptyText;
  }
  return `${noDataText ? `${noDataText} • ` : ''}${parts.join(' • ')}`;
}
