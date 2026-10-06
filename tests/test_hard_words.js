import assert from "node:assert";
import { isHardWord, HARD_WORD_THRESHOLD } from "../js/logic/hardWords.js";

assert.strictEqual(HARD_WORD_THRESHOLD, 10);

assert.strictEqual(isHardWord(0), false);
assert.strictEqual(isHardWord(9), false);
assert.strictEqual(isHardWord(10), true);
assert.strictEqual(isHardWord(25), true);

console.log("test_hard_words.js: all assertions passed");
