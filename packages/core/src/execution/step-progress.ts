import type { TodoId } from "../planning/todo.js";
import type { ExecutionStep } from "./execution-plan.js";

/**
 * What the executive did with one step of an execution plan: ticked it off, and whatever they
 * wrote while doing it. Steps that ask for a sentence, a list or a decision are answered here,
 * inside the app, so nothing has to be written down somewhere else.
 */
export interface StepProgress {
  readonly todoId: TodoId;
  readonly step: number; // ExecutionStep.order, 1-based
  readonly done: boolean;
  readonly note: string; // "" when nothing was written
  readonly updatedAt: Date;
}

export interface StepProgressPatch {
  readonly todoId: TodoId;
  readonly step: number;
  readonly done?: boolean;
  readonly note?: string;
}

/** Upserts one step's progress. A record that is neither done nor annotated is dropped rather than kept empty. */
export function updateStepProgress(all: readonly StepProgress[], patch: StepProgressPatch, now: Date): StepProgress[] {
  const existing = all.find((p) => p.todoId === patch.todoId && p.step === patch.step);
  const rest = all.filter((p) => !(p.todoId === patch.todoId && p.step === patch.step));
  const note = (patch.note ?? existing?.note ?? "").replace(/\s+$/u, "");
  const done = patch.done ?? existing?.done ?? false;
  if (!done && note === "") return rest;
  return [...rest, { todoId: patch.todoId, step: patch.step, done, note, updatedAt: now }];
}

export function progressFor(all: readonly StepProgress[], todoId: TodoId): StepProgress[] {
  return all.filter((p) => p.todoId === todoId).sort((a, b) => a.step - b.step);
}

const WRITING = /\b(write|draft|list|clarify|define|describe|outline|decide|name|note|jot|summari[sz]e|answer|capture|spell out|one sentence|one line|in writing)\b/iu;

/** True when a step's natural output is text, so the UI should open an inline place to write it. */
export function stepWantsWriting(step: ExecutionStep): boolean {
  return WRITING.test(step.action) || (step.detail !== undefined && WRITING.test(step.detail));
}
