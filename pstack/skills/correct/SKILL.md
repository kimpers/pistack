---
name: correct
description: "Find repeated agent mistakes in the authorized repository and prevent them with architecture, types, lint, or behavioral checks. Prove each check fails on a real past mistake. Use for /skill:correct."
disable-model-invocation: true
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Correct

Work within the authorized repository and change scope to prevent the next agent from repeating a proven mistake. An invocation does not authorize unrelated repairs, publication, CI dispatch, or personal instruction edits. A correction during another task is evidence, not an automatic invocation or permission to expand that task.

Assume a contributor sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Make a change that looks right from one file right for the whole repository.

## Find the mistake classes

Read available recent commits, reverts, review comments, agent instruction files, and workaround comments. Group mistakes into classes. A class counts once it has happened twice. Cite both occurrences and disclose unavailable history or review access. Do not invent a production incident cause from a test or a source pattern.

## Use the highest effective level

1. Eliminate the mistake with architecture. Give state one owner and each task one supported path. Hide internals so the wrong import fails. Derive repeated lists from one source. Remove dead examples only within scope.
2. Enforce it with types so the bad state cannot be written. If bad code still compiles, add a lint or CI check whose error names the file, type, or function to use instead. For an existing widespread pattern, reject new occurrences without hiding old ones.
3. Test the behavior. Fix or delete tests that still pass when the behavior breaks, or fail when only the internals change. Never remove a safeguard to obtain green.
4. Write docs or agent rules last, for judgment calls that code cannot enforce.

## Fix and prove

Fix the most frequent in-scope class as a verifiable unit. Prove the new check fails on a real past mistake, then passes on the repair. Run the same check locally that CI would use; report CI as unrun unless an authorized run actually executes. Exceptions need a reason, expiry date, and human approval at the offending line. Commit, push, or dispatch only with explicit approval, never one automatic commit per class.

## Pair rules with enforcement

Propose a table in the approved repository instruction file pairing each rule with its enforcement. Show the exact destination and diff before any separately required instruction-file approval. Never write personal policy or installed skills implicitly. If a rule already exists without enforcement, treat a second occurrence as a repeat and propose the strongest in-scope repair. Drop redundant prose only after proof that its structural replacement covers the mistake. Out-of-scope classes remain proposals.

**Reply:** each class and its two cited occurrences, chosen level, why a higher level did not work, red and green evidence, approved rule destination, and any deferred repairs.
