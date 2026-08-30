import assert from "node:assert";
import { shouldUnlockTrDe, isMastered } from "../js/logic/direction.js";
import { resolveTriageChoice } from "../js/logic/triage.js";

// Triage
{
  const known = resolveTriageChoice("known");
  assert.strictEqual(known.status, "known");
  assert.strictEqual(known.startingBox, null);

  const unknown = resolveTriageChoice("unknown");
  assert.strictEqual(unknown.status, "learning");
  assert.strictEqual(unknown.startingBox, 1);
}

// Direction unlock
{
  const deTrBox3 = { direction: "de_tr", box: 3 };
  assert.strictEqual(shouldUnlockTrDe(deTrBox3, []), true);

  const deTrBox2 = { direction: "de_tr", box: 2 };
  assert.strictEqual(shouldUnlockTrDe(deTrBox2, []), false);

  assert.strictEqual(shouldUnlockTrDe(deTrBox3, [{ direction: "tr_de" }]), false);

  const trDeBox3 = { direction: "tr_de", box: 3 };
  assert.strictEqual(shouldUnlockTrDe(trDeBox3, []), false);
}

// Mastery
{
  const oneGraduated = [{ direction: "de_tr", box: 6, is_graduated: true }];
  assert.strictEqual(isMastered(oneGraduated), false);

  const bothGraduated = [
    { direction: "de_tr", box: 6, is_graduated: true },
    { direction: "tr_de", box: 6, is_graduated: true },
  ];
  assert.strictEqual(isMastered(bothGraduated), true);

  const oneNotGraduated = [
    { direction: "de_tr", box: 6, is_graduated: true },
    { direction: "tr_de", box: 4, is_graduated: false },
  ];
  assert.strictEqual(isMastered(oneNotGraduated), false);
}

console.log("test_direction_triage.js: all assertions passed");
