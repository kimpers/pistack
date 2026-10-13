import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type AgentSession } from "@earendil-works/pi-coding-agent";
import { fixture } from "./fixtures.ts";
import { jsonFile } from "../pi/lib/setup.ts";
import { filesUnder } from "./upstream-sync-support.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const subagentsRoot = process.env.PISTACK_TEST_SUBAGENTS_ROOT ?? join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi/agent"), "npm/node_modules/pi-subagents");

test("installed pi-subagents public list discovers package agents with explicit tools/skills and honors user/project authority", { skip: process.env.PI_SUBAGENT_CHILD === "1" ? "Parent validation required: child capability boundary is preserved" : false }, async () => {
  assert.ok(existsSync(join(subagentsRoot, "package.json")), "Existing pi-subagents required; set PISTACK_TEST_SUBAGENTS_ROOT (never installed by tests)");
  const manifest = jsonFile(join(subagentsRoot, "package.json"));
  assert.equal(manifest.name, "pi-subagents");
  assert.ok(Array.isArray(manifest.pi?.extensions) && manifest.pi.extensions.length > 0);
  assert.ok(manifest.pi.extensions.every((entry: unknown) => typeof entry === "string" && entry.trim()), "Pi resolves public manifest entries, not a guessed index filename");
  const f = fixture(); let session: AgentSession | undefined;
  try {
    f.settings("user", { packages: [root, subagentsRoot], subagents: { disableBuiltins: true } });
    const settingsManager = SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true });
    const resourceLoader = new DefaultResourceLoader({ ...f.paths, settingsManager });
    await resourceLoader.reload(); assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
    ({ session } = await createAgentSession({ ...f.paths, settingsManager, resourceLoader, modelRuntime, sessionManager: SessionManager.inMemory(f.paths.cwd) }));
    await session.bindExtensions({});
    async function execute(name: string, params: unknown) {
      const runner = session?.extensionRunner; assert.ok(runner);
      const tool = runner.getToolDefinition(name); assert.ok(tool);
      const signal = new AbortController().signal;
      return tool.execute(`fixture-${name}`, params, signal, undefined, runner.createToolContext(`fixture-${name}`, signal));
    }
    async function list() {
      assert.ok(session);
      if (!session.getActiveToolNames().includes("subagent")) {
        await execute("subagents_enable", {});
        assert.ok(session.getActiveToolNames().includes("subagent"));
      }
      return execute("subagent", { action: "list", capabilities: true, agentScope: "both" });
    }
    let result = await list();
    const serialized = JSON.stringify(result);
    assert.match(serialized, /pistack\.poteto-agent/); assert.match(serialized, /pistack\.comment-sicko/); assert.match(serialized, /pistack\.analyst/); assert.match(serialized, /pistack-foundation/);
    for (const name of ["typescript-best-practices", "poteto-mode", "no-comments", "interrogate", "reflect"]) assert.ok(serialized.includes(name), `Selected child skill ${name}`);
    assert.match(serialized, /Package agents/);
    const workflow = join(f.paths.cwd, "review.js");
    f.write(workflow, 'const results = await runs.all([{key:"review", agent:"pistack.analyst", task:"Read only"}]); return results.map(result => result.output);');
    const beforeValidation = filesUnder(f.root).sort();
    const validate = () => execute("subagent", { action: "validate", workflow });
    const valid = await validate();
    assert.equal(valid.content.length, 1);
    const content = valid.content[0]; assert.ok(content.type === "text");
    assert.deepEqual(JSON.parse(content.text), { ok: true, errors: [] });
    f.write(workflow, 'const results = await runs.all([{key:"review", agent:"pistack.analyst", task:"Read only"}]); return results.review.output;');
    await assert.rejects(validate, error => {
      assert.ok(error instanceof Error);
      assert.deepEqual(JSON.parse(error.message), {
        ok: false,
        errors: [{ message: "runs.all returns an ordered array; 'results.review' is keyed access. Use an index, destructuring, or map(...).", line: 1, column: 101 }],
      });
      return true;
    });
    assert.deepEqual(filesUnder(f.root).sort(), beforeValidation, "validation must not create child run artifacts");
    f.write(join(f.paths.agentDir, "agents/poteto.md"), "---\nname: poteto-agent\npackage: pistack\ndescription: USER AUTHORITY\ntools: read\n---\nRead only.\n");
    await session.reload(); result = await list(); assert.match(JSON.stringify(result), /USER AUTHORITY/);
    f.write(join(f.paths.cwd, ".pi/agents/poteto.md"), "---\nname: poteto-agent\npackage: pistack\ndescription: PROJECT AUTHORITY\ntools: read, ls\n---\nRead only.\n");
    await session.reload(); result = await list(); assert.match(JSON.stringify(result), /PROJECT AUTHORITY/); assert.doesNotMatch(JSON.stringify(result), /USER AUTHORITY/);
    f.settings("project", { subagents: { agentOverrides: { "pistack.poteto-agent": { disabled: true } } } });
    await session.reload(); result = await list(); assert.doesNotMatch(JSON.stringify(result), /pistack\.poteto-agent/);
    assert.equal(existsSync(join(f.paths.agentDir, "agents/comment-sicko.md")), false, "Package agents were not copied into user configuration");
  } finally { if (session) { await session.extensionRunner?.emit({ type: "session_shutdown", reason: "quit" }); session.dispose(); } f.cleanup(); }
});
