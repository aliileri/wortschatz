import "fake-indexeddb/auto";
import assert from "node:assert";
import { clear, put, get, STORE_NAMES } from "../js/data/db.js";
import * as planner from "../js/data/planner.js";
import { isFirstWorkdayOfMonth } from "../js/logic/workdays.js";

async function reset() {
  for (const s of STORE_NAMES) await clear(s);
}

const firstWorkdayCases = [
  ["2026-02-01", false],
  ["2026-02-02", true],
  ["2026-02-03", false],
  ["2026-08-01", false],
  ["2026-08-03", true],
  ["2026-04-01", true],
  ["2026-04-02", false],
];
for (const [d, expected] of firstWorkdayCases) {
  assert.strictEqual(isFirstWorkdayOfMonth(d), expected, d);
}

let wc = 0;
async function makeKnownWord() {
  wc += 1;
  const word = { id: `w${wc}`, source_id: wc, quelle: "b2_kern", thema: "T", wort: `K${wc}`, anzeige: `K${wc}`, artikel: "", plural: "", wortart: "Nomen", rektion: "", tr: "x", beispiel: "", niveau: "B2" };
  await put("words", word);
  const uw = { wordId: word.id, status: "known", triaged_at: null, known_confirmed_at: null, known_check_count: 0 };
  await put("userWords", uw);
  return uw;
}

const MONDAY = "2026-01-05";
const NOT_FIRST_WORKDAY = "2026-01-06"; // Tuesday
const FIRST_WORKDAY_FEB = "2026-02-02";

// empty when not first workday of month
await reset();
{
  await makeKnownWord();
  assert.deepStrictEqual(await planner.buildRecheckQueue(NOT_FIRST_WORKDAY), []);
}

// non-empty on first workday of month
await reset();
{
  await makeKnownWord();
  const queue = await planner.buildRecheckQueue(FIRST_WORKDAY_FEB);
  assert.strictEqual(queue.length, 1);
}

// does not repeat within same day after being answered
await reset();
{
  const uw = await makeKnownWord();
  await planner.applyRecheckAnswer(uw, true, FIRST_WORKDAY_FEB);
  assert.deepStrictEqual(await planner.buildRecheckQueue(FIRST_WORKDAY_FEB), []);
}

// passed keeps known status, increments count
await reset();
{
  const uw = await makeKnownWord();
  uw.known_check_count = 2;
  await put("userWords", uw);
  await planner.applyRecheckAnswer(uw, true, MONDAY);
  const reloaded = await get("userWords", uw.wordId);
  assert.strictEqual(reloaded.status, "known");
  assert.strictEqual(reloaded.known_check_count, 3);
  assert.ok(reloaded.known_confirmed_at);
}

// failed demotes to learning, box 1, due today
await reset();
{
  const uw = await makeKnownWord();
  await planner.applyRecheckAnswer(uw, false, MONDAY);
  const reloaded = await get("userWords", uw.wordId);
  assert.strictEqual(reloaded.status, "learning");
  const card = await get("reviewCards", `${uw.wordId}::de_tr`);
  assert.strictEqual(card.box, 1);
  assert.strictEqual(card.due_on, MONDAY);
}

// only excludes the answered word, not the whole batch
await reset();
{
  const known = [];
  for (let i = 0; i < 4; i++) known.push(await makeKnownWord());
  await planner.applyRecheckAnswer(known[0], true, FIRST_WORKDAY_FEB);
  const remaining = await planner.buildRecheckQueue(FIRST_WORKDAY_FEB);
  assert.strictEqual(remaining.length, 3);
  assert.ok(!remaining.some((uw) => uw.wordId === known[0].wordId));
}

// deterministic within the same day
await reset();
{
  for (let i = 0; i < 10; i++) await makeKnownWord();
  const first = await planner.buildRecheckQueue(FIRST_WORKDAY_FEB);
  const second = await planner.buildRecheckQueue(FIRST_WORKDAY_FEB);
  assert.deepStrictEqual(first.map((uw) => uw.wordId), second.map((uw) => uw.wordId));
}

console.log("test_recheck.js: all assertions passed");
