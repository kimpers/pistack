### Pause safely

Read [the Pi integration contract](../../../../pi/references/integration.md) first. Paths in prose are relative to the poteto-mode skill directory unless explicitly linked.


Read [the runtime contract](../../../../pi/references/runtime.md). An explicit pause stops this task's guidance/work, not shared or unrelated goals/workers. Compaction alone restores Pi mode/checklist; it does not authorize canceling another task.

1. Start no new writes or launches. Ask each exact owned live worker to checkpoint at the current safe boundary. Use native interrupt for resumable pause or stop for cancellation, then inspect status and reconcile artifacts. A stop is not resumable. Unknown settlement blocks transfer of its cwd to a replacement writer.
2. Stop this task's exact owned watcher/PTY sessions. Request the user's `/goal pause` for this task's goal; the model's `update_goal` cannot pause. Never mark a blocked goal complete or clear unrelated continuation. `/pistack off` stops future guidance only, not workers or goals.
3. Preserve the actual worktree state and partial diffs. Do not create a WIP commit, push, reset or discard dirty files merely to pause. Commit only if already authorized. Report expected-red or broken state honestly rather than forcing a risky last edit.
4. Write an authorized durable resume artifact, or return the complete handoff when writes are forbidden. Include objective, scope/permissions, workspace, branch/ref, run/session/leaf IDs, owned worktrees and monitors, current checklist, actual validation, pending decisions, partial diff references and next action. Link the decision trail instead of duplicating it. Never rely on an in-context plan surviving compaction.

**Reply:** current phase, exact owned run settlement, dirty/clean state, evidence and checkpoint paths, goal pause still needed if applicable, and the first safe action on resume. This is a pause, not completion.
