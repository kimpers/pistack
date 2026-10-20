import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, copyFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager, createAgentSession, createAgentSessionRuntime, createAgentSessionServices, createAgentSessionFromServices, SessionManager, ModelRuntime, type AgentSessionRuntime, type SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { restoreState, emptyState, STATE_TYPE } from "../pi/lib/session-state.ts";
import { fixture } from "./fixtures.ts";
import { auditPackage, filesUnder } from "./upstream-sync-support.ts";
const root = fileURLToPath(new URL("../", import.meta.url));

test("distribution allowlist retains attribution/references/scripts and excludes dormant packs and duplicate dependencies", () => {
  const f = fixture(); try {
    const result = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", join(f.root, "npm-cache")], { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_update_notifier: "false", npm_config_offline: "true" } }));
    const paths = result[0].files.map((file: any) => file.path);
    for (const path of ["package.json", "pi/lib/mode-default.ts", "pi/extensions/pistack.ts", "pi/agents/profiles/poteto-agent.md", "pstack/LICENSE", "pstack/skills/how/references/explorer-prompt.md", "pstack/skills/principle-attack-the-premise/SKILL.md", "pstack/skills/principle-test-behavior-not-implementation/SKILL.md", "pstack/skills/poteto-mode/scripts/bootstrap.ts", "pstack/skills/poteto-mode/scripts/bun.lock", "pstack/skills/deslop/LICENSE", "pi/references/skills.md", "pi/agents/profiles/analyst.md"]) assert.ok(paths.includes(path), path);
    assert.ok(!paths.some((p: string) => /how\/references\/(?:critic-prompt|critique-rubric)\.md/.test(p)));
    assert.ok(!paths.some((p: string) => /automations\/benny|make-bot-ui|node_modules|^(?:advisor|origin-apps|third_party|tests)\/|^pstack\/(?:README\.md|plugin\.json|\.cursor-plugin\/|agents\/|docs\/)/.test(p)));
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.equal(manifest.private, true); assert.equal(manifest.name, "pistack");
    assert.equal(manifest.dependencies, undefined); assert.equal(manifest.bundledDependencies, undefined);
    assert.equal(manifest.pi.skills.length, 54); assert.ok(manifest.pi.skills.every((path: string) => /^\.\/pstack\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(path))); assert.deepEqual(manifest["pi-subagents"].agents, ["./pi/agents/profiles"]);
    assert.match(readFileSync(join(root, "pstack/LICENSE"), "utf8"), /Copyright \(c\) 2026 Lauren Tan/);
  } finally { f.cleanup(); }
});
test("actual Pi package loader discovers owned extension and selected skills; real SDK commands and reload preserve mode", async () => {
  const f = fixture(); let session: any;
  try {
    f.settings("user", { packages: [root], compaction: { enabled: false } });
    const settingsManager = SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true });
    const loader = new DefaultResourceLoader({ cwd: f.paths.cwd, agentDir: f.paths.agentDir, settingsManager });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.equal(loader.getExtensions().extensions.length, 1);
    assert.equal(loader.getSkills().skills.length, 54);
    assert.deepEqual(loader.getSkills().diagnostics, []);
    const modelRuntime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
    const manager = SessionManager.create(f.paths.cwd, join(f.root, "sessions"));
    ({ session } = await createAgentSession({ ...f.paths, settingsManager, resourceLoader: loader, modelRuntime, sessionManager: manager }));
    await session.bindExtensions({});
    assert.ok(session.extensionRunner.getCommand("pistack"));
    await session.prompt("/pistack on"); assert.equal(restoreState(manager.getBranch()).enabled, true);
    await session.reload(); assert.equal(restoreState(manager.getBranch()).enabled, true);
    await session.prompt("/pistack off"); assert.equal(restoreState(manager.getBranch()).enabled, false);
    await session.prompt("/pistack setup"); assert.equal(existsSync(join(f.paths.agentDir, "pistack.json")), false);
  } finally { if (session) { await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }); session.dispose(); } f.cleanup(); }
});
test("actual offline tarball loads all final resources outside the checkout with intact links and child skill paths", async () => {
  const f = fixture(); try {
    const result = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", f.root, "--cache", join(f.root, "npm-cache")], { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_update_notifier: "false", npm_config_offline: "true" } }));
    execFileSync("tar", ["-xf", join(f.root, result[0].filename), "-C", f.root]);
    const packed = join(f.root, "package");
    assert.deepEqual(auditPackage(packed), []);
    const paths = filesUnder(packed);
    assert.ok(!paths.some(p => /make-bot-ui|automations\/benny|node_modules|\.test\.ts$|^(?:tests|evals|origin-apps|third_party)\/|^pstack\/(?:README\.md|plugin\.json|\.cursor-plugin\/|agents\/|docs\/)|install-key/.test(p)));
    for (const name of ["poteto-agent", "comment-sicko", "analyst"]) {
      const body = readFileSync(join(packed, `pi/agents/profiles/${name}.md`), "utf8");
      const roots = /^skillPath: (.+)$/m.exec(body)![1].split(", ").map(path => join(packed, "pi/agents/profiles", path));
      for (const skill of /^skills: (.+)$/m.exec(body)![1].split(", ")) assert.ok(roots.some(path => existsSync(join(path, skill, "SKILL.md"))), `${name}: ${skill}`);
    }
    f.settings("user", { packages: [packed] });
    const loader = new DefaultResourceLoader({ ...f.paths, settingsManager: SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true }) });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []); assert.equal(loader.getExtensions().extensions.length, 1);
    assert.deepEqual(loader.getSkills().diagnostics, []); assert.equal(loader.getSkills().skills.length, 54);
    assert.ok(loader.getSkills().skills.every(skill => skill.filePath.startsWith(packed + "/")));
    assert.deepEqual(loader.getPrompts().prompts, []); assert.deepEqual(loader.getThemes().themes, []);
    for (const path of ["README.md", "pstack/LICENSE", "pstack/skills/deslop/LICENSE", "pstack/skills/poteto-mode/scripts/bun.lock"]) assert.deepEqual(readFileSync(join(packed, path)), readFileSync(join(root, path)));
  } finally { f.cleanup(); }
});
test("retained bootstrap normal invocation fails read-only with no install or restart even for help", () => {
  const f = fixture(); try {
    const scripts = join(root, "pstack/skills/poteto-mode/scripts");
    const dir = join(f.root, "scripts");
    f.write(join(dir, "package.json"), readFileSync(join(scripts, "package.json"), "utf8"));
    f.write(join(dir, "bun.lock"), readFileSync(join(scripts, "bun.lock"), "utf8"));
    copyFileSync(join(scripts, "bootstrap.ts"), join(dir, "bootstrap.ts"));
    f.write(join(dir, "entry.ts"), `import { ensureDependenciesInstalled } from './bootstrap.ts';\nBun.spawnSync = () => { throw new Error('FORBIDDEN SPAWN'); };\nensureDependenciesInstalled();\n`);
    const before = readdirSync(dir).sort();
    for (const args of [[], ["--help"]]) {
      const result = spawnSync("bun", [join(dir, "entry.ts"), ...args], { cwd: f.paths.cwd, encoding: "utf8", env: process.env });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /explicitly approve/); assert.doesNotMatch(result.stderr, /FORBIDDEN SPAWN/);
    }
    assert.deepEqual(readdirSync(dir).sort(), before); assert.equal(existsSync(join(dir, "node_modules")), false);
  } finally { f.cleanup(); }
});

for (const scenario of ["fresh", "legacy", "saved off", "header only", "command append failure", "new append failure", "startup append failure"]) {
  test(`public createAgentSession startup routes persistent mode for ${scenario} without a model call`, async () => {
    const f = fixture(); let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
    try {
      f.settings("user", { packages: [root], compaction: { enabled: false } });
      f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
      const reasons: string[] = [], work: string[] = [], errors: { event: string; error: string }[] = [];
      const settingsManager = SettingsManager.create(f.paths.cwd, f.paths.agentDir, { projectTrusted: true });
      const loader = new DefaultResourceLoader({ ...f.paths, settingsManager, extensionFactories: [pi => {
        pi.on("session_start", event => { reasons.push(event.reason); });
        pi.on("before_agent_start", () => { work.push("before_agent_start"); });
        pi.on("tool_call", event => { work.push(event.toolName); return { block: true, reason: "No work permitted in persistence fixture" }; });
      }] });
      await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
      const modelRuntime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
      let manager = SessionManager.create(f.paths.cwd, join(f.root, "sessions"));
      if (scenario !== "fresh" && scenario !== "startup append failure") {
        if (scenario === "header only") f.write(manager.getSessionFile()!, JSON.stringify(manager.getHeader()) + "\n");
        else {
          manager.appendMessage({ role: "user", content: "Local fixture only", timestamp: Date.now() });
          if (scenario === "saved off") manager.appendCustomEntry(STATE_TYPE, emptyState());
        }
        manager = SessionManager.open(manager.getSessionFile()!);
      }
      const sessionStartEvent: SessionStartEvent | undefined = scenario === "new append failure" ? { type: "session_start", reason: "new" } : undefined;
      ({ session } = await createAgentSession({ ...f.paths, settingsManager, resourceLoader: loader, modelRuntime, sessionManager: manager, sessionStartEvent }));
      const sessionFile = manager.getSessionFile()!;
      if (scenario === "new append failure") { renameSync(sessionFile, `${sessionFile}.original`); mkdirSync(sessionFile); }
      if (scenario === "startup append failure") {
        const append = manager.appendCustomEntry.bind(manager);
        manager.appendCustomEntry = (type, data) => { append(type, data); throw new Error("Injected buffered startup append failure"); };
      }
      session.agent.streamFunction = () => { work.push("model"); throw new Error("Model calls forbidden"); };
      session.subscribe(event => { if (["agent_start", "tool_execution_start"].includes(event.type)) work.push(event.type); });
      const toolsBefore = session.getActiveToolNames();
      await session.bindExtensions({ onError: error => { errors.push(error); } });
      assert.deepEqual(reasons, [sessionStartEvent?.reason ?? "startup"]);
      if (scenario.endsWith("append failure")) {
        if (scenario === "command append failure") {
          await session.prompt("/pistack off");
          const before = readFileSync(sessionFile, "utf8");
          renameSync(sessionFile, `${sessionFile}.original`); mkdirSync(sessionFile);
          await session.prompt("/pistack on --persist");
          assert.equal(readFileSync(`${sessionFile}.original`, "utf8"), before);
        }
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(errors.length, 1);
        assert.equal(errors[0].event, scenario === "command append failure" ? "command" : "session_start");
        assert.match(errors[0].error, /observed.*session.*ON[\s\S]*durability.*unconfirmed/i);
        if (scenario === "command append failure") assert.match(errors[0].error, /default.*saved.*ON/i);
        assert.equal(restoreState(manager.getBranch()).enabled, true);
        assert.deepEqual(JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-mode.json"), "utf8")), { enabled: true });
        assert.deepEqual(session.getActiveToolNames(), toolsBefore);
        assert.deepEqual(work, []);
        return;
      }
      assert.equal(restoreState(manager.getBranch()).enabled, scenario === "fresh");
      assert.equal(manager.getEntries().filter(entry => entry.type === "custom" && entry.customType === STATE_TYPE).length, scenario === "fresh" || scenario === "saved off" ? 1 : 0);
      await session.prompt("/pistack off --persist");
      assert.equal(restoreState(manager.getBranch()).enabled, false);
      assert.deepEqual(JSON.parse(readFileSync(join(f.paths.agentDir, "pistack-mode.json"), "utf8")), { enabled: false });
      f.write(join(f.paths.agentDir, "pistack-mode.json"), { enabled: true });
      await session.reload();
      assert.deepEqual(reasons, ["startup", "reload"]);
      assert.equal(restoreState(manager.getBranch()).enabled, false);
      await session.prompt("/pistack on --persist");
      assert.equal(restoreState(manager.getBranch()).enabled, true);
      assert.deepEqual(session.getActiveToolNames(), toolsBefore);
      if (scenario === "fresh") assert.equal(existsSync(manager.getSessionFile()!), false, "commands and reload cannot force a conversation flush");
      assert.deepEqual(work, []); assert.deepEqual(errors, []);
    } finally { session?.dispose(); f.cleanup(); }
  });
}

test("public SDK new-session replacement reads the default and starts with an empty checklist", async () => {
  const f = fixture(); let runtime: AgentSessionRuntime | undefined;
  try {
    f.settings("user", { packages: [root], compaction: { enabled: false } });
    const reasons: string[] = [], work: string[] = [];
    const modelRuntime = await ModelRuntime.create({ authPath: join(f.paths.agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(f.paths.agentDir, "catalogs"), allowModelNetwork: false, refreshOnCreate: false });
    const createRuntime = async ({ cwd, sessionManager, sessionStartEvent }: { cwd: string; sessionManager: SessionManager; sessionStartEvent?: SessionStartEvent }) => {
      const services = await createAgentSessionServices({ cwd, agentDir: f.paths.agentDir, modelRuntime, resourceLoaderOptions: { extensionFactories: [pi => {
        pi.on("session_start", event => { reasons.push(event.reason); });
        pi.on("before_agent_start", () => { work.push("turn"); });
        pi.on("tool_call", event => { work.push(event.toolName); return { block: true, reason: "No fixture work" }; });
      }] } });
      const result = await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent });
      result.session.agent.streamFunction = () => { work.push("model"); throw new Error("Model calls forbidden"); };
      return { ...result, services, diagnostics: services.diagnostics };
    };
    runtime = await createAgentSessionRuntime(createRuntime, { ...f.paths, sessionManager: SessionManager.create(f.paths.cwd, join(f.root, "sessions")) });
    runtime.setRebindSession(async session => { await session.bindExtensions({}); });
    await runtime.session.bindExtensions({});
    await runtime.session.prompt("/pistack on --persist");
    runtime.session.sessionManager.appendCustomEntry(STATE_TYPE, { ...emptyState(), enabled: false, playbook: "old", items: [{ id: 1, text: "old step", status: "done" }], nextId: 2 });
    assert.deepEqual(await runtime.newSession(), { cancelled: false });
    assert.deepEqual(reasons, ["startup", "new"]);
    assert.deepEqual(restoreState(runtime.session.sessionManager.getBranch()), { ...emptyState(), enabled: true });
    assert.deepEqual(work, []);
  } finally { await runtime?.dispose(); f.cleanup(); }
});
