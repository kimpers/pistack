# piStack qualification evaluations

Run with already available Node, npm, Bun and Pi; no installer or model call is part of this harness:

```sh
node evals/run.mjs evals/results/local.json
node --import ./tests/host-loader.mjs --test tests/*.test.ts
```

`cases.json` contains representative bug-fix, review, UI-proof, autonomous pause/resume and reflection tasks, named source tests and explicit live gates. The harness executes the selected deterministic tests in separate subprocesses, stores raw TAP/stderr, exit codes, test counts and measured subprocess wall time, and fails on missing coverage, skips, malformed output, timeout or test failure. The bug-fix case actually observes a failing boundary regression, applies a minimal fixture fix and reruns green. Other cases reuse production adapters where available and explicitly label static instruction checks. They do **not** launch agents or pretend the fixture application is a real product workflow.

Results record actual platform/tool versions, dirty HEAD and a SHA-256 of candidate source/test/eval/CI inputs (excluding results, node_modules and the helper readiness marker). Null token/tool-failure metrics mean no live telemetry was collected, not zero-cost or error-free execution. Model request count is zero by construction. Latency includes process/SDK startup and is **not** model/task latency. A green fixture result always retains `releaseQualified: false`.

`results/macos-fixtures.json` is one observed local run, not a baseline comparison. Re-run after source changes. No optimization, token saving, model correctness score, browser proof or platform parity is claimed. The UI case is only a static evidence-policy regression; the autonomy case executes watcher cancellation with an injected clock/forge, not a live goal resume.

## Future authorized live evaluation protocol

For each case, first approve the task, model/provider IDs, panel cardinality/concurrency, token/time budget, tool/capability scope, owned worktrees/processes and network/external effects. Use the native parent protocol; no harness-created executor, fallback shell agent or additional scheduler. Preserve `PI_SUBAGENT_CHILD` in child environments. An unavailable mandatory tool is a blocker, never permission to change protocols.

Record for every run:

- exact source/package/dependency/OS versions and fixture/app identity;
- independent correctness verdict and actual red/green or input/action/result evidence;
- native run IDs, join/cancel/settlement evidence, failed tool calls and retry causes;
- actual model-reported input/output/cache token usage, end-to-end wall time and provider/model IDs;
- surviving screenshots/recordings/PTY logs where required, limits and cleanup ownership;
- approval receipts, skipped/blocked steps and reviewer acceptance.

Bug fix requires real reproduction and regression proof. Review requires independent native contexts and parent acceptance, with same-model panels disclosed. UI proof requires an actual existing app harness or approved browser/PTY integration and retained inspected artifacts. Autonomy requires explicit goal create/pause/reload/resume plus owned-worker settlement, without affecting shared goals. Reflection requires branch-scoped source evidence, approved accepted rows/destination and verified absence of installed-cache mutation. Missing auth, helpers, platform or visual capability leaves the corresponding gate unverified.

Only compare optimization after paired before/after runs on the same tasks and declared models/budgets, with repetitions and correctness held constant. Preserve all failures rather than selecting only successful runs. This document is a protocol for future approval, not permission to run it now.

## Consent-gated clean-host CI

`.github/workflows/pistack.yml` has only a manual dispatch trigger and default-false provisioning input. No dispatch has been performed. After reviewing the candidate pins and transitive lifecycle/download implications, an authorized operator may opt in on disposable GitHub-hosted macOS 15 and Ubuntu 24.04 runners. Do not run `installed-setup.ts` locally: it refuses outside an explicitly approved Actions job and runner-temp home.

The authored job provisions exact Node/Bun/Pi candidates, then calls the real piStack proposal/application to install the three core extensions and required frozen-lock helpers in the owned checkout. It verifies clean setup, an idempotent existing-extension rerun, preserved unrelated settings and real resource loading. It runs final tarball/SDK/fixture/update checks and the installed helper tests/typecheck/help. No browser runtime, credentials, optional extension, live child or goal is provisioned. It uploads qualification logs only; it does not publish piStack or certify a release. Extension transitive dependencies are not a release lock: retain resolved-version evidence and requalify changes.

Linux and clean-host installs remain **not run**. A preprovisioned operator can run the offline commands above, but that is not a substitute for clean-host/network-install or live-workflow qualification. Support and provenance are in `pi/UPSTREAM.md`.
