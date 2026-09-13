import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./fixtures.ts";
import { summarizeTap } from "../evals/run.mjs";

test("eval bug-fix fixture executes expected red then green without confusing red with acceptance", () => {
  const f = fixture(); try {
    const source = join(f.root, "pages.cjs"), proof = join(f.root, "pages.test.cjs");
    f.write(source, "exports.pages = (total, size) => Math.floor(total / size);\n");
    f.write(proof, "const assert = require('node:assert/strict'); const { pages } = require('./pages.cjs'); assert.equal(pages(11, 10), 2); assert.equal(pages(20, 10), 2); assert.equal(pages(0, 10), 0); console.log('boundary regression passed');\n");
    const run = () => spawnSync(process.execPath, [proof], { encoding: "utf8", timeout: 10000 });
    const red = run(); assert.equal(red.status, 1); assert.match(red.stderr, /ERR_ASSERTION/);
    f.write(source, readFileSync(source, "utf8").replace("Math.floor", "Math.ceil"));
    const green = run(); assert.equal(green.status, 0); assert.match(green.stdout, /boundary regression passed/);
    const tdd = readFileSync("pstack/skills/tdd/SKILL.md", "utf8"); assert.match(tdd, /fail/i); assert.match(tdd, /pass/i);
  } finally { f.cleanup(); }
});

test("eval harness fails closed on missing coverage, malformed TAP, skipped proof, failures or command errors", () => {
  const green = "# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(summarizeTap(green, 0, 1).status, "passed");
  for (const [output, code, minimum] of [[green, 1, 1], [green, null, 1], [green, 0, 2], ["", 0, 1], [green.replace("# skipped 0", "# skipped 1"), 0, 1], [green.replace("# fail 0", "# fail 1"), 0, 1], [green.replace("# cancelled 0", "# cancelled 1"), 0, 1]] as const) assert.equal(summarizeTap(output, code, minimum).status, "failed");
  const cases = JSON.parse(readFileSync("evals/cases.json", "utf8"));
  assert.deepEqual(cases.map((c: any) => c.id), ["bug-fix", "review", "ui-proof", "autonomous-pause-resume", "reflection"]);
  for (const item of cases) { assert.ok(item.liveGate.includes("not been observed")); assert.ok(item.minimumPasses > 0); assert.ok(readFileSync(item.file, "utf8").length); }
});

test("release CI is manual approval-gated on both hosted platforms with candidate pins and no publication or live credentials", () => {
  const workflow = readFileSync(".github/workflows/pistack.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/); assert.match(workflow, /default: false/);
  assert.match(workflow, /if: \$\{\{ inputs\.approve_provisioning \}\}/);
  for (const platform of ["macos-15", "ubuntu-24.04"]) assert.ok(workflow.includes(platform));
  for (const version of ["26.0.0", "1.3.14", "0.85.1"]) assert.ok(workflow.includes(version));
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):|npm publish|git push|secrets\.|PI_SUBAGENT_CHILD:/m);
  assert.match(workflow, /evals\/installed-setup.ts/); assert.match(workflow, /bun run typecheck/);
  const f = fixture(); try {
    const refused = spawnSync(process.execPath, ["--import", "./tests/host-loader.mjs", "evals/installed-setup.ts"], { encoding: "utf8", timeout: 10000, env: { ...process.env, GITHUB_ACTIONS: "false", PISTACK_CI_PROVISION: "false" } });
    assert.notEqual(refused.status, 0); assert.match(refused.stderr, /only for the explicitly approved hosted CI job/);
    assert.equal(existsSync(join(f.paths.agentDir, "settings.json")), false);
  } finally { f.cleanup(); }
});
