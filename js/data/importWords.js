// Idempotent import of the word pool, straight from the original
// wortschatz_*.json shape ({ woerter: [...] }) - the same file format the
// "re-import" button in Settings lets the user re-upload later.
//
// Matches by the natural key (wort, rektion), not the JSON's `id`: that list
// will grow over time and ids can shift, but the user's progress must not.
import { get, put } from "./db.js";

// JSON field name -> stored field name (mirrors vocab.management.commands.import_wortschatz).
const COPIED_FIELDS = {
  quelle: "quelle", thema: "thema", anzeige: "anzeige", artikel: "artikel",
  plural: "plural", wortart: "wortart", tr: "tr", beispiel: "beispiel",
  beispiel_tr: "beispiel_tr", niveau: "niveau",
};

function naturalKey(wort, rektion) {
  return `${wort}␟${rektion}`;
}

export async function importWords(payload) {
  const entries = payload.woerter;
  if (!Array.isArray(entries)) {
    throw new Error("JSON dosyasında 'woerter' listesi yok");
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const warnings = [];

  for (const entry of entries) {
    const wort = (entry.wort || "").trim();
    if (!wort) {
      warnings.push(`Skipped entry with missing 'wort': ${JSON.stringify(entry)}`);
      continue;
    }
    const rektion = entry.rektion || "";
    const id = naturalKey(wort, rektion);

    const fieldValues = {};
    for (const [jsonField, storedField] of Object.entries(COPIED_FIELDS)) {
      fieldValues[storedField] = entry[jsonField] || "";
    }
    fieldValues.source_id = entry.id || 0;

    const existing = await get("words", id);
    if (!existing) {
      const word = { id, wort, rektion, ...fieldValues };
      await put("words", word);
      await put("userWords", {
        wordId: id,
        status: "new",
        triaged_at: null,
        known_confirmed_at: null,
        known_check_count: 0,
      });
      added += 1;
      continue;
    }

    let changed = false;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (existing[field] !== value) changed = true;
    }
    if (changed) {
      await put("words", { ...existing, ...fieldValues });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { added, updated, unchanged, warnings };
}
