// Cloze (fill-in-the-blank) generation from a word's example sentence.
// The target word may appear inflected in `beispiel` ("Bewerbung" ->
// "meine Bewerbung", "verfuegen" -> "verfuegt"), so exact-string matching
// isn't enough. We match by stem instead; if no token in the sentence shares
// the word's stem, generation fails and the caller falls back to a
// `production` question.

const STEM_LEN = 5;

const SEPARABLE_PREFIXES = [
  "ab", "an", "auf", "aus", "bei", "durch", "ein", "mit", "nach",
  "vor", "zu", "zurück", "zusammen", "los", "her", "hin", "weg",
].sort((a, b) => b.length - a.length);

const WORD_RE = /[A-Za-zÄÖÜäöüß]+/g;

function stripSeparablePrefix(word) {
  const lower = word.toLowerCase();
  for (const prefix of SEPARABLE_PREFIXES) {
    if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
      return lower.slice(prefix.length);
    }
  }
  return lower;
}

export function wordStem(wort) {
  const firstToken = wort.split(/\s+/).filter(Boolean)[0] || wort;
  const stripped = stripSeparablePrefix(firstToken);
  return stripped.slice(0, STEM_LEN).toLowerCase();
}

function stemsMatch(rootA, rootB) {
  const n = Math.min(rootA.length, rootB.length, STEM_LEN);
  if (n < 3) return Boolean(rootA) && rootA === rootB;
  return rootA.slice(0, n) === rootB.slice(0, n);
}

/** Returns [start, end] span, or null if no match. */
export function findTargetSpan(beispiel, wort) {
  const firstToken = wort.split(/\s+/).filter(Boolean)[0] || wort;
  const root = stripSeparablePrefix(firstToken);
  if (!root) return null;

  WORD_RE.lastIndex = 0;
  let match;
  while ((match = WORD_RE.exec(beispiel)) !== null) {
    const tokenRoot = stripSeparablePrefix(match[0]);
    if (stemsMatch(root, tokenRoot)) {
      return [match.index, match.index + match[0].length];
    }
  }
  return null;
}

export function generateCloze(word) {
  if (!word.beispiel) return null;
  const span = findTargetSpan(word.beispiel, word.wort);
  if (span === null) return null;
  const [start, end] = span;
  return `${word.beispiel.slice(0, start)}____${word.beispiel.slice(end)}`;
}

/** List every word for which cloze generation currently fails, with a reason. */
export function clozeGenerationReport(words) {
  const failures = [];
  for (const word of words) {
    if (!word.beispiel) {
      failures.push({ id: word.id, wort: word.wort, beispiel: word.beispiel, reason: "no beispiel" });
      continue;
    }
    if (generateCloze(word) === null) {
      failures.push({ id: word.id, wort: word.wort, beispiel: word.beispiel, reason: "no stem match in beispiel" });
    }
  }
  return failures;
}
