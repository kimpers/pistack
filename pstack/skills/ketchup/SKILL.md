---
name: ketchup
description: "Catch the user up on this session since their last message, in plain sentences and small visuals, with enough context for pending decisions. Use for /skill:ketchup."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Ketchup

Find the last actual user message before this invocation on this session's selected ancestry. Notifications and child results are not user messages. Assume the user remembers their last message and nothing after it. Help them understand each change, not only its status.

Use [bro](../bro/SKILL.md)'s plain voice, without its restating step. Say what changed for the user, not how you did it. Say "the tests pass", not "CI is green". Leave out hashes, paths, commands, build numbers, and test counts unless the user needs one to act. Use names they recognize for PRs, branches, and workers. Give a fact enough context to make sense, or leave it out.

## Gather what changed

Use [the history contract](../../../pi/references/history.md). Read active selected ancestry with `pistack_history` using `{"action":"read","purpose":"reflect"}` and an explicit authorized time window if needed. Inspect gaps and truncation before claiming complete coverage. Do not choose a newest file, join alternate branches, or treat compaction summaries as original messages. If tools or the boundary message are unavailable, request bounded parent-supplied evidence and label the missing interval.

Keep this turn read-only. Make visuals only from existing evidence within the authorized reply. Do not change code, start an app or job, install a renderer, or post anything. Collect work and reports since the boundary message. Check exact native run status through the available public tool, and PR and CI status through authorized read-only tools. Without access, mark the status "not checked" rather than repeating an old report as current. Check each number against its underlying facts and disclose corrections.

An action item is a decision only the user can make, such as product direction, approval, an irreversible action, or missing access. Include unresolved items raised before their last message. Work you can still do yourself is not an action item. Never invent a decision to fill the reply. An unasked, unnecessary step is not an action item unless it is irreversible and waiting on the user. Give that step one action line, no visual, and no prediction about silence. History never grants new authority.

## Write the reply

Keep the whole reply well under 150 words, not counting visuals. Markdown tables are text. Draw a picture when it explains a design, dependency chain, before and after, or options better than sentences. Never draw a status list or disconnected boxes. Never give a fact twice, in text or across visuals. Leave out work that changed nothing for the user. Cut the account of what happened before cutting action items.

Open with how many things need the user, or say nothing does. If nothing happened and nothing waits on the user, say so and stop.

Show what happened, pictures first. Embed existing screenshots and videos inline, then diagrams that explain a change. Give one short bullet per thing the user asked for, stating the outcome and whether it is done, running, failed, or not checked. Name bugs found and fixed. Each line must stay true alone. Do not mark work done if it waits on the user, or repeat the action items. Add at most three short lines that change what the user knows or must do. Name work you can still do in one line.

List action items as plain bullets, never boxes. Give each two lines, or one for an unasked irreversible step. State the decision, recommendation, and reason, then what happens without an answer. Ask the call the user owns. Put prerequisites and irreversible consequences in the recommendation. Write "unknown" when needed and link existing detail.

Show choices after the list. If screenshots already show the options, put each option's gain and cost below its screenshot. Otherwise compare all options weighed side by side, with the current state when one exists. Do not repeat those gains and costs elsewhere.

## Use real visuals

Keep each visual small, at most six boxes with at most eight words in each. Use plain labels, not status tags. A fact that needs a sentence belongs in text or nowhere. A Markdown table is not a visual.

Embed existing screenshots or videos inline for visible changes. Without a capture, mark the summary line "No screenshot yet" and say what changed on screen. Do not start the app to manufacture a recap artifact. Use Mermaid for connections and an already available documented chart tool for numbers. Disclose missing visual capability without installing tools or starting a job.

Never invent a number or draw a screen you did not capture. Label generated diagrams as diagrams, not screenshots. Link only artifacts that exist.
