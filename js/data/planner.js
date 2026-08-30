// Study-flow orchestration and the load-brake mechanism - the DB-backed
// counterpart of the pure logic in js/logic/. Mirrors vocab/services/planner.py,
// vocab/services/triage.py, vocab/services/direction.py, vocab/services/recheck.py,
// but with one deliberate deviation from the original Django spec: quotas
// (daily_new_words/triage_cap/review_cap) are scoped to a "set" (an
// open-ended study batch, see js/data/sets.js) instead of a calendar day.
// There's no daily cap on how much you can study - starting a new set just
// resets the counters. Card due-dates (Leitner box scheduling) still run on
// real elapsed time, unaffected by this - that's what makes spaced
// repetition actually work, and changing it was explicitly ruled out.
import { get, put, getAll, getAllByIndex } from "./db.js";
import { loadSettings } from "./settings.js";
import { today as todayFn, nowIso } from "./clock.js";
import { applyAnswer as leitnerApplyAnswer } from "../logic/leitner.js";
import { shouldUnlockTrDe, isMastered } from "../logic/direction.js";
import { resolveTriageChoice } from "../logic/triage.js";
import { isWorkday, isFirstWorkdayOfMonth, addWorkdays } from "../logic/workdays.js";
import { seededSample } from "../logic/seededRandom.js";

const REVIEW_QUESTION_TYPES = ["meaning", "production", "cloze"];

function cardId(wordId, direction) {
  return `${wordId}::${direction}`;
}

async function activeCards() {
  const all = await getAll("reviewCards");
  return all.filter((c) => c.is_active);
}

export async function overdueCardCount(todayStr = todayFn()) {
  const cards = await activeCards();
  return cards.filter((c) => c.due_on < todayStr).length;
}

export async function isBacklogBlocked(todayStr = todayFn()) {
  const settings = await loadSettings();
  const overdue = await overdueCardCount(todayStr);
  return overdue > settings.backlog_threshold;
}

// ---- calendar-day-scoped helpers: used only for historical bookkeeping
// (DailyPlan / streak / the 30-day stats chart), never for quota gating. ----

async function logsToday(todayStr) {
  return getAllByIndex("reviewLogs", "dateKey", todayStr);
}

async function answeredTodayCardIds(todayStr) {
  const logs = await logsToday(todayStr);
  return new Set(
    logs.filter((l) => REVIEW_QUESTION_TYPES.includes(l.question_type) && l.cardId).map((l) => l.cardId)
  );
}

async function triagedTodayWordIds(todayStr) {
  const logs = await logsToday(todayStr);
  return new Set(logs.filter((l) => l.question_type === "triage").map((l) => l.wordId));
}

async function unknownTriagedTodayCount(todayStr) {
  const logs = await logsToday(todayStr);
  return logs.filter((l) => l.result === "triage_unknown").length;
}

async function rechecksAnsweredTodayWordIds(todayStr) {
  const logs = await logsToday(todayStr);
  return new Set(logs.filter((l) => l.question_type === "recheck").map((l) => l.wordId));
}

// ---- set-scoped helpers: used for quota gating (daily_new_words/triage_cap/
// review_cap). A `null` setId means "unscoped" - used only to peek at what a
// brand new set would contain, without committing to opening one. ----

async function logsInSet(setId) {
  if (setId === null) return [];
  return getAllByIndex("reviewLogs", "setId", setId);
}

async function answeredInSetCardIds(setId) {
  const logs = await logsInSet(setId);
  return new Set(
    logs.filter((l) => REVIEW_QUESTION_TYPES.includes(l.question_type) && l.cardId).map((l) => l.cardId)
  );
}

async function triagedInSetWordIds(setId) {
  const logs = await logsInSet(setId);
  return new Set(logs.filter((l) => l.question_type === "triage").map((l) => l.wordId));
}

async function triagedInSetCardIds(setId) {
  const logs = await logsInSet(setId);
  return new Set(logs.filter((l) => l.question_type === "triage" && l.cardId).map((l) => l.cardId));
}

async function unknownTriagedInSetCount(setId) {
  const logs = await logsInSet(setId);
  return logs.filter((l) => l.result === "triage_unknown").length;
}

export async function triageCandidatesQueryset(setId) {
  const settings = await loadSettings();
  const alreadyTriaged = await triagedInSetWordIds(setId);
  const newUserWords = await getAllByIndex("userWords", "status", "new");
  const words = await getAll("words");
  const wordsById = new Map(words.map((w) => [w.id, w]));

  const candidates = newUserWords
    .filter((uw) => !alreadyTriaged.has(uw.wordId))
    .map((uw) => ({ userWord: uw, word: wordsById.get(uw.wordId) }))
    .filter((c) => c.word && settings.sources_enabled.includes(c.word.quelle));

  const sourceOrder = new Map(settings.sources_enabled.map((s, i) => [s, i]));
  candidates.sort((a, b) => {
    const oa = sourceOrder.has(a.word.quelle) ? sourceOrder.get(a.word.quelle) : settings.sources_enabled.length;
    const ob = sourceOrder.has(b.word.quelle) ? sourceOrder.get(b.word.quelle) : settings.sources_enabled.length;
    if (oa !== ob) return oa - ob;
    return (a.word.source_id || 0) - (b.word.source_id || 0);
  });
  return candidates;
}

export async function pullNextTriageBatch(setId) {
  const candidates = await triageCandidatesQueryset(setId);

  if (setId === null) {
    // Unscoped peek - just report what's theoretically available, batched so
    // a caller doesn't accidentally treat "981 candidates" as "queue depth".
    return candidates.slice(0, 50);
  }

  const settings = await loadSettings();
  const unknownSoFar = await unknownTriagedInSetCount(setId);
  const triagedWordIds = await triagedInSetWordIds(setId);
  const triagedSoFar = triagedWordIds.size;

  const remainingUnknownQuota = settings.daily_new_words - unknownSoFar;
  const remainingTriageCap = settings.triage_cap - triagedSoFar;
  if (remainingUnknownQuota <= 0 || remainingTriageCap <= 0) return [];

  return candidates.slice(0, remainingTriageCap);
}

async function selectRecheckWords(todayStr, count) {
  const known = await getAllByIndex("userWords", "status", "known");
  const sorted = known.map((uw) => uw.wordId).sort();
  if (sorted.length === 0) return [];
  const chosenIds = seededSample(sorted, count, todayStr);
  const chosenSet = new Set(chosenIds);
  return known.filter((uw) => chosenSet.has(uw.wordId));
}

export async function buildRecheckQueue(todayStr = todayFn()) {
  if (!isFirstWorkdayOfMonth(todayStr)) return [];
  const settings = await loadSettings();
  const fullBatch = await selectRecheckWords(todayStr, settings.known_recheck_per_month);
  const answeredIds = await rechecksAnsweredTodayWordIds(todayStr);
  return fullBatch.filter((uw) => !answeredIds.has(uw.wordId));
}

export async function dueReviewsQueryset(todayStr = todayFn()) {
  const cards = await activeCards();
  return cards.filter((c) => c.due_on <= todayStr).sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0));
}

/**
 * @param {string} todayStr - real calendar date, still governs due-dates,
 *   backlog, and the monthly recheck - none of that is set-scoped.
 * @param {string|null} setId - the current set for quota gating, or null to
 *   peek at what a fresh set would contain without opening one.
 */
export async function buildDailyQueue(todayStr = todayFn(), setId = null) {
  const settings = await loadSettings();

  const backlogCount = await overdueCardCount(todayStr);
  const backlogBlocked = setId !== null && backlogCount > settings.backlog_threshold;

  const answeredInSet = await answeredInSetCardIds(setId);
  const remainingReviewCap = setId === null ? Infinity : Math.max(settings.review_cap - answeredInSet.size, 0);
  const freshFromTriage = await triagedInSetCardIds(setId);

  const allDueRaw = await dueReviewsQueryset(todayStr);
  const allDue = allDueRaw.filter((c) => !answeredInSet.has(c.cardId));
  const carriedOver = allDue.filter((c) => !freshFromTriage.has(c.cardId));
  const justTriaged = allDue.filter((c) => freshFromTriage.has(c.cardId));

  const dueReviews = carriedOver.slice(0, remainingReviewCap);
  const remainingAfterCarried = Math.max(remainingReviewCap - dueReviews.length, 0);
  const deferredReviews = justTriaged.slice(0, remainingAfterCarried);

  const recheckWords = await buildRecheckQueue(todayStr);
  const triageCandidates = backlogBlocked ? [] : await pullNextTriageBatch(setId);

  return {
    dueReviews, recheckWords, triageCandidates, deferredReviews,
    backlogCount, backlogBlocked,
  };
}

export async function submitReviewAnswer(card, correct, questionType, todayStr = todayFn(), setId = null) {
  const boxBefore = card.box;
  leitnerApplyAnswer(card, correct, todayStr);
  await put("reviewCards", card);

  const siblings = await getAllByIndex("reviewCards", "wordId", card.wordId);
  if (shouldUnlockTrDe(card, siblings)) {
    const trDe = {
      cardId: cardId(card.wordId, "tr_de"),
      wordId: card.wordId,
      direction: "tr_de",
      box: 1,
      due_on: todayStr,
      streak: 0,
      lapses: 0,
      is_active: true,
      is_graduated: false,
      created_at: nowIso(),
    };
    await put("reviewCards", trDe);
    siblings.push(trDe);
  }

  if (isMastered(siblings)) {
    const uw = await get("userWords", card.wordId);
    if (uw && uw.status !== "mastered") {
      uw.status = "mastered";
      await put("userWords", uw);
    }
  }

  const log = {
    cardId: card.cardId,
    wordId: card.wordId,
    answered_at: nowIso(),
    dateKey: todayStr,
    setId,
    result: correct ? "correct" : "wrong",
    box_before: boxBefore,
    box_after: card.box,
    question_type: questionType,
  };
  await put("reviewLogs", log);
  return log;
}

export async function applyTriage(userWord, choice, todayStr = todayFn(), setId = null) {
  const resolved = resolveTriageChoice(choice);
  userWord.status = resolved.status;
  userWord.triaged_at = nowIso();
  if (choice === "known") userWord.known_confirmed_at = nowIso();
  await put("userWords", userWord);

  let card = null;
  if (resolved.startingBox !== null) {
    card = {
      cardId: cardId(userWord.wordId, "de_tr"),
      wordId: userWord.wordId,
      direction: "de_tr",
      box: resolved.startingBox,
      due_on: todayStr,
      streak: 0,
      lapses: 0,
      is_active: true,
      is_graduated: false,
      created_at: nowIso(),
    };
    await put("reviewCards", card);
  }

  await put("reviewLogs", {
    cardId: card ? card.cardId : null,
    wordId: userWord.wordId,
    answered_at: nowIso(),
    dateKey: todayStr,
    setId,
    result: choice === "known" ? "triage_known" : "triage_unknown",
    box_before: null,
    box_after: resolved.startingBox,
    question_type: "triage",
  });

  return card;
}

export async function applyRecheckAnswer(userWord, passed, todayStr = todayFn()) {
  userWord.known_check_count = (userWord.known_check_count || 0) + 1;

  let result;
  if (passed) {
    userWord.known_confirmed_at = nowIso();
    await put("userWords", userWord);
    result = "correct";
  } else {
    userWord.status = "learning";
    await put("userWords", userWord);
    const existing = await get("reviewCards", cardId(userWord.wordId, "de_tr"));
    await put("reviewCards", {
      cardId: cardId(userWord.wordId, "de_tr"),
      wordId: userWord.wordId,
      direction: "de_tr",
      box: 1,
      due_on: todayStr,
      streak: existing ? existing.streak : 0,
      lapses: existing ? existing.lapses : 0,
      is_active: true,
      is_graduated: false,
      created_at: existing ? existing.created_at : nowIso(),
    });
    result = "wrong";
  }

  await put("reviewLogs", {
    cardId: null,
    wordId: userWord.wordId,
    answered_at: nowIso(),
    dateKey: todayStr,
    setId: null,
    result,
    box_before: null,
    box_after: null,
    question_type: "recheck",
  });
}

export async function answeredInSetCount(setId) {
  return (await answeredInSetCardIds(setId)).size;
}

export async function triagedInSetCount(setId) {
  return (await triagedInSetWordIds(setId)).size;
}

export async function unknownTriagedInSetCountPublic(setId) {
  return unknownTriagedInSetCount(setId);
}

export async function recordDailyPlan(todayStr = todayFn()) {
  let plan = await get("dailyPlans", todayStr);
  if (!plan) {
    plan = { date: todayStr, is_workday: isWorkday(todayStr), completed_at: null, weak_words_paragraph: "" };
  }
  plan.new_words_added = await unknownTriagedTodayCount(todayStr);
  plan.triaged_count = (await triagedTodayWordIds(todayStr)).size;
  const logs = await logsToday(todayStr);
  plan.reviews_done = logs.filter((l) => REVIEW_QUESTION_TYPES.includes(l.question_type)).length;
  await put("dailyPlans", plan);
  return plan;
}

/** Marks the calendar day complete the first time any one set's queue empties out that day. */
export async function maybeCompleteDailyPlan(todayStr, queue) {
  const plan = await recordDailyPlan(todayStr);
  const nothingLeft =
    queue.dueReviews.length === 0 &&
    queue.recheckWords.length === 0 &&
    queue.triageCandidates.length === 0 &&
    queue.deferredReviews.length === 0;
  if (!plan.completed_at && nothingLeft) {
    plan.completed_at = nowIso();
    await put("dailyPlans", plan);
  }
  return plan;
}

export async function currentStreak(todayStr = todayFn()) {
  let day = todayStr;
  let streak = 0;
  let checkingToday = true;
  // Bounded so a bug can never spin forever - a few years of workdays is far
  // more than any real streak could reach.
  for (let guard = 0; guard < 5000; guard++) {
    const plan = await get("dailyPlans", day);
    const completed = Boolean(plan && plan.completed_at);
    if (!completed) {
      if (checkingToday) {
        checkingToday = false;
        day = addWorkdays(day, -1);
        continue;
      }
      break;
    }
    streak += 1;
    checkingToday = false;
    day = addWorkdays(day, -1);
  }
  return streak;
}
