// core/library.js — biblioteca en IndexedDB (solo navegador).
// Las muestras de carpetas enlazadas NO se copian: se guarda el acceso a la carpeta y la ruta.

const DB_NAME = 'circuit-rhythm-sample-library';
const DB_VER = 1;
const STORES = ['samples', 'blobs', 'roots', 'packs', 'kv'];

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('samples')) d.createObjectStore('samples', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'sha' });
      if (!d.objectStoreNames.contains('roots')) d.createObjectStore('roots', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export class Library {
  constructor(db) { this.db = db; }
  static async open() { return new Library(await openDB()); }
  tx(store, mode = 'readonly') { return this.db.transaction(store, mode).objectStore(store); }
  all(store) { return req(this.tx(store).getAll()); }
  get(store, key) { return req(this.tx(store).get(key)); }
  put(store, val, key) { return req(key === undefined ? this.tx(store, 'readwrite').put(val) : this.tx(store, 'readwrite').put(val, key)); }
  del(store, key) { return req(this.tx(store, 'readwrite').delete(key)); }
  clear(store) { return req(this.tx(store, 'readwrite').clear()); }
  async putMany(store, vals) {
    if (!vals.length) return;
    await new Promise((res, rej) => {
      const t = this.db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      for (const v of vals) s.put(v);
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
    });
  }
  kvGet(k) { return this.get('kv', k); }
  kvSet(k, v) { return this.put('kv', v, k); }
  async wipe(keep = []) { for (const s of STORES) if (!keep.includes(s)) await this.clear(s); }
}

export async function sha256hex(u8) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const AUDIO_EXT = /\.(wav|wave|aif|aiff|aifc|mp3|flac|ogg)$/i;
export const PACK_EXT = /\.circuitrhythmpack$/i;
export const isJunk = (path) => /(^|\/)(__MACOSX|\.Trash|\.Spotlight)/.test(path) || /(^|\/)\._/.test(path) || /(^|\/)\.DS_Store$/.test(path);

// Recorre una carpeta enlazada (File System Access). Devuelve [{rel, handle}]
export async function walkDir(dirHandle, prefix = '', out = [], onProgress) {
  for await (const [name, h] of dirHandle.entries()) {
    const rel = prefix ? prefix + '/' + name : name;
    if (isJunk(rel)) continue;
    if (h.kind === 'directory') await walkDir(h, rel, out, onProgress);
    else if (AUDIO_EXT.test(name) || PACK_EXT.test(name)) { out.push({ rel, handle: h }); if (onProgress && out.length % 50 === 0) onProgress(out.length); }
  }
  return out;
}

export async function fileFromRoot(rootHandle, rel) {
  const parts = rel.split('/');
  let d = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
  const fh = await d.getFileHandle(parts[parts.length - 1]);
  return fh.getFile();
}

export async function ensurePermission(handle, mode = 'read', ask = false) {
  if (!handle || !handle.queryPermission) return 'unsupported';
  const opts = { mode };
  let p = await handle.queryPermission(opts);
  if (p === 'granted') return p;
  if (ask) p = await handle.requestPermission(opts);
  return p;
}
