import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ModelRuntime, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { availableModelIds, defaultModels, parseModels, resolveRole, validateAvailable } from "../pi/lib/models.ts";
import { fixture } from "./fixtures.ts";

test("defaults explicitly inherit; panels preserve upstream cardinality independent from concurrency", () => {
  const config = defaultModels();
  assert.equal(config.roles["arena runners"].length, 3);
  config.roles["arena runners"] = Array(4).fill("inherit");
  const parent = { provider: "custom", id: "owner/model" };
  const panel = resolveRole(config, "arena runners", ["custom/owner/model"], parent);
  assert.equal(panel.models.length, 4); assert.equal(panel.distinctModels, 1); assert.match(panel.diversity, /not multi-model/);
  config.concurrency = 1; assert.equal(resolveRole(config, "arena runners", ["custom/owner/model"], parent).models.length, 4);
  assert.throws(() => resolveRole(config, "arena runners", [], parent), /Unavailable/);
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
