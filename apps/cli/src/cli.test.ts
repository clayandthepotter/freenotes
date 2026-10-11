import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkingHours } from "@freenotes/core";
import { parseWorkingHours, runCli, type CliIO } from "./cli.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "freenotes-cli-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const FEED = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:m1\nDTSTART:20991012T100000Z\nDTEND:20991012T110000Z\nSUMMARY:Far future\nEND:VEVENT\nBEGIN:VEVENT\nUID:m2\nDTSTART:20200101T090000Z\nDTEND:20200101T093000Z\nRRULE:FREQ=DAILY\nSUMMARY:Daily standup\nEND:VEVENT\nEND:VCALENDAR";

function io(stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIO = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    readStdin: async () => stdin,
    env: { FREENOTES_AI: "heuristic" },
    cwd: dir,
    fetch: (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("work.ics")) return new Response(FEED, { status: 200 });
      if (u.includes("graphql")) return new Response(JSON.stringify({ data: { viewer: { name: "Clay", assignedIssues: { nodes: [{ id: "a", identifier: "ENG-1", title: "Fix login", url: "https://linear.app/t/ENG-1", dueDate: "2026-10-16", estimate: 1, priority: 2, state: { type: "unstarted" }, project: null }] } } } }), { status: 200 });
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch,
  };
  return { cli, out: () => out.join(""), err: () => err.join("") };
}

describe("freenotes CLI", () => {
  it("prints help without a command", async () => {
    const t = io();
    expect(await runCli([], t.cli)).toBe(1);
    expect(t.out()).toContain("Usage: freenotes");
  });

  it("runs the whole loop against a file-backed workspace", async () => {
    const dump = join(dir, "dump.md");
    await writeFile(dump, "- Finish Q4 budget deck by Friday ~2h\n- Call the dentist\n- Write launch post ~1h\n");

    let t = io();
    expect(await runCli(["braindump", dump, "--title", "Monday dump"], t.cli)).toBe(0);
    expect(t.out()).toContain("Captured 3 todos");
    expect(t.out()).toContain("| T1 | Finish Q4 budget deck |");

    t = io();
    expect(await runCli(["schedule", "--days", "7", "--hours", "08:00-12:00", "--workdays", "mon-fri"], t.cli)).toBe(0);
    expect(t.out()).toContain("# Schedule");
    expect(t.out()).toMatch(/\*\*08:\d\d–/);

    t = io();
    expect(await runCli(["plan", "t1"], t.cli)).toBe(0);
    expect(t.out()).toContain("## T1 · Finish Q4 budget deck");

    t = io();
    expect(await runCli(["step", "t1", "1", "A", "deck", "for", "the", "board."], t.cli)).toBe(0);
    expect(t.out()).toContain("[ ] 1.");
    expect(t.out()).toContain("A deck for the board.");
    t = io();
    expect(await runCli(["step", "T1", "1", "--done"], t.cli)).toBe(0);
    expect(t.out()).toContain("[x] 1.");
    t = io();
    expect(await runCli(["step", "T1", "42", "--done"], t.cli)).toBe(1);
    expect(t.err()).toContain("no step 42");

    t = io("T1: done — shipped\nT2 skipped\nT3 partial, outline done\n");
    expect(await runCli(["report"], t.cli)).toBe(0);
    expect(t.out()).toContain("# Achievement report");
    expect(t.out()).toContain("freenotes reflect T1");

    t = io();
    expect(await runCli(["reflect", "T1", "Started", "with", "the", "numbers."], t.cli)).toBe(0);
    expect(t.out()).toContain("Recorded.");

    t = io();
    expect(await runCli(["notes"], t.cli)).toBe(0);
    expect(t.out().split("\n").filter(Boolean)).toHaveLength(5); // braindump, schedule, plan, results, report

    t = io();
    expect(await runCli(["show", "latest"], t.cli)).toBe(0);
    expect(t.out()).toContain("# Achievement report ·");

    t = io();
    expect(await runCli(["config"], t.cli)).toBe(0);
    expect(t.out()).toContain('"1":{"start":"08:00","end":"12:00"}');
    expect(t.out()).toContain('"horizonDays":14'); // --days on schedule is per-run, not persisted
  });

  it("connects, lists, syncs and removes calendars", async () => {
    let t = io();
    expect(await runCli(["calendar"], t.cli)).toBe(0);
    expect(t.out()).toContain("No calendars connected");
    t = io();
    expect(await runCli(["calendar", "add", "webcal://cal.example.com/work.ics", "Work"], t.cli)).toBe(0);
    expect(t.out()).toMatch(/Connected Work \([\w-]+\): \d+ events in view/);
    t = io();
    expect(await runCli(["calendar"], t.cli)).toBe(0);
    expect(t.out()).toContain("Work");
    const id = t.out().trim().split(/\s+/)[0]!;
    t = io();
    expect(await runCli(["calendar", "add", "https://cal.example.com/missing.ics", "Broken"], t.cli)).toBe(0);
    expect(t.out()).toContain("first pull failed");
    t = io();
    expect(await runCli(["calendar", "sync"], t.cli)).toBe(1); // the broken one fails, the rest still sync
    expect(t.err()).toContain("answered 404");
    t = io();
    expect(await runCli(["calendar", "remove", id], t.cli)).toBe(0);
    expect(t.out()).toContain("Removed.");
  });

  it("imports Linear issues with a key from the environment", async () => {
    let t = io();
    expect(await runCli(["linear", "import"], t.cli)).toBe(1);
    expect(t.err()).toContain("LINEAR_API_KEY");
    t = io();
    const cli: CliIO = { ...t.cli, env: { ...t.cli.env, LINEAR_API_KEY: "lin_x" } };
    expect(await runCli(["linear", "import"], cli)).toBe(0);
    expect(t.out()).toContain("1 new, 0 closed");
    expect(t.out()).toContain("+ T1 ENG-1 Fix login by 2026-10-16");
    t = io();
    expect(await runCli(["linear", "import"], { ...t.cli, env: { ...t.cli.env, LINEAR_API_KEY: "lin_x" } })).toBe(0);
    expect(t.out()).toContain("0 new, 0 closed");
  });

  it("reports domain errors with exit code 1 and usage errors with 2", async () => {
    let t = io("# nothing\n");
    expect(await runCli(["braindump"], t.cli)).toBe(1);
    expect(t.err()).toContain("No todos found");

    t = io();
    expect(await runCli(["dance"], t.cli)).toBe(2);
    expect(t.err()).toContain('Unknown command "dance"');

    t = io();
    expect(await runCli(["plan"], t.cli)).toBe(1);
    expect(t.err()).toContain("Usage: freenotes plan");
  });

  it("falls back to the heuristic assistant when no credentials are present", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(["braindump", "--text=- Call mom"], { stdout: (t) => out.push(t), stderr: (t) => err.push(t), readStdin: async () => "", env: {}, cwd: dir });
    expect(code).toBe(0);
    expect(err.join("")).toContain("No ANTHROPIC_API_KEY found");
    expect(out.join("")).toContain("chief of staff: heuristic");
  });
});

describe("parseWorkingHours", () => {
  it("parses ranges and lists", () => {
    expect(parseWorkingHours("08:30-16:30", "mon-wed", WorkingHours.default()).toJSON()).toEqual({
      "1": { start: "08:30", end: "16:30" },
      "2": { start: "08:30", end: "16:30" },
      "3": { start: "08:30", end: "16:30" },
    });
    expect(Object.keys(parseWorkingHours(undefined, "sat,sun", WorkingHours.default()).toJSON())).toEqual(["0", "6"]);
    expect(Object.keys(parseWorkingHours(undefined, "fri-mon", WorkingHours.default()).toJSON()).sort()).toEqual(["0", "1", "5", "6"]);
    expect(() => parseWorkingHours("9-5", undefined, WorkingHours.default())).toThrow(/HH:MM-HH:MM/);
  });
});
