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

function io(stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIO = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    readStdin: async () => stdin,
    env: { FREENOTES_AI: "heuristic" },
    cwd: dir,
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
