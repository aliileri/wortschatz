// A card the user has never once gotten right after enough attempts is
// wasting review slots - stop surfacing it and set it aside for a future
// dedicated "kara kutu" mode instead.

export const BLACK_BOX_THRESHOLD = 10;

export function isBlackBox(shownCount, correctCount) {
  return shownCount >= BLACK_BOX_THRESHOLD && correctCount === 0;
}
