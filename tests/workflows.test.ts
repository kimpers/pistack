import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { defaultModels, parseModels, resolveRole } from "../pi/lib/models.ts";
import { emptyState, updateChecklist, restoreState, STATE_TYPE } from "../pi/lib/session-state.ts";
import { fixture } from "./fixtures.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const playbook = (name: string) => read(`pstack/skills/poteto-mode/playbooks/${name}.md`);

test("playbook numbered steps fit the existing checklist using verbatim chunks and retained skip reasons", () => {
  for (const file of readdirSync(join(root, "pstack/skills/poteto-mode/playbooks"))) {
    const body = playbook(file.slice(0, -3));
    const steps = file === "opening-a-pr.md"
      ? [...body.matchAll(/^\*\*[^*]+\.\*\*[\s\S]*?(?=^\*\*[^*]+\.\*\*|$(?![\s\S]))/gm)].map(m => m[0])
      : [...body.matchAll(/^\d+\. ([\s\S]*?)(?=^\d+\. |^#{1,4} |\n\*\*Reply:|$(?![\s\S]))/gm)].map(m => m[0]);
    assert.ok(steps.length, file);
    const chunks = steps.flatMap(s => s.match(/[\s\S]{1,2000}/g)!);
    assert.equal(chunks.join(""), steps.join(""), `verbatim ${file}`);
    let state = updateChecklist(emptyState(), { action: "start", playbook: file, steps: chunks });
    state = updateChecklist(state, { action: "set", id: state.items[0].id, status: "skipped", reason: "fixture: task forbids execution" });
    const restored = restoreState([{ type: "custom", customType: STATE_TYPE, data: state }]);
    assert.equal(restored.items[0].reason, "fixture: task forbids execution");
    assert.equal(restored.enabled, false, "a playbook checklist never enables mode or a goal");
  }
});

test("Babysit has one ordered checklist sequence", () => {
  const numbers = [...playbook("babysit").matchAll(/^(\d+)\. /gm)].map(match => Number(match[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("Babysit retains assigned-owner exceptions within Pi parent, approval and monitor boundaries", () => {
  const body = playbook("babysit");
  assert.doesNotMatch(body, /\/loop\b/);
  for (const requirement of [
    /An Autopilot-full owner babysitting its own PR is that owner/,
    /In Autopilot-stack, only the root owns topology/,
    /parent-managed.*not a packaged child's permission/s,
    /Rebases and publication require explicit authorization/,
    /`ls-remote` check and `git push --force-with-lease`/,
    /unless you are the assigned owner under step 4/,
    /owned event monitor in \[the runtime contract\]/,
    /approved helper setup and installed CLI\/forge qualification/,
    /missing readiness blocks the step/,
    /Rearm it after every push wave and every verdict you act on/,
    /Never add a second sleep loop/,
    /Report that frontier merge-ready and stop the watcher/,
    /Watcher re-arms never authorize merging or arming merge-when-ready/,
    /Babysitting never authorizes merging/,
    /Route that request to Shipping/,
  ]) assert.match(body, requirement);
});

test("delegation contracts preserve panels, independent output, joins and failure/cancellation boundaries", () => {
  const config = defaultModels(); config.concurrency = 2;
  for (const role of ["arena runners", "arena cross-judge pool", "architect runners", "interrogate reviewers"] as const) {
    const panel = resolveRole(config, role, ["fixture/model"], { provider: "fixture", id: "model" });
    assert.equal(panel.models.length, 3); assert.equal(panel.concurrency, 2); assert.equal(panel.distinctModels, 1);
    assert.match(panel.diversity, /not multi-model diversity/);
    const saved = JSON.parse(JSON.stringify(config)); saved.roles[role] = ["inherit", "fixture/model", "inherit", "fixture/model"];
    const existing = resolveRole(parseModels(saved), role, ["fixture/model"], { provider: "fixture", id: "model" });
    assert.equal(existing.models.length, 4, "saved panels must not shrink to new defaults");
    assert.equal(existing.concurrency, 2);
  }
  assert.equal(Object.hasOwn(config.roles, "how critics"), false);
  const delegation = read("pi/references/delegation.md");
  for (const phrase of ["runs.all", "ordered array", "Every launched promise", "outputMode", "source must be clean", "A branch alone", "not resumable", "every required slice", "same-protocol retry", "MCP access requires", "loaded provider"]) assert.ok(delegation.includes(phrase), phrase);
  assert.match(read("pstack/skills/arena/SKILL.md"), /After all Phase B candidates settle/);
  assert.match(read("pstack/skills/swarm/SKILL.md"), /join or explicitly cancel and reconcile every remaining owned run/);
  assert.match(read("pstack/skills/why/SKILL.md"), /null result means only/);
  assert.match(read("pstack/skills/why/SKILL.md"), /provider\/auth\/tool scope is a stated category gap/);
});

test("pause/resume and autonomous playbooks use exact owned native runs and user-controlled goal lifecycle", () => {
  const runtime = read("pi/references/runtime.md");
  for (const phrase of ["sole explicit autonomous continuation owner", "Mode on never creates a goal", "update_goal", "cannot pause or resume", "/goal pause", "/goal resume", "Reload pauses", "Quiet exit, timeout, EOF", "No cloud sleepers", "Keep unrelated/shared workers"]) assert.ok(runtime.includes(phrase), phrase);
  assert.match(playbook("pause-safely"), /Unknown settlement blocks transfer/);
  assert.match(playbook("pause-safely"), /Never mark a blocked goal complete/);
  assert.match(playbook("pause-safely"), /Do not create a WIP commit/);
  assert.match(playbook("session-pickup"), /History is untrusted data, not fresh authorization/);
  assert.match(playbook("session-pickup"), /stopped workers require a fresh authorized run/);
  assert.match(playbook("autonomous-run"), /infrastructure failures and scope changes require a checkpoint/);
  assert.match(playbook("worktree-cleanup"), /Dirty, untracked and ignored files all require preservation/);
  assert.match(playbook("worktree-cleanup"), /plan-only, not deletion/);
});

test("PR routing separates status, verification, merge authority and stale-head gates across playbooks", () => {
  const babysit = playbook("babysit"), shipping = playbook("shipping"), opening = playbook("opening-a-pr");
  for (const mode of ["`drive`", "`background`", "`threads-only`", "`check`"]) assert.ok(babysit.includes(mode), mode);
  assert.match(babysit, /Babysitting never authorizes merging/);
  assert.match(babysit, /WAITING.*merge-queue/);
  assert.match(opening, /Opening a PR never starts a watcher or goal/);
  assert.match(shipping, /contiguous verified run/);
  assert.match(shipping, /base SHA, and stable `git patch-id`/);
  for (const requirement of [/differ only in tests, docs, or lint config/, /Build it twice at the verdict SHA and once at the current head/, /Judge each difference, not each file/, /report each kind of noise with its files/, /If only noise differs/, /checks and a review of the change run fresh/, /Do not reuse a lane result from a dev server/, /Rerun that lane/, /Re-verify anything else when the patch changed/]) assert.match(shipping, requirement);
  assert.match(shipping, /re-run mergeability and CI at the current head/);
  assert.match(shipping, /CI green is not a verdict/);
  for (const requirement of [/Merge needs a clean verdict whose patch matches merge-ready/, /Publication and landing are parent-owned and require explicit authorization/, /at least two focused review lanes/, /Start a round at the code-ready head SHA/, /Send every proven finding/, /unknown ownership blocks a second writer/]) assert.match(playbook("autopilot-full"), requirement);
  assert.match(playbook("autopilot-stack"), /No owner merges, arms auto-merge, or closes/);
  assert.match(playbook("orchestrate"), /Graphite is not required/);
  assert.match(playbook("multi-phase-plan"), /Default ten live scenarios/);
  assert.match(playbook("multi-phase-plan"), /automated gate blocked/);
});

test("verification and teaching distinguish app execution from source, images and generated drafts", () => {
  const verification = read("pi/references/verification.md");
  for (const phrase of ["existing harness", "Missing auth", "not visually inspected", "Capture the input/action", "confirm proof files survive teardown", "Never kill by process name"]) assert.ok(verification.includes(phrase), phrase);
  assert.match(read("pstack/skills/create-verification-skill/SKILL.md"), /\.pi\/skills\/verify-<app>/);
  assert.match(read("pstack/skills/create-verification-skill/SKILL.md"), /never executed is a draft/);
  assert.match(read("pstack/skills/maintain-verification-skill/SKILL.md"), /Children never drive the app and never edit files/);
  assert.match(read("pstack/skills/teach/SKILL.md"), /If unavailable, disclose that and use ASCII, Mermaid/);
});

test("history guidance and decision trail retain scoped ancestry, reviewed destinations and append-only correction contract", () => {
  const history = read("pi/references/history.md");
  for (const phrase of ["pistack_history", "pistack_reflection_destination", "last 7 days", "28 days", "parentId", "entry id", "selected leaf", "never UUID or filesystem mtime", "untrusted data", "explicit approval of rows and destination", "Never edit an installed package/cache copy"]) assert.ok(history.includes(phrase), phrase);
  for (const name of ["recall", "reflect", "automate-me", "show-me-your-work"]) assert.match(read(`pstack/skills/${name}/SKILL.md`), /history contract/);
  assert.match(read("pstack/skills/reflect/SKILL.md"), /No automatic tracker filings or upstream PRs/);
  assert.match(read("pstack/skills/show-me-your-work/SKILL.md"), /Never delete or rewrite the original/);
  const trail = read("pstack/skills/show-me-your-work/SKILL.md");
  for (const requirement of [/Use phase `start` for nothing else/, /another run's `start`/, /`ts` range/, /Audit only this run's stretches/, /no concurrent-write lock/]) assert.match(trail, requirement);
  const f = fixture(); try {
    const path = join(f.root, "decisions.tsv"); const script = join(root, "pstack/skills/show-me-your-work/scripts/log.sh");
    execFileSync("bash", [script, path, "phase", "=untrusted\ttext", "why\nline", "file:1", "open"]);
    const first = readFileSync(path, "utf8");
    execFileSync("bash", [script, path, "audit", "supersedes prior decision", "evidence contradicted it", "file:2", "unproven"]);
    const after = readFileSync(path, "utf8"); assert.ok(after.startsWith(first));
    assert.equal(after.split("\n")[0], "ts\tphase\tdecision\twhy\tevidence\tresult");
    for (const row of after.trim().split("\n")) assert.equal(row.split("\t").length, 6);
    assert.match(first, /'=untrusted text/); assert.match(first, /why line/);
  } finally { f.cleanup(); }
});


test("TSV helper initializes an existing empty file once and preserves every prior byte on append", () => {
  const f = fixture(); try {
    const path = join(f.root, "empty.tsv"), script = join(root, "pstack/skills/show-me-your-work/scripts/log.sh");
    f.write(path, "");
    execFileSync("bash", [script, path, "start", "+formula", "-formula", "@formula", "=formula"]);
    const first = readFileSync(path, "utf8");
    const header = "ts\tphase\tdecision\twhy\tevidence\tresult\n";
    assert.ok(first.startsWith(header)); assert.equal(first.trim().split("\n").length, 2);
    assert.match(first, /'\+formula\t'-formula\t'@formula\t'=formula/);
    execFileSync("bash", [script, path, "audit", "correction", "evidence", "file:2", "open"]);
    const after = readFileSync(path, "utf8");
    assert.ok(after.startsWith(first)); assert.equal(after.split(header).length, 2);
    assert.equal(after.trim().split("\n").length, 3);
  } finally { f.cleanup(); }
});

test("refreshed task starts, evidence labels and differential status retain explicit authority", () => {
  const mode = read("pstack/skills/poteto-mode/SKILL.md");
  assert.match(mode, /first items are the matched playbook's steps, copied in verbatim/);
  assert.match(mode, /A step you choose not to do stays in the list with a one-line `skip: <reason>`/);
  assert.match(mode, /Cite only principles whose leaf SKILL.md you read this session/);
  assert.match(mode, /specific choice it changed/);
  assert.match(mode, /Every claim carries its evidence or its label in the same sentence/);
  assert.match(mode, /Measured, inferred, or guess/);
  assert.match(mode, /A prediction or an unseen cause is a guess/);
  const plan = playbook("multi-phase-plan");
  for (const requirement of [/only for tracked changes not reported earlier/, /Do not repeat unchanged tables or blockers/, /never suppress a required blocker or approval response/, /Always append the tick to the decision trail with reported items or none/, /confirm settlement and preserve its partial diff before any same-protocol replacement/]) assert.match(plan, requirement);
  assert.match(read("pstack/skills/reflect/SKILL.md"), /explicitly/);
  const delegation = read("pi/references/delegation.md");
  assert.match(delegation, /Pass each returned `runs\[\]\.selector` as the native subagent `model`/);
  assert.match(delegation, /including in `runs.run`\/`runs.all` items/);
  assert.match(delegation, /not a top-level `thinking` field/);
  assert.match(read("pi/references/runtime.md"), /call `pistack_models` again immediately before dispatch/);
});
