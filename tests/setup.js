// Global test setup — runs once before all test files.

// Patch IDB globals using fake-indexeddb so any test file can call initDB()
// without a browser. Individual integration test files reset to a fresh
// IDBFactory in beforeEach so tests don't share database state.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = new IDBFactory();
globalThis.IDBKeyRange = IDBKeyRange;

// Minimal localStorage shim for Node environment.
// Used by telemetry.js, recovery.js, and the completeSession backup path.
const _ls = new Map();
globalThis.localStorage = {
  getItem:    (k)    => _ls.get(k) ?? null,
  setItem:    (k, v) => _ls.set(k, String(v)),
  removeItem: (k)    => _ls.delete(k),
  clear:      ()     => _ls.clear(),
};
