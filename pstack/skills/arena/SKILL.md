---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /skill:arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

Before dispatch, assess task difficulty through [the approved model policy](../../../pi/references/delegation.md#model-policy). Use the exact approved selector; a different effort, speed, or family needs explicit approval.


# Arena

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive 3-6 concrete gradeable criteria for success on this task. The rubric is the picker's tool in Phase D; candidates only see the task.
3. Pick the configured `arena runners` panel per the integration contract. Use the configured default independent slots with explicitly inherited models. Preserve N separately from concurrency and disclose same-model panels. For design-sketch tasks use `architect runners`.
4. Assign unique runtime output bindings for reports. Code candidates use local managed worktrees from a clean named base ref, one writer per cwd; never share a writable checkout. Return patches and handoff manifest paths, not assumptions that managed worktrees survive.

## Phase B: Fan out

Launch N fresh native pi-subagents candidates through the delegation contract, bounded by configured concurrency. Give each the task, shared grounding paths, unique runtime output binding or managed worktree, and instructions for both artifact and rationale. The parent owns all stages; runners do not fan out.

Each rationale names the alternatives the candidate considered and what it rejected.

Record every dropout. A content-level dropout may leave N-1 candidates if the task rubric still holds; design exploration still needs at least two distinct viable shapes. Launch/tool failures block recovery through the integration contract, not a silent N-1 success.

## Phase C: Cross-judge

After all Phase B candidates settle, select one model from the configured `arena cross-judge pool`, preferably a different family from the parent. Launch a fresh `pistack.analyst` with the rubric and complete candidates by path label. Disclose same-model review when necessary. It scores each criterion and recommends a base with rationale. Run it alongside the parent's complete reading, never while candidates are still writing. Do not treat partial artifacts as complete.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
