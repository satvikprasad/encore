// Photos and videos attached to shows. They live in this browser's IndexedDB only — the app never uploads
// them (the import flow sends just {lat, lng, captured_at}). Every call is guarded so a browser without
// storage (private mode, blocked site data) degrades to "no gallery" rather than an error.

export interface StoredMedia {
  id: string;
  userId: string;
  eventId: string;
  kind: "image" | "video";
  name: string;
  addedAt: string;
  blob: Blob;
}

const DB_NAME = "encore-media";
const STORE = "media";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("byOwnerEvent", ["userId", "eventId"]);
      store.createIndex("byOwner", "userId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[]): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const reqs = run(t.objectStore(STORE));
        const list = Array.isArray(reqs) ? reqs : [reqs];
        const out: T[] = [];
        list.forEach((r, i) => {
          r.onsuccess = () => {
            out[i] = r.result;
          };
        });
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const kindOf = (f: File): StoredMedia["kind"] => (f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name) ? "video" : "image");

/** Attach files to a show for this user. Returns what was stored ([] if storage is unavailable). */
export async function saveMedia(userId: string, eventId: string, files: File[]): Promise<StoredMedia[]> {
  const rows: StoredMedia[] = files.map((f) => ({
    id: `${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    eventId,
    kind: kindOf(f),
    name: f.name,
    addedAt: new Date().toISOString(),
    blob: f,
  }));
  try {
    await tx("readwrite", (s) => rows.map((r) => s.put(r)));
    return rows;
  } catch {
    return [];
  }
}

export async function listMedia(userId: string, eventId: string): Promise<StoredMedia[]> {
  try {
    const [rows] = await tx<StoredMedia[]>("readonly", (s) => s.index("byOwnerEvent").getAll([userId, eventId]));
    return (rows ?? []).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  } catch {
    return [];
  }
}

/** event id → number of attachments, for badges on lists. */
export async function countMedia(userId: string): Promise<Record<string, number>> {
  try {
    const [rows] = await tx<StoredMedia[]>("readonly", (s) => s.index("byOwner").getAll(userId));
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.eventId] = (counts[r.eventId] ?? 0) + 1;
    return counts;
  } catch {
    return {};
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* nothing to do */
  }
}
