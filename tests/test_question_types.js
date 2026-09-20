import assert from "node:assert";
import { questionTypeForBox, buildQuestion } from "../js/logic/questionTypes.js";

const boxExpectations = { 1: "meaning", 2: "meaning", 3: "production", 4: "production", 5: "cloze", 6: "cloze" };
for (const [box, expected] of Object.entries(boxExpectations)) {
  assert.strictEqual(questionTypeForBox(Number(box)), expected, `box ${box}`);
}

const ruecksicht = {
  id: 1, wort: "Rücksicht", anzeige: "die Rücksicht", artikel: "die", plural: "-en",
  wortart: "Nomen", rektion: "auf + A", tr: "anlayış",
  beispiel: "Man sollte Rücksicht auf andere nehmen.",
};

const bewerbung = {
  id: 2, wort: "Bewerbung", anzeige: "die Bewerbung", artikel: "die", plural: "-en",
  wortart: "Nomen", rektion: "", tr: "başvuru",
  beispiel: "Ich habe meine Bewerbung gestern abgeschickt.",
};

// A small pool other words can draw distractors from.
const pool = [
  ruecksicht,
  bewerbung,
  { id: 3, wort: "Tisch", anzeige: "der Tisch", artikel: "der", plural: "-e", wortart: "Nomen", rektion: "", tr: "masa" },
  { id: 4, wort: "Stuhl", anzeige: "der Stuhl", artikel: "der", plural: "-e", wortart: "Nomen", rektion: "für + A", tr: "sandalye" },
  { id: 5, wort: "Fenster", anzeige: "das Fenster", artikel: "das", plural: "-", wortart: "Nomen", rektion: "", tr: "pencere" },
];

{
  const q = buildQuestion({ box: 3, direction: "tr_de" }, ruecksicht, pool);
  assert.strictEqual(q.type, "production");
  assert.strictEqual(q.prompt, "anlayış");
  assert.strictEqual(q.expectsArtikel, true);
  assert.strictEqual(q.expectsPlural, true);
  assert.strictEqual(q.expectsRektion, true);
  assert.strictEqual(q.correctChoice, "die Rücksicht");
  assert.ok(q.choices.includes(q.correctChoice));
  assert.ok(q.choices.length > 1);
  assert.strictEqual(q.correctPlural, "-en");
  assert.ok(q.pluralChoices.includes(q.correctPlural));
  assert.strictEqual(q.correctRektion, "auf + A");
  assert.ok(q.rektionChoices.includes(q.correctRektion));
}

{
  const q = buildQuestion({ box: 3, direction: "de_tr" }, ruecksicht, pool);
  assert.strictEqual(q.type, "production");
  assert.strictEqual(q.prompt, "die Rücksicht");
  assert.strictEqual(q.expectsArtikel, false);
  assert.strictEqual(q.expectsRektion, false);
  // de_tr production recalls the Turkish meaning, not the German word
  // already shown as the prompt.
  assert.strictEqual(q.correctChoice, "anlayış");
  assert.ok(q.choices.includes(q.correctChoice));
  assert.strictEqual(q.pluralChoices.length, 0);
  assert.strictEqual(q.rektionChoices.length, 0);
}

{
  const q = buildQuestion({ box: 1, direction: "de_tr" }, bewerbung, pool);
  assert.strictEqual(q.type, "meaning");
  assert.strictEqual(q.prompt, "die Bewerbung");
}

{
  const q = buildQuestion({ box: 5, direction: "de_tr" }, bewerbung, pool);
  assert.strictEqual(q.type, "cloze");
  assert.ok(q.clozeSentence.includes("____"));
  assert.strictEqual(q.correctChoice, "Bewerbung");
  assert.ok(q.choices.includes(q.correctChoice));
  assert.ok(q.choices.length > 1);
}

console.log("test_question_types.js: all assertions passed");
