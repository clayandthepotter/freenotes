import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  DomainError,
  Freenotes,
  HeuristicChiefOfStaff,
  LocalTime,
  TimeRange,
  WorkingHours,
  formatDay,
  renderAchievementReport,
  renderExecutionPlan,
  renderSchedule,
  renderTodos,
  type ChiefOfStaff,
  type Composition,
  type Weekday,
} from "@freenotes/core";
import { AnthropicChiefOfStaff, ChiefOfStaffError, type Effort } from "@freenotes/ai-anthropic";
import { FileWorkspaceRepository } from "@freenotes/storage-fs";

export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readStdin: () => Promise<string>;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
}

export const HELP = `freenotes — notes with a chief of staff

Usage: freenotes <command> [options]

Commands
  braindump [file]        Capture a bulleted list of things you must do (reads a file or stdin)
  schedule                Build a time-blocked schedule for everything still open
  plan <T1|all>           Decompose a todo into step-by-step execution parameters
  step <T1> <n> [text]    Tick step n of a plan (--done / --undone) and/or write its answer inline
  report [file]           Record results (file or stdin) and get an achievement report
  reflect <T1> "<answer>" Answer the reflection question for a completed todo
  todos                   List todos
  notes [kind]            List compositions (braindump, schedule, execution-plan, results, achievement-report)
  show <id|latest>        Print a composition
  config                  Show or change working hours and scheduling policy

Options
  --workspace <path>      Workspace file (default ./.freenotes/workspace.json, or $FREENOTES_WORKSPACE)
  --ai <auto|claude|heuristic>
                          Chief of staff backend (default auto: claude when ANTHROPIC_API_KEY is set)
  --model <id>            Claude model (default claude-opus-5-5)
  --effort <low|medium|high|xhigh|max>
  --profile "<text>"      Background about you for the assistant (or $FREENOTES_PROFILE)
  --title "<text>"        Title for the braindump composition
  --no-refine             Skip assistant refinement when capturing a braindump
  --days <n>              Scheduling horizon in days
  --hours <HH:MM-HH:MM>   Working hours, e.g. 08:30-16:30
  --workdays <list>       Working days, e.g. mon-fri or mon,tue,thu
  --busy <start/end>      Busy range in ISO, repeatable, e.g. 2026-10-12T10:00/2026-10-12T11:00
  --text "<text>"         Inline text instead of a file/stdin
  -h, --help

Examples
  printf -- "- Finish the deck by Friday ~2h\\n- Call the dentist\\n" | freenotes braindump
  freenotes schedule --days 7
  freenotes plan T1
  freenotes step T1 1 "A one-page memo for Priya, by Monday noon."
  freenotes step T1 1 --done
  echo "T1: done — shipped Thursday" | freenotes report
  freenotes reflect T1 "Starting with the hardest slide made the rest easy."
`;

export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        workspace: { type: "string" },
        ai: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        profile: { type: "string" },
        title: { type: "string" },
        "no-refine": { type: "boolean" },
        done: { type: "boolean" },
        undone: { type: "boolean" },
        days: { type: "string" },
        hours: { type: "string" },
        workdays: { type: "string" },
        busy: { type: "string", multiple: true },
        text: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;

  if (values.help || !command) {
    io.stdout(HELP);
    return command ? 0 : 1;
  }

  const workspacePath = values.workspace ?? io.env.FREENOTES_WORKSPACE ?? `${io.cwd}/.freenotes/workspace.json`;
  const chiefOfStaff = selectChiefOfStaff(values.ai ?? io.env.FREENOTES_AI ?? "auto", values.model, values.effort as Effort | undefined, io);
  const profile = values.profile ?? io.env.FREENOTES_PROFILE;
  const app = new Freenotes({
    repository: new FileWorkspaceRepository(workspacePath),
    chiefOfStaff,
    ...(profile ? { profile } : {}),
  });

  try {
    switch (command) {
      case "braindump": {
        const text = await readInput(rest[0], values.text, io);
        const out = await app.braindump({ text, ...(values.title ? { title: values.title } : {}), refine: !values["no-refine"] });
        io.stdout(`Captured ${out.todos.length} todo${out.todos.length === 1 ? "" : "s"} (chief of staff: ${app.assistantName}).\n\n${renderTodos(out.todos, out.refinements)}\n`);
        if (out.ignoredLines.length) io.stdout(`\nIgnored ${out.ignoredLines.length} non-todo line${out.ignoredLines.length === 1 ? "" : "s"}.\n`);
        io.stdout(`\nNext: freenotes schedule\n`);
        return 0;
      }
      case "schedule": {
        if (values.hours || values.workdays) {
          await app.updateSettings((s) => ({ ...s, workingHours: parseWorkingHours(values.hours, values.workdays, s.workingHours) }));
        }
        const out = await app.schedule({
          ...(values.busy ? { busy: values.busy.map(parseBusy) } : {}),
          ...(values.days ? { policy: { horizonDays: positiveInt(values.days, "--days") } } : {}),
        });
        const ws = await app.workspace();
        io.stdout(`# Schedule\n\n${renderSchedule(out.schedule, ws.todos)}\n\nNext: freenotes plan all\n`);
        return 0;
      }
      case "plan": {
        const target = rest[0];
        if (!target) throw new DomainError("usage", "Usage: freenotes plan <T1|all>");
        const ws = await app.workspace();
        const outs = target === "all" ? await app.planAll() : [await app.plan(target.toUpperCase())];
        for (const o of outs) {
          const todo = ws.todos.find((t) => t.id === o.plan.todoId)!;
          io.stdout(renderExecutionPlan(o.plan, todo) + "\n\n");
        }
        io.stdout(`Next: do the work, then \`freenotes report\` with one line per todo (T1: done — …).\n`);
        return 0;
      }
      case "step": {
        const [todoId, stepArg, ...noteParts] = rest;
        const note = noteParts.join(" ") || values.text;
        const step = Number(stepArg);
        if (!todoId || !Number.isInteger(step) || (!note && !values.done && !values.undone)) {
          throw new DomainError("usage", 'Usage: freenotes step <T1> <n> ["<what you wrote>"] [--done|--undone]');
        }
        const out = await app.step(todoId.toUpperCase(), step, { ...(values.done ? { done: true } : values.undone ? { done: false } : {}), ...(note ? { note } : {}) });
        const mine = out.progress.filter((p) => p.todoId === todoId.toUpperCase()).sort((a, b) => a.step - b.step);
        const plan = out.workspace.plans[todoId.toUpperCase()]!;
        for (const s of plan.steps) {
          const p = mine.find((x) => x.step === s.order);
          io.stdout(`${p?.done ? "[x]" : "[ ]"} ${s.order}. ${s.action}${p?.note ? `\n       ${p.note.replace(/\n/g, "\n       ")}` : ""}\n`);
        }
        return 0;
      }
      case "report": {
        const text = await readInput(rest[0], values.text, io);
        const out = await app.report(text);
        const ws = await app.workspace();
        io.stdout(`# Achievement report\n\n${renderAchievementReport(out.report, ws.todos, ws.reflections)}\n`);
        if (out.unmatchedLines.length) io.stdout(`\nCould not match ${out.unmatchedLines.length} line${out.unmatchedLines.length === 1 ? "" : "s"} to a todo:\n${out.unmatchedLines.map((l) => `  ${l.trim()}`).join("\n")}\n`);
        if (out.report.reflections.length) io.stdout(`\nNext: answer a reflection — freenotes reflect ${out.report.reflections[0]!.todoId} "…"\n`);
        return 0;
      }
      case "reflect": {
        const [todoId, ...answerParts] = rest;
        const answer = answerParts.join(" ") || values.text;
        if (!todoId || !answer) throw new DomainError("usage", 'Usage: freenotes reflect <T1> "<answer>"');
        const out = await app.reflect(todoId.toUpperCase(), answer);
        io.stdout(`Recorded.\n\n> ${out.reflection.question}\n\n${out.reflection.answer}\n`);
        const remaining = (await app.workspace()).report?.reflections.filter((r) => !(out.workspace.reflections.some((a) => a.todoId === r.todoId))) ?? [];
        if (remaining.length) io.stdout(`\n${remaining.length} reflection${remaining.length === 1 ? "" : "s"} left: ${remaining.map((r) => r.todoId).join(", ")}\n`);
        return 0;
      }
      case "todos": {
        const ws = await app.workspace();
        io.stdout(renderTodos(ws.todos) + "\n");
        return 0;
      }
      case "notes": {
        const ws = await app.workspace();
        const kind = rest[0];
        const list = ws.compositions.filter((c) => !kind || c.kind === kind);
        if (list.length === 0) io.stdout("_No compositions yet._\n");
        for (const c of list) io.stdout(`${c.id}  ${c.kind.padEnd(18)} ${formatDay(c.createdAt)}  ${c.title}\n`);
        return 0;
      }
      case "show": {
        const ws = await app.workspace();
        const ref = rest[0] ?? "latest";
        const c: Composition | undefined = ref === "latest" ? ws.compositions.at(-1) : ws.compositions.find((x) => x.id === ref || x.id.startsWith(ref));
        if (!c) throw new DomainError("not-found", `No composition ${ref}`);
        io.stdout(`# ${c.title}\n\n${c.body}\n`);
        return 0;
      }
      case "config": {
        if (values.hours || values.workdays || values.days) {
          await app.updateSettings((s) => ({
            workingHours: values.hours || values.workdays ? parseWorkingHours(values.hours, values.workdays, s.workingHours) : s.workingHours,
            policy: values.days ? { ...s.policy, horizonDays: positiveInt(values.days, "--days") } : s.policy,
          }));
        }
        const ws = await app.workspace();
        io.stdout(`workspace: ${workspacePath}\nchief of staff: ${app.assistantName}\nworking hours: ${JSON.stringify(ws.settings.workingHours.toJSON())}\npolicy: ${JSON.stringify(ws.settings.policy)}\n`);
        return 0;
      }
      default:
        io.stderr(`Unknown command "${command}".\n\n${HELP}`);
        return 2;
    }
  } catch (error) {
    if (error instanceof DomainError || error instanceof ChiefOfStaffError) {
      io.stderr(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

function selectChiefOfStaff(mode: string, model: string | undefined, effort: Effort | undefined, io: CliIO): ChiefOfStaff {
  const hasCredentials = Boolean(io.env.ANTHROPIC_API_KEY || io.env.ANTHROPIC_AUTH_TOKEN);
  const resolved = mode === "auto" ? (hasCredentials ? "claude" : "heuristic") : mode;
  switch (resolved) {
    case "claude":
    case "anthropic":
      return new AnthropicChiefOfStaff({ ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
    case "heuristic":
      if (mode === "auto") io.stderr("No ANTHROPIC_API_KEY found; using the heuristic chief of staff. Set the key to use Claude.\n");
      return new HeuristicChiefOfStaff();
    default:
      throw new DomainError("usage", `Unknown --ai "${mode}". Use auto, claude or heuristic.`);
  }
}

async function readInput(file: string | undefined, inline: string | undefined, io: CliIO): Promise<string> {
  if (inline) return inline;
  if (file) return readFile(file, "utf8");
  return io.readStdin();
}

function positiveInt(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new DomainError("usage", `${flag} expects a positive integer, got "${raw}"`);
  return n;
}

const DAY_NAMES: Record<string, Weekday> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function parseWorkingHours(hours: string | undefined, workdays: string | undefined, current: WorkingHours): WorkingHours {
  const existing = current.toJSON();
  const anyWindow = Object.values(existing)[0] ?? { start: "09:00", end: "17:00" };
  let start = LocalTime.parse(anyWindow.start);
  let end = LocalTime.parse(anyWindow.end);
  if (hours) {
    const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(hours.trim());
    if (!m) throw new DomainError("usage", `--hours expects HH:MM-HH:MM, got "${hours}"`);
    start = LocalTime.parse(m[1]!);
    end = LocalTime.parse(m[2]!);
  }
  let days: Weekday[] = Object.keys(existing).map((k) => Number(k) as Weekday);
  if (workdays) {
    const range = /^([a-z]{3})-([a-z]{3})$/.exec(workdays.trim().toLowerCase());
    if (range) {
      const from = DAY_NAMES[range[1]!];
      const to = DAY_NAMES[range[2]!];
      if (from === undefined || to === undefined) throw new DomainError("usage", `--workdays: unknown day in "${workdays}"`);
      days = [];
      for (let d = from; ; d = ((d + 1) % 7) as Weekday) {
        days.push(d);
        if (d === to) break;
      }
    } else {
      days = workdays
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((name) => {
          const d = DAY_NAMES[name.slice(0, 3)];
          if (d === undefined) throw new DomainError("usage", `--workdays: unknown day "${name}"`);
          return d;
        });
    }
  }
  const spec: Partial<Record<Weekday, { start: LocalTime; end: LocalTime }>> = {};
  for (const d of days) spec[d] = { start, end };
  return WorkingHours.of(spec);
}

function parseBusy(raw: string): TimeRange {
  const [s, e] = raw.split("/");
  const start = new Date(s ?? "");
  const end = new Date(e ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new DomainError("usage", `--busy expects <startISO>/<endISO>, got "${raw}"`);
  return TimeRange.of(start, end);
}
