// Pure helpers for "paragraph mode": pick a random sample of words the
// learner has already started studying, and phrase the generation prompt.

export function pickRandomWords(words, count) {
  const arr = words.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

export function buildParagraphPrompt(words, wordCount) {
  const list = words.map((w) => w.anzeige || w.wort).join(", ");
  return [
    "Sen bir Almanca öğretmenisin. B2 seviyesinde, akıcı ve doğal bir Almanca paragraf yaz.",
    `Paragraf şu ${wordCount} Almanca kelimenin/ifadenin hepsini doğal bir şekilde, uygun çekimlerle içermeli: ${list}.`,
    "Sadece paragrafın kendisini yaz - başlık, çeviri veya ek açıklama ekleme.",
  ].join("\n");
}
