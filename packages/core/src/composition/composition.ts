import { DomainError } from "../shared/result.js";
import type { TodoId } from "../planning/todo.js";

/**
 * A composition is what freenotes calls a note. Every artefact in the chief-of-staff loop
 * is a composition so the executive can read, search and edit it like any other note.
 */
export type CompositionKind =
  | "note"
  | "braindump"
  | "schedule"
  | "execution-plan"
  | "results"
  | "achievement-report";

export interface Composition {
  readonly id: string;
  readonly kind: CompositionKind;
  readonly title: string;
  /** Markdown. */
  readonly body: string;
  readonly createdAt: Date;
  readonly todoIds: readonly TodoId[];
}

export interface CompositionDraft {
  kind: CompositionKind;
  title: string;
  body: string;
  todoIds?: readonly TodoId[];
}

export function createComposition(id: string, createdAt: Date, draft: CompositionDraft): Composition {
  const title = draft.title.trim();
  if (!title) throw new DomainError("empty-title", "A composition needs a title");
  return { id, kind: draft.kind, title, body: draft.body, createdAt, todoIds: [...(draft.todoIds ?? [])] };
}
