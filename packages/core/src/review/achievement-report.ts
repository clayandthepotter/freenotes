import { DomainError } from "../shared/result.js";
import type { TodoId } from "../planning/todo.js";

export type Significance = "major" | "solid" | "minor";

export interface Achievement {
  readonly todoId: TodoId;
  readonly title: string;
  /** One or two sentences, written for the executive, past tense. */
  readonly summary: string;
  readonly significance: Significance;
  /** null when the todo had no deadline. */
  readonly onTime: boolean | null;
}

export interface Improvement {
  readonly theme: string; // "Estimation", "Focus", "Dependencies", …
  readonly observation: string; // what the evidence shows
  readonly suggestion: string; // one concrete thing to try next cycle
  readonly relatedTodoIds: readonly TodoId[];
}

export interface Reflection {
  readonly todoId: TodoId;
  readonly question: string;
}

/**
 * The chief of staff's debrief: achievements in order of significance, then areas to improve,
 * then one reflection question per completed todo.
 */
export interface AchievementReport {
  readonly headline: string;
  readonly achievements: readonly Achievement[];
  readonly improvements: readonly Improvement[];
  readonly reflections: readonly Reflection[];
  readonly source: "assistant" | "heuristic";
}

export interface ReflectionAnswer {
  readonly todoId: TodoId;
  readonly question: string;
  readonly answer: string;
  readonly answeredAt: Date;
}

const SIGNIFICANCE_RANK: Record<Significance, number> = { major: 0, solid: 1, minor: 2 };

export function validateAchievementReport(report: AchievementReport, completedTodoIds: readonly TodoId[]): AchievementReport {
  if (!report.headline.trim()) throw new DomainError("invalid-report", "Report needs a headline");
  const completed = new Set(completedTodoIds);
  const asked = new Set(report.reflections.map((r) => r.todoId));
  for (const id of completed) {
    if (!asked.has(id)) throw new DomainError("invalid-report", `Missing reflection question for completed todo ${id}`);
  }
  for (const r of report.reflections) {
    if (!r.question.trim().endsWith("?")) throw new DomainError("invalid-report", `Reflection for ${r.todoId} is not a question`);
  }
  return report;
}

/** Orders achievements by significance, then on-time deliveries first. */
export function orderAchievements(achievements: readonly Achievement[]): Achievement[] {
  return [...achievements].sort(
    (a, b) =>
      SIGNIFICANCE_RANK[a.significance] - SIGNIFICANCE_RANK[b.significance] ||
      Number(b.onTime === true) - Number(a.onTime === true),
  );
}
