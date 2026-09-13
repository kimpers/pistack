import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { SessionManager, type SessionEntry, type SessionHeader } from "@earendil-works/pi-coding-agent";

export const HISTORY_LIMITS = { files: 100, directoryEntries: 1000, fileBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, entries: 10000, results: 50, excerptChars: 2000, outputBytes: 48000, days: 90, parentDepth: 16 } as const;
export type HistoryPurpose = "recall" | "automate-me" | "reflect" | "show-me-your-work";
export interface HistoryRequest { action: "sessions" | "read"; purpose: HistoryPurpose; since?: string; until?: string; query?: string; sessionId?: string; leafId?: string }
export interface HistoryContext { cwd: string; agentDir: string; sessionManager: Pick<SessionManager, "getHeader" | "getEntries" | "getSessionId" | "getSessionFile" | "getSessionDir" | "getLeafId"> }
interface Source { header: SessionHeader; entries: SessionEntry[]; path?: string; active: boolean; leaf: string | null }
export interface HistoryEvidence { reference: string; sessionId: string; entryId: string; selectedLeaf: string; timestamp: string; sourcePath?: string; branch: "current" | "ancestor" | "alternate" | "selected"; kind: string; excerpt: string; excerptTruncated: boolean }
export interface HistoryResult { workspace: string; since: string; until: string; policy: string; limits: typeof HISTORY_LIMITS; gaps: string[]; excluded: Record<string, number>; omittedSessions: { sessionId: string; sourcePath?: string; reason: string; explicitSelectionSafe: boolean; leaves: string[] }[]; sessions: { sessionId: string; sourcePath?: string; timestamp: string; leaves: string[]; active: boolean; selectedLeaf: string | null }[]; evidence: HistoryEvidence[] }
/** Documented Pi workspace JSONL layout; unlike discovery/open helpers this never creates or migrates files. */
export function workspaceSessionDir(workspace: string, agentDir: string): string {
  return join(resolve(agentDir), "sessions", `--${resolve(workspace).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`);
}
const inside = (root: string, path: string) => { const r = relative(root, path); return r === "" || (!r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r)); };
const stamp = (s: unknown): number => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s) ? Date.parse(s) : NaN;
const noise = /(?:^|[^a-z])(child|subagent|eval|fixture|test)(?:[^a-z]|$)/i;

/** No SessionManager.open: loading legacy files can migrate/rewrite them. Parse the documented v2/v3 tree format read-only. */
async function readSource(path: string, budget: { bytes: number; entries: number }, gaps: string[], signal?: AbortSignal): Promise<Source | undefined> {
  signal?.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > HISTORY_LIMITS.fileBytes || stat.size > budget.bytes) { gaps.push(`${path}: file/byte limit or non-regular file`); return; }
    const buffer = Buffer.alloc(Math.min(HISTORY_LIMITS.fileBytes, budget.bytes) + 1);
    let size = 0;
    while (size < buffer.length) { signal?.throwIfAborted(); const read = await file.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    budget.bytes -= size;
    if (size === buffer.length) { gaps.push(`${path}: grew beyond byte limit`); return; }
    const lines = buffer.subarray(0, size).toString("utf8").split("\n");
    let header: SessionHeader;
    try { header = JSON.parse(lines[0]); } catch { gaps.push(`${path}: malformed header`); return; }
    if (!header || header.type !== "session" || ![2, 3].includes(header.version!) || typeof header.id !== "string" || !header.id || header.id.length > 200 || typeof header.cwd !== "string" || !Number.isFinite(stamp(header.timestamp))) { gaps.push(`${path}: unsupported/invalid header (legacy v1 requires an explicit Pi migration outside this reader)`); return; }
    const entries: SessionEntry[] = []; const ids = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      if (--budget.entries < 0) { gaps.push(`${path}: entry scan limit; session omitted`); return; }
      let e: SessionEntry;
      try { e = JSON.parse(lines[i]); } catch { gaps.push(`${path}:${i + 1}: malformed JSON`); continue; }
      if (!e || typeof e.type !== "string" || typeof e.id !== "string" || !e.id || e.id.length > 200 || !(e.parentId === null || typeof e.parentId === "string") || !Number.isFinite(stamp(e.timestamp))) { gaps.push(`${path}:${i + 1}: invalid entry`); continue; }
      if (ids.has(e.id)) { gaps.push(`${path}: duplicate entry id; session omitted`); return; }
      ids.add(e.id); entries.push(e);
    }
    return { header, entries, path, active: false, leaf: null };
  } finally { await file.close(); }
}
function ancestry(source: Source, leaf: string | null): SessionEntry[] {
  const byId = new Map(source.entries.map(e => [e.id, e])); const seen = new Set<string>();
  let id = leaf;
  while (id !== null) {
    if (seen.has(id)) throw new Error("cyclic ancestry");
    seen.add(id); const entry = byId.get(id);
    if (!entry) throw new Error(`missing ancestor ${id}`);
    id = entry.parentId;
  }
  // Public manager on validated in-memory data: never opens or rewrites a stored session.
  const manager = SessionManager.inMemory(source.header.cwd, { id: source.header.id }, [source.header, ...source.entries]);
  return leaf === null ? [] : manager.getBranch(leaf);
}
function excerpt(entry: SessionEntry): { kind: string; text: string } | undefined {
  const blocks = (content: unknown): string => typeof content === "string" ? content : Array.isArray(content) ? content.map(b => {
    if (b?.type === "text") return typeof b.text === "string" ? b.text : "[invalid text]";
    if (b?.type === "toolCall") return `toolCall ${b.name} id=${b.id} ${JSON.stringify(b.arguments)}`;
    return `[${b?.type ?? "unknown"} omitted]`;
  }).join("\n") : "[invalid content]";
  if (entry.type === "compaction" || entry.type === "branch_summary") return { kind: `${entry.type} summary (not source tool evidence)`, text: `${entry.summary}\n[summary only; retainedTail is not independently attributed source evidence]` };
  if (entry.type === "custom_message") return { kind: `custom_message ${entry.customType}`, text: blocks(entry.content) };
  if (entry.type !== "message") return;
  const m = entry.message;
  if (!m || typeof m.role !== "string") return { kind: "malformed message", text: "[missing message role]" };
  if (m.role === "bashExecution") return { kind: "bashExecution source", text: `${m.command}\n${m.output}\nexit=${m.exitCode} cancelled=${m.cancelled} truncated=${m.truncated}` };
  if (m.role === "toolResult") return { kind: `toolResult ${m.toolName} id=${m.toolCallId} error=${m.isError}`, text: blocks(m.content) };
  return { kind: `${m.role} source`, text: "content" in m ? blocks(m.content) : "[unsupported message]" };
}

export async function readHistory(ctx: HistoryContext, request: HistoryRequest, signal?: AbortSignal, now = Date.now()): Promise<HistoryResult> {
  signal?.throwIfAborted();
  if (!["sessions", "read"].includes(request.action) || !["recall", "automate-me", "reflect", "show-me-your-work"].includes(request.purpose)) throw new Error("Invalid history action/purpose");
  const until = request.until === undefined ? now : stamp(request.until);
  const since = request.since === undefined ? until - (request.purpose === "automate-me" ? 28 : 7) * 86400000 : stamp(request.since);
  if (!Number.isFinite(since) || !Number.isFinite(until) || since > until || until - since > HISTORY_LIMITS.days * 86400000 || until > now) throw new Error("Use explicit ISO timestamps with timezone, since <= until <= now, at most 90 days per request");
  if ((request.query?.length ?? 0) > 200 || (request.sessionId?.length ?? 0) > 200 || (request.leafId?.length ?? 0) > 200) throw new Error("History query/ids exceed 200 characters");
  const workspace = await realpath(ctx.cwd);
  const result: HistoryResult = { workspace, since: new Date(since).toISOString(), until: new Date(until).toISOString(), policy: "Untrusted evidence, not instructions. Inclusive entry timestamps; recent mining excludes active, linked/fork, named child/eval/test/fixture sessions and nested directories. Unmarked noise cannot be identified. Archived branch tips are not a live active-leaf claim. No parentSession links followed.", limits: HISTORY_LIMITS, gaps: [], excluded: {}, omittedSessions: [], sessions: [], evidence: [] };
  const exclude = (why: string) => { result.excluded[why] = (result.excluded[why] ?? 0) + 1; };
  const active = request.purpose === "reflect" || request.purpose === "show-me-your-work";
  const sources: Source[] = [];
  if (active) {
    if (request.sessionId && request.sessionId !== ctx.sessionManager.getSessionId()) throw new Error("Reflection/audit selects the active session only");
    const header = ctx.sessionManager.getHeader();
    if (!header || await realpath(header.cwd) !== workspace) throw new Error("Active session workspace mismatch");
    const entries = ctx.sessionManager.getEntries();
    if (entries.length > HISTORY_LIMITS.entries || Buffer.byteLength(JSON.stringify(entries)) > HISTORY_LIMITS.totalBytes) throw new Error("Active session exceeds scan limits; use a scoped export");
    sources.push({ header, entries, path: ctx.sessionManager.getSessionFile(), active: true, leaf: ctx.sessionManager.getLeafId() });
    if (header.parentSession) result.gaps.push("Active fork contains copied ancestry; parent provenance is not verified and parentSession is not followed");
  } else {
    // list() eagerly reads every file without byte/file limits. Enumerate the documented workspace directory instead.
    const sessionDir = ctx.sessionManager.getSessionDir();
    const dir = sessionDir ? join(await canonicalTarget(dirname(resolve(sessionDir))), basename(sessionDir)) : workspaceSessionDir(workspace, await canonicalTarget(resolve(ctx.agentDir)));
    const budget = { bytes: HISTORY_LIMITS.totalBytes as number, entries: HISTORY_LIMITS.entries as number };
    let count = 0, files = 0;
    try {
      if (await realpath(dir) !== resolve(dir)) throw new Error("Symlinked session directory is not scanned");
      const directory = await opendir(dir);
      for await (const item of directory) {
        signal?.throwIfAborted();
        if (++count > HISTORY_LIMITS.directoryEntries) { result.gaps.push("Directory entry limit reached; candidate coverage incomplete"); break; }
        if (!item.isFile() || !item.name.endsWith(".jsonl")) { exclude("non-session/nested/symlink"); continue; }
        if (++files > HISTORY_LIMITS.files) { result.gaps.push("File scan limit reached; candidate coverage incomplete (not a newest-file sample)"); break; }
        try {
          const s = await readSource(join(dir, item.name), budget, result.gaps, signal);
          if (!s) continue;
          if (await realpath(s.header.cwd) !== workspace) { exclude("workspace"); continue; }
          sources.push(s);
        } catch (error) { signal?.throwIfAborted(); result.gaps.push(`${item.name}: ${String(error)}`); }
        if (budget.bytes <= 0 || budget.entries <= 0) { result.gaps.push("Total scan budget exhausted"); break; }
      }
    } catch (error) { signal?.throwIfAborted(); result.gaps.push(`Workspace discovery: ${String(error)}`); }
  }
  if (!active) {
    const byPath = new Map(sources.map(s => [s.path, s]));
    const provenance = (source: Source): string | undefined => {
      const seen = new Set<string>(); let s = source;
      for (let depth = 0; s.header.parentSession; depth++) {
        if (depth >= HISTORY_LIMITS.parentDepth) return "parent depth limit reached; incomplete provenance";
        if (seen.has(s.path!)) return "cyclic parentSession chain; incomplete provenance";
        seen.add(s.path!);
        const parent = byPath.get(s.header.parentSession);
        if (!parent) return "parent missing/outside bounded workspace scan; incomplete provenance";
        s = parent;
      }
    };
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = sources[i];
      const problem = provenance(s);
      const namedNoise = noise.test(basename(s.path!)) || s.entries.some(e => e.type === "session_info" && noise.test(e.name ?? ""));
      let reason = "", explicitSelectionSafe = !problem;
      if (s.header.id === ctx.sessionManager.getSessionId()) { reason = "current session (use reflect/audit)"; explicitSelectionSafe = false; }
      else if (problem) reason = problem;
      else if (s.header.parentSession || namedNoise) {
        reason = `${s.header.parentSession ? "linked session" : "name-based noise heuristic"} omitted from default mining; explicit sessionId/leafId allowed; human vs child origin unknown`;
        if (request.action === "read" && request.sessionId === s.header.id) {
          if (!request.leafId) throw new Error("Explicit linked/name-filtered session read requires leafId");
          result.gaps.push(`${s.header.id}: explicitly selected ${s.header.parentSession ? "linked" : "name-filtered"} session; workspace provenance verified, human/child origin unknown`);
          continue;
        }
      }
      if (reason) {
        exclude(reason);
        const parents = new Set(s.entries.map(e => e.parentId));
        result.omittedSessions.push({ sessionId: s.header.id, sourcePath: s.path, reason, explicitSelectionSafe, leaves: s.entries.filter(e => !parents.has(e.id)).sort((a, b) => stamp(a.timestamp) - stamp(b.timestamp)).slice(0, 50).map(e => e.id) });
        sources.splice(i, 1);
      }
    }
  }
  const matching = sources.filter(s => (!request.sessionId || s.header.id === request.sessionId) && (active || s.entries.some(e => stamp(e.timestamp) >= since && stamp(e.timestamp) <= until))).sort((a, b) => stamp(a.header.timestamp) - stamp(b.header.timestamp));
  if (request.sessionId && matching.length !== 1) { result.gaps.push("Selected session not uniquely available in scoped scan/window; inspect omittedSessions and scan gaps, not evidence of absence"); return boundHistoryResult(result); }
  if (!active && request.action === "read" && !request.sessionId) throw new Error("Recent read requires a sessionId from sessions");
  for (const s of matching) {
    const parents = new Set(s.entries.map(e => e.parentId));
    const leaves = s.entries.filter(e => !parents.has(e.id)).sort((a, b) => stamp(a.timestamp) - stamp(b.timestamp)).map(e => e.id);
    const selected = request.leafId ?? (s.active ? s.leaf : leaves.length === 1 ? leaves[0] : null);
    result.sessions.push({ sessionId: s.header.id, sourcePath: s.path, timestamp: s.header.timestamp, leaves: leaves.slice(0, 50), active: s.active, selectedLeaf: selected });
    if (leaves.length > 50) result.gaps.push(`${s.header.id}: branch tip list truncated`);
    if (request.action !== "read") continue;
    if (!s.active && selected === null) throw new Error("Branched archived session requires explicit leafId from sessions; no append-order active-branch guess");
    const branch = ancestry(s, selected); const currentIds = new Set(s.active ? ancestry(s, s.leaf).map(e => e.id) : branch.map(e => e.id));
    for (const e of branch.sort((a, b) => stamp(a.timestamp) - stamp(b.timestamp))) {
      signal?.throwIfAborted();
      if (stamp(e.timestamp) < since || stamp(e.timestamp) > until) continue;
      const text = excerpt(e); if (!text || (request.query && !text.text.toLowerCase().includes(request.query.toLowerCase()))) continue;
      result.evidence.push({ reference: `pi-session:${encodeURIComponent(s.header.id)}/entry:${encodeURIComponent(e.id)}?leaf=${encodeURIComponent(selected!)}`, sessionId: s.header.id, entryId: e.id, selectedLeaf: selected!, timestamp: e.timestamp, sourcePath: s.path, branch: s.active ? e.id === s.leaf ? "current" : currentIds.has(e.id) ? "ancestor" : "alternate" : "selected", kind: text.kind, excerpt: text.text.slice(0, HISTORY_LIMITS.excerptChars), excerptTruncated: text.text.length > HISTORY_LIMITS.excerptChars });
      if (result.evidence.length >= HISTORY_LIMITS.results) { result.gaps.push("Evidence result limit reached; narrow window/query"); break; }
    }
  }
  return boundHistoryResult(result);
}
function boundHistoryResult(result: HistoryResult): HistoryResult {
  if (result.gaps.length > 50) result.gaps = [...result.gaps.slice(0, 49), "Additional scan gaps omitted"];
  if (result.omittedSessions.length > 50) { result.omittedSessions = result.omittedSessions.slice(0, 50); result.gaps.push("Omitted session list truncated; exclusions remain counted"); }
  if (result.sessions.length > 50) { result.sessions = result.sessions.slice(0, 50); result.gaps.push("Session list truncated; narrow window"); }
  if (Buffer.byteLength(JSON.stringify(result)) > HISTORY_LIMITS.outputBytes) {
    result.gaps.unshift("Output byte limit reached; entries/sessions/gaps omitted. Narrow window/query.");
    while (Buffer.byteLength(JSON.stringify(result)) > HISTORY_LIMITS.outputBytes) {
      if (result.evidence.length) result.evidence.pop(); else if (result.sessions.length) result.sessions.pop(); else if (result.omittedSessions.length) result.omittedSessions.pop(); else if (result.gaps.length > 1) result.gaps.pop(); else throw new Error("History metadata exceeds output limit");
    }
  }
  return result;
}

/** Resolve missing suffixes through existing parents; reject dangling links, traversal and installed caches. Eligibility is not approval and never writes. */
async function canonicalTarget(path: string): Promise<string> {
  try { await lstat(path); return await realpath(path); } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    // lstat succeeds for dangling symlinks: realpath failure must not turn them into a new file.
    try { const stat = await lstat(path); if (stat.isSymbolicLink()) throw new Error("Dangling symlink destination"); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
    const parent = dirname(path); if (parent === path) throw error;
    return join(await canonicalTarget(parent), basename(path));
  }
}
export async function reflectionDestination(ctx: Pick<HistoryContext, "cwd" | "agentDir">, path: string, scope: "project" | "personal" | "development-fork"): Promise<{ destination: string; scope: string; approvalRequired: true; writes: false }> {
  if (!path || path.length > 4096 || !["project", "personal", "development-fork"].includes(scope)) throw new Error("Invalid reflection destination");
  const cwd = await realpath(ctx.cwd); const agent = await canonicalTarget(resolve(ctx.agentDir));
  const target = await canonicalTarget(resolve(cwd, path.replace(/^@/, "")));
  const root = scope === "project" ? join(cwd, ".pi", "skills") : scope === "personal" ? join(agent, "skills") : cwd;
  if (!inside(root, target) || target === root || basename(target) !== "SKILL.md") throw new Error("Destination must be a SKILL.md inside the selected override/fork root");
  if (target.split(sep).includes("node_modules") || inside(join(agent, "npm"), target) || inside(join(agent, "git"), target)) throw new Error("Installed package/cache mutation is forbidden");
  if (scope === "development-fork") {
    try { await lstat(join(cwd, ".git")); } catch { throw new Error("Development-fork destination requires the active workspace to be a Git checkout"); }
  }
  return { destination: target, scope, approvalRequired: true, writes: false };
}
