import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./fixtures.ts";
import { auditWorktrees, sessionEvidence } from "../pi/lib/worktree-cleanup.mjs";
import { fakeReader, pendingCheck, passingCheck } from "../pstack/skills/poteto-mode/scripts/watch-pr/fakes.test-helper.ts";
import { readSnapshot, runSimple, runQueued, createQueueState, evaluateQueue, applyQueueSnapshot } from "../pstack/skills/poteto-mode/scripts/watch-pr/policy.ts";
import { GhGitHubReader, orderStack } from "../pstack/skills/poteto-mode/scripts/watch-pr/github.ts";
import { parsePrNumber, type ProgressVerdict } from "../pstack/skills/poteto-mode/scripts/watch-pr/types.ts";
const context = { owner: "fixture", repo: "fixture", number: parsePrNumber(1) };
const options = { interval: 1, sweepInterval: 5, timeout: 3, maxQueryErrors: 2, allowDraft: false };
function runtime(reader = fakeReader(), signal?: AbortSignal) {
  let now = 0; const events: ProgressVerdict[] = [];
  return { events, dependencies: { reader, signal, clock: { now: () => now, observedAt: () => new Date(now * 1000).toISOString(), sleep: async (seconds: number) => { now += seconds; signal?.throwIfAborted(); } }, emit: (event: ProgressVerdict) => events.push(event) } };
}

test("watcher stale head/topology and prior passing rollups cannot yield readiness", async () => {
  const base = fakeReader(); let reads = 0;
  const reader = { ...base, pullRequest: async (pr: typeof context) => ({ ...await base.pullRequest(pr), headRefOid: ++reads === 1 ? "head" : "new-head" }) };
  await assert.rejects(readSnapshot({ reader, context, pendingHistory: "include", allowDraft: false }), /changed during observation/);
  await assert.rejects(readSnapshot({ reader: fakeReader({ facts: { headRefOid: "new-head" } }), context, pendingHistory: "include", allowDraft: false }), /Current head/);
  await assert.rejects(readSnapshot({ reader: fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] }), context, pendingHistory: "include", allowDraft: false }), /passing current-head/);
});

test("pending owner gate has head-bound CI proof and reaches non-authorizing READY", async () => {
  const gate = { ...pendingCheck("Code Review Gate"), kind: "code-review-gate" as const, name: "Code Review Gate" as const };
  const reader = () => fakeReader({
    facts: { mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" },
    fastPath: { kind: "checks", checks: [passingCheck(), gate] },
    commitRollups: [{ oid: "head", state: "PENDING" }],
    rollupPages: [{ headRefOid: "head", checks: [passingCheck()], endCursor: "next" }, { headRefOid: "head", checks: [gate], endCursor: null }],
  });
  const snapshot = await readSnapshot({ reader: reader(), context, pendingHistory: "include", allowDraft: false });
  assert.equal(snapshot.kind, "open");
  if (snapshot.kind !== "open") assert.fail("expected open");
  assert.equal(snapshot.ci.kind, "ci-clean"); assert.equal(snapshot.facts.reviewDecision, "REVIEW_REQUIRED");
  const r = runtime(reader());
  const ready = await runSimple({ dependencies: r.dependencies, contexts: [context], mode: "single", statusOnly: false, options });
  assert.equal(ready.kind, "READY");
  if (ready.kind !== "READY" || ready.scope.kind !== "single" || ready.scope.pr.kind !== "ready-pr") assert.fail("expected ready proof");
  assert.equal(ready.scope.pr.proof.mergeAuthorization, false);
  assert.equal(ready.scope.pr.proof.gate.reviewDecision, "REVIEW_REQUIRED");
  assert.equal(ready.scope.pr.proof.ci.github.headRollupState, "PENDING", "do not invent aggregate success");
  assert.ok(r.dependencies.reader.calls.includes("checkRollupPage:next"));
});

test("owner-gate exception refuses stale, missing or non-gate pending head evidence", async () => {
  const gate = { ...pendingCheck("Code Review Gate"), kind: "code-review-gate" as const, name: "Code Review Gate" as const };
  for (const page of [
    { headRefOid: "old-head", checks: [passingCheck(), gate], endCursor: null },
    { headRefOid: null, checks: [passingCheck(), gate], endCursor: null },
    { headRefOid: "head", checks: [passingCheck()], endCursor: null },
    { headRefOid: "head", checks: [passingCheck(), gate, pendingCheck("build")], endCursor: null },
    { headRefOid: "head", checks: [gate, { ...passingCheck("build"), kind: "failed" as const, reportedState: "FAILURE" }], endCursor: null },
    { headRefOid: "head", checks: [], endCursor: null },
  ]) {
    const reader = fakeReader({ fastPath: { kind: "checks", checks: [passingCheck(), gate] }, commitRollups: [{ oid: "head", state: "PENDING" }], rollupPages: [page] });
    await assert.rejects(readSnapshot({ reader, context, pendingHistory: "include", allowDraft: false }), /head|checks/i);
  }
});

test("owner-gate proof rejects unknown aggregates, changed paginated heads and fresh PR drift", async () => {
  const gate = { ...pendingCheck("Code Review Gate"), kind: "code-review-gate" as const, name: "Code Review Gate" as const };
  const base = {
    fastPath: { kind: "checks" as const, checks: [passingCheck(), gate] },
    rollupPages: [{ headRefOid: "head", checks: [passingCheck(), gate], endCursor: null }],
  };
  for (const state of [null, "EXPECTED", "FAILURE", "ERROR"] as const) {
    const reader = fakeReader({ ...base, commitRollups: [{ oid: "head", state }] });
    await assert.rejects(readSnapshot({ reader, context, pendingHistory: "include", allowDraft: false }), /passing current-head/);
    assert.ok(!reader.calls.includes("checkRollupPage:null"));
  }
  for (const second of [{ headRefOid: "old-head", checks: [gate], endCursor: null }, { headRefOid: "head", checks: [gate], endCursor: "next" }]) {
    const reader = fakeReader({ ...base, commitRollups: [{ oid: "head", state: "PENDING" }], rollupPages: [{ headRefOid: "head", checks: [passingCheck()], endCursor: "next" }, second] });
    await assert.rejects(readSnapshot({ reader, context, pendingHistory: "include", allowDraft: false }), /head|cursor/);
  }
  const reader = fakeReader({ ...base, commitRollups: [{ oid: "head", state: "PENDING" }] });
  let reads = 0;
  await assert.rejects(readSnapshot({ reader: { ...reader, pullRequest: async pr => ({ ...await reader.pullRequest(pr), headRefOid: ++reads === 1 ? "head" : "new-head" }) }, context, pendingHistory: "include", allowDraft: false }), /changed during observation/);
});

test("actual GitHub check-page decoder binds head evidence and refuses incomplete or unknown contexts", async () => {
  const f = fixture(), oldPath = process.env.PATH;
  try {
    const response = join(f.root, "rollup.json"), gh = join(f.root, "bin/gh");
    f.write(gh, `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst query = process.argv.find(arg => arg.startsWith('query=')) || '';\nif (!/commit \\{\\s+oid\\s+statusCheckRollup/.test(query)) process.exit(9);\nprocess.stdout.write(fs.readFileSync(${JSON.stringify(response)}, 'utf8'));\n`);
    chmodSync(gh, 0o755); process.env.PATH = `${join(f.root, "bin")}:${oldPath}`;
    const reader = new GhGitHubReader();
    const gate = { __typename: "CheckRun", name: "Code Review Gate", status: "IN_PROGRESS", conclusion: null };
    const writePage = (nodes: unknown[], pageInfo = { hasNextPage: false, endCursor: null }) => f.write(response, { data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: "head", statusCheckRollup: { contexts: { nodes, pageInfo } } } }] } } } } });
    writePage([gate]);
    const page = await reader.checkRollupPage(context, null);
    assert.equal(page.headRefOid, "head"); assert.equal(page.checks[0].kind, "code-review-gate");
    for (const node of [{ __typename: "FutureNode" }, { ...gate, status: "FUTURE_STATE" }, { ...gate, status: null }]) {
      writePage([gate, node]); await assert.rejects(reader.checkRollupPage(context, null), /unknown|status/);
    }
    writePage([gate], { hasNextPage: true, endCursor: null });
    await assert.rejects(reader.checkRollupPage(context, null), /endCursor/);
  } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; f.cleanup(); }
});

test("READY is observed head evidence, never merge authorization; frozen queue waits for actual merges", async () => {
  const r = runtime();
  const ready = await runSimple({ dependencies: r.dependencies, contexts: [context], mode: "single", statusOnly: false, options });
  assert.equal(ready.kind, "READY");
  if (ready.kind !== "READY" || ready.scope.kind !== "single" || ready.scope.pr.kind !== "ready-pr") throw new Error("expected readiness");
  assert.equal(ready.scope.pr.proof.headRefOid, "head"); assert.equal(ready.scope.pr.proof.mergeAuthorization, false);
  const queued = runtime();
  const result = await runQueued({ dependencies: queued.dependencies, contexts: [context], options });
  assert.equal(result.kind, "TIMEOUT");
  assert.equal(queued.events.filter(e => e.kind === "WAITING").length, 1, "deduplicated watcher silence is not success");
  assert.equal(queued.events.some(e => e.kind === "ADVANCE"), false);
  const merged = runtime(fakeReader({ facts: { state: "MERGED", mergedAt: "2026-09-06T00:00:00Z" } }));
  assert.equal((await runQueued({ dependencies: merged.dependencies, contexts: [context], options })).kind, "COMPLETE");
  assert.throws(() => evaluateQueue(createQueueState([context], 0), 1, options), /Incomplete/);
});

test("pending/silent/unavailable status exits timeout or blocker, and status-only is not READY", async () => {
  const pending = runtime(fakeReader({ fastPath: { kind: "checks", checks: [pendingCheck()] } }));
  assert.equal((await runSimple({ dependencies: pending.dependencies, contexts: [context], mode: "single", statusOnly: false, options })).kind, "TIMEOUT");
  const unavailable = runtime(fakeReader({ fastPath: { kind: "checks", checks: [] } }));
  const outcome = await runSimple({ dependencies: unavailable.dependencies, contexts: [context], mode: "single", statusOnly: false, options });
  assert.notEqual(outcome.exitCode, 0);
  const status = runtime();
  assert.equal((await runSimple({ dependencies: status.dependencies, contexts: [context], mode: "single", statusOnly: true, options })).kind, "STATUS");
});

test("pause/cancel aborts the owned watcher continuation without a fresh read or success", async () => {
  for (const mode of ["pause", "cancel"]) {
    const controller = new AbortController(), r = runtime(fakeReader(), controller.signal);
    let sleeps = 0;
    r.dependencies.clock.sleep = async () => { sleeps++; controller.abort(new Error(mode)); controller.signal.throwIfAborted(); };
    await assert.rejects(runQueued({ dependencies: r.dependencies, contexts: [context], options }), new RegExp(mode));
    const reads = r.dependencies.reader.calls.length;
    await Promise.resolve();
    assert.equal(r.dependencies.reader.calls.length, reads); assert.equal(sleeps, 1);
    assert.equal(r.events.some(e => e.kind === "ADVANCE"), false);
    await assert.rejects(runSimple({ dependencies: r.dependencies, contexts: [context], mode: "single", statusOnly: false, options }), new RegExp(mode));
    assert.equal(r.dependencies.reader.calls.length, reads, "already aborted runner must not query");
  }
  const controller = new AbortController(), base = fakeReader();
  const reader = { ...base, pullRequest: async (pr: typeof context) => { const facts = await base.pullRequest(pr); controller.abort(new Error("pause during read")); return facts; } };
  await assert.rejects(readSnapshot({ reader, context, pendingHistory: "include", allowDraft: false, signal: controller.signal }), /pause during read/);
  assert.deepEqual(base.calls, ["pullRequest"]);
});

test("actual GitHub reader cancellation settles only its spawned fixture command", async () => {
  const f = fixture(), controller = new AbortController(), oldPath = process.env.PATH;
  const started = join(f.root, "started"), stopped = join(f.root, "stopped"), bin = join(f.root, "bin"), gh = join(bin, "gh");
  f.write(gh, `#!/usr/bin/env node\nconst fs = require('node:fs');\nprocess.once('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(stopped)}, 'settled'); process.exit(0); });\nfs.writeFileSync(${JSON.stringify(started)}, 'started');\nsetInterval(() => {}, 1000);\n`);
  chmodSync(gh, 0o755); process.env.PATH = `${bin}:${oldPath}`;
  const wait = async (path: string) => { for (let i = 0; i < 100 && !existsSync(path); i++) await new Promise(resolve => setTimeout(resolve, 10)); assert.ok(existsSync(path), path); };
  try {
    const reader = new GhGitHubReader(controller.signal);
    const query = reader.pullRequest(context);
    const rejected = assert.rejects(query, /abort/i);
    await wait(started); controller.abort(); await rejected;
    assert.equal(readFileSync(stopped, "utf8"), "settled", "owned process closed before read cancellation settled");
  } finally { controller.abort(); if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; f.cleanup(); }
});

test("frozen watcher queue rejects retarget drift and exposes a new head rather than reusing an old wait", async () => {
  const snapshot = await readSnapshot({ reader: fakeReader(), context, pendingHistory: "omit", allowDraft: false });
  let state = applyQueueSnapshot(createQueueState([context], 0), snapshot, 0, options).state;
  const wait = evaluateQueue(state, 0, options); assert.equal(wait.kind, "waiting");
  state = { ...wait.state, work: { kind: "frontier-poll", frontier: context } };
  const newHead = { ...snapshot, facts: { ...snapshot.facts, headRefOid: "new-head" } };
  const updated = applyQueueSnapshot(state, newHead, 1, options).state;
  const newWait = evaluateQueue(updated, 1, options);
  assert.equal(newWait.kind, "waiting"); if (newWait.kind === "waiting") assert.equal(newWait.emit, true);
  assert.throws(() => applyQueueSnapshot(state, { ...snapshot, facts: { ...snapshot.facts, baseRefName: "unrelated" } }, 1, options), /topology changed/);
  assert.throws(() => createQueueState([context, context], 0), /unique/);
});

test("stack discovery fails closed on cycles and ambiguous branches", () => {
  const one = { number: parsePrNumber(1), headRefName: "a", baseRefName: "b" }, two = { number: parsePrNumber(2), headRefName: "b", baseRefName: "a" };
  assert.throws(() => orderStack(context, [one, two]), /cyclic/);
  assert.throws(() => orderStack(context, [{ ...one, baseRefName: "main" }, two, { ...two, number: parsePrNumber(3), headRefName: "c" }]), /ambiguous/);
});

function cleanupFixture() {
  const f = fixture(), repo = realpathSync(f.paths.cwd);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-C", cwd, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(repo, "init", "--initial-branch=main"); git(repo, "config", "user.name", "Fixture"); git(repo, "config", "user.email", "fixture@example.invalid");
  f.write(join(repo, "tracked"), "preserved\n"); git(repo, "add", "tracked"); git(repo, "commit", "-m", "fixture");
  const path = join(realpathSync(f.root), "owned worktree"), foreign = join(realpathSync(f.root), "unrelated");
  git(repo, "worktree", "add", "-b", "owned", path); git(repo, "worktree", "add", "-b", "unrelated", foreign);
  const now = Date.now(), timestamp = new Date(now).toISOString(), sessionFile = join(f.root, "session.jsonl");
  const transcript = [{ type: "session", version: 3, id: "session", cwd: path, timestamp },
    { type: "message", id: "root", parentId: null, timestamp, message: { role: "user", content: "checkpoint" } },
    { type: "message", id: "selected", parentId: "root", timestamp, message: { role: "assistant", stopReason: "stop", content: [] } },
    { type: "custom", id: "alternate", parentId: "root", timestamp, customType: "unrelated", data: {} }];
  f.write(sessionFile, transcript.map(row => JSON.stringify(row)).join("\n") + "\n");
  const preserved = (name: string) => { const file = join(f.root, name); f.write(file, `fixture native evidence ${name}`); return { path: file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }; };
  const owner = { path, runId: "native-run-1", head: git(path, "rev-parse", "HEAD"), branch: "refs/heads/owned", state: "settled", sessionId: "session", leafId: "selected", sessionFile, statusEvidence: preserved("native-status.txt"), checkpoint: preserved("checkpoint.patch") };
  const evidence = { version: 1, repo, taskId: "task-1", observedAt: timestamp, worktrees: [owner] };
  const run = (cmd: string, args: string[], cwd: string) => cmd === "lsof" ? { status: 1, stdout: "", stderr: "" } : spawnSync(cmd, args, { cwd, env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8" });
  return { ...f, repo, path, foreign, owner, evidence, transcript, now, git, run };
}

test("portable audit uses exact Pi branch/native ownership evidence and never authorizes unrelated deletion", () => {
  const f = cleanupFixture(); try {
    const before = readFileSync(f.owner.sessionFile);
    const report = auditWorktrees(f.repo, f.evidence, { run: f.run, now: f.now });
    const owned = report.rows.find((row: { path: string }) => row.path === f.path)!;
    assert.equal(owned.bucket, "review-owned", JSON.stringify(owned)); assert.equal(owned.session.entries, 2);
    assert.equal(owned.deletionAuthorized, false);
    assert.equal(report.rows.find((row: { path: string }) => row.path === f.foreign)?.bucket, "hold");
    assert.ok(existsSync(f.foreign)); assert.deepEqual(readFileSync(f.owner.sessionFile), before);
    assert.equal(f.git(f.path, "status", "--porcelain"), "");
    assert.match(sessionEvidence(f.owner.sessionFile, f.owner).limitation, /do not prove native run settlement/);
    const envelope = join(f.root, "audit-input.json"); f.write(envelope, f.evidence);
    const cli = JSON.parse(execFileSync("bash", ["pstack/skills/poteto-mode/scripts/worktree-audit.sh", f.repo, envelope], { encoding: "utf8" }));
    assert.ok(cli.rows.every((row: { deletionAuthorized: boolean }) => row.deletionAuthorized === false));
    assert.equal(cli.rows.find((row: { path: string }) => row.path === f.foreign).bucket, "hold");
    assert.ok(existsSync(f.path)); assert.ok(existsSync(f.foreign));
    assert.deepEqual(readFileSync(f.owner.sessionFile), before);
  } finally { f.cleanup(); }
});

test("cleanup holds stale/unknown/live/native mismatch, changed receipts and missing process capability", () => {
  const f = cleanupFixture(); try {
    const check = (evidence: unknown, run = f.run) => auditWorktrees(f.repo, evidence, { run, now: f.now }).rows.find((row: { path: string }) => row.path === f.path)!;
    for (const owner of [{ ...f.owner, state: "running" }, { ...f.owner, path: `${f.path}-other` }, { ...f.owner, head: "changed" }, { ...f.owner, leafId: "missing" }, { ...f.owner, sessionId: "foreign" }, { ...f.owner, checkpoint: { ...f.owner.checkpoint, sha256: "0".repeat(64) } }])
      assert.equal(check({ ...f.evidence, worktrees: [owner] }).bucket, "hold");
    assert.equal(check({ ...f.evidence, observedAt: new Date(f.now - 300001).toISOString() }).bucket, "hold");
    assert.equal(check({ ...f.evidence, worktrees: [f.owner, f.owner] }).bucket, "hold");
    for (const result of [{ status: 1, stdout: "", stderr: "permission denied" }, { status: 0, stdout: "p123\nnfile", stderr: "" }, { status: null, stdout: "", stderr: "", error: new Error("ENOENT") }])
      assert.equal(check(f.evidence, (cmd, args, cwd) => cmd === "lsof" ? result : f.run(cmd, args, cwd)).bucket, "hold");
  } finally { f.cleanup(); }
});

test("cleanup preserves tracked/untracked/ignored work and malformed transcript evidence", () => {
  const f = cleanupFixture(); try {
    const check = () => auditWorktrees(f.repo, f.evidence, { run: f.run, now: f.now }).rows.find((row: { path: string }) => row.path === f.path)!;
    f.write(join(f.path, "tracked"), "dirty"); assert.equal(check().bucket, "hold"); f.write(join(f.path, "tracked"), "preserved\n");
    f.write(join(f.path, "scratch"), "untracked"); assert.equal(check().bucket, "hold");
    f.write(join(f.repo, ".git/info/exclude"), "scratch\n"); assert.equal(check().bucket, "hold"); assert.ok(existsSync(join(f.path, "scratch")));
    f.write(f.owner.sessionFile, "not JSON\n"); assert.throws(() => sessionEvidence(f.owner.sessionFile, f.owner));
  } finally { f.cleanup(); }
});

test("native notifications remain the only child wakeup; pause guidance is not a second goal executor", () => {
  const runtime = readFileSync("pi/references/runtime.md", "utf8"), extension = readFileSync("pi/extensions/pistack.ts", "utf8");
  for (const phrase of ["Native pi-subagents completion notifications", "sole explicit autonomous continuation owner", "/goal pause", "Keep unrelated/shared workers", "Mode on never creates a goal"]) assert.ok(runtime.includes(phrase), phrase);
  assert.doesNotMatch(extension, /setInterval|create_goal\(|update_goal\(|worktree\.cleanup/);
  const audit = readFileSync("pi/lib/worktree-cleanup.mjs", "utf8");
  assert.doesNotMatch(audit, /unlinkSync|rmSync|process\.kill|git fetch|worktree", "remove/);
});
