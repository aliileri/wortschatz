import "fake-indexeddb/auto";
import assert from "node:assert";
import { clear, put, STORE_NAMES } from "../js/data/db.js";
import { saveSettings } from "../js/data/settings.js";
import * as planner from "../js/data/planner.js";
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

// hasAnythingToDo true and onlyViaOverride false under normal conditions
await reset();
{
  await makeWord("w1");
  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, true);
  assert.strictEqual(ctx.onlyViaOverride, false);
}

// once daily_new_words/triage_cap are exhausted, dashboard should still say
// hasAnythingToDo (via override) instead of silently going empty
await reset();
{
  await saveSettings({ triage_cap: 1 });
  const words = [];
  for (let i = 0; i < 3; i++) words.push(await makeWord(`w${i}`));

  // exhaust triage_cap with one "known" answer (doesn't spawn a review card,
  // so deferredReviews/dueReviews stay empty too - a clean "done" state)
  const { get } = await import("../js/data/db.js");
  const uw0 = await get("userWords", "w0");
  await planner.applyTriage(uw0, "known", MONDAY);

  const normalQueue = await planner.buildDailyQueue(MONDAY);
  assert.deepStrictEqual(normalQueue.triageCandidates, []); // quota/cap exhausted

  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, true, "dashboard button must not disappear");
  assert.strictEqual(ctx.onlyViaOverride, true);
}

// truly nothing left anywhere -> hasAnythingToDo is finally false
await reset();
{
  const ctx = await dashboardContext(MONDAY);
  assert.strictEqual(ctx.hasAnythingToDo, false);
}

console.log("test_dashboard.js: all assertions passed");
