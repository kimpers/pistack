# piStack integration contract

Read this contract before any direct skill or mode workflow. Explicit task limits and harness permissions override autonomy, playbooks, principles and agent defaults. Reversible work may proceed only inside authorized scope. Installs require approval. Commits, staging, rebases, pushes, PRs, external messages, deployments and deletion require the applicable user authorization; a playbook is not that authorization. Preserve unrelated dirty work. Do not mutate installed package caches or personal configuration to fix a workflow.

Expected-red tests and planned migration breakage are evidence inside a declared verification unit, not independently releasable green states. Complete and verify the coherent unit before advancing or shipping. Read-only tasks need no new files, probes, commits or learning edits. Boundary discipline never removes required security checks. Reflection proposes reviewed personal/project overrides or development-fork changes.

## Activation and routing

`/pistack on` enables guidance for this session branch. New sessions start off. `/pistack off` stops future guidance, not unrelated/shared goals or workers; prior messages cannot be retracted. A direct `/skill:<name>` invocation applies only to that task and does not turn mode on. No filename or frontmatter path trigger is installed.

When mode is on, read [poteto-mode](../../pstack/skills/poteto-mode/SKILL.md) for each new multi-step task, choose its playbook, and read the matching file. Read only the principle leaves that change a decision. [The skill index](skills.md) resolves hidden leaves by path, including direct invocations. All upstream leaves remain in `pstack/skills/`; do not copy a generated corpus. Benny and make-bot-ui are deferred and excluded from discovery/distribution.

On TypeScript edits explicitly read [typescript-best-practices](../../pstack/skills/typescript-best-practices/SKILL.md). For prose in an active workflow read [unslop](../../pstack/skills/unslop/SKILL.md); it is not an always-on global writing policy. Agent-facing authoring uses [authoring](authoring.md), not an assumed built-in skill. Before authorized commits use the attributed [deslop](../../pstack/skills/deslop/SKILL.md).

For multi-step work use `pistack_checklist` to record the matched playbook's verbatim numbered steps (or named sections for Opening a PR) before task-specific steps. Oversized steps may be split into consecutive verbatim chunks within the tool's 2000-character limit. `start` takes `playbook` and `steps`; `add` takes `text`; `set` takes `id`, `status` and required skip `reason`; `list` reads state. Keep skipped steps visible. In a child without that tool, report the assigned steps in the response or authorized artifact, never widen tools just for a checklist. State persists through active branch ancestry, reload and compaction. It is not scheduling or authorization.

## Capabilities

- [Delegation and models](delegation.md): documented native pi-subagents calls, local ownership, parent acceptance, independent contexts and configured panel counts. Unavailable launch tools or failed launches are blockers, not permission to switch protocols. Keep `PI_SUBAGENT_CHILD` and inherited ceilings intact.
- [Verification](verification.md): existing application harness first, then available browser/PTY tools. Missing capabilities are unproven, not simulated success.
- [History](history.md): workspace and selected-branch evidence with bounded windows. Use the read-only `pistack_history` tool and `pistack_reflection_destination` eligibility check as documented there; neither starts turns, workers or learning edits.
- [Long-running work](runtime.md): pi-goal owns explicit continuation; pi-subagents owns workers; interactive-shell monitors actual processes. No second executor, scheduler or memory system.

Mode never starts goals/workers, changes tools or selects the parent model. `/pistack setup` is the approval boundary for selected dependencies, retained Bun helpers and discovered model choices; `/pistack doctor` distinguishes presence from live readiness. Declined or missing required helper dependencies block the associated workflow. Normal helper invocation, including help, is check-only and never installs or restarts.

## Evidence and acceptance

The parent reads actual diffs, complete candidate artifacts and verification evidence, not just summaries. Distinguish static checks, fixtures, actual integrations and unavailable live/platform/network proof. No logs, screenshots, metrics, citations or progress measurements may be invented. Silence is not success. Keep outputs bounded and evidence private unless publication is authorized.

The decision trail remains `ts\tphase\tdecision\twhy\tevidence\tresult`, maintained by [show-me-your-work](../../pstack/skills/show-me-your-work/SKILL.md). Corrections append superseding rows; never erase a wrong decision. Learning, tracker filings and skill repairs are proposals until their destination and edits are approved.
