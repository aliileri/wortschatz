// Mirrors vocab/views/study.py's item selection + context building, glueing
// the planner queue to a single "what to show next" item for the UI.
import * as planner from "./data/planner.js";
import * as stats from "./data/stats.js";
import { get } from "./data/db.js";
import { getCurrentSetId, startNewSet } from "./data/sets.js";
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
  return { kind: "done", backlogBlocked: queue.backlogBlocked };
}

function queueHasAnything(queue) {
  return Boolean(
    queue.dueReviews.length ||
      queue.recheckWords.length ||
      queue.triageCandidates.length
  );
}

/** Would a fresh set have anything at all, ignoring today's quotas/backlog? */
async function freshSetWouldHaveAnything(todayStr) {
  return queueHasAnything(await planner.buildDailyQueue(todayStr, null));
}

/**
 * Build the next study item.
 *
 * @param {string} todayStr - real calendar date.
 * @param {"daily"|"review"} mode - "daily" is the normal triage+review set
 *   flow; "review" is review-only mode: only due review cards, no
 *   recheck/triage, and nothing (set or plan) is marked complete.
 */
export async function getItemContext(todayStr, mode = "daily") {
  const reviewOnly = mode === "review";
  const setId = reviewOnly ? null : await getCurrentSetId();
  const queue = await planner.buildDailyQueue(todayStr, setId, reviewOnly);
  const item = await nextItem(queue);

  if (item.kind === "done") {
    if (reviewOnly) {
      // Review-only mode deliberately skips triage/recheck,so neither this
      // set-less queue nor today's daily plan should be marked complete here.
      item.reviewOnly = true;
    } else {
      await planner.maybeCompleteDailyPlan(todayStr, queue);
      // This set is finished - offer a fresh one only if there's actually
      // more to study (otherwise the button would just bounce right back here).
      item.canStartNewSet = await freshSetWouldHaveAnything(todayStr);
    }
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

  const done = reviewOnly
    ? await planner.answeredInSetCount(null)
    : (await planner.answeredInSetCount(setId)) + (await planner.triagedInSetCount(setId));
  const remaining =
    queue.dueReviews.length + queue.recheckWords.length + queue.triageCandidates.length;
  item.progressDone = done;
  item.progressTotal = done + remaining;
  item.sessionStats = await stats.currentSetStats(reviewOnly ? null : setId);
  item.setId = setId;
  item.reviewOnly = reviewOnly;

  return item;
}

export async function beginNewSet() {
  return startNewSet();
}

export async function dashboardContext(todayStr) {
  let setId = await getCurrentSetId();
  let queue = await planner.buildDailyQueue(todayStr, setId);
  await planner.maybeCompleteDailyPlan(todayStr, queue);

  const hasAnythingNormally = queueHasAnything(queue);
  let onlyViaNewSet = false;
  if (!hasAnythingNormally) {
    const wouldFreshSetHelp = await freshSetWouldHaveAnything(todayStr);
    if (wouldFreshSetHelp) {
      // The current set is spent but there's more to study - open a new one
      // right away so the dashboard's start button just works.

      setId = await startNewSet();
      queue = await planner.buildDailyQueue(todayStr, setId);
      onlyViaNewSet = true;
    }
  }

  const boxDist = await stats.boxDistribution();
  const mastered = await stats.masteredWords();

  return {
    pendingReviews: queue.dueReviews.length,
    boxDist,
    boxTotal: Object.values(boxDist).reduce((a, b) => a + b, 0),
    masteredWords: mastered,
    backlogBlocked: queue.backlogBlocked,
    backlogCount: queue.backlogCount,
    hasAnythingToDo: queueHasAnything(queue),
    onlyViaNewSet,
  };
}