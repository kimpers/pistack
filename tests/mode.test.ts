import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SessionManager, createEventBus } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import pistack, { pingSubagents } from "../pi/extensions/pistack.ts";
import { STATE_TYPE, emptyState, restoreState, updateChecklist } from "../pi/lib/session-state.ts";
import { defaultModels } from "../pi/lib/models.ts";
import { dependencyManifest, configPath } from "../pi/lib/setup.ts";
import { existsSync, readFileSync, mkdirSync, renameSync, symlinkSync, lstatSync, chmodSync } from "node:fs";
import { fixture } from "./fixtures.ts";

function harness(f: ReturnType<typeof fixture>, manager = SessionManager.create(f.paths.cwd, join(f.root, "sessions"))) {
  const events = new Map<string, Function>(); const tools = new Map<string, any>(); let command: any;
  const messages: string[] = [], prompts: string[] = [], work: unknown[] = [], messageOptions: unknown[] = [];
  const widgets = new Map<string, any>();
  const bus = createEventBus(), emit = bus.emit.bind(bus);
  bus.emit = (name, data) => { work.push({ event: name, data }); emit(name, data); };
  const pi: any = { on: (name: string, fn: Function) => events.set(name, fn), events: bus, registerTool: (tool: any) => tools.set(tool.name, tool), registerCommand: (_name: string, cmd: any) => { command = cmd; }, appendEntry: (type: string, data: unknown) => manager.appendCustomEntry(type, data), sendMessage: (m: any, options: unknown) => { messages.push(m.content); messageOptions.push(options); }, sendUserMessage: (text: string) => prompts.push(text), getAllTools: () => [], getActiveTools: () => [], setActiveTools: (...args: unknown[]) => work.push({ activate: args }), exec: (...args: unknown[]) => work.push({ exec: args }) };
  const parent = { provider: "fixture", id: "available" };
  const ctx: any = { cwd: f.paths.cwd, sessionManager: manager, model: parent, modelRegistry: { getAvailable: () => [parent] }, scopedModels: [], isProjectTrusted: () => true, hasUI: true, mode: "rpc", ui: { notify: (text: string) => messages.push(text), setStatus() {}, setWidget: (key: string, content: any) => widgets.set(key, content), select: async () => undefined, confirm: async () => false, input: async () => undefined } };
  ctx.executeTool = (...args: unknown[]) => work.push({ tool: args });
  pistack(pi);
  return { events, tools, pi, ctx, messages, prompts, widgets, manager, completions: (prefix: string) => command.getArgumentCompletions(prefix), assertNoWork: () => { assert.deepEqual(prompts, []); assert.deepEqual(work, []); for (const options of messageOptions) assert.deepEqual(options, { triggerTurn: false }); }, command: (args: string) => command.handler(args, ctx), emit: (name: string, event = {}) => events.get(name)?.(event, ctx) };
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
test("checklist widget bounds rendered rows while retaining full branch details", async () => {
  const f = fixture(); try {
    const h = harness(f); seed(h.manager); h.ctx.mode = "tui";
    const text = "2. Binary-search the cause.\n\tConfirm 界 🐴 e\u0301 with runtime evidence. ".repeat(20);
    const state = updateChecklist(emptyState(), { action: "start", playbook: "Bug fix\nLong async workflow", steps: Array.from({ length: 100 }, () => text) });
    state.enabled = true;
    for (const item of state.items.slice(0, 9)) item.status = "done";
    state.items[0].status = "skipped"; state.items[0].reason = "Owner requires a different workflow.\nKeep this complete.";
    h.manager.appendCustomEntry(STATE_TYPE, state);
    const leaf = h.manager.getLeafId()!;
    await h.emit("session_start", { reason: "resume" });
    const widget = h.widgets.get("pistack-checklist");
    assert.ok(widget, "a nonempty checklist has a widget");
    const component = Array.isArray(widget) ? new Text(widget.join("\n"), 0, 0) : widget({}, {}, {});
    for (const width of [40, 80, 160, 40]) {
      component.invalidate();
      const lines = component.render(width);
      assert.equal(lines.length, 2, `checklist must occupy two rendered rows at width ${width}`);
      for (const line of lines) {
        assert.ok(visibleWidth(line) <= width);
        assert.doesNotMatch(line, /[\r\n\t]/);
      }
      assert.match(lines[1], /^Next #10: 2\. Binary-search/);
    }
    assert.match(component.render(160)[0], /8 done.*1 skipped.*91 pending.*\/pistack checklist/);
    assert.doesNotMatch(component.render(160)[0], /piStack ON/);
    await h.command("checklist");
    assert.ok(h.messages.at(-1)!.includes(text));
    assert.ok(h.messages.at(-1)!.includes(state.items[0].reason!));
    const result = await h.tools.get("pistack_checklist").execute("list", { action: "list" }, undefined, undefined, h.ctx);
    assert.deepEqual(result.details.state, state);
    assert.ok(result.content[0].text.includes(text));
    assert.ok((await h.emit("before_agent_start", { systemPrompt: "BASE" })).systemPrompt.includes(text));
    assert.deepEqual(restoreState(h.manager.getBranch()), state);
    assert.equal(h.manager.getLeafId(), leaf, "rendering and inspection must not append state");
    for (const status of ["done", "skipped"] as const) {
      const complete = structuredClone(state);
      for (const item of complete.items) { item.status = status; item.reason = status === "skipped" ? "Not applicable" : undefined; }
      h.manager.appendCustomEntry(STATE_TYPE, complete);
      await h.emit("session_tree");
      const lines = h.widgets.get("pistack-checklist")({}, {}, {}).render(160);
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes(`100 ${status}`));
    }
    h.manager.branch(leaf);
    await h.emit("session_start", { reason: "reload" });
    assert.match(h.widgets.get("pistack-checklist")({}, {}, {}).render(80)[1], /^Next #10:/);
    await h.command("off");
    assert.equal(h.widgets.get("pistack-checklist")({}, {}, {}).render(80).length, 2);
    h.manager.appendCustomEntry(STATE_TYPE, emptyState());
    await h.emit("session_tree");
    assert.equal(h.widgets.get("pistack-checklist"), undefined);
    h.ctx.mode = "rpc"; h.widgets.clear(); h.manager.branch(leaf);
    await h.emit("session_start", { reason: "resume" });
    assert.equal(h.widgets.size, 0, "RPC must not receive a custom TUI factory");
    await h.command("checklist");
    assert.ok(h.messages.at(-1)!.includes(text));
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

test("persistent commands separate the user default from selected session state and retain checklists", async () => {
  const f = fixture(); try {
    const preference = join(f.paths.agentDir, "pistack-mode.json");
    const preserved = [join(f.paths.agentDir, "settings.json"), join(f.paths.cwd, ".pi/settings.json"), configPath(f.paths, "user"), configPath(f.paths, "project")];
    for (const path of preserved) f.write(path, '{ "unrelated": 42 }\n');
    f.write(join(f.paths.cwd, ".pi/pistack-mode.json"), { enabled: false });
    const before = preserved.map(path => readFileSync(path, "utf8"));
    const a = harness(f); a.ctx.hasUI = false;
    await a.emit("session_start", { reason: "startup" });
    assert.deepEqual(restoreState(a.manager.getBranch()), emptyState());
    assert.equal(a.manager.getEntries().filter(e => e.type === "custom").length, 1);
    await a.tools.get("pistack_checklist").execute("id", { action: "start", playbook: "Feature", steps: ["Verify"] }, undefined, undefined, a.ctx);
    await a.command("on --persist");
    assert.deepEqual(JSON.parse(readFileSync(preference, "utf8")), { enabled: true });
    assert.equal(lstatSync(preference).mode & 0o777, 0o600);
    assert.equal(restoreState(a.manager.getBranch()).enabled, true);
    await a.command("off");
    assert.equal(JSON.parse(readFileSync(preference, "utf8")).enabled, true);
    await a.emit("session_start", { reason: "reload" });
    assert.equal(restoreState(a.manager.getBranch()).enabled, false);
    assert.equal(restoreState(a.manager.getBranch()).items.length, 1);
    const b = harness(f); await b.emit("session_start", { reason: "startup" });
    assert.equal(restoreState(b.manager.getBranch()).enabled, true);
    assert.deepEqual(restoreState(b.manager.getBranch()).items, []);
    await a.command("off --persist"); await a.command("off --persist");
    assert.deepEqual(JSON.parse(readFileSync(preference, "utf8")), { enabled: false });
    await b.emit("session_start", { reason: "reload" });
    assert.equal(restoreState(b.manager.getBranch()).enabled, true, "saved on beats new default off");
    await b.command("on --persist");
    assert.equal(JSON.parse(readFileSync(preference, "utf8")).enabled, true, "last replacement wins");
    await a.command("status"); assert.match(a.messages.at(-1)!, /session.*OFF[\s\S]*new-session default.*ON/i);
    await a.command(""); assert.match(a.messages.at(-1)!, /on --persist/); assert.match(a.messages.at(-1)!, /shared goals\/workers/i);
    assert.ok(a.completions("on").some((item: any) => item.value === "on --persist" && /default/i.test(item.label)));
    assert.ok(a.completions("off").some((item: any) => item.value === "off --persist"));
    assert.deepEqual(preserved.map(path => readFileSync(path, "utf8")), before);
    a.manager.newSession(); await a.emit("session_start", { reason: "new" });
    assert.deepEqual(restoreState(a.manager.getBranch()), { ...emptyState(), enabled: true });
    a.assertNoWork(); b.assertNoWork();
  } finally { f.cleanup(); }
});

for (const scenario of ["fresh", "in memory", "model/thinking", "legacy", "header only", "empty file", "unexpected", "parent", "missing header", "inspection error", "saved off"]) {
  test(`startup default uses public freshness evidence: ${scenario}`, async () => {
    const f = fixture(); try {
      f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
      let manager = scenario === "in memory" ? SessionManager.inMemory(f.paths.cwd) : SessionManager.create(f.paths.cwd, join(f.root, "sessions"));
      if (scenario === "model/thinking") { manager.appendModelChange("fixture", "available"); manager.appendThinkingLevelChange("high"); }
      if (scenario === "legacy" || scenario === "saved off") {
        seed(manager);
        if (scenario === "saved off") manager.appendCustomEntry(STATE_TYPE, emptyState());
        manager = SessionManager.open(manager.getSessionFile()!);
      }
      if (scenario === "header only" || scenario === "empty file") { f.write(manager.getSessionFile()!, scenario === "empty file" ? "" : JSON.stringify(manager.getHeader()) + "\n"); manager = SessionManager.open(manager.getSessionFile()!); }
      if (scenario === "unexpected") manager.appendCustomEntry("other", {});
      if (scenario === "parent") manager.newSession({ parentSession: "/fixture/parent.jsonl" });
      const h = harness(f, manager); h.ctx.hasUI = false;
      if (scenario === "missing header") manager.getHeader = () => null;
      if (scenario === "inspection error") {
        const loop = join(f.root, "loop"); symlinkSync(loop, loop); manager.getSessionFile = () => join(loop, "session.jsonl");
      }
      await h.emit("session_start", { reason: "startup" });
      const fresh = ["fresh", "in memory", "model/thinking"].includes(scenario);
      assert.equal(restoreState(manager.getBranch()).enabled, fresh);
      assert.equal(manager.getEntries().filter(e => e.type === "custom" && e.customType === STATE_TYPE).length, fresh || scenario === "saved off" ? 1 : 0);
      h.assertNoWork();
    } finally { f.cleanup(); }
  });
}

for (const reason of ["reload", "resume", "fork", "tree", "compact"]) {
  test(`${reason} never initializes legacy state from today's default`, async () => {
    const f = fixture(); try {
      f.write(join(f.paths.agentDir, "pistack-mode.json"), "broken JSON");
      const h = harness(f); h.ctx.hasUI = false;
      await h.emit(reason === "tree" || reason === "compact" ? `session_${reason}` : "session_start", { reason });
      assert.deepEqual(restoreState(h.manager.getBranch()), emptyState());
      assert.deepEqual(h.messages, [], "restoration must not read the broken preference");
      assert.deepEqual(h.manager.getEntries(), []);
      h.assertNoWork();
    } finally { f.cleanup(); }
  });
}

test("buffered snapshots survive a fresh extension reload but are not restart-persisted", async () => {
  const f = fixture(); try {
    f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
    const h = harness(f); await h.emit("session_start", { reason: "startup" });
    await h.command("off --persist");
    assert.equal(existsSync(h.manager.getSessionFile()!), false);
    f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
    const reload = harness(f, h.manager); await reload.emit("session_start", { reason: "reload" });
    assert.equal(restoreState(h.manager.getBranch()).enabled, false);
    assert.equal(existsSync(h.manager.getSessionFile()!), false);
    assert.match(h.messages.join("\n"), /before.*conversation|until.*conversation/i);
    h.assertNoWork(); reload.assertNoWork();
  } finally { f.cleanup(); }
});

test("malformed preference fails closed on new sessions but cannot erase saved ancestry", async () => {
  const f = fixture(); try {
    const path = join(f.paths.agentDir, "pistack-mode.json"); f.write(path, "broken");
    const h = harness(f); h.ctx.hasUI = false;
    await h.emit("session_start", { reason: "startup" });
    assert.equal(restoreState(h.manager.getBranch()).enabled, false);
    assert.match(h.messages.join("\n"), /default.*(invalid|error|failed)/i);
    await h.command("on");
    const saved = h.manager.getBranch();
    await h.command("off --persist");
    assert.deepEqual(h.manager.getBranch(), saved);
    assert.equal(readFileSync(path, "utf8"), "broken");
    await h.emit("session_start", { reason: "startup" });
    assert.equal(restoreState(h.manager.getBranch()).enabled, true);
    await h.command("status");
    assert.match(h.messages.at(-1)!, /session.*ON[\s\S]*default.*(invalid|error|unavailable)/i);
    h.assertNoWork();
  } finally { f.cleanup(); }
});

test("preference write failure leaves session mode and checklist unchanged", async () => {
  const f = fixture(); try {
    const h = harness(f); h.ctx.hasUI = false;
    await h.command("on");
    await h.tools.get("pistack_checklist").execute("id", { action: "add", text: "keep" }, undefined, undefined, h.ctx);
    const before = h.manager.getBranch();
    chmodSync(f.paths.agentDir, 0o500);
    try {
      await h.command("off --persist");
      assert.deepEqual(h.manager.getBranch(), before);
      assert.equal(existsSync(join(f.paths.agentDir, "pistack-mode.json")), false);
      assert.match(h.messages.at(-1)!, /default.*(failed|not saved)/i);
      assert.doesNotMatch(h.messages.at(-1)!, /default.*saved.*OFF/i);
    } finally { chmodSync(f.paths.agentDir, 0o700); }
    h.assertNoWork();
  } finally { f.cleanup(); }
});

for (const enabled of [true, false]) {
  test(`real failed disk append observes already-mutated ancestry after saving default ${enabled}`, async () => {
    const f = fixture(); try {
      const h = harness(f); seed(h.manager);
      await h.command(enabled ? "off" : "on");
      await h.tools.get("pistack_checklist").execute("id", { action: "add", text: "keep through failed append" }, undefined, undefined, h.ctx);
      const path = h.manager.getSessionFile()!, backup = `${path}.original`;
      const durableBefore = readFileSync(path, "utf8");
      renameSync(path, backup); mkdirSync(path);
      await h.command(enabled ? "on --persist" : "off --persist");
      assert.deepEqual(JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-mode.json"), "utf8")), { enabled });
      assert.equal(restoreState(h.manager.getBranch()).enabled, enabled, "SDK mutates the active branch before disk append throws");
      assert.equal(restoreState(h.manager.getBranch()).items[0].text, "keep through failed append");
      assert.equal(readFileSync(backup, "utf8"), durableBefore);
      assert.match(h.messages.at(-1)!, new RegExp(`default.*saved.*${enabled ? "ON" : "OFF"}[\\s\\S]*observed.*session.*${enabled ? "ON" : "OFF"}[\\s\\S]*durability.*unconfirmed`, "i"));
      assert.doesNotMatch(h.messages.at(-1)!, /rolled back|unchanged/i);
      await h.emit("session_start", { reason: "reload" });
      assert.equal(restoreState(h.manager.getBranch()).enabled, enabled);
      h.assertNoWork();
    } finally { f.cleanup(); }
  });
}

test("new-session append failure reports observed in-memory ancestry without starting work", async () => {
  const f = fixture(); try {
    f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
    const h = harness(f); seed(h.manager);
    const path = h.manager.getSessionFile()!; renameSync(path, `${path}.original`); mkdirSync(path);
    await h.emit("session_start", { reason: "new" });
    assert.equal(restoreState(h.manager.getBranch()).enabled, true);
    assert.match(h.messages.at(-1)!, /observed.*session.*ON[\s\S]*durability.*unconfirmed/i);
    h.assertNoWork();
  } finally { f.cleanup(); }
});

test("mode preference boundary rejects malformed JSON and unsafe destinations, allows symlinked agent directory", async () => {
  const { readModeDefault, writeModeDefault } = await import("../pi/lib/mode-default.ts");
  const f = fixture(); try {
    assert.equal(readModeDefault(f.paths.agentDir), false);
    for (const [index, value] of ["{", "null", "[]", '{}', '{"enabled":"true"}', '{"enabled":true,"unknown":1}'].entries()) {
      const dir = join(f.root, `malformed-${index}`), path = join(dir, "pistack-mode.json"); f.write(path, value);
      assert.throws(() => readModeDefault(dir)); assert.throws(() => writeModeDefault(dir, false));
      assert.equal(readFileSync(path, "utf8"), value);
    }
    for (const kind of ["symlink", "dangling", "directory"]) {
      const dir = join(f.root, kind), path = join(dir, "pistack-mode.json"), target = join(f.root, `${kind}-target`); mkdirSync(dir);
      if (kind === "directory") mkdirSync(path);
      else { if (kind === "symlink") f.write(target, { enabled: true }); symlinkSync(target, path); }
      assert.throws(() => readModeDefault(dir)); assert.throws(() => writeModeDefault(dir, false));
      assert.equal(lstatSync(path).isSymbolicLink(), kind !== "directory");
      if (kind === "symlink") assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { enabled: true });
      if (kind === "dangling") assert.equal(existsSync(target), false);
    }
    const link = join(f.root, "agent-link"); symlinkSync(f.paths.agentDir, link);
    writeModeDefault(link, true); assert.equal(readModeDefault(link), true);
    writeModeDefault(link, false); assert.equal(readModeDefault(f.paths.agentDir), false);
  } finally { f.cleanup(); }
});

test("new-session initialization preserves a snapshot supplied by the host instead of consulting the default", async () => {
  const f = fixture(); try {
    f.write(join(f.paths.agentDir, "pistack-mode.json"), "malformed");
    const h = harness(f);
    const saved = updateChecklist(emptyState(), { action: "add", text: "host-supplied checklist" });
    h.manager.appendCustomEntry(STATE_TYPE, saved);
    const before = h.manager.getBranch();
    await h.emit("session_start", { reason: "new" });
    assert.deepEqual(h.manager.getBranch(), before);
    assert.deepEqual(restoreState(h.manager.getBranch()), saved);
    assert.deepEqual(h.messages, []);
    h.assertNoWork();
  } finally { f.cleanup(); }
});

test("unreadable preference fails closed and cannot overwrite bytes or a saved checklist", async () => {
  const f = fixture(); try {
    const path = join(f.paths.agentDir, "pistack-mode.json"); f.write(path, { enabled: true });
    const h = harness(f); h.ctx.hasUI = false;
    chmodSync(path, 0o000);
    try {
      await h.emit("session_start", { reason: "startup" });
      assert.equal(restoreState(h.manager.getBranch()).enabled, false);
      assert.match(h.messages.at(-1)!, /default.*unavailable/i);
      await h.tools.get("pistack_checklist").execute("id", { action: "add", text: "keep" }, undefined, undefined, h.ctx);
      const before = h.manager.getBranch();
      await h.command("on --persist");
      assert.deepEqual(h.manager.getBranch(), before);
      assert.match(h.messages.at(-1)!, /default not saved/);
    } finally { chmodSync(path, 0o600); }
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { enabled: true });
    h.assertNoWork();
  } finally { f.cleanup(); }
});
