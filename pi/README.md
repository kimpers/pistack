# piStack for Pi

piStack adapts pstack's engineering workflows without bundling another executor, scheduler, browser or memory extension. The package implements the U1–U4 adapters and U5 packaging/update/evaluation fixtures. Personal local installation reused existing core extensions and provisioned the retained helpers through an approved setup proposal. Clean-host installation and live workflow/platform qualification remain release gates. Nothing here is a release-qualified compatibility claim.

## Try the local checkout

Use an existing npm-installed Pi 0.85.1 on macOS or Linux. From a trusted checkout:

```sh
pi -e ./pi/extensions/pistack.ts
```

That loads only the owned extension for a quick trial. To make package resources and package-agent discovery available through normal reloads, explicitly add the checkout through Pi:

```sh
pi install /absolute/path/to/pistack
```

This is an **operator action**, not something setup/startup performs on your behalf. Local sources are references, not copies. For trusted project scope use `-l`; relative package paths resolve against the settings file. Review project trust before loading any project code. The owner selected `git@github.com:kimpers/piStack.git` and authorized commit/push after verification. The npm package remains provisional `pistack`, `private: true`, with no npm publication authorized.

## Commands

- `/pistack on` enables session guidance. It does not start a model turn, worker or goal.
- `/pistack off` turns guidance off. It does not cancel separately owned work. Use `/goal pause` and the pi-subagents stop controls as appropriate.
- `/pistack status` shows mode and the current branch checklist.
- `/pistack checklist` shows all steps. The agent uses `pistack_checklist` to start/add/update steps. Skips require a reason.
- `/pistack setup` runs native Pi scope/capability/model dialogs and one final approval proposal. Optional pi-interview is not required or used by this wizard.
- `/pistack setup cancel` aborts an in-progress setup. In the TUI, Esc on the installation loader cancels. Completed installs and partial package-manager changes are retained and reported, not rolled back or silently removed.
- `/pistack doctor` is passive inspection. It reports effective sources, resource filters, candidate versions, shadowed sources, conflicts, actual loaded/active tool provenance, prerequisites, helper lock readiness, scoped models and current-session subagent owner response.
- `/pistack doctor verify` asks consent before sending a normal model request for public subagent `action: list, capabilities: true` and `action: doctor`. It launches no workers. Actual tool results remain in the transcript; no prose-derived or stale persisted "ready" flag is created. Declining does nothing. This may consume model tokens.

New sessions start off. Resume/reload/compaction restore the full current branch's state; fork/tree navigation inherit only selected ancestry, never a sibling's later mode/checklist. Ephemeral Pi sessions have no restart persistence. Turning off cannot retract prior conversation content.

## Setup proposal and ownership

1. Choose **user** or **trusted project** scope. The wizard reads both effective settings without rewriting them. Pi's own resolver applies manifests, global/project overrides and resource filters, with missing-source action explicitly set to **skip**, never install.
2. Choose optional capabilities and retained helpers, then configure roles, panel sizes, concurrency and reasoning budget using discovered provider/model IDs. `inherit` keeps immediate-parent model/native effort. New/default panels have three entries; saved panels keep every entry, including four-context panels. Concurrency is separate; repeated IDs are not model diversity. Unlimited preserves existing/native effort; large/medium/small target xhigh/high/medium on explicit IDs. Any supported same-ID downgrade and retired `how critics` removal are disclosed for final approval, never silently applied on reload. Unavailable models or unknown effort support require an explicit choice.
3. Review exact pinned extension commands, motivations, prerequisites, target directory, scope, full model configuration and conflicts. Candidate pins are in [dependencies.json](dependencies.json). Existing **enabled exact candidate versions** are reused. Other versions are unqualified, not silently upgraded/downgraded. npm/git/local equivalents, same-scope duplicates, disabled/filtered resources, unresolved sources and foreign tool providers refuse automatic setup. Resolve conflicts yourself with Pi's normal package/config commands and rerun. Setup never quietly enables resources or overwrites another extension implementation.
4. Approve the one proposal. Only then are missing selected extensions installed with `pi install npm:<name>@<pin> [-l]`. This authorizes those packages' normal dependencies and lifecycle scripts. No manual npm install workaround, sudo, browser/CLI download, or extension copy is hidden in piStack startup/help. Declining any picker or final approval writes nothing.
5. A partial failure records completed/running/failed steps in `pistack-setup.json` next to the selected `pistack.json`. Rerun inspects disk again and proposes only missing work; it does not trust an old receipt as proof of an enabled installation. CLI success without the pinned enabled resource is failure. Settings/resources changing after the reviewed snapshot invalidate approval. Unrelated Pi settings are managed/preserved by Pi's package CLI; piStack config writes preserve unknown fields and use atomic replacement.
6. Doctor runs after successful setup against the **currently loaded** runtime. Packages installed just now are not claimed loaded. Run `/reload` at an explicit boundary, then doctor again. Removing piStack never removes shared dependencies automatically.

`pistack.json` lives under Pi's `getAgentDir()` for user scope or `CONFIG_DIR_NAME` under the project cwd. A trusted project file replaces the entire user profile. It contains schema `version: 1`, `models: {version: 1, roles, concurrency, budget?, thinking?}`, selected `optional` package names, and `helpers`. Optional `thinking` maps exact registry IDs to approved effort; reasoning budget is not a token/spend allowance. Before dispatch, use the read-only `pistack_models` role resolver's fresh `runs[].selector` as the native subagent `model`, preserving any `:level` suffix; see [delegation](references/delegation.md). Keep personal policy outside the installed checkout. Existing user/project pi-subagents profiles, overrides, tools and model scopes retain authority. piStack does not write pi-subagents model defaults or agent files; skills pass explicit per-run choices from this role configuration.

## Dependencies and honest readiness

Required core candidates are pi-subagents 0.66.0, pi-interactive-shell 0.15.2 and pi-goal 0.1.7. Optional candidates are browser 0.6.6, MCP adapter 2.32.1, web-access 0.28.0 and interview 0.12.0. These versions were observed locally, **not** fully end-to-end qualified. In particular goal's published peer names still use the older Pi namespace; real loading must be checked on the target installation. No shared extension is a bundled/local Node dependency of piStack.

Doctor checks Node >=22.19.0, the candidate Pi version, Git, Bun, GitHub CLI/auth and selected browser/recording CLI availability. Checks execute bounded `--version`/`gh auth status` probes, not installs or app launches. Browser automation additionally needs agent-browser >=0.35.0 and a browser runtime; recording needs ffmpeg. Extension installation does not install those. MCP connectors/authentication, web-search provider credentials, real browser/PTY evidence and model-driven workflow execution remain separate readiness gates. `getAvailable()` confirms registry/auth configuration, not a successful model request. Tool registration and package-agent listing are not execution proof.

The package profiles are `pistack.poteto-agent`, `pistack.comment-sicko` and read-only `pistack.analyst`. The documented `pi-subagents.agents` manifest loads them below user/project definitions. They use explicit built-in child tools, an empty ambient extension list and explicit private skill selections pointing to original package sources plus `pistack-foundation`. Extra child tools require provider loading plus an allowlist override. They do not inherit the whole parent skill catalog or launch siblings. User/project profiles may shadow them under the same runtime names. The comment profile edits comments only; application fixes and executable verification remain with the parent.

## Retained helpers

PR watcher/orchestration workflows require the retained Bun dependencies even though the user may decline their installation. Doctor then reports those workflows unavailable. The proposal shows exactly `bun install --frozen-lockfile` and the owned package's resolved `pstack/skills/poteto-mode/scripts` directory. Setup records the package/lock fingerprint only after success and commander presence. An unwritable package directory, partial install, stale fingerprint or missing Bun is a not-ready result, not permission to install elsewhere or use sudo. Normal helper invocation, including help, is check-only and cannot install or restart itself. The gh-first frontier resolver, head-coherent non-authorizing watcher, configured plan checker and read-only ownership/transcript audit are ported. On the personal macOS installation, the approved `bun install --frozen-lockfile` succeeded and recorded the readiness marker. The installed suite passed all 52 tests, strict typechecking passed, and both orchestration and watcher CLI help commands succeeded. These checks do not qualify live GitHub/native lifecycle behavior; see the [runtime contract](references/runtime.md).

## Development checks

No dependency installation is needed with existing Node, npm, Bun, Pi and pi-subagents:

```sh
npm test
```

Tests use Node's built-in test runner, isolated temporary homes/settings and the already-installed Pi SDK. The test-only loader locates Pi from PATH (`PISTACK_TEST_PI_ROOT` can override it). Set `PISTACK_TEST_SUBAGENTS_ROOT` for an existing nonstandard subagents installation. The package-agent public-list test must run in a **parent** environment; it explicitly skips inside a child instead of removing the child's capability boundary. It never launches workers. Setup install tests inject a command adapter that writes real fixture package/settings files; they do not prove real network installs. The real Pi resource loader/SDK command/reload, SessionManager branch files and ModelRegistry catalog tests are separate integration evidence. Both npm pack dry-run and actual tarball extraction use an isolated offline cache and disable lifecycle scripts. The real Pi loader discovers all 47 skills and the owned extension from the extracted artifact, with licenses, relative links, imports and private child skill paths checked. This is local packaging/resource integration, not a network install.

The explicit manifest exposes 47 skills, including all 23 hidden principles and the attributed deslop import. Use `/skill:<name>` directly without enabling persistent mode. [Skill index](references/skills.md) resolves all leaves. Direct skills and mode read the same [integration contract](references/integration.md); TypeScript and hidden leaves use explicit routing, not unsupported path triggers. The read-only `pistack_history` tool supports recall/automate-me and active-branch reflect/show-me-your-work; `pistack_reflection_destination` checks proposed override/fork paths without writing or granting approval. See [history usage and limits](references/history.md), including explicit fork selection and incomplete-provenance reporting. Clean-host provisioning and live workflow gates remain required before release.

The development-only `evals/` harness records five representative deterministic cases, actual subprocess timings and explicit unverified live gates; it makes no optimization claim. The manual macOS/Linux CI workflow requires separate default-false provisioning consent and has not been run. See [UPSTREAM.md](UPSTREAM.md) for the support matrix, update rehearsal and provenance, and [references/integration.md](references/integration.md) for shared interfaces. All original monorepo files remain in Git ancestry; only the distribution allowlist is packaged. Original pstack guides remain upstream Cursor documentation, not Pi usage instructions.
