import assert from "node:assert";
import { questionTypeForBox, buildQuestion } from "../js/logic/questionTypes.js";

const boxExpectations = { 1: "meaning", 2: "meaning", 3: "production", 4: "production", 5: "cloze", 6: "cloze" };
for (const [box, expected] of Object.entries(boxExpectations)) {
  assert.strictEqual(questionTypeForBox(Number(box)), expected, `box ${box}`);
}

const ruecksicht = {
  wort: "Rücksicht", anzeige: "die Rücksicht", artikel: "die", plural: "-en",
  wortart: "Nomen", rektion: "auf + A", tr: "anlayış",
  beispiel: "Man sollte Rücksicht auf andere nehmen.",
};

{
  const q = buildQuestion({ box: 3, direction: "tr_de" }, ruecksicht);
  assert.strictEqual(q.type, "production");
  assert.strictEqual(q.prompt, "anlayış");
  assert.strictEqual(q.expectsArtikel, true);
  assert.strictEqual(q.expectsPlural, true);
  assert.strictEqual(q.expectsRektion, true);
}

{
  const q = buildQuestion({ box: 3, direction: "de_tr" }, ruecksicht);
  assert.strictEqual(q.type, "production");
  assert.strictEqual(q.prompt, "die Rücksicht");
  assert.strictEqual(q.expectsArtikel, false);
  assert.strictEqual(q.expectsRektion, false);
}

const bewerbung = {
  wort: "Bewerbung", anzeige: "die Bewerbung", artikel: "die", plural: "-en",
  wortart: "Nomen", rektion: "", tr: "başvuru",
  beispiel: "Ich habe meine Bewerbung gestern abgeschickt.",
};

{
  const q = buildQuestion({ box: 1, direction: "de_tr" }, bewerbung);
  assert.strictEqual(q.type, "meaning");
  assert.strictEqual(q.prompt, "die Bewerbung");
}

{
  const q = buildQuestion({ box: 5, direction: "de_tr" }, bewerbung);
  assert.strictEqual(q.type, "cloze");
  assert.ok(q.clozeSentence.includes("____"));
}

console.log("test_question_types.js: all assertions passed");
