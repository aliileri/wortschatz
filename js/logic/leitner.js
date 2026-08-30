// Leitner box transition rules.
import { addWorkdays } from "./workdays.js";

export const BOX_INTERVALS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 15, 6: 30 };
export const MAX_BOX = 6;
export const MIN_BOX = 1;

export function nextBoxOnCorrect(box) {
  return Math.min(box + 1, MAX_BOX);
}

export function nextBoxOnWrong(box) {
  return box <= 3 ? MIN_BOX : box - 1;
}

export function computeDueOn(box, fromDateStr) {
  return addWorkdays(fromDateStr, BOX_INTERVALS[box]);
}

/** Mutates and returns `card` ({box, due_on, streak, lapses, is_graduated}). */
export function applyAnswer(card, correct, todayStr) {
  if (correct) {
    card.box = nextBoxOnCorrect(card.box);
    card.streak += 1;
  } else {
    card.box = nextBoxOnWrong(card.box);
    card.streak = 0;
    card.lapses += 1;
  }
  card.due_on = computeDueOn(card.box, todayStr);
  card.is_graduated = card.box === MAX_BOX && correct;
  return card;
}
