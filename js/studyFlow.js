// Mirrors vocab/views/study.py's item selection + context building, glueing
// the planner queue to a single "what to show next" item for the UI.
import * as planner from "./data/planner.js";
import * as stats from "./data/stats.js";
import { get } from "./data/db.js";
import { buildQuestion } from "./logic/questionTypes.js";

async function wordFor(wordId) {
  return get("words", wordId);
}

function nextItem(queue) {
  if (queue.dueReviews.length) return { kind: "review", card: queue.dueReviews[0] };
  if (queue.recheckWords.length) return { kind: "recheck", userWord: queue.recheckWords[0] };
  if (queue.triageCandidates.length) {
    const c = queue.triageCandidates[0];
    return { kind: "triage", userWord: c.userWord, word: c.word };
  }
  if (queue.deferredReviews.length) return { kind: "review", card: queue.deferredReviews[0] };
  return { kind: "done", backlogBlocked: queue.backlogBlocked };
}

export async function getItemContext(todayStr) {
  const queue = await planner.buildDailyQueue(todayStr);
  const item = await nextItem(queue);

  if (item.kind === "done") {
    await planner.maybeCompleteDailyPlan(todayStr, queue);
  }

  if (item.kind === "review") {
    const word = await wordFor(item.card.wordId);
    item.word = word;
    item.question = buildQuestion(item.card, word);
    item.wordStats = await stats.wordHistory(item.card.wordId);
  } else if (item.kind === "triage") {
    item.wordStats = await stats.wordHistory(item.userWord.wordId);
  } else if (item.kind === "recheck") {
    item.word = await wordFor(item.userWord.wordId);
    item.wordStats = await stats.wordHistory(item.userWord.wordId);
  }

  const done = (await planner.answeredTodayCount(todayStr)) + (await planner.triagedTodayCount(todayStr));
  const remaining =
    queue.dueReviews.length + queue.recheckWords.length + queue.triageCandidates.length + queue.deferredReviews.length;
  item.progressDone = done;
  item.progressTotal = done + remaining;
  item.sessionStats = await stats.todaySessionStats(todayStr);

  return item;
}

export async function dashboardContext(todayStr) {
  const queue = await planner.buildDailyQueue(todayStr);
  await planner.maybeCompleteDailyPlan(todayStr, queue);

  const unknownToday = await planner.unknownTriagedTodayCountPublic(todayStr);
  const doneToday = (await planner.answeredTodayCount(todayStr)) + (await planner.triagedTodayCount(todayStr));
  const { loadSettings } = await import("./data/settings.js");
  const settings = await loadSettings();
  const remainingNewWords = Math.max(settings.daily_new_words - unknownToday, 0);

  return {
    pendingReviews: queue.dueReviews.length + queue.deferredReviews.length,
    doneToday,
    remainingNewWords,
    streak: await planner.currentStreak(todayStr),
    backlogBlocked: queue.backlogBlocked,
    backlogCount: queue.backlogCount,
    hasAnythingToDo: Boolean(
      queue.dueReviews.length ||
        queue.recheckWords.length ||
        queue.triageCandidates.length ||
        queue.deferredReviews.length
    ),
  };
}
