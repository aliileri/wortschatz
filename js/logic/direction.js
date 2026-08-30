// Progressive direction unlock: tr_de opens once de_tr reaches box 3.
// Word becomes mastered only once both directions have graduated.

export const UNLOCK_AT_BOX = 3;

export function shouldUnlockTrDe(card, siblingCards) {
  if (card.direction !== "de_tr" || card.box !== UNLOCK_AT_BOX) return false;
  return !siblingCards.some((c) => c.direction === "tr_de");
}

export function isMastered(siblingCards) {
  const directions = new Set(siblingCards.map((c) => c.direction));
  if (!directions.has("de_tr") || !directions.has("tr_de")) return false;
  return siblingCards
    .filter((c) => c.direction === "de_tr" || c.direction === "tr_de")
    .every((c) => c.is_graduated);
}
