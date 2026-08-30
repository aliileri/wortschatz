import assert from "node:assert";
import { generateCloze, clozeGenerationReport } from "../js/logic/cloze.js";

const bewerbung = {
  wort: "Bewerbung",
  beispiel: "Ich habe meine Bewerbung gestern abgeschickt.",
};
assert.strictEqual(generateCloze(bewerbung), "Ich habe meine ____ gestern abgeschickt.");

const verfuegen = {
  wort: "verfügen",
  beispiel: "Das Unternehmen verfügt über ausreichende Kapazitäten.",
};
assert.strictEqual(generateCloze(verfuegen), "Das Unternehmen ____ über ausreichende Kapazitäten.");

const abholen = {
  wort: "abholen",
  beispiel: "Ich hole das Paket morgen ab.",
};
assert.strictEqual(generateCloze(abholen), "Ich ____ das Paket morgen ab.");

const rolleSpielen = {
  wort: "eine Rolle spielen",
  beispiel: "Geld spielt dabei keine Rolle.",
};
assert.strictEqual(generateCloze(rolleSpielen), null);

const report = clozeGenerationReport([bewerbung, rolleSpielen].map((w, i) => ({ id: i, ...w })));
const failingWords = new Set(report.map((r) => r.wort));
assert.ok(failingWords.has("eine Rolle spielen"));
assert.ok(!failingWords.has("Bewerbung"));
for (const row of report) assert.ok(row.reason);

console.log("test_cloze.js: all assertions passed");
