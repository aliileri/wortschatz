// A word answered wrong this many times in review is set aside in the
// "Zor kelimeler" box: it is no longer asked, but paragraph mode keeps using
// it (hardest words first). Counted per word, across both directions.

export const HARD_WORD_THRESHOLD = 10;

export function isHardWord(wrongCount) {
  return wrongCount >= HARD_WORD_THRESHOLD;
}
