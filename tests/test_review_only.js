import "fake-indexeddb/auto";
import assert from "node:assert";
import { clear, put, get, STORE_NAMES } from "../js/data/db.js";
import { saveSettings } from "../js/data/settings.js";
import * as planner from "../js/data/planner.js";
import { getItemContext } from "../js/studyFlow.js";
import { addWorkdays } from "../js/logic/workdays.js";

const MONDAY = "2026-01-05";
const SET = "test-set-1";

async function reset() {
  for (const s of STORE_NAMES) await clear(s);
}

let wordCounter = 0;
async function makeWord(overrides = {}) {
  wordCounter += 1;
  const word = {
    id: overrides.id || `word-${wordCounter}`,
    source_id: overrides.source_id ?? wordCounter,
    quelle: overrides.quelle || "kursbuch",
    thema: overrides.thema || "Alltag",
    wort: overrides.wort || `Wort${wordCounter}`,
    anzeige: overrides.anzeige || `der Wort${wordCounter}`,
    artikel: "der",
    plural: "-e",
    wortart: "Nomen",
    rektion: "",
    tr: "test",
    beispiel: `Das ist ${overrides.wort || `Wort${wordCounter}`}.`,
    niveau: "B2",
  };
  await put("words", word);
  return word;
}

async function makeUserWord(word, overrides = {}) {
  const uw = {
    wordId: word.id,
    status: overrides.status || "new",
    triaged_at: null,
    known_confirmed_at: null,
    known_check_count: 0,
  };
  await put("userWords", uw);
  return uw;
}

async function makeReviewCard(word, overrides = {}) {
  const card = {
    cardId: `${word.id}::${overrides.direction || "de_tr"}`,
    wordId: word.id,
    direction: overrides.direction || "de_tr",
    box: overrides.box ?? 1,
    due_on: overrides.due_on ?? MONDAY,
    streak: overrides.streak ?? 0,
    lapses: overrides.lapses ?? 0,
    is_active: overrides.is_active ?? true,
    is_graduated: overrides.is_graduated ?? false,
    created_at: new Date().toISOString(),
  };
  await put("reviewCards", card);
  return card;
}

// --- review-only queue: triage and recheck are skipped, due reviews stay ---
await reset();
{
  const wNew = await makeWord();
  await makeUserWord(wNew); // would normally be a triage candidate
  const wDue = await makeWord();
  await makeReviewCard(wDue, { due_on: MONDAY });

  const queue = await planner.buildDailyQueue(MONDAY, null, true);
  assert.deepStrictEqual(queue.triageCandidates, []);
  assert.deepStrictEqual(queue.recheckWords, []);
  assert.strictEqual(queue.dueReviews.length, 1);
}

// --- review-only still enforces the set review_cap ---
await reset();
{
  await saveSettings({ review_cap: 2 });
  for (let i = 0; i < 4; i++) {
    const w = await makeWord();
    await makeReviewCard(w, { due_on: MONDAY });
  }

  const queue = await planner.buildDailyQueue(MONDAY, SET, true);
  assert.strictEqual(queue.dueReviews.length, 2);
}

// --- review-only does not resurface a word triaged the same day ---
// A card created by triage is due the next workday, so review-only on the
// triage day has nothing for it; the day after, it shows up.
await reset();
{
  await saveSettings({ daily_new_words: 10, triage_cap: 40 });
  const w = await makeWord({ source_id: 1 });
  const uw = await makeUserWord(w);
  await planner.applyTriage(uw, "unknown", MONDAY, SET);

  const sameDay = await planner.buildDailyQueue(MONDAY, null, true);
  assert.strictEqual(sameDay.dueReviews.length, 0);

  const nextDay = await planner.buildDailyQueue(addWorkdays(MONDAY, 1), null, true);
  assert.strictEqual(nextDay.dueReviews.length, 1);
  assert.strictEqual(nextDay.dueReviews[0].wordId, uw.wordId);
}

// --- review-only done does not mark the daily plan complete ---
await reset();
{
  const w = await makeWord();
  await makeReviewCard(w, { due_on: MONDAY });
  const planBefore = await get("dailyPlans", MONDAY);
  assert.strictEqual(planBefore, undefined);

  const item = await getItemContext(MONDAY, "review");
  assert.notStrictEqual(item.kind, "done"); // there's still a card to practice
  const planAfter = await get("dailyPlans", MONDAY);
  assert.strictEqual(planAfter, undefined); // review-only never wrote a plan
}

// --- review-only done when nothing due: plan still untouched, flag set ---
await reset();
{
  const w = await makeWord();
  await makeUserWord(w); // new word, no card
  const item = await getItemContext(MONDAY, "review");
  assert.strictEqual(item.kind, "done");
  assert.strictEqual(item.reviewOnly, true);
  const plan = await get("dailyPlans", MONDAY);
  assert.strictEqual(plan, undefined);
}

// --- review-only review answers use real Leitner (box advances) ---
await reset();
{
  const w = await makeWord();
  const card = await makeReviewCard(w, { box: 2, due_on: MONDAY });

  const log = await planner.submitReviewAnswer(card, true, "meaning", MONDAY, SET);
  assert.strictEqual(card.box, 3);
  assert.strictEqual(log.box_before, 2);
  assert.strictEqual(log.box_after, 3);
  assert.strictEqual(log.result, "correct");
}

console.log("test_review_only.js: all assertions passed");