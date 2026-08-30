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
