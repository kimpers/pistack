---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /skill:swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.


# Swarm

Fan out N independent local Pi workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not the configured concurrency limit.
4. Use the configured `swarm workers` role, or validated discovered IDs per race arm. Name actual models up front and disclose same-model panels.
5. Give each worker its own writable output when it writes. Use native managed worktrees for parallel code writes and unique runtime output bindings for reports. A branch alone is not cwd isolation. Verification and measurement briefs name exact SHAs. Measurement briefs also name sample count, what one sample means, and run order. Each worker records those SHAs and that method in its result.

## Phase B: Fan out

Launch the full N through native pi-subagents in batches bounded by configured concurrency. Use `pistack.poteto-agent` for implementation, `pistack.analyst` for read-only sources, or an existing discovered validator with required control tools. Use fresh contexts, explicit role models and local managed worktrees from clean `HEAD` or a supported named `baseRef`. No cloud executor or child fanout. Return runtime artifacts and handoff manifests.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

Record dropouts and distinguish content failures from infrastructure blockers. Required coverage never passes with a missing slice. A race may select only under its declared rule; join or explicitly cancel and reconcile every remaining owned run before final acceptance.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and rerun that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
