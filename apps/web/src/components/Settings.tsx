import { useRef } from "react";
import type { AssistantMode } from "../lib/assistant.js";
import type { useFreenotes } from "../lib/use-freenotes.js";

export function Settings({ state }: { state: ReturnType<typeof useFreenotes> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <section>
      <header className="section-head">
        <h2>Settings</h2>
        <p>Everything is stored in this browser. The chief of staff runs on a server you control, or offline with built-in heuristics.</p>
      </header>
      <label>
        Chief of staff
        <select value={state.mode} onChange={(e) => state.setMode(e.target.value as AssistantMode)}>
          <option value="auto">Auto (server if available, else heuristic)</option>
          <option value="server">Server only (Claude)</option>
          <option value="heuristic">Heuristic only (offline)</option>
        </select>
        <small className="muted">Currently: {state.assistant?.label ?? "resolving…"}</small>
      </label>
      <label>
        About you (sent with every request so the assistant can tailor estimates, plans and questions)
        <textarea rows={3} value={state.profile} onChange={(e) => state.setProfile(e.target.value)} placeholder="e.g. Head of product at a 40-person startup. Mornings are for deep work; I over-estimate how fast I write." />
      </label>
      <div className="row">
        <button
          className="secondary"
          onClick={() => {
            const json = state.repository.export();
            if (!json) return;
            const blob = new Blob([json], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `freenotes-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}
        >
          Export workspace
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()}>
          Import workspace
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              state.repository.import(await file.text());
              await state.reload();
            } catch (err) {
              alert(`Could not import: ${(err as Error).message}`);
            }
          }}
        />
        <button
          className="danger"
          onClick={async () => {
            if (!confirm("Delete everything in this browser's workspace?")) return;
            window.localStorage.removeItem("freenotes.workspace.v1");
            await state.reload();
          }}
        >
          Reset workspace
        </button>
      </div>
    </section>
  );
}
