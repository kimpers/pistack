import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync, statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import pistack from "../pi/extensions/pistack.ts";
import { HISTORY_LIMITS, readHistory, reflectionDestination, workspaceSessionDir, type HistoryRequest } from "../pi/lib/history.ts";

const now = Date.parse("2026-09-06T12:00:00Z");
const at = (days = 0) => new Date(now - days * 86400000).toISOString();
const entry = (id: string, parentId: string | null, text = id, timestamp = at()) => ({ type: "message", id, parentId, timestamp, message: { role: "user", content: text, timestamp: Date.parse(timestamp) } });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pistack-history-"))); const cwd = join(root, "project"), agentDir = join(root, "agent"), other = join(root, "other");
  for (const dir of [cwd, agentDir, other]) mkdirSync(dir);
  const store = workspaceSessionDir(cwd, agentDir); mkdirSync(store, { recursive: true });
  const manager = SessionManager.inMemory(cwd, { id: "active" });
  const ctx = { cwd, agentDir, sessionManager: manager };
  function session(id: string, entries: any[] = [entry("a", null)], options: { cwd?: string; parentSession?: string; version?: number; timestamp?: string } = {}) {
    const path = join(store, `${id}.jsonl`);
    writeFileSync(path, [{ type: "session", version: 3, id, timestamp: at(10), cwd, ...options }, ...entries].map(e => typeof e === "string" ? e : JSON.stringify(e)).join("\n") + "\n");
    return path;
  }
  const read = (request: HistoryRequest) => readHistory(ctx, request, undefined, now);
  return { root, cwd, other, store, agentDir, manager, ctx, session, read, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("history scopes canonical workspace, excludes current/nested/symlink defaults and discloses name-only heuristics", async () => {
  const f = fixture(); try {
    f.session("good"); f.session("wrong", [entry("x", null, "SECRET_WORKSPACE_PAYLOAD")], { cwd: f.other }); f.session("active");
    f.session("named", [entry("n", null), { type: "session_info", id: "name", parentId: "n", timestamp: at(), name: "fixture architecture" }]);
    mkdirSync(join(f.store, "children")); writeFileSync(join(f.store, "children", "private.jsonl"), "secret");
    symlinkSync(f.session("target"), join(f.store, "linked.jsonl"));
    const list = await f.read({ action: "sessions", purpose: "recall" });
    assert.deepEqual(list.sessions.map(s => s.sessionId).sort(), ["good", "target"]);
    assert.equal(list.excluded.workspace, 1); assert.equal(list.excluded["non-session/nested/symlink"], 2);
    assert.ok(list.omittedSessions.some(s => s.sessionId === "active" && !s.explicitSelectionSafe));
    assert.ok(list.omittedSessions.some(s => s.sessionId === "named" && s.explicitSelectionSafe));
    const explicit = await f.read({ action: "read", purpose: "recall", sessionId: "named", leafId: "name" });
    assert.equal(explicit.evidence[0].entryId, "n"); assert.match(explicit.gaps.join(), /human\/child origin unknown/);
    assert.ok(!JSON.stringify(list).includes("SECRET_WORKSPACE_PAYLOAD"));
    const alias = join(f.root, "workspace-alias"); symlinkSync(f.cwd, alias);
    assert.equal((await readHistory({ ...f.ctx, cwd: alias }, { action: "sessions", purpose: "recall" }, undefined, now)).workspace, f.cwd);
  } finally { f.cleanup(); }
});

test("history live leaf ancestry differs from append order, supports null leaf, compaction and alternate branches", async () => {
  const f = fixture(); try {
    const m = f.manager;
    const root = m.appendMessage({ role: "user", content: "root source", timestamp: now });
    const current = m.appendMessage({ role: "user", content: "current branch", timestamp: now });
    m.branch(root); const alternate = m.appendMessage({ role: "user", content: "alternate branch", timestamp: now });
    m.branch(current);
    // Entry timestamps are assigned by the real SDK, so use its actual clock for this integration.
    const read = (extra = {}) => readHistory(f.ctx, { action: "read", purpose: "reflect", ...extra });
    const selected = await read(); assert.deepEqual(selected.evidence.map(e => e.entryId), [root, current]);
    assert.deepEqual(selected.evidence.map(e => e.branch), ["ancestor", "current"]);
    const comparison = await read({ leafId: alternate }); assert.deepEqual(comparison.evidence.map(e => e.branch), ["ancestor", "alternate"]);
    m.appendCompaction("summary is not proof", root, 100);
    const compacted = await read(); assert.ok(compacted.evidence.some(e => e.entryId === root)); assert.match(compacted.evidence.at(-1)!.kind, /summary \(not source/);
    assert.ok(!compacted.evidence.some(e => e.entryId === alternate));
    m.resetLeaf(); assert.equal((await read()).evidence.length, 0);
    m.branch(root); assert.deepEqual((await read()).evidence.map(e => e.entryId), [root]);
    assert.equal(selected.evidence[0].reference, `pi-session:active/entry:${root}?leaf=${current}`);
  } finally { f.cleanup(); }
});

test("history archived branches require chosen tip, preserve pre-compaction source and tool kinds", async () => {
  const f = fixture(); try {
    f.session("tree", [entry("r", null), entry("a", "r", "abandoned"), entry("b", "r", "chosen"), { type: "message", id: "call", parentId: "b", timestamp: at(), message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "false" } }, { type: "thinking", thinking: "private reasoning" }] } }, { type: "message", id: "result", parentId: "call", timestamp: at(), message: { role: "toolResult", toolName: "bash", toolCallId: "c1", isError: true, content: [{ type: "text", text: "exit 1" }] } }, { type: "compaction", id: "compact", parentId: "result", timestamp: at(), summary: "claimed success", retainedTail: [{ role: "user", content: "do not duplicate" }] }]);
    await assert.rejects(f.read({ action: "read", purpose: "recall", sessionId: "tree" }), /requires explicit leafId/);
    const result = await f.read({ action: "read", purpose: "recall", sessionId: "tree", leafId: "compact" });
    assert.deepEqual(result.evidence.map(e => e.entryId), ["r", "b", "call", "result", "compact"]);
    assert.match(result.evidence[2].excerpt, /toolCall bash id=c1/); assert.match(result.evidence[3].kind, /error=true/);
    assert.ok(!JSON.stringify(result).includes("private reasoning")); assert.ok(!JSON.stringify(result).includes("do not duplicate"));
    assert.ok(result.evidence.every(e => e.sourcePath === join(f.store, "tree.jsonl") && e.branch === "selected"));
  } finally { f.cleanup(); }
});

test("history same-workspace forks-of-forks are explicitly selectable; missing/cross-workspace/cyclic parents disclose incomplete provenance", async () => {
  const f = fixture(); try {
    const parent = f.session("parent"); const fork = f.session("fork", [entry("f", null)], { parentSession: parent });
    f.session("fork2", [entry("f2", null)], { parentSession: fork });
    const cross = f.session("cross", [entry("cross", null)], { cwd: f.other });
    f.session("badfork", [entry("bad", null)], { parentSession: cross });
    f.session("missing", undefined, { parentSession: join(f.store, "absent.jsonl") });
    f.session("cycleA", undefined, { parentSession: join(f.store, "cycleB.jsonl") }); f.session("cycleB", undefined, { parentSession: join(f.store, "cycleA.jsonl") });
    const list = await f.read({ action: "sessions", purpose: "recall" });
    assert.deepEqual(list.sessions.map(s => s.sessionId), ["parent"]);
    assert.ok(list.omittedSessions.find(s => s.sessionId === "fork2")!.explicitSelectionSafe);
    assert.deepEqual(list.omittedSessions.find(s => s.sessionId === "fork2")!.leaves, ["f2"]);
    assert.equal((await f.read({ action: "read", purpose: "recall", sessionId: "fork2", leafId: "f2" })).evidence[0].entryId, "f2");
    for (const id of ["badfork", "missing", "cycleA"]) {
      const r = await f.read({ action: "read", purpose: "recall", sessionId: id, leafId: "a" });
      assert.equal(r.evidence.length, 0); assert.match(r.omittedSessions.find(s => s.sessionId === id)!.reason, /incomplete provenance/);
      assert.match(r.gaps.join(), /not evidence of absence/);
    }
    let previous = parent;
    for (let i = 0; i < 17; i++) previous = f.session(`depth${i}`, undefined, { parentSession: previous });
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).omittedSessions.find(s => s.sessionId === "depth16")!.reason, /depth limit/);
  } finally { f.cleanup(); }
});

test("history malformed records expose gaps, broken/cyclic entry ancestry fails, legacy files never migrate", async () => {
  const f = fixture(); try {
    const path = f.session("malformed", [entry("root", null), "{broken", { type: "message" }, entry("leaf", "root")]);
    f.session("legacy", [], { version: 1 }); f.session("duplicate", [entry("dup", null), entry("dup", null)]);
    f.session("broken", [entry("orphan", "missing")]); f.session("cyclic", [entry("x", "y"), entry("y", "x")]);
    const before = readFileSync(path, "utf8"), mtime = statSync(path).mtimeMs;
    const result = await f.read({ action: "read", purpose: "recall", sessionId: "malformed" });
    assert.deepEqual(result.evidence.map(e => e.entryId), ["root", "leaf"]);
    assert.match(result.gaps.join(), /malformed JSON/); assert.match(result.gaps.join(), /invalid entry/); assert.match(result.gaps.join(), /legacy v1/); assert.match(result.gaps.join(), /duplicate entry/);
    await assert.rejects(f.read({ action: "read", purpose: "recall", sessionId: "broken" }), /missing ancestor/);
    await assert.rejects(f.read({ action: "read", purpose: "recall", sessionId: "cyclic", leafId: "x" }), /cyclic ancestry/);
    assert.equal(readFileSync(path, "utf8"), before); assert.equal(statSync(path).mtimeMs, mtime);
    assert.equal(JSON.parse(readFileSync(join(f.store, "legacy.jsonl"), "utf8")).version, 1);
  } finally { f.cleanup(); }
});

test("history inclusive entry time boundaries, incremental cutoff and timestamp sort ignore filenames and mtime", async () => {
  const f = fixture(); try {
    f.session("z-old", [entry("old", null, "outside", at(8)), entry("start", "old", "boundary", at(7)), entry("end", "start", "boundary", at()), entry("future", "end", "outside", new Date(now + 1).toISOString())], { timestamp: at(30) });
    f.session("a-new", [entry("new", null, "new", at(20))], { timestamp: at(20) });
    assert.deepEqual((await f.read({ action: "sessions", purpose: "automate-me" })).sessions.map(s => s.sessionId), ["z-old", "a-new"]);
    const r = await f.read({ action: "read", purpose: "recall", sessionId: "z-old" }); assert.deepEqual(r.evidence.map(e => e.entryId), ["start", "end"]);
    assert.equal(r.since, at(7)); assert.equal(r.until, at());
    assert.deepEqual((await f.read({ action: "read", purpose: "recall", sessionId: "z-old", since: at(), until: at() })).evidence.map(e => e.entryId), ["end"]);
    for (const request of [{ since: at(91) }, { since: "2026-01-01" }, { since: at(), until: at(1) }, { until: new Date(now + 1).toISOString() }]) await assert.rejects(f.read({ action: "sessions", purpose: "recall", ...request }), /ISO timestamps/);
    assert.equal((await f.read({ action: "read", purpose: "recall", sessionId: "z-old", query: "OUTSIDE" })).evidence.length, 0);
  } finally { f.cleanup(); }
});

test("history scan/excerpt/output limits and aborts are explicit, and absent discovery never creates directories", async () => {
  const f = fixture(); try {
    const huge = f.session("huge", [entry("huge", null, "x".repeat(HISTORY_LIMITS.fileBytes))]);
    const entries = Array.from({ length: 60 }, (_, i) => entry(`e${i}`, i ? `e${i - 1}` : null, "界".repeat(3000)));
    f.session("many", entries);
    const r = await f.read({ action: "read", purpose: "recall", sessionId: "many" });
    assert.ok(r.evidence.length < 50); assert.ok(r.evidence.every(e => e.excerptTruncated)); assert.ok(Buffer.byteLength(JSON.stringify(r)) <= HISTORY_LIMITS.outputBytes);
    assert.match(r.gaps.join(), /byte limit/); assert.match(r.gaps.join(), /result limit/);
    for (let i = 0; i < 101; i++) f.session(`s${i}`);
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).gaps.join(), /File scan limit/);
    const abort = new AbortController(); abort.abort(); await assert.rejects(readHistory(f.ctx, { action: "sessions", purpose: "recall" }, abort.signal, now), /abort/i);
    const absentAgent = join(f.root, "absent-agent"); const absent = await readHistory({ ...f.ctx, agentDir: absentAgent }, { action: "sessions", purpose: "recall" }, undefined, now);
    assert.match(absent.gaps.join(), /Workspace discovery/); assert.equal(existsSync(absentAgent), false); assert.ok(existsSync(huge));
  } finally { f.cleanup(); }
});

test("history reflection destination validates new/existing overrides and fork; rejects cache/traversal/symlink escapes without writing", async () => {
  const f = fixture(); try {
    for (const scope of ["project", "personal"] as const) {
      const path = scope === "project" ? join(f.cwd, ".pi/skills/mine/SKILL.md") : join(f.agentDir, "skills/mine/SKILL.md");
      assert.deepEqual(await reflectionDestination(f.ctx, path, scope), { destination: path, scope, approvalRequired: true, writes: false });
      assert.equal(existsSync(path), false);
      mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, "existing");
      await reflectionDestination(f.ctx, path, scope); assert.equal(readFileSync(path, "utf8"), "existing");
    }
    await assert.rejects(reflectionDestination(f.ctx, "pstack/skills/reflect/SKILL.md", "development-fork"), /Git checkout/);
    mkdirSync(join(f.cwd, ".git")); assert.equal((await reflectionDestination(f.ctx, "pstack/skills/reflect/SKILL.md", "development-fork")).writes, false);
    await assert.rejects(reflectionDestination(f.ctx, "../other/SKILL.md", "project"), /inside/);
    await assert.rejects(reflectionDestination(f.ctx, "node_modules/pstack/SKILL.md", "development-fork"), /cache/);
    symlinkSync(f.other, join(f.cwd, ".pi/skills/escape")); await assert.rejects(reflectionDestination(f.ctx, ".pi/skills/escape/SKILL.md", "project"), /inside/);
    symlinkSync(join(f.other, "missing"), join(f.cwd, ".pi/skills/dangling")); await assert.rejects(reflectionDestination(f.ctx, ".pi/skills/dangling/SKILL.md", "project"), /Dangling/);
    const cache = join(f.agentDir, "git", "package"); mkdirSync(join(cache, ".git"), { recursive: true });
    await assert.rejects(reflectionDestination({ ...f.ctx, cwd: cache }, "pstack/skills/reflect/SKILL.md", "development-fork"), /cache/);
  } finally { f.cleanup(); }
});

test("history public tools execute through registered extension definitions without enabling mode or writing sessions", async () => {
  const f = fixture(); try {
    const tools = new Map<string, any>();
    pistack({ registerTool: (t: any) => tools.set(t.name, t), on() {}, registerCommand() {} } as any);
    f.manager.appendMessage({ role: "user", content: "actual API fixture", timestamp: Date.now() });
    const before = f.manager.getEntries().length;
    const result = await tools.get("pistack_history").execute("id", { action: "read", purpose: "reflect" }, undefined, undefined, f.ctx);
    assert.equal(result.details.evidence[0].excerpt, "actual API fixture"); assert.equal(f.manager.getEntries().length, before);
    const destination = await tools.get("pistack_reflection_destination").execute("id", { path: ".pi/skills/new/SKILL.md", scope: "project" }, undefined, undefined, f.ctx);
    assert.equal(destination.details.writes, false); assert.equal(existsSync(destination.details.destination), false);
    assert.deepEqual(readdirSync(f.store), []);
  } finally { f.cleanup(); }
});

test("history bounded directory/entry/total-byte scans and symlinked stores report incomplete coverage", async () => {
  const f = fixture(); try {
    f.session("entries", Array.from({ length: HISTORY_LIMITS.entries + 1 }, (_, i) => entry(`e${i}`, i ? `e${i - 1}` : null)));
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).gaps.join(), /entry scan limit/);
    rmSync(join(f.store, "entries.jsonl"));
    for (let i = 0; i < 10; i++) f.session(`bytes${i}`, [entry("a", null, "x".repeat(1900000))]);
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).gaps.join(), /file\/byte limit/);
    for (const file of readdirSync(f.store)) rmSync(join(f.store, file));
    for (let i = 0; i <= HISTORY_LIMITS.directoryEntries; i++) writeFileSync(join(f.store, `${i}.txt`), "");
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).gaps.join(), /Directory entry limit/);
    rmSync(f.store, { recursive: true }); symlinkSync(f.other, f.store);
    assert.match((await f.read({ action: "sessions", purpose: "recall" })).gaps.join(), /Symlinked session directory/);
  } finally { f.cleanup(); }
});

test("history real SDK persisted forks and custom stores are readable without any source writes", async () => {
  const f = fixture(); try {
    const manager = SessionManager.create(f.cwd, f.store);
    manager.appendMessage({ role: "user", content: "real fork source", timestamp: Date.now() });
    const leaf = manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "real fork checkpoint" }], api: "openai-completions", provider: "fixture", model: "fixture", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() } as any);
    const forkPath = manager.createBranchedSession(leaf)!;
    const fork = SessionManager.open(forkPath); const secondPath = fork.createBranchedSession(leaf)!;
    const second = SessionManager.open(secondPath);
    const snapshot = () => readdirSync(f.store).sort().map(name => ({ name, body: readFileSync(join(f.store, name), "utf8"), mtime: statSync(join(f.store, name)).mtimeMs }));
    const before = snapshot();
    const result = await readHistory({ ...f.ctx, sessionManager: manager }, { action: "read", purpose: "recall", sessionId: second.getSessionId(), leafId: leaf });
    assert.equal(result.evidence.length, 2); assert.equal(result.evidence[1].excerpt, "real fork checkpoint");
    assert.match(result.gaps.join(), /workspace provenance verified/);
    const active = await readHistory({ ...f.ctx, sessionManager: second }, { action: "read", purpose: "reflect" });
    assert.equal(active.evidence.length, 2); assert.match(active.gaps.join(), /parent provenance is not verified/);
    assert.deepEqual(snapshot(), before);
  } finally { f.cleanup(); }
});
