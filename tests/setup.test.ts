import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, chmodSync, unlinkSync, realpathSync, symlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { applyProposal, buildProposal, dependencyManifest, inspectSetup, sourceIdentity, helperStatus, markHelpersReady, loadConfig, configPath, runCommand, inspectPrerequisites, formatProposal } from "../pi/lib/setup.ts";
import { fixture } from "./fixtures.ts";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";

import { proposeBudget, resolveRole } from "../pi/lib/models.ts";

const core = dependencyManifest.extensions.filter(d => d.required);
function installCore(f: ReturnType<typeof fixture>) {
  for (const d of core) f.pkg(join(f.paths.agentDir, "npm/node_modules", d.name), d.name, d.version);
  f.settings("user", { packages: core.map(d => `npm:${d.name}@${d.version}`), theme: "unchanged", nested: { keep: true } });
}
test("setup retires how critics only in the approved proposal and preserves saved four-entry panels", async () => {
  const f = fixture(); try {
    installCore(f);
    const config = (await inspectSetup(f.paths)).config;
    config.models.roles["how critics"] = ["retired/unavailable"];
    config.models.roles["arena runners"] = ["inherit", "inherit", "inherit", "inherit"];
    (config.models as any).operatorNote = { keep: true };
    f.write(configPath(f.paths, "user"), config);
    const before = readFileSync(configPath(f.paths, "user"), "utf8");
    const i = await inspectSetup(f.paths), p = buildProposal(f.paths, i, "user", i.config);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    assert.match(formatProposal(p), /Remove retired role.*how critics/);
    assert.equal(p.config.models.roles["how critics"], undefined);
    await applyProposal(f.paths, p, { approved: false });
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    assert.equal((await applyProposal(f.paths, p, { approved: true })).error, undefined);
    const saved = loadConfig(f.paths).config;
    assert.equal(saved.models.roles["how critics"], undefined);
    assert.deepEqual(saved.models.roles["arena runners"], config.models.roles["arena runners"]);
    assert.deepEqual((saved.models as any).operatorNote, { keep: true });
    const next = await inspectSetup(f.paths);
    assert.equal((await applyProposal(f.paths, buildProposal(f.paths, next, "user", next.config), { approved: true })).changed, false);
  } finally { f.cleanup(); }
});

test("setup rejects fresh reasoning capability drift after approval without config or journal writes", async () => {
  const f = fixture(); try {
    installCore(f);
    const i = await inspectSetup(f.paths);
    const model = { provider: "fixture", id: "reasoning", reasoning: true };
    i.config.models.roles["bug-fix"] = ["fixture/reasoning"];
    f.write(configPath(f.paths, "user"), i.config);
    const fresh = await inspectSetup(f.paths);
    const approved = proposeBudget(fresh.config.models, "medium", [model]).config;
    const p = buildProposal(f.paths, fresh, "user", { ...fresh.config, models: approved });
    const before = readFileSync(configPath(f.paths, "user"), "utf8");
    const result = await applyProposal(f.paths, p, { approved: true, validateModels: () => {
      try { resolveRole(p.config.models, "bug-fix", ["fixture/reasoning"], model, [{ ...model, thinkingLevelMap: { high: null } }]); return []; }
      catch (error) { return [String(error)]; }
    } });
    assert.match(result.error!, /Unsupported/); assert.equal(result.changed, false);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    assert.equal(existsSync(join(f.paths.agentDir, "pistack-setup.json")), false);
  } finally { f.cleanup(); }
});

test("setup revalidates model policy at final save after dependency side effects", async () => {
  const f = fixture(); try {
    installCore(f);
    const i = await inspectSetup(f.paths), dep = dependencyManifest.extensions.find(d => !d.required)!;
    f.write(configPath(f.paths, "user"), i.config);
    const before = readFileSync(configPath(f.paths, "user"), "utf8");
    const fresh = await inspectSetup(f.paths);
    const p = buildProposal(f.paths, fresh, "user", { ...fresh.config, optional: [dep.name] });
    let drift = false;
    const result = await applyProposal(f.paths, p, { approved: true, validateModels: () => drift ? ["Unsupported approved high after registry change"] : [], run: async (_command, args) => {
      f.pkg(join(f.paths.agentDir, "npm/node_modules", dep.name), dep.name, dep.version);
      const settings = JSON.parse(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"));
      f.settings("user", { ...settings, packages: [...settings.packages, args[1]] });
      drift = true; return { code: 0, stdout: "fixture only", stderr: "" };
    } });
    assert.match(result.error!, /Unsupported/); assert.equal(result.changed, true);
    assert.deepEqual(result.completed, [dep.name]);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    assert.equal(JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-setup.json"), "utf8")).configState, "pending");
  } finally { f.cleanup(); }
});

test("setup clean proposal, decline and cancellation never mutate real temporary settings", async () => {
  const f = fixture(); try {
    f.settings("user", { theme: "unchanged" });
    const before = readFileSync(join(f.paths.agentDir, "settings.json"), "utf8");
    const inspection = await inspectSetup(f.paths);
    const proposal = buildProposal(f.paths, inspection, "project", inspection.config);
    assert.equal(proposal.conflicts.length, 0); assert.equal(proposal.steps.length, 3);
    assert.ok(proposal.steps.every(s => s.args.includes("-l")));
    const run = async () => { throw new Error("must not run"); };
    assert.match((await applyProposal(f.paths, proposal, { approved: false, run })).error!, /Cancelled/);
    const abort = new AbortController(); abort.abort();
    assert.match((await applyProposal(f.paths, proposal, { approved: true, signal: abort.signal, run })).error!, /Cancelled/);
    assert.equal(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"), before);
    assert.equal(existsSync(configPath(f.paths, "project")), false);
  } finally { f.cleanup(); }
});
test("existing pinned npm installation is reused, unrelated settings preserved and config rerun idempotent", async () => {
  const f = fixture(); try {
    installCore(f);
    const before = readFileSync(join(f.paths.agentDir, "settings.json"), "utf8");
    const inspection = await inspectSetup(f.paths);
    const proposal = buildProposal(f.paths, inspection, "user", inspection.config);
    assert.deepEqual(proposal.conflicts, []); assert.equal(proposal.reuse.length, 3); assert.equal(proposal.steps.length, 0);
    assert.equal((await applyProposal(f.paths, proposal, { approved: true })).error, undefined);
    const second = await inspectSetup(f.paths);
    assert.equal((await applyProposal(f.paths, buildProposal(f.paths, second, "user", second.config), { approved: true })).changed, false);
    assert.equal(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"), before);
  } finally { f.cleanup(); }
});
test("npm, git and local equivalents are detected without executing their resources", async () => {
  const f = fixture(); try {
    installCore(f);
    const local = f.pkg(join(f.root, "local-subagents"), "pi-subagents", core[0].version);
    const git = f.pkg(join(f.paths.cwd, ".pi/git/github.com/nicobailon/pi-subagents"), "pi-subagents", core[0].version);
    f.settings("project", { packages: [local, `git:github.com/nicobailon/pi-subagents@v${core[0].version}`] });
    const inspection = await inspectSetup(f.paths);
    assert.ok(inspection.rows.some(r => r.path === git));
    const p = buildProposal(f.paths, inspection, "project", inspection.config);
    assert.ok(p.conflicts.some(c => /duplicate npm\/git\/local/.test(c)));
    assert.match((await applyProposal(f.paths, p, { approved: true })).error!, /Refused/);
    assert.deepEqual(readdirSync(local).sort(), ["index.ts", "package.json"]);
  } finally { f.cleanup(); }
});
test("project npm override wins global but same-scope duplicate entries refuse", async () => {
  const f = fixture(); try {
    installCore(f);
    const d = core[0]; const source = `npm:${d.name}@${d.version}`;
    f.pkg(join(f.paths.cwd, ".pi/npm/node_modules", d.name), d.name, d.version);
    f.settings("project", { packages: [source] });
    let i = await inspectSetup(f.paths);
    assert.equal(i.rows.find(r => r.name === d.name && r.scope === "user")!.shadowed, true);
    assert.deepEqual(buildProposal(f.paths, i, "project", i.config).conflicts, []);
    f.settings("project", { packages: [source, source] }); i = await inspectSetup(f.paths);
    assert.match(buildProposal(f.paths, i, "project", i.config).conflicts.join("\n"), /duplicate/);
  } finally { f.cleanup(); }
});
test("Pi resolver honors empty, glob, exact +/- and autoload delta filters; disabled is never silently enabled", async () => {
  const f = fixture(); try {
    installCore(f);
    const d = core[0]; const source = `npm:${d.name}@${d.version}`;
    for (const filter of [{ extensions: [] }, { extensions: ["!**/*.ts"] }, { extensions: ["-index.ts"] }, { autoload: false, extensions: ["-index.ts"] }]) {
      f.settings("project", { packages: [{ source, ...filter }] });
      if (!filter.autoload) f.pkg(join(f.paths.cwd, ".pi/npm/node_modules", d.name), d.name, d.version);
      const i = await inspectSetup(f.paths);
      assert.match(buildProposal(f.paths, i, "project", i.config).conflicts.join("\n"), /disabled|filtered/, JSON.stringify(filter));
    }
    f.settings("project", { packages: [{ source, autoload: false, extensions: ["+index.ts"] }] });
    const i = await inspectSetup(f.paths);
    assert.deepEqual(buildProposal(f.paths, i, "project", i.config).conflicts, []);
  } finally { f.cleanup(); }
});
test("incompatible versions, unknown sources, and foreign loaded tool providers fail closed", async () => {
  const f = fixture(); try {
    const local = f.pkg(join(f.root, "old"), "pi-subagents", "0.1.0");
    f.settings("user", { packages: [local] });
    let i = await inspectSetup(f.paths);
    assert.match(buildProposal(f.paths, i, "user", i.config).conflicts.join("\n"), /refusing to replace/);
    f.settings("user", { packages: ["git:github.com/someone/unknown-fork"] }); i = await inspectSetup(f.paths);
    assert.match(buildProposal(f.paths, i, "user", i.config).conflicts.join("\n"), /Unresolved source/);
    f.settings("user", {}); i = await inspectSetup(f.paths);
    const tools = [{ name: "subagent", sourceInfo: { path: join(f.root, "other.ts"), source: "other", scope: "user", origin: "top-level" } }] as any;
    assert.match(buildProposal(f.paths, i, "user", i.config, tools).conflicts.join("\n"), /tool already provided/);
  } finally { f.cleanup(); }
});
test("direct local extension paths with a package manifest are equivalent providers", async () => {
  const f = fixture(); try {
    installCore(f);
    const local = f.pkg(join(f.root, "checkout"), "pi-subagents", core[0].version);
    f.settings("project", { extensions: [join(local, "index.ts")] });
    const i = await inspectSetup(f.paths);
    assert.match(buildProposal(f.paths, i, "project", i.config).conflicts.join("\n"), /duplicate/);
  } finally { f.cleanup(); }
});
test("failed install retains completed receipts; retry proposes only unfinished work using real settings", async () => {
  const f = fixture(); try {
    f.settings("user", { theme: "keep", extra: { object: [1, 2] } });
    let i = await inspectSetup(f.paths);
    const p = buildProposal(f.paths, i, "user", i.config);
    const calls: string[] = [];
    const fakeInstall = async (_command: string, args: string[]) => {
      calls.push(args[1]);
      if (calls.length === 2) return { code: 1, stdout: "", stderr: "offline fixture failure" };
      const dep = core.find(d => args[1] === `npm:${d.name}@${d.version}`)!;
      f.pkg(join(f.paths.agentDir, "npm/node_modules", dep.name), dep.name, dep.version);
      const settings = JSON.parse(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"));
      settings.packages = [...(settings.packages ?? []), args[1]]; f.settings("user", settings);
      return { code: 0, stdout: "fixture installed", stderr: "" };
    };
    const failed = await applyProposal(f.paths, p, { approved: true, run: fakeInstall });
    assert.deepEqual(failed.completed, [core[0].name]); assert.match(failed.error!, /offline/);
    assert.equal(existsSync(configPath(f.paths, "user")), false);
    const receipt = JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-setup.json"), "utf8"));
    assert.equal(receipt.steps[0].state, "complete"); assert.equal(receipt.steps[1].state, "failed");
    i = await inspectSetup(f.paths); const retry = buildProposal(f.paths, i, "user", i.config);
    assert.deepEqual(retry.steps.map(s => s.name), core.slice(1).map(d => d.name));
    const done = await applyProposal(f.paths, retry, { approved: true, run: fakeInstall }); assert.equal(done.error, undefined);
    assert.deepEqual(JSON.parse(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8")).extra, { object: [1, 2] });
  } finally { f.cleanup(); }
});
for (const projectTrusted of [false, true]) for (const restoreMissing of [false, true]) {
  test(`installer preserves ${projectTrusted ? "session-only trust" : "explicit distrust over saved trust"} (${restoreMissing ? "restore" : "new"} source)`, async () => {
    const f = fixture(); try {
      const paths = { ...f.paths, projectTrusted };
      const scope = projectTrusted ? "project" : "user";
      const log = join(f.root, "installer.log");
      const rejectedLog = join(f.root, "untrusted-project.log");
      const installer = join(f.root, "fixture-installer.cjs");
      const rejected = join(f.root, "fixture-rejected.cjs");
      // Both npmCommand choices are fixture-only: no package manager or network can run.
      f.write(installer, `const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== 'install' || !args.includes('--prefix')) process.exit(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const spec = args[1], split = spec.lastIndexOf('@');
const dir = path.join(args[args.indexOf('--prefix') + 1], 'node_modules', spec.slice(0, split));
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: spec.slice(0, split), version: spec.slice(split + 1), pi: { extensions: ['./index.ts'], skills: [], prompts: [], themes: [] } }));
fs.writeFileSync(path.join(dir, 'index.ts'), 'export default function() {}');
`);
      f.write(rejected, `require('node:fs').writeFileSync(${JSON.stringify(rejectedLog)}, 'ran'); process.exit(7);`);
      f.settings("user", { defaultProjectTrust: "ask", npmCommand: [process.execPath, installer] });
      f.settings("project", { npmCommand: [process.execPath, projectTrusted ? installer : rejected] });
      const trustPath = join(paths.agentDir, "trust.json");
      if (!projectTrusted) new ProjectTrustStore(paths.agentDir).set(paths.cwd, true);
      const trustBefore = existsSync(trustPath) ? readFileSync(trustPath, "utf8") : undefined;
      if (restoreMissing) {
        const settingsPath = join(scope === "user" ? paths.agentDir : join(paths.cwd, ".pi"), "settings.json");
        f.settings(scope, { ...JSON.parse(readFileSync(settingsPath, "utf8")), packages: [`npm:${core[0].name}@${core[0].version}`] });
      }
      const i = await inspectSetup(paths); const p = buildProposal(paths, i, scope, i.config);
      assert.match(formatProposal(p), new RegExp(projectTrusted ? "--approve" : "--no-approve"));
      assert.match(formatProposal(p), /saved trust is unchanged/);
      const calls: string[][] = [];
      const result = await applyProposal(paths, p, { approved: true, run: async (command, args, options) => {
        assert.equal(command, "pi"); calls.push(args);
        return runCommand(process.execPath, [join(process.env.PISTACK_TEST_PI_ROOT!, "dist/cli.js"), ...args], { ...options, signal: AbortSignal.timeout(10000) });
      } });
      assert.equal(result.error, undefined);
      assert.equal(calls.length, 3);
      assert.ok(calls.every(args => args.includes(projectTrusted ? "--approve" : "--no-approve")));
      assert.equal(existsSync(rejectedLog), false);
      assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 3);
      assert.equal(existsSync(trustPath) ? readFileSync(trustPath, "utf8") : undefined, trustBefore);
    } finally { f.cleanup(); }
  });
}

test("stale approval, malformed settings, untrusted project and project model authority", async () => {
  const f = fixture(); try {
    installCore(f); let i = await inspectSetup(f.paths); const p = buildProposal(f.paths, i, "user", i.config);
    f.settings("project", { theme: "changed" });
    assert.match((await applyProposal(f.paths, p, { approved: true })).error!, /changed since approval/);
    f.write(configPath(f.paths, "project"), { ...i.config, helpers: true });
    assert.equal(loadConfig(f.paths).config.helpers, true);
    const untrusted = { ...f.paths, projectTrusted: false };
    assert.equal(loadConfig(untrusted).config.helpers, false);
    i = await inspectSetup(untrusted); assert.match(buildProposal(untrusted, i, "project", i.config).conflicts.join("\n"), /not trusted/);
    f.settings("user", "{broken"); await assert.rejects(inspectSetup(f.paths));
  } finally { f.cleanup(); }
});
for (const change of ["edited", "created", "removed"]) {
  test(`shadowed user destination ${change} after approval is preserved without mutation`, async () => {
    const f = fixture(); try {
      installCore(f); const config = (await inspectSetup(f.paths)).config;
      f.write(configPath(f.paths, "project"), config);
      const destination = configPath(f.paths, "user");
      if (change !== "created") f.write(destination, config);
      const i = await inspectSetup(f.paths); const p = buildProposal(f.paths, i, "user", i.config);
      assert.equal(p.steps.length, 0);
      if (change === "removed") unlinkSync(destination);
      else f.write(destination, JSON.stringify({ ...config, models: { ...config.models, concurrency: 7 }, personal: "keep exact bytes" }) + "\n\n");
      const before = existsSync(destination) ? readFileSync(destination, "utf8") : undefined;
      const result = await applyProposal(f.paths, p, { approved: true, run: async () => { throw new Error("must not run"); } });
      assert.match(result.error!, /destination.*changed/i);
      assert.equal(result.changed, false);
      assert.equal(existsSync(destination) ? readFileSync(destination, "utf8") : undefined, before);
      assert.equal(existsSync(join(f.paths.agentDir, "pistack-setup.json")), false);
    } finally { f.cleanup(); }
  });
}

test("shadowed user destination changed during installation is not overwritten at final save", async () => {
  const f = fixture(); try {
    installCore(f); const config = (await inspectSetup(f.paths)).config;
    f.write(configPath(f.paths, "project"), config); f.write(configPath(f.paths, "user"), config);
    const dep = dependencyManifest.extensions.find(d => !d.required)!;
    const i = await inspectSetup(f.paths); const p = buildProposal(f.paths, i, "user", { ...config, optional: [dep.name] });
    const changed = JSON.stringify({ ...config, optional: [], personal: "edited while installer runs" }) + "\n\n";
    const result = await applyProposal(f.paths, p, { approved: true, run: async (_command, args) => {
      f.pkg(join(f.paths.agentDir, "npm/node_modules", dep.name), dep.name, dep.version);
      const settings = JSON.parse(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"));
      f.settings("user", { ...settings, packages: [...settings.packages, args[1]] });
      f.write(configPath(f.paths, "user"), changed);
      return { code: 0, stdout: "fixture installed", stderr: "" };
    } });
    assert.match(result.error!, /destination.*changed/i);
    assert.deepEqual(result.completed, [dep.name]);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), changed);
    assert.equal(JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-setup.json"), "utf8")).configState, "pending");
  } finally { f.cleanup(); }
});

for (const window of ["before execution", "during installation", "stable"]) {
  test(`setup binds config and journal physical parents (${window})`, async () => {
    const f = fixture(); try {
      installCore(f);
      const directory = ownedHelperFixture(f);
      const paths = { ...f.paths, helpersDirectory: directory };
      const config = (await inspectSetup(paths)).config;
      const a = join(f.root, "parent-A"), b = join(f.root, "parent-B"), link = join(paths.cwd, ".pi");
      for (const parent of [a, b]) {
        f.write(join(parent, "settings.json"), {});
        f.write(join(parent, "pistack.json"), config);
        f.write(join(parent, "pistack-setup.json"), "sentinel journal\n");
      }
      symlinkSync(a, link, "dir");
      const before = readdirSync(b).map(file => [file, readFileSync(join(b, file), "utf8")]);
      const i = await inspectSetup(paths);
      const p = buildProposal(paths, i, "project", { ...config, helpers: window === "during installation", models: { ...config.models, concurrency: 7 } });
      assert.deepEqual(p.conflicts, []);
      const retarget = () => { unlinkSync(link); symlinkSync(b, link, "dir"); };
      if (window === "before execution") retarget();
      let calls = 0;
      const result = await applyProposal(paths, p, { approved: true, run: async (command, args, options) => {
        calls++; assert.equal(command, "bun"); assert.deepEqual(args, ["install", "--frozen-lockfile"]);
        f.write(join(options.cwd, "node_modules/commander/package.json"), { version: "1.0.0" });
        retarget();
        return { code: 0, stdout: "fixture helper installed in approved package", stderr: "" };
      } });
      assert.deepEqual(readdirSync(b).map(file => [file, readFileSync(join(b, file), "utf8")]), before, "retarget destination including sentinel journal must remain byte-identical");
      assert.equal(calls, window === "during installation" ? 1 : 0);
      if (window === "stable") {
        assert.equal(result.error, undefined);
        assert.equal(loadConfig(paths).config.models.concurrency, 7);
      } else {
        assert.match(result.error!, /destination.*changed/i);
        assert.equal(result.changed, window === "during installation");
        assert.equal(readFileSync(join(a, "pistack.json"), "utf8"), JSON.stringify(config, null, 2));
        if (window === "during installation") {
          assert.deepEqual(result.completed, ["retained Bun helpers"]);
          assert.equal(helperStatus(directory).ready, true);
          const journal = JSON.parse(readFileSync(join(a, "pistack-setup.json"), "utf8"));
          assert.equal(journal.steps[0].state, "complete"); assert.equal(journal.configState, "pending");
        }
      }
      assert.ok(formatProposal(p).includes(realpathSync(a)), "approval displays physical destination");
    } finally { f.cleanup(); }
  });
}

test("setup resolves a missing config parent through a stable symlinked project ancestor", async () => {
  const f = fixture(); try {
    installCore(f);
    const link = join(f.root, "linked-project"); symlinkSync(f.paths.cwd, link, "dir");
    const paths = { ...f.paths, cwd: link };
    const i = await inspectSetup(paths), p = buildProposal(paths, i, "project", i.config);
    assert.equal(existsSync(join(link, ".pi")), false);
    assert.equal(p.destination.physicalParent, join(realpathSync(f.paths.cwd), ".pi"));
    const result = await applyProposal(paths, p, { approved: true });
    assert.equal(result.error, undefined);
    assert.equal(realpathSync(configPath(paths, "project")), join(realpathSync(f.paths.cwd), ".pi/pistack.json"));
  } finally { f.cleanup(); }
});

test("helper readiness requires successful dependency presence and exact current lock fingerprint", () => {
  const f = fixture(); try {
    const dir = join(f.root, "helper-fixture");
    f.write(join(dir, "package.json"), { dependencies: { commander: "1.0.0" } }); f.write(join(dir, "bun.lock"), "lock-v1");
    assert.equal(helperStatus(dir).ready, false); assert.throws(() => markHelpersReady(dir, helperStatus(dir).fingerprint), /without commander/);
    f.write(join(dir, "node_modules/commander/package.json"), { version: "1.0.0" }); markHelpersReady(dir, helperStatus(dir).fingerprint);
    assert.equal(helperStatus(dir).ready, true);
    f.write(join(dir, "bun.lock"), "lock-v2"); assert.equal(helperStatus(dir).ready, false);
  } finally { f.cleanup(); }
});
test("source identities normalize scoped npm and Git protocols without conflating repositories", () => {
  assert.equal(sourceIdentity("npm:@scope/pkg@1.2.3", "/tmp"), "npm:@scope/pkg");
  for (const source of ["git:github.com/nicobailon/pi-subagents@v1", "git:git@github.com:nicobailon/pi-subagents.git@v1", "https://github.com/nicobailon/pi-subagents.git", "ssh://git@github.com/nicobailon/pi-subagents@v1"]) assert.equal(sourceIdentity(source, "/tmp"), "git:github.com/nicobailon/pi-subagents");
});
test("cancellable command adapter terminates its owned process without dependency installation", async () => {
  const f = fixture(); try {
    const result = await runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...f.paths, signal: AbortSignal.timeout(80) });
    assert.notEqual(result.code, 0); assert.match(result.stderr, /Cancelled/);
  } finally { f.cleanup(); }
});

function ownedHelperFixture(f: ReturnType<typeof fixture>) {
  const root = join(f.root, "owned-pistack");
  const directory = join(root, "pstack/skills/poteto-mode/scripts");
  f.write(join(root, "package.json"), { name: "pistack" });
  f.write(join(directory, "package.json"), { dependencies: { commander: "1.0.0" } });
  f.write(join(directory, "bun.lock"), "lock-A");
  return directory;
}
for (const window of ["before execution", "during installation"]) for (const file of ["package.json", "bun.lock"]) {
  test(`helper ${file} changed ${window} refuses stale approval/readiness`, async () => {
    const f = fixture(); try {
      installCore(f); const directory = ownedHelperFixture(f);
      const paths = { ...f.paths, helpersDirectory: directory };
      const i = await inspectSetup(paths); const p = buildProposal(paths, i, "user", { ...i.config, helpers: true });
      assert.deepEqual(p.conflicts, []); assert.equal(p.steps.length, 1);
      const mutate = () => f.write(join(directory, file), file === "package.json" ? { dependencies: { commander: "2.0.0" } } : "lock-B");
      if (window === "before execution") mutate();
      let calls = 0;
      const result = await applyProposal(paths, p, { approved: true, run: async (command, args, options) => {
        calls++; assert.equal(command, "bun"); assert.deepEqual(args, ["install", "--frozen-lockfile"]);
        assert.equal(options.cwd, realpathSync(directory));
        f.write(join(directory, "node_modules/commander/package.json"), { version: "1.0.0" });
        if (window === "during installation") mutate();
        return { code: 0, stdout: "fixture installed snapshot A", stderr: "" };
      } });
      assert.match(result.error!, /helper.*changed/i);
      assert.equal(calls, window === "before execution" ? 0 : 1);
      assert.equal(result.changed, window !== "before execution");
      assert.equal(helperStatus(directory).ready, false);
      assert.equal(existsSync(join(directory, "node_modules/.poteto-mode-tools-install-key")), false);
      assert.equal(existsSync(configPath(paths, "user")), false);
    } finally { f.cleanup(); }
  });
}

for (const window of ["before execution", "during installation"]) {
  test(`helper canonical destination changed ${window} is not authorized by identical package bytes`, async () => {
    const f = fixture(); try {
      installCore(f); const directory = ownedHelperFixture(f);
      const replacement = join(f.root, "replacement");
      for (const file of ["package.json", "bun.lock"]) f.write(join(replacement, file), readFileSync(join(directory, file), "utf8"));
      const paths = { ...f.paths, helpersDirectory: directory };
      const i = await inspectSetup(paths); const p = buildProposal(paths, i, "user", { ...i.config, helpers: true });
      const retarget = () => { renameSync(directory, `${directory}-original`); symlinkSync(replacement, directory, "dir"); };
      if (window === "before execution") retarget();
      let calls = 0;
      const result = await applyProposal(paths, p, { approved: true, run: async () => {
        calls++; f.write(join(directory, "node_modules/commander/package.json"), { version: "1.0.0" });
        retarget();
        return { code: 0, stdout: "fixture installed original directory", stderr: "" };
      } });
      assert.match(result.error!, /helper destination.*changed/i);
      assert.equal(calls, window === "before execution" ? 0 : 1);
      assert.equal(existsSync(join(replacement, "node_modules")), false);
      assert.equal(existsSync(join(`${directory}-original`, "node_modules/.poteto-mode-tools-install-key")), false);
      assert.equal(existsSync(configPath(paths, "user")), false);
    } finally { f.cleanup(); }
  });
}

test("unchanged owned helper snapshot records only its approved fingerprint after fixture success", async () => {
  const f = fixture(); try {
    installCore(f); const directory = ownedHelperFixture(f);
    const paths = { ...f.paths, helpersDirectory: directory };
    const i = await inspectSetup(paths); const p = buildProposal(paths, i, "user", { ...i.config, helpers: true });
    const step = p.steps[0]; assert.equal(step.kind, "helpers");
    if (step.kind !== "helpers") assert.fail("expected helper step");
    const fingerprint = helperStatus(directory).fingerprint;
    assert.equal(step.fingerprint, fingerprint); assert.equal(step.cwd, realpathSync(directory));
    assert.ok(formatProposal(p).includes(fingerprint));
    const result = await applyProposal(paths, p, { approved: true, run: async (_command, _args, options) => {
      assert.equal(options.cwd, step.cwd);
      f.write(join(options.cwd, "node_modules/commander/package.json"), { version: "1.0.0" });
      return { code: 0, stdout: "fixture installed unchanged snapshot", stderr: "" };
    } });
    assert.equal(result.error, undefined); assert.equal(helperStatus(directory).ready, true);
    assert.equal(readFileSync(join(directory, "node_modules/.poteto-mode-tools-install-key"), "utf8"), `${fingerprint}\n`);
    assert.equal(loadConfig(paths).config.helpers, true);
  } finally { f.cleanup(); }
});

test("helper setup failure cannot mark ready or save config; unwritable fingerprint destination is actionable", async () => {
  const f = fixture(); try {
    installCore(f);
    const directory = join(f.root, "owned-package/pstack/skills/poteto-mode/scripts");
    f.write(join(f.root, "owned-package/package.json"), { name: "pistack" });
    f.write(join(directory, "package.json"), { dependencies: { commander: "14.0.0" } }); f.write(join(directory, "bun.lock"), "fixture lock");
    const paths = { ...f.paths, helpersDirectory: directory };
    const i = await inspectSetup(paths);
    const config = { ...i.config, helpers: true };
    const p = buildProposal(paths, i, "user", config);
    assert.equal(p.steps.length, 1); assert.equal(p.steps[0].kind, "helpers");
    assert.notEqual(p.steps[0].cwd, f.paths.cwd);
    assert.deepEqual(p.steps[0].args, ["install", "--frozen-lockfile"]);
    const failed = await applyProposal(paths, p, { approved: true, run: async () => ({ code: 1, stdout: "", stderr: "fixture permission denied" }) });
    assert.match(failed.error!, /permission denied/); assert.equal(existsSync(configPath(paths, "user")), false);
    assert.equal(helperStatus(directory).ready, false);
    const dir = join(f.root, "read-only-helper");
    f.write(join(dir, "package.json"), {}); f.write(join(dir, "bun.lock"), "lock"); f.write(join(dir, "node_modules/commander/package.json"), {});
    chmodSync(join(dir, "node_modules"), 0o555);
    try { assert.throws(() => markHelpersReady(dir, helperStatus(dir).fingerprint), /EACCES|EPERM/); }
    finally { chmodSync(join(dir, "node_modules"), 0o755); }
    assert.equal(helperStatus(dir).ready, false);
  } finally { f.cleanup(); }
});
test("cancellation after package-manager side effects reports partial changes and retry re-inspects them", async () => {
  const f = fixture(); try {
    const i = await inspectSetup(f.paths); const p = buildProposal(f.paths, i, "user", i.config);
    const controller = new AbortController();
    const failed = await applyProposal(f.paths, p, { approved: true, signal: controller.signal, run: async (_command, args) => {
      const d = core[0]; f.pkg(join(f.paths.agentDir, "npm/node_modules", d.name), d.name, d.version);
      f.settings("user", { packages: [args[1]] }); controller.abort();
      return { code: 0, stdout: "side effects completed before cancellation", stderr: "cancelled fixture" };
    } });
    assert.ok(failed.error); assert.equal(failed.changed, true); assert.equal(existsSync(configPath(f.paths, "user")), false);
    const next = await inspectSetup(f.paths); const retry = buildProposal(f.paths, next, "user", next.config);
    assert.equal(retry.steps.length, 2); assert.equal(retry.reuse.length, 1);
  } finally { f.cleanup(); }
});
test("prerequisites inspect exact candidate versions without installing CLI/browser/auth providers", async () => {
  const f = fixture(); try {
    const config = (await inspectSetup(f.paths)).config; config.helpers = true; config.optional = ["pi-agent-browser-native"];
    const commands: string[] = [];
    const result = await inspectPrerequisites(f.paths, config, async (command, args) => {
      commands.push(`${command} ${args.join(" ")}`);
      return { code: command === "gh" ? 1 : 0, stdout: command === "node" ? "v22.18.0" : command === "pi" ? dependencyManifest.piVersion : command === "agent-browser" ? "agent-browser 0.34.0" : "fixture version", stderr: "" };
    });
    assert.equal(result.find(p => p.name.startsWith("Node"))!.ready, false);
    assert.equal(result.find(p => p.name.startsWith("Pi"))!.ready, true);
    assert.equal(result.find(p => p.name.startsWith("agent-browser"))!.ready, false);
    assert.ok(commands.every(c => !/install|update|login/.test(c)));
  } finally { f.cleanup(); }
});
test("already-configured missing exact npm pin is proposed only in its selected scope, never silently enabled", async () => {
  const f = fixture(); try {
    const source = `npm:${core[0].name}@${core[0].version}`;
    f.settings("user", { packages: [source] });
    let i = await inspectSetup(f.paths); let p = buildProposal(f.paths, i, "user", i.config);
    assert.deepEqual(p.conflicts, []); assert.equal(p.steps[0].args[1], source);
    assert.match(buildProposal(f.paths, i, "project", i.config).conflicts.join("\n"), /refusing to replace/);
    f.settings("user", { packages: [{ source, extensions: [] }] });
    i = await inspectSetup(f.paths); p = buildProposal(f.paths, i, "user", i.config);
    assert.ok(p.conflicts.length); assert.ok(!p.steps.some(s => s.name === core[0].name));
  } finally { f.cleanup(); }
});
test("project-scoped approved fixture installs preserve global settings and project-only unrelated keys", async () => {
  const f = fixture(); try {
    f.settings("user", { theme: "global-unchanged", modelPreference: { keep: true } });
    f.settings("project", { projectOnly: ["keep"] });
    const globalBefore = readFileSync(join(f.paths.agentDir, "settings.json"), "utf8");
    const i = await inspectSetup(f.paths); const p = buildProposal(f.paths, i, "project", i.config);
    const result = await applyProposal(f.paths, p, { approved: true, run: async (_command, args, options) => {
      assert.ok(args.includes("-l")); assert.equal(options.cwd, f.paths.cwd);
      const d = core.find(d => args[1] === `npm:${d.name}@${d.version}`)!;
      f.pkg(join(f.paths.cwd, ".pi/npm/node_modules", d.name), d.name, d.version);
      const settings = JSON.parse(readFileSync(join(f.paths.cwd, ".pi/settings.json"), "utf8"));
      settings.packages = [...(settings.packages ?? []), args[1]]; f.settings("project", settings);
      return { code: 0, stdout: "fixture installed", stderr: "" };
    } });
    assert.equal(result.error, undefined); assert.equal(result.completed.length, 3);
    assert.equal(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8"), globalBefore);
    assert.deepEqual(JSON.parse(readFileSync(join(f.paths.cwd, ".pi/settings.json"), "utf8")).projectOnly, ["keep"]);
    assert.equal(loadConfig(f.paths).path, configPath(f.paths, "project"));
  } finally { f.cleanup(); }
});
test("partial filters cannot masquerade as a ready dependency when its required live tool is missing", async () => {
  const f = fixture(); try {
    const d = core[0]; const local = f.pkg(join(f.root, "partial"), d.name, d.version, ["./index.ts", "./auxiliary.ts"]);
    f.write(join(local, "auxiliary.ts"), "export default function() {}\n");
    f.settings("user", { packages: [{ source: local, extensions: ["-index.ts"] }] });
    const i = await inspectSetup(f.paths);
    assert.ok(i.rows[0].extensions.some(e => e.enabled)); assert.ok(i.rows[0].extensions.some(e => !e.enabled));
    assert.match(buildProposal(f.paths, i, "user", i.config).conflicts.join("\n"), /partially filtered/);
  } finally { f.cleanup(); }
});

for (const version of ["0.85.1", "1.1.1", "unknown"]) test(`prerequisites reject noncandidate Pi ${version} without changing the exact gate`, async () => {
  const f = fixture(); try {
    const config = (await inspectSetup(f.paths)).config;
    const result = await inspectPrerequisites(f.paths, config, async command => ({ code: 0, stdout: command === "pi" ? version : "fixture", stderr: "" }));
    const host = result.find(item => item.name.startsWith("Pi candidate"));
    assert.deepEqual(host, { name: `Pi candidate ${dependencyManifest.piVersion}`, ready: false, requiredForInstall: true, detail: version });
    assert.equal(existsSync(configPath(f.paths, "user")), false);
  } finally { f.cleanup(); }
});
