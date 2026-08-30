// Read-only aggregates for the statistics screen and per-word history.
import { getAll, getAllByIndex } from "./db.js";
import { today as todayFn } from "./clock.js";

const REVIEW_QUESTION_TYPES = ["meaning", "production", "cloze"];
const STATUS_VALUES = ["new", "known", "learning", "mastered"];

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

export async function wordHistory(wordId) {
  const logs = await getAllByIndex("reviewLogs", "wordId", wordId);
  logs.sort((a, b) => (a.answered_at < b.answered_at ? -1 : 1));
  return {
    shownCount: logs.length,
    correctCount: logs.filter((l) => l.result === "correct").length,
    firstShownAt: logs.length ? logs[0].answered_at : null,
  };
}

export async function statusDistribution() {
  const all = await getAll("userWords");
  const result = Object.fromEntries(STATUS_VALUES.map((s) => [s, 0]));
  for (const uw of all) result[uw.status] = (result[uw.status] || 0) + 1;
  return result;
}

export async function boxDistribution(direction = null) {
  const all = (await getAll("reviewCards")).filter((c) => c.is_active);
  const filtered = direction ? all.filter((c) => c.direction === direction) : all;
  const result = {};
  for (let b = 1; b <= 6; b++) result[b] = 0;
  for (const c of filtered) result[c.box] = (result[c.box] || 0) + 1;
  return result;
}

export async function dailyAnswerCounts(days = 30, todayStr = todayFn()) {
  const start = addDaysStr(todayStr, -(days - 1));
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysStr(start, i);
    const logs = await getAllByIndex("reviewLogs", "dateKey", d);
    const relevant = logs.filter((l) => REVIEW_QUESTION_TYPES.includes(l.question_type));
    const total = relevant.length;
    const correct = relevant.filter((l) => l.result === "correct").length;
    const accuracy = total ? Math.round((1000 * correct) / total) / 10 : null;
    results.push({ date: d, total, correct, accuracy });
  }
  return results;
}

export async function todaySessionStats(todayStr = todayFn()) {
  const logs = await getAllByIndex("reviewLogs", "dateKey", todayStr);
  const newKnown = logs.filter((l) => l.result === "triage_known").length;
  const newUnknown = logs.filter((l) => l.result === "triage_unknown").length;
  const reviewLogs = logs.filter((l) => REVIEW_QUESTION_TYPES.includes(l.question_type));
  const reviewKnown = reviewLogs.filter((l) => l.result === "correct").length;
  const reviewUnknown = reviewLogs.filter((l) => l.result === "wrong").length;
  return {
    newTotal: newKnown + newUnknown,
    newKnown,
    newUnknown,
    reviewTotal: reviewKnown + reviewUnknown,
    reviewKnown,
    reviewUnknown,
    shownTotal: newKnown + newUnknown + reviewKnown + reviewUnknown,
  };
}

export async function reviewForecast(days = 14, todayStr = todayFn()) {
  const cards = (await getAll("reviewCards")).filter((c) => c.is_active);
  const end = addDaysStr(todayStr, days);
  const byDate = new Map();
  for (const c of cards) {
    if (c.due_on >= todayStr && c.due_on < end) {
      byDate.set(c.due_on, (byDate.get(c.due_on) || 0) + 1);
    }
  }
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysStr(todayStr, i);
    results.push({ date: d, dueCount: byDate.get(d) || 0 });
  }
  return results;
}
