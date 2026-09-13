import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export function filesUnder(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if ([".git", "node_modules"].includes(entry.name)) return [];
    return entry.isDirectory() ? filesUnder(root, path) : [path];
  });
}

// Release-fixture checks only; Git remains the updater. No import/apply/install API.
export function auditPackage(root: string): string[] {
  const problems: string[] = [], files = filesUnder(root), inventory = new Set(files);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deferred = /(?:^|\/)(?:make-bot-ui|benny)(?:\/|$)/;
  if (inventory.has("README.md") && inventory.has("pi/UPSTREAM.md")) {
    const provenance = readFileSync(join(root, "pi/UPSTREAM.md"), "utf8");
    const baseline = /Imported baseline: `([a-f0-9]{40})`/.exec(provenance)?.[1];
    if (!baseline) problems.push("Missing imported baseline");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const upstreamLinks = [...readme.matchAll(/https:\/\/github\.com\/cursor\/plugins\/tree\/([^/]+)\//g)];
    if (!upstreamLinks.length) problems.push("Missing upstream README pins");
    for (const link of upstreamLinks) {
      if (link[1] !== baseline) problems.push(`Stale upstream README pin: ${link[1]}`);
    }
  }
  for (const kind of ["extensions", "skills", "prompts", "themes"]) {
    const entries = manifest.pi?.[kind];
    if (!Array.isArray(entries)) { problems.push(`Missing explicit ${kind} allowlist`); continue; }
    for (const path of entries) {
      if (typeof path !== "string" || /[*?!\[\]{}]/.test(path) || path.startsWith("/")) { problems.push(`Non-explicit ${kind} resource: ${path}`); continue; }
      const normalized = relative(root, resolve(root, path));
      if (normalized.startsWith("..") || deferred.test(normalized)) problems.push(`Forbidden resource: ${path}`);
      if (!inventory.has(normalized)) problems.push(`Missing resource: ${path}`);
    }
  }
  const selected = new Set((manifest.pi?.skills ?? []).map((p: string) => p.replace(/^\.\//, "")));
  for (const path of files.filter(p => /^pstack\/skills\/[^/]+\/SKILL\.md$/.test(p) && !deferred.test(p))) {
    if (!selected.has(path)) problems.push(`Unreviewed new skill: ${path}`);
  }
  for (const file of files.filter(p => p.endsWith(".md") && !deferred.test(p))) {
    const body = readFileSync(join(root, file), "utf8").replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
    for (const match of body.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (file === "pstack/skills/why/references/synthesizer-prompt.md" && target === "url") continue;
      const destination = relative(root, resolve(root, dirname(file), target));
      if (destination.startsWith("..") || deferred.test(destination) || !existsSync(join(root, destination))) problems.push(`Broken packaged link: ${file} -> ${target}`);
    }
  }
  for (const file of files.filter(p => /\.(?:ts|mjs)$/.test(p))) {
    const body = readFileSync(join(root, file), "utf8");
    for (const match of body.matchAll(/(?:from\s*|import\s*\(|import\s*)["'](\.[^"']+)["']/g)) {
      const target = relative(root, resolve(root, dirname(file), match[1]));
      if (target.startsWith("..") || !existsSync(join(root, target))) problems.push(`Missing adapter import: ${file} -> ${match[1]}`);
    }
  }
  return problems;
}

export function upstreamChanges(repo: string, before: string, after: string) {
  const output = execFileSync("git", ["-C", repo, "diff", "--no-renames", "--name-status", before, after], { encoding: "utf8" });
  const changes = output.trim().split("\n").filter(Boolean).map(line => {
    const [status, path] = line.split("\t"); return { status, path };
  });
  return {
    skills: changes.filter(c => /^pstack\/skills\/[^/]+\/SKILL\.md$/.test(c.path)),
    adapterDependencies: changes.filter(c => /(?:^|\/)(?:package\.json|bun\.lock|plugin\.json)$/.test(c.path) || c.path === "pi/dependencies.json" || /^(?:pstack\/agents|pi\/(?:agents|lib|extensions))\//.test(c.path)),
    portableContent: changes.filter(c => /\/(?:references|playbooks)\//.test(c.path)),
    changes,
  };
}
