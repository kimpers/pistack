import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./fixtures.ts";
import { resolveFrontier, type FrontierCommand } from "../pstack/skills/poteto-mode/scripts/orch/frontier.ts";
import { openStore, NotFoundError } from "../pstack/skills/poteto-mode/scripts/orch/store.ts";
import { defaultModels, proposeBudget } from "../pi/lib/models.ts";
import { executionProfile } from "../pi/lib/execution-profile.ts";
const scripts = "pstack/skills/poteto-mode/scripts";
const sha = (n: number) => String(n).repeat(40);
const row = (number: number, headRefName: string, baseRefName: string, state = "OPEN") => ({ number, headRefName, baseRefName, state, headRefOid: sha(number), isCrossRepository: false });
const rows = [row(1, "a", "main"), row(2, "b", "a")];
function forge(values = rows): FrontierCommand { return (cmd, args) => {
  assert.equal(cmd, "gh", "never gt/git branch metadata");
  return JSON.stringify(args[1] === "list" ? values : values.find(r => String(r.number) === args[2]) ?? values.at(-1));
}; }

test("gh frontier resolves bottom-to-top and frozen merged prefixes without local branch refs", () => {
  assert.deepEqual(resolveFrontier("/fixture", undefined, forge()).map(r => r.pr), [1, 2]);
  assert.equal(resolveFrontier("/fixture", [1, 2], forge())[0].sha, sha(1));
  const merged = [row(1, "a", "main", "MERGED"), row(2, "b", "main")];
  assert.deepEqual(resolveFrontier("/fixture", [1, 2], forge(merged)).map(r => r.state), ["MERGED", "OPEN"]);
});

test("gh frontier rejects ambiguity, cycles, missing/foreign/malformed and changing evidence", () => {
  for (const values of [[...rows, row(3, "c", "a")], [row(1, "a", "b"), row(2, "b", "a")], [rows[0], { ...rows[1], headRefName: "a" }], [{ ...rows[0], isCrossRepository: true }], [{ ...rows[0], headRefOid: "bad" }]])
    assert.throws(() => resolveFrontier("/fixture", undefined, forge(values)));
  assert.throws(() => resolveFrontier("/fixture", [2, 1], forge()), /order changed/);
  assert.throws(() => resolveFrontier("/fixture", [], forge()), /nonempty/);
  assert.throws(() => resolveFrontier("/fixture", [1, 1], forge()), /unique/);
  assert.throws(() => resolveFrontier("/fixture", [1], () => "{}"), /Invalid/);
  let calls = 0;
  assert.throws(() => resolveFrontier("/fixture", [1], () => JSON.stringify({ ...rows[0], headRefOid: sha(++calls) })), /changed during observation/);
  assert.throws(() => resolveFrontier("/fixture", undefined, (cmd, args, repo) => args[1] === "list" ? "[]" : forge()(cmd, args, repo)), /missing/);
});

test("gh discovery rejects its completeness bound and reobserves forge heads before returning", () => {
  const bounded = Array.from({ length: 1000 }, (_, index) => ({ ...row(index + 1, `branch-${index}`, "main"), headRefOid: sha(1) }));
  assert.throws(() => resolveFrontier("/fixture", undefined, forge(bounded)), /Incomplete\/bounded/);
  let lists = 0;
  const changing: FrontierCommand = (command, args, repo) => {
    if (args[1] !== "list") return forge()(command, args, repo);
    lists++;
    return JSON.stringify(lists === 1 ? rows : [rows[0], { ...rows[1], headRefOid: sha(3) }]);
  };
  assert.throws(() => resolveFrontier("/fixture", undefined, changing), /changed during observation/);
  assert.equal(lists, 2);
});

test("store preserves generation on failed frontier refresh and never reuses verification at a pushed head", async () => {
  const f = fixture(); let head = sha(1), broken = false;
  const store = openStore(join(f.root, "store"), { frontierCommand: () => broken ? "{}" : JSON.stringify({ ...rows[0], headRefOid: head }) });
  try {
    await store.init();
    await store.frontier.set({ repo: f.paths.cwd, prs: [1] });
    await store.ledger.record({ pr: 1, sha: head, verdict: "unit-test-verified", evidence: "actual-test-log", verifier: "parent" });
    head = sha(2);
    assert.equal((await store.frontier.set({ repo: f.paths.cwd, prs: [1] })).generation, 2);
    await assert.rejects(store.ledger.check({ pr: 1, sha: head }), NotFoundError);
    assert.equal((await store.ledger.check({ pr: 1, sha: sha(1) })).verdict, "unit-test-verified", "old evidence remains historical only");
    broken = true;
    await assert.rejects(store.frontier.set({ repo: f.paths.cwd, prs: [1] }));
    assert.equal((await store.frontier.show()).generation, 2);
  } finally { await store.close(); f.cleanup(); }
});

const profile = () => ({ version: 1 as const, models: defaultModels(), available: ["fixture/model"], parent: { provider: "fixture", id: "model" }, surface: "cli" as const, continuation: "manual" as const });
const rule = "Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.";
function plan(p = profile()) {
  const e = executionProfile(p);
  return `# Fixture plan\n\nOne unit.\n\n## How to read this\nOne box is one unit of work. Every box names the evidence. Check a box only when its evidence exists. Run playbooks/feature.md.\n${rule}\n\n## Program checklist\n### Arm the program\nWait for explicit go. Manual continuation only. No goal or scheduler. Use native completion notifications and a status message.\n### Spawn owners\n### PR mechanics\n### Verdict and merge\n### Boot recipe\n\n## Build fixture\n**Depends on.** None.\n**Files.**\n- [ ] file\n**Build.**\n- [ ] code\n**You see.**\n- [ ] result\n**Verify, unit.** ${rule}\n- [ ] unit receipt\n**Verify, live.** ${rule} ${e.marker}\n${Array.from({ length: e.scenarios }, (_, i) => `- [ ] Lane ${i + 1}. ${i === 0 ? "Regression lane against trunk." : "Scenario."} Save \`proof-${i}.log\`. Pass when the command exits zero.`).join("\n")}\n**Verify, perf.** ${rule}\n- [ ] Metric. duration\n- [ ] Probe. interleave\n- [ ] Baseline. trunk\n- [ ] Rule. budget\n**Review gate.** Operator review.\n- [ ] operator reads evidence\n**Merge.**\n- [ ] explicit authorization and current head proof\n## Close the program\n- [ ] handoff\n## Appendix A. Prototype evidence\nreceipt\n`;
}

test("execution profile keeps default ten coverage separate from concurrency and explicit model inheritance", () => {
  const p = profile(); p.models.concurrency = 2;
  const e = executionProfile(p);
  assert.equal(e.scenarios, 10); assert.equal(e.concurrency, 2); assert.equal(e.sameModel, true);
  assert.match(e.marker, /Same-model/);
  assert.throws(() => executionProfile({ ...p, scenarios: 3 }), /approval/);
  assert.equal(executionProfile({ ...p, scenarios: 3, coverageApproval: "user message abc" }).scenarios, 3);
  assert.throws(() => executionProfile({ ...p, available: [] }), /Unavailable/);
  assert.throws(() => executionProfile({ ...p, continuation: "pi-goal" }), /approval/);
});

test("actual plan checker accepts CLI evidence without goals/images and rejects profile/coverage/policy drift", () => {
  const f = fixture(); try {
    const p = profile(), file = join(f.root, "plan.md"), config = join(f.root, "execution.json");
    f.write(config, p);
    const check = (text: string) => { f.write(file, text); return spawnSync(process.execPath, [join(scripts, "check-plan.mjs"), file, config], { encoding: "utf8" }); };
    const valid = plan(p); const result = check(valid);
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /0 problems/);
    for (const invalid of [valid.replace("Concurrency 4", "Concurrency 10"), valid.replace("Same-model lanes", "Diverse lanes"), valid.replace(/- \[ \] Lane 10[^\n]*\n/, ""), valid.replace("Manual continuation only. No goal or scheduler.", "Arm /goal"), valid.replace("Regression lane against trunk.", ""), valid.replace("operator reads evidence", "screenshot only")])
      assert.equal(check(invalid).status, 1, invalid);
    const visual = { ...p, surface: "visual" as const }; f.write(config, visual);
    assert.equal(check(valid).status, 1, "visual surface cannot be satisfied by log-only proof");
    const visualPlan = valid.replace(/\.log`/g, ".png`").replace("operator reads evidence", "operator reads screenshot and video evidence");
    assert.equal(check(visualPlan).status, 0);
    const changed = { ...p, scenarios: 3, coverageApproval: "user-receipt#coverage" }; f.write(config, changed);
    const fewer = plan(changed).replace("Use native completion", "user-receipt#coverage. Use native completion");
    assert.equal(check(fewer).status, 0); assert.equal(check(fewer.replace("user-receipt#coverage. ", "")).status, 1);
    f.write(config, { ...p, continuation: "pi-goal", continuationApproval: "user-receipt#goal" });
    assert.equal(check(valid).status, 1);
    assert.equal(check(valid.replace("Manual continuation only. No goal or scheduler.", "pi-goal is the sole continuation owner. user-receipt#goal.")).status, 0);
  } finally { f.cleanup(); }
});

test("manual plan checker rejects /loop even with every required Pi marker", () => {
  const f = fixture(); try {
    const p = profile(), file = join(f.root, "plan.md"), config = join(f.root, "execution.json");
    f.write(config, p);
    const check = (text: string) => { f.write(file, text); return spawnSync(process.execPath, [join(scripts, "check-plan.mjs"), file, config], { encoding: "utf8" }); };
    const valid = plan(p);
    const accepted = check(valid);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /1 PR sections, 0 problems/);
    const rejected = check(valid.replace("### Boot recipe", "### Boot recipe\nRun /loop 1h."));
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.match(rejected.stderr, /Manual profile must not arm a goal or periodic continuation/);
  } finally { f.cleanup(); }
});

test("execution profile and real checker retain approved model:level selectors and reject effort drift", () => {
  const f = fixture(); try {
    const p = profile(); p.models.roles["swarm workers"] = ["fixture/model"];
    const support = [{ ...p.parent, reasoning: true }];
    p.models = proposeBudget(p.models, "medium", support).config;
    const snapshot = { ...p, support };
    const e = executionProfile(snapshot);
    assert.equal(e.runs[0].selector, "fixture/model:high"); assert.match(e.marker, /fixture\/model:high/);
    const file = join(f.root, "budget-plan.md"), config = join(f.root, "budget-profile.json");
    f.write(file, plan(snapshot)); f.write(config, snapshot);
    const check = () => spawnSync(process.execPath, [join(scripts, "check-plan.mjs"), file, config], { encoding: "utf8" });
    assert.equal(check().status, 0);
    f.write(file, plan(snapshot).replace("fixture/model:high", "fixture/model:medium")); assert.equal(check().status, 1);
    f.write(config, { ...snapshot, support: [{ ...p.parent, reasoning: false }] }); assert.equal(check().status, 2);
  } finally { f.cleanup(); }
});

test("manual plan instantiated from shipped multi-phase skeleton passes without autonomous tick boxes", () => {
  const f = fixture(); try {
    const p = { ...profile(), surface: "visual" as const };
    const skeleton = readFileSync("pstack/skills/poteto-mode/playbooks/multi-phase-plan.md", "utf8").split("````markdown\n")[1].split("````")[0];
    const text = skeleton.split("\n").filter(line => !line.includes("Autonomous profile only") && !line.startsWith("- [ ] Use this tick prompt")) .join("\n")
      .replace(/<Copy the selected profile continuation marker[^\n]+>/, "Manual continuation only. No goal or scheduler.")
      .replace(/<Paste the checker's exact execution-profile live marker[^\n]+>/, executionProfile(p).marker)
      .replace(/<[^>]+>/g, "fixture");
    assert.doesNotMatch(text, /current goal status|Use this tick prompt|Autonomous profile only/);
    const file = join(f.root, "manual-plan.md"), config = join(f.root, "execution.json");
    f.write(file, text); f.write(config, p);
    const result = spawnSync(process.execPath, [join(scripts, "check-plan.mjs"), file, config], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /0 problems/);
  } finally { f.cleanup(); }
});

test("normal retained CLI help/run remains check-only and actionable when dependencies are missing", () => {
  const f = fixture(); try {
    const isolated = join(f.root, "scripts");
    cpSync(scripts, isolated, { recursive: true, filter: path => !path.split("/").includes("node_modules") });
    for (const entry of ["orch/orch.ts", "watch-pr/watch-pr"]) for (const args of [["--help"], []]) {
      const r = spawnSync("bun", [join(isolated, entry), ...args], { encoding: "utf8" });
      assert.notEqual(r.status, 0); assert.match(r.stderr, /explicitly approve retained Bun helper dependencies/);
      assert.equal(existsSync(join(isolated, "node_modules")), false);
    }
    assert.doesNotMatch(readFileSync(join(isolated, "bootstrap.ts"), "utf8"), /spawn|execFile|bun install/);
  } finally { f.cleanup(); }
});

test("full retained helper suite executes without installing dependencies", () => {
  const r = spawnSync("bun", ["run", "test"], { cwd: scripts, encoding: "utf8", timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
