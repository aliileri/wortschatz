// Manual export/import - the safety net against IndexedDB data loss (iOS can
// evict storage, and a phone reset or reinstall wipes it entirely). This is
// the only way progress ever leaves the device, and it's opt-in: the user
// downloads a JSON file and can save it wherever they like (iCloud, Files, ...).
import { getAll, putAll, clear, STORE_NAMES } from "./db.js";

const BACKUP_VERSION = 1;

export async function exportBackup() {
  const data = {};
  for (const store of STORE_NAMES) {
    data[store] = await getAll(store);
  }
  return {
    app: "wortschatz",
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function importBackup(payload) {
  if (!payload || typeof payload !== "object" || !payload.data) {
    throw new Error("Geçersiz yedek dosyası");
  }
  for (const store of STORE_NAMES) {
    const rows = payload.data[store];
    if (!Array.isArray(rows)) continue;
    await clear(store);
    if (rows.length) await putAll(store, rows);
  }
}
