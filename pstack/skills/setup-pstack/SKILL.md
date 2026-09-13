---
name: setup-pstack
description: Configure Pi packages, retained helper dependencies and discovered role models through the approved piStack setup wizard.
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Setup pstack for Pi

1. Run `/pistack doctor` for passive inspection of effective user/project packages, filters, prerequisites, scoped models and loaded tools. Presence is not proof of child launch, authentication, PTY or browser readiness.
2. Ask the user to run `/pistack setup`. It uses native Pi dialogs, offers user or trusted-project scope, shows one exact installation/model proposal, and changes nothing until approval. Without a dialog-capable context, return the instructions; do not hand-edit settings as a workaround.
3. Choose roles from discovered provider/model IDs or explicit `inherit`. Keep panel length separate from concurrency. Default panels have four contexts, reflect has three lenses, and swarm N follows the task. The arena cross-judge pool selects one judge. Disclose same-model panels rather than claiming diversity. See [delegation](../../../pi/references/delegation.md).
4. Review missing shared extensions and required retained Bun helper setup. Reuse compatible enabled copies; disabled, incompatible, duplicate or foreign providers require a decision, never silent replacement. Helper installation is proposed only in the verified owned packaged scripts directory with `bun install --frozen-lockfile`; readiness is recorded only after success and dependency checks. No normal invocation installs. Declining leaves the associated workflow unavailable.
5. After approval, the wizard preserves unrelated settings and records changes. A partial failure reports what changed and what remains. Rerun to propose only unfinished work, not reinstall successes. Reload at the explicit boundary and rerun doctor. Candidate version pins are not release qualification.
6. Offer `/pistack doctor verify` for a consented public agent-list/doctor request. It does not launch workers or prove integrations. User/project agent definitions, model scopes and tool ceilings retain authority. No agent files are copied to personal directories.
7. Offer a project-local verification skill once if the repo has no suitable real-app harness. On yes, read [create-verification-skill](../create-verification-skill/SKILL.md), write only to the approved `.pi/skills/verify-<app>/` destination and prove it end to end. On no, move on.

Report actual config destination, approved changes, skipped dependencies, reload state and remaining readiness gaps. Setup does not enable mode or create a goal. Use `/pistack on` separately; new sessions start off.
