import { useState } from "react";
import { formatDeadline, formatMinutes, type ResultStatus, type Todo } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { Sheet } from "./Shell.js";

const OPTIONS: Array<{ status: ResultStatus; label: string; hint: string }> = [
  { status: "done", label: "Done", hint: "finished, nothing left" },
  { status: "partial", label: "Partial", hint: "progressed, not finished" },
  { status: "blocked", label: "Blocked", hint: "waiting on someone or something" },
  { status: "skipped", label: "Skipped", hint: "deliberately not doing it" },
];

/** One-tap outcome recording for a todo. Writes a results line the review step will pick up. */
export function StatusSheet({ todo, state, onClose, onOpenPlan }: { todo: Todo | undefined; state: FreenotesState; onClose: () => void; onOpenPlan?: (id: string) => void }) {
  const current = todo ? state.workspace?.results.find((r) => r.todoId === todo.id) : undefined;
  const [status, setStatus] = useState<ResultStatus | undefined>(current?.status);
  const [notes, setNotes] = useState(current?.notes ?? "");
  if (!todo) return null;
  const plan = state.workspace?.plans[todo.id];
  return (
    <Sheet open onClose={onClose} title={todo.title}>
      <div className="stack">
        <p className="muted small">
          {todo.id} · {todo.priority} priority · {formatMinutes(todo.estimatedMinutes)}{todo.deadline ? ` · due ${formatDeadline(todo)}` : ""}
        </p>
        <div className="option-grid">
          {OPTIONS.map((o) => (
            <button key={o.status} className={`option ${status === o.status ? "on" : ""}`} onClick={() => setStatus(o.status)}>
              {o.label}
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
        <label className="field">
          What happened (optional)
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="One line is enough. It feeds your achievement report." />
        </label>
        <div className="btn-row">
          {onOpenPlan && (
            <button
              className="btn outline"
              onClick={() => {
                onClose();
                onOpenPlan(todo.id);
              }}
            >
              {plan ? "Open plan" : "Plan it"}
            </button>
          )}
          <button
            className="btn primary"
            disabled={!status || !!state.busy}
            onClick={async () => {
              if (!status) return;
              await state.run("Recording…", (app) => app.recordOne(todo.id, status, notes));
              onClose();
            }}
          >
            Save outcome
          </button>
        </div>
      </div>
    </Sheet>
  );
}
