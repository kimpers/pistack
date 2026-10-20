import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicJsonOrText } from "./setup.ts";

export function readModeDefault(agentDir: string): boolean {
  const path = join(agentDir, "pistack-mode.json");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return false;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Mode default must be a regular file, not a symlink: ${path}`);
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || !("enabled" in value) || typeof value.enabled !== "boolean" || Object.keys(value).length !== 1) {
    throw new Error(`Invalid mode default in ${path}: expected {"enabled":boolean}`);
  }
  return value.enabled;
}

export function writeModeDefault(agentDir: string, enabled: boolean): void {
  readModeDefault(agentDir);
  atomicJsonOrText(join(agentDir, "pistack-mode.json"), JSON.stringify({ enabled }) + "\n");
}
