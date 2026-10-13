import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SessionManager, createEventBus } from "@earendil-works/pi-coding-agent";
import pistack, { pingSubagents } from "../pi/extensions/pistack.ts";
import { STATE_TYPE, emptyState, restoreState, updateChecklist } from "../pi/lib/session-state.ts";
import { defaultModels } from "../pi/lib/models.ts";
import { dependencyManifest, configPath } from "../pi/lib/setup.ts";
import { existsSync, readFileSync } from "node:fs";
import { fixture } from "./fixtures.ts";

function harness(f: ReturnType<typeof fixture>, manager = SessionManager.create(f.paths.cwd, join(f.root, "sessions"))) {
  const events = new Map<string, Function>(); const tools = new Map<string, any>(); let command: any;
  const messages: string[] = [], prompts: string[] = [];
  const pi: any = { on: (name: string, fn: Function) => events.set(name, fn), events: createEventBus(), registerTool: (tool: any) => tools.set(tool.name, tool), registerCommand: (_name: string, cmd: any) => { command = cmd; }, appendEntry: (type: string, data: unknown) => manager.appendCustomEntry(type, data), sendMessage: (m: any) => messages.push(m.content), sendUserMessage: (text: string) => prompts.push(text), getAllTools: () => [], getActiveTools: () => [] };
  const parent = { provider: "fixture", id: "available" };
  const ctx: any = { cwd: f.paths.cwd, sessionManager: manager, model: parent, modelRegistry: { getAvailable: () => [parent] }, scopedModels: [], isProjectTrusted: () => true, hasUI: true, mode: "rpc", ui: { notify: (text: string) => messages.push(text), setStatus() {}, setWidget() {}, select: async () => undefined, confirm: async () => false, input: async () => undefined } };
  pistack(pi);
  return { events, tools, pi, ctx, messages, prompts, manager, command: (args: string) => command.handler(args, ctx), emit: (name: string, event = {}) => events.get(name)?.(event, ctx) };
}
function seed(manager: SessionManager) {
  manager.appendMessage({ role: "user", content: "fixture session", timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "fixture checkpoint" }], api: "openai-completions", provider: "fixture", model: "available", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() } as any);
}
test("mode new/off, resume/reload, compaction, tree and fork follow real SessionManager ancestry", async () => {
  const f = fixture(); try {
    const h = harness(f); seed(h.manager); await h.emit("session_start", { reason: "new" });
    assert.equal(await h.emit("before_agent_start", { systemPrompt: "BASE" }), undefined);
    await h.command("on"); const onLeaf = h.manager.getLeafId()!;
    const guided = (await h.emit("before_agent_start", { systemPrompt: "BASE" })).systemPrompt;
    assert.match(guided, /BASE[\s\S]*piStack integration/);
    assert.match(guided, /When mode is on, read \[poteto-mode\]/);
    assert.match(guided, /On TypeScript edits explicitly read/);
    assert.match(guided, /A direct `\/skill:<name>` invocation applies only to that task/);
    await h.tools.get("pistack_checklist").execute("id", { action: "start", playbook: "fixture", steps: ["Read principles", "Verify"] }, undefined, undefined, h.ctx);
    await h.tools.get("pistack_checklist").execute("id", { action: "set", id: 2, status: "skipped", reason: "read-only scope" }, undefined, undefined, h.ctx);
    const checklistLeaf = h.manager.getLeafId()!;
    const current = restoreState(h.manager.getBranch()); assert.equal(current.items[1].reason, "read-only scope");
    await h.command("off"); const offLeaf = h.manager.getLeafId()!;
    assert.equal(await h.emit("before_agent_start", { systemPrompt: "BASE" }), undefined);
    h.manager.branch(checklistLeaf); await h.emit("session_tree");
    assert.equal(restoreState(h.manager.getBranch()).enabled, true);
    h.manager.appendCompaction("fixture compacted", onLeaf, 100); await h.emit("session_compact");
    assert.equal(restoreState(h.manager.getBranch()).items.length, 2);
    const reopened = SessionManager.open(h.manager.getSessionFile()!); reopened.branch(checklistLeaf);
    const resume = harness(f, reopened); await resume.emit("session_start", { reason: "resume" });
    assert.match((await resume.emit("before_agent_start", { systemPrompt: "BASE" })).systemPrompt, /read-only scope/);
    await resume.emit("session_start", { reason: "reload" }); assert.equal(restoreState(reopened.getBranch()).enabled, true);
    reopened.branch(offLeaf); await resume.emit("session_tree"); assert.equal(await resume.emit("before_agent_start", { systemPrompt: "BASE" }), undefined);
    reopened.branch(onLeaf); const forkPath = reopened.createBranchedSession(onLeaf)!;
    const fork = harness(f, SessionManager.open(forkPath)); await fork.emit("session_start", { reason: "fork" });
    assert.equal(restoreState(fork.manager.getBranch()).enabled, true); assert.equal(restoreState(fork.manager.getBranch()).items.length, 0);
    fork.manager.newSession(); await fork.emit("session_start", { reason: "new" }); assert.equal(restoreState(fork.manager.getBranch()).enabled, false);
    assert.equal(h.prompts.length, 0, "mode never starts model turns or goals");
  } finally { f.cleanup(); }
});
test("checklist rejects silent skips, malformed snapshots, unknown IDs and canceled mutation", async () => {
  assert.throws(() => updateChecklist(emptyState(), { action: "set", id: 1, status: "done" }), /Unknown/);
  const state = updateChecklist(emptyState(), { action: "add", text: "verify" });
  assert.throws(() => updateChecklist(state, { action: "set", id: 1, status: "skipped" }), /Invalid/);
  assert.throws(() => restoreState([{ type: "custom", customType: STATE_TYPE, data: { version: 100 } }]), /Invalid/);
  const f = fixture(); try {
    const h = harness(f); const c = new AbortController(); c.abort();
    await assert.rejects(h.tools.get("pistack_checklist").execute("x", { action: "add", text: "no" }, c.signal, undefined, h.ctx));
    assert.equal(h.manager.getEntries().length, 0);
  } finally { f.cleanup(); }
});
test("user-callable native setup flow can decline, cancel a picker, or approve an idempotent existing installation", async () => {
  const f = fixture(); try {
    const core = dependencyManifest.extensions.filter(d => d.required);
    for (const d of core) f.pkg(join(f.paths.agentDir, "npm/node_modules", d.name), d.name, d.version);
    f.settings("user", { packages: core.map(d => `npm:${d.name}@${d.version}`), unrelated: 19 });
    const h = harness(f);
    await h.command("setup"); assert.equal(existsSync(configPath(f.paths, "user")), false);
    h.ctx.ui.select = async (_title: string, choices: string[]) => choices[0];
    await h.command("setup"); assert.equal(existsSync(configPath(f.paths, "user")), false); assert.match(h.messages.join("\n"), /declined/);
    h.ctx.ui.confirm = async () => true;
    await h.command("setup"); assert.equal(existsSync(configPath(f.paths, "user")), true);
    assert.equal(JSON.parse(readFileSync(join(f.paths.agentDir, "settings.json"), "utf8")).unrelated, 19);
    assert.match(h.messages.join("\n"), /UNKNOWN/);
  } finally { f.cleanup(); }
});
test("native setup budget dialogs disclose downgrade/retirement, decline safely, and public resolution rejects drift", async () => {
  const f = fixture(); try {
    const core = dependencyManifest.extensions.filter(d => d.required);
    for (const d of core) f.pkg(join(f.paths.agentDir, "npm/node_modules", d.name), d.name, d.version);
    f.settings("user", { packages: core.map(d => `npm:${d.name}@${d.version}`) });
    const models = defaultModels(); models.roles["bug-fix"] = ["fixture/reasoning"];
    models.roles["arena runners"] = Array(4).fill("inherit"); models.roles["how critics"] = ["retired/id"];
    f.write(configPath(f.paths, "user"), { version: 1, models, optional: [], helpers: false });
    const before = readFileSync(configPath(f.paths, "user"), "utf8");
    const h = harness(f); let supported = true, approve = false; const summaries: string[] = [];
    h.ctx.modelRegistry.getAvailable = () => [h.ctx.model, { provider: "fixture", id: "reasoning", reasoning: true, thinkingLevelMap: { xhigh: null, high: supported ? "high" : null } }];
    await h.command("on");
    assert.doesNotMatch((await h.emit("before_agent_start", { systemPrompt: "BASE" })).systemPrompt, /"how critics"/);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    h.ctx.ui.select = async (title: string, choices: string[]) => title.startsWith("Reasoning budget") ? "large" : choices[0];
    h.ctx.ui.confirm = async (_title: string, summary: string) => { summaries.push(summary); return approve; };
    await h.command("setup");
    assert.equal(summaries.length, 1); assert.match(summaries[0], /target xhigh, proposed high/); assert.match(summaries[0], /Remove retired role.*how critics/);
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
    approve = true; await h.command("setup");
    const saved = JSON.parse(readFileSync(configPath(f.paths, "user"), "utf8"));
    assert.equal(saved.models.thinking["fixture/reasoning"], "high"); assert.equal(saved.models.roles["arena runners"].length, 4);
    assert.equal(saved.models.roles["how critics"], undefined);
    const approvedBytes = readFileSync(configPath(f.paths, "user"), "utf8");
    await h.command("setup");
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), approvedBytes, "approved budget rerun is idempotent");
    const tool = h.tools.get("pistack_models"); assert.ok(tool);
    const resolved = await tool.execute("r", { role: "bug-fix" }, undefined, undefined, h.ctx);
    assert.equal(resolved.details.runs[0].selector, "fixture/reasoning:high");
    supported = false;
    await assert.rejects(tool.execute("r", { role: "bug-fix" }, undefined, undefined, h.ctx), /Unsupported/);
    const savedBytes = readFileSync(configPath(f.paths, "user"), "utf8");
    await h.command("doctor"); assert.match(h.messages.join("\n"), /Unsupported/);
    await h.emit("session_start", { reason: "reload" });
    assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), savedBytes);
  } finally { f.cleanup(); }
});

for (const boundary of ["budget cancel", "final cancel", "capability drift", "unsupported model"]) {
  test(`native setup ${boundary} preserves saved policy and never changes parent thinking`, async () => {
    const f = fixture(); try {
      const core = dependencyManifest.extensions.filter(d => d.required);
      for (const d of core) f.pkg(join(f.paths.agentDir, "npm/node_modules", d.name), d.name, d.version);
      f.settings("user", { packages: core.map(d => `npm:${d.name}@${d.version}`) });
      const models = defaultModels(); models.roles["bug-fix"] = ["fixture/reasoning"];
      f.write(configPath(f.paths, "user"), { version: 1, models, optional: [], helpers: false });
      const before = readFileSync(configPath(f.paths, "user"), "utf8"), h = harness(f);
      let supported = boundary !== "unsupported model", confirmations = 0;
      h.ctx.thinkingLevel = "low";
      h.ctx.modelRegistry.getAvailable = () => [h.ctx.model, { provider: "fixture", id: "reasoning", reasoning: supported }];
      h.ctx.ui.select = async (title: string, choices: string[]) => title.startsWith("Reasoning budget") ? (boundary === "budget cancel" ? undefined : "medium") : choices[0];
      h.ctx.ui.confirm = async () => {
        confirmations++;
        if (boundary === "capability drift") supported = false;
        if (boundary === "final cancel") await h.command("setup cancel");
        return true;
      };
      await h.command("setup");
      assert.equal(confirmations, boundary === "budget cancel" || boundary === "unsupported model" ? 0 : 1);
      assert.equal(readFileSync(configPath(f.paths, "user"), "utf8"), before);
      assert.equal(existsSync(join(f.paths.agentDir, "pistack-setup.json")), false);
      assert.equal(h.ctx.thinkingLevel, "low");
      if (boundary === "capability drift") assert.match(h.messages.join("\n"), /Unsupported/);
      if (boundary === "unsupported model") assert.match(h.messages.join("\n"), /no known supported reasoning/);
    } finally { f.cleanup(); }
  });
}

test("doctor verification is consent-only; actual normal transcript results are authoritative, never a persisted ready flag", async () => {
  const f = fixture(); try {
    const h = harness(f);
    await h.command("doctor verify"); assert.equal(h.prompts.length, 0);
    const confirmations: string[] = [];
    h.ctx.ui.confirm = async (_title: string, text: string) => { confirmations.push(text); return true; };
    await h.command("doctor verify");
    assert.equal(h.prompts.length, 1); assert.match(h.prompts[0], /action:'list'/); assert.match(h.prompts[0], /Do not launch/);
    assert.match(confirmations[0], /subagents_enable/);
    assert.match(h.prompts[0], /subagents_enable\(\{\}\)/);
    assert.match(h.prompts[0], /If .*unavailable[\s\S]*report unknown/);
    assert.match(h.prompts[0], /pistack\.analyst/);
    h.ctx.hasUI = false; await h.command("doctor verify");
    assert.equal(h.prompts.length, 1, "headless verification must not start a model turn");
    assert.equal(h.manager.getEntries().length, 0);
    h.ctx.hasUI = false; await h.command("setup"); assert.match(h.messages.at(-1)!, /requires native Pi dialogs/);
  } finally { f.cleanup(); }
});
test("passive doctor reports deferred activation without changing tools, starting turns or writing readiness", async () => {
  const f = fixture(); try {
    const h = harness(f);
    const active = ["subagents_enable"];
    h.pi.getActiveTools = () => [...active];
    h.pi.getAllTools = () => [{ name: "subagents_enable", sourceInfo: { path: join(f.root, "subagents/entry.js") } }];
    h.pi.setActiveTools = () => { throw new Error("passive doctor cannot activate tools"); };
    await h.command("doctor");
    assert.match(h.messages.join("\n"), /subagents_enable.*doctor verify/);
    assert.deepEqual(active, ["subagents_enable"]);
    assert.deepEqual(h.prompts, []);
    assert.equal(h.manager.getEntries().length, 0);
    assert.equal(existsSync(configPath(f.paths, "user")), false);
  } finally { f.cleanup(); }
});
test("passive public ping handles current session, stale reply and absent provider without hanging", async () => {
  const events = createEventBus();
  const unsubscribe = events.on("subagents:rpc:v1:request", (request: any) => events.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data: { session: { sessionId: "current" } } }));
  assert.match(await pingSubagents({ events }, "current", 10), /current-session/);
  assert.match(await pingSubagents({ events }, "stale", 10), /unknown/); unsubscribe();
  assert.match(await pingSubagents({ events }, "current", 10), /timed out/);
});
