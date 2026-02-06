/**
 * ACG Chat - IndexedDB Storage
 * Persistent local storage for messages, rooms, and user data.
 */

const DB_NAME = 'acg-chat';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('room', 'room', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('room_channel', ['room', 'channel'], { unique: false });
      }

      if (!db.objectStoreNames.contains('sync')) {
        db.createObjectStore('sync', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, data) {
  await openDB();
  return reqToPromise(tx(storeName, 'readwrite').put(data));
}

export async function get(storeName, key) {
  await openDB();
  return reqToPromise(tx(storeName).get(key));
}

export async function getAll(storeName) {
  await openDB();
  return reqToPromise(tx(storeName).getAll());
}

export async function del(storeName, key) {
  await openDB();
  return reqToPromise(tx(storeName, 'readwrite').delete(key));
}

export async function getByIndex(storeName, indexName, value) {
  await openDB();
  const store = tx(storeName);
  const index = store.index(indexName);
  return reqToPromise(index.getAll(value));
}

export async function getMessagesByRoom(roomId, limit = 200) {
  await openDB();
  return new Promise((resolve, reject) => {
    const store = tx('messages');
    const index = store.index('room');
    const range = IDBKeyRange.only(roomId);
    const results = [];

    const req = index.openCursor(range, 'prev');
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results.reverse());
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMessagesByRoomChannel(roomId, channel, limit = 200) {
  await openDB();
  return new Promise((resolve, reject) => {
    const store = tx('messages');
    const index = store.index('room_channel');
    const range = IDBKeyRange.only([roomId, channel]);
    const results = [];

    const req = index.openCursor(range, 'prev');
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results.reverse());
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName) {
  await openDB();
  return reqToPromise(tx(storeName, 'readwrite').clear());
}

export async function countStore(storeName) {
  await openDB();
  return reqToPromise(tx(storeName).count());
}
