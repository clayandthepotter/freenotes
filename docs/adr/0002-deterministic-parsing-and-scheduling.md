# ADR 0002 · Deterministic parsing and scheduling; the model only fills gaps

**Status:** accepted · 2026-10-10

## Context

An LLM could parse the braindump and build the schedule directly. That is flexible but non-reproducible, slow, costly, and it can quietly change what the user wrote.

## Decision

- The braindump, date expressions and results are parsed by deterministic code in the domain. Same text, same todos, every time, offline.
- The schedule is built by a deterministic algorithm (EDF for dated items, gap-fill for undated ones).
- The chief of staff is consulted for judgement calls only: effort estimates and priority where the user gave none, decomposition into steps, and the achievement report.
- `applyRefinements` refuses to overwrite explicit user estimates; the UI shows the estimate source.

## Consequences

- The app is useful with no API key at all.
- Model output is validated by domain invariants (`validateExecutionPlan`, `validateAchievementReport`) and repaired where the schema cannot express the rule.
- Natural-language parsing is intentionally conservative; unrecognised lines are surfaced as `ignoredLines` / `unmatchedLines` rather than guessed.
