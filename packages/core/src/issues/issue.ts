import type { LocalDate } from "../shared/local-date.js";

/**
 * An issue in an external tracker the executive is responsible for. Linear first; the shape is
 * tracker-neutral so GitHub, Jira and friends can feed the same import.
 */
export interface ExternalIssue {
  readonly source: "linear";
  readonly id: string; // the tracker's stable id
  readonly identifier: string; // human code, e.g. "ENG-142"
  readonly title: string;
  readonly url: string;
  readonly state: "todo" | "in-progress" | "done" | "cancelled";
  readonly dueDate?: LocalDate;
  /** Tracker estimate in points, if the team uses them. */
  readonly estimatePoints?: number;
  /** 0 none, 1 urgent, 2 high, 3 normal, 4 low (Linear's scale). */
  readonly priority: 0 | 1 | 2 | 3 | 4;
  readonly project?: string;
}

/** Where a todo came from, so re-imports update instead of duplicating. */
export interface ExternalLink {
  readonly source: "linear";
  readonly id: string;
  readonly identifier: string;
  readonly url: string;
}
