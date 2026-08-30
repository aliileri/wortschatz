// Answer comparison for production/cloze questions: case-insensitive,
// umlaut-tolerant (ue/ae/oe/ss accepted for u+diaeresis/o+diaeresis/a+diaeresis/sharp-s),
// punctuation-only differences ignored. Near misses are flagged "almost" so
// the caller can let the user have the final say.

const UMLAUT_MAP = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
const PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g;

export function normalize(text) {
  let t = (text || "").trim().toLowerCase();
  t = t.replace(PUNCTUATION_RE, "");
  t = t.replace(/\s+/g, " ").trim();
  for (const [umlaut, digraph] of Object.entries(UMLAUT_MAP)) {
    t = t.split(umlaut).join(digraph);
  }
  return t;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const substituteCost = previousRow[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }
  return previousRow[previousRow.length - 1];
}

function almostThreshold(normalizedExpected) {
  return normalizedExpected.length <= 6 ? 1 : 2;
}

/** Returns "correct" | "almost" | "wrong". */
export function compare(expected, actual) {
  const normExpected = normalize(expected);
  const normActual = normalize(actual);

  if (normExpected === normActual) return "correct";

  const distance = levenshtein(normExpected, normActual);
  if (distance <= almostThreshold(normExpected)) return "almost";

  return "wrong";
}
