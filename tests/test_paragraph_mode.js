import "fake-indexeddb/auto";
import assert from "node:assert";
import { pickRandomWords, buildParagraphPrompt, boldTargetWords } from "../js/logic/paragraphPrompt.js";
import { clear, put, STORE_NAMES } from "../js/data/db.js";
import { eligibleParagraphWords } from "../js/data/paragraphMode.js";

async function reset() {
  for (const s of STORE_NAMES) await clear(s);
}

// --- pickRandomWords: correct count, no duplicates, never exceeds pool ---
{
  const pool = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}` }));
  const picked = pickRandomWords(pool, 10);
  assert.strictEqual(picked.length, 10);
  assert.strictEqual(new Set(picked.map((w) => w.id)).size, 10);

  const smallPool = pool.slice(0, 3);
  assert.strictEqual(pickRandomWords(smallPool, 10).length, 3);
}

// --- buildParagraphPrompt: mentions every word and the requested count ---
{
  const words = [
    { anzeige: "die Bewerbung", wort: "Bewerbung" },
    { anzeige: "", wort: "verfügen" },
  ];
  const prompt = buildParagraphPrompt(words, 2);
  assert.ok(prompt.includes("die Bewerbung"));
  assert.ok(prompt.includes("verfügen"));
  assert.ok(prompt.includes("2"));
  assert.ok(/B2/.test(prompt));
  assert.ok(prompt.includes("**kelime**"));
}

// --- boldTargetWords: markers become <strong>, escaped HTML stays inert ---
{
  const escaped = "Er hat die **Bewerbung** &lt;script&gt; **abgeschickt**.";
  assert.strictEqual(
    boldTargetWords(escaped),
    "Er hat die <strong>Bewerbung</strong> &lt;script&gt; <strong>abgeschickt</strong>."
  );
  assert.strictEqual(boldTargetWords("ohne Markierung"), "ohne Markierung");
}

// --- eligibleParagraphWords: only words with a review card (box >= 1) ---
await reset();
{
  await put("words", { id: "w1", wort: "Eins", anzeige: "Eins", tr: "bir" });
  await put("words", { id: "w2", wort: "Zwei", anzeige: "Zwei", tr: "iki" });
  await put("words", { id: "w3", wort: "Drei", anzeige: "Drei", tr: "üç" }); // never triaged into a box

  await put("reviewCards", {
    cardId: "w1::de_tr", wordId: "w1", direction: "de_tr", box: 1,
    due_on: "2026-01-05", streak: 0, lapses: 0, is_active: true, is_graduated: false,
  });
  await put("reviewCards", {
    cardId: "w2::de_tr", wordId: "w2", direction: "de_tr", box: 5,
    due_on: "2026-01-05", streak: 0, lapses: 0, is_active: false, is_graduated: false,
  });

  const eligible = await eligibleParagraphWords();
  const ids = eligible.map((w) => w.id).sort();
  assert.deepStrictEqual(ids, ["w1", "w2"]);
}

console.log("test_paragraph_mode.js: all assertions passed");
