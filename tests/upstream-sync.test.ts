import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixtures.ts";
import { auditPackage, upstreamChanges } from "./upstream-sync-support.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = "93b00b89ef425a9c1bac0d0b317dfc49c930ac99";
const rubric = "pstack/skills/how/references/critique-rubric.md";
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
