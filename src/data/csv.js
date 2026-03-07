import '../../shared/data-csv-shared.js';

const sharedCsv = globalThis.__edSharedCsv;

if (!sharedCsv) {
  throw new Error('Nepavyko inicializuoti bendrų CSV helperių.');
}

export const detectDelimiter = sharedCsv.detectDelimiter;
export const parseCsv = sharedCsv.parseCsv;
