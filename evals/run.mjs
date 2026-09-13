import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch, release } from "node:os";
const root = fileURLToPath(new URL("../", import.meta.url));

export function summarizeTap(output, exitCode, minimumPasses) {
  const count = name => Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(output)?.[1] ?? NaN);
  const counts = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map(name => [name, count(name)]));
  const passed = exitCode === 0 && Object.values(counts).every(Number.isFinite) && counts.pass >= minimumPasses && counts.fail === 0 && counts.cancelled === 0 && counts.todo === 0 && counts.skipped === 0;
  return { status: passed ? "passed" : "failed", counts };
}
function sourceFingerprint() {
  const hash = createHash("sha256");
  const walk = path => readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    if (e.name === "node_modules" || e.name === ".poteto-mode-tools-install-key" || e.name === "results") return [];
    const file = `${path}/${e.name}`; return e.isDirectory() ? walk(file) : [file];
  });
  for (const file of ["README.md", "package.json", ...["pi", "pstack/skills", "tests", "evals", ".github/workflows"].flatMap(walk)].sort()) hash.update(file + "\0").update(readFileSync(join(root, file))).update("\0");
  return hash.digest("hex");
}
export function runEvaluations(outputPath) {
  const cases = JSON.parse(readFileSync(join(root, "evals/cases.json"), "utf8"));
  const version = command => {
    const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 10000 });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const report = {
    schemaVersion: 1, observedAt: new Date().toISOString(), mode: "deterministic-fixtures-only", releaseQualified: false,
    environment: { platform: platform(), arch: arch(), osRelease: release(), node: process.version, npm: version("npm"), bun: version("bun"), pi: version("pi"), childBoundary: process.env.PI_SUBAGENT_CHILD === "1" },
    source: { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), dirty: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), sha256: sourceFingerprint(), fingerprintExcludes: ["node_modules", "helper install marker", "evals/results"] },
    modelRequests: 0, tokenUse: null, tokenUseReason: "No model calls; token usage is not measured by these fixture tests.",
    optimizationClaim: "None: no paired live baseline or comparative token/latency evidence.",
    cases: [],
  };
  for (const item of cases) {
    const args = ["--import", "./tests/host-loader.mjs", "--test", "--test-reporter=tap", `--test-name-pattern=${item.pattern}`, item.file];
    const started = performance.now();
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PI_OFFLINE: "1", npm_config_offline: "true", npm_config_update_notifier: "false" } });
    const latencyMs = Math.round((performance.now() - started) * 1000) / 1000;
    report.cases.push({ ...item, ...summarizeTap(result.stdout ?? "", result.status, item.minimumPasses), command: ["node", ...args], latencyMs, latencyScope: "wall-clock test subprocess including SDK load, not model/task latency", exitCode: result.status, infrastructureError: result.error?.message ?? null, toolFailures: null, toolFailuresReason: "No live tool telemetry; asserted injected failures are fixture evidence, not measured live tool failure counts.", modelRequests: 0, tokenUse: null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  }
  report.status = report.cases.every(item => item.status === "passed") ? "passed" : "failed";
  mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node evals/run.mjs <results.json> (explicit output required; no installs or model calls)");
  const report = runEvaluations(resolve(process.argv[2]));
  console.log(`${report.status}: ${report.cases.length} fixture cases; releaseQualified=false; ${process.argv[2]}`);
  process.exitCode = report.status === "passed" ? 0 : 1;
}
