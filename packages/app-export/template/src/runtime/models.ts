/**
 * The model choices a `ModelSelect` offers. An exported app has no provider
 * catalog to ask, so it offers every model reference its own graphs already
 * use, grouped by kind (`language_model`, `image_model`, ...).
 */
import type { ApplicationBundle } from "@nodetool-ai/app-runtime";

export interface ModelRef {
  type: string;
  id: string;
  provider?: string;
  name?: string;
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isModelRef = (value: unknown): value is ModelRef =>
  isRecord(value) &&
  typeof value.type === "string" &&
  value.type.endsWith("_model") &&
  typeof value.id === "string" &&
  value.id !== "";

export function collectModelRefs(bundle: ApplicationBundle): Record<string, ModelRef[]> {
  const byKind: Record<string, ModelRef[]> = {};
  const seen = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if (isModelRef(value)) {
      const key = `${value.type}:${value.provider ?? ""}:${value.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        (byKind[value.type] ??= []).push(value);
      }
      return;
    }
    for (const entry of Object.values(value)) visit(entry, depth + 1);
  };
  for (const workflow of bundle.workflows) visit(workflow.graph.nodes, 0);
  return byKind;
}
