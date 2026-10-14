import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager, VERSION } from "@earendil-works/pi-coding-agent";
import { applyProposal, buildProposal, configPath, dependencyManifest, inspectSetup, jsonFile } from "../pi/lib/setup.ts";
import { fixture } from "./fixtures.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi/agent"), "npm/node_modules");
const subagentsRoot = process.env.PISTACK_TEST_SUBAGENTS_ROOT ?? join(packages, "pi-subagents");
const core = dependencyManifest.extensions.filter(dep => dep.required).map(dep => ({
  ...dep,
  path: dep.name === "pi-subagents" ? subagentsRoot : join(dirname(subagentsRoot), dep.name),
}));

test("current candidate public manifests load all core extensions and reuse existing packages without installs", async () => {
  assert.equal(VERSION, dependencyManifest.piVersion, "Installed host must match the candidate; tests never install it");
  const f = fixture();
  try {
    for (const dep of core) {
      assert.ok(existsSync(join(dep.path, "package.json")), `Existing ${dep.name} required beside PISTACK_TEST_SUBAGENTS_ROOT`);
      const manifest = jsonFile(join(dep.path, "package.json"));
      assert.equal(manifest.name, dep.name); assert.equal(manifest.version, dep.version);
      assert.ok(Array.isArray(manifest.pi?.extensions) && manifest.pi.extensions.length > 0);
      assert.ok(manifest.pi.extensions.every((entry: unknown) => typeof entry === "string" && entry.trim()));
    }
    f.settings("user", { packages: [root, ...core.map(dep => dep.path)], fixtureUnrelated: { keep: true } });
    const settingsPath = join(f.paths.agentDir, "settings.json");
    const before = readFileSync(settingsPath, "utf8");
    const inspection = await inspectSetup(f.paths);
    const proposal = buildProposal(f.paths, inspection, "user", inspection.config);
    assert.deepEqual(proposal.conflicts, []);
    assert.deepEqual(proposal.steps, []);
    assert.equal(proposal.reuse.length, 3);
    const run = async () => { throw new Error("Existing core candidates must never install"); };
    assert.equal((await applyProposal(f.paths, proposal, { approved: false, run })).changed, false);
    assert.equal(existsSync(configPath(f.paths, "user")), false);
    const controller = new AbortController(); controller.abort();
    assert.equal((await applyProposal(f.paths, proposal, { approved: true, signal: controller.signal, run })).changed, false);
    assert.equal(existsSync(configPath(f.paths, "user")), false);
    const saved = await applyProposal(f.paths, proposal, { approved: true, run });
    assert.equal(saved.error, undefined); assert.equal(saved.changed, true);
    const next = await inspectSetup(f.paths);
    const rerun = await applyProposal(f.paths, buildProposal(f.paths, next, "user", next.config), { approved: true, run });
    assert.equal(rerun.error, undefined); assert.equal(rerun.changed, false);
    assert.equal(readFileSync(settingsPath, "utf8"), before);

    const loader = new DefaultResourceLoader({ ...f.paths, settingsManager: SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true }) });
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 4);
    for (const name of ["pistack_models", "interactive_shell", "create_goal"]) {
      assert.equal(loaded.extensions.filter(extension => extension.tools.has(name)).length, 1, `${name} must register exactly once through Pi's public loader`);
    }
    assert.equal(loaded.extensions.filter(extension => extension.commands.has("pistack")).length, 1);
    assert.ok(loader.getSkills().skills.some(skill => skill.name === "poteto-mode"));
    assert.equal(readFileSync(settingsPath, "utf8"), before);
  } finally { f.cleanup(); }
});

test("public loader follows a compiled manifest entry instead of conventional index files", async () => {
  const f = fixture(); try {
    const packageRoot = f.pkg(join(f.root, "compiled-package"), "manifest-fixture", "1.0.0", ["./dist/entry.mjs"]);
    f.write(join(packageRoot, "dist/entry.mjs"), 'export default function(pi) { pi.registerCommand("manifest-probe", { description: "Manifest entry fixture", handler: async () => {} }); }');
    f.settings("user", { packages: [packageRoot] });
    const loader = new DefaultResourceLoader({ ...f.paths, settingsManager: SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true }) });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const extensions = loader.getExtensions().extensions;
    assert.deepEqual(extensions.map(extension => extension.path), [join(packageRoot, "dist/entry.mjs")]);
    assert.equal(extensions[0].commands.get("manifest-probe")?.description, "Manifest entry fixture");
  } finally { f.cleanup(); }
});
