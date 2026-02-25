const DEFAULT_DB_NAME = 'edDashboardDataCache';
const DEFAULT_STORE_NAME = 'transformedCsv';
const DEFAULT_DB_VERSION = 1;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB klaida.'));
  });
}

function openDb(indexedDbImpl, { dbName, storeName, dbVersion }) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDbImpl.open(dbName, dbVersion);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Nepavyko atverti IndexedDB.'));
  });
}

function createNoopPersistentCache() {
  return {
    isAvailable: false,
    async get() {
      return null;
    },
    async set() {},
    async delete() {},
  };
}

export function createPersistentDataCache(options = {}) {
  const indexedDbImpl = options.indexedDBImpl ?? globalThis.indexedDB ?? null;
  if (!indexedDbImpl || typeof indexedDbImpl.open !== 'function') {
    return createNoopPersistentCache();
  }

  const dbName = String(options.dbName || DEFAULT_DB_NAME);
  const storeName = String(options.storeName || DEFAULT_STORE_NAME);
  const dbVersion =
    Number.isInteger(options.dbVersion) && options.dbVersion > 0 ? options.dbVersion : DEFAULT_DB_VERSION;

  let dbPromise = null;
  const getDb = async () => {
    if (!dbPromise) {
      dbPromise = openDb(indexedDbImpl, { dbName, storeName, dbVersion }).catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  };

  const run = async (mode, operation) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB operacija nutraukta.'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB operacijos klaida.'));
      Promise.resolve()
        .then(() => operation(transaction.objectStore(storeName)))
        .then(resolve)
        .catch(reject);
    });
  };

  return {
    isAvailable: true,
    async get(key) {
      if (!key) {
        return null;
      }
      return run('readonly', async (store) => {
        const result = await requestToPromise(store.get(key));
        return result && typeof result === 'object' ? result : null;
      });
    },
    async set(key, value) {
      if (!key) {
        return;
      }
      await run('readwrite', async (store) => {
        await requestToPromise(store.put(value, key));
      });
    },
    async delete(key) {
      if (!key) {
        return;
      }
      await run('readwrite', async (store) => {
        await requestToPromise(store.delete(key));
      });
    },
  };
}
