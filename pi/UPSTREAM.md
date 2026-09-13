# Upstream boundary

- Source: [cursor/plugins](https://github.com/cursor/plugins).
- Imported baseline: `93b00b89ef425a9c1bac0d0b317dfc49c930ac99`.
- Upstream plugin: pstack `0.14.8`, original `pstack/` paths retained.
- License: [pstack/LICENSE](../pstack/LICENSE), MIT, Copyright (c) 2026 Lauren Tan. Retain this notice with every distribution and substantial adaptation.
- Local branch: `feat/pistack`. The owner selected `git@github.com:kimpers/piStack.git` and authorized commit/push after verification. Root npm package `pistack` remains provisional and private. No npm publication is authorized.

## Adaptations in U1/U2

| Path | Reason |
| --- | --- |
| Root `package.json` | Explicit Pi extension/resource allowlist and documented pi-subagents package-agent manifest. No bundled shared extensions or automatic lifecycle scripts. Dormant Benny/make-bot-ui and unrelated monorepo packages excluded from distribution/discovery. |
| Root `.gitignore` | Explicitly retain `pi/` source even when operator-global ignore patterns hide that directory. Existing node_modules exclusions remain. |
| `pi/extensions/pistack.ts`, `pi/lib/` | Pi-owned command, branch-persistent opt-in mode/checklist, native setup proposal/approval, model discovery/config and passive doctor. Not an executor or scheduler. |
| `pi/dependencies.json` | Exact locally observed candidate pins and motivations. No release compatibility promise or install approval. |
| `pi/agents/` | Adapt the two upstream agents through installed-package precedence, explicit child tools/skills and no implicit child fanout. Comment-only role keeps legal/public-contract exceptions and parent-owned code fixes. Correctness suppressions must not leave unverified broken code. |
| `pi/references/integration.md` | Shared authority/model/state/skill interfaces. Direct skill invocation and opt-in mode use the same authority/routing contract; the original skill tree is not duplicated. |
| `pstack/skills/poteto-mode/scripts/bootstrap.ts` | Approved narrow U2/U4 boundary change: checks current dependency/lock readiness, never installs or restarts. Only an explicitly approved setup step may install and write the readiness marker. Watcher/store/cleanup changes are recorded in U4 below. |
| `tests/` | Built-in Node tests plus real installed Pi SDK/SessionManager/ModelRegistry/resource-loader integration with isolated fixtures. No test dependencies installed. |

## U3 skill ports

The explicit manifest now activates 45 original-path skills, including all 21 principles. Every direct entry and playbook loads the common integration policy. Hidden leaves stay hidden from automatic discovery and remain directly invocable; mode routes through the original poteto-mode index. No generated second corpus is maintained.

Targeted source edits replace Task/model/cloud/path/trigger assumptions with public native Pi workflows. Portable rubrics, epistemics, feature-map examples and TypeScript patterns remain; principle bodies change only for approved authority/learning/green-unit conflicts. Pause/pickup/cleanup remove unsafe transcript and deletion assumptions. PR and autoplay instructions preserve independent verification, frontier/pinned-head and distinct merge-authority contracts. Parent-managed phases replace unsupported child orchestration. The new analyst profile has read-only builtins and no ambient extensions. Private child skill paths resolve original sources.

`pstack/skills/deslop/` imports cursor-team-kit from the same baseline SHA. Its local LICENSE retains MIT Copyright (c) 2026 Cursor. Pi changes add shared authorization, explicit base selection and preservation of security checks. No other team-kit tooling is imported.

`pi/references/{delegation,history,authoring,verification,runtime,skills}.md` centralize the new contracts. The U3 history adapter now provides read-only bounded workspace discovery, public SessionManager ancestry, stable evidence references and reviewed reflection-destination checks; runtime helper adaptations are recorded in U4 below. `pi/lib/history.ts` and its two registered tools avoid session migration writes, installed extension internals and general memory/indexing. The four upstream history skills link executable tool usage through the shared reference.

`tests/skills.test.ts` and `tests/workflows.test.ts` check resource loading, direct skill contracts, hidden routing, links, unsafe instruction regressions and workflow/authority invariants. These static/fixture tests are not model compliance, child launch, live browser/PTY or network integration proof.

## U4 retained runtime ports

`pstack/skills/poteto-mode/scripts/orch/frontier.ts` isolates gh-first linear/frozen topology and double-read forge heads; the existing plain-file store, ledger, inbox and lock semantics remain. Graphite is no longer a requirement. Watcher reader/policy tests remain upstream-adjacent; targeted changes reject stale-head checks and changed queue topology, expose non-authorizing head proof, and stop owned polling/GitHub subprocesses on interruption. No agent executor or goal scheduler was added.

`pi/lib/execution-profile.ts` reuses configured models/roles and separates ten default scenarios from concurrency. The retained Node plan checker consumes its explicit task profile and chooses evidence by surface/authorized continuation. `pi/lib/worktree-cleanup.mjs` is a portable read-only adapter behind the original shell entry point, using explicit native settlement receipts and bounded selected Pi JSONL ancestry. No deletion API or ownership registry exists; all audit rows deny deletion authorization.

`tests/runtime.test.ts` and `tests/autonomy.test.ts` exercise actual store/policy/checker/audit code with isolated Git/filesystem and injected forge/process evidence. The personal macOS setup approved `bun install --frozen-lockfile` and recorded helper readiness. With dependencies retained, all 52 Bun helper tests, strict TypeScript checking and both CLI help commands passed. Missing-dependency fixtures still verify the actionable no-install failure path. Live native lifecycle/forge proof, Linux qualification and independent release review remain explicit gates. See [runtime](references/runtime.md) for interfaces and qualification commands.

## Refresh procedure

1. Use reviewed Git imports from a pinned upstream commit; never have installed users update directly from upstream main. Preserve ancestry and `pstack/` paths.
2. Separate upstream-import commits from Pi-adaptation commits when the owner authorizes commits. Record the new SHA/plugin version and list changed/new/deleted skills, references, playbooks, agents and helper dependencies.
3. Review the adapter seams above and any new upstream coupling. Do not let an upstream manifest accidentally re-enable Benny, make-bot-ui or unported skills. Resolve shared-reference links against the packaged allowlist.
4. Requalify the exact dependency set against supported Pi/macOS/Linux versions, effective source/filter conflicts, model policy and real child/browser/PTY workflows. Candidate pins are not sufficient proof.
5. Run `npm test`, packaging validation and U3/U4/U5 workflow/update-rehearsal checks. Review unresolved incompatibilities rather than silently dropping features.
6. Only the owner chooses final distribution identity, repository/npm ownership, releases and publication. Removing piStack must not remove shared packages or personal policy.

The imported baseline is retained in Git ancestry. No real newer upstream import is qualified by this work. Earlier upstream evolution is not audited by the synthetic rehearsal below.

## U5 packaging and update qualification

Root `README.md` is automatically included by npm even with a `files` allowlist. At the owner's request, it now gives a concise piStack purpose, local and Git installation steps. It links to the upstream pstack and original catalog at this document's imported SHA instead of reproducing the catalog. Git ancestry and license files remain intact. Other plugins are not bundled. `tests/upstream-sync.test.ts` rejects missing or stale README upstream pins when the recorded baseline advances. Active-source Markdown scans exclude installed `node_modules` while retaining owned helper documentation and broken-link checks.

`tests/package.test.ts` now creates and extracts an actual offline, lifecycle-disabled npm tarball into a temporary home, then loads its one extension and 45 skills with the real Pi resource loader. It checks attribution bytes, helper lock inclusion, relative Markdown links/imports, private child skill paths and the absence of deferred packs/dependencies/tests/evals. The test tarball is only extracted for validation, not installed or published. Separately, the owner installed the local checkout through Pi. Package-agent public discovery remains a parent-only test; resource listing is not a child execution claim.

`tests/upstream-sync.test.ts` rehearses an ordinary Git update entirely in an owned temporary repository: import original baseline files, commit a Pi adaptation checkpoint, create a synthetic upstream change and merge it. The fixture adds a skill, changes a principle and portable rubric, deletes an adapted skill and changes helper package/lock dependencies. It detects the actual modify/delete conflict, preserves the portable additions and shared integration policy, inventories dependencies, rejects missing/new resources and broken links, and requires explicit index/allowlist resolution. The fixture holds the unqualified dependency change rather than installing it. Separate negative cases reject wildcard/Benny/make-bot-ui re-enablement and deleted adapter imports. No custom updater or generated corpus is distributed. This is a synthetic Git rehearsal, not a claim that an unknown real upstream update merges cleanly.

Development-only `evals/cases.json`, `evals/run.mjs` and `evals/results/macos-fixtures.json` record representative bug-fix, review, UI-proof, autonomous pause/resume and reflection checks. They distinguish executed adapter/fixture evidence from static instruction assertions. Each result retains raw TAP, wall-clock subprocess latency, actual environment versions, a source fingerprint and its unverified live gate. Tokens and live tool failures are null because no live telemetry was collected; no model calls occurred. **No optimization is claimed** without paired correctness/token/latency measurements.

### Personal installation verification

On 2026-09-13, the owner-authorized local installation reused the three existing core extensions, installed frozen Bun dependencies, and preserved unrelated personal settings. A second real setup application proposed no installs and made no changes.

The parent independently passed all 103 Node tests with no skips, including package-agent discovery. The installed helper suite passed 52 tests, strict TypeScript checking and both CLI help commands. Actual native runs of `pistack.poteto-agent` and `pistack.analyst` completed a reproduced test fix and independent review with their private skills and restricted tools intact.

A live Pi TUI started with mode off, retained mode on across `/reload`, executed checklist start/completion and active-session history tools successfully, then persisted mode off and the completed checklist before exit. A second Pi process resumed that session with mode off and the completed checklist intact. These are bounded local smoke checks, not clean-host, cross-platform, autonomous goal, browser or authenticated forge qualification. No unrelated personal skill warnings were repaired or hidden.

### Support matrix (candidate, not release-qualified)

| Surface | Observed evidence | Remaining gate |
| --- | --- | --- |
| macOS arm64, Node 26.0.0, Bun 1.3.14, npm-installed Pi 0.85.1 | Personal local package installation, deterministic suites, real SDK/SessionManager/ModelRegistry/resource-loader, actual offline tarball and isolated Git rehearsal | Not a clean-host network installation or live workflow qualification |
| macOS 15 GitHub-hosted CI | Manual matrix authored; **not run** | Authorized provisioning and passing uploaded evidence on the actual runner |
| Linux / Ubuntu 24.04 GitHub-hosted CI | Portable Node/Bun source and injected fixtures only; **Linux CI not yet run** | Authorized clean-host run, cleanup/process behavior, installed helper and workflow evidence |
| Node >=22.19.0 advertised minimum | Runtime prerequisite policy; only 26.0.0 observed locally in this stage | Qualify the minimum and any additional supported Node/Pi versions before a compatibility promise |
| Core candidates: pi-subagents 0.66.0, pi-interactive-shell 0.15.2, pi-goal 0.1.7 | Personal setup reused existing versions without upgrades; source/API inspection and injected setup fixtures | Clean core network installation, auth, native child join/cancel, PTY and goal pause/resume; goal's older peer namespace is not assumed compatible |
| Optional candidates: browser 0.6.6, MCP 2.32.1, web-access 0.28.0, interview 0.12.0 | Configuration/missing-capability contracts and fixture checks | Selected package loading, connectors/provider auth and actual tool execution; browser runtime/recording require separately approved prerequisites |
| Required retained helpers | Approved frozen-lock installation and readiness marker on personal macOS; 52/52 Bun tests, strict typecheck and both CLI help commands passed | Clean-host/Linux installation and live forge workflows; installed lock resolutions do not qualify the extension dependency manifest |
| Live bug fix/review/UI/autonomy/reflection | Five representative deterministic cases, with static-only parts labeled | Model-driven correctness, independent review, browser/Electron/PTY artifacts, real forge/auth and approved native lifecycle evidence |

### Authored CI and release gates

`.github/workflows/pistack.yml` is manual `workflow_dispatch` only, with a required **default-false** `approve_provisioning` input gating the entire hosted macOS/Linux matrix. The authoring approval is not permission to dispatch it. A future authorized run explicitly downloads Node 26.0.0, Bun 1.3.14 and Pi 0.85.1; the isolated real setup script proposes/applies exactly the three core candidates above plus `bun install --frozen-lockfile` in the verified owned scripts directory. Only successful dependency checks record the readiness fingerprint. The frozen upstream lock constrains its `latest` development declarations; no floating installer command or silent browser/auth download is used. Shared npm transitive resolutions and runner images still need recorded-version review; these are candidate pins, not a fully reproducible release lock.

The job uses only disposable runner-temp settings/homes, verifies clean setup and an existing-extension rerun, loads actual resources, runs local suites and installed helpers/typecheck/help, and retains logs as CI artifacts. It never publishes the private package, launches live children or creates goals. Hosted CI has **not run**. Personal local installation reused existing core extensions and applied the approved helper proposal; it did not test clean core network provisioning. See development `evals/README.md` for exact offline commands and future live evaluation protocol.

Release still requires: an owner-approved exact dependency/platform set; clean-host network installation and cross-platform helper evidence; parent package-agent discovery and independent reviewer acceptance; real model/auth/worker-goal-monitor/browser/PTY and PR workflow proof; minimum-Node qualification; and separate npm identity/publication approval. Repository commit/push is authorized after parent verification. None of those in-scope capabilities is silently deferred or replaced by fixture success. Benny and make-bot-ui remain the only expressly deferred integration packs.
