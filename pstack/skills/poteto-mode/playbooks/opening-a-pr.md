### Opening a PR

Read [the Pi integration contract](../../../../pi/references/integration.md) first. Paths in prose are relative to the poteto-mode skill directory unless explicitly linked.


Only for authorized implementation/publication. For read-only or no-PR scope, record the step skipped and return evidence without Git or forge writes.

**Worktree.** Preserve existing dirty work. Use native managed worktrees from a clean named ref for independent writers, or one authorized writer in the supplied cwd. Review returned patches and handoff manifests. Never reset, force-remove or stash unrelated work, and do not assume managed worker branches persist. Parent integrates accepted patches before authorized PR operations.

**Commits.** Commit liberally. Rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made commit. New commit when separable. Commit bodies don't restate the subject.

**PRs.** Run the attributed local `/skill:deslop` over the diff before commit. Run `/skill:no-comments` before review. Write every PR title, PR description, and commit body with `/skill:technical-writing`, then apply `/skill:unslop`. Apply every technical-writing layer except Diátaxis. Use one word for each action, keep articles, and avoid `-ing` when a plain verb works.

**Titles.** Conventional Commits `type(scope): subject`, no trailing period. Type such as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf`. Scope is the area, such as `pstack` or `poteto-mode`. Subject is short, imperative, and names a real symbol when one carries the change, for example `fix(pstack): retarget opening-a-pr babysit trigger`.

**Descriptions.** The PR body is a one-minute briefing, not a lab notebook, for a reviewer who has the diff. It says why the change exists, what it leaves out, what it could break, and how you proved it works. Write short, simple sentences with few identifiers, no walls of text. The body becomes the squash commit body, so keep that commit under about 40 lines. Use `##` headings, not bold lead-ins, in this order, and drop a section with nothing to say:

- `## Why`: the problem and approach, 1–3 short sentences. No SHAs, rebase genealogy, or "based on main" preamble.
- `## What changed`: 1–3 short bullets. Name a real symbol or path only when it carries the change. Name both sides of a rename or retarget.
- `## Scope`: always. 1–3 short items on what it covers and what it deliberately leaves out (a follow-up, a known gap). No symbols, paths, or file-by-file essay.
- `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about. Skip when there was no real choice.
- `## Blast Radius`: 1–2 sentences on who or what it touches and why that is safe or risky. If main is red, state the cost of leaving it red.
- `## Verification`: 1–3 bullets, each a real run path and its outcome. Perf: one primary number with its unit, `before → after`, and a link to the arena or swarm directory for the rest. No sample-size methodology, swarm recitals, or metric tables.

After the sections, attach videos or screenshots when they prove a claim. Full SHAs, swarm or arena lane recitals, lever-correction essays, file-by-file checklists, and "CLEAN" verdicts go in a linked artifact, not the body.

**Forge.** Resolve the forge before the first PR operation and keep that choice for create, edit, view, watch, and merge. GitHub CLI (`gh`) is the default. If `command -v origin` succeeds and Origin can resolve the repository, prefer `origin pr ...`. If Origin is absent or cannot resolve the repository, stay on `gh` and record the fallback. Do not require Graphite (`gt`).

**PR tool.** If an available, authorized PR tool documents required tracking, use its public contract for supported operations. Otherwise use the resolved forge. Do not assume Pi provides a PR tool or guess its arguments.

**Size and stacks.** Prefer five narrow PRs to one large PR. A stack is a base-branch chain. The root PR targets trunk. Each child PR targets its parent branch. The assigned topology writer moves the child patch onto its parent's exact tip. Autopilot-stack owners never rebase, even onto trunk; only the root adjusts topology after a settled write handoff. As a parent merges, move its child onto trunk per `playbooks/shipping.md` step 4. Without a built-in PR tool, per the resolved forge, create a child with `origin pr create --status open --base <parent-branch>` or `gh pr create --base <parent-branch>`, and retarget one with `origin pr edit <pr> --base <parent-branch>` or `gh pr edit <pr> --base <parent-branch>`. Branch from trunk only for independent work. Before substantial stack work, the topology writer applies the execution playbook's trunk-drift rules. Once landing starts, only Shipping step 4's post-merge retarget and patch move may change the chain.

**Readiness.** Open every PR ready, never as a draft. For an authorized PR tool, use its documented ready-status option rather than assuming an argument schema. With Origin, pass `--status open`. With `gh`, omit `--draft`. If a PR still opens as a draft, mark it ready through the PR tool, or run `origin pr ready <number>` or `gh pr ready <number>` according to the resolved forge. Run `origin pr view <number>` or `gh pr view <number>` before you refer to PR status.

**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or stack first. Run a separate babysit pass only when the user asks for one after the whole stack exists. A babysit for each new PR stalls the build and spends checks on commits later waves restart. Push back when feedback drifts from intent.

The parent schedules independent `interrogate` and `no-comments` passes and applies `deslop` before authorized publication. Packaged children return scoped patches/evidence without nested fanout or automatic PR creation. Opening a PR never starts a watcher or goal. An explicitly assigned Autopilot-full or Autopilot-stack owner lifecycle is the babysit ask; the parent starts that loop after code-ready and collects merge-ready or STACK-READY. The whole-stack wait above does not apply to that assigned lifecycle. A packaged child still cannot launch watchers, goals or siblings, mutate topology, or publish without authority.
