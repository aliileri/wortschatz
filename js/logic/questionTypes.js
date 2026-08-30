// Question type selection and construction.
import { generateCloze } from "./cloze.js";

export function questionTypeForBox(box) {
  if (box <= 2) return "meaning";
  if (box <= 4) return "production";
  return "cloze";
}

/**
 * @param {{box:number, direction:"de_tr"|"tr_de"}} card
 * @param {object} word
 * @returns {object} Question
 */
export function buildQuestion(card, word) {
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
