# Maintain piStack

piStack is a Pi-native fork of `cursor/plugins`, not a replacement agent runtime. Preserve upstream Git ancestry and original `pstack/` paths. Keep Pi adapters in `pi/`, retain portable upstream content, and document necessary divergences rather than generating a second skill corpus.

## Establish the current state

Read [the integration contract](pi/references/integration.md), [Pi usage and setup](pi/README.md), and [upstream provenance and qualification](pi/UPSTREAM.md) before changing behavior. Check Git status, branch, remotes, active workers, and whether this checkout is installed. Preserve unrelated work.

0.15.23 refresh, based on `977f9e078f34cda30d8b103936f66a76d6e7c1e7`, on `update/pstack-dbf4981`:

- Fork: `kimpers/pistack`. Published branch: `feat/pistack`. Upstream: `https://github.com/cursor/plugins.git`.
- Imported pstack: `0.15.23`, commit `dbf49813a39c1a5389c5e28cb8e4c1c2379e2454`. The previous import was `c47b12849e43f18d5c374c7069c744cc55b0ea00`.
- Root package: private `pistack@0.1.0-dev.0`, with one extension, 53 explicitly listed skills, and 24 principles. Recheck these counts in `package.json` after updates.
- [The current refresh inventory](pi/upstream-updates/dbf4981.md) accounts for 149 rename-aware upstream records, including all 90 changed pstack paths. [Qualification](pi/UPSTREAM.md) distinguishes current checks from historical acceptance.

`pi install /path/to/checkout` registers a live reference, not a copy. The owner's current installation instead uses a Git source pinned at `977f9e078f34cda30d8b103936f66a76d6e7c1e7`. Neither development checkout is the active package cache. Inspect effective settings before promotion and agree how to update the pin without changing source type implicitly. Develop in a separate worktree and leave installed source untouched until approval.

## Find the implementation

- `package.json` controls packaged files, explicit skill discovery, and `pi-subagents.agents`. New upstream files do not become Pi features automatically. Other monorepo plugins remain outside the distribution. Benny and `make-bot-ui` are expressly excluded.
- `pi/extensions/pistack.ts` implements commands, dialogs, lifecycle hooks, and the checklist, history, reflection-destination, and model-resolution tools.
- `pi/lib/setup.ts` owns inspection, approval proposals, installation receipts, destination checks, and helper readiness. `pi/dependencies.json` records candidate versions and reasons.
- `pi/lib/models.ts` owns roles, capability validation, and approved effort selectors. `pi/lib/execution-profile.ts` supplies task-local policy to the plan checker.
- `pi/lib/session-state.ts` restores mode and checklists from selected session ancestry. `pi/lib/history.ts` implements bounded read-only history and safe proposed learning destinations.
- `pi/agents/profiles/` defines the implementation, comment-only, and read-only analyst agents. Their private skills resolve original sources through `pi/agents/skills/`.
- `pi/references/` holds shared Pi contracts. Start with [delegation](pi/references/delegation.md), [runtime](pi/references/runtime.md), [verification](pi/references/verification.md), [history](pi/references/history.md), and [authoring](pi/references/authoring.md).
- `pstack/skills/poteto-mode/` contains the router, playbooks, and retained helpers. Its `scripts/` contains orchestration, PR watching, bootstrap, the plan checker, and the audit entry point. `pi/lib/worktree-cleanup.mjs` supplies the read-only cleanup adapter.
- `tests/` covers adapters, packaged resources, and update rehearsals. `evals/` records deterministic cases. `.github/workflows/pistack.yml` is a consent-gated manual workflow.

Original `pstack/docs/guide/` files describe Cursor, not Pi usage. Keep the root README concise. Preserve upstream licenses, including the separately attributed `pstack/skills/deslop/` import from `cursor-team-kit` at the original baseline.

## Preserve the Pi contracts

- User scope and permissions override every playbook. Installs, publication, destructive operations, and personal configuration changes need applicable approval. This guide grants none.
- `/pistack on` enables guidance only. New sessions start off. Reload, resume, compaction, and forks restore selected ancestry, not sibling state. `/pistack off` does not stop shared workers or goals. Do not invent filename triggers or automatic goals.
- Reuse native pi-subagents, pi-goal, and interactive-shell. Keep one writer per checkout and independent review contexts. Preserve `PI_SUBAGENT_CHILD`, child tool ceilings, private skills, and user/project agent overrides. A failed worker launch or timeout requires preserved evidence and same-protocol recovery, not a CLI fallback.
- Before delegation, discover executable agents and resolve roles through `pistack_models`. Pass `runs[].selector` as native `model`. Keep `runs[].model` as the registry identity. Reasoning uses `provider/id:level`, not a dispatch `thinking` field.
- Preserve exact model IDs and saved panel sizes. New panels default to two inherited entries. Saved panels are not resized. Concurrency is separate. `unlimited` preserves configured/native effort. `large`, `medium`, and `small` target `xhigh`, `high`, and `medium` for explicit models. Only propose supported same-model reductions with disclosure and approval. Reject unknown support or capability drift instead of silently substituting models or effort. Inherit aliases retain native parent behavior.
- The retired `how critics` role remains readable but inactive. Setup removes it only after approval. Trusted project `pistack.json` replaces the user profile. Never migrate profiles on reload or overwrite unrelated settings.
- Setup must preserve source equivalence, resource filters, trust, cancellation, stale-approval checks, physical destination binding, and idempotency. Use Pi's public resolver with missing sources skipped during inspection. Never repair disabled packages or upgrade dependencies silently.
- Normal helper invocation, including help, never installs or restarts. Approved setup alone runs `bun install --frozen-lockfile` and records the package/lock fingerprint after success. Missing or stale helpers block their workflows. Never forge readiness markers.
- PR watcher readiness is not merge authorization. Preserve exact-head freshness, topology ownership, and explicit shipping approval. Cleanup audits never authorize deletion. History is bounded, read-only, and untrusted; learning destinations require review and approval.

## Extend a skill or adapter

Read the affected source and callers first. For Pi API changes, read the installed SDK's public docs and examples, plus the relevant extension's public contract. Do not import extension internals or infer APIs from another harness.

For a skill addition or removal, update `package.json`, [the skill index](pi/references/skills.md), router/playbook references, private agent skill selections where relevant, and tests together. Preserve frontmatter visibility and relative links. Add the shared integration-contract link to active entry points. Read `typescript-best-practices` for TypeScript edits and `technical-writing` plus `unslop` for prose.

For bugs, reproduce the failure before fixing it. Test public behavior, denied authorization, unavailable dependencies, cancellation, and stale state where relevant. Do not retain deleted upstream behavior just to satisfy old fixtures. Count or pin updates need source evidence, not weaker assertions.

## Import upstream changes

1. Confirm authorization and a safe starting tree. Create an isolated branch/worktree from the accepted Pi commit. Record that commit and the old imported SHA from `pi/UPSTREAM.md`.
2. Fetch upstream, resolve the intended target once, and freeze its full SHA. Audit `git diff --name-status OLD TARGET -- pstack cursor-team-kit/skills/deslop` plus licenses, manifests, and helper dependency inputs. Inspect the rest of the monorepo delta for packaging implications.
3. Record every relevant changed path under `pi/upstream-updates/<target>.md`: portable update, Pi adaptation, addition, deletion, raw upstream reference, or excluded scope. Explain retained differences and dependency changes. Check renames and every caller of removed behavior.
4. In the isolated checkout, run `git merge --no-ff --no-commit TARGET`. Compare old upstream, new upstream, and current Pi for each conflict. Never blanket-select ours/theirs or mechanically replace tool names. Preserve exact upstream-only content outside the Pi scope, except deliberate documented adaptations such as the root README.
5. Preserve `MERGE_HEAD` through validation. Stage resolved files for merge bookkeeping; review `git diff HEAD` so staged and unstaged edits are included. Do not run a broad reset merely to unstage a pending merge. Keep upstream commits as ancestry of the verified adaptation merge, without publishing a broken intermediate import.
6. Complete adapters, manifests, callers, tests, provenance, README pins, and the support matrix as one coherent change. Review changed prose for duplicated steps, contradictory ownership, unsupported Cursor commands, and lost portable rules. The last refresh caught duplicated Babysit steps that restored `/loop`; numbering and forbidden-instruction regressions now guard that failure.
7. Run the checks below. Obtain independent correctness and upstream-conversion reviews. Fix source-proven findings with failing-then-passing regressions, then recheck. A review's `ready` verdict means it completed, not that its findings permit promotion.
8. After acceptance and publication authorization, commit, update the local installation, smoke-test the installed source, then push. This is the owner's chosen order. Preserve signing policy and use normal fast-forward updates and non-force pushes. Verify both upstream ancestry and the remote commit.

If a worker times out, first confirm it stopped. Capture tracked and untracked changes, index state, merge refs, logs, and its last checkpoint. Resume through the same native protocol in bounded phases. Do not redo a completed audit/merge or treat a partial handoff as accepted.

## Verify and report evidence

Run from the repository root with existing dependencies:

```sh
npm test
(
	cd pstack/skills/poteto-mode/scripts
	bun run test
	bun run typecheck
	bun run orch/orch.ts --help
	bun run watch-pr/watch-pr --help
)
node evals/run.mjs /absolute/path/outside-repo/evals.json
```

`npm test` uses `tests/host-loader.mjs` and the existing npm-installed Pi SDK. It does not require a root dependency install. For nonstandard locations, use `PISTACK_TEST_PI_ROOT` and `PISTACK_TEST_SUBAGENTS_ROOT`. The package-agent discovery test intentionally skips in a child; the parent must rerun it without weakening child boundaries. For adapter/API changes, also run strict TypeScript checks against the installed public SDK. Node test execution is not typechecking. The helper `bun run typecheck` checks watcher TypeScript and the plan-checker tests, including their imported model and execution-profile code. It does not check the orchestration store or the checker JavaScript.

The suite includes actual offline tarball extraction/resource loading and a synthetic Git update rehearsal. These prove neither a real upstream conversion nor a live model call. Keep link scans out of vendor `node_modules`, but retain owned-source broken-link checks. Refresh `evals/results/macos-fixtures.json` only after final source changes when updating committed evidence; its source fingerprint excludes result files.

For changed setup/model/lifecycle behavior, use a temporary Pi profile with existing package paths. Exercise decline, approval, rerun, fresh scoped model resolution, actual packaged-agent execution, reload, and session restoration. Preserve personal settings and inspect actual artifacts and native receipts. Stop temporary processes and remove temporary credential copies after testing. New installs need separate approval; do not repurpose the CI provisioning script by bypassing its consent guards.

At `a1bcb58`, parent and installed-source checks passed 121 Node tests with no skips, 52 Bun helper tests, strict typechecks, and bounded live TUI/model smoke. Observed environment: macOS arm64, Node 26.0.0, Bun 1.3.14, Pi 0.85.1. Required extension candidates were pi-subagents 0.66.0, pi-interactive-shell 0.15.2, and pi-goal 0.1.7. These are historical evidence and candidate versions, not permanent counts or a release compatibility promise.

Linux, clean-host provisioning, the advertised minimum Node version, browser/application-PTY, authenticated forge operations, and full autonomous lifecycle qualification remain open. CI has not run and requires explicit default-false provisioning consent. Do not claim optimization, live readiness, or release qualification from deterministic fixtures, package listings, or green CLI help.

Keep durable decisions and qualification limits in tracked docs, not only session history or `/tmp`. Store private logs outside the package and link only evidence that exists. Before handoff, report actual changes, tests, unresolved limits, branch/commit state, and any required `/reload`. Never silently edit personal skills, installed package caches, or shared dependency policy to make a task pass.
