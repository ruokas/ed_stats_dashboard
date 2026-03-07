(function initializeDateShiftHelpers(globalScope) {
  if (globalScope.__edSharedDateShift) {
    return;
  }

  function formatLocalDateKey(date) {
    if (!(date instanceof Date)) {
      return '';
    }
    const time = date.getTime();
    if (Number.isNaN(time)) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function toDateKeyFromDate(date) {
    return formatLocalDateKey(date);
  }

  function resolveShiftStartHour(calculations = {}, defaults = {}) {
    const candidates = [
      calculations?.shiftStartHour,
      calculations?.nightEndHour,
      defaults?.shiftStartHour,
      defaults?.nightEndHour,
      defaults?.calculations?.shiftStartHour,
      defaults?.calculations?.nightEndHour,
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = Number(candidates[index]);
      if (Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return 7;
  }

  function computeShiftDateKey(referenceDate, shiftStartHour) {
    if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
      return '';
    }
    const dayMinutes = 24 * 60;
    const startMinutesRaw = Number.isFinite(Number(shiftStartHour)) ? Number(shiftStartHour) * 60 : 7 * 60;
    const startMinutes = ((Math.round(startMinutesRaw) % dayMinutes) + dayMinutes) % dayMinutes;
    const arrivalMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    const shiftAnchor = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate()
    );
    if (arrivalMinutes < startMinutes) {
      shiftAnchor.setDate(shiftAnchor.getDate() - 1);
    }
    return formatLocalDateKey(shiftAnchor);
  }

  globalScope.__edSharedDateShift = {
    computeShiftDateKey,
    formatLocalDateKey,
    resolveShiftStartHour,
    toDateKeyFromDate,
  };
})(typeof self !== 'undefined' ? self : globalThis);
