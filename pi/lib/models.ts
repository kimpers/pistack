export const roleDefaults = {
  "feature, refactoring": 1,
  "bug-fix": 1,
  "perf-issue": 1,
  hillclimb: 1,
  "judgment and prose": 1,
  "hardest tasks": 1,
  "how explorer": 1,
  "how explainer": 1,
  "why investigators": 1,
  "why synthesizer": 1,
  "reflect tooling": 1,
  "reflect judgment, divergent, synthesizer": 1,
  "arena runners": 3,
  "arena cross-judge pool": 3,
  "swarm workers": 1,
  "architect runners": 3,
  "interrogate reviewers": 3,
} as const;
export type Role = keyof typeof roleDefaults;
export interface ModelIdentity { provider: string; id: string }
export const budgets = ["unlimited", "large", "medium", "small"] as const;
export type Budget = typeof budgets[number];
export const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Thinking = typeof thinkingLevels[number];
export interface ModelSupport extends ModelIdentity {
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<Thinking, string | null>>;
}
export interface ModelConfig {
  version: 1;
  roles: Record<Role, string[]> & { "how critics"?: string[] };
  concurrency: number;
  budget?: Budget;
  thinking?: Record<string, Thinking>;
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
  if (Object.keys(data.roles).some(role => role !== "how critics" && !Object.hasOwn(roleDefaults, role))) throw new Error("Unknown piStack model role");
  const retired = data.roles["how critics"];
  if (retired !== undefined && (!Array.isArray(retired) || !retired.length || retired.length > 32 || retired.some(m => typeof m !== "string" || !m.trim()))) throw new Error("Invalid retired how critics list");
  if (data.budget !== undefined && !budgets.includes(data.budget)) throw new Error("Invalid reasoning budget");
  if (data.thinking !== undefined && (!data.thinking || typeof data.thinking !== "object" || Array.isArray(data.thinking) || Object.entries(data.thinking).some(([id, level]) => !id.trim() || id === "inherit" || !thinkingLevels.includes(level)))) throw new Error("Invalid per-model thinking policy");
  return structuredClone(data);
}
export function validateAvailable(config: ModelConfig, available: readonly string[], parent?: ModelIdentity): string[] {
  const ids = new Set(available);
  return Object.keys(roleDefaults).flatMap(role => config.roles[role as Role].flatMap(m => m === "inherit" ? (parent && ids.has(modelId(parent)) ? [] : [`${role}: parent model unavailable`]) : ids.has(m) ? [] : [`${role}: unavailable model ${m}`]));
}
/** Explicit per-run models keep pi-subagents' user/project agent and model-scope authority intact. */
export function resolveRole(config: ModelConfig, role: Role, available: readonly string[], parent?: ModelIdentity, support: readonly ModelSupport[] = []) {
  if (!Object.hasOwn(roleDefaults, role)) throw new Error(`Unknown or retired model role: ${role}`);
  const models = config.roles[role].map(m => m === "inherit" ? parent && modelId(parent) : m);
  if (models.some(m => !m || !available.includes(m))) throw new Error(`Unavailable model for ${role}; run /pistack setup`);
  const runs = config.roles[role].map((selected, i) => {
    const model = models[i]!;
    if (selected === "inherit") return { model, selector: model, policy: "inherit native parent/agent effort" };
    const thinking = config.thinking?.[model];
    if (!thinking && config.budget && config.budget !== "unlimited") throw new Error(`Missing approved effort for ${model}; run /pistack setup`);
    if (thinking && !supportedThinking(support.find(m => modelId(m) === model)).includes(thinking)) throw new Error(`Unsupported or unknown thinking ${thinking} for ${model}; rerun /pistack setup`);
    return { model, selector: thinking ? `${model}:${thinking}` : model, thinking, policy: thinking ? "approved per-run effort" : "preserve native effort" };
  });
  return { models: models as string[], runs, budget: config.budget ?? "unlimited", concurrency: config.concurrency, distinctModels: new Set(models).size,
    diversity: new Set(models).size < models.length ? "Repeated model identities; independent contexts are not multi-model diversity." : "Distinct model IDs; model-family diversity is not inferred from names." };
}

export function validateModelPolicy(config: ModelConfig, available: readonly string[], parent?: ModelIdentity, support: readonly ModelSupport[] = []): string[] {
  return (Object.keys(roleDefaults) as Role[]).flatMap(role => {
    try { resolveRole(config, role, available, parent, support); return []; }
    catch (error) { return [`${role}: ${error instanceof Error ? error.message : String(error)}`]; }
  });
}

/** Public Pi models.md: holes through high use provider defaults; xhigh/max require a string. */
export function supportedThinking(model?: ModelSupport): Thinking[] {
  if (!model || typeof model.reasoning !== "boolean") return [];
  if (!model.reasoning) return ["off"];
  return thinkingLevels.filter(level => {
    const mapped = model.thinkingLevelMap?.[level];
    return typeof mapped === "string" || (mapped === undefined && level !== "xhigh" && level !== "max");
  });
}
/** Proposal only. Never mutates a saved profile or substitutes a model identity. */
export function proposeBudget(config: ModelConfig, budget: Budget, support: readonly ModelSupport[]) {
  const next = parseModels(config);
  next.budget = budget;
  const changes: string[] = [], errors: string[] = [];
  if (budget === "unlimited") return { config: next, changes, errors };
  const target = { large: "xhigh", medium: "high", small: "medium" }[budget] as Thinking;
  const ids = new Set(Object.keys(roleDefaults).flatMap(role => next.roles[role as Role]).filter(id => id !== "inherit"));
  next.thinking = { ...next.thinking };
  for (const id of ids) {
    const levels = supportedThinking(support.find(m => modelId(m) === id));
    const selected = thinkingLevels.filter(level => level !== "off" && thinkingLevels.indexOf(level) <= thinkingLevels.indexOf(target) && levels.includes(level)).at(-1);
    if (!selected) { errors.push(`${id}: no known supported reasoning level at or below ${target}; choose another budget or an explicit model/alias`); continue; }
    next.thinking[id] = selected;
    changes.push(`${id}: target ${target}, proposed ${selected}${selected !== target ? " (same-model supported downgrade; approval required)" : ""}`);
  }
  return { config: next, changes, errors };
}

export function retireModelRoles(config: ModelConfig): ModelConfig {
  const next = parseModels(config);
  delete next.roles["how critics"];
  return next;
}
