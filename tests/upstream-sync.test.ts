import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixtures.ts";
import { auditPackage, upstreamChanges } from "./upstream-sync-support.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const originalBaseline = "93b00b89ef425a9c1bac0d0b317dfc49c930ac99";
const previousBaseline = "c47b12849e43f18d5c374c7069c744cc55b0ea00";
const baseline = "dbf49813a39c1a5389c5e28cb8e4c1c2379e2454";
const rubric = "pstack/skills/interrogate/references/rubric.md";
const skill = "pstack/skills/principle-model-the-domain/SKILL.md";
const helpers = "pstack/skills/poteto-mode/scripts/package.json";
function copyCandidate(destination: string) {
  for (const path of ["README.md", "package.json", "pi", "pstack/LICENSE", "pstack/skills"]) cpSync(join(root, path), join(destination, path), { recursive: true, filter: path => !path.includes("/node_modules") });
}

test("upstream Git rehearsal inventories additions/changes/deletions and dependencies, merges portable content and requires explicit adapter resolution", () => {
  const f = fixture(), repo = f.paths.cwd;
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  const args = ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-C", repo];
  const git = (...command: string[]) => execFileSync("git", [...args, ...command], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const read = (path: string) => readFileSync(join(repo, path), "utf8");
  const commit = (message: string) => { git("add", "--all"); git("commit", "-m", message); return git("rev-parse", "HEAD"); };
  try {
    // Only this owned temporary repository is committed. Never fetch or mutate the development index.
    const archive = execFileSync("git", ["-C", root, "archive", baseline, "pstack/skills", "pstack/LICENSE"]);
    execFileSync("tar", ["-xf", "-", "-C", repo], { input: archive });
    git("init", "--initial-branch=upstream"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const imported = commit("fixture pinned upstream");
    git("checkout", "-b", "pi-adaptation"); copyCandidate(repo); commit("fixture Pi adaptation checkpoint");
    const adaptedBody = read(skill), portableBefore = read(rubric);
    git("checkout", "upstream");
    f.write(join(repo, rubric), read(rubric) + "\nFixture upstream rubric: verify the caller boundary.\n");
    f.write(join(repo, skill), read(skill) + "\nFixture upstream portable domain rule.\n");
    rmSync(join(repo, "pstack/skills/bro"), { recursive: true });
    const newSkill = "pstack/skills/fixture-new/SKILL.md";
    f.write(join(repo, newSkill), "---\nname: fixture-new\ndescription: Fixture-only upstream addition\ndisable-model-invocation: true\n---\n\n# Fixture\n\nRetain portable content.\n");
    f.write(join(repo, helpers), { ...JSON.parse(read(helpers)), dependencies: { commander: "99.0.0-fixture" } });
    f.write(join(repo, "pstack/skills/poteto-mode/scripts/bun.lock"), read("pstack/skills/poteto-mode/scripts/bun.lock") + "\n// fixture dependency change: review required\n");
    const upstream = commit("fixture upstream update");
    const report = upstreamChanges(repo, imported, upstream);
    assert.deepEqual(report.skills, [
      { status: "D", path: "pstack/skills/bro/SKILL.md" }, { status: "A", path: newSkill }, { status: "M", path: skill },
    ]);
    assert.deepEqual(report.adapterDependencies.map(c => c.path), ["pstack/skills/poteto-mode/scripts/bun.lock", helpers]);
    assert.deepEqual(report.portableContent.map(c => c.path), [rubric]);
    git("checkout", "pi-adaptation");
    const merge = spawnSync("git", [...args, "merge", "--no-commit", "--no-ff", upstream], { env, encoding: "utf8" });
    assert.equal(merge.status, 1, "deleted adapted skill must surface a modify/delete conflict");
    assert.match(merge.stdout, /CONFLICT.*bro\/SKILL.md/);
    assert.equal(read(rubric), portableBefore + "\nFixture upstream rubric: verify the caller boundary.\n");
    assert.equal(read(skill), adaptedBody + "\nFixture upstream portable domain rule.\n");
    // Reviewed fixture resolution: accept deletion, adapt/allowlist new entry, repair index links.
    git("rm", "pstack/skills/bro/SKILL.md");
    const pending = auditPackage(repo);
    assert.ok(pending.some(p => p.includes("Missing resource: ./pstack/skills/bro")));
    assert.ok(pending.some(p => p.includes("Unreviewed new skill")));
    assert.ok(pending.some(p => p.includes("Broken packaged link") && p.includes("bro/SKILL.md")));
    const manifest = JSON.parse(read("package.json"));
    manifest.pi.skills = manifest.pi.skills.filter((p: string) => !p.includes("/bro/")).concat(`./${newSkill}`).sort();
    f.write(join(repo, "package.json"), manifest);
    f.write(join(repo, newSkill), read(newSkill) + "\nRead [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.\n");
    const index = "pi/references/skills.md";
    f.write(join(repo, index), read(index).split("\n").filter(line => !line.includes("bro/SKILL.md")).join("\n") + `\n[Fixture new](../../${newSkill})\n`);
    for (const caller of ["pstack/skills/ketchup/SKILL.md", "pstack/skills/poteto-help/SKILL.md"]) {
      assert.ok(pending.some(problem => problem.includes(`Broken packaged link: ${caller} -> ../bro/SKILL.md`)), caller);
      f.write(join(repo, caller), read(caller).replace("[bro](../bro/SKILL.md)", "plain speech"));
    }
    // Dependency change is explicitly held, not installed or accepted as a qualified candidate.
    git("restore", `--source=${imported}`, "--", helpers, "pstack/skills/poteto-mode/scripts/bun.lock");
    assert.deepEqual(auditPackage(repo), []);
    const provenance = read("pi/UPSTREAM.md");
    f.write(join(repo, "pi/UPSTREAM.md"), provenance.replace(`Imported baseline: \`${baseline}\``, `Imported baseline: \`${upstream}\``));
    assert.ok(auditPackage(repo).some(p => p.includes("Stale upstream README pin")), "refresh must review the README attribution pins too");
    f.write(join(repo, "README.md"), read("README.md").replaceAll(`/tree/${baseline}/`, `/tree/${upstream}/`));
    assert.deepEqual(auditPackage(repo), []);
    commit("fixture reviewed adapter resolution; dependency update held");
    assert.equal(git("status", "--porcelain"), "");
    git("merge-base", "--is-ancestor", imported, "HEAD");
    git("merge-base", "--is-ancestor", upstream, "HEAD");
    assert.ok(read(rubric).includes("Fixture upstream rubric"));
    assert.match(read(skill), /Pi integration contract/);
    assert.ok(!JSON.parse(read("package.json")).pi.skills.some((p: string) => /make-bot-ui|benny/.test(p)));
  } finally { f.cleanup(); }
});

test("update gate rejects wildcard/deferred re-enablement, deleted adapter imports and broken packaged links", () => {
  const f = fixture(); try {
    copyCandidate(f.paths.cwd);
    assert.deepEqual(auditPackage(f.paths.cwd), []);
    const readme = readFileSync(join(f.paths.cwd, "README.md"), "utf8");
    f.write(join(f.paths.cwd, "README.md"), readme.replaceAll(`https://github.com/cursor/plugins/tree/${baseline}/`, "https://example.invalid/upstream/"));
    assert.ok(auditPackage(f.paths.cwd).includes("Missing upstream README pins"));
    f.write(join(f.paths.cwd, "README.md"), readme);
    const manifest = JSON.parse(readFileSync(join(f.paths.cwd, "package.json"), "utf8"));
    manifest.pi.skills.push("./pstack/skills/**/SKILL.md", "./pstack/skills/make-bot-ui/SKILL.md", "./pstack/automations/benny/skills/setup-benny/SKILL.md");
    f.write(join(f.paths.cwd, "package.json"), manifest);
    f.write(join(f.paths.cwd, "pi/references/fixture.md"), "[missing](deleted.md)\n[deferred](../../pstack/skills/make-bot-ui/SKILL.md)\n");
    rmSync(join(f.paths.cwd, "pi/lib/models.ts"));
    const problems = auditPackage(f.paths.cwd);
    for (const phrase of ["Non-explicit skills", "Forbidden resource: ./pstack/skills/make-bot-ui", "Forbidden resource: ./pstack/automations/benny", "Broken packaged link", "Missing adapter import"]) assert.ok(problems.some(p => p.includes(phrase)), phrase);
  } finally { f.cleanup(); }
});


test("frozen refresh dispositions cover every upstream path and deleted how critique resources cannot return", () => {
  const report = upstreamChanges(root, originalBaseline, previousBaseline);
  const changed = report.changes.filter(c => c.path.startsWith("pstack/"));
  const inventory = readFileSync(join(root, "pi/upstream-updates/c47b128.md"), "utf8");
  const rows = [...inventory.matchAll(/^\| `(pstack\/[^`]+)` \| ([PARDN])\./gm)];
  assert.equal(changed.length, 100);
  assert.deepEqual(rows.map(row => row[1]).sort(), changed.map(c => c.path).sort());
  const deleted = changed.filter(c => c.status === "D").map(c => c.path);
  assert.deepEqual(deleted, ["pstack/skills/how/references/critic-prompt.md", "pstack/skills/how/references/critique-rubric.md"]);
  for (const path of deleted) {
    assert.equal(existsSync(join(root, path)), false, path);
    assert.ok(rows.some(row => row[1] === path && row[2] === "D"));
  }
  assert.deepEqual(changed.filter(c => c.status === "A").map(c => c.path), [
    "pstack/skills/principle-attack-the-premise/SKILL.md", "pstack/skills/principle-test-behavior-not-implementation/SKILL.md",
  ]);
  for (const path of ["pstack/skills/how/SKILL.md", "pstack/skills/architect/SKILL.md", "pstack/skills/poteto-mode/playbooks/investigation.md"])
    assert.doesNotMatch(readFileSync(join(root, path), "utf8"), /how critics|critique-rubric|critic-prompt|how[^\n]*critique/i);
  const unchanged = execFileSync("git", ["diff", originalBaseline, previousBaseline, "--", "cursor-team-kit/skills/deslop", "pstack/LICENSE", "cursor-team-kit/LICENSE", helpers, "pstack/skills/poteto-mode/scripts/bun.lock"], { cwd: root, encoding: "utf8" });
  assert.equal(unchanged, "", "licenses, deslop and frozen helper inputs have no upstream change");
});

test("0.15.23 inventory covers 90 pstack paths and preserves excluded monorepo bytes", () => {
  const target = baseline;
  const changed = upstreamChanges(root, previousBaseline, target).changes;
  const pstack = changed.filter(c => c.path.startsWith("pstack/"));
  assert.equal(pstack.length, 90);
  assert.equal(pstack.filter(c => c.status === "A").length, 10);
  assert.equal(pstack.filter(c => c.status === "M").length, 80);
  const inventory = readFileSync(join(root, "pi/upstream-updates/dbf4981.md"), "utf8");
  const rows = [...inventory.matchAll(/^\| `(pstack\/[^`]+)` \| ([PARN])\./gm)];
  assert.deepEqual(rows.map(row => row[1]).sort(), pstack.map(c => c.path).sort());
  const other = changed.filter(c => !c.path.startsWith("pstack/"));
  assert.equal(other.length, 60, "59 rename-aware records expand the Mercury license rename into two paths");
  for (const change of [...other, ...pstack.filter(c => !c.path.startsWith("pstack/skills/"))]) {
    assert.ok(inventory.includes(`\`${change.path}\``), change.path);
    if (change.path === "README.md") continue;
    if (change.status === "D") assert.equal(existsSync(join(root, change.path)), false, change.path);
    else assert.deepEqual(readFileSync(join(root, change.path)), execFileSync("git", ["show", `${target}:${change.path}`], { cwd: root }), change.path);
  }
  for (const path of ["pstack/LICENSE", "cursor-team-kit/LICENSE", "cursor-team-kit/skills/deslop/SKILL.md", "pstack/skills/poteto-mode/scripts/bun.lock"]) {
    assert.equal(execFileSync("git", ["diff", previousBaseline, target, "--", path], { cwd: root, encoding: "utf8" }), "", path);
    assert.deepEqual(readFileSync(join(root, path)), execFileSync("git", ["show", `${target}:${path}`], { cwd: root }), path);
  }
  for (const path of ["pstack/skills/deslop/SKILL.md", "pstack/skills/deslop/LICENSE"]) assert.deepEqual(readFileSync(join(root, path)), execFileSync("git", ["show", `HEAD:${path}`], { cwd: root }), path);
  assert.deepEqual(readFileSync(join(root, helpers)), execFileSync("git", ["show", `${target}:${helpers}`], { cwd: root }));
});
