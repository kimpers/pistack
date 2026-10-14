import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "bun:test";
import { defaultModels } from "../../../../pi/lib/models.ts";
import { executionProfile, type ExecutionProfile } from "../../../../pi/lib/execution-profile.ts";

const checker = join(import.meta.dir, "check-plan.mjs");
const rule =
	"Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.";
const manual = "Manual continuation only. No goal or scheduler.";
const profile: ExecutionProfile = {
	version: 1,
	models: defaultModels(),
	available: ["fixture/model"],
	parent: { provider: "fixture", id: "model" },
	surface: "cli",
	continuation: "manual",
};

function plan(input: ExecutionProfile = profile) {
	const resolved = executionProfile(input);
	return `# Demo

## How to read this
One box is one unit of work and names the evidence. Check a box only when its evidence exists. See playbooks/.
${rule}

## Program checklist
### Arm the program
Wait for explicit go. Use native completion notifications and a status message.
${input.continuation === "manual" ? manual : "pi-goal is the sole continuation owner."}
${resolved.coverageApproval ?? ""}
${resolved.continuationApproval ?? ""}
### Spawn owners
### PR mechanics
### Verdict and merge
### Boot recipe

## PR 1
**Depends on.** None.
**Files.**
- [ ] Do the thing.
**Build.**
- [ ] Do the thing.
**You see.**
- [ ] Do the thing.
**Verify, unit.** ${rule}
- [ ] Check the thing.
**Verify, live.** ${rule} ${resolved.marker}
${Array.from({ length: resolved.scenarios }, (_, i) => `- [ ] Lane ${i + 1}. ${i === 0 ? "Regression lane against trunk. " : ""}Save \`lane-${i + 1}.log\`. Pass when evidence exists.`).join("\n")}
**Verify, perf.** ${rule}
- [ ] Metric. Recorded.
- [ ] Probe. Recorded.
- [ ] Baseline. Recorded.
- [ ] Rule. Recorded.
**Review gate.** Operator review.
- [ ] operator reads evidence
**Merge.**
- [ ] Merge when approved.

## Close the program
Close.

## Appendix Prototype evidence
Recorded.
`;
}

function runPlan(text: string, input: unknown = profile) {
	const directory = mkdtempSync(join(tmpdir(), "check-plan-test-"));
	const file = join(directory, "plan.md");
	const config = join(directory, "execution-profile.json");
	try {
		writeFileSync(file, text);
		const args = [checker, file];
		if (input !== null) {
			writeFileSync(config, typeof input === "string" ? input : JSON.stringify(input));
			args.push(config);
		}
		const result = spawnSync("node", args, { encoding: "utf8", timeout: 10000 });
		if (result.error) throw result.error;
		return result;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function accepts(text: string, input: ExecutionProfile = profile) {
	const result = runPlan(text, input);
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toContain("1 PR sections, 0 problems");
	expect(result.stderr).toBe("");
}

function rejects(text: string, diagnostic: string, input: unknown = profile, exit = 1) {
	const result = runPlan(text, input);
	expect(result.status, result.stderr).toBe(exit);
	expect(result.stderr).toContain(diagnostic);
}

const validPlan = plan();
const outsideHeading = '"## Example only" after Close the program is not an appendix';

test("accepts a manual Pi profile with inherited models and CLI evidence", () => {
	accepts(validPlan);
});

test("accepts backtick and tilde fences with zero to three spaces of indentation", () => {
	for (const delimiter of ["```", "~~~"]) for (const indent of ["", " ", "  ", "   "])
		accepts(validPlan + `${indent}${delimiter}markdown\n## Example only\n${indent}${delimiter}\n`);
});

test("accepts empty info strings and longer closing delimiters", () => {
	for (const delimiter of ["```", "~~~"])
		accepts(validPlan + `${delimiter}\n## Example only\n${delimiter}${delimiter}\n`);
});

test("accepts nested backticks and tilde info strings containing backticks", () => {
	accepts(validPlan + "````markdown\n```markdown\n## Example only\n```\n````\n");
	accepts(validPlan + "~~~markdown `info`\n## Example only\n ~~~\n");
});

test("keeps mismatched, shorter, suffixed and over-indented closers inside the fence", () => {
	for (const opening of ["````", "~~~~"]) {
		const other = opening[0] === "`" ? "~~~~" : "````";
		for (const falseClose of [other, opening.slice(1), `${opening} info`, `${opening}\tx`, `    ${opening}`, `\t${opening}`])
			accepts(validPlan + `${opening}markdown\n${falseClose}\n## Example only\n${opening}\n`);
	}
});

test("rejects headings after proper closes with spaces or tabs", () => {
	for (const delimiter of ["```", "~~~"]) for (const suffix of ["", "  ", "\t", " \t "])
		rejects(validPlan + `${delimiter}markdown\n## Example only\n${delimiter}${suffix}\n## Example only\n`, outsideHeading);
});

test("ignores code prose but checks prose after a proper close", () => {
	for (const delimiter of ["```", "~~~"]) {
		const example = `${delimiter}markdown\nColon: code — “quote”\n${delimiter}\n`;
		accepts(validPlan + example);
		for (const [prose, diagnostic] of [["Colon: prose", "mid-sentence colon"], ["Long — dash", "long dash"], ["Curly “quote”", "curly quote"]])
			rejects(validPlan + example + prose + "\n", diagnostic);
	}
});

test("rejects backtick info strings containing a backtick", () => {
	rejects(validPlan + "```markdown `invalid`\n## Example only\n```\n", outsideHeading);
});

test("does not open fences with four spaces, tabs, or fewer than three delimiters", () => {
	for (const opening of ["    ```", "    ~~~", "\t```", "\t~~~", "``", "~~"])
		rejects(validPlan + `${opening}\n## Example only\n`, outsideHeading);
});

test("keeps unclosed fenced examples as code through end of file", () => {
	for (const opening of ["```", "~~~"])
		accepts(validPlan + `${opening}\n## Example only\nColon: code\n`);
});

test("requires an execution profile argument and rejects invalid profile input", () => {
	rejects(validPlan, "Usage: node check-plan.mjs <plan.md> <execution-profile.json>", null, 2);
	for (const invalid of ["{", {}, { ...profile, version: 2 }, { ...profile, available: [] }])
		rejects(validPlan, "Invalid execution profile:", invalid, 2);
});

test("requires each native program marker independently", () => {
	for (const marker of ["status message", "explicit go", "native completion notifications"])
		rejects(validPlan.replace(marker, "omitted"), `Program checklist lacks "${marker}"`);
});

test("requires the manual continuation and exact live profile markers", () => {
	rejects(validPlan.replace(manual, "Manual work."), `Program lacks "${manual}"`);
	rejects(validPlan.replace(executionProfile(profile).marker, "Unapproved marker."), "Verify, live lacks");
});

test("rejects manual /loop with an otherwise valid execution profile and plan", () => {
	accepts(validPlan);
	rejects(validPlan.replace(manual, `${manual} Run /loop 1h.`), "Manual profile must not arm a goal or periodic continuation");
});

test("retains manual goal and periodic-continuation rejection", () => {
	for (const instruction of ["Run /goal.", "Use create_goal.", "Use a 30-minute tick."])
		rejects(validPlan.replace(manual, `${manual} ${instruction}`), "Manual profile must not arm a goal or periodic continuation");
});

test("requires changed coverage approval in both the profile and plan", () => {
	const approved: ExecutionProfile = { ...profile, scenarios: 3, coverageApproval: "receipt-coverage" };
	accepts(plan(approved), approved);
	rejects(plan(approved), "Changed coverage requires explicit user approval evidence", { ...approved, coverageApproval: undefined }, 2);
	rejects(plan(approved).replace("receipt-coverage", "omitted"), 'Program lacks approval evidence "receipt-coverage"', approved);
});

test("requires pi-goal approval and sole-owner marker in the plan", () => {
	const approved: ExecutionProfile = { ...profile, continuation: "pi-goal", continuationApproval: "receipt-goal" };
	accepts(plan(approved), approved);
	rejects(plan(approved), "pi-goal requires explicit continuation approval evidence", { ...approved, continuationApproval: undefined }, 2);
	rejects(plan(approved).replace("receipt-goal", "omitted"), 'Program lacks approval evidence "receipt-goal"', approved);
	rejects(plan(approved).replace("pi-goal is the sole continuation owner.", "Autonomous work."), 'Program lacks "pi-goal is the sole continuation owner."', approved);
});
