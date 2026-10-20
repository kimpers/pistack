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
    assert.equal(report.base, null);
    assert.ok(report.rows.every((row: { ancestry: string }) => row.ancestry === "not-requested"));
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

function assertAuditCommands(calls: { cmd: string; args: string[] }[]) {
  assert.ok(calls.some(call => call.cmd === "git" && call.args[2] === "worktree"));
  for (const { cmd, args } of calls) {
    assert.ok(["git", "lsof"].includes(cmd), cmd);
    assert.ok(!args.some(arg => /^(fetch|pull|push|remove|prune|delete|kill|--delete|--force|-D)$/.test(arg)), JSON.stringify(args));
    if (cmd === "git") assert.ok(["rev-parse", "worktree", "merge-base", "symbolic-ref", "status"].includes(args[2]), JSON.stringify(args));
    if (args[2] === "worktree") assert.deepEqual(args.slice(2), ["worktree", "list", "--porcelain", "-z"]);
  }
}

function auditBaseFixture() {
  const f = cleanupFixture();
  f.write(join(f.path, "tracked"), "owned commit\n");
  f.git(f.path, "commit", "-am", "owned change");
  f.owner.head = f.git(f.path, "rev-parse", "HEAD");
  f.git(f.repo, "branch", "integration", f.owner.head);
  const calls: { cmd: string; args: string[] }[] = [];
  const run: typeof f.run = (cmd, args, cwd) => { calls.push({ cmd, args }); return f.run(cmd, args, cwd); };
  return { ...f, calls, run };
}

test("audit explicit local base differs from main and ancestry never grants deletion", () => {
  const f = auditBaseFixture(); try {
    const selected = auditWorktrees(f.repo, f.evidence, { baseRef: "integration", run: f.run, now: f.now });
    assert.deepEqual(selected.base, { ref: "integration", sha: f.owner.head });
    const owned = selected.rows.find((row: { path: string }) => row.path === f.path);
    assert.equal(owned.ancestry, "ancestor"); assert.equal(owned.bucket, "review-owned");
    assert.equal(owned.session.entries, 2); assert.equal(owned.runId, "native-run-1");
    assert.ok(selected.rows.every((row: { ancestry: string; deletionAuthorized: boolean }) => row.ancestry === "ancestor" && row.deletionAuthorized === false));
    assert.equal(selected.rows.find((row: { path: string }) => row.path === f.foreign).bucket, "hold");
    const main = auditWorktrees(f.repo, f.evidence, { baseRef: "main", run: f.run, now: f.now });
    const unmerged = main.rows.find((row: { path: string }) => row.path === f.path);
    assert.equal(unmerged.ancestry, "not-ancestor"); assert.equal(unmerged.bucket, "review-owned");
    assert.equal(unmerged.deletionAuthorized, false);
    const beforeOmitted = f.calls.length;
    const omitted = auditWorktrees(f.repo, f.evidence, { run: f.run, now: f.now });
    assert.equal(omitted.base, null);
    assert.ok(omitted.rows.every((row: { ancestry: string }) => row.ancestry === "not-requested"));
    assert.ok(f.calls.slice(beforeOmitted).every(call => call.args[2] !== "merge-base" && !call.args.includes("--verify")));
    assertAuditCommands(f.calls);
  } finally { f.cleanup(); }
});

test("audit rejects missing and noncommit local bases before inventory", () => {
  const f = auditBaseFixture(); try {
    const blob = f.git(f.repo, "rev-parse", "HEAD:tracked"), tree = f.git(f.repo, "rev-parse", "HEAD^{tree}");
    for (const baseRef of ["missing", "origin/missing", blob, tree, "", "--all", "main\0other"]) {
      f.calls.length = 0;
      assert.throws(() => auditWorktrees(f.repo, f.evidence, { baseRef, run: f.run, now: f.now }), /base/i, baseRef);
      assert.ok(f.calls.every(call => call.cmd === "git" && call.args[2] === "rev-parse"), JSON.stringify(f.calls));
    }
    for (const result of [
      { status: 128, stdout: "", stderr: "missing" },
      { status: 0, stdout: `${f.owner.head}\n`, stderr: "warning" },
      { status: 0, stdout: "not-a-sha\n", stderr: "" },
      { status: 0, stdout: `${f.owner.head}\n${f.owner.head}\n`, stderr: "" },
      { status: null, stdout: "", stderr: "", error: new Error("ENOENT") },
    ]) {
      assert.throws(() => auditWorktrees(f.repo, f.evidence, { baseRef: "integration", now: f.now,
        run: () => result }), /base/i);
    }
  } finally { f.cleanup(); }
});

test("audit freezes the resolved commit once even if the input branch moves", () => {
  const f = auditBaseFixture(); try {
    const report = auditWorktrees(f.repo, f.evidence, { baseRef: "integration", now: f.now,
      run: (cmd: string, args: string[], cwd: string) => {
        if (args[2] === "worktree") f.git(f.repo, "branch", "-f", "integration", "main");
        return f.run(cmd, args, cwd);
      } });
    assert.deepEqual(report.base, { ref: "integration", sha: f.owner.head });
    assert.notEqual(f.git(f.repo, "rev-parse", "integration"), f.owner.head);
    assert.equal(report.rows.find((row: { path: string }) => row.path === f.path).ancestry, "ancestor");
    const resolutions = f.calls.filter(call => call.args.includes("--verify"));
    assert.deepEqual(resolutions, [{ cmd: "git", args: ["-C", f.repo, "rev-parse", "--verify", "--end-of-options", "integration^{commit}"] }]);
    assert.deepEqual(f.calls.filter(call => call.args[2] === "merge-base").map(call => call.args),
      report.rows.map((row: { head: string }) => ["-C", f.repo, "merge-base", "--is-ancestor", row.head, f.owner.head]));
    assertAuditCommands(f.calls);
  } finally { f.cleanup(); }
});

test("audit ancestry command failures are unknown and held, not false", () => {
  const f = auditBaseFixture(); try {
    const failures = [
      { status: 128, stdout: "", stderr: "missing object" },
      { status: 2, stdout: "", stderr: "" },
      { status: 1, stdout: "", stderr: "permission denied" },
      { status: 0, stdout: "", stderr: "warning" },
      { status: 0, stdout: "unexpected", stderr: "" },
      { status: null, stdout: "", stderr: "", error: new Error("ENOENT") },
      { status: null, stdout: "", stderr: "", signal: "SIGTERM" },
    ];
    for (const failure of failures) {
      const report = auditWorktrees(f.repo, f.evidence, { baseRef: "integration", now: f.now,
        run: (cmd: string, args: string[], cwd: string) => {
          const result = f.run(cmd, args, cwd);
          return args[2] === "merge-base" && args[4] === f.owner.head ? failure : result;
        } });
      const owned = report.rows.find((row: { path: string }) => row.path === f.path);
      assert.equal(owned.ancestry, "unknown"); assert.equal(owned.bucket, "hold");
      assert.match(owned.reasons.join("\n"), /ancestry.*unknown/i);
      assert.equal(owned.session.entries, 2, "ancestry failure must not skip ownership evidence");
      assert.equal(owned.deletionAuthorized, false);
      assert.equal(report.rows.find((row: { path: string }) => row.path === f.foreign).ancestry, "ancestor");
    }
    const thrown = auditWorktrees(f.repo, f.evidence, { baseRef: "integration", now: f.now,
      run: (cmd: string, args: string[], cwd: string) => {
        if (args[2] === "merge-base") throw new Error("injected command failure");
        return f.run(cmd, args, cwd);
      } });
    assert.ok(thrown.rows.every((row: { ancestry: string; bucket: string }) => row.ancestry === "unknown" && row.bucket === "hold"));
    assertAuditCommands(f.calls);
  } finally { f.cleanup(); }
});

test("audit ancestry remains independent of ownership, ignored files and changed receipts", () => {
  const f = auditBaseFixture(); try {
    f.write(join(f.repo, ".git/info/exclude"), "scratch\n"); f.write(join(f.path, "scratch"), "preserve me");
    f.write(f.owner.checkpoint.path, "changed receipt");
    const report = auditWorktrees(f.repo, f.evidence, { baseRef: "integration", run: f.run, now: f.now });
    const owned = report.rows.find((row: { path: string }) => row.path === f.path);
    assert.equal(owned.ancestry, "ancestor"); assert.equal(owned.bucket, "hold");
    assert.match(owned.reasons.join("\n"), /ignored/); assert.match(owned.reasons.join("\n"), /hash changed/);
    assert.ok(report.rows.every((row: { ancestry: string; deletionAuthorized: boolean }) => row.ancestry === "ancestor" && row.deletionAuthorized === false));
    const stale = auditWorktrees(f.repo, { ...f.evidence, observedAt: new Date(f.now - 300001).toISOString() }, { baseRef: "main", run: f.run, now: f.now });
    const staleOwned = stale.rows.find((row: { path: string }) => row.path === f.path);
    assert.equal(staleOwned.ancestry, "not-ancestor"); assert.equal(staleOwned.bucket, "hold");
    assert.equal(readFileSync(join(f.path, "scratch"), "utf8"), "preserve me");
    assertAuditCommands(f.calls);
  } finally { f.cleanup(); }
});

test("audit CLI accepts only the documented optional base and blocks invalid refs", () => {
  const f = auditBaseFixture(); try {
    const envelope = join(f.root, "audit-input.json"); f.write(envelope, f.evidence);
    const cli = (...args: string[]) => spawnSync("bash", ["pstack/skills/poteto-mode/scripts/worktree-audit.sh", ...args], { encoding: "utf8" });
    for (const baseRef of ["integration", f.owner.head]) {
      const result = cli("--base", baseRef, f.repo, envelope);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.base, { ref: baseRef, sha: f.owner.head });
      assert.equal(report.rows.find((row: { path: string }) => row.path === f.path).ancestry, "ancestor");
      assert.ok(report.rows.every((row: { deletionAuthorized: boolean }) => row.deletionAuthorized === false));
    }
    for (const args of [[], [f.repo], [f.repo, envelope, "extra"], ["--base"], ["--base", "integration", f.repo],
      ["--base", "", f.repo, envelope], ["--base", "--help", f.repo, envelope], ["--base", "main", "--base", "integration", f.repo, envelope],
      ["--unknown", f.repo, envelope], ["-b", "integration", f.repo, envelope], [f.repo, envelope, "--help"], [f.repo, envelope, "--base", "main"]]) {
      const result = cli(...args); assert.equal(result.status, 2, JSON.stringify({ args, result }));
      assert.match(result.stdout + result.stderr, /Usage: worktree-audit.sh \[--base REF\]/);
    }
    const help = cli("--help"); assert.equal(help.status, 0); assert.match(help.stdout, /local.*commit/i);
    for (const baseRef of ["missing", f.git(f.repo, "rev-parse", "HEAD:tracked")]) {
      const result = cli("--base", baseRef, f.repo, envelope);
      assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /Audit blocked:.*base/i);
    }
    assert.ok(existsSync(f.path)); assert.ok(existsSync(f.foreign));
  } finally { f.cleanup(); }
});

test("native notifications remain the only child wakeup; pause guidance is not a second goal executor", () => {
  const runtime = readFileSync("pi/references/runtime.md", "utf8"), extension = readFileSync("pi/extensions/pistack.ts", "utf8");
  for (const phrase of ["Native pi-subagents completion notifications", "sole explicit autonomous continuation owner", "/goal pause", "Keep unrelated/shared workers", "Mode on never creates a goal"]) assert.ok(runtime.includes(phrase), phrase);
  assert.doesNotMatch(extension, /setInterval|create_goal\(|update_goal\(|worktree\.cleanup/);
  const audit = readFileSync("pi/lib/worktree-cleanup.mjs", "utf8");
  assert.doesNotMatch(audit, /unlinkSync|rmSync|process\.kill|git fetch|worktree", "remove/);
});

function reviewPage(pageInfo: unknown, nodes: unknown[] = []) {
  return { data: { repository: { pullRequest: { reviewThreads: { nodes, pageInfo } } } } };
}

function reviewGhFixture() {
  const f = fixture(), oldPath = process.env.PATH;
  const gh = join(f.root, "bin/gh"), input = join(f.root, "input.json"), calls = join(f.root, "calls.jsonl");
  const started = join(f.root, "started"), stopping = join(f.root, "stopping"), stopped = join(f.root, "stopped");
  f.write(calls, "");
  f.write(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const input = JSON.parse(fs.readFileSync(${JSON.stringify(input)}, 'utf8'));
const query = args.find(arg => arg.startsWith('query=')) || '';
if (args[0] === 'pr' && args[1] === 'view') {
  const views = fs.readFileSync(${JSON.stringify(calls)}, 'utf8').trim().split('\\n').map(JSON.parse).filter(row => row[0] === 'pr' && row[1] === 'view').length;
  process.stdout.write(JSON.stringify(views > 1 && input.freshFacts ? input.freshFacts : input.facts));
} else if (args[0] === 'pr' && args[1] === 'checks') {
  process.stdout.write(JSON.stringify(input.fastChecks ?? [{name:'ci',state:'SUCCESS',bucket:'pass'}]));
  process.exit(input.fastExit ?? 0);
} else if (query.includes('query ReviewThreads')) {
  if (!query.includes('reviewThreads(first: 100, after: $after)') || !query.includes('pageInfo')) process.exit(9);
  const cursor = args.find(arg => arg.startsWith('after='));
  if (cursor && input.hang) {
    process.once('SIGTERM', () => {
      fs.writeFileSync(${JSON.stringify(stopping)}, 'stopping');
      setTimeout(() => { fs.writeFileSync(${JSON.stringify(stopped)}, 'settled'); process.exit(0); }, 150);
    });
    fs.writeFileSync(${JSON.stringify(started)}, 'started');
    setInterval(() => {}, 1000);
  } else {
    if (cursor && cursor !== 'after=next') process.exit(10);
    process.stdout.write(JSON.stringify(cursor ? input.second : input.first));
  }
} else if (query.includes('query PrCheckRollup')) {
  const cursor = args.find(arg => arg.startsWith('after='));
  if (cursor && input.hangChecks) {
    process.once('SIGTERM', () => {
      fs.writeFileSync(${JSON.stringify(stopping)}, 'stopping');
      setTimeout(() => { fs.writeFileSync(${JSON.stringify(stopped)}, 'settled'); process.exit(0); }, 150);
    });
    fs.writeFileSync(${JSON.stringify(started)}, 'started');
    setInterval(() => {}, 1000);
  } else {
    if (cursor && cursor !== 'after=next') process.exit(10);
    process.stdout.write(JSON.stringify(cursor ? input.checkSecond : input.checkFirst));
  }
} else if (query.includes('query PrCommitStatuses')) {
  process.stdout.write(JSON.stringify({data:{repository:{pullRequest:{commits:{nodes:input.commits ?? [{commit:{oid:'head',statusCheckRollup:{state:'SUCCESS'}}}]}}}}}));
} else process.exit(11);
`);
  chmodSync(gh, 0o755);
  process.env.PATH = `${join(f.root, "bin")}:${oldPath}`;
  return { ...f, input, calls, started, stopping, stopped,
    commands: (): string[][] => readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)),
    cleanup: () => { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; f.cleanup(); },
  };
}

test("actual GitHub review pages block later threads and malformed later pagination without READY", async () => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    const first = reviewPage({ hasNextPage: true, endCursor: "next" }, [{ id: "resolved", isResolved: true, comments: { nodes: [] } }]);
    for (const scenario of [
      { second: reviewPage({ hasNextPage: false, endCursor: null }, [{ id: "late", isResolved: false, comments: { nodes: [] } }]), exit: 3, diagnostic: "review-threads" },
      { second: reviewPage(undefined), exit: 7, diagnostic: "pageInfo" },
      { second: reviewPage({ hasNextPage: true, endCursor: null }), exit: 7, diagnostic: "endCursor" },
      { second: reviewPage({ hasNextPage: true, endCursor: "" }), exit: 7, diagnostic: "endCursor" },
      { second: reviewPage({ hasNextPage: "false", endCursor: null }), exit: 7, diagnostic: "hasNextPage" },
      { second: reviewPage({ hasNextPage: true, endCursor: "next" }), exit: 7, diagnostic: "repeated a cursor" },
    ]) {
      f.write(f.calls, ""); f.write(f.input, { facts, first, second: scenario.second });
      const r = runtime();
      const result = await runSimple({ dependencies: { ...r.dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
      assert.equal(result.kind, "BLOCKER"); assert.equal(result.exitCode, scenario.exit);
      assert.match(JSON.stringify(result), new RegExp(scenario.diagnostic));
      if (scenario.exit === 3) {
        assert.match(JSON.stringify(result), /"id":"late"/);
        assert.equal(f.commands().length, 6);
      } else assert.equal(f.commands().length, 3, "no checks query after invalid second page");
      const pages = f.commands().filter(args => args.some(arg => arg.includes("query ReviewThreads")));
      assert.equal(pages.length, 2);
      assert.deepEqual(pages[0].slice(-6), ["-f", "owner=fixture", "-f", "repo=fixture", "-F", "pr=1"]);
      assert.deepEqual(pages[1].slice(-2), ["-f", "after=next"]);
    }
  } finally { f.cleanup(); }
});

test("actual paginated GitHub cancellation waits for subprocess close and never queries checks or returns READY", async () => {
  const f = reviewGhFixture(), controller = new AbortController();
  const wait = async (path: string) => {
    for (let i = 0; i < 200 && !existsSync(path); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(path), path);
  };
  let settled = false;
  try {
    f.write(f.input, {
      facts: await fakeReader().pullRequest(context),
      first: reviewPage({ hasNextPage: true, endCursor: "next" }), hang: true,
    });
    const reader = new GhGitHubReader(controller.signal), r = runtime();
    const running = runSimple({ dependencies: { ...r.dependencies, reader, signal: controller.signal }, contexts: [context], mode: "single", statusOnly: false, options });
    running.then(() => { settled = true; }, () => { settled = true; });
    const rejected = assert.rejects(running, /abort/i);
    await wait(f.started); controller.abort(); await wait(f.stopping);
    assert.equal(settled, false, "SIGTERM notification is not subprocess settlement");
    await rejected;
    assert.equal(readFileSync(f.stopped, "utf8"), "settled");
    assert.equal(settled, true);
    assert.equal(f.commands().length, 3);
    assert.deepEqual(f.commands()[2].slice(-2), ["-f", "after=next"]);
    assert.deepEqual(r.events, []);
    await assert.rejects(reader.reviewThreadPage(context, "next"), /abort/i);
    assert.equal(f.commands().length, 3, "aborted reader must not spawn another query");
  } finally { controller.abort(); f.cleanup(); }
});

function checkPage(nodes: unknown[], pageInfo: unknown = { hasNextPage: false, endCursor: null }, oid = "head") {
  return { data: { repository: { pullRequest: { commits: { nodes: [{ commit: {
    oid, statusCheckRollup: { contexts: { nodes, pageInfo } },
  } }] } } } } };
}

const actionRequiredGate = { name: "Code Review Gate", state: "ACTION_REQUIRED", bucket: "fail" };
const ownerGateNode = { __typename: "CheckRun", name: "Code Review Gate", status: "COMPLETED", conclusion: "ACTION_REQUIRED" };
const passingNode = { __typename: "CheckRun", name: "ci", status: "COMPLETED", conclusion: "SUCCESS" };

test("actual ACTION_REQUIRED reader-to-policy aggregate acceptance matrix", async (t) => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    for (const path of ["fast", "graphql"]) {
      for (const mergeStateStatus of ["CLEAN", "BLOCKED", "UNKNOWN", "UNSTABLE"]) {
        for (const state of ["SUCCESS", "PENDING", "FAILURE", "ERROR", "EXPECTED", null, "FUTURE_VALUE"]) {
          await t.test(`${path} ${mergeStateStatus} aggregate ${state}`, async () => {
            f.write(f.calls, "");
            f.write(f.input, {
              facts: { ...facts, mergeStateStatus, reviewDecision: "REVIEW_REQUIRED" },
              first: reviewPage({ hasNextPage: false, endCursor: null }),
              fastChecks: path === "fast" ? [actionRequiredGate] : [], fastExit: 1,
              commits: [{ commit: { oid: "head", statusCheckRollup: state === null ? null : { state } } }],
              checkFirst: checkPage([passingNode], { hasNextPage: true, endCursor: "next" }),
              checkSecond: checkPage([ownerGateNode, { ...passingNode, name: "optional", conclusion: "SKIPPED" }]),
            });
            const r = runtime();
            const result = await runSimple({ dependencies: { ...r.dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
            if (state === "SUCCESS" || state === "PENDING") {
              assert.equal(result.kind, "READY");
              if (result.kind !== "READY" || result.scope.kind !== "single" || result.scope.pr.kind !== "ready-pr") assert.fail("expected open-PR proof");
              assert.equal(result.scope.pr.proof.mergeAuthorization, false);
              assert.equal(result.scope.pr.proof.headRefOid, "head");
              assert.equal(result.scope.pr.proof.ci.github.headRollupState, state);
              assert.ok(result.scope.pr.proof.ci.all.some(check => check.kind === "code-review-gate" && check.reportedState === "ACTION_REQUIRED"));
              if (state === "PENDING") {
                assert.equal(result.scope.pr.proof.ci.source, "graphql-rollup");
                assert.ok(f.commands().some(args => args.includes("after=next")));
              }
            } else {
              assert.equal(result.kind, "BLOCKER");
              assert.notEqual(result.exitCode, 0);
            }
          });
        }
      }
    }
  } finally { f.cleanup(); }
});

test("actual ACTION_REQUIRED proof rejects incomplete checks and preserves normal readiness gates", async (t) => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    const base = {
      facts, first: reviewPage({ hasNextPage: false, endCursor: null }),
      fastChecks: [actionRequiredGate], fastExit: 1,
      commits: [{ commit: { oid: "head", statusCheckRollup: { state: "PENDING" } } }],
      checkFirst: checkPage([ownerGateNode], { hasNextPage: true, endCursor: "next" }),
      checkSecond: checkPage([passingNode]),
    };
    const cases = [
      { name: "missing aggregate", change: { commits: [] } },
      { name: "prior passing head only", change: { commits: [{ commit: { oid: "old-head", statusCheckRollup: { state: "SUCCESS" } } }] } },
      ...["FAILURE", "CANCELLED", "FUTURE_VALUE", "ACTION_REQUIRED"].map(conclusion => ({
        name: `later non-gate ${conclusion}`, change: { checkSecond: checkPage([{ ...passingNode, conclusion }]) },
      })),
      { name: "later non-gate pending", change: { checkSecond: checkPage([{ ...passingNode, status: "IN_PROGRESS", conclusion: null }]) } },
      { name: "unknown context", change: { checkSecond: checkPage([{ __typename: "FutureNode" }]) } },
      { name: "changed page head", change: { checkSecond: checkPage([passingNode], { hasNextPage: false, endCursor: null }, "new-head") } },
      { name: "changed final PR head", change: { freshFacts: { ...facts, headRefOid: "new-head" } } },
      { name: "null pageInfo", change: { checkSecond: checkPage([passingNode], null) } },
      { name: "nonboolean hasNextPage", change: { checkSecond: checkPage([passingNode], { hasNextPage: "false", endCursor: null }) } },
      { name: "missing next cursor", change: { checkSecond: checkPage([passingNode], { hasNextPage: true, endCursor: null }) } },
      { name: "cursor cycle", change: { checkSecond: checkPage([passingNode], { hasNextPage: true, endCursor: "next" }) } },
      { name: "no owner gate in complete pages", change: { checkFirst: checkPage([passingNode]) } },
      { name: "empty complete pages", change: { checkFirst: checkPage([]) } },
      ...["SUCCESS", "PENDING"].flatMap(state => [
        { name: `${state} draft`, change: { facts: { ...facts, isDraft: true }, commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] } },
        { name: `${state} changes requested`, change: { facts: { ...facts, reviewDecision: "CHANGES_REQUESTED" }, commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] } },
        { name: `${state} conflict`, change: { facts: { ...facts, mergeable: "CONFLICTING" }, commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] } },
        { name: `${state} unresolved review`, change: { first: reviewPage({ hasNextPage: false, endCursor: null }, [{ id: "unresolved", isResolved: false, comments: { nodes: [] } }]), commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] } },
        ...["FAILURE", "CANCELLED", "FUTURE_VALUE", "ACTION_REQUIRED"].map(checkState => ({
          name: `${state} fast non-gate ${checkState}`, change: { fastChecks: [actionRequiredGate, { name: "build", state: checkState, bucket: "fail" }], commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] },
        })),
      ]),
    ];
    for (const { name, change } of cases) await t.test(name, async () => {
      f.write(f.calls, ""); f.write(f.input, { ...base, ...change });
      const r = runtime();
      const result = await runSimple({ dependencies: { ...r.dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
      assert.equal(result.kind, "BLOCKER"); assert.notEqual(result.exitCode, 0);
    });
    for (const state of ["SUCCESS", "PENDING"]) await t.test(`${state} fast non-gate pending`, async () => {
      f.write(f.input, { ...base, fastChecks: [actionRequiredGate, { name: "build", state: "PENDING", bucket: "pending" }], commits: [{ commit: { oid: "head", statusCheckRollup: { state } } }] });
      const r = runtime();
      const result = await runSimple({ dependencies: { ...r.dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options });
      assert.equal(result.kind, "TIMEOUT"); assert.equal(result.exitCode, 5);
    });
  } finally { f.cleanup(); }
});

test("actual ACTION_REQUIRED queue waits for merge evidence", async () => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    const input = {
      facts, first: reviewPage({ hasNextPage: false, endCursor: null }),
      fastChecks: [actionRequiredGate], fastExit: 1,
      commits: [{ commit: { oid: "head", statusCheckRollup: { state: "PENDING" } } }],
      checkFirst: checkPage([ownerGateNode, passingNode]),
    };
    f.write(f.input, input);
    const r = runtime();
    const result = await runQueued({ dependencies: { ...r.dependencies, reader: new GhGitHubReader() }, contexts: [context], options });
    assert.equal(result.kind, "TIMEOUT");
    assert.equal(r.events.filter(event => event.kind === "WAITING").length, 1);
    assert.equal(r.events.some(event => event.kind === "ADVANCE"), false);
    f.write(f.input, { ...input, facts: { ...facts, state: "MERGED", mergedAt: "2026-09-06T00:00:00Z" } });
    const merged = await runQueued({ dependencies: { ...runtime().dependencies, reader: new GhGitHubReader() }, contexts: [context], options });
    assert.equal(merged.kind, "COMPLETE");
  } finally { f.cleanup(); }
});

test("actual ACTION_REQUIRED cancellation settles the owned check-page command without READY", async () => {
  const f = reviewGhFixture(), controller = new AbortController();
  try {
    f.write(f.input, {
      facts: await fakeReader().pullRequest(context), first: reviewPage({ hasNextPage: false, endCursor: null }),
      fastChecks: [actionRequiredGate], fastExit: 1,
      commits: [{ commit: { oid: "head", statusCheckRollup: { state: "PENDING" } } }],
      checkFirst: checkPage([ownerGateNode], { hasNextPage: true, endCursor: "next" }), hangChecks: true,
    });
    const r = runtime(), reader = new GhGitHubReader(controller.signal);
    const running = runSimple({ dependencies: { ...r.dependencies, reader, signal: controller.signal }, contexts: [context], mode: "single", statusOnly: false, options });
    const rejected = assert.rejects(running, /abort/i);
    for (let i = 0; i < 200 && !existsSync(f.started); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(f.started)); controller.abort(); await rejected;
    assert.equal(readFileSync(f.stopped, "utf8"), "settled");
    assert.deepEqual(f.commands().at(-1)?.slice(-2), ["-f", "after=next"]);
    assert.deepEqual(r.events, []);
    const count = f.commands().length;
    await assert.rejects(reader.checkRollupPage(context, "next"), /abort/i);
    assert.equal(f.commands().length, count);
  } finally { controller.abort(); f.cleanup(); }
});

test("owner-gate pending bucket rejects cancelled and unknown states through the actual reader", async (t) => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    for (const state of ["CANCELLED", "FUTURE_VALUE", "PENDING", "EXPECTED", "REQUESTED", "WAITING", "QUEUED", "IN_PROGRESS"]) await t.test(state, async () => {
      f.write(f.calls, "");
      f.write(f.input, {
        facts, first: reviewPage({ hasNextPage: false, endCursor: null }),
        fastChecks: [{ name: "Code Review Gate", state, bucket: "pending" }], fastExit: 8,
        commits: [{ commit: { oid: "head", statusCheckRollup: { state: "SUCCESS" } } }],
      });
      const result = await runSimple({ dependencies: { ...runtime().dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
      assert.equal(result.kind, state === "CANCELLED" || state === "FUTURE_VALUE" ? "BLOCKER" : "READY");
      if (result.kind === "READY") {
        if (result.scope.kind !== "single" || result.scope.pr.kind !== "ready-pr") assert.fail("expected open-PR proof");
        assert.equal(result.scope.pr.proof.mergeAuthorization, false);
      } else assert.equal(result.exitCode, 4);
    });
  } finally { f.cleanup(); }
});

test("actual pending bucket validates owner-gate and non-gate states before readiness", async (t) => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    const cases = [
      ...["Code Review Gate", "build"].flatMap(name =>
        ["CANCELLED", "FUTURE_VALUE", "STALE", "SUCCESS", "NEUTRAL", "SKIPPED", "TIMED_OUT", "FAILURE", "ERROR", "COMPLETED", ""].map(state => ({ name, state, expected: "BLOCKER" }))
      ),
      ...["EXPECTED", "REQUESTED", "WAITING", "QUEUED", "PENDING", "IN_PROGRESS"].map(state => ({ name: "build", state, expected: "TIMEOUT" })),
      { name: "Code Review Gate", state: "ACTION_REQUIRED", expected: "READY" },
      { name: "build", state: "ACTION_REQUIRED", expected: "BLOCKER" },
    ];
    for (const { name, state, expected } of cases) await t.test(`${name} ${JSON.stringify(state)} in pending`, async () => {
      f.write(f.calls, "");
      f.write(f.input, {
        facts, first: reviewPage({ hasNextPage: false, endCursor: null }),
        fastChecks: [{ name, state, bucket: "pending" }], fastExit: 8,
        commits: [{ commit: { oid: "head", statusCheckRollup: { state: "SUCCESS" } } }],
      });
      const result = await runSimple({ dependencies: { ...runtime().dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
      assert.equal(result.kind, expected);
      assert.equal(result.exitCode, expected === "READY" ? 0 : expected === "TIMEOUT" ? 5 : 4);
      if (result.kind === "READY") {
        if (result.scope.kind !== "single" || result.scope.pr.kind !== "ready-pr") assert.fail("expected open-PR proof");
        assert.equal(result.scope.pr.proof.mergeAuthorization, false);
      }
    });
  } finally { f.cleanup(); }
});

test("actual fast-check buckets cannot turn unsafe states into READY", async (t) => {
  const f = reviewGhFixture();
  try {
    const facts = await fakeReader().pullRequest(context);
    const cases = [
      { state: "SUCCESS", bucket: "pass", expected: "READY" },
      { state: "NEUTRAL", bucket: "skipping", expected: "READY" },
      { state: "SKIPPED", bucket: "skipping", expected: "READY" },
      ...["pass", "skipping"].flatMap(bucket => ["CANCELLED", "PENDING", "FUTURE_VALUE"].map(state => ({ state, bucket, expected: "BLOCKER" }))),
    ];
    for (const { state, bucket, expected } of cases) await t.test(`${state} in ${bucket}`, async () => {
      f.write(f.calls, "");
      f.write(f.input, {
        facts, first: reviewPage({ hasNextPage: false, endCursor: null }),
        fastChecks: [actionRequiredGate, { name: "build", state, bucket }],
      });
      const result = await runSimple({ dependencies: { ...runtime().dependencies, reader: new GhGitHubReader() }, contexts: [context], mode: "single", statusOnly: false, options: { ...options, maxQueryErrors: 1 } });
      assert.equal(result.kind, expected);
      if (result.kind === "READY") {
        if (result.scope.kind !== "single" || result.scope.pr.kind !== "ready-pr") assert.fail("expected open-PR proof");
        assert.equal(result.scope.pr.proof.mergeAuthorization, false);
      } else assert.equal(result.exitCode, 4);
    });
  } finally { f.cleanup(); }
});
