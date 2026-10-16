# Prompts worth copying

Read [the Pi integration contract](../../../../pi/references/integration.md). Replace placeholders with real paths and checks. These examples do not run anything by themselves. Publication examples need explicit approval for the named repository and action. Direct skills are task-local; `/pistack on` is the separate persistent-mode opt-in.

## Understand

- `/skill:poteto-mode read <thread>. restate the underlying issue in your own words, in plain english.`
- `/skill:in-your-own-words <long or messy ask>`
- `/skill:sharpen <your task and restrictions>`
- `/skill:poteto-mode investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /skill:how to understand <subsystem>. then use /skill:why to find out why it broke recently.`
- `/skill:recall my work on <topic> from last week, then read <issue>.`
- `/skill:teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/skill:poteto-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/skill:poteto-mode <symptom>. repro first, then fix and verify.`
- Bug in an app: `/skill:poteto-mode repro this with /skill:verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/skill:poteto-mode repro <bug> first. if there's a cheap test path, /skill:tdd it. then fix and rerun.`
- Feature: `/skill:poteto-mode add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/skill:poteto-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/skill:poteto-mode <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/skill:poteto-mode prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/skill:poteto-mode we need <feature>. /skill:architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/skill:poteto-mode write a tutorial for how i would use <new package> first. then /skill:teach me why it beats the current one.`
- `ask /skill:arena for a second opinion on this thread and our approach.`
- `/skill:poteto-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/skill:poteto-mode plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/skill:interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the dismissals too.
- `/skill:swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/skill:poteto-mode I authorize commits and opening a PR for <repository and branch>. use small verified commits and evidence in the description.`
- `/skill:poteto-mode babysit this pr. get it green.` This requests `drive`, not merge authority. For a one-pass `check`: `/skill:poteto-mode check on pr <number>. anything outstanding?`
- `/skill:poteto-mode I authorize landing <named stack> only after Shipping verification. stop at any unproven lane.`

## Away and back

- `/skill:poteto-mode continue <goal> in a fresh owned worktree off <base> using pi-goal. done means <checks>. I authorize local edits only, not publication. keep a decision log and verified checkpoints. if blocked, preserve the evidence and stop for the missing approval.`
- `/skill:show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/skill:poteto-mode state the full-autopilot plan for <queue>. each item is independent. list the continuation and publication approvals needed, then wait for go.`
- `/skill:poteto-mode plan these changes as an autopilot stack. do not execute or publish until I approve. I will land the stack.`
- `/skill:reflect propose lessons and exact approved-destination candidates. do not apply edits yet.` Approve only edits that change a future decision.
- `/skill:bro` restates the last reply in plain words.

- `/skill:ketchup` recaps this selected session without starting new work.
- `/skill:benchmark-checklist` vets an existing or authorized measurement, without installing tools or stopping unrelated processes.
- `/skill:correct prevent the repeated <mistake> in <repository and scope>. prove the check against both past occurrences. no commits or instruction-file edits without approval.`
