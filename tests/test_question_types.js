import assert from "node:assert";
import { buildQuestion } from "../js/logic/questionTypes.js";

const bewerbung = {
  id: 2, wort: "Bewerbung", anzeige: "die Bewerbung", artikel: "die", plural: "-en",
  wortart: "Nomen", rektion: "", tr: "başvuru",
  beispiel: "Ich habe meine Bewerbung gestern abgeschickt.",
};

// Every box asks the same flashcard-style "meaning" question.
for (const box of [1, 2, 3, 4, 5, 6]) {
  const q = buildQuestion({ box, direction: "de_tr" }, bewerbung);
  assert.strictEqual(q.type, "meaning", `box ${box}`);
}

{
  const q = buildQuestion({ box: 1, direction: "de_tr" }, bewerbung);
  assert.strictEqual(q.prompt, "die Bewerbung");
  assert.strictEqual(q.answerKey.tr, "başvuru");
}

{
  const q = buildQuestion({ box: 4, direction: "tr_de" }, bewerbung);
  assert.strictEqual(q.prompt, "başvuru");
  assert.strictEqual(q.answerKey.anzeige, "die Bewerbung");
}

console.log("test_question_types.js: all assertions passed");
