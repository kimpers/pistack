import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ModelRuntime, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { availableModelIds, defaultModels, parseModels, resolveRole, retireModelRoles, validateAvailable, type Role } from "../pi/lib/models.ts";
import { loadConfig } from "../pi/lib/setup.ts";
import { fixture } from "./fixtures.ts";

const panelRoles = ["arena runners", "arena cross-judge pool", "architect runners", "interrogate reviewers"] as const satisfies readonly Role[];

for (const role of panelRoles) test(`new ${role} resolves two inherited seats without setting effort`, () => {
  const config = parseModels(defaultModels());
  const panel = resolveRole(config, role, ["custom/owner/model"], { provider: "custom", id: "owner/model" });
  assert.deepEqual(panel.models, ["custom/owner/model", "custom/owner/model"]);
  assert.deepEqual(panel.runs, [
    { model: "custom/owner/model", selector: "custom/owner/model", policy: "inherit native parent/agent effort" },
    { model: "custom/owner/model", selector: "custom/owner/model", policy: "inherit native parent/agent effort" },
  ]);
  assert.equal(panel.concurrency, 4);
  assert.equal(panel.budget, "unlimited");
  assert.equal(panel.distinctModels, 1);
  assert.match(panel.diversity, /not multi-model diversity/);
});

test("single-seat roles still resolve one inherited model", () => {
  for (const role of ["feature, refactoring", "bug-fix", "perf-issue", "hillclimb", "judgment and prose", "hardest tasks", "how explorer", "how explainer", "why investigators", "why synthesizer", "reflect tooling", "reflect judgment, divergent, synthesizer", "swarm workers"] as const) {
    const panel = resolveRole(parseModels(defaultModels()), role, ["custom/owner/model"], { provider: "custom", id: "owner/model" });
    assert.deepEqual(panel.models, ["custom/owner/model"]);
    assert.equal(panel.concurrency, 4);
  }
});

test("panels preserve saved cardinality independent from concurrency", () => {
  const config = defaultModels();
  config.roles["arena runners"] = Array(4).fill("inherit");
  const parent = { provider: "custom", id: "owner/model" };
  const panel = resolveRole(config, "arena runners", ["custom/owner/model"], parent);
  assert.equal(panel.models.length, 4); assert.equal(panel.distinctModels, 1); assert.match(panel.diversity, /not multi-model/);
  config.concurrency = 1; assert.equal(resolveRole(config, "arena runners", ["custom/owner/model"], parent).models.length, 4);
  assert.throws(() => resolveRole(config, "arena runners", [], parent), /Unavailable/);
});
test("loading without a saved profile uses two seats without writing a profile", () => {
  const f = fixture(); try {
    const loaded = loadConfig(f.paths);
    assert.deepEqual(loaded.config.models.roles["arena runners"], ["inherit", "inherit"]);
    assert.equal(existsSync(loaded.path), false);
  } finally { f.cleanup(); }
});

for (const count of [1, 3, 5, 32]) test(`loading saved ${count}-seat panels preserves entries, effort, concurrency and file bytes`, () => {
  const f = fixture(); try {
    const config = defaultModels();
    const entries = Array.from({ length: count }, (_, i) => i % 2 ? "inherit" : "saved/owner/model");
    for (const role of panelRoles) config.roles[role] = [...entries];
    config.roles["how critics"] = ["saved/retired"];
    config.concurrency = 1;
    config.budget = "medium";
    config.thinking = { "saved/owner/model": "high" };
    const path = join(f.paths.agentDir, "pistack.json");
    f.write(path, { version: 1, models: config, optional: [], helpers: false });
    const before = readFileSync(path, "utf8");
    const loaded = loadConfig(f.paths).config.models;
    assert.deepEqual(loaded, config);
    for (const role of panelRoles) {
      const panel = resolveRole(loaded, role, ["saved/owner/model", "parent/current"], { provider: "parent", id: "current" }, [{ provider: "saved", id: "owner/model", reasoning: true }]);
      assert.deepEqual(panel.models, entries.map(entry => entry === "inherit" ? "parent/current" : "saved/owner/model"));
      assert.deepEqual(panel.runs.map(run => run.selector), entries.map(entry => entry === "inherit" ? "parent/current" : "saved/owner/model:high"));
      assert.equal(panel.concurrency, 1);
      assert.equal(panel.budget, "medium");
    }
    const retired = retireModelRoles(loaded);
    assert.equal(Object.hasOwn(retired.roles, "how critics"), false);
    assert.deepEqual(loaded.roles["how critics"], ["saved/retired"]);
    for (const role of panelRoles) assert.deepEqual(retired.roles[role], entries);
    assert.equal(readFileSync(path, "utf8"), before);
  } finally { f.cleanup(); }
});

test("available model discovery respects session scopes and rejects unavailable configured IDs", () => {
  const a = { provider: "a", id: "model/one" }, b = { provider: "b", id: "two" };
  assert.deepEqual(availableModelIds([b, a, a], [{ model: a }]), ["a/model/one"]);
  const config = defaultModels(); config.roles["bug-fix"] = ["missing/nope"];
  assert.ok(validateAvailable(config, ["a/model/one"], a).includes("bug-fix: unavailable model missing/nope"));
  assert.ok(validateAvailable(defaultModels(), [], undefined).length > 0);
  assert.throws(() => parseModels({ ...config, concurrency: 0 }));
  assert.throws(() => parseModels({ ...config, roles: { ...config.roles, "how critics": [] } }));
});
test("real Pi ModelRegistry discovers an isolated custom provider catalog without network/auth requests", async () => {
  const f = fixture(); try {
    f.write(join(f.paths.agentDir, "models.json"), { providers: { "pistack-test": { baseUrl: "http://127.0.0.1:1", api: "openai-completions", apiKey: "fixture-not-a-real-key", models: [{ id: "owner/fixture", name: "Fixture", reasoning: false, input: ["text"], contextWindow: 4096, maxTokens: 512, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } });
    const runtime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: join(f.paths.agentDir, "models.json"), modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
    await runtime.getAvailable();
    const registry = new ModelRegistry(runtime);
    assert.ok(availableModelIds(registry.getAvailable()).includes("pistack-test/owner/fixture"));
    assert.equal(registry.find("pistack-test", "owner/fixture")?.id, "owner/fixture");
  } finally { f.cleanup(); }
});

test("legacy how critics profiles remain readable and preserve saved panel choices and unrelated fields", () => {
  const config = defaultModels() as any;
  config.roles["how critics"] = ["saved/retired"];
  config.roles["arena runners"] = ["saved/a", "inherit", "saved/b", "saved/a", "inherit"];
  config.operatorNote = { keep: true };
  const parsed = parseModels(config) as any;
  assert.deepEqual(parsed.roles["arena runners"], config.roles["arena runners"]);
  assert.deepEqual(parsed.operatorNote, { keep: true });
  assert.equal(Object.hasOwn(defaultModels().roles, "how critics"), false);
});
