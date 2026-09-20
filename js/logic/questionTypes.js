// Question type selection and construction.
//
// Deviation from the original design: `production` and `cloze` are
// multiple-choice here, not typed. Typing German on a phone produced too
// many false "wrong" answers (typos, missing umlaut, autocapitalize) - a tap
// on the correct option removes that noise entirely.
import { generateCloze } from "./cloze.js";

const DISTRACTOR_COUNT = 3;

export function questionTypeForBox(box) {
  if (box <= 2) return "meaning";
  if (box <= 4) return "production";
  return "cloze";
}

function shuffled(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Distinct non-empty values of `field` across other words in `pool`,
 * formatted the same way the correct answer is (artikel-prefixed for a
 * Nomen). Prefers words of the same `wortart` for plausibility, widening to
 * the whole pool if that's too small a set to draw distractors from. */
function fieldTexts(pool, field, excludeId, wortart, withArtikel) {
  const others = pool.filter((w) => w.id !== excludeId && w[field]);
  if (withArtikel) {
    const withArt = others.filter((w) => w.artikel);
    return [...new Set(withArt.map((w) => `${w.artikel} ${w[field]}`))];
  }
  const sameWortart = [...new Set(others.filter((w) => w.wortart === wortart).map((w) => w[field]))];
  return sameWortart.length ? sameWortart : [...new Set(others.map((w) => w[field]))];
}

function choicesFor(pool, word, field, correct, withArtikel, count = DISTRACTOR_COUNT) {
  const texts = fieldTexts(pool, field, word.id, word.wortart, withArtikel).filter((t) => t !== correct);
  const distractors = shuffled(texts).slice(0, count);
  return shuffled([correct, ...distractors]);
}

/**
 * @param {{box:number, direction:"de_tr"|"tr_de"}} card
 * @param {object} word
 * @param {object[]} [pool] - all words, for drawing multiple-choice
 *   distractors from. Only needed for "production"/"cloze" questions.
 * @returns {object} Question
 */
export function buildQuestion(card, word, pool = []) {
  let qtype = questionTypeForBox(card.box);
  const isTrDe = card.direction === "tr_de";

  let clozeSentence = null;
  let clozeFailed = false;
  if (qtype === "cloze") {
    clozeSentence = generateCloze(word);
    if (clozeSentence === null) {
      clozeFailed = true;
      qtype = "production";
    }
  }

  const producingGerman = qtype === "production" && isTrDe;
  const expectsArtikel = producingGerman && word.wortart === "Nomen";
  // Some sources don't have a recorded plural for every noun (e.g. uncountables,
  // or entries that were never annotated) - only ask for it when we can grade it.
  const expectsPlural = expectsArtikel && Boolean(word.plural);
  const expectsRektion = producingGerman && Boolean(word.rektion);

  const prompt = isTrDe ? word.tr : word.anzeige;

  let choices = [];
  let correctChoice = "";
  let pluralChoices = [];
  let correctPlural = "";
  let rektionChoices = [];
  let correctRektion = "";

  if (qtype === "production" || qtype === "cloze") {
    // cloze always fills a German blank; production fills German only for a
    // tr_de card - a de_tr card instead recalls the Turkish meaning.
    if (qtype === "cloze" || isTrDe) {
      correctChoice = expectsArtikel ? `${word.artikel} ${word.wort}` : word.wort;
      choices = choicesFor(pool, word, "wort", correctChoice, expectsArtikel);
    } else {
      correctChoice = word.tr;
      choices = choicesFor(pool, word, "tr", correctChoice, false);
    }

    if (expectsPlural) {
      correctPlural = word.plural;
      pluralChoices = choicesFor(pool, word, "plural", correctPlural, false);
    }
    if (expectsRektion) {
      correctRektion = word.rektion;
      rektionChoices = choicesFor(pool, word, "rektion", correctRektion, false);
    }
  }

  return {
    type: qtype,
    word,
    direction: card.direction,
    prompt,
    expectsArtikel,
    expectsPlural,
    expectsRektion,
    clozeSentence,
    clozeFailed,
    choices,
    correctChoice,
    pluralChoices,
    correctPlural,
    rektionChoices,
    correctRektion,
    answerKey: {
      wort: word.wort,
      artikel: word.artikel,
      plural: word.plural,
      rektion: word.rektion,
      tr: word.tr,
      anzeige: word.anzeige,
    },
  };
}
