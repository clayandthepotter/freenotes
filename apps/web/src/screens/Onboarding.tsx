import { useEffect, useMemo, useState } from "react";
import { LocalDate, LocalTime, parseBraindump, scoreWorkingStyle, WORKING_STYLE_QUIZ, WorkingHours, formatDeadline, formatMinutes, type QuizAnswers, type Weekday, type WorkingStyle } from "@freenotes/core";
import type { FreenotesState } from "../lib/use-freenotes.js";
import type { SessionState } from "../lib/use-session.js";
import { Icon, Logo } from "../ui/Icon.js";

/**
 * The first-run journey. Value before asking: meet the chief of staff, try it on one real
 * commitment, answer eight quick questions, say who you are, decide how the assistant may act.
 * Every step is skippable and the whole thing can be re-run from Settings.
 */
type Step = "welcome" | "try" | `q${number}` | "analysing" | "style" | "you" | "assistant" | "done";

const QUIZ_STEPS = WORKING_STYLE_QUIZ.map((_, i) => `q${i}` as Step);
const STEPS: Step[] = ["welcome", "try", ...QUIZ_STEPS, "analysing", "style", "you", "assistant", "done"];
const COUNTED: Step[] = STEPS.filter((s) => s !== "welcome" && s !== "analysing" && s !== "done");

const START_HOURS = ["07:00", "08:00", "09:00", "10:00"];
const END_HOURS = ["16:00", "17:00", "18:00", "19:00"];
const DAYS: Array<[Weekday, string]> = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "T"],
  [5, "F"],
  [6, "S"],
  [0, "S"],
];

export function Onboarding({ state, session, onDone }: { state: FreenotesState; session: SessionState; onDone: () => void }) {
  const ws = state.workspace;
  const [step, setStep] = useState<Step>("welcome");
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [style, setStyle] = useState<WorkingStyle | undefined>(ws?.profile.style);
  const index = STEPS.indexOf(step);
  const counted = COUNTED.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };
  const next = () => go(STEPS[index + 1] ?? "done");
  const back = () => go(STEPS[Math.max(0, index - 1 - (STEPS[index - 1] === "analysing" ? 1 : 0))] ?? "welcome");

  // The "analysing" beat is theatre with a purpose: it marks the moment the app becomes yours.
  useEffect(() => {
    if (step !== "analysing") return;
    const computed = scoreWorkingStyle(answers);
    setStyle(computed);
    void state.app?.updateProfile({ style: computed }).then(() => state.reload());
    const t = window.setTimeout(() => go("style"), 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finish = async () => {
    await state.app?.updateProfile({ onboardedAt: new Date() });
    await state.reload();
    onDone();
  };

  if (!ws) return null;

  return (
    <div className="onboard">
      {step !== "welcome" && step !== "analysing" && step !== "done" && (
        <div className="ob-top">
          <button className="icon-btn" aria-label="Back" onClick={back}>
            <Icon name="back" />
          </button>
          <div className="ob-progress" role="progressbar" aria-valuemin={0} aria-valuemax={COUNTED.length} aria-valuenow={counted + 1}>
            <span style={{ width: `${((counted + 1) / COUNTED.length) * 100}%` }} />
          </div>
          <span className="muted small">
            {counted + 1}/{COUNTED.length}
          </span>
        </div>
      )}

      {step === "welcome" && <Welcome onStart={next} onSkip={finish} />}
      {step === "try" && <TryIt state={state} onNext={next} />}
      {step.startsWith("q") && (
        <Question
          index={Number(step.slice(1))}
          chosen={answers[WORKING_STYLE_QUIZ[Number(step.slice(1))]!.id]}
          onChoose={(i) => {
            const q = WORKING_STYLE_QUIZ[Number(step.slice(1))]!;
            setAnswers((a) => ({ ...a, [q.id]: i }));
            window.setTimeout(next, 180);
          }}
        />
      )}
      {step === "analysing" && (
        <div className="ob-center">
          <span className="spinner lg" />
          <h2>Analysing your style…</h2>
          <p className="muted">Personalising freenotes to fit you</p>
        </div>
      )}
      {step === "style" && style && <StyleResult style={style} onNext={next} />}
      {step === "you" && <You state={state} session={session} onNext={next} />}
      {step === "assistant" && <Assistant state={state} onNext={next} />}
      {step === "done" && <Done state={state} style={style} onDone={finish} />}
    </div>
  );
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="ob-screen">
      <div className="ob-hero">
        <Logo size={64} />
        <h1>Meet your chief of staff</h1>
        <p className="muted">Everything you must do, in one place, kept on track.</p>
      </div>
      <div className="stack">
        <Feature icon="capture" title="Braindump, then forget" body="One line per commitment. Deadlines, effort and priority are optional." />
        <Feature icon="calendar" title="A day that fits" body="Deadlines go first; everything else fills the gaps in your working hours." />
        <Feature icon="list" title="Steps you can start" body="Each todo becomes execution parameters: a first action, steps, a definition of done." />
        <Feature icon="review" title="An honest debrief" body="Report what happened; get achievements, what to improve, and one reflection per win." />
      </div>
      <div className="ob-actions">
        <button className="btn primary lg" onClick={onStart}>
          Get started
        </button>
        <button className="link" onClick={onSkip}>
          I know freenotes, skip setup
        </button>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="feature">
      <span className="k">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <div className="t">{title}</div>
        <div className="muted small">{body}</div>
      </div>
    </div>
  );
}

const TRY_HINTS: Array<[string, string]> = [
  ["by Friday", " by Friday"],
  ["~2h", " ~2h"],
  ["[high]", " [high]"],
];

function TryIt({ state, onNext }: { state: FreenotesState; onNext: () => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseBraindump(text, { today: LocalDate.fromDate(new Date()) }).todos[0] : undefined), [text]);
  const add = async () => {
    const out = await state.run("Adding it…", (app) => app.braindump({ text, refine: Boolean(state.assistant?.online) }));
    if (out) onNext();
  };
  return (
    <div className="ob-screen">
      <div className="ob-head">
        <h1>Try it right now</h1>
        <p className="muted">Type one thing you must do. Watch it get structured as you type.</p>
      </div>
      <input className="ob-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Finish the board deck by Friday ~2h" autoFocus autoCapitalize="sentences" />
      <div className="chips">
        {TRY_HINTS.map(([label, token]) => (
          <button key={label} className="chip outline" onClick={() => setText((t) => t + token)}>
            + {label}
          </button>
        ))}
      </div>
      <div className={`card preview ${parsed ? "" : "empty"}`}>
        {parsed ? (
          <>
            <div className="muted small">Understood as</div>
            <div className="t">{parsed.title}</div>
            <div className="chips">
              <span className="chip">{parsed.deadline ? `due ${formatDeadline(parsed)}` : "no deadline, fits a gap"}</span>
              <span className="chip">{formatMinutes(parsed.estimatedMinutes)}{parsed.estimateSource === "explicit" ? "" : " (estimate)"}</span>
              <span className="chip">{parsed.priority} priority</span>
            </div>
          </>
        ) : (
          <div className="muted">The deadline, effort and priority appear here.</div>
        )}
      </div>
      <div className="ob-actions">
        <button className="btn primary lg" disabled={!parsed || !!state.busy} onClick={add}>
          Add it to my day
        </button>
        <button className="link" onClick={onNext}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

function Question({ index, chosen, onChoose }: { index: number; chosen: number | undefined; onChoose: (i: number) => void }) {
  const q = WORKING_STYLE_QUIZ[index]!;
  return (
    <div className="ob-screen">
      <h1 className="ob-q">{q.prompt}</h1>
      <div className="stack">
        {q.options.map((o, i) => (
          <button key={o.label} className={`quiz-option ${chosen === i ? "on" : ""}`} onClick={() => onChoose(i)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleResult({ style, onNext }: { style: WorkingStyle; onNext: () => void }) {
  return (
    <div className="ob-screen">
      <div className="ob-hero">
        <span className="check-big">
          <Icon name="check" size={34} strokeWidth={3} />
        </span>
        <h1>Your style: {style.name}</h1>
        <p className="muted">{style.summary}</p>
      </div>
      <div className="card stack">
        <h3>How freenotes is adapting</h3>
        {style.adaptations.map((a, i) => (
          <div key={i} className="row" style={{ alignItems: "flex-start" }}>
            <Icon name={i === 0 ? "home" : "list"} size={18} />
            <span className="grow">{a}</span>
          </div>
        ))}
      </div>
      <div className="ob-actions">
        <button className="btn primary lg" onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  );
}

function You({ state, session, onNext }: { state: FreenotesState; session: SessionState; onNext: () => void }) {
  const ws = state.workspace!;
  const wh = ws.settings.workingHours.toJSON();
  const first = Object.values(wh)[0] ?? { start: "09:00", end: "17:00" };
  const [name, setName] = useState(ws.profile.name ?? "");
  const [start, setStart] = useState(first.start);
  const [end, setEnd] = useState(first.end);
  const [days, setDays] = useState<Set<Weekday>>(new Set(Object.keys(wh).map((k) => Number(k) as Weekday)));
  const save = async () => {
    const ok = await state.run("Saving…", async (app) => {
      await app.updateProfile({ name: name || null });
      const spec: Partial<Record<Weekday, { start: LocalTime; end: LocalTime }>> = {};
      for (const d of days) spec[d] = { start: LocalTime.parse(start), end: LocalTime.parse(end) };
      await app.updateSettings((s) => ({ ...s, workingHours: WorkingHours.of(spec) }));
      return true;
    });
    if (ok) onNext();
  };
  return (
    <div className="ob-screen">
      <div className="ob-head">
        <h1>Plug in your day</h1>
        <p className="muted">Focus blocks are only ever offered inside this window.</p>
      </div>
      <label className="field">
        What should I call you?
        <input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={session.session?.user.email ? "Your first name" : "Your name"} autoCapitalize="words" />
      </label>
      <div className="card stack">
        <div className="pick">
          <span className="lbl">Start</span>
          <div className="chips">
            {START_HOURS.map((h) => (
              <button key={h} className={`chip ${start === h ? "on" : ""}`} onClick={() => setStart(h)}>
                {h.replace(":00", "").replace(/^0/, "")}am
              </button>
            ))}
          </div>
        </div>
        <div className="pick">
          <span className="lbl">End</span>
          <div className="chips">
            {END_HOURS.map((h) => (
              <button key={h} className={`chip ${end === h ? "on" : ""}`} onClick={() => setEnd(h)}>
                {Number(h.slice(0, 2)) - 12}pm
              </button>
            ))}
          </div>
        </div>
        <div className="pick">
          <span className="lbl">Days</span>
          <div className="days-pick">
            {DAYS.map(([d, label]) => (
              <button
                key={d}
                className={`chip ${days.has(d) ? "on" : ""}`}
                aria-pressed={days.has(d)}
                onClick={() => {
                  const n = new Set(days);
                  if (n.has(d)) n.delete(d);
                  else n.add(d);
                  setDays(n);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ob-actions">
        <button className="btn primary lg" disabled={days.size === 0 || !!state.busy} onClick={save}>
          Continue
        </button>
      </div>
    </div>
  );
}

function Assistant({ state, onNext }: { state: FreenotesState; onNext: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const online = Boolean(state.assistant?.online && state.assistant.status?.name !== "heuristic");
  return (
    <div className="ob-screen">
      <div className="ob-head">
        <h1>Before the assistant acts</h1>
        <p className="muted">Your chief of staff estimates effort, writes plans and composes your debrief. A few things to know.</p>
      </div>
      <div className="card stack">
        <Disclosure icon="sparkle" title="It fills gaps, it does not override you" body="Your deadlines, estimates and priorities always win. It only estimates where you left a blank." />
        <Disclosure icon="warn" title="It can be wrong" body="Plans and reports are suggestions. Read them like advice from a sharp colleague, not instructions." />
        <Disclosure icon="cloud" title="Where your words go" body={online ? `Requests go to ${state.assistant?.label ?? "your configured model"}. Nothing else leaves this device.` : "Right now nothing leaves this device: the built-in assistant runs offline. Add a model key later in Settings for a sharper one."} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>I understand</span>
      </label>
      <div className="ob-actions">
        <button className="btn primary lg" disabled={!understood} onClick={onNext}>
          Continue
        </button>
        <button
          className="link"
          onClick={() => {
            state.setMode("heuristic");
            onNext();
          }}
        >
          Keep it offline only
        </button>
      </div>
    </div>
  );
}

function Disclosure({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <span className="k-icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="muted small">{body}</div>
      </div>
    </div>
  );
}

function Done({ state, style, onDone }: { state: FreenotesState; style: WorkingStyle | undefined; onDone: () => void }) {
  const ws = state.workspace!;
  return (
    <div className="ob-screen">
      <div className="ob-hero">
        <span className="check-big">
          <Icon name="check" size={34} strokeWidth={3} />
        </span>
        <h1>{ws.profile.name ? `You're set, ${ws.profile.name}.` : "You're set."}</h1>
        <p className="muted">Your brief is ready. Here is what freenotes knows.</p>
      </div>
      <div className="card stack">
        <Summary label="Working style" value={style?.name ?? "Not taken"} />
        <Summary label="Hours" value={describeHours(ws.settings.workingHours.toJSON())} />
        <Summary label="Assistant" value={state.assistant?.online && state.assistant.status?.name !== "heuristic" ? state.assistant.label : "Built-in, offline"} />
        <Summary label="Captured" value={ws.todos.length === 0 ? "Nothing yet" : `${ws.todos.length} todo${ws.todos.length === 1 ? "" : "s"}`} />
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>Calendars, mail and issue trackers connect from the brief's setup card as they become available.</p>
      <div className="ob-actions">
        <button className="btn primary lg" onClick={onDone}>
          Open my brief
        </button>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between">
      <span className="muted small">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function describeHours(wh: Record<string, { start: string; end: string }>): string {
  const first = Object.values(wh)[0];
  if (!first) return "Not set";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = Object.keys(wh)
    .map(Number)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => names[d]);
  const span = days.length === 5 && days[0] === "Mon" && days[4] === "Fri" ? "Mon–Fri" : days.join(" ");
  return `${span} ${first.start}–${first.end}`;
}
