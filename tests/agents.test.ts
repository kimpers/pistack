import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "./fixtures.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const subagentsRoot = process.env.PISTACK_TEST_SUBAGENTS_ROOT ?? join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi/agent"), "npm/node_modules/pi-subagents");

test("installed pi-subagents public list discovers package agents with explicit tools/skills and honors user/project authority", { skip: process.env.PI_SUBAGENT_CHILD === "1" ? "Parent validation required: child capability boundary is preserved" : false }, async () => {
  assert.ok(existsSync(join(subagentsRoot, "index.ts")), "Existing pi-subagents required; set PISTACK_TEST_SUBAGENTS_ROOT (never installed by tests)");
  const f = fixture(); let session: any;
  try {
    f.settings("user", { packages: [root, subagentsRoot], subagents: { disableBuiltins: true } });
    const settingsManager = SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true });
    const resourceLoader = new DefaultResourceLoader({ ...f.paths, settingsManager });
    await resourceLoader.reload(); assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
    ({ session } = await createAgentSession({ ...f.paths, settingsManager, resourceLoader, modelRuntime, sessionManager: SessionManager.inMemory(f.paths.cwd) }));
    await session.bindExtensions({});
    async function list() {
      const tool = session.extensionRunner.getToolDefinition("subagent"); assert.ok(tool);
      return tool.execute("fixture-list", { action: "list", capabilities: true, agentScope: "both" }, new AbortController().signal, undefined, session.extensionRunner.createContext());
    }
    let result = await list();
    const serialized = JSON.stringify(result);
    assert.match(serialized, /pistack\.poteto-agent/); assert.match(serialized, /pistack\.comment-sicko/); assert.match(serialized, /pistack\.analyst/); assert.match(serialized, /pistack-foundation/);
    for (const name of ["typescript-best-practices", "poteto-mode", "no-comments", "interrogate", "reflect"]) assert.ok(serialized.includes(name), `Selected child skill ${name}`);
    assert.match(serialized, /Package agents/);
    f.write(join(f.paths.agentDir, "agents/poteto.md"), "---\nname: poteto-agent\npackage: pistack\ndescription: USER AUTHORITY\ntools: read\n---\nRead only.\n");
    await session.reload(); result = await list(); assert.match(JSON.stringify(result), /USER AUTHORITY/);
    f.write(join(f.paths.cwd, ".pi/agents/poteto.md"), "---\nname: poteto-agent\npackage: pistack\ndescription: PROJECT AUTHORITY\ntools: read, ls\n---\nRead only.\n");
    await session.reload(); result = await list(); assert.match(JSON.stringify(result), /PROJECT AUTHORITY/); assert.doesNotMatch(JSON.stringify(result), /USER AUTHORITY/);
    f.settings("project", { subagents: { agentOverrides: { "pistack.poteto-agent": { disabled: true } } } });
    await session.reload(); result = await list(); assert.doesNotMatch(JSON.stringify(result), /pistack\.poteto-agent/);
    assert.equal(existsSync(join(f.paths.agentDir, "agents/comment-sicko.md")), false, "Package agents were not copied into user configuration");
  } finally { if (session) { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); session.dispose(); } f.cleanup(); }
});
