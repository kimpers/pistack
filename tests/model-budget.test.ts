import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { ModelRuntime, ModelRegistry, resolveCliModel } from "@earendil-works/pi-coding-agent";
import { defaultModels, proposeBudget, resolveRole, supportedThinking, type ModelSupport } from "../pi/lib/models.ts";
import { fixture } from "./fixtures.ts";

// Public models.md custom-provider examples, loaded by the real SDK. No provider/network claims.
export const sparseModel = { provider: "budget-fixture", id: "owner/sparse", reasoning: true, thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", xhigh: null, max: "max" } } satisfies ModelSupport;
const id = `${sparseModel.provider}/${sparseModel.id}`;
test("budget targets respect sparse/null support and disclose only same-ID downgrades", () => {
  const config = defaultModels(); config.roles["bug-fix"] = [id];
  const proposal = proposeBudget(config, "large", [sparseModel]);
  assert.deepEqual(proposal.errors, []);
  assert.match(proposal.changes.join("\n"), /target xhigh, proposed high.*same-model/);
  assert.equal(config.budget, undefined, "proposal cannot mutate saved policy");
  assert.deepEqual(proposal.config.roles, config.roles);
  const run = resolveRole(proposal.config, "bug-fix", [id], sparseModel, [sparseModel]).runs[0];
  assert.equal(run.model, id); assert.equal(run.selector, `${id}:high`);
  assert.equal(proposeBudget(config, "small", [sparseModel]).errors.length, 1);
  assert.equal(proposeBudget(config, "medium", []).errors.length, 1);
  assert.equal(proposeBudget(config, "small", [{ ...sparseModel, reasoning: false }]).errors.length, 1);
  assert.throws(() => resolveRole(proposal.config, "bug-fix", [id], sparseModel, [{ ...sparseModel, thinkingLevelMap: { high: null } }]), /Unsupported/);
  assert.throws(() => resolveRole({ ...config, budget: "small" }, "bug-fix", [id], sparseModel, [sparseModel]), /Missing approved/);
});
test("unlimited and inherited aliases preserve configured/native effort without forcing max", () => {
  const config = defaultModels(); config.roles["bug-fix"] = [id]; config.thinking = { [id]: "high" };
  const unlimited = proposeBudget(config, "unlimited", [sparseModel]).config;
  assert.deepEqual(unlimited.thinking, config.thinking);
  assert.equal(resolveRole(unlimited, "bug-fix", [id], sparseModel, [sparseModel]).runs[0].selector, `${id}:high`);
  const inherited = proposeBudget(defaultModels(), "small", []).config;
  assert.equal(resolveRole(inherited, "bug-fix", [id], sparseModel).runs[0].selector, id);
  assert.equal(resolveRole(defaultModels(), "bug-fix", [id], sparseModel).runs[0].thinking, undefined);
  const plain = { ...config, thinking: undefined };
  assert.equal(resolveRole(proposeBudget(plain, "unlimited", []).config, "bug-fix", [id], sparseModel).runs[0].selector, id);
});
test("public SDK custom-model registry agrees on reasoning support and consumes exact selector suffixes", async () => {
  const f = fixture(); try {
    const models = [sparseModel, { id: "plain", reasoning: false }, { id: "defaults", reasoning: true }, { id: "extended", reasoning: true, thinkingLevelMap: { xhigh: "xhigh", off: null } }];
    f.write(join(f.paths.agentDir, "models.json"), { providers: { "budget-fixture": { baseUrl: "http://127.0.0.1:1", api: "openai-completions", apiKey: "fixture-only", models } } });
    const runtime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: join(f.paths.agentDir, "models.json"), modelsStorePath: join(f.root, "catalog.json"), allowModelNetwork: false, refreshOnCreate: false });
    await runtime.getAvailable();
    const registry = new ModelRegistry(runtime);
    for (const input of models) {
      const model = registry.find("budget-fixture", input.id)!;
      assert.ok(model); assert.deepEqual(supportedThinking(model), getSupportedThinkingLevels(model));
    }
    const config = defaultModels(); config.roles["bug-fix"] = [id];
    const approved = proposeBudget(config, "large", registry.getAvailable()).config;
    const selector = resolveRole(approved, "bug-fix", [id], sparseModel, registry.getAvailable()).runs[0].selector;
    const resolved = resolveCliModel({ cliModel: selector, modelRuntime: runtime });
    assert.equal(resolved.error, undefined); assert.equal(resolved.model?.id, sparseModel.id); assert.equal(resolved.thinkingLevel, "high");
    for (const [budget, level] of [["large", "xhigh"], ["medium", "high"], ["small", "medium"]] as const) {
      config.roles["bug-fix"] = ["budget-fixture/extended"];
      assert.equal(proposeBudget(config, budget, registry.getAvailable()).config.thinking?.["budget-fixture/extended"], level);
    }
  } finally { f.cleanup(); }
});
