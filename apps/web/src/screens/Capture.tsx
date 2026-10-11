import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon.js";
import { useDictation } from "../lib/use-dictation.js";
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
  const [refine, setRefine] = useState(false);
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

  const dictation = useDictation((phrase) => {
    setText((t) => `${t.trim() ? `${t.replace(/\s+$/, "")}\n` : ""}- ${phrase}`);
  });
  useEffect(() => () => dictation.stop(), [dictation]);

  const pullIssues = async () => {
    const out = await state.run("Pulling issues from Linear…", (app) => app.importIssues());
    if (out) setCaptured(out.added.map((t) => t.id));
  };

  const capture = async () => {
    const out = await state.run("Capturing…", (app) => app.braindump({ text, refine }));
    if (out) {
      setText("");
      setCaptured(out.todos.map((t) => t.id));
      navigate({ tab: "triage" });
    }
  };

  return (
    <div className="stack-lg">
      <div className="stack">
        <textarea
          ref={area}
          className="composer"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"One thing per line.\n- Finish Q4 budget deck by Friday ~2h\n- [high] Call the dentist\n- Write launch post due Oct 20"}
          autoCapitalize="sentences"
        />
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div className="chips" aria-label="Insert a hint">
            {HINTS.map(([label, token]) => (
              <button key={label} className="chip outline" onClick={() => insert(token)}>
                + {label}
              </button>
            ))}
          </div>
          {dictation.supported && (
            <button className={`icon-btn mic ${dictation.listening ? "on" : ""}`} aria-pressed={dictation.listening} aria-label={dictation.listening ? "Stop dictating" : "Dictate"} onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}>
              <Icon name="mic" size={20} />
            </button>
          )}
        </div>
        {dictation.listening && <p className="muted small">Listening. Pause between items; each phrase becomes a line.</p>}
        {dictation.error && <p className="muted small danger">{dictation.error}</p>}
        <label className="check">
          <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} />
          Let the chief of staff estimate and prioritise right away (otherwise you are asked per item)
        </label>
        <div className="sticky-action">
          <button className="btn primary block" disabled={!text.trim() || !!state.busy || !state.app} onClick={capture}>
            {(() => {
              const n = text.split("\n").filter((l) => l.trim()).length;
              return n ? `Capture ${n} item${n === 1 ? "" : "s"}` : "Capture";
            })()}
          </button>
        </div>
      </div>

      {state.linearConnected && (
        <button className="btn outline" disabled={!!state.busy} onClick={pullIssues}>
          <Icon name="refresh" size={16} /> Pull my Linear issues
        </button>
      )}

      {captured && captured.length > 0 && (
        <div className="card accent stack">
          <h3>Captured {captured.length} todo{captured.length === 1 ? "" : "s"}</h3>
          <p className="muted small">Next, say when each is due and how long to budget.</p>
          <button className="btn primary" onClick={() => navigate({ tab: "triage" })}>
            Answer the questions
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
