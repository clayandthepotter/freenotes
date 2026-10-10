import { useRef, useState } from "react";
import type { Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import { TodoCard } from "../ui/TodoCard.js";
import type { Route } from "../ui/router.js";

const HINTS: Array<[string, string]> = [
  ["by Friday", " by Friday"],
  ["due Oct 20", " due Oct 20"],
  ["~2h", " ~2h"],
  ["[high]", " [high]"],
  ["!low", " !low"],
];

export function Capture({ state, workspace, navigate }: { state: FreenotesState; workspace: Workspace; navigate: (r: Route) => void }) {
  const [text, setText] = useState("");
  const [refine, setRefine] = useState(true);
  const [captured, setCaptured] = useState<string[]>();
  const area = useRef<HTMLTextAreaElement>(null);
  const statusOf = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;

  const insert = (token: string) => {
    const el = area.current;
    if (!el) return setText((t) => t + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const capture = async () => {
    const out = await state.run("Capturing…", (app) => app.braindump({ text, refine }));
    if (out) {
      setText("");
      setCaptured(out.todos.map((t) => t.id));
    }
  };

  return (
    <div className="stack-lg">
      <div className="stack">
        <textarea
          ref={area}
          className="mono-input"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"One thing per line.\n- Finish Q4 budget deck by Friday ~2h\n- [high] Call the dentist\n- Write launch post due Oct 20"}
          autoCapitalize="sentences"
        />
        <div className="chips" aria-label="Insert a hint">
          {HINTS.map(([label, token]) => (
            <button key={label} className="chip outline" onClick={() => insert(token)}>
              + {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} />
          Let the chief of staff estimate and prioritise
        </label>
        <div className="sticky-action">
          <button className="btn primary block" disabled={!text.trim() || !!state.busy || !state.app} onClick={capture}>
            Capture {text.split("\n").filter((l) => l.trim()).length || ""} {text.trim() ? "items" : ""}
          </button>
        </div>
      </div>

      {captured && captured.length > 0 && (
        <div className="card accent stack">
          <h3>Captured {captured.length} todo{captured.length === 1 ? "" : "s"}</h3>
          <p className="muted small">Next, put them on the calendar.</p>
          <button className="btn primary" onClick={() => navigate({ tab: "today" })}>
            Go to Today
          </button>
        </div>
      )}

      {workspace.todos.length > 0 && (
        <div className="stack">
          <div className="section-title">
            <h2>All todos</h2>
            <span className="muted small">{workspace.todos.length}</span>
          </div>
          <div className="todo-list">
            {[...workspace.todos].reverse().map((t) => (
              <TodoCard key={t.id} todo={t} status={statusOf(t.id)} planned={Boolean(workspace.plans[t.id])} onClick={() => navigate({ tab: "plan", id: t.id })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
