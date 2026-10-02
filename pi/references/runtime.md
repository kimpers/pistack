# Long-running work and retained helper boundary

## Continuation and ownership

pi-goal is the sole explicit autonomous continuation owner. Only after an authorized objective, scope, budget and stop conditions are stated may the user run `/goal [--tokens N] <objective>` or the parent use the available `create_goal` tool per its schema. Mode on never creates a goal. Inspect `/goal status` or active `get_goal`. Mark complete with `update_goal({ status: "complete" })` only after actual proof. That tool cannot pause or resume: those are user commands `/goal pause`, `/goal resume`, `/goal clear`. On a blocker/stop, cease task work, report the blocked state and request the user's pause through the supported control surface; never mark a blocked objective complete to suppress continuation. Reload pauses an active goal; do not silently resume it.

Native pi-subagents completion notifications own child wakeups. For non-agent app/CI/watcher processes use pi-interactive-shell's documented monitor mode and exact session IDs; read its public guide first. Keep quiet auto-exit disabled for watchers and set a finite timeout. Match explicit events, then read the actual status/head and terminal evidence. Quiet exit, timeout, EOF, stale state and notification delivery are not success. No cloud sleepers, shell-agent fallback, second goal loop or additional scheduler. For a timed audit with no event, an explicitly owned finite monitored wait can wake the existing task; it cannot launch a new executor. Stop/reconcile that monitor on task pause.

Pause means no new writes/launches. Ask owned live workers to checkpoint, interrupt or stop the exact owned runs, verify their settlement and retain partial patches. Stop is not resumable; pause may be. Do not transfer a cwd to another writer while the prior owner is live or unknown. Keep unrelated/shared workers, goals, monitors and worktrees untouched. A status lookup is not a restart. Resume from exact run/session and checkpoint evidence, recheck current refs and ownership, and obtain explicit continuation after reload.

## Retained helpers

U4 implements the gh frontier, watcher head/cancellation checks, execution-profile checker and portable read-only audit. Deterministic fixtures exercise the actual source. The personal macOS installation applied the approved frozen-lock helper proposal and recorded readiness. All 52 installed Bun tests, strict typechecking and both CLI help commands passed. These checks do not qualify live forge workflows or other platforms. Missing dependencies or stale readiness still block normal invocation.

The Bun watcher and orchestration store remain under `pstack/skills/poteto-mode/scripts/`. Their bootstrap is check-only, including help. Only explicit setup may propose `bun install --frozen-lockfile` in the verified owned packaged scripts directory and record the package/lock fingerprint after success and dependency checks. Missing, stale or unwritable state blocks use. No helper installs or restarts itself. The Node checker and audit need no Bun dependencies.

### Watcher and store

- `watch-pr/watch-pr` preserves GitHub reader/policy separation, single/stack/frozen-queue modes and NDJSON. Use a finite `--timeout <seconds>` under the exact owned interactive-shell monitor with quiet auto-exit disabled. SIGINT/SIGTERM stops this watcher and its own in-flight GitHub query, exits nonzero, and never touches other goals/workers. Resume requires a new explicitly authorized monitor and fresh observations, not replay of a READY event.
- Single/stack READY ends Babysit, not Shipping. Its open-PR proof names the observed head and `mergeAuthorization: false`. STATUS exit zero is only a successful read. Queued WAITING/merge-queue means merge-ready, not merged; deduplicated silence is not success. ADVANCE/COMPLETE require forge merge evidence. A changed head/state during the multi-query read discards the snapshot; prior-head rollups never verify the current head. Frozen queues reject changed/ambiguous base topology except GitHub's retarget to trunk after a parent merges. One watcher per stack. Upstack conflicts can require owner escalation, not permission for a babysitter to mutate topology.
- `orch/orch.ts` and `orch/store.ts` are bookkeeping only: units, inbox, frontier generations and PR+SHA ledger. They never spawn/wait/wake agents. `orch frontier set --repo <repo>` discovers the current connected open linear stack through `gh`. `--prs 10,11,12` supplies a frozen ordered list, including merged/closed entries; it is not a Graphite pin. Fork PRs, duplicate heads, cycles, branching ambiguity, truncated discovery and changed observations fail closed. Discovery reads forge heads/topology twice before recording; no local branch or Graphite metadata is required. `frontier show` is saved evidence, not a fresh network read. Refresh before acceptance and independently recheck the exact base/head and forge state before any authorized landing.
- A pushed head has no ledger verdict until separately verified. Historical rows remain. The parent enforces verifier-over-worker authority: the store's keyed overwrite is not authorization, and a ledger row is not a merge command. Network observations are not atomic locks against a later push.

### Execution profile and plan checker

Run `node <package>/pstack/skills/poteto-mode/scripts/check-plan.mjs <plan.md> <execution-profile.json>`. It checks shape and unit/live/perf evidence boxes, not whether the evidence is true. It prints the exact live-block marker the plan must use and diagnoses mismatches. No hard-coded provider, goal, cloud or image gate applies to CLI/API surfaces.

Use a task-local JSON profile, not a new personal settings file. Its source schema is `pi/lib/execution-profile.ts`.

| Required field | Value |
| --- | --- |
| `version` | `1` |
| `models` | Complete effective `pistack.json` ModelConfig object from setup |
| `available` | Array of current discovered `provider/model-id` strings |
| `parent` | Object with the current discovered `provider` and `id` |
| `support` | Required for explicit approved effort: current `pistack_models` support rows (`provider`, `id`, `reasoning`, sparse `thinkingLevelMap`); omit only when no explicit effort needs validation |
| `surface` | `visual`, `cli` or `api` |
| `continuation` | `manual` or explicitly authorized `pi-goal` |

`swarm workers` resolves explicit `inherit` through the selected parent. The marker records dispatch selectors and reasoning budget; registry identities remain separate. Obtain `available`, `parent` and `support` from fresh `pistack_models` resolution of that role. The checker consumes this task-local snapshot, not a live registry: call `pistack_models` again immediately before dispatch and use its `runs[].selector` as each native child's `model`. Changed unsupported effort blocks; neither checker nor resolver silently downgrades. Discovery is not authentication/launch proof. Visual review requires screenshots/video/operator review; CLI/API review requires operator/evidence. A mixed-surface plan uses `visual` when any changed interaction needs visual review and names scenarios/artifacts for both surfaces. Its CLI/API lanes may still save logs; the shared review gate requires visual evidence.

Coverage defaults to ten live scenarios, separately from configured concurrency and role panel cardinality. Optional `scenarios` (1–100) differing from ten requires `coverageApproval` naming the explicit user approval evidence; copy that evidence reference into Program checklist. These are declared references for review, not automatic consent verification. Same-model lanes are disclosed in the required live marker. Every scenario needs a saved artifact and pass predicate, including a regression lane against trunk. CLI/API artifacts can be logs; visual artifacts must show the interaction.

Manual Program checklist must contain `Manual continuation only. No goal or scheduler.` and must not arm a goal or periodic tick. An explicitly authorized autonomous profile uses `continuation: "pi-goal"`, `continuationApproval` with a reviewed evidence reference in the checklist, and `pi-goal is the sole continuation owner.` Both profiles name native completion notifications, an explicit go and a status message. Neither the checker nor the profile starts anything.

### Read-only cleanup audit

Run `bash <package>/pstack/skills/poteto-mode/scripts/worktree-audit.sh <repo> <owned-evidence.json>`. The portable Node adapter performs no fetch, deletion or kill. It creates no ownership registry and never reads installed extension internals. Request native `subagent({ action: "worktree.cleanup", mode: "plan", repo })` only through the authorized tool; that is plan-only, not deletion.

Supply a task-local evidence envelope with `version: 1`, canonical `repo`, `taskId`, ISO `observedAt` (no older than five minutes), and `worktrees`. Each exact owned row contains canonical `path`, `runId`, `state: "settled"`, `head`, full `branch` (for example `refs/heads/owned`), `sessionFile`, `sessionId`, `leafId`, and `statusEvidence`/`checkpoint` objects each containing an absolute `path` and SHA-256 `sha256`. Capture native status/handoff references through public tool output, not inferred filenames. The receipt hashes bind supplied files; they do not authenticate tool output or grant deletion consent. Keep those preserved files outside all audited worktrees.

The audit checks actual Git inventory, dirty/untracked/ignored state, current refs, exact Pi v2/v3 session header and selected ancestry, preserved receipt hashes, and supporting `lsof` observations. It does not use transcript mentions, assistant stopReason or timestamps to infer settlement. Missing/unknown/foreign/unsettled/duplicate/stale evidence, detached/locked/prunable worktrees, malformed/bounded sessions and unavailable/inaccessible process checks are held. Main/requested worktrees are excluded. Even a clean settled row is only `review-owned`, with `deletionAuthorized: false`; no output bucket means safe to delete. `lsof` visibility is not a global process guarantee. No processes are terminated.

Any separate deletion remains operator-owned after explicit approval, fresh native settlement and Git/evidence checks. This package supplies no removal API, force flag, approval-fingerprint delete command, process-name kill or cache/simulator sweep. Retain patches and evidence; unknown settlement blocks writer transfer even if the filesystem looks clean.

## Qualification boundary

U4 fixtures do not prove live model-driven pause/resume, browser/PTY/child lifecycle, network/forge workflows or Linux compatibility. Personal macOS helper checks used the approved locked package, including commander 14.0.0, bun-types 1.3.14 and TypeScript 7.0.2 with its locked platform package. Reproduce those checks with `bun test orch watch-pr`, `bun run typecheck`, `bun run orch/orch.ts --help` and `bun run watch-pr/watch-pr --help` from the scripts directory after approved setup. Clean-host and Linux provisioning, actual forge operations and native worker/goal/monitor lifecycle tests remain required. Do not execute an installer without approval. Independent review and live workflow qualification remain release gates. The [history tools](history.md) provide bounded evidence, not runtime readiness or fresh authorization.
