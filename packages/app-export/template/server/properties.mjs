import { operationTarget, parseBinding } from "@nodetool-ai/app-runtime";

export function applyPropertyOverrides(bundle, workflow, operationId, overrides = {}) {
  if (Object.keys(overrides).length === 0) return workflow.graph;
  const operation = bundle.app.operations.find((entry) => entry.id === operationId);
  const target = operation && operationTarget(operation);
  if (!target || target.kind !== "workflow" || target.workflowId !== workflow.key) throw new Error("Invalid property override operation");
  const allowed = new Set();
  function visit(value) {
    if (typeof value === "string") {
      const ref = parseBinding(value);
      if (ref?.kind === "nodeProperty" && (ref.operationId === operationId || ref.operationId === "")) allowed.add(`${ref.nodeId}#${ref.property}`);
    } else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  }
  visit(bundle.app.ui);
  const byNode = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowed.has(key) || value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Property override is not exposed by this application");
    if (Object.keys(value).length !== 1 || !Object.hasOwn(value, "value")) throw new Error("Invalid property override");
    const separator = key.lastIndexOf("#");
    const nodeId = key.slice(0, separator);
    const properties = byNode.get(nodeId) ?? new Map();
    properties.set(key.slice(separator + 1), value.value);
    byNode.set(nodeId, properties);
  }
  return {
    ...workflow.graph,
    nodes: workflow.graph.nodes.map((node) => {
      const data = { ...(node.properties ?? node.data ?? {}), ...Object.fromEntries(byNode.get(node.id) ?? []) };
      return { ...node, ...(node.properties ? { properties: data } : { data }) };
    })
  };
}
