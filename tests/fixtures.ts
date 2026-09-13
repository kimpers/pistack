import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SetupPaths } from "../pi/lib/setup.ts";
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pistack-test-"));
  const paths: SetupPaths = { cwd: join(root, "project"), agentDir: join(root, "home", ".pi", "agent"), projectTrusted: true };
  mkdirSync(paths.cwd, { recursive: true }); mkdirSync(paths.agentDir, { recursive: true });
  const saved = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, PI_OFFLINE: process.env.PI_OFFLINE };
  process.env.HOME = join(root, "home"); process.env.PI_CODING_AGENT_DIR = paths.agentDir; process.env.PI_OFFLINE = "1";
  const write = (path: string, value: unknown) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2)); };
  const settings = (scope: "user" | "project", value: unknown) => write(join(scope === "user" ? paths.agentDir : join(paths.cwd, ".pi"), "settings.json"), value);
  const pkg = (directory: string, name: string, version: string, extensions = ["./index.ts"]) => { write(join(directory, "package.json"), { name, version, pi: { extensions, skills: [], prompts: [], themes: [] } }); write(join(directory, "index.ts"), "export default function () {}\n"); return directory; };
  return { root, paths, write, settings, pkg, cleanup() { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } rmSync(root, { recursive: true, force: true }); } };
}
