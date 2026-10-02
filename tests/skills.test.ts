import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "./fixtures.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("package.json"));
const entries: string[] = manifest.pi.skills;
const integration = "Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.";
function markdownFiles(dir: string, sourceRoot = root): string[] {
  return readdirSync(join(sourceRoot, dir), { withFileTypes: true }).flatMap(e => {
    if (e.name === "node_modules") return [];
    return e.isDirectory() ? markdownFiles(`${dir}/${e.name}`, sourceRoot) : e.name.endsWith(".md") ? [`${dir}/${e.name}`] : [];
  });
}
const activeMarkdown = [...markdownFiles("pstack/skills").filter(p => !p.includes("/make-bot-ui/")), ...markdownFiles("pi/references")];

test("actual Pi loader exposes every selected direct skill, hides principle leaves and honors project verification destinations", async () => {
  const f = fixture(); try {
    f.settings("user", { packages: [root] });
    f.write(join(f.paths.cwd, ".pi/skills/verify-fixture/SKILL.md"), "---\nname: verify-fixture\ndescription: Verify the fixture app\n---\nLaunch, doctor, drive, evidence, cleanup.\n");
    const loader = new DefaultResourceLoader({ ...f.paths, settingsManager: SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true }) });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    assert.equal(skills.length, 48);
    const catalog = new Map(skills.map(s => [s.name, s]));
    for (const path of entries) {
      const name = /\/([^/]+)\/SKILL.md$/.exec(path)![1];
      const skill = catalog.get(name)!; assert.ok(skill, `/skill:${name} resource`);
      assert.equal(resolve(skill.filePath), resolve(root, path));
      const body = readFileSync(skill.filePath, "utf8");
      assert.ok(body.includes(integration), `Direct ${name} loads shared policy without requiring mode`);
      assert.equal(skill.disableModelInvocation, !["setup-pstack", "deslop"].includes(name));
    }
    assert.equal(skills.filter(s => s.name.startsWith("principle-")).length, 23);
    assert.ok(catalog.get("verify-fixture")!.filePath.includes(".pi/skills/verify-fixture"));
    for (const absent of ["make-bot-ui", "setup-benny", "triage-issue-reports", "pistack-foundation"]) assert.equal(catalog.has(absent), false);
  } finally { f.cleanup(); }
});

test("explicit package index covers the complete audited inventory and mode routes every playbook without hidden trigger assumptions", () => {
  const inventory = readdirSync(join(root, "pstack/skills"), { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== "make-bot-ui").map(e => `./pstack/skills/${e.name}/SKILL.md`).sort();
  assert.deepEqual(entries, inventory);
  const index = read("pi/references/skills.md");
  for (const entry of entries) assert.ok(index.includes(`../../${entry.slice(2)}`), entry);
  const mode = read("pstack/skills/poteto-mode/SKILL.md");
  for (const file of readdirSync(join(root, "pstack/skills/poteto-mode/playbooks"))) assert.ok(mode.includes(`playbooks/${file}`), file);
  assert.match(read("pi/references/integration.md"), /When mode is on, read \[poteto-mode\]/);
  assert.match(read("pi/references/integration.md"), /On TypeScript edits explicitly read/);
  assert.match(mode, /Direct `\/skill:poteto-mode` is task-local/);
  assert.doesNotMatch(read("pstack/skills/typescript-best-practices/SKILL.md"), /^paths:/m);
});

function assertMarkdownLinks(files: string[], sourceRoot = root) {
  for (const file of files) {
    // Ignore template fences; their example output links are not package references.
    const body = readFileSync(join(sourceRoot, file), "utf8").replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
    for (const match of body.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (file === "pstack/skills/why/references/synthesizer-prompt.md" && target === "url") continue; // Upstream citation template, not a package link.
      const destination = resolve(sourceRoot, dirname(file), target);
      assert.ok(destination.startsWith(resolve(sourceRoot) + "/"), `${file} escapes package: ${target}`);
      assert.ok(existsSync(destination), `${file} broken link: ${target}`);
    }
  }
}

test("active Markdown relative links resolve within the packaged source tree", () => {
  assertMarkdownLinks(activeMarkdown);
});

test("Markdown scans exclude installed dependencies but still reject owned broken links", () => {
  const f = fixture(); try {
    const dir = "pstack/skills/poteto-mode/scripts";
    const owned = `${dir}/README.md`;
    f.write(join(f.root, owned), "[Helper](./guide.md)\n");
    f.write(join(f.root, dir, "guide.md"), "Owned helper guide.\n");
    f.write(join(f.root, dir, "node_modules/commander/Readme.md"), "[Missing translation](./Readme_zh-CN.md)\n`Task`\n");
    const files = markdownFiles("pstack/skills", f.root);
    assert.deepEqual(files.sort(), [owned, `${dir}/guide.md`].sort());
    assert.doesNotThrow(() => assertMarkdownLinks(files, f.root));
    f.write(join(f.root, owned), "[Broken helper link](./missing.md)\n");
    assert.throws(() => assertMarkdownLinks(files, f.root), /scripts\/README\.md broken link: \.\/missing\.md/);
  } finally { f.cleanup(); }
});

test("Bugbot prose paths resolve from the declared skill base, including generated plans outside the package", () => {
  const skill = "pstack/skills/poteto-mode";
  const expected = resolve(root, skill, "references/bugbot-triage.md");
  for (const name of ["autopilot-full", "autopilot-stack", "babysit", "multi-phase-plan"]) {
    const body = read(`${skill}/playbooks/${name}.md`);
    const paths = [...body.matchAll(/`([^`]*bugbot-triage\.md)`/g)].map(match => match[1]);
    assert.ok(paths.length, name);
    for (const path of paths) {
      const destination = path.startsWith("<resolved package>/") ? resolve(root, path.slice("<resolved package>/".length)) : resolve(root, skill, path);
      assert.equal(destination, expected, `${name}: ${path}`); assert.ok(existsSync(destination));
      if (name === "multi-phase-plan") assert.ok(path.startsWith("<resolved package>/"), "generated plan cannot rely on its own docs/plans directory or package vendoring");
    }
  }
});

test("active instructions reject obsolete tool/model/cloud/path and unsafe cleanup recipes", () => {
  const forbidden = /\/loop\b|\.cursor\/|agent-transcripts\/|subagent_type|run_in_background|cloud_base_branch|environment:\s*["']cloud|`Task`|Task tool|AskQuestion|grok-4\.|claude-fable|gpt-5\.6-sol|claude-opus-5|Cursor's built-in|git reset --hard|git worktree remove --force|rm -rf|simctl.*delete all|^paths:/m;
  for (const file of activeMarkdown) assert.doesNotMatch(read(file), forbidden, file);
  for (const poison of ["`/loop`", "`Task`", "environment: \"cloud\"", "git reset --hard", "paths: [x]", "~/.cursor/skills/x"]) assert.match(poison, forbidden);
  assert.match(read("pi/references/integration.md"), /Explicit task limits and harness permissions override/);
  assert.match(read("pi/references/delegation.md"), /Never substitute a shell-agent, external CLI or foreground executor/);
});

test("portable principle bodies and review rubrics are retained, with only approved authority seams changed", () => {
  const adapted = new Set(["principle-build-the-lever", "principle-encode-lessons-in-structure", "principle-never-block-on-the-human", "principle-sequence-verifiable-units"]);
  for (const entry of entries.filter(p => p.includes("/principle-"))) {
    const name = entry.split("/").at(-2)!; if (adapted.has(name)) continue;
    const original = execFileSync("git", ["show", `c47b12849e43f18d5c374c7069c744cc55b0ea00:${entry.slice(2)}`], { cwd: root, encoding: "utf8" });
    assert.equal(read(entry).replace(`\n\n${integration}\n`, ""), original, name);
  }
  for (const path of ["interrogate/references/code-quality-review.md", "interrogate/references/lead-judgment.md", "why/references/epistemics.md", "typescript-best-practices/references/patterns.md"]) {
    const file = `pstack/skills/${path}`;
    assert.equal(read(file), execFileSync("git", ["show", `c47b12849e43f18d5c374c7069c744cc55b0ea00:${file}`], { cwd: root, encoding: "utf8" }), file);
  }
  assert.match(read("pstack/skills/deslop/LICENSE"), /Copyright \(c\) 2026 Cursor/);
  assert.match(read("pstack/skills/deslop/SKILL.md"), /cursor-team-kit at `93b00b89/);
});

test("packaged child skills point to original sources and no profile widens ambient or nested capabilities", () => {
  for (const name of ["poteto-agent", "comment-sicko", "analyst"]) {
    const file = `pi/agents/profiles/${name}.md`; const body = read(file);
    assert.match(body, /^extensions:\s*$/m); assert.match(body, /^allowNestedSubagents: false$/m); assert.match(body, /^inheritSkills: false$/m);
    const paths = /^skillPath: (.+)$/m.exec(body)![1].split(", ").map(p => resolve(root, dirname(file), p));
    for (const skill of /^skills: (.+)$/m.exec(body)![1].split(", ")) assert.ok(paths.some(p => existsSync(join(p, skill, "SKILL.md"))), `${name}: ${skill}`);
  }
  assert.match(read("pi/agents/profiles/analyst.md"), /^tools: read, grep, find, ls$/m);
  assert.match(read("pi/agents/profiles/comment-sicko.md"), /parent must accept and fix the root cause before removing a correctness suppression/);
});
