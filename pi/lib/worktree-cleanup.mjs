import { spawnSync } from "node:child_process";
import { constants, openSync, fstatSync, readSync, closeSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const inside = (root, path) => { const r = relative(root, path); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
const iso = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
function readBounded(path, limit = 2 * 1024 * 1024) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error("non-regular/oversized evidence");
    const bytes = Buffer.alloc(limit + 1); let size = 0;
    while (size < bytes.length) { const n = readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    if (size > limit) throw new Error("evidence grew beyond limit");
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}
/** Read exact selected Pi ancestry; no slug scans, mtime activity guesses, migration or parent-file traversal. */
export function sessionEvidence(path, expected) {
  const [header, ...entries] = readBounded(path).toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if (!header || header.type !== "session" || ![2, 3].includes(header.version) || header.id !== expected.sessionId ||
      !iso(header.timestamp) || realpathSync(header.cwd) !== expected.path) throw new Error("Pi session/worktree identity mismatch");
  if (entries.length > 10000) throw new Error("session entry limit");
  const byId = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.type !== "string" || typeof entry.id !== "string" || !entry.id ||
        !(entry.parentId === null || typeof entry.parentId === "string") || !iso(entry.timestamp) || byId.has(entry.id)) throw new Error("malformed Pi tree entry");
    byId.set(entry.id, entry);
  }
  const branch = [], seen = new Set(); let id = expected.leafId;
  if (typeof id !== "string" || !id) throw new Error("explicit Pi leaf required");
  while (id !== null) {
    if (seen.has(id) || !byId.has(id)) throw new Error("broken/cyclic Pi ancestry");
    seen.add(id); const entry = byId.get(id); branch.push(entry); id = entry.parentId;
  }
  return { sessionId: header.id, leafId: expected.leafId, entries: branch.length, lastEntryAt: branch[0].timestamp,
    reference: `pi-session:${header.id}#${expected.leafId}`, fork: !!header.parentSession,
    limitation: "Selected archival branch only; transcript content and assistant stopReason do not prove native run settlement." };
}
const command = (name, args, cwd) => spawnSync(name, args, { cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" } });
function output(result, label) {
  if (result.error || result.signal || result.status !== 0 || result.stderr?.trim()) throw new Error(`${label} unavailable/error; state unknown`);
  return result.stdout;
}
function preserved(evidence, worktrees) {
  if (!evidence || !isAbsolute(evidence.path ?? "") || !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? "")) throw new Error("missing preserved evidence path/hash");
  const path = realpathSync(evidence.path);
  if (worktrees.some(wt => inside(wt, path))) throw new Error("evidence must survive outside all audited worktrees");
  if (createHash("sha256").update(readBounded(evidence.path)).digest("hex") !== evidence.sha256) throw new Error("preserved evidence hash changed");
  return path;
}
const commitId = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export function auditWorktrees(repo, evidence, { baseRef, run = command, now = Date.now() } = {}) {
  repo = realpathSync(repo);
  const git = (cwd, ...args) => output(run("git", ["-C", cwd, ...args], repo), `git ${args[0]}`);
  let base = null;
  if (baseRef !== undefined) {
    if (typeof baseRef !== "string" || !baseRef.trim() || baseRef.startsWith("-") || baseRef.includes("\0")) throw new Error("base must name a local commit/ref");
    const sha = output(run("git", ["-C", repo, "rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], repo), "base resolution").trim();
    if (!commitId(sha)) throw new Error("base did not resolve to one commit ID");
    base = { ref: baseRef, sha };
  }
  const records = git(repo, "worktree", "list", "--porcelain", "-z").split("\0\0").filter(Boolean).map(block => {
    const fields = block.split("\0"); const path = fields.find(f => f.startsWith("worktree "))?.slice(9);
    if (!path || !isAbsolute(path)) throw new Error("unparseable Git worktree inventory");
    return { path, head: fields.find(f => f.startsWith("HEAD "))?.slice(5), branch: fields.find(f => f.startsWith("branch "))?.slice(7),
      locked: fields.some(f => /^(locked|prunable)( |$)/.test(f)) };
  });
  if (!records.length) throw new Error("empty Git worktree inventory");
  const validEnvelope = evidence?.version === 1 && evidence.repo === repo && typeof evidence.taskId === "string" && !!evidence.taskId &&
    iso(evidence.observedAt) && now >= Date.parse(evidence.observedAt) && now - Date.parse(evidence.observedAt) <= 300000 &&
    Array.isArray(evidence.worktrees) && evidence.worktrees.length <= 1000;
  const rows = records.map((wt, index) => {
    const reasons = []; let session = null, processes = "unknown", ancestry = "not-requested";
    if (base) {
      ancestry = "unknown";
      try {
        if (!commitId(wt.head)) throw new Error("missing Git head");
        const result = run("git", ["-C", repo, "merge-base", "--is-ancestor", wt.head, base.sha], repo);
        if (result.error || result.signal || result.stderr?.trim() || result.stdout?.trim() || ![0, 1].includes(result.status)) throw new Error("Git ancestry command failed");
        ancestry = result.status === 0 ? "ancestor" : "not-ancestor";
      } catch { reasons.push("Git ancestry query unavailable/error; state unknown"); }
    }
    if (index === 0 || wt.path === repo) reasons.push("primary/requested worktree is excluded");
    if (wt.locked) reasons.push("locked/prunable worktree");
    const owners = validEnvelope ? evidence.worktrees.filter(row => row?.path === wt.path) : [];
    if (owners.length !== 1) reasons.push("unknown/foreign/duplicate ownership or stale evidence");
    const owner = owners[0];
    try {
      const path = realpathSync(wt.path);
      if (path !== wt.path) throw new Error("noncanonical/symlink worktree path");
      if (git(path, "rev-parse", "HEAD").trim() !== wt.head || git(path, "symbolic-ref", "HEAD").trim() !== wt.branch) throw new Error("changed/detached Git identity");
      if (git(path, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching")) reasons.push("dirty/untracked/ignored files require preservation");
      if (!owner || owner.state !== "settled" || typeof owner.runId !== "string" || !owner.runId || owner.head !== wt.head || owner.branch !== wt.branch)
        throw new Error("missing exact native settlement/head/branch evidence");
      preserved(owner.statusEvidence, records.map(r => r.path));
      preserved(owner.checkpoint, records.map(r => r.path));
      session = sessionEvidence(owner.sessionFile, owner);
      const processResult = run("lsof", ["-nP", "-Fpn", "+D", path], repo);
      if (processResult.error || processResult.signal || processResult.stderr?.trim() || ![0, 1].includes(processResult.status)) throw new Error("process visibility unknown");
      if (processResult.status === 1 && !processResult.stdout.trim()) processes = "no visible matches (not a global process guarantee)";
      else { processes = "visible activity or ambiguous lsof output"; reasons.push(processes); }
      if (git(path, "rev-parse", "HEAD").trim() !== wt.head || git(path, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching")) reasons.push("Git state changed during audit");
    } catch (error) { reasons.push(error.message); }
    return { ...wt, ancestry, bucket: reasons.length ? "hold" : "review-owned", reasons, runId: owner?.runId ?? null, session, processes, deletionAuthorized: false };
  });
  return { version: 1, repo, base, taskId: validEnvelope ? evidence.taskId : null, observedAt: new Date(now).toISOString(), rows,
    limitations: ["Read-only point-in-time audit, not deletion authority or a cleanup plan executor.", "Caller-supplied native settlement references need operator review; file hashes do not authenticate a tool result.", "lsof visibility is supporting evidence only; no process is killed. No fetch, force removal, session/cache sweep or ownership registry."] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), hasBase = args[0] === "--base";
  const baseRef = hasBase ? args[1] : undefined;
  const paths = hasBase ? args.slice(2) : args;
  const help = args.length === 1 && args[0] === "--help";
  if (help || paths.length !== 2 || paths.some(arg => !arg || arg.startsWith("-")) ||
      (hasBase && (!baseRef?.trim() || baseRef.startsWith("-")))) {
    process.stdout.write("Usage: worktree-audit.sh [--base REF] <repo> <owned-evidence.json>\nOptional base must resolve locally to a commit; resolved once, never fetched or guessed.\nRead-only; no deletion, process termination or installs. See pi/references/runtime.md.\n");
    process.exitCode = help ? 0 : 2;
  } else {
    try { process.stdout.write(`${JSON.stringify(auditWorktrees(paths[0], JSON.parse(readBounded(paths[1]).toString("utf8")), { baseRef }), null, 2)}\n`); }
    catch (error) { process.stderr.write(`Audit blocked: ${error.message}\n`); process.exitCode = 1; }
  }
}
