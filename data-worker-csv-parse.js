/*
 * Shared CSV parsing helpers for worker transform modules.
 */

importScripts('./shared/data-csv-shared.js');

const sharedCsv = self.__edSharedCsv;

if (!sharedCsv) {
  throw new Error('Nepavyko inicializuoti bendrų CSV helperių worker aplinkoje.');
}

self.detectDelimiter = sharedCsv.detectDelimiter;
self.parseCsv = sharedCsv.parseCsv;
