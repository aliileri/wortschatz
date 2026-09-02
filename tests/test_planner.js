import "fake-indexeddb/auto";
import assert from "node:assert";
import { clear, put, STORE_NAMES } from "../js/data/db.js";
import { saveSettings } from "../js/data/settings.js";
import * as planner from "../js/data/planner.js";
import { addWorkdays } from "../js/logic/workdays.js";

const MONDAY = "2026-01-05";
const SATURDAY = "2026-01-03";
const SET = "test-set-1";
const SET2 = "test-set-2";

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

// --- overdue_card_count excludes today's due cards ---
await reset();
{
  const w1 = await makeWord();
  await makeReviewCard(w1, { due_on: MONDAY });
  const w2 = await makeWord();
  await makeReviewCard(w2, { due_on: addWorkdays(MONDAY, -1) });

  assert.strictEqual(await planner.overdueCardCount(MONDAY), 1);
}

// --- backlog_blocked only once threshold exceeded ---
await reset();
{
  await saveSettings({ backlog_threshold: 2 });
  for (let i = 0; i < 2; i++) {
    const w = await makeWord();
    await makeReviewCard(w, { due_on: addWorkdays(MONDAY, -1) });
  }
  assert.strictEqual(await planner.isBacklogBlocked(MONDAY), false);

  const w3 = await makeWord();
  await makeReviewCard(w3, { due_on: addWorkdays(MONDAY, -1) });
  assert.strictEqual(await planner.isBacklogBlocked(MONDAY), true);
}

// --- triage candidates ordered by quelle then source_id ---
await reset();
{
  await saveSettings({ sources_enabled: ["aspekte_beruf", "b2_kern", "erweiterung"] });
  const a = await makeWord({ wort: "A", quelle: "erweiterung", source_id: 1 });
  const b = await makeWord({ wort: "B", quelle: "aspekte_beruf", source_id: 5 });
  const c = await makeWord({ wort: "C", quelle: "aspekte_beruf", source_id: 2 });
  const d = await makeWord({ wort: "D", quelle: "b2_kern", source_id: 1 });
  for (const w of [a, b, c, d]) await makeUserWord(w);

  const candidates = await planner.triageCandidatesQueryset(SET);
  assert.deepStrictEqual(candidates.map((c) => c.word.wort), ["C", "B", "D", "A"]);
}

// --- set quota does not count known words ---
await reset();
{
  await saveSettings({ daily_new_words: 3, triage_cap: 40 });
  const words = [];
  for (let i = 0; i < 5; i++) words.push(await makeWord({ wort: `W${i}`, source_id: i }));
  const userWords = [];
  for (const w of words) userWords.push(await makeUserWord(w));

  await planner.applyTriage(userWords[0], "known", MONDAY, SET);
  await planner.applyTriage(userWords[1], "unknown", MONDAY, SET);
  await planner.applyTriage(userWords[2], "unknown", MONDAY, SET);
  await planner.applyTriage(userWords[3], "unknown", MONDAY, SET);

  assert.strictEqual(await planner.unknownTriagedInSetCountPublic(SET), 3);
  assert.deepStrictEqual(await planner.pullNextTriageBatch(SET), []);
}

// --- known triage results do not block further candidates ---
await reset();
{
  await saveSettings({ daily_new_words: 2, triage_cap: 40 });
  const words = [];
  for (let i = 0; i < 5; i++) words.push(await makeWord({ wort: `W${i}`, source_id: i }));
  const userWords = [];
  for (const w of words) userWords.push(await makeUserWord(w));

  for (const uw of userWords.slice(0, 3)) await planner.applyTriage(uw, "known", MONDAY, SET);

  const batch = await planner.pullNextTriageBatch(SET);
  assert.strictEqual(batch.length, 2);
}

// --- triage_cap ceiling stops the set even below quota ---
await reset();
{
  await saveSettings({ daily_new_words: 10, triage_cap: 3 });
  const words = [];
  for (let i = 0; i < 5; i++) words.push(await makeWord({ wort: `W${i}`, source_id: i }));
  const userWords = [];
  for (const w of words) userWords.push(await makeUserWord(w));

  for (const uw of userWords.slice(0, 3)) await planner.applyTriage(uw, "known", MONDAY, SET);

  assert.deepStrictEqual(await planner.pullNextTriageBatch(SET), []);
}

// --- backlog blocks new word flow and resumes below threshold ---
await reset();
{
  await saveSettings({ backlog_threshold: 2 });
  const newWord = await makeWord();
  await makeUserWord(newWord);

  const overdueCards = [];
  for (let i = 0; i < 3; i++) {
    const w = await makeWord();
    const uw = await makeUserWord(w, { status: "learning" });
    overdueCards.push(await makeReviewCard(w, { due_on: addWorkdays(MONDAY, -1) }));
  }

  let queue = await planner.buildDailyQueue(MONDAY, SET);
  assert.strictEqual(queue.backlogBlocked, true);
  assert.deepStrictEqual(queue.triageCandidates, []);

  // remove one overdue card to drop below threshold
  const { remove } = await import("../js/data/db.js");
  await remove("reviewCards", overdueCards[0].cardId);

  queue = await planner.buildDailyQueue(MONDAY, SET);
  assert.strictEqual(queue.backlogBlocked, false);
  assert.strictEqual(queue.triageCandidates.length, 1);
}

// --- due reviews capped at review_cap ---
await reset();
{
  await saveSettings({ review_cap: 2 });
  for (let i = 0; i < 4; i++) {
    const w = await makeWord();
    await makeReviewCard(w, { due_on: MONDAY });
  }
  const queue = await planner.buildDailyQueue(MONDAY, SET);
  assert.strictEqual(queue.dueReviews.length, 2);
}

// --- review_cap counts answers already done in this set ---
await reset();
{
  await saveSettings({ review_cap: 2 });
  const alreadyAnswered = [];
  for (let i = 0; i < 2; i++) {
    const w = await makeWord();
    alreadyAnswered.push(await makeReviewCard(w, { due_on: MONDAY }));
  }
  for (const card of alreadyAnswered) {
    await planner.submitReviewAnswer(card, true, "meaning", MONDAY, SET);
  }
  for (let i = 0; i < 2; i++) {
    const w = await makeWord();
    await makeReviewCard(w, { due_on: MONDAY });
  }
  const queue = await planner.buildDailyQueue(MONDAY, SET);
  assert.deepStrictEqual(queue.dueReviews, []);
}

// --- card created by this set's triage is not shown again this session;
//     its first review lands on the next workday ---
await reset();
{
  await saveSettings({ daily_new_words: 10, triage_cap: 40 });
  const w1 = await makeWord({ source_id: 1 });
  const triagedWord = await makeUserWord(w1);
  const w2 = await makeWord({ source_id: 2 });
  const otherNewWord = await makeUserWord(w2);

  const card = await planner.applyTriage(triagedWord, "unknown", MONDAY, SET);
  assert.strictEqual(card.due_on, addWorkdays(MONDAY, 1));

  const today = await planner.buildDailyQueue(MONDAY, SET);
  assert.deepStrictEqual(today.dueReviews, []);
  assert.deepStrictEqual(today.triageCandidates.map((c) => c.userWord.wordId), [otherNewWord.wordId]);

  const tomorrow = await planner.buildDailyQueue(addWorkdays(MONDAY, 1), SET);
  assert.strictEqual(tomorrow.dueReviews.length, 1);
  assert.strictEqual(tomorrow.dueReviews[0].wordId, triagedWord.wordId);
}

// --- weekend behaves exactly like a workday (weekend gating was removed) ---
await reset();
{
  const w = await makeWord();
  await makeReviewCard(w, { due_on: SATURDAY });

  const queue = await planner.buildDailyQueue(SATURDAY, SET);
  assert.strictEqual(queue.dueReviews.length, 1);
}

await reset();
{
  const w = await makeWord();
  await makeUserWord(w);

  const queue = await planner.buildDailyQueue(SATURDAY, SET);
  assert.strictEqual(queue.triageCandidates.length, 1);
}

// --- current streak counts consecutive completed days, breaks on missed day ---
await reset();
{
  const yesterday = addWorkdays(MONDAY, -1);
  const dayBefore = addWorkdays(yesterday, -1);
  await put("dailyPlans", { date: dayBefore, is_workday: true, completed_at: new Date().toISOString() });
  await put("dailyPlans", { date: yesterday, is_workday: true, completed_at: new Date().toISOString() });

  assert.strictEqual(await planner.currentStreak(MONDAY), 2);
}

await reset();
{
  const yesterday = addWorkdays(MONDAY, -1);
  const twoDaysAgo = addWorkdays(yesterday, -1);
  const threeDaysAgo = addWorkdays(twoDaysAgo, -1);
  await put("dailyPlans", { date: threeDaysAgo, is_workday: true, completed_at: new Date().toISOString() });
  await put("dailyPlans", { date: twoDaysAgo, is_workday: true, completed_at: new Date().toISOString() });
  // yesterday missing -> streak resets

  assert.strictEqual(await planner.currentStreak(MONDAY), 0);
}

// --- submit_review_answer updates box and logs before/after ---
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

// --- submit_review_answer unlocks tr_de at box 3 ---
await reset();
{
  const w = await makeWord();
  const uw = await makeUserWord(w);
  const card = await makeReviewCard(w, { box: 2, due_on: MONDAY }); // promotes to box 3

  await planner.submitReviewAnswer(card, true, "production", MONDAY, SET);

  const { get } = await import("../js/data/db.js");
  const trDe = await get("reviewCards", `${w.id}::tr_de`);
  assert.ok(trDe, "tr_de card should have been created");
  assert.strictEqual(trDe.box, 1);
}

// --- setId === null is an unscoped peek that ignores quotas/backlog ---
await reset();
{
  await saveSettings({ daily_new_words: 1, triage_cap: 1, review_cap: 1, backlog_threshold: 1 });

  const words = [];
  for (let i = 0; i < 5; i++) words.push(await makeWord({ wort: `W${i}`, source_id: i }));
  for (const w of words) await makeUserWord(w);

  const overdue = [];
  for (let i = 0; i < 3; i++) {
    const w = await makeWord({ wort: `OD${i}` });
    overdue.push(await makeReviewCard(w, { due_on: addWorkdays(MONDAY, -1) }));
  }

  const scopedQueue = await planner.buildDailyQueue(MONDAY, SET);
  assert.strictEqual(scopedQueue.backlogBlocked, true);
  assert.deepStrictEqual(scopedQueue.triageCandidates, []);
  assert.strictEqual(scopedQueue.dueReviews.length, 1);

  const peekQueue = await planner.buildDailyQueue(MONDAY, null);
  assert.strictEqual(peekQueue.backlogBlocked, false);
  assert.strictEqual(peekQueue.triageCandidates.length, 5);
  assert.strictEqual(peekQueue.dueReviews.length, 3);
}

// --- starting a new set resets quotas independently of the exhausted one ---
await reset();
{
  await saveSettings({ daily_new_words: 1, triage_cap: 1 });
  const words = [];
  for (let i = 0; i < 3; i++) words.push(await makeWord({ wort: `W${i}`, source_id: i }));
  const userWords = [];
  for (const w of words) userWords.push(await makeUserWord(w));

  await planner.applyTriage(userWords[0], "known", MONDAY, SET);
  assert.deepStrictEqual(await planner.pullNextTriageBatch(SET), []); // SET is spent

  const batchInSet2 = await planner.pullNextTriageBatch(SET2);
  assert.strictEqual(batchInSet2.length, 1); // fresh quota in a new set
}

console.log("test_planner.js: all assertions passed");
