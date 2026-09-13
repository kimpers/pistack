import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { CONFIG_DIR_NAME, DefaultPackageManager, SettingsManager, type ResolvedResource, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { defaultModels, parseModels, type ModelConfig } from "./models.ts";

export interface Dependency { name: string; version: string; required: boolean; reason: string; repositories: string[]; tools: string[] }
export const dependencyManifest = JSON.parse(readFileSync(new URL("../dependencies.json", import.meta.url), "utf8")) as { piVersion: string; qualification: string; extensions: Dependency[] };
export interface SetupPaths { cwd: string; agentDir: string; projectTrusted: boolean; helpersDirectory?: string }
export interface SetupConfig { version: 1; models: ModelConfig; optional: string[]; helpers: boolean }
export interface PackageRow { source: string; scope: "user" | "project" | "temporary"; identity: string; path?: string; name?: string; version?: string; shadowed: boolean; filter?: unknown; extensions: { path: string; enabled: boolean }[] }
export interface Inspection { projectTrusted: boolean; rows: PackageRow[]; resources: ResolvedResource[]; problems: string[]; fingerprint: string; config: SetupConfig; configPath: string; settingsPaths: string[] }
export type InstallStep = { name: string; command: string; args: string[]; cwd: string; reason: string } & ({ kind: "extension" } | { kind: "helpers"; fingerprint: string });
export interface Proposal { scope: "user" | "project"; destination: { path: string; physicalParent: string; fingerprint: string | null }; inspection: Inspection; steps: InstallStep[]; conflicts: string[]; reuse: string[]; config: SetupConfig; prerequisites?: Prerequisite[] }
export interface Prerequisite { name: string; ready: boolean; requiredForInstall: boolean; detail: string }
export function jsonFile(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected JSON object in ${path}`);
  return value;
}
function canonical(path: string): string { return existsSync(path) ? realpathSync(path) : resolve(path); }
export function within(path: string, root: string): boolean {
  const rel = relative(canonical(root), canonical(path));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}
export function configPath(paths: SetupPaths, scope: "user" | "project"): string {
  return join(scope === "user" ? paths.agentDir : join(paths.cwd, CONFIG_DIR_NAME), "pistack.json");
}
// Resolve missing parents through their nearest existing ancestor, including stable symlinked homes.
function physicalDestination(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : join(physicalDestination(dirname(absolute)), basename(absolute));
}
function snapshotDestination(paths: SetupPaths, scope: "user" | "project"): Proposal["destination"] {
  const path = configPath(paths, scope);
  return { path, physicalParent: physicalDestination(dirname(path)), fingerprint: existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null };
}
function destinationUnchanged(paths: SetupPaths, proposal: Proposal): boolean {
  return JSON.stringify(snapshotDestination(paths, proposal.scope)) === JSON.stringify(proposal.destination);
}
export function loadConfig(paths: SetupPaths): { config: SetupConfig; path: string } {
  const user = configPath(paths, "user");
  const project = configPath(paths, "project");
  const path = paths.projectTrusted && existsSync(project) ? project : user;
  if (!existsSync(path)) return { config: { version: 1, models: defaultModels(), optional: [], helpers: false }, path };
  const value = jsonFile(path) as SetupConfig;
  if (value.version !== 1 || typeof value.helpers !== "boolean" || !Array.isArray(value.optional) || value.optional.some(name => !dependencyManifest.extensions.some(d => !d.required && d.name === name))) throw new Error(`Invalid piStack config: ${path}`);
  return { config: { ...value, models: parseModels(value.models) }, path };
}
export function sourceIdentity(source: string, base: string): string {
  if (source.startsWith("npm:")) return `npm:${source.slice(4).replace(/@[^/@]+$/, "")}`;
  if (/^(git:|https?:\/\/|ssh:\/\/|git:\/\/)/.test(source)) {
    return `git:${source.replace(/^git:(?!\/\/)/, "").replace(/^(git\+)?(https?|ssh|git):\/\//, "").replace(/^git@/, "").replace(/:([^/])/, "/$1").replace(/@[^/]+$/, "").replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase()}`;
  }
  return `local:${canonical(source.startsWith("~/") ? join(homedir(), source.slice(2)) : resolve(base, source))}`;
}
function packageInfo(path?: string): { name?: string; version?: string } {
  if (!path || !existsSync(path)) return {};
  let dir = statSync(path).isDirectory() ? path : dirname(path);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) {
      const pkg = jsonFile(join(dir, "package.json"));
      return { name: pkg.name, version: pkg.version };
    }
    const parent = dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}
export async function inspectSetup(paths: SetupPaths, tools: readonly ToolInfo[] = []): Promise<Inspection> {
  const settingsPaths = [join(paths.agentDir, "settings.json"), join(paths.cwd, CONFIG_DIR_NAME, "settings.json")];
  const raw = settingsPaths.map((path, i) => i === 1 && !paths.projectTrusted ? "{}" : existsSync(path) ? readFileSync(path, "utf8") : "{}");
  const settings = SettingsManager.fromStorage({ withLock(scope, fn) {
    if (fn(raw[scope === "global" ? 0 : 1]) !== undefined) throw new Error("Inspection cannot write settings");
  } }, { projectTrusted: paths.projectTrusted });
  const errors = settings.drainErrors();
  if (errors.length) throw new Error(errors.map(e => e.error.message).join("; "));
  const manager = new DefaultPackageManager({ ...paths, settingsManager: settings });
  // The skip callback is essential: Pi's resolver otherwise installs missing packages.
  const resolved = await manager.resolve(async () => "skip");
  const entries = [...(settings.getGlobalSettings().packages ?? []).map(pkg => ({ pkg, scope: "user" as const })), ...(settings.getProjectSettings().packages ?? []).map(pkg => ({ pkg, scope: "project" as const }))];
  const rows: PackageRow[] = entries.map(({ pkg, scope }) => {
    const source = typeof pkg === "string" ? pkg : pkg.source;
    const identity = sourceIdentity(source, scope === "user" ? paths.agentDir : join(paths.cwd, CONFIG_DIR_NAME));
    const path = manager.getInstalledPath(source, scope);
    const info = packageInfo(path);
    const known = dependencyManifest.extensions.find(d => identity === `npm:${d.name}` || d.repositories.some(repo => identity === `git:${repo}`));
    return { source, scope, identity, path, name: info.name ?? known?.name, version: info.version, shadowed: false, filter: typeof pkg === "object" ? pkg : undefined, extensions: [] };
  });
  for (const row of rows) {
    row.shadowed = row.scope === "user" && rows.some(other => other.scope === "project" && other.identity === row.identity && (other.filter as any)?.autoload !== false);
    row.extensions = resolved.extensions.filter(r => r.metadata.source === row.source && r.metadata.scope === row.scope).map(r => ({ path: r.path, enabled: r.enabled }));
    // Project autoload:false deltas use the global install and own the effective resource rows.
    if ((row.filter as any)?.autoload === false && row.scope === "project") {
      const base = rows.find(other => other.scope === "user" && other.identity === row.identity);
      if (base) { row.path = base.path; row.name = base.name; row.version = base.version; base.shadowed = true; }
    }
  }
  for (const resource of resolved.extensions.filter(r => r.metadata.origin === "top-level")) {
    rows.push({ source: resource.metadata.source, scope: resource.metadata.scope, identity: `local:${canonical(resource.path)}`, path: resource.path, ...packageInfo(resource.path), shadowed: false, extensions: [{ path: resource.path, enabled: resource.enabled }] });
  }
  const problems: string[] = [];
  for (const row of rows.filter(r => !r.shadowed)) {
    if (!row.name && !row.extensions.length) problems.push(`Unresolved source cannot be checked for equivalent extensions: ${row.scope} ${row.source}`);
  }
  const effective = loadConfig(paths);
  const fingerprint = createHash("sha256").update(JSON.stringify({ projectTrusted: paths.projectTrusted, raw, rows, tools, config: effective.config })).digest("hex");
  return { projectTrusted: paths.projectTrusted, rows, resources: resolved.extensions, problems, fingerprint, config: effective.config, configPath: effective.path, settingsPaths };
}

export const helpersDirectory = fileURLToPath(new URL("../../pstack/skills/poteto-mode/scripts/", import.meta.url));
export function helperStatus(directory = helpersDirectory): { ready: boolean; reason: string; fingerprint: string } {
  const fingerprint = createHash("sha256").update(readFileSync(join(directory, "package.json"))).update("\0").update(readFileSync(join(directory, "bun.lock"))).digest("hex");
  const marker = join(directory, "node_modules", ".poteto-mode-tools-install-key");
  const installed = existsSync(join(directory, "node_modules", "commander", "package.json"));
  const ready = installed && existsSync(marker) && readFileSync(marker, "utf8").trim() === fingerprint;
  return { ready, fingerprint, reason: ready ? "Retained helpers installed for current lockfile" : "PR watcher/orchestration helpers unavailable: missing dependencies or stale lock fingerprint; /pistack setup" };
}
export function markHelpersReady(directory: string, fingerprint: string): void {
  if (helperStatus(directory).fingerprint !== fingerprint) throw new Error("Helper package/lock changed during installation; helpers remain unavailable; rerun setup");
  if (!existsSync(join(directory, "node_modules", "commander", "package.json"))) throw new Error("Bun completed without commander; helpers remain unavailable");
  atomicJsonOrText(join(directory, "node_modules", ".poteto-mode-tools-install-key"), `${fingerprint}\n`);
}
function assertHelperUnchanged(paths: SetupPaths, step: Extract<InstallStep, { kind: "helpers" }>): void {
  const directory = paths.helpersDirectory ?? helpersDirectory;
  if (canonical(directory) !== step.cwd || helperStatus(directory).fingerprint !== step.fingerprint) throw new Error("Helper destination or package/lock changed since approval; rerun setup");
}
export function buildProposal(paths: SetupPaths, inspection: Inspection, scope: "user" | "project", config: SetupConfig, tools: readonly ToolInfo[] = []): Proposal {
  const conflicts = [...inspection.problems];
  if (scope === "project" && !paths.projectTrusted) conflicts.push("Project is not trusted; setup cannot write project configuration");
  const steps: InstallStep[] = [];
  const reuse: string[] = [];
  for (const dependency of dependencyManifest.extensions.filter(d => d.required || config.optional.includes(d.name))) {
    const candidates = inspection.rows.filter(row => row.name === dependency.name && !row.shadowed);
    const identities = new Set(candidates.map(row => row.identity));
    if (identities.size > 1 || candidates.some((row, i) => candidates.some((other, j) => j < i && row.identity === other.identity && row.scope === other.scope))) {
      conflicts.push(`${dependency.name}: duplicate npm/git/local sources: ${candidates.map(c => `${c.scope} ${c.source}`).join(", ")}`);
      continue;
    }
    const candidate = candidates[0];
    const foreignTools = tools.filter(tool => dependency.tools.includes(tool.name) && (!candidate?.path || !within(tool.sourceInfo.path, candidate.path)));
    if (foreignTools.length) { conflicts.push(`${dependency.name}: tool already provided by another or unverified source: ${foreignTools.map(t => `${t.name} (${t.sourceInfo.path})`).join(", ")}`); continue; }
    if (candidate) {
      const missingPinnedSource = candidate.scope === scope && candidate.source === `npm:${dependency.name}@${dependency.version}` && !candidate.filter && (!candidate.path || !existsSync(candidate.path));
      if (missingPinnedSource) {
        steps.push({ kind: "extension", name: dependency.name, command: "pi", args: ["install", candidate.source, inspection.projectTrusted ? "--approve" : "--no-approve", ...(scope === "project" ? ["-l"] : [])], cwd: paths.cwd, reason: `${dependency.reason}; restore this already-configured missing pinned source after approval` });
        continue;
      }
      if (candidate.version !== dependency.version) conflicts.push(`${dependency.name}: installed ${candidate.version ?? "unknown"}, candidate pin ${dependency.version}; refusing to replace user version`);
      else if (!candidate.extensions.some(e => e.enabled) || (candidate.extensions.some(e => !e.enabled) && dependency.tools.some(name => !tools.some(tool => tool.name === name && candidate.path && within(tool.sourceInfo.path, candidate.path))))) conflicts.push(`${dependency.name}: disabled, filtered out, missing, or partially filtered without the required live tools; refusing to enable/repair implicitly`);
      else reuse.push(`${dependency.name}@${candidate.version} (${candidate.scope} ${candidate.source})`);
      continue;
    }
    steps.push({ kind: "extension", name: dependency.name, command: "pi", args: ["install", `npm:${dependency.name}@${dependency.version}`, inspection.projectTrusted ? "--approve" : "--no-approve", ...(scope === "project" ? ["-l"] : [])], cwd: paths.cwd, reason: dependency.reason });
  }
  const directory = paths.helpersDirectory ?? helpersDirectory;
  if (config.helpers) {
    const status = helperStatus(directory);
    if (!status.ready) {
      const root = resolve(directory, "../../../..");
      if (jsonFile(join(root, "package.json")).name !== "pistack" || !within(directory, root)) conflicts.push("Helper directory is not inside this owned piStack package");
      else steps.push({ kind: "helpers", name: "retained Bun helpers", command: "bun", args: ["install", "--frozen-lockfile"], cwd: canonical(directory), fingerprint: status.fingerprint, reason: "Required by retained PR watcher/orchestration workflows; writes dependencies and approved lock fingerprint to this package directory" });
    }
  }
  return { scope, destination: snapshotDestination(paths, scope), inspection, steps, conflicts, reuse, config };
}
export function formatProposal(proposal: Proposal): string {
  return [dependencyManifest.qualification, `Scope: ${proposal.scope}`, `Project trust: ${proposal.inspection.projectTrusted ? "trusted" : "ignored"} for these commands only; saved trust is unchanged.`, `Effective profile before setup: ${proposal.inspection.configPath}. A trusted project profile retains precedence over user-scope writes.`, `Config: ${proposal.destination.path}`, `Approved physical config/journal parent (resolved through nearest existing ancestor): ${proposal.destination.physicalParent}`, ...proposal.reuse.map(r => `Reuse ${r}`), ...proposal.steps.map(s => `${s.command} ${s.args.map(a => JSON.stringify(a)).join(" ")}\n  cwd: ${s.cwd}${s.kind === "helpers" ? `\n  package/lock SHA-256: ${s.fingerprint}` : ""}\n  ${s.reason}`), ...proposal.conflicts.map(c => `CONFLICT: ${c}`), ...(proposal.prerequisites ?? []).map(p => `${p.name}: ${p.ready ? "available" : "NOT READY"} ${p.detail}`), `Models and capabilities to save:\n${JSON.stringify(proposal.config, null, 2)}`, "Approval permits the listed package manager commands, their dependency/lifecycle scripts, and piStack config/journal writes only. No browser/CLI downloads, upgrades, disabling/enabling resources, or shared extension removal. Esc/Cancel declines. Partial installs are retained and reported; rerun inspects unfinished work."].join("\n");
}
export function atomicJsonOrText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, text, { mode: 0o600, flag: "wx" }); renameSync(temp, path); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}
export interface CommandResult { code: number; stdout: string; stderr: string }
export type RunCommand = (command: string, args: string[], options: { cwd: string; agentDir: string; signal?: AbortSignal }) => Promise<CommandResult>;
export const runCommand: RunCommand = (command, args, options) => new Promise((resolvePromise, reject) => {
  if (options.signal?.aborted) { reject(new Error("Cancelled before command")); return; }
  const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, PI_CODING_AGENT_DIR: options.agentDir }, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-16000); });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16000); });
  const abort = () => { if (child.pid) { try { if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} } };
  options.signal?.addEventListener("abort", abort, { once: true });
  const clean = () => options.signal?.removeEventListener("abort", abort);
  child.on("error", error => { clean(); reject(error); });
  child.on("close", code => { clean(); resolvePromise({ code: code ?? 1, stdout, stderr: options.signal?.aborted ? `Cancelled; partial changes may remain.\n${stderr}` : stderr }); });
});
export async function inspectPrerequisites(paths: SetupPaths, config: SetupConfig, run: RunCommand = runCommand): Promise<Prerequisite[]> {
  const probes: { name: string; command: string; args: string[]; requiredForInstall: boolean; validate?: (text: string) => boolean }[] = [
    { name: "Node >=22.19.0", command: "node", args: ["--version"], requiredForInstall: true, validate: text => { const v = /v?(\d+)\.(\d+)\.(\d+)/.exec(text); return !!v && (+v[1] > 22 || (+v[1] === 22 && +v[2] >= 19)); } },
    { name: `Pi candidate ${dependencyManifest.piVersion}`, command: "pi", args: ["--version"], requiredForInstall: true, validate: text => text.trim() === dependencyManifest.piVersion },
    { name: "Git", command: "git", args: ["--version"], requiredForInstall: true },
    { name: "Bun (retained helpers)", command: "bun", args: ["--version"], requiredForInstall: config.helpers },
    { name: "GitHub CLI (PR workflows)", command: "gh", args: ["--version"], requiredForInstall: false },
    { name: "GitHub authentication (PR workflows)", command: "gh", args: ["auth", "status"], requiredForInstall: false },
  ];
  if (config.optional.includes("pi-agent-browser-native")) probes.push(
    { name: "agent-browser >=0.35.0 (separate CLI)", command: "agent-browser", args: ["--version"], requiredForInstall: false, validate: text => { const v = /(\d+)\.(\d+)\.(\d+)/.exec(text); return !!v && (+v[1] > 0 || +v[2] >= 35); } },
    { name: "ffmpeg (recording only)", command: "ffmpeg", args: ["-version"], requiredForInstall: false },
  );
  return Promise.all(probes.map(async probe => {
    try {
      const output = await run(probe.command, probe.args, { cwd: paths.cwd, agentDir: paths.agentDir, signal: AbortSignal.timeout(5000) });
      const text = output.stdout || output.stderr;
      return { name: probe.name, requiredForInstall: probe.requiredForInstall, ready: output.code === 0 && (!probe.validate || probe.validate(text)), detail: text.split("\n")[0].slice(0, 500) };
    } catch (error) { return { name: probe.name, requiredForInstall: probe.requiredForInstall, ready: false, detail: String(error).slice(0, 500) }; }
  }));
}
export async function applyProposal(paths: SetupPaths, proposal: Proposal, options: { approved: boolean; signal?: AbortSignal; run?: RunCommand; tools?: readonly ToolInfo[] }): Promise<{ completed: string[]; remaining: string[]; error?: string; changed: boolean }> {
  const completed: string[] = [];
  const result = (error?: string, changed = false) => ({ completed, remaining: proposal.steps.filter(s => !completed.includes(s.name)).map(s => s.name), error, changed });
  if (!options.approved || options.signal?.aborted) return result("Cancelled; no changes");
  if (proposal.conflicts.length) return result(`Refused: ${proposal.conflicts.join("; ")}`);
  if ((await inspectSetup(paths, options.tools)).fingerprint !== proposal.inspection.fingerprint) return result("Settings/resources changed since approval; rerun setup");
  if (!destinationUnchanged(paths, proposal)) return result("Selected config destination changed since approval; rerun setup");
  const journalPath = join(proposal.destination.physicalParent, "pistack-setup.json");
  const journal = { version: 1, started: new Date().toISOString(), scope: proposal.scope, reused: proposal.reuse, configPath: configPath(paths, proposal.scope), configState: "pending", steps: proposal.steps.map(step => ({ ...step, state: "pending", error: "" })) };
  // Receipts stay at the approved physical parent even if the lexical path is retargeted.
  // Rechecks do not provide hostile-filesystem race freedom.
  const saveJournal = () => {
    if (physicalDestination(proposal.destination.physicalParent) !== proposal.destination.physicalParent) throw new Error("Approved journal destination changed during setup; receipt not written");
    atomicJsonOrText(journalPath, JSON.stringify(journal, null, 2) + "\n");
  };
  let changed = false;
  try {
    for (const step of proposal.steps) if (step.kind === "helpers") assertHelperUnchanged(paths, step);
    for (const [index, step] of proposal.steps.entries()) {
      if (options.signal?.aborted) throw new Error("Cancelled; completed changes retained");
      const fresh = await inspectSetup(paths, options.tools);
      if (JSON.stringify(fresh.config) !== JSON.stringify(proposal.inspection.config)) throw new Error("Model/capability settings changed during setup; rerun before saving configuration");
      const remaining = buildProposal(paths, fresh, proposal.scope, proposal.config, options.tools);
      if (remaining.conflicts.length || !remaining.steps.some(s => s.name === step.name)) throw new Error(`Dependency state changed during setup; rerun: ${remaining.conflicts.join("; ") || step.name}`);
      if (!destinationUnchanged(paths, proposal)) throw new Error("Selected config destination changed during setup; configuration not overwritten");
      if (step.kind === "helpers") assertHelperUnchanged(paths, step);
      journal.steps[index].state = "running";
      saveJournal(); changed = true;
      const commandResult = await (options.run ?? runCommand)(step.command, step.args, { cwd: step.cwd, agentDir: paths.agentDir, signal: options.signal });
      if (commandResult.code !== 0 || options.signal?.aborted) throw new Error(`${step.name}: ${commandResult.stderr || commandResult.stdout || "command failed"}`);
      if (step.kind === "helpers") {
        assertHelperUnchanged(paths, step);
        markHelpersReady(step.cwd, step.fingerprint);
      } else {
        const after = await inspectSetup(paths, []);
        const dep = dependencyManifest.extensions.find(d => d.name === step.name)!;
        if (!after.rows.some(r => !r.shadowed && r.name === dep.name && r.version === dep.version && r.extensions.some(e => e.enabled))) throw new Error(`${step.name}: command completed but enabled pinned installation is not present`);
      }
      completed.push(step.name); journal.steps[index].state = "complete";
      saveJournal();
    }
    if (options.signal?.aborted) throw new Error("Cancelled before config save");
    if (JSON.stringify(loadConfig(paths).config) !== JSON.stringify(proposal.inspection.config)) throw new Error("Model/capability settings changed during setup; configuration not overwritten");
    if (!destinationUnchanged(paths, proposal)) throw new Error("Selected config destination changed during setup; configuration not overwritten");
    const path = join(proposal.destination.physicalParent, basename(proposal.destination.path));
    const previous = jsonFile(path);
    const text = JSON.stringify({ ...previous, ...proposal.config }, null, 2) + "\n";
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) { atomicJsonOrText(path, text); changed = true; }
    journal.configState = "complete";
    if (changed) saveJournal();
    return result(undefined, changed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const step of journal.steps) if (step.state === "running") { step.state = "failed"; step.error = message; }
    try { if (changed) saveJournal(); } catch {}
    return result(message, changed);
  }
}
