import type { WorkingStyle } from "./working-style.js";

/**
 * Who the executive is, as far as the chief of staff needs to know: a name, a working style,
 * the goals that work should serve, and the boundaries the assistant must respect.
 */
export interface Profile {
  readonly name?: string;
  readonly style?: WorkingStyle;
  readonly goals: readonly string[];
  readonly boundaries: readonly string[];
  /** Set once the first-run journey is complete (or skipped). */
  readonly onboardedAt?: Date;
}

export function emptyProfile(): Profile {
  return { goals: [], boundaries: [] };
}

export interface ProfilePatch {
  readonly name?: string | null; // null clears
  readonly style?: WorkingStyle | null;
  readonly goals?: readonly string[];
  readonly boundaries?: readonly string[];
  readonly onboardedAt?: Date | null;
}

export function applyProfilePatch(profile: Profile, patch: ProfilePatch): Profile {
  const next: { -readonly [K in keyof Profile]: Profile[K] } = { ...profile };
  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (name) next.name = name;
    else delete next.name;
  }
  if (patch.style !== undefined) {
    if (patch.style) next.style = patch.style;
    else delete next.style;
  }
  if (patch.goals !== undefined) next.goals = clean(patch.goals);
  if (patch.boundaries !== undefined) next.boundaries = clean(patch.boundaries);
  if (patch.onboardedAt !== undefined) {
    if (patch.onboardedAt) next.onboardedAt = patch.onboardedAt;
    else delete next.onboardedAt;
  }
  return next;
}

function clean(lines: readonly string[]): string[] {
  return [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
}

/** The profile as a few sentences for the assistant's context. Empty string when there is nothing to say. */
export function describeProfile(profile: Profile): string {
  const out: string[] = [];
  if (profile.name) out.push(`The executive's name is ${profile.name}.`);
  if (profile.style) out.push(`Working style: ${profile.style.name}. ${profile.style.summary} Shape plans and reports accordingly: ${profile.style.adaptations.join(" ")}`);
  if (profile.goals.length) out.push(`Goals the work should serve: ${profile.goals.map((g) => `"${g}"`).join("; ")}.`);
  if (profile.boundaries.length) out.push(`Boundaries to respect, never suggest crossing them: ${profile.boundaries.map((b) => `"${b}"`).join("; ")}.`);
  return out.join("\n");
}
