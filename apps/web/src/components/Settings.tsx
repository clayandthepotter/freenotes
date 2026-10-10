import { useEffect, useRef, useState } from "react";
import type { ProviderView, SettingsPatch, SettingsView } from "@freenotes/ai-http";
import type { AssistantMode } from "../lib/assistant.js";
import type { FreenotesState } from "../lib/use-freenotes.js";
import type { SessionState } from "../lib/use-session.js";
import { SignIn } from "./SignIn.js";

export function Settings({ state, session }: { state: FreenotesState; session: SessionState }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const signedIn = Boolean(session.session);
  return (
    <section>
      <header className="section-head">
        <h2>Settings</h2>
        <p>
          {state.storage === "cloud"
            ? `Signed in as ${session.session?.user.email ?? "your account"}. Your workspace and settings sync to your account.`
            : "Everything is stored in this browser. The chief of staff runs on a server you control, or offline with built-in heuristics."}
        </p>
      </header>

      {signedIn && state.assistant?.api ? (
        <AssistantSettings state={state} session={session} />
      ) : signedIn ? (
        <p className="callout">The server is not reachable, so account settings cannot be edited right now.</p>
      ) : session.available ? (
        <SignIn session={session} />
      ) : null}

      <h3>Assistant backend</h3>
      <label>
        Chief of staff
        <select value={state.mode} onChange={(e) => state.setMode(e.target.value as AssistantMode)}>
          <option value="auto">Auto (server if available, else heuristic)</option>
          <option value="server">Server only</option>
          <option value="heuristic">Heuristic only (offline)</option>
        </select>
        <small className="muted">Currently: {state.assistant?.label ?? "resolving…"}</small>
      </label>
      {state.storage === "local" && (
        <label>
          About you (sent with every request so the assistant can tailor estimates, plans and questions)
          <textarea rows={3} value={state.profile} onChange={(e) => state.setProfile(e.target.value)} placeholder="e.g. Head of product at a 40-person startup. Mornings are for deep work; I over-estimate how fast I write." />
        </label>
      )}

      <h3>Workspace</h3>
      <div className="row">
        <button
          className="secondary"
          onClick={async () => {
            const ws = await state.app?.workspace();
            if (!ws) return;
            const { serializeWorkspace } = await import("@freenotes/core");
            const blob = new Blob([JSON.stringify(serializeWorkspace(ws), null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `freenotes-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}
        >
          Export workspace
        </button>
        {state.storage === "local" && (
          <>
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
                  state.localRepository.import(await file.text());
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
          </>
        )}
        {signedIn && (
          <button className="secondary" onClick={() => void session.signOut()}>
            Sign out
          </button>
        )}
      </div>
    </section>
  );
}

function AssistantSettings({ state, session }: { state: FreenotesState; session: SessionState }) {
  const api = state.assistant!.api!;
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [settings, setSettings] = useState<SettingsView>();
  const [form, setForm] = useState<{ provider: string; model: string; baseUrl: string; apiKey: string; profile: string }>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.providers(), api.getSettings()])
      .then(([p, s]) => {
        if (cancelled) return;
        setProviders(p);
        setSettings(s);
        setForm({ provider: s.provider, model: s.model ?? "", baseUrl: s.baseUrl ?? "", apiKey: "", profile: s.profile });
      })
      .catch((e: Error) => setStatus(e.message));
    return () => {
      cancelled = true;
    };
  }, [api, session.session?.user.id]);

  if (!form || !settings) return <p className="muted">Loading account settings…</p>;
  const provider = providers.find((p) => p.id === form.provider);

  const save = async () => {
    setBusy(true);
    setStatus(undefined);
    try {
      const patch: SettingsPatch = {
        provider: form.provider,
        model: form.model.trim() || null,
        baseUrl: form.baseUrl.trim() || null,
        profile: form.profile,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      };
      const saved = await api.saveSettings(patch);
      setSettings(saved);
      setForm({ ...form, apiKey: "" });
      setStatus("Saved.");
      state.refreshAssistant();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    setBusy(true);
    try {
      const saved = await api.saveSettings({ apiKey: null });
      setSettings(saved);
      setStatus("Key removed.");
      state.refreshAssistant();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setStatus("Testing…");
    try {
      const r = await api.verifyAssistant();
      setStatus(`Working: ${r.name}.`);
    } catch (e) {
      setStatus(`Not working: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-settings">
      <h3>Your assistant</h3>
      <p className="muted">Choose who plays chief of staff. Your API key is encrypted on the server and only used for your own requests.</p>
      <label>
        Provider
        <select
          value={form.provider}
          onChange={(e) => {
            const id = e.target.value;
            const p = providers.find((x) => x.id === id);
            setForm({ ...form, provider: id, model: p?.defaultModel ?? "", baseUrl: p?.defaultBaseUrl ?? "" });
          }}
        >
          <option value="default">Server default (no key needed)</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {provider && (
        <>
          <label>
            Model
            <input list={`models-${provider.id}`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={provider.defaultModel || "model id"} />
            <datalist id={`models-${provider.id}`}>
              {provider.suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          {provider.supportsBaseUrl && (
            <label>
              Base URL
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={provider.defaultBaseUrl} />
              {provider.note && <small className="muted">{provider.note}</small>}
            </label>
          )}
          <label>
            API key {provider.needsApiKey ? "" : "(optional)"}
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={settings.hasApiKey ? `stored · ends in ${settings.apiKeyLast4 ?? "····"}` : "paste a key"} />
            {settings.hasApiKey && (
              <small>
                <button type="button" className="link" disabled={busy} onClick={clearKey}>
                  Remove stored key
                </button>
              </small>
            )}
          </label>
        </>
      )}
      <label>
        About you (sent with every request so the assistant can tailor estimates, plans and questions)
        <textarea rows={3} value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} placeholder="e.g. Head of product at a 40-person startup." />
      </label>
      <div className="row">
        <span className="muted">{status}</span>
        <span className="inline">
          <button className="secondary" disabled={busy} onClick={verify}>
            Test connection
          </button>
          <button className="primary" disabled={busy} onClick={save}>
            Save
          </button>
        </span>
      </div>
    </div>
  );
}
