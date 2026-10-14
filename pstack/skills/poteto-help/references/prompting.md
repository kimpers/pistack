# Word the prompt

Read [the Pi integration contract](../../../../pi/references/integration.md) before using these prompts. Examples express a scope; they never override approval boundaries.

A prompt states the intent and the check for done. The playbook supplies the steps, so a few plain sentences beat a spec.

## Put in

- The goal. Say what is wrong or what the user wants.
- The done check. It can pass or fail. "Make it better" and a duration are not checks.
- The proof to show. Ask for the real command output, a video of the flow, the stored value, or a before and after number.
- What the user already knows. A symptom, a repro step, a log, or a link saves the agent a search.
- The real constraints. "repro first", "don't change any code yet", "zero behavior change", and "let me review before proceeding" each change what the agent does.

## Leave out

- The how. Say what to achieve, and leave the agent room to find a better way.
- A list of skills or steps. A hand-written order drops or reorders steps the playbook keeps. Name a skill only to override one choice.
- The user's theory of the cause, until the agent restates the problem. A stated guess narrows the search.

## Load the context first

- For a noisy report, ask the agent to restate the underlying issue in its own words and in plain English before it does anything else. A misreading shows up before any code exists.
- In a fresh chat, `/skill:recall` earlier work on the topic. Old chats hold context that the new agent lacks.
- Before a change to unfamiliar code, ask `/skill:how` for the mechanics and `/skill:why` for the reasons. An agent with no traced model fixes the symptom at the first plausible spot.
- Ask `/skill:teach` to make the case for a choice, as in "convince me it fixes the cause and not the symptom". A case is easier to check than a summary.

## Design before the plan

- Never take the first design. Ask for prototypes of a few options, with screenshots or videos for UI, and pick from the evidence.
- Let prototypes answer the open questions. Keep independent plan review grounded in source and evidence. A reviewer must label an untested concern rather than invent a risk.
- For a shared package or API, ask for the README or a tutorial first, then work back to the code. The doc becomes the target the agent checks itself against.
- Ask for the plan only after the design is settled. Each step of the plan ends in a check.

## Follow up short

- "Do it" or "continue" can resume an already scoped task. They do not waive approval gates or authorize unrelated work.
- Start with "new task" when the subject changes. Otherwise the mode treats the message as the next step.

## Before stepping away

- State the authorized objective and the decisions the agent may make while you are away. Reserved product, scope, and irreversible choices still require a checkpoint.
- Write done as checks each iteration can run. Explicit continuation uses the existing pi-goal contract in [runtime](../../../../pi/references/runtime.md), never mode alone or a second scheduler.
- Ask for a fresh worktree off a named base.
- State publication authority separately. Without explicit permission, preserve verified patches and evidence rather than commit, push, or open a PR.
- Ask for a decision log to audit later.
- Give an exit: "if you're truly stuck after a few hours, stop and write up why".

## Steer in one line

- Restate the goal: "i said the goal is to repro. i did not ask for a fix yet."
- Name the principle: "apply prove it works. show me the real output, not the build log."
- A principle name routes to its indexed leaf, which the agent must read before applying it. Its reply names the decision the rule changed.
