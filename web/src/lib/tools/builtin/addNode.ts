import { z } from "zod";
import { uiAddNodeParams } from "@nodetool-ai/protocol";
import { valueMatchesType } from "../../../utils/TypeHandler";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

const addNodeParametersSchema = z.object(uiAddNodeParams);

FrontendToolRegistry.register({
  name: "ui_add_node",
  description:
    "Add a single node to the current workflow graph. Required: `id`, `type`, `position`. Optional: `properties`.",
  parameters: addNodeParametersSchema,
  async execute({ id, type, position, properties, workflow_id }, ctx) {
    const getFallbackPosition = (index: number) => ({
      x: 120 + (index % 6) * 240,
      y: 120 + Math.floor(index / 6) * 160
    });

    // `position` is typed as `{x,y} | string` because some models emit it as
    // a JSON string or "x,y". Normalize before handing to the node store.
    const normalizePosition = (
      input: unknown,
      fallbackIndex: number
    ): { x: number; y: number } => {
      if (typeof input === "object" && input !== null) {
        const maybe = input as { x?: unknown; y?: unknown };
        if (typeof maybe.x === "number" && typeof maybe.y === "number") {
          return { x: maybe.x, y: maybe.y };
        }
      }

      if (typeof input === "string") {
        const trimmed = input.trim();

        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed) as unknown;
            return normalizePosition(parsed, fallbackIndex);
          } catch {
            // fall through
          }
        }

        const numericPairs = trimmed.match(/-?\d+(?:\.\d+)?/g);
        if (numericPairs && numericPairs.length >= 2) {
          const x = Number(numericPairs[0]);
          const y = Number(numericPairs[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
          }
        }
      }

      return getFallbackPosition(fallbackIndex);
    };

    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const metadata = state.nodeMetadata[type];
    if (!metadata) {
      const allTypes = Object.keys(state.nodeMetadata);
      const lower = type.toLowerCase();
      // Suggest by: (a) shared last segment (e.g. "TextGenerator" matches
      // anything ending in TextGenerator), (b) substring on the basename, then
      // (c) substring on the whole id. Cheap, no extra deps, and good enough
      // to nudge the model to a real type without forcing another search round.
      const basename = (t: string) =>
        t.includes(".") ? t.slice(t.lastIndexOf(".") + 1) : t;
      const targetBase = basename(type).toLowerCase();
      const exactBase = allTypes.filter(
        (t) => basename(t).toLowerCase() === targetBase
      );
      const baseContains = allTypes.filter((t) =>
        basename(t).toLowerCase().includes(targetBase)
      );
      const fullContains = allTypes.filter((t) =>
        t.toLowerCase().includes(lower)
      );
      const suggestions = Array.from(
        new Set([...exactBase, ...baseContains, ...fullContains])
      ).slice(0, 8);
      const hint = suggestions.length
        ? ` Did you mean: ${suggestions.join(", ")}?`
        : " Use ui_search_nodes to find the correct type.";
      throw new Error(`Node type not found: ${type}.${hint}`);
    }

    const normalizedPosition = normalizePosition(
      position,
      nodeStore.nodes.length
    );

    const resolvedProperties: Record<string, unknown> = { ...(properties ?? {}) };
    for (const property of metadata.properties) {
      const value = resolvedProperties[property.name];
      if (value === undefined) {
        resolvedProperties[property.name] = property.default;
      } else {
        const matches = valueMatchesType(value, property.type);
        if (!matches) {
          throw new Error(
            `Value for property ${property.name} does not match type ${property.type}`
          );
        }
      }
    }

    nodeStore.addNode({
      id,
      type,
      position: normalizedPosition,
      parentId: "",
      selected: false,
      dragHandle: "",
      expandParent: true,
      style: {
        width: 200,
        height: undefined
      },
      zIndex: 0,
      data: {
        properties: resolvedProperties,
        dynamic_properties: {},
        dynamic_outputs: {},
        sync_mode: "on_any",
        workflow_id: workflowId,
        selectable: true
      }
    });

    const warnings: string[] = [];
    for (const property of metadata.properties) {
      if (!property.required) continue;
      const wasExplicitlyProvided =
        properties !== undefined && property.name in properties;
      if (wasExplicitlyProvided) continue;

      const value = resolvedProperties[property.name];
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0)
      ) {
        warnings.push(
          `Required property '${property.name}' is not set. Use ui_update_node_data to set it.`
        );
      }
    }

    if (warnings.length > 0) {
      return { ok: true, warnings };
    }
    return { ok: true };
  }
});
