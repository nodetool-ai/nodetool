/**
 * Complete the model properties on a planner-authored node.
 *
 * The planner writes models as a bare `{provider, id}` pair — that is what the
 * system prompt asks for, and what `find_model` results look like. The node
 * property types (`language_model`, `image_model`, …) are richer: they carry a
 * `type` discriminator and a display `name`. Nothing at runtime notices the
 * difference, because model lookup only reads `provider` and `id`, so an
 * incomplete model survives execution and lands in the saved workflow, where
 * the editor has no discriminator to work with.
 *
 * The declared type comes from the registry rather than being assumed: a
 * TextToImage node's `model` is an `image_model`, not a `language_model`.
 */

import type { NodeMetadata } from "@nodetool-ai/node-sdk";

/** Registry surface this needs — a subset of NodeRegistry, so stubs work. */
export interface ModelPropertyRegistry {
  getMetadata(nodeType: string): NodeMetadata | undefined | null;
}

/** Property types whose values are model references. */
const MODEL_TYPE_SUFFIX = "_model";

function isBareModelRef(
  value: unknown
): value is { provider: string; id: string; name?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["provider"] === "string" &&
    typeof v["id"] === "string" &&
    typeof v["type"] !== "string"
  );
}

/**
 * Return `properties` with every model-typed value completed. Values that
 * already carry a `type`, and properties the registry doesn't describe as a
 * model, are returned untouched.
 */
export function normalizeModelProperties(
  nodeType: string,
  properties: Record<string, unknown> | undefined,
  registry: ModelPropertyRegistry
): Record<string, unknown> | undefined {
  if (!properties) return properties;

  const meta = registry.getMetadata(nodeType);
  if (!meta) return properties;

  let changed = false;
  const next: Record<string, unknown> = { ...properties };

  for (const [key, value] of Object.entries(properties)) {
    if (!isBareModelRef(value)) continue;

    const declared = meta.properties?.find((p) => p.name === key)?.type?.type;
    if (!declared || !declared.endsWith(MODEL_TYPE_SUFFIX)) continue;

    next[key] = {
      type: declared,
      provider: value.provider,
      id: value.id,
      // The planner drops the name `find_model` gave it; the id is the best
      // remaining label and is what the editor falls back to anyway.
      name: value.name ?? value.id,
      path: null,
      supported_tasks: []
    };
    changed = true;
  }

  return changed ? next : properties;
}
