import { execFileSync } from "node:child_process";
import type { FrontierPr } from "./store.ts";

export type FrontierCommand = (command: string, args: readonly string[], repo: string) => string;
const command: FrontierCommand = (name, args, cwd) => execFileSync(name, [...args], {
  cwd, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
});
const fields = "number,headRefName,baseRefName,headRefOid,state,isCrossRepository";
interface ForgePr extends FrontierPr { base: string }
function parsePr(value: unknown): ForgePr {
  if (!value || typeof value !== "object") throw new Error("Invalid gh PR row");
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.number) || Number(row.number) < 1 ||
      typeof row.headRefName !== "string" || !row.headRefName || /[\s\x00-\x1f]/.test(row.headRefName) ||
      typeof row.baseRefName !== "string" || !row.baseRefName ||
      typeof row.headRefOid !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(row.headRefOid) ||
      !["OPEN", "MERGED", "CLOSED"].includes(String(row.state)) || row.isCrossRepository !== false)
    throw new Error("Invalid or cross-repository gh PR evidence");
  return { pr: Number(row.number), branches: row.headRefName, base: row.baseRefName,
    sha: row.headRefOid, state: row.state as ForgePr["state"] };
}
function unique(rows: readonly ForgePr[]) {
  if (new Set(rows.map(r => r.pr)).size !== rows.length || new Set(rows.map(r => r.branches)).size !== rows.length)
    throw new Error("Ambiguous duplicate PR/head in frontier");
}
function order(rows: readonly ForgePr[], seed: number): ForgePr[] {
  unique(rows);
  let row = rows.find(r => r.pr === seed);
  if (!row) throw new Error("Current PR missing from open frontier; supply frozen --prs");
  const seen = new Set<number>();
  while (true) {
    if (seen.has(row.pr)) throw new Error("Cyclic frontier");
    seen.add(row.pr);
    const parent = rows.find(r => r.branches === row!.base);
    if (!parent) break;
    row = parent;
  }
  const result: ForgePr[] = []; seen.clear();
  while (row) {
    if (seen.has(row.pr)) throw new Error("Cyclic frontier");
    seen.add(row.pr); result.push(row);
    const children = rows.filter(r => r.base === row!.branches);
    if (children.length > 1) throw new Error("Ambiguous branching frontier; supply a frozen linear --prs list");
    row = children[0];
  }
  return result;
}
/** Fresh gh topology and forge SHAs, never local Graphite metadata or local branch guesses. */
export function resolveFrontier(repo: string, pin?: readonly number[], run: FrontierCommand = command): readonly FrontierPr[] {
  if (pin && (!pin.length || pin.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(pin).size !== pin.length))
    throw new Error("--prs requires a nonempty unique ordered PR list");
  const read = (): ForgePr[] => {
    if (pin) {
      const rows = pin.map(n => parsePr(JSON.parse(run("gh", ["pr", "view", String(n), "--json", fields], repo))));
      unique(rows);
      if (rows.some((r, i) => r.pr !== pin[i])) throw new Error("frontier pin mismatch");
      for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1], current = rows[i];
        // GitHub may retarget a child to trunk after its parent merges.
        if (current.base !== previous.branches && !(previous.state === "MERGED" && current.base === rows[0].base))
          throw new Error("frontier pin mismatch: base-branch order changed");
      }
      if (rows.some((r, i) => rows.slice(i + 1).some(next => next.branches === r.base))) throw new Error("Cyclic frontier pin");
      return rows;
    }
    const seed = parsePr(JSON.parse(run("gh", ["pr", "view", "--json", fields], repo)));
    const raw: unknown = JSON.parse(run("gh", ["pr", "list", "--state", "open", "--limit", "1000", "--json", fields], repo));
    if (!Array.isArray(raw) || raw.length >= 1000) throw new Error("Incomplete/bounded gh frontier; use frozen --prs");
    return order(raw.map(parsePr), seed.pr);
  };
  const first = read(), fresh = read();
  if (JSON.stringify(first) !== JSON.stringify(fresh)) throw new Error("Frontier changed during observation; retry before recording");
  return fresh.map(({ base: _base, ...pr }) => pr);
}
