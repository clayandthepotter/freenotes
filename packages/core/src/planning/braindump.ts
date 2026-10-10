import { LocalDate } from "../shared/local-date.js";
import { parseDateExpression } from "./date-expression.js";
import { createTodo, type Priority, type Todo, type TodoDraft } from "./todo.js";

export interface BraindumpParseResult {
  readonly todos: Todo[];
  /** Lines that were not bullets or were empty; kept so nothing the user wrote is silently dropped. */
  readonly ignoredLines: string[];
}

export interface BraindumpParseOptions {
  today: LocalDate;
  /** Code for the first todo, e.g. 1 → "T1". Lets a workspace keep ids stable across braindumps. */
  startAt?: number;
}

const BULLET_RE = /^\s*(?:[-*•–—]|\d+[.)]|\[[ xX]?\])\s*(?:\[[ xX]?\]\s*)?(.*)$/;
const DURATION_RE = /(?:~|\(|\bapprox\.?\s*|\best\.?\s*)?\b((?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours))(?:\s*(?:\d+\s*(?:m|min|mins|minute|minutes)))?|\d+\s*(?:m|min|mins|minute|minutes))\b\)?/i;
const DEADLINE_RE = /\b(?:by|due|before|deadline:?|until)\s+([^,;(]+?)\s*(?=$|[,;(]|\s~)/i;
const PRIORITY_TAG_RE = /\[(high|urgent|important|h|p1|low|l|p3|someday)\]|\((high|urgent|low)\)|(?:^|\s)[#!](high|urgent|low)\b/i;

/**
 * Turns a free-form bulleted braindump into todos.
 *
 *   - Finish Q4 budget deck by Friday ~2h
 *   - [high] Call the dentist
 *   * Write launch post due Oct 20 (1h30m)
 *   1. Book flights !low
 *
 * Deterministic by design: what the user wrote always parses the same way.
 */
export function parseBraindump(text: string, options: BraindumpParseOptions): BraindumpParseResult {
  const todos: Todo[] = [];
  const ignoredLines: string[] = [];
  let next = options.startAt ?? 1;

  for (const rawLine of text.split(/\r?\n/)) {
    const m = BULLET_RE.exec(rawLine);
    const body = (m ? (m[1] ?? "") : rawLine).trim();
    if (!m && !looksLikeBareItem(rawLine)) {
      if (rawLine.trim()) ignoredLines.push(rawLine);
      continue;
    }
    if (!body) continue;
    const draft = parseLine(body, options.today);
    if (!draft) {
      ignoredLines.push(rawLine);
      continue;
    }
    todos.push(createTodo(`T${next}`, todos.length, draft));
    next++;
  }
  return { todos, ignoredLines };
}

/** Lines without a bullet are still todos when they are short imperative phrases, not headings/prose. */
function looksLikeBareItem(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("#") || t.endsWith(":")) return false;
  return t.length <= 140 && !/[.!?]\s+\S/.test(t);
}

export function parseLine(body: string, today: LocalDate): TodoDraft | undefined {
  let rest = body;
  let priority: Priority | undefined;
  let estimatedMinutes: number | undefined;
  let deadline: TodoDraft["deadline"];

  const pm = PRIORITY_TAG_RE.exec(rest);
  if (pm) {
    priority = toPriority((pm[1] ?? pm[2] ?? pm[3])!);
    rest = cut(rest, pm);
  } else if (/^!{1,3}\s*/.test(rest)) {
    priority = "high";
    rest = rest.replace(/^!{1,3}\s*/, "");
  }

  const dur = DURATION_RE.exec(rest);
  if (dur) {
    const minutes = parseDuration(dur[1]!);
    if (minutes) {
      estimatedMinutes = minutes;
      rest = cut(rest, dur);
    }
  }

  const dl = DEADLINE_RE.exec(rest);
  if (dl) {
    const parsed = parseDateExpression(dl[1]!, today);
    if (parsed) {
      deadline = parsed;
      rest = cut(rest, dl);
    }
  }

  const title = rest
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:\-–—]+$/g, "")
    .trim();
  if (!title) return undefined;

  return {
    title,
    ...(priority ? { priority } : {}),
    ...(estimatedMinutes ? { estimatedMinutes } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

function toPriority(tag: string): Priority {
  switch (tag.toLowerCase()) {
    case "high":
    case "urgent":
    case "important":
    case "h":
    case "p1":
      return "high";
    default:
      return "low";
  }
}

export function parseDuration(text: string): number | undefined {
  const t = text.toLowerCase();
  let minutes = 0;
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/.exec(t);
  const m = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(t);
  if (h) minutes += Math.round(Number(h[1]) * 60);
  if (m) minutes += Number(m[1]);
  return minutes > 0 ? minutes : undefined;
}

function cut(text: string, m: RegExpExecArray): string {
  return (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
}

export { LocalDate };
