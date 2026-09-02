// One-off: fill `beispiel_tr` (Turkish translation of each German example
// sentence) in data/words.json using the Claude API. Safe to re-run - only
// untranslated entries are sent.
//
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/translate_beispiele.mjs
//   ... node scripts/translate_beispiele.mjs --limit 20   # try a small batch
//
// After it finishes: bump `version` in data/words.json (or use the "JSON'u
// yeniden içe aktar" button in the app's Settings) so installs pick it up.

import { readFile, writeFile } from "node:fs/promises";

const MODEL = "claude-opus-5";
const BATCH = 40;
const PATH = new URL("../data/words.json", import.meta.url);

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

const SYSTEM =
  "Sen Almanca-Türkçe çevirmensin. Sana numaralı Almanca örnek cümleler " +
  "verilecek. Her birini doğal, akıcı Türkçeye çevir. Yalnızca şu biçimde " +
  'geçerli bir JSON nesnesi döndür: {"1": "...", "2": "..."} - anahtar cümle ' +
  "numarası, değer Türkçe çeviri. Başka hiçbir şey yazma.";

async function translateBatch(sentences) {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: numbered }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1));
}

const doc = JSON.parse(await readFile(PATH, "utf8"));
const pending = doc.woerter.filter((w) => w.beispiel && !w.beispiel_tr).slice(0, LIMIT);

if (pending.length === 0) {
  console.log("Nothing to translate.");
  process.exit(0);
}

console.log(`Translating ${pending.length} sentences in batches of ${BATCH}...`);
let done = 0;
for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const map = await translateBatch(batch.map((w) => w.beispiel));
  batch.forEach((w, idx) => {
    const tr = map[String(idx + 1)];
    if (tr) {
      w.beispiel_tr = tr.trim();
      done++;
    }
  });
  await writeFile(PATH, JSON.stringify(doc, null, 1) + "\n", "utf8");
  console.log(`  ${done}/${pending.length}`);
}

console.log(`Done. Translated ${done} sentences into data/words.json.`);
console.log("Remember to bump `version` in data/words.json so installs re-import.");
