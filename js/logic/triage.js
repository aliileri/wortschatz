// Two-way triage flow: known / unknown.

/** @returns {{status: "known"|"learning", startingBox: number|null}} */
export function resolveTriageChoice(choice) {
  if (choice === "known") return { status: "known", startingBox: null };
  return { status: "learning", startingBox: 1 };
}
