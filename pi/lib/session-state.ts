export const STATE_TYPE = "pistack-state-v1";
export interface ChecklistItem { id: number; text: string; status: "pending" | "done" | "skipped"; reason?: string }
export interface ModeState { version: 1; enabled: boolean; playbook: string; items: ChecklistItem[]; nextId: number }
export function emptyState(): ModeState { return { version: 1, enabled: false, playbook: "", items: [], nextId: 1 }; }
export function parseState(value: unknown): ModeState {
  const data = value as ModeState;
  if (!data || data.version !== 1 || typeof data.enabled !== "boolean" || typeof data.playbook !== "string" || data.playbook.length > 200 || !Array.isArray(data.items) || data.items.length > 100 || !Number.isSafeInteger(data.nextId) || data.nextId < 1) throw new Error("Invalid piStack session state");
  const ids = new Set<number>();
  for (const item of data.items) {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id >= data.nextId || ids.has(item.id) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 2000 || !["pending", "done", "skipped"].includes(item.status) || (item.status === "skipped" && (typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 2000))) throw new Error("Invalid piStack checklist item");
    ids.add(item.id);
  }
  return structuredClone(data);
}
/** Read the full active ancestry, never all entries or the compacted message window. */
export function restoreState(branch: readonly { type: string; customType?: string; data?: unknown }[]): ModeState {
  let state = emptyState();
  for (const entry of branch) if (entry.type === "custom" && entry.customType === STATE_TYPE) state = parseState(entry.data);
  return state;
}
export type ChecklistAction = { action: "list" } | { action: "start"; playbook: string; steps: string[] } | { action: "add"; text: string } | { action: "set"; id: number; status: ChecklistItem["status"]; reason?: string };
export function updateChecklist(current: ModeState, action: ChecklistAction): ModeState {
  const state = structuredClone(current);
  switch (action.action) {
    case "list": break;
    case "start":
      state.playbook = action.playbook;
      state.items = action.steps.map(text => ({ id: state.nextId++, text, status: "pending" }));
      break;
    case "add": state.items.push({ id: state.nextId++, text: action.text, status: "pending" }); break;
    case "set": {
      const item = state.items.find(item => item.id === action.id);
      if (!item) throw new Error(`Unknown checklist item ${action.id}`);
      item.status = action.status;
      item.reason = action.status === "skipped" ? action.reason : undefined;
      break;
    }
  }
  return parseState(state);
}
export function formatState(state: ModeState): string {
  return [`piStack ${state.enabled ? "ON (/pistack off)" : "OFF"}${state.playbook ? ` · ${state.playbook}` : ""}`, ...state.items.map(item => `[${item.status}] #${item.id} ${item.text}${item.reason ? ` — skip: ${item.reason}` : ""}`)].join("\n");
}
