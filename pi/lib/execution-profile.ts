import { parseModels, resolveRole, type ModelConfig, type ModelIdentity } from "./models.ts";

export interface ExecutionProfile {
  version: 1;
  models: ModelConfig;
  available: string[];
  parent: ModelIdentity;
  scenarios?: number;
  coverageApproval?: string;
  surface: "visual" | "cli" | "api";
  continuation: "manual" | "pi-goal";
  continuationApproval?: string;
}
/** Availability is a setup snapshot, not a successful worker launch or provider authentication. */
export function executionProfile(value: unknown) {
  const p = value as ExecutionProfile;
  if (!p || p.version !== 1 || !Array.isArray(p.available) || p.available.some(id => typeof id !== "string" || !id) ||
      !p.parent || typeof p.parent.provider !== "string" || typeof p.parent.id !== "string" ||
      !["visual", "cli", "api"].includes(p.surface) || !["manual", "pi-goal"].includes(p.continuation)) throw new Error("Invalid execution profile");
  const config = parseModels(p.models);
  const panel = resolveRole(config, "swarm workers", p.available, p.parent);
  const scenarios = p.scenarios ?? 10;
  if (!Number.isSafeInteger(scenarios) || scenarios < 1 || scenarios > 100) throw new Error("Scenario count must be 1–100");
  const evidence = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && !/[\r\n]/.test(s);
  if (scenarios !== 10 && !evidence(p.coverageApproval)) throw new Error("Changed coverage requires explicit user approval evidence");
  if (p.continuation === "pi-goal" && !evidence(p.continuationApproval)) throw new Error("pi-goal requires explicit continuation approval evidence");
  const laneModels = Array.from({ length: scenarios }, (_, i) => panel.models[i % panel.models.length]);
  const sameModel = new Set(laneModels).size < scenarios;
  const marker = `${scenarios} scenarios at the PR head. Models ${panel.models.map(m => `\`${m}\``).join(", ")}. Concurrency ${panel.concurrency}. ${sameModel ? "Same-model lanes are not multi-model diversity." : "Distinct model IDs do not prove family diversity."}`;
  return { ...panel, scenarios, sameModel, marker, surface: p.surface, continuation: p.continuation,
    coverageApproval: scenarios !== 10 ? p.coverageApproval : undefined, continuationApproval: p.continuationApproval };
}
