export function syncDailyPeriodSummary({ selectors, dateKeyToDate, shortDateFormatter, dailyStats }) {
  if (!selectors?.dailyCaptionContext) {
    return;
  }
  const entries = Array.isArray(dailyStats)
    ? dailyStats.filter((entry) => entry && typeof entry.date === 'string')
    : [];
  if (!entries.length) {
    selectors.dailyCaptionContext.textContent = '';
    return;
  }
  const dates = entries
    .map((entry) => dateKeyToDate(entry.date))
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()));
  if (!dates.length) {
    selectors.dailyCaptionContext.textContent = '';
    return;
  }
  const startDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const endDate = new Date(Math.max(...dates.map((date) => date.getTime())));
  const startLabel = shortDateFormatter.format(startDate);
  const endLabel = shortDateFormatter.format(endDate);
  selectors.dailyCaptionContext.textContent =
    startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}
