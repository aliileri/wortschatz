// Question construction. Every box asks the same "meaning" flashcard: front
// side shown, user reveals the back, self-assesses Bildim/Bilemedim. Box only
// controls the Leitner interval (see leitner.js), never the question shape -
// multiple-choice production/cloze questions were tried and dropped.

/**
 * @param {{direction:"de_tr"|"tr_de"}} card
 * @param {object} word
 * @returns {object} Question
 */
export function buildQuestion(card, word) {
  const isTrDe = card.direction === "tr_de";
  const prompt = isTrDe ? word.tr : word.anzeige;

  return {
    type: "meaning",
    word,
    direction: card.direction,
    prompt,
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
