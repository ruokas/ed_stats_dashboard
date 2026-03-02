export class PerfMonitor {
  constructor() {
    this.runs = [];
    this.counter = 0;
  }

  start(label, meta = {}) {
    this.counter += 1;
    const id = `${label}-${this.counter}`;
    performance.mark(`${id}-start`);
    return { id, label, meta };
  }

  finish(handle, extraMeta = {}) {
    if (!handle?.id) {
      return null;
    }
    const endMark = `${handle.id}-end`;
    performance.mark(endMark);
    const measureName = `${handle.id}-measure`;
    performance.measure(measureName, `${handle.id}-start`, endMark);
    const entry = performance.getEntriesByName(measureName).pop();
    const row = {
      žyma: handle.label,
      trukmėMs: entry?.duration ? Number(entry.duration.toFixed(2)) : null,
      laikas: new Date().toISOString(),
      ...handle.meta,
      ...extraMeta,
    };
    this.runs.push(row);
    return row;
  }

  logTable() {
    if (this.runs.length) {
      console.table(this.runs);
    }
  }
}
