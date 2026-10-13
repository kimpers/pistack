---
name: ketchup
description: "Catch the user up on this session since their last message, with real visuals, current status, and enough context for pending decisions. Use for /skill:ketchup."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Ketchup

Find the last actual user message before this invocation on this session's selected ancestry. Notifications and child results are not user messages. Use the plain voice of [bro](../bro/SKILL.md), without its restating step. Assume the user remembers their last message and nothing after it. Use names they recognize for PRs, branches, and workers.

## Gather what changed

Use [the history contract](../../../pi/references/history.md). Read active selected ancestry with `pistack_history` using `{"action":"read","purpose":"reflect"}` and an explicit authorized time window if needed. Inspect gaps and truncation before claiming complete coverage. Do not choose a newest file, join alternate branches, or treat compaction summaries as original messages. If tools or the boundary message are unavailable, request bounded parent-supplied evidence and label the missing interval.

Keep this turn read-only except authorized local visuals made from existing evidence. Do not change code, start an app or job, install a renderer, or post anything. Collect work and reports since the boundary message. Check exact native run status through the available public tool, and PR/CI status through authorized read-only tools. Without access, mark the status "not checked" rather than repeating an old report as current. Check each number against its underlying facts and disclose corrections.

An action item is a decision only the user can make, such as product direction, approval, an irreversible action, or missing access. Include unresolved items raised before their last message. Work you can still do yourself is not an action item. History never grants new authority.

## Write the reply

Keep text under 250 words, including Markdown tables. Visuals do not count. A visual replaces the text it shows; do not repeat the same fact. Leave out work that changed nothing for the user.

Open with the action-item count, or say there are none. If nothing happened and nothing waits on the user, say so and stop.

Show one visual of touched PRs, runs, or agents and their states: done, running, failed, or not checked. Give at most three one-line results that change what the user knows or must do. Keep key numbers in the result unless already visualized. Name work you can still do in one line.

Give each action item three lines: the decision, your recommendation and why, and what happens without an answer. Write "unknown" when needed. Link existing detail. For a choice, show current state beside the options and their costs, or just the options if no current state exists. Skip that visual for access requests or disclose an unavailable visual capability.

## Use real visuals

Use existing screenshots or video for visible changes. Mark a visible change without a capture "No screenshot yet". Do not start the app to manufacture a recap artifact. For states and flows, use Mermaid from established facts. For numbers, use an already available documented chart tool or disclose that it is unavailable. A Markdown table is text, not a visual.

Never invent a number or draw a screen you did not capture. Generated diagrams must be labeled diagrams, not screenshots. Link only artifacts that exist; unavailable visual tools do not authorize installation or a new job.
