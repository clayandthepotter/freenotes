import type { ExternalIssue } from "../issues/issue.js";

/** Reads the issues assigned to the signed-in person from an external tracker. */
export interface IssueSource {
  readonly name: string;
  /** Open and recently closed issues assigned to me, so completed work can close its todo. */
  assignedToMe(): Promise<readonly ExternalIssue[]>;
}
