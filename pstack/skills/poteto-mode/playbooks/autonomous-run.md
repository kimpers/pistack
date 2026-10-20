### Autonomous run

Read [the Pi integration contract](../../../../pi/references/integration.md) first. Paths in prose are relative to the poteto-mode skill directory unless explicitly linked.

Before dispatch, assess task difficulty through [the approved model policy](../../../../pi/references/delegation.md#model-policy). Use the exact approved selector; a different effort, speed, or family needs explicit approval.


**You own the exit condition. Define done, then drive to it without stopping.** For "going to bed" / "run until done" / "continue until X".

1. State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero). A vague goal stalls; a predicate lets you stop.
2. Use [the Pi runtime contract](../../../../pi/references/runtime.md). Only an explicit objective authorizes pi-goal continuation; optional token budgets are user choices. Native child notifications and owned interactive-shell event monitors provide wakes. No second scheduler, cloud sleeper or shell-agent fallback. Check required helper readiness before a PR/orchestration run.
3. Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
   Sequence the work via the **sequence-verifiable-units** principle skill, verifying each unit before the next instead of batching checks at the end.
4. Mid-run discoveries stay within task scope. Fix authorized blockers; propose unrelated bugs, skill repairs and external submissions separately. Installs, product choices, missing tools, infrastructure failures and scope changes require a checkpoint. Do not edit installed skills or hide protocol failures with a different executor.
5. Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved. A run with no trail can't be audited or resumed.
6. Stop when the predicate is met, the user pauses/stops, the authorized budget ends, or a blocker requires a decision. Use Pause safely to reconcile owned runs; never mark a blocked goal complete. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory.

**Reply:** the exit condition, iterations run, what landed, what was discarded, final predicate state.
