import type { Todo, TodoId } from "../planning/todo.js";

export type ResultStatus = "done" | "partial" | "blocked" | "skipped";

/** What the executive reports happened for one todo. */
export interface TodoResult {
  readonly todoId: TodoId;
  readonly status: ResultStatus;
  readonly notes: string;
}

export interface ResultReportParseResult {
  readonly results: TodoResult[];
  /** Lines that could not be tied to a todo. Surface them, never drop them. */
  readonly unmatchedLines: string[];
}

const STATUS_WORDS: Array<[RegExp, ResultStatus]> = [
  [/\b(done|complete|completed|finished|shipped|delivered|sent|closed)\b|✅|✓|\[x\]/i, "done"],
  [/\b(partial|partially|half|halfway|in progress|wip|started|ongoing|mostly)\b|🟡/i, "partial"],
  [/\b(blocked|stuck|waiting on|waiting for|can't|cannot|couldn't)\b|🔴|⛔/i, "blocked"],
  [/\b(skipped|skip|dropped|didn't|did not|not started|postponed|deferred|punted)\b|⏭/i, "skipped"],
];

const BULLET_PREFIX = /^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]\]\s*)?/;
const CODE_RE = /\b(T\d+)\b/;

/**
 * Parses the executive's results composition into per-todo results.
 *
 *   T1: done — shipped the deck Thursday night
 *   - T2 partial, got halfway through the calls
 *   - [x] Write launch post — published
 *   - Book flights: skipped, waiting on dates
 *
 * Each line is matched to a todo by code ("T3") or by title (fuzzy), then a status is inferred
 * from the words used; lines with no recognizable status default to "done" when marked [x], else "partial".
 */
export function parseResultReport(text: string, todos: readonly Todo[]): ResultReportParseResult {
  const results = new Map<TodoId, TodoResult>();
  const unmatchedLines: string[] = [];
  const byId = new Map(todos.map((t) => [t.id, t] as const));

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.replace(BULLET_PREFIX, "");

    let todo: Todo | undefined;
    const code = CODE_RE.exec(body);
    if (code) todo = byId.get(code[1]!);
    if (!todo) todo = matchByTitle(body, todos);
    if (!todo) {
      unmatchedLines.push(rawLine);
      continue;
    }

    const notesSource = body.replace(todo.id, "").replace(todo.title, "");
    const inNotes = detectStatus(notesSource);
    const status = inNotes?.status ?? detectStatus(line)?.status ?? (/\[x\]/i.test(line) ? "done" : "partial");
    // Strip the status word only when it is used as a label at the head ("T1: done — …"), never mid-sentence.
    const isLabel = inNotes !== undefined && /^[\s:\-–—,;]*$/.test(notesSource.slice(0, inNotes.index));
    const notes = cleanNotes(isLabel ? notesSource.slice(0, inNotes.index) + " " + notesSource.slice(inNotes.index + inNotes.length) : notesSource);
    const existing = results.get(todo.id);
    results.set(todo.id, {
      todoId: todo.id,
      status,
      notes: existing && existing.notes ? `${existing.notes} ${notes}`.trim() : notes,
    });
  }

  return { results: [...results.values()], unmatchedLines };
}

interface StatusMatch {
  status: ResultStatus;
  index: number;
  length: number;
}

/** The status word that appears earliest in the text wins ("skipped, waiting on dates" → skipped). */
function detectStatus(text: string): StatusMatch | undefined {
  let best: StatusMatch | undefined;
  for (const [re, status] of STATUS_WORDS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { status, index: m.index, length: m[0].length };
  }
  return best;
}

function cleanNotes(text: string): string {
  return text
    .replace(/^[\s:\-–—,;]+|[\s:\-–—,;]+$/g, "")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function matchByTitle(text: string, todos: readonly Todo[]): Todo | undefined {
  const haystack = normalize(text);
  let best: { todo: Todo; score: number } | undefined;
  for (const todo of todos) {
    const needle = normalize(todo.title);
    if (!needle) continue;
    let score = 0;
    if (haystack.includes(needle)) score = 1;
    else {
      const words = needle.split(" ").filter((w) => w.length > 2);
      const hits = words.filter((w) => haystack.includes(w)).length;
      score = words.length ? hits / words.length : 0;
    }
    if (score >= 0.6 && (!best || score > best.score)) best = { todo, score };
  }
  return best?.todo;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
