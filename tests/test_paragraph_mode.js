import "fake-indexeddb/auto";
import assert from "node:assert";
import { pickRandomWords, pickParagraphWords, buildParagraphPrompt, boldTargetWords } from "../js/logic/paragraphPrompt.js";
import { clear, get, put, STORE_NAMES } from "../js/data/db.js";
import { eligibleParagraphWords, generateParagraph, DEFAULT_MODEL } from "../js/data/paragraphMode.js";
import { saveSettings, loadSettings } from "../js/data/settings.js";

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

// --- pickParagraphWords: most-missed first, then rotate through the rest ---
{
  const words = ["a", "b", "c", "d"].map((id) => ({ id }));
  const wrongs = new Map([["a", 1], ["b", 7], ["c", 3]]); // d: never wrong
  const box = new Map([["a", 2], ["b", 1], ["c", 1], ["d", 4]]);
  const uses = new Map();
  const ids = () => pickParagraphWords(words, 2, { wrongs, box, uses }).map((w) => w.id);

  assert.deepStrictEqual(ids(), ["b", "c"]);
  uses.set("b", 1); uses.set("c", 1);
  assert.deepStrictEqual(ids(), ["a", "d"]); // easier words get their turn
  uses.set("a", 1); uses.set("d", 1);
  assert.deepStrictEqual(ids(), ["b", "c"]); // full round done - hardest again

  // Same number of wrongs: the lower box wins.
  const tie = pickParagraphWords([{ id: "x" }, { id: "y" }], 1, {
    wrongs: new Map([["x", 2], ["y", 2]]), box: new Map([["x", 5], ["y", 1]]), uses: new Map(),
  });
  assert.strictEqual(tie[0].id, "y");
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

// --- generateParagraph: empty model setting falls back to DEFAULT_MODEL ---
{
  await saveSettings({ openrouter_api_key: "sk-or-test", openrouter_model: "" });
  globalThis.location = { origin: "http://test" };
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = { auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: " Ein **Test**. " } }] }) };
  };

  const { paragraph, words } = await generateParagraph(2);
  assert.strictEqual(sent.body.model, DEFAULT_MODEL);
  assert.strictEqual(DEFAULT_MODEL, "deepseek/deepseek-v4.1-flash");
  assert.strictEqual(sent.auth, "Bearer sk-or-test");
  assert.strictEqual(paragraph, "Ein **Test**.");
  assert.strictEqual(words.length, 2);
  // Each word used in a delivered paragraph is counted for the rotation.
  assert.deepStrictEqual((await get("meta", "paragraphUses")).counts, { w1: 1, w2: 1 });
}

// --- generateParagraph: missing key gives a clear error, no request sent ---
{
  await saveSettings({ openrouter_api_key: "" });
  let called = false;
  globalThis.fetch = async () => { called = true; };
  await assert.rejects(() => generateParagraph(2), /API anahtarını gir/);
  assert.strictEqual(called, false);
}

// --- generateParagraph: a 401 forgets the stored key so it can be re-entered ---
{
  await saveSettings({ openrouter_api_key: "sk-or-wrong" });
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "" });
  await assert.rejects(() => generateParagraph(2), (err) => err.invalidKey === true);
  assert.strictEqual((await loadSettings()).openrouter_api_key, "");
  // A failed request doesn't count as a use.
  assert.deepStrictEqual((await get("meta", "paragraphUses")).counts, { w1: 1, w2: 1 });
}

console.log("test_paragraph_mode.js: all assertions passed");
