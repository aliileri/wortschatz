import "fake-indexeddb/auto";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clear, getAll, get, STORE_NAMES } from "../js/data/db.js";
import { importWords } from "../js/data/importWords.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures_sample_wortschatz.json");
const sampleData = JSON.parse(readFileSync(fixturePath, "utf-8"));

async function reset() {
  for (const s of STORE_NAMES) await clear(s);
}

// creates words and user words, all "new"
await reset();
{
  const result = await importWords(sampleData);
  assert.strictEqual(result.added, 8);
  assert.strictEqual(result.updated, 0);
  assert.strictEqual(result.unchanged, 0);

  const words = await getAll("words");
  const userWords = await getAll("userWords");
  assert.strictEqual(words.length, 8);
  assert.strictEqual(userWords.length, 8);
  assert.ok(userWords.every((uw) => uw.status === "new"));

  const bewerbung = words.find((w) => w.wort === "Bewerbung" && w.rektion === "");
  assert.strictEqual(bewerbung.artikel, "die");
  assert.strictEqual(bewerbung.plural, "-en");
  assert.strictEqual(bewerbung.wortart, "Nomen");
  assert.strictEqual(bewerbung.tr, "başvuru");
}

// idempotent re-import
{
  const result = await importWords(sampleData);
  const words = await getAll("words");
  assert.strictEqual(words.length, 8);
  assert.strictEqual(result.added, 0);
  assert.strictEqual(result.updated, 0);
  assert.strictEqual(result.unchanged, 8);
}

// does not disturb existing progress when ids shift and a field changes
{
  const { put } = await import("../js/data/db.js");
  const bewerbungBefore = (await getAll("userWords")).find(async () => true);
  const words = await getAll("words");
  const bw = words.find((w) => w.wort === "Bewerbung");
  const uw = await get("userWords", bw.id);
  uw.status = "learning";
  await put("userWords", uw);

  const shifted = JSON.parse(JSON.stringify(sampleData));
  for (const entry of shifted.woerter) entry.id += 1000;
  shifted.woerter[0].tr = "başvuru (güncellendi)";

  const result = await importWords(shifted);
  const wordsAfter = await getAll("words");
  assert.strictEqual(wordsAfter.length, 8); // no duplicates

  const uwAfter = await get("userWords", bw.id);
  assert.strictEqual(uwAfter.status, "learning"); // progress untouched

  const bwAfter = await get("words", bw.id);
  assert.strictEqual(bwAfter.tr, "başvuru (güncellendi)");
  assert.strictEqual(bwAfter.source_id, 1001);
  assert.ok(result.updated >= 1);
}

// matches by wort+rektion, not id
await reset();
{
  await importWords(sampleData);
  const words = await getAll("words");
  const verfuegen = words.filter((w) => w.wort === "verfügen");
  assert.strictEqual(verfuegen.length, 1);
  assert.strictEqual(verfuegen[0].rektion, "über + A");
}

console.log("test_import_words.js: all assertions passed");
