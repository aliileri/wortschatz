// Thin promise wrapper around IndexedDB. All app state lives here, on-device
// only — there is no server and nothing is ever sent over the network.

const DB_NAME = "wortschatz";
const DB_VERSION = 2;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        const words = db.createObjectStore("words", { keyPath: "id" });
        words.createIndex("quelle", "quelle");
        words.createIndex("thema", "thema");
        words.createIndex("niveau", "niveau");
        words.createIndex("wortart", "wortart");
        words.createIndex("source_id", "source_id");

        const userWords = db.createObjectStore("userWords", { keyPath: "wordId" });
        userWords.createIndex("status", "status");

        // is_active is a boolean and NOT a valid IndexedDB index key type, so it
        // is filtered in JS after a getAll() rather than indexed - fine at this
        // data scale (a few thousand cards for one user).
        const reviewCards = db.createObjectStore("reviewCards", { keyPath: "cardId" });
        reviewCards.createIndex("due_on", "due_on");
        reviewCards.createIndex("wordId", "wordId");
        reviewCards.createIndex("direction", "direction");

        const reviewLogs = db.createObjectStore("reviewLogs", { keyPath: "id", autoIncrement: true });
        reviewLogs.createIndex("dateKey", "dateKey");
        reviewLogs.createIndex("question_type", "question_type");
        reviewLogs.createIndex("result", "result");
        reviewLogs.createIndex("wordId", "wordId");
        reviewLogs.createIndex("cardId", "cardId");

        db.createObjectStore("dailyPlans", { keyPath: "date" });
        db.createObjectStore("settings", { keyPath: "key" });
        db.createObjectStore("meta", { keyPath: "key" });
      }

      if (oldVersion < 2) {
        // "set" tracking (see js/data/sets.js): quotas are scoped to a study
        // session ("set") rather than a calendar day, so logs need a setId
        // index alongside the existing dateKey one.
        const reviewLogs = tx.objectStore("reviewLogs");
        if (!reviewLogs.indexNames.contains("setId")) {
          reviewLogs.createIndex("setId", "setId");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = {};
    for (const name of [].concat(storeNames)) stores[name] = transaction.objectStore(name);
    let result;
    Promise.resolve(fn(stores, transaction))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        try {
          transaction.abort();
        } catch (_e) {
          /* already aborted/finished */
        }
        reject(err);
      });
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("transaction aborted"));
  });
}

export async function get(storeName, key) {
  return tx(storeName, "readonly", (s) => reqToPromise(s[storeName].get(key)));
}

export async function getAll(storeName) {
  return tx(storeName, "readonly", (s) => reqToPromise(s[storeName].getAll()));
}

export async function getAllByIndex(storeName, indexName, query) {
  return tx(storeName, "readonly", (s) =>
    reqToPromise(s[storeName].index(indexName).getAll(query))
  );
}

export async function put(storeName, value) {
  return tx(storeName, "readwrite", (s) => reqToPromise(s[storeName].put(value)));
}

export async function putAll(storeName, values) {
  return tx(storeName, "readwrite", (s) => {
    for (const v of values) s[storeName].put(v);
    return Promise.resolve();
  });
}

export async function remove(storeName, key) {
  return tx(storeName, "readwrite", (s) => reqToPromise(s[storeName].delete(key)));
}

export async function clear(storeName) {
  return tx(storeName, "readwrite", (s) => reqToPromise(s[storeName].clear()));
}

export async function count(storeName) {
  return tx(storeName, "readonly", (s) => reqToPromise(s[storeName].count()));
}

export const STORE_NAMES = ["words", "userWords", "reviewCards", "reviewLogs", "dailyPlans", "settings", "meta"];
