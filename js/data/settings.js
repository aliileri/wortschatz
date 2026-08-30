import { get, put } from "./db.js";

const KEY = "singleton";

export const DEFAULT_SETTINGS = {
  key: KEY,
  daily_new_words: 10,
  triage_cap: 40,
  review_cap: 60,
  backlog_threshold: 100,
  sources_enabled: ["kursbuch"],
  known_recheck_per_month: 10,
};

export async function loadSettings() {
  const existing = await get("settings", KEY);
  if (existing) return existing;
  const created = { ...DEFAULT_SETTINGS };
  await put("settings", created);
  return created;
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const updated = { ...current, ...patch, key: KEY };
  await put("settings", updated);
  return updated;
}
