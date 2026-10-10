import { useState } from "react";
import { Braindump } from "./components/Braindump.js";
import { Notes } from "./components/Notes.js";
import { Plans } from "./components/Plans.js";
import { Results } from "./components/Results.js";
import { ScheduleView } from "./components/ScheduleView.js";
import { Settings } from "./components/Settings.js";
import { useFreenotes } from "./lib/use-freenotes.js";

type Tab = "braindump" | "schedule" | "plans" | "results" | "notes" | "settings";

const TABS: Array<[Tab, string]> = [
  ["braindump", "1 · Braindump"],
  ["schedule", "2 · Schedule"],
  ["plans", "3 · Plans"],
  ["results", "4 · Results"],
  ["notes", "5 · Notes"],
  ["settings", "Settings"],
];

export function App() {
  const state = useFreenotes();
  const [tab, setTab] = useState<Tab>("braindump");
  const ws = state.workspace;

  return (
    <div className="app">
      <nav>
        <div className="brand">
          <span className="logo">🗒️</span>
          <div>
            <strong>freenotes</strong>
            <small>with a chief of staff</small>
          </div>
        </div>
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "braindump" && ws?.todos.length ? <span className="count">{ws.todos.length}</span> : null}
            {id === "plans" && ws ? <span className="count">{Object.keys(ws.plans).length}</span> : null}
            {id === "notes" && ws?.compositions.length ? <span className="count">{ws.compositions.length}</span> : null}
          </button>
        ))}
        <div className="status">
          <span className={`dot ${state.assistant?.online ? "online" : "offline"}`} />
          {state.assistant?.label ?? "connecting…"}
        </div>
      </nav>
      <main>
        {state.busy && <div className="banner busy">{state.busy}</div>}
        {state.error && (
          <div className="banner error" onClick={state.clearError}>
            {state.error} <small>(click to dismiss)</small>
          </div>
        )}
        {!ws ? (
          <p className="muted">Loading…</p>
        ) : tab === "braindump" ? (
          <Braindump state={state} workspace={ws} onDone={() => setTab("schedule")} />
        ) : tab === "schedule" ? (
          <ScheduleView state={state} workspace={ws} />
        ) : tab === "plans" ? (
          <Plans state={state} workspace={ws} />
        ) : tab === "results" ? (
          <Results state={state} workspace={ws} />
        ) : tab === "notes" ? (
          <Notes workspace={ws} />
        ) : (
          <Settings state={state} />
        )}
      </main>
    </div>
  );
}
