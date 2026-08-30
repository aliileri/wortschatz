import "fake-indexeddb/auto";
import assert from "node:assert";
import { clear, put, get, STORE_NAMES } from "../js/data/db.js";
import { saveSettings } from "../js/data/settings.js";
import * as planner from "../js/data/planner.js";
import { getCurrentSetId } from "../js/data/sets.js";
import { dashboardContext } from "../js/studyFlow.js";

async function reset() {
  for (const s of STORE_NAMES) await clear(s);
}

const MONDAY = "2026-01-05";

async function makeWord(id) {
  const word = { id, source_id: 1, quelle: "kursbuch", thema: "T", wort: id, anzeige: id, artikel: "", plural: "", wortart: "", rektion: "", tr: "x", beispiel: "", niveau: "B1" };
  await put("words", word);
  await put("userWords", { wordId: id, status: "new", triaged_at: null, known_confirmed_at: null, known_check_count: 0 });
  return word;
}

// hasAnythingToDo true and onlyViaNewSet false under normal conditions
await reset();
{
  await makeWord("w1");
  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, true);
  assert.strictEqual(ctx.onlyViaNewSet, false);
}

// once the current set's triage_cap is exhausted, the dashboard should
// silently open a fresh set rather than the start button just disappearing
await reset();
{
  await saveSettings({ triage_cap: 1 });
  const words = [];
  for (let i = 0; i < 3; i++) words.push(await makeWord(`w${i}`));

  const setId = await getCurrentSetId();
  // exhaust triage_cap with one "known" answer (doesn't spawn a review card,
  // so deferredReviews/dueReviews stay empty too - a clean "done" state)
  const uw0 = await get("userWords", "w0");
  await planner.applyTriage(uw0, "known", MONDAY, setId);

  const scopedQueue = await planner.buildDailyQueue(MONDAY, setId);
  assert.deepStrictEqual(scopedQueue.triageCandidates, []); // quota/cap exhausted

  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, true, "dashboard button must not disappear");
  assert.strictEqual(ctx.onlyViaNewSet, true);

  // and it actually opened a new set - not just reporting a stale truth
  const newSetId = await getCurrentSetId();
  assert.notStrictEqual(newSetId, setId);
}

// truly nothing left anywhere -> hasAnythingToDo is finally false
await reset();
{
  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, false);
}

console.log("test_dashboard.js: all assertions passed");
