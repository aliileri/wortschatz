// Orchestration for "paragraph mode": pulls the eligible word pool from
// IndexedDB, then calls OpenRouter (the user's own account/key, entered in
// Settings) to turn them into a B2 German practice paragraph. Like the rest
// of the app, the API key never leaves the device except to OpenRouter itself.
import { getAll } from "./db.js";
import { loadSettings } from "./settings.js";
import { pickRandomWords, buildParagraphPrompt } from "../logic/paragraphPrompt.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Used whenever no model is set in Settings, so only the key ever has to be entered.
export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

/** Words that have entered the box system in either direction ("kutu 1'den
 * itibaren") - excludes untriaged "new" and never-boxed "known" words. */
export async function eligibleParagraphWords() {
  const cards = await getAll("reviewCards");
  const wordIds = [...new Set(cards.map((c) => c.wordId))];
  if (!wordIds.length) return [];
  const words = await getAll("words");
  const byId = new Map(words.map((w) => [w.id, w]));
  return wordIds.map((id) => byId.get(id)).filter(Boolean);
}

async function callOpenRouter(prompt, apiKey, model) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": location.origin,
      "X-Title": "Wortschatz",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter isteği başarısız (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("OpenRouter yanıtı boş döndü.");
  return content.trim();
}

/** @returns {Promise<{paragraph: string, words: object[]}>} */
export async function generateParagraph(wordCount) {
  const settings = await loadSettings();
  if (!settings.openrouter_api_key) throw new Error("Önce OpenRouter API anahtarını gir.");
  const model = settings.openrouter_model || DEFAULT_MODEL;

  const pool = await eligibleParagraphWords();
  if (pool.length < wordCount) {
    throw new Error(`Havuzda yeterli kelime yok (${pool.length}/${wordCount}). Önce birkaç kelime öğrenmeye başla.`);
  }

  const words = pickRandomWords(pool, wordCount);
  const prompt = buildParagraphPrompt(words, wordCount);
  const paragraph = await callOpenRouter(prompt, settings.openrouter_api_key, model);
  return { paragraph, words };
}
