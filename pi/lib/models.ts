export const roleDefaults = {
  "feature, refactoring": 1,
  "bug-fix": 1,
  "perf-issue": 1,
  hillclimb: 1,
  "judgment and prose": 1,
  "hardest tasks": 1,
  "how explorer": 1,
  "how explainer": 1,
  "how critics": 4,
  "why investigators": 1,
  "why synthesizer": 1,
  "reflect tooling": 1,
  "reflect judgment, divergent, synthesizer": 1,
  "arena runners": 4,
  "arena cross-judge pool": 4,
  "swarm workers": 1,
  "architect runners": 4,
  "interrogate reviewers": 4,
} as const;
export type Role = keyof typeof roleDefaults;
export interface ModelIdentity { provider: string; id: string }
export interface ModelConfig {
  version: 1;
  roles: Record<Role, string[]>;
  concurrency: number;
}
export function defaultModels(): ModelConfig {
  return { version: 1, roles: Object.fromEntries(Object.entries(roleDefaults).map(([role, count]) => [role, Array(count).fill("inherit")])) as ModelConfig["roles"], concurrency: 4 };
}
export function availableModelIds(available: readonly ModelIdentity[], scoped: readonly { model: ModelIdentity }[] = []): string[] {
  const allowed = new Set(available.map(modelId));
  return [...new Set((scoped.length ? scoped.map(s => s.model) : available).map(modelId).filter(id => allowed.has(id)))].sort();
}
export function modelId(model: ModelIdentity): string { return `${model.provider}/${model.id}`; }
export function parseModels(value: unknown): ModelConfig {
  const data = value as ModelConfig;
  if (!data || data.version !== 1 || !data.roles || typeof data.roles !== "object" || Array.isArray(data.roles)) throw new Error("Invalid piStack model configuration version/roles");
  if (!Number.isInteger(data.concurrency) || data.concurrency < 1 || data.concurrency > 32) throw new Error("Concurrency must be 1–32");
  for (const [role, count] of Object.entries(roleDefaults)) {
    const models = data.roles[role as Role];
    if (!Array.isArray(models) || !models.length || models.length > 32 || (count === 1 && models.length !== 1) || models.some(m => typeof m !== "string" || !m.trim())) throw new Error(`Invalid model list for ${role}`);
  }
  if (Object.keys(data.roles).some(role => !Object.hasOwn(roleDefaults, role))) throw new Error("Unknown piStack model role");
  return structuredClone(data);
}
export function validateAvailable(config: ModelConfig, available: readonly string[], parent?: ModelIdentity): string[] {
  const ids = new Set(available);
  return Object.entries(config.roles).flatMap(([role, models]) => models.flatMap(m => m === "inherit" ? (parent && ids.has(modelId(parent)) ? [] : [`${role}: parent model unavailable`]) : ids.has(m) ? [] : [`${role}: unavailable model ${m}`]));
}
/** Explicit per-run models keep pi-subagents' user/project agent and model-scope authority intact. */
export function resolveRole(config: ModelConfig, role: Role, available: readonly string[], parent?: ModelIdentity) {
  const models = config.roles[role].map(m => m === "inherit" ? parent && modelId(parent) : m);
  if (models.some(m => !m || !available.includes(m))) throw new Error(`Unavailable model for ${role}; run /pistack setup`);
  return { models: models as string[], concurrency: config.concurrency, distinctModels: new Set(models).size,
    diversity: new Set(models).size < models.length ? "Repeated model identities; independent contexts are not multi-model diversity." : "Distinct model IDs; model-family diversity is not inferred from names." };
}
