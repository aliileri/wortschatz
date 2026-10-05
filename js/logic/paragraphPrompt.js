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
    "Bu kelimelerin her birini metinde geçtiği yerde, çekimli haliyle birlikte **kelime** şeklinde çift yıldızla işaretle. Bunun dışında hiçbir şeyi işaretleme, başka biçimlendirme kullanma.",
    "Sadece paragrafın kendisini yaz - başlık, çeviri veya ek açıklama ekleme.",
  ].join("\n");
}

/** Turns the model's **word** markers into <strong> tags. Expects text that
 * is already HTML-escaped, so only these tags end up as real markup. */
export function boldTargetWords(escapedText) {
  return escapedText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
