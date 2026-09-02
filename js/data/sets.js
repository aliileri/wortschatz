// A "set" is one open-ended study batch, replacing "calendar day" as the unit
// that daily_new_words/triage_cap/review_cap are measured against. There's no
// limit on how many sets you can do - starting a new one just resets the
// quota counters to zero. Card due-dates (Leitner box scheduling) are
// untouched by this - they still run on real elapsed time, which is what
// actually makes spaced repetition work.
import { get, put } from "./db.js";

const KEY = "currentSet";

function newSetId() {
  return `set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getCurrentSetId() {
  const current = await get("meta", KEY);
  if (current) return current.id;
  return startNewSet();
}

export async function startNewSet() {
  const record = { key: KEY, id: newSetId(), startedAt: new Date().toISOString() };
  await put("meta", record);
  return record.id;
}

// Words dismissed as "already known" during triage are deleted outright (no
// log), so the count of them per set is tracked here - it still feeds the
// triage_cap brake and the "new / known" session counter.
function clearedKey(setId) {
  return `knownCleared::${setId}`;
}

export async function incrementKnownCleared(setId) {
  if (!setId) return;
  const rec = await get("meta", clearedKey(setId));
  await put("meta", { key: clearedKey(setId), count: (rec ? rec.count : 0) + 1 });
}

export async function getKnownCleared(setId) {
  if (!setId) return 0;
  const rec = await get("meta", clearedKey(setId));
  return rec ? rec.count : 0;
}
