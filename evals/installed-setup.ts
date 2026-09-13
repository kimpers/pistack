// Future consent-gated CI integration, NOT part of npm test or the offline eval runner.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { applyProposal, buildProposal, dependencyManifest, formatProposal, helperStatus, inspectSetup } from "../pi/lib/setup.ts";

assert.equal(process.env.GITHUB_ACTIONS, "true", "This installer is only for the explicitly approved hosted CI job");
assert.equal(process.env.PISTACK_CI_PROVISION, "true", "Provisioning consent is required; offline tests never call this script");
assert.ok(process.env.RUNNER_TEMP && process.env.HOME && process.env.PI_CODING_AGENT_DIR);
const temp = realpathSync(process.env.RUNNER_TEMP!);
for (const path of [process.env.HOME!, process.env.PI_CODING_AGENT_DIR!]) {
  mkdirSync(path, { recursive: true });
  const within = relative(temp, realpathSync(path));
  assert.ok(within && !within.startsWith("..") && !within.startsWith("/"), "Only isolated runner-temp homes may be provisioned");
}
assert.deepEqual(dependencyManifest.extensions.filter(d => d.required).map(d => `${d.name}@${d.version}`), ["pi-subagents@0.66.0", "pi-interactive-shell@0.15.2", "pi-goal@0.1.7"], "Candidate changes need workflow review");
const root = fileURLToPath(new URL("../", import.meta.url));
const paths = { cwd: join(temp, "pistack-setup-project"), agentDir: resolve(process.env.PI_CODING_AGENT_DIR!), projectTrusted: false };
mkdirSync(paths.cwd, { recursive: true });
const settingsPath = join(paths.agentDir, "settings.json");
assert.equal(existsSync(settingsPath), false, "Clean-host fixture must begin without settings");
writeFileSync(settingsPath, JSON.stringify({ packages: [root], theme: "dark", fixtureUnrelated: { preserve: true } }));
let inspection = await inspectSetup(paths);
const proposal = buildProposal(paths, inspection, "user", { ...inspection.config, optional: [], helpers: true });
assert.deepEqual(proposal.conflicts, []);
assert.equal(proposal.steps.length, 4, "Three core candidates and required locked Bun helpers");
console.log(formatProposal(proposal));
const installed = await applyProposal(paths, proposal, { approved: true, signal: AbortSignal.timeout(600000) });
console.log(JSON.stringify(installed)); assert.equal(installed.error, undefined); assert.equal(helperStatus().ready, true);
assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")).fixtureUnrelated, { preserve: true });
const before = readFileSync(settingsPath, "utf8");
inspection = await inspectSetup(paths);
const retry = buildProposal(paths, inspection, "user", inspection.config);
assert.deepEqual(retry.conflicts, []); assert.equal(retry.steps.length, 0); assert.equal(retry.reuse.length, 3);
const rerun = await applyProposal(paths, retry, { approved: true, run: async () => { throw new Error("Idempotent rerun must not install"); } });
assert.equal(rerun.error, undefined); assert.equal(rerun.changed, false); assert.equal(readFileSync(settingsPath, "utf8"), before);
const loader = new DefaultResourceLoader({ ...paths, settingsManager: SettingsManager.create(paths.cwd, paths.agentDir, { projectTrusted: false }) });
await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
assert.ok(loader.getSkills().skills.some(s => s.name === "poteto-mode"));
console.log("Real approved clean installation, existing-extension rerun and loaded core resources passed. Not authentication, child launch, goal continuation or browser/PTY proof.");
