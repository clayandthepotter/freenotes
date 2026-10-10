/**
 * How the executive likes to work, inferred from eight quick choices. Four schools:
 *   triage  — urgent vs important, decide now, drop the rest
 *   capture — get everything out of your head, define next actions, keep an empty inbox
 *   improve — measure what happened, adjust the process, run experiments
 *   align   — start from values, roles and goals; ask whether the work serves them
 * The brief, the attention ranking and the assistant's prompts read the result.
 */
export type StyleDimension = "triage" | "capture" | "improve" | "align";

export const STYLE_DIMENSIONS: readonly StyleDimension[] = ["triage", "capture", "improve", "align"];

export interface QuizOption {
  readonly label: string;
  readonly dimension: StyleDimension;
}

export interface QuizQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly QuizOption[]; // exactly one per dimension, in varied order
}

export const WORKING_STYLE_QUIZ: readonly QuizQuestion[] = [
  {
    id: "wake",
    prompt: "Your first thought about work in the morning is usually:",
    options: [
      { label: "What is on fire today?", dimension: "triage" },
      { label: "What did I capture yesterday that needs a next action?", dimension: "capture" },
      { label: "What did last week's numbers say I should change?", dimension: "improve" },
      { label: "What would make today matter?", dimension: "align" },
    ],
  },
  {
    id: "new-ask",
    prompt: "When something new lands on your plate, your instinct is to:",
    options: [
      { label: "Write it down so it stops taking up space in my head", dimension: "capture" },
      { label: "Ask whether it serves what I am really here to do", dimension: "align" },
      { label: "Rank it against everything else that is urgent", dimension: "triage" },
      { label: "Estimate it and see what the data says about the last one like it", dimension: "improve" },
    ],
  },
  {
    id: "ideal-list",
    prompt: "Your ideal task list is:",
    options: [
      { label: "Short. Only what truly cannot wait", dimension: "triage" },
      { label: "Complete. Every commitment, with a next action", dimension: "capture" },
      { label: "Instrumented. Estimates, actuals, trends", dimension: "improve" },
      { label: "Grouped by the roles and goals each task serves", dimension: "align" },
    ],
  },
  {
    id: "overwhelmed",
    prompt: "When you feel overwhelmed, your recovery strategy is:",
    options: [
      { label: "Ruthlessly prioritise. Drop everything not critical", dimension: "triage" },
      { label: "Do a full brain dump, then process and organise", dimension: "capture" },
      { label: "Step back, measure what is working, adjust the process", dimension: "improve" },
      { label: "Reconnect with my values. Am I on the right path?", dimension: "align" },
    ],
  },
  {
    id: "productive-week",
    prompt: "You measure a productive week by:",
    options: [
      { label: "How many urgent crises I prevented or handled", dimension: "triage" },
      { label: "An empty inbox and all next actions defined", dimension: "capture" },
      { label: "Measurable improvement over last week", dimension: "improve" },
      { label: "Progress on what I identified as most important", dimension: "align" },
    ],
  },
  {
    id: "challenge",
    prompt: "Your biggest productivity challenge is:",
    options: [
      { label: "Everything feels urgent. I cannot tell what really matters", dimension: "triage" },
      { label: "Too many loose ends. I forget commitments", dimension: "capture" },
      { label: "I keep making the same mistakes. No feedback loop", dimension: "improve" },
      { label: "Busy, but not advancing my real goals", dimension: "align" },
    ],
  },
  {
    id: "meetings",
    prompt: "In meetings, you tend to:",
    options: [
      { label: "Focus on what decisions are needed now vs. later", dimension: "triage" },
      { label: "Capture every action item and assign next actions", dimension: "capture" },
      { label: "Review what we planned, what happened, what to adjust", dimension: "improve" },
      { label: "Ask whether this meeting serves our core objectives", dimension: "align" },
    ],
  },
  {
    id: "ritual",
    prompt: "Your dream daily planning ritual is:",
    options: [
      { label: "Quick triage: what is urgent today, what can wait?", dimension: "triage" },
      { label: "Review all projects, pick next actions by context and energy", dimension: "capture" },
      { label: "Check metrics, plan experiments, schedule reviews", dimension: "improve" },
      { label: "Align today's tasks with my weekly roles and goals", dimension: "align" },
    ],
  },
];

export interface WorkingStyle {
  readonly name: string;
  readonly summary: string;
  readonly primary: StyleDimension;
  readonly secondary?: StyleDimension;
  readonly scores: Readonly<Record<StyleDimension, number>>;
  /** How freenotes adapts, in the user's language. Shown on the result screen and in Settings. */
  readonly adaptations: readonly string[];
}

/** Answers keyed by question id, value = chosen option index. Unanswered questions are ignored. */
export type QuizAnswers = Readonly<Record<string, number>>;

const NAMES: Record<StyleDimension, { name: string; summary: string }> = {
  triage: { name: "Triage First", summary: "You sort by urgency and importance, decide fast, and let the rest wait." },
  capture: { name: "Capture Everything", summary: "You get it all out of your head, define next actions, and trust the system." },
  improve: { name: "Measure and Adjust", summary: "You look at what happened, find the pattern, and change the process." },
  align: { name: "Values Led", summary: "You start from what matters and ask whether the work serves it." },
};

const ADAPTATIONS: Record<StyleDimension, readonly string[]> = {
  triage: ["Your brief leads with deadlines at risk and what is due today.", "Plans open with the one decision that unblocks the rest."],
  capture: ["Your brief leads with anything unplanned or unrecorded, so nothing slips.", "Plans list every input and hand-off before the work starts."],
  improve: ["Your brief leads with outcomes waiting for review.", "Achievement reports lean on estimates versus actuals and name one process change."],
  align: ["Your brief leads with the work that serves your goals, and flags what does not.", "Reflection questions ask what the work was for, not just how it went."],
};

export function scoreWorkingStyle(answers: QuizAnswers, quiz: readonly QuizQuestion[] = WORKING_STYLE_QUIZ): WorkingStyle {
  const scores: Record<StyleDimension, number> = { triage: 0, capture: 0, improve: 0, align: 0 };
  let answered = 0;
  for (const q of quiz) {
    const choice = answers[q.id];
    const option = choice === undefined ? undefined : q.options[choice];
    if (!option) continue;
    scores[option.dimension] += 1;
    answered += 1;
  }
  const ranked = [...STYLE_DIMENSIONS].sort((a, b) => scores[b] - scores[a] || STYLE_DIMENSIONS.indexOf(a) - STYLE_DIMENSIONS.indexOf(b));
  const primary = ranked[0]!;
  const second = ranked[1]!;
  const top = scores[primary];
  const secondary = scores[second] > 0 && scores[second] >= top - 1 ? second : undefined;

  if (answered === 0 || top / answered < 0.5) {
    return {
      name: "Balanced Hybrid",
      summary: "You draw from several productivity schools and switch between them as the week demands.",
      primary,
      ...(secondary ? { secondary } : {}),
      scores,
      adaptations: ["Your brief balances immediate triage with longer-term alignment.", "Plans and reports mix urgency, completeness and a measurable next step."],
    };
  }
  if (secondary && scores[secondary] === top) {
    return {
      name: `${NAMES[primary].name} / ${NAMES[secondary].name}`,
      summary: `${NAMES[primary].summary} ${NAMES[secondary].summary}`,
      primary,
      secondary,
      scores,
      adaptations: [ADAPTATIONS[primary][0]!, ADAPTATIONS[secondary][1]!],
    };
  }
  return { ...NAMES[primary], primary, ...(secondary ? { secondary } : {}), scores, adaptations: ADAPTATIONS[primary] };
}
