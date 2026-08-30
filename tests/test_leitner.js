import assert from "node:assert";
import { nextBoxOnCorrect, nextBoxOnWrong, computeDueOn, applyAnswer } from "../js/logic/leitner.js";
import { addWorkdays } from "../js/logic/workdays.js";

const MONDAY = "2026-01-05";

const correctCases = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 6 };
for (const [box, expected] of Object.entries(correctCases)) {
  assert.strictEqual(nextBoxOnCorrect(Number(box)), expected, `box ${box} correct`);
}

const wrongCases = { 1: 1, 2: 1, 3: 1, 4: 3, 5: 4, 6: 5 };
for (const [box, expected] of Object.entries(wrongCases)) {
  assert.strictEqual(nextBoxOnWrong(Number(box)), expected, `box ${box} wrong`);
}

const intervalCases = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 15, 6: 30 };
for (const [box, workdays] of Object.entries(intervalCases)) {
  assert.strictEqual(computeDueOn(Number(box), MONDAY), addWorkdays(MONDAY, workdays), `box ${box} due_on`);
}

// correct promotes and increments streak, graduates at box 6
{
  const card = { box: 5, streak: 2, lapses: 0, due_on: MONDAY };
  applyAnswer(card, true, MONDAY);
  assert.strictEqual(card.box, 6);
  assert.strictEqual(card.streak, 3);
  assert.strictEqual(card.lapses, 0);
  assert.strictEqual(card.is_graduated, true);
  assert.strictEqual(card.due_on, addWorkdays(MONDAY, 30));
}

// wrong at low box resets to box 1
{
  const card = { box: 3, streak: 4, lapses: 1, due_on: MONDAY };
  applyAnswer(card, false, MONDAY);
  assert.strictEqual(card.box, 1);
  assert.strictEqual(card.streak, 0);
  assert.strictEqual(card.lapses, 2);
  assert.strictEqual(card.is_graduated, false);
  assert.strictEqual(card.due_on, MONDAY);
}

// wrong at high box demotes only one step (mature-word protection)
{
  const card = { box: 6, streak: 10, lapses: 0, is_graduated: true, due_on: MONDAY };
  applyAnswer(card, false, MONDAY);
  assert.strictEqual(card.box, 5);
  assert.strictEqual(card.streak, 0);
  assert.strictEqual(card.lapses, 1);
  assert.strictEqual(card.is_graduated, false);
  assert.strictEqual(card.due_on, addWorkdays(MONDAY, 15));
}

// correct at box 1 promotes to box 2
{
  const card = { box: 1, streak: 0, lapses: 0, due_on: MONDAY };
  applyAnswer(card, true, MONDAY);
  assert.strictEqual(card.box, 2);
  assert.strictEqual(card.due_on, addWorkdays(MONDAY, 1));
}

console.log("test_leitner.js: all assertions passed");
