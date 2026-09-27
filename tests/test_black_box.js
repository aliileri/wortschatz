import assert from "node:assert";
import { isBlackBox, BLACK_BOX_THRESHOLD } from "../js/logic/blackBox.js";

assert.strictEqual(BLACK_BOX_THRESHOLD, 10);

// Below the threshold, never black-boxed regardless of correctness.
assert.strictEqual(isBlackBox(9, 0), false);
assert.strictEqual(isBlackBox(0, 0), false);

// At/above the threshold, only zero-correct counts as black box.
assert.strictEqual(isBlackBox(10, 0), true);
assert.strictEqual(isBlackBox(15, 0), true);
assert.strictEqual(isBlackBox(10, 1), false);
assert.strictEqual(isBlackBox(20, 3), false);

console.log("test_black_box.js: all assertions passed");
