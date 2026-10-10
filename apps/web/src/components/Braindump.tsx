import { useState } from "react";
import { formatDeadline, formatMinutes, type Workspace } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";

const PLACEHOLDER = `- Finish Q4 budget deck by Friday ~2h
- [high] Call the dentist
- Write launch post due Oct 20 (1h30m)
- Book flights !low
- Review PR #42 by tomorrow 3pm`;

export function Braindump({ state, workspace, onDone }: { state: FreenotesState; workspace: Workspace; onDone: () => void }) {
  const [text, setText] = useState("");
  const [refine, setRefine] = useState(true);
  const [title, setTitle] = useState("");

  const capture = async () => {
    const out = await state.run("Capturing braindump…", (app) => app.braindump({ text, refine, ...(title.trim() ? { title: title.trim() } : {}) }));
    if (out) {
      setText("");
      setTitle("");
      onDone();
    }
  };

  return (
    <section>
      <header className="section-head">
        <h2>1 · Braindump</h2>
        <p>
          One thing per line. Add <code>by Friday</code>, <code>due Oct 20</code> or <code>by tomorrow 3pm</code> for a deadline, <code>~2h</code> for effort, <code>[high]</code> / <code>!low</code> for
          priority. Items without a date are fitted into the gaps.
        </p>
      </header>
      <input className="title-input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={10} value={text} placeholder={PLACEHOLDER} onChange={(e) => setText(e.target.value)} spellCheck />
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} /> Let the chief of staff estimate and prioritise
        </label>
        <button className="primary" disabled={!text.trim() || !!state.busy || !state.app} onClick={capture}>
          Capture todos
        </button>
      </div>

      {workspace.todos.length > 0 && (
        <>
          <h3>Todos ({workspace.todos.length})</h3>
          <TodoTable workspace={workspace} />
        </>
      )}
    </section>
  );
}

export function TodoTable({ workspace }: { workspace: Workspace }) {
  const resultFor = (id: string) => workspace.results.find((r) => r.todoId === id)?.status;
  return (
    <table className="todos">
      <thead>
        <tr>
          <th>#</th>
          <th>Todo</th>
          <th>Priority</th>
          <th>Estimate</th>
          <th>Due</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {workspace.todos.map((t) => (
          <tr key={t.id} className={resultFor(t.id) ?? "open"}>
            <td className="mono">{t.id}</td>
            <td>{t.title}</td>
            <td>
              <span className={`pill ${t.priority}`}>{t.priority}</span>
            </td>
            <td>
              {formatMinutes(t.estimatedMinutes)}
              {t.estimateSource !== "explicit" && <span className="muted"> · {t.estimateSource}</span>}
            </td>
            <td>{formatDeadline(t) || <span className="muted">flexible</span>}</td>
            <td>{resultFor(t.id) ?? <span className="muted">open</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
