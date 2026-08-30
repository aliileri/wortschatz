import assert from "node:assert";
import { compare, normalize, levenshtein } from "../js/logic/answerEval.js";

const correctCases = [
  ["Bewerbung", "Bewerbung"],
  ["Bewerbung", "bewerbung"],
  ["Bewerbung", "BEWERBUNG"],
  ["Bewerbung", "  Bewerbung  "],
  ["Bewerbung", "Bewerbung."],
  ["schweißen", "schweissen"],
  ["schweißen", "SCHWEISSEN"],
  ["verfügt", "verfuegt"],
  ["Rücksicht", "ruecksicht"],
  ["Angebot", "Angebot!"],
];
for (const [expected, actual] of correctCases) {
  assert.strictEqual(compare(expected, actual), "correct", `${expected} vs ${actual}`);
}

const almostCases = [
  ["Bewerbung", "Bewrbung"],
  ["Angebot", "Angebott"],
  ["pünktlich", "puenktlic"],
];
for (const [expected, actual] of almostCases) {
  assert.strictEqual(compare(expected, actual), "almost", `${expected} vs ${actual}`);
}

const wrongCases = [
  ["Bewerbung", "Angebot"],
  ["ja", "nein"],
  ["schweißen", "abholen"],
];
for (const [expected, actual] of wrongCases) {
  assert.strictEqual(compare(expected, actual), "wrong", `${expected} vs ${actual}`);
}

assert.strictEqual(normalize("  Bewerbung! "), "bewerbung");
assert.strictEqual(normalize("schweißen"), "schweissen");
assert.strictEqual(normalize("für"), "fuer");

assert.strictEqual(levenshtein("kitten", "sitting"), 3);
assert.strictEqual(levenshtein("abc", "abc"), 0);
assert.strictEqual(levenshtein("", "abc"), 3);

assert.strictEqual(compare("ja", "j"), "almost");
assert.strictEqual(compare("ja", ""), "wrong");

console.log("test_answer_eval.js: all assertions passed");
