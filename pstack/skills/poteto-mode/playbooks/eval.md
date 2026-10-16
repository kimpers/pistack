### Eval

Read [the Pi integration contract](../../../../pi/references/integration.md) first. Paths in prose are relative to the poteto-mode skill directory unless explicitly linked.

Before dispatch, assess task difficulty through [the approved model policy](../../../../pi/references/delegation.md#model-policy). Use the exact approved selector; a different effort, speed, or family needs explicit approval.


**You own the experiment design. Plan, blind, run, synthesize.**

**Non-negotiables for blinding:**

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt the candidate sees.
- The candidate prompt looks like an organic user request. State the goal, not the meta.
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick.
- Don't tell the candidate other candidates exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Spawn N parallel candidates** using configured model slots with actual diversity disclosed per the **arena** skill's Phase B. Each works in its own sanitized dir; same prompt to each.
5. **Spawn one blinded judge** preferring a different model family, with same-model limitations disclosed per the **arena** skill's Phase C. Judge sees outputs by sanitized label and the rubric, never a model name.
6. **Verify from scoped run evidence, not self-report.** Use exact candidate run/session IDs and the selected ancestry per [history](../../../../pi/references/history.md). Read actual tool calls and artifacts, never globally scan sessions or infer compliance from citations. Missing transcript or image capabilities are unproven checks.

7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.
