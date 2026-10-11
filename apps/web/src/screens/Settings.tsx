import { useEffect, useRef, useState } from "react";
import type { ProviderView, SettingsPatch, SettingsView } from "@freenotes/ai-http";
import { formatTime, LocalTime, WorkingHours, type Weekday, type Workspace } from "@freenotes/core";
import type { AssistantMode } from "../lib/assistant.js";
import type { FreenotesState } from "../lib/use-freenotes.js";
import type { SessionState } from "../lib/use-session.js";
import { Icon } from "../ui/Icon.js";

const DAYS: Array<[Weekday, string]> = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "T"],
  [5, "F"],
  [6, "S"],
  [0, "S"],
];

export function Settings({ state, session, workspace, focus }: { state: FreenotesState; session: SessionState; workspace: Workspace; focus?: string | undefined }) {
  const signedIn = Boolean(session.session);
  return (
    <div className="settings-section stack-lg">
      <Group caption="Account">
        <div className="card stack">
          <div className="row">
            <span className="icon-btn" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <Icon name={signedIn ? "cloud" : "user"} />
            </span>
            <div className="grow">
              <h3>{signedIn ? (session.session?.user.email ?? "Signed in") : "Not signed in"}</h3>
              <p className="muted small">{signedIn ? "Workspace and settings sync to your account." : session.available ? "Sign in to sync across devices and use your own model key." : "This deployment runs local-only; everything stays in this browser."}</p>
            </div>
          </div>
          {signedIn ? (
            <button className="btn outline" onClick={() => void session.signOut()}>
              Sign out
            </button>
          ) : session.available ? (
            <SignInForm session={session} />
          ) : null}
        </div>
      </Group>

      <Group caption="You">
        <YouCard state={state} workspace={workspace} />
      </Group>

      <Group caption="Intelligence">
        {signedIn && state.assistant?.api && <AssistantSettings state={state} session={session} />}
        <div className="card stack">
          <h3>Where the chief of staff runs</h3>
          <label className="field">
            Engine
            <select value={state.mode} onChange={(e) => state.setMode(e.target.value as AssistantMode)}>
              <option value="auto">Auto (server if available, else offline heuristics)</option>
              <option value="server">Server only</option>
              <option value="heuristic">Offline heuristics only</option>
            </select>
            <small>Currently: {state.assistant?.label ?? "resolving…"}</small>
          </label>
          {state.storage === "local" && (
            <label className="field">
              About you
              <textarea rows={3} value={state.profile} onChange={(e) => state.setProfile(e.target.value)} placeholder="e.g. Head of product at a 40-person startup. Mornings are for deep work." />
              <small>Sent with every request so the assistant can tailor estimates, plans and questions.</small>
            </label>
          )}
        </div>
      </Group>

      <Group caption="Calendar & time">
        <CalendarsCard state={state} workspace={workspace} autoFocus={focus === "calendars"} />
        <SchedulePrefs state={state} workspace={workspace} />
      </Group>

      <Group caption="Privacy & data">
        <WorkspaceData state={state} signedIn={signedIn} />
      </Group>

      <p className="muted small" style={{ textAlign: "center" }}>
        freenotes is open source · <a href="https://github.com/clayandthepotter/freenotes">GitHub</a>
      </p>
    </div>
  );
}

function Group({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <section className="settings-group" aria-label={caption}>
      <div className="caption">{caption}</div>
      {children}
    </section>
  );
}

function SignInForm({ session }: { session: SessionState }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div className="stack">
        <p className="small">
          Check <strong>{email}</strong> for a sign-in link and open it on this device.
        </p>
        <details>
          <summary className="small muted">Have a code instead?</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn outline" disabled={busy || code.trim().length < 6} onClick={() => run(() => session.verifyCode(email, code))}>
              Verify
            </button>
          </div>
        </details>
        <button className="link small" onClick={() => setSent(false)}>
          Use a different email
        </button>
        {error && <p className="banner error">{error}</p>}
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await session.sendMagicLink(email);
          setSent(true);
        });
      }}
    >
      <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="btn primary" type="submit" disabled={busy || !email.includes("@")}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="muted small">No password. We email you a link.</p>
      {error && <p className="banner error">{error}</p>}
    </form>
  );
}

function SchedulePrefs({ state, workspace }: { state: FreenotesState; workspace: Workspace }) {
  const wh = workspace.settings.workingHours.toJSON();
  const first = Object.values(wh)[0] ?? { start: "09:00", end: "17:00" };
  const [start, setStart] = useState(first.start);
  const [end, setEnd] = useState(first.end);
  const [days, setDays] = useState<Set<Weekday>>(new Set(Object.keys(wh).map((k) => Number(k) as Weekday)));
  const [horizon, setHorizon] = useState(workspace.settings.policy.horizonDays);
  const [maxBlock, setMaxBlock] = useState(workspace.settings.policy.maxBlockMinutes);
  const dirty = start !== first.start || end !== first.end || horizon !== workspace.settings.policy.horizonDays || maxBlock !== workspace.settings.policy.maxBlockMinutes || days.size !== Object.keys(wh).length || [...days].some((d) => !(String(d) in wh));

  const save = () =>
    state.run("Saving preferences…", async (app) => {
      const spec: Partial<Record<Weekday, { start: LocalTime; end: LocalTime }>> = {};
      for (const d of days) spec[d] = { start: LocalTime.parse(start), end: LocalTime.parse(end) };
      await app.updateSettings((s) => ({ workingHours: WorkingHours.of(spec), policy: { ...s.policy, horizonDays: horizon, maxBlockMinutes: maxBlock } }));
      if (workspace.schedule) await app.schedule();
    });

  return (
    <div className="card stack">
      <h3>Schedule preferences</h3>
      <label className="field">
        Working hours
        <div className="hours">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="muted">to</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </label>
      <label className="field">
        Working days
        <div className="days-pick">
          {DAYS.map(([d, name]) => (
            <button
              key={d}
              type="button"
              className={`chip ${days.has(d) ? "on" : ""}`}
              aria-pressed={days.has(d)}
              onClick={() => {
                const next = new Set(days);
                if (next.has(d)) next.delete(d);
                else next.add(d);
                setDays(next);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </label>
      <div className="row">
        <label className="field grow">
          Horizon (days)
          <input type="number" min={1} max={60} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} />
        </label>
        <label className="field grow">
          Longest focus block (min)
          <input type="number" min={15} max={240} step={15} value={maxBlock} onChange={(e) => setMaxBlock(Number(e.target.value) || 90)} />
        </label>
      </div>
      <button className="btn primary" disabled={!dirty || days.size === 0 || !!state.busy} onClick={save}>
        Save{workspace.schedule ? " and rebuild schedule" : ""}
      </button>
    </div>
  );
}

function WorkspaceData({ state, signedIn }: { state: FreenotesState; signedIn: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="card stack">
      <h3>Your data</h3>
      <p className="muted small">{signedIn ? "Export a copy of your account workspace as JSON." : "Export, import or wipe the workspace stored in this browser."}</p>
      <div className="btn-row">
        <button
          className="btn outline"
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
          Export
        </button>
        {!signedIn && (
          <>
            <button className="btn outline" onClick={() => fileInput.current?.click()}>
              Import
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
              className="btn danger"
              onClick={async () => {
                if (!confirm("Delete everything in this browser's workspace?")) return;
                window.localStorage.removeItem("freenotes.workspace.v1");
                await state.reload();
              }}
            >
              Reset
            </button>
          </>
        )}
      </div>
    </div>
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

  if (!form || !settings) {
    return (
      <div className="card">
        <p className="muted small">Loading account settings…</p>
      </div>
    );
  }
  const provider = providers.find((p) => p.id === form.provider);
  const wrap = async (label: string | undefined, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card account-settings stack">
      <div>
        <h3>Your assistant</h3>
        <p className="muted small">Pick who plays chief of staff. Your key is encrypted on the server and only used for your own requests.</p>
      </div>
      <label className="field">
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
          <label className="field">
            Model
            <input list={`models-${provider.id}`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={provider.defaultModel || "model id"} autoCapitalize="off" autoCorrect="off" />
            <datalist id={`models-${provider.id}`}>
              {provider.suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          {provider.supportsBaseUrl && (
            <label className="field">
              Base URL
              <input inputMode="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={provider.defaultBaseUrl} autoCapitalize="off" />
              {provider.note && <small>{provider.note}</small>}
            </label>
          )}
          <label className="field">
            API key{provider.needsApiKey ? "" : " (optional)"}
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={settings.hasApiKey ? `stored · ends in ${settings.apiKeyLast4 ?? "····"}` : "paste a key"} />
            {settings.hasApiKey && (
              <small>
                <button type="button" className="link" disabled={busy} onClick={() => wrap(undefined, async () => { setSettings(await api.saveSettings({ apiKey: null })); setStatus("Key removed."); state.refreshAssistant(); })}>
                  Remove stored key
                </button>
              </small>
            )}
          </label>
        </>
      )}
      <label className="field">
        About you
        <textarea rows={3} value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} placeholder="e.g. Head of product at a 40-person startup." />
        <small>Sent with every request so the assistant can tailor estimates, plans and questions.</small>
      </label>
      {status && <p className={`banner ${status.startsWith("Not working") ? "warn" : "busy"}`}>{status}</p>}
      <div className="btn-row">
        <button className="btn outline" disabled={busy} onClick={() => wrap("Testing…", async () => { const r = await api.verifyAssistant(); setStatus(`Working: ${r.name}.`); })}>
          Test connection
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            wrap("Saving…", async () => {
              const patch: SettingsPatch = { provider: form.provider, model: form.model.trim() || null, baseUrl: form.baseUrl.trim() || null, profile: form.profile, ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}) };
              setSettings(await api.saveSettings(patch));
              setForm({ ...form, apiKey: "" });
              setStatus("Saved.");
              state.refreshAssistant();
            })
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}

function YouCard({ state, workspace }: { state: FreenotesState; workspace: Workspace }) {
  const p = workspace.profile;
  const [name, setName] = useState(p.name ?? "");
  const [goals, setGoals] = useState(p.goals.join("\n"));
  const [boundaries, setBoundaries] = useState(p.boundaries.join("\n"));
  const dirty = name.trim() !== (p.name ?? "") || goals !== p.goals.join("\n") || boundaries !== p.boundaries.join("\n");
  const save = () => state.run("Saving…", (app) => app.updateProfile({ name: name.trim() || null, goals: goals.split("\n"), boundaries: boundaries.split("\n") }));
  return (
    <div className="card stack">
      <h3>You</h3>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="How the brief should address you" />
      </label>
      <div className="row between">
        <div>
          <div style={{ fontWeight: 600 }}>Working style</div>
          <div className="muted small">{p.style ? p.style.name : "Not taken yet"}</div>
        </div>
        <a className="btn sm outline" href="#/setup">
          {p.style ? "Retake" : "Take the quiz"}
        </a>
      </div>
      <label className="field">
        Goals the work should serve
        <textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder={"One per line, e.g.\nShip v1 by December"} />
        <small>Plans and reports are judged against these.</small>
      </label>
      <label className="field">
        Boundaries
        <textarea rows={2} value={boundaries} onChange={(e) => setBoundaries(e.target.value)} placeholder={"One per line, e.g.\nNo work after 6pm"} />
        <small>The assistant never suggests crossing them.</small>
      </label>
      <div className="row between">
        <a className="link small" href="#/setup">
          Run setup again
        </a>
        <button className="btn primary sm" disabled={!dirty || !!state.busy} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

function CalendarsCard({ state, workspace, autoFocus }: { state: FreenotesState; workspace: Workspace; autoFocus: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<string>();
  const calendars = workspace.calendar.calendars;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [autoFocus]);
  const connect = async () => {
    setResult(undefined);
    const out = await state.run("Connecting calendar…", (app) => app.connectCalendar({ label, url }));
    if (!out) return;
    setLabel("");
    setUrl("");
    const failed = out.failed.find((f) => f.calendarId === out.calendar.id);
    setResult(failed ? `Connected, but the first pull failed: ${failed.error}` : `Connected. ${out.workspace.calendar.events.filter((e) => e.calendarId === out.calendar.id).length} events in view.`);
  };
  return (
    <div className="card stack" ref={ref} id="calendars">
      <div className="row between">
        <h3>Calendars</h3>
        {calendars.length > 0 && (
          <button className="btn sm outline" disabled={!!state.busy} onClick={() => state.run("Syncing calendars…", (app) => app.syncCalendars())}>
            <Icon name="refresh" size={14} /> Sync now
          </button>
        )}
      </div>
      <p className="muted small">Meetings show on your brief and are kept out of focus blocks. Paste the private ICS address of each calendar: Google (Settings → your calendar → "Secret address in iCal format"), Outlook (Settings → Shared calendars → Publish), iCloud (share as public calendar).</p>
      {calendars.map((c) => (
        <div key={c.id} className="cal-row">
          <span className="dot" style={{ background: c.color }} />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{c.label}</div>
            <div className={`muted small ${c.lastError ? "danger" : ""}`}>
              {c.lastError ? c.lastError : c.lastSyncedAt ? `${workspace.calendar.events.filter((e) => e.calendarId === c.id).length} events · synced ${formatTime(c.lastSyncedAt)}` : "Not synced yet"}
            </div>
          </div>
          <button className="icon-btn" aria-label={`Remove ${c.label}`} onClick={() => window.confirm(`Disconnect ${c.label}?`) && state.run("Removing calendar…", (app) => app.removeCalendar(c.id))}>
            <Icon name="x" size={18} />
          </button>
        </div>
      ))}
      <label className="field">
        Name
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Work, Home, Family…" />
      </label>
      <label className="field">
        Private ICS address
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" inputMode="url" autoCapitalize="off" autoCorrect="off" />
      </label>
      {result && <p className="muted small">{result}</p>}
      <button className="btn primary" disabled={!url.trim() || !!state.busy} onClick={connect}>
        Connect calendar
      </button>
    </div>
  );
}
