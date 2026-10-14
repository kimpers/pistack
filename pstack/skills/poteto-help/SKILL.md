---
name: poteto-help
description: "Guide users through Pi-native pstack setup, mode, and the skill, playbook, or principle for their task. Use /skill:poteto-help with a question."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Poteto help

Answer the question, give a prompt the user can send, and link the packaged file the answer came from. For a help question, don't start the work. Help does not enable mode, launch workers, create a goal, or grant publication authority.

An explicit work request, such as "use pstack to fix this bug", is different. Read [poteto-mode](../poteto-mode/SKILL.md) and work within that request's scope. Mention persistent mode only when useful, never enable it silently.

This map routes to files that own the details. Read the destination before quoting it. Link the packaged Pi references, not moving upstream guides that describe another host. If the user cannot open a package path, quote the relevant command and identify the installed file; do not fabricate a public URL.

## Find the need

Infer the need from the message. If unclear, ask one question about setup, starting a task, choosing a skill, fixing a run, or customization. Answer only the relevant section.

Inspect only state that changes the answer. `/pistack status` reports mode; `/pistack doctor` is passive inspection and names the effective config destination and capability gaps. A missing user config alone does not prove setup never ran: trusted project config may replace it. Read the effective configuration through [delegation](../../../pi/references/delegation.md), not personal defaults guessed from a directory.

If model setup matters, offer `/pistack setup` once. The user can defer it and keep inherited role choices. If proof is the question and the project has no usable app harness, mention [create-verification-skill](../create-verification-skill/SKILL.md). Missing tools remain gaps.

## Get set up

1. Review the package and choose an installation source using the [Pi usage guide](../../../pi/README.md). Installation requires approval; a help answer does not install anything.
2. Run `/pistack setup` for the native proposal and consent dialogs. It reuses compatible packages and proposes missing dependencies and discovered role models. Decline or cancel changes nothing.
3. Reload at the stated boundary, then run `/pistack doctor`. Presence is not live readiness. Consented `/pistack doctor verify` performs public discovery checks, not child execution.
4. Start a task with `/skill:poteto-mode`, a goal, and a check that can pass or fail. For persistent branch guidance, use `/pistack on` explicitly.

Review panels and parallel workers cost tokens. Smaller approved panels or cheaper discovered models can reduce cost; concurrency limits simultaneous workers, not panel size. [Setup](../setup-pstack/SKILL.md) preserves saved panel counts and scoped model choices. `unlimited` preserves native/configured effort, not maximum reasoning or unlimited spending. No command here changes global thinking.

## Start a task

`/skill:poteto-mode` is task-local. `/pistack on` persists guidance on this session branch, `/pistack off` stops future guidance, and new sessions start off. Mode alone creates no worker or goal. Direct skill invocation does not turn it on.

Mode selects a playbook and records its steps in `pistack_checklist`. Skipped steps retain a reason. A good prompt names the goal, proof, and constraints rather than prescribing every skill. Read [prompting](references/prompting.md) before drafting one. Say "new task" when the subject changes. A child receives one assigned phase; the parent owns routing, fanout, joins, and acceptance through [native delegation](../../../pi/references/delegation.md).

## Pick a skill

Use `/skill:poteto-mode` for a rigorous multi-step task. Recommend a direct skill when the user wants a narrower result. Read it first and give one example prompt.

| Need | Skill |
|---|---|
| A rigorous task workflow | [poteto-mode](../poteto-mode/SKILL.md) |
| Restate goals before work starts | [in-your-own-words](../in-your-own-words/SKILL.md) |
| Explain current mechanics or placement | [how](../how/SKILL.md) |
| Investigate rationale or a number's origin | [why](../why/SKILL.md) |
| Explain a change plainly | [teach](../teach/SKILL.md) |
| Recover recent workspace context | [recall](../recall/SKILL.md) |
| Recap this selected session since the last user message | [ketchup](../ketchup/SKILL.md) |
| Prove what a small diff could break elsewhere | [blast-radius](../blast-radius/SKILL.md) |
| Settle types and module shape | [architect](../architect/SKILL.md) |
| Compare independent attempts at one brief | [arena](../arena/SKILL.md) |
| Partition checks or race scoped native workers | [swarm](../swarm/SKILL.md) |
| Adversarially review a diff without auto-applying fixes | [interrogate](../interrogate/SKILL.md) |
| Fix a bug with a cheap local red-first test | [tdd](../tdd/SKILL.md) |
| Apply TypeScript rules | [typescript-best-practices](../typescript-best-practices/SKILL.md) |
| Review comments with an independent comment-only worker | [no-comments](../no-comments/SKILL.md) |
| Remove AI-generated code clutter before an authorized commit | [deslop](../deslop/SKILL.md) |
| Remove AI tells from prose | [unslop](../unslop/SKILL.md) |
| Write technical docs or PR prose | [technical-writing](../technical-writing/SKILL.md) |
| Restate the last reply plainly | [bro](../bro/SKILL.md) |
| Build a real-app verification procedure | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Repair a verification skill and feature map | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Vet a measured performance claim | [benchmark-checklist](../benchmark-checklist/SKILL.md) |
| Design one large or unusual task workflow | [figure-it-out](../figure-it-out/SKILL.md) |
| Keep or audit a decision trail | [show-me-your-work](../show-me-your-work/SKILL.md) |
| Configure approved roles and dependencies | [setup-pstack](../setup-pstack/SKILL.md) |
| Propose a personal mode from scoped history | [automate-me](../automate-me/SKILL.md) |
| Propose durable skill lessons from a finished task | [reflect](../reflect/SKILL.md) |
| Prevent repeated repository mistakes structurally | [correct](../correct/SKILL.md) |
| Find this map | [poteto-help](SKILL.md) |

Fallback discovery is restricted to the explicit Pi allowlist and [skill index](../../../pi/references/skills.md). Never route from adjacent directories merely because they contain a skill. Read an indexed skill's description if it is absent from this table.

Close calls:

- How explains mechanics; why investigates reasons; teach explains either plainly.
- Arena gives each candidate one brief and synthesizes the best parts. Swarm partitions coverage or runs a declared race.
- Architect proceeds only to authorized implementation. Add "with checkpoint" to review the design first.
- Interrogate reviews the diff; blast-radius proves consequences outside it.
- Recall spans bounded workspace history; ketchup covers selected ancestry in this session. Session pickup resumes a specific authorized branch or run.
- Figure-it-out designs one run. Orchestrate is a standing program; Autonomous run drives one task to its stop predicate.

The attributed deslop is bundled locally with Cursor's MIT license. Browser and PTY control require existing authorized tools and loaded providers under [verification](../../../pi/references/verification.md); team-kit control skills are not bundled. Benny and make-bot-ui remain unavailable. Pi authoring follows [authoring](../../../pi/references/authoring.md). Orchestrate is a playbook, not a `/skill:orchestrate` resource.

## Playbooks and principles

Playbooks are files inside mode, not separate slash commands. The [mode index](../poteto-mode/SKILL.md) lists all routes.

- "Check on PR 123" means Babysit `check`, a one-pass status report. "Babysit this" or "get it green" means `drive` to merge-ready. Neither authorizes merge.
- "Land the stack" routes to Shipping, with independent verification and explicit publication authority.
- "Take over this branch" routes to Session pickup; "pause safely" routes to Pause safely.
- "Full autopilot on this queue" routes to Autopilot-full; "stack them, don't ship" routes to Autopilot-stack. Both retain parent ownership and explicit continuation approval.
- "Run the eval playbook" requests an evaluation, not an invented score.

A multi-phase plan request runs [Multi-phase plan](../poteto-mode/playbooks/multi-phase-plan.md) and stops at the plan until explicit go. A prototype can settle an empirical design question; source-grounded independent plan review is still useful and permitted within scope.

The 24 principles are hidden direct skills in the [index](../../../pi/references/skills.md). Mode reads only leaves that change a decision and cites that choice. Invoke one as `/skill:principle-<name>`, not an invented standalone command.

## Fix a run

| Symptom | Next step |
|---|---|
| Guidance did not persist | Check `/pistack status`; direct skills are task-local. Use `/pistack on` if desired. |
| A question became continuation of old work | Say "new task" or narrow this turn to a read-only answer. |
| Model changes did not apply | Inspect effective scope with doctor, approve setup, and resolve `pistack_models` again before dispatch. |
| Cost is too high | Review panel size, concurrency, and discovered role choices separately. |
| A hidden skill did not load | Invoke `/skill:<name>` or check the explicit router. Filenames do not trigger it. |
| Parallel writers collided | Stop new writes, reconcile exact owned runs, then use managed isolation or serialize one writer. |
| An overnight run moved but finished nothing | Define a checkable predicate and inspect the existing authorized goal and native runs through [runtime](../../../pi/references/runtime.md). Do not add a scheduler. |
| A green build was called proof | Ask for the actual command, user journey, stored value, or profile. |

For short corrections, see [prompting](references/prompting.md). For complete examples, see [recipes](references/recipes.md).

## Customize

Automate-me drafts a personal mode from bounded history. Reflect proposes reviewed lessons. Ask mode to author a skill in an approved project or development-fork destination, then evaluate the draft. Personal/project overrides require destination approval and loader collision checks; installed caches are never repair targets. A misbehaving skill warrants a separate repair proposal, not an unsolicited PR inside feature work.

## Reply

Lead with the answer. Give at most one example prompt in a code block and the packaged source link. Keep it short unless the user asks for the full map.
