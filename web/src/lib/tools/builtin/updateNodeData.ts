import { z } from "zod";
import { uiUpdateNodeDataParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { noNodeStoreError, resolveWorkflowId } from "./workflow";
import { deriveCodeIOUpdates } from "../../../utils/codeOutputInference";
import { isCodeNodeType } from "../../../utils/codeNodeHandles";
import { isObjectLike, isString } from "../../../utils/typePredicates";

const TYPED_MODEL_FIELDS = new Set([
  "language_model",
  "image_model",
  "tts_model",
  "asr_model",
  "embedding_model",
  "video_model"
]);

FrontendToolRegistry.register({
  name: "ui_update_node_data",
  description: "Update a node's properties (data.properties).",
  parameters: z.object(uiUpdateNodeDataParams),
  async execute({ node_id, data, workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw noNodeStoreError(state, workflowId);
    }

    const node = nodeStore.findNode(node_id);
    if (!node) {
      throw new Error(`Node not found: ${node_id}`);
    }

    // Narrowly catch the common LLM mistake: passing a bare string id for a
    // typed-model field. Everything else falls through to the store, which
    // tolerates loose shapes.
    const metadata = state.nodeMetadata[node.type ?? ""];
    const incomingProperties = (data as { properties?: Record<string, unknown> })
      ?.properties;
    if (metadata && incomingProperties && isObjectLike(incomingProperties)) {
      for (const property of metadata.properties) {
        const fieldType = property.type?.type;
        if (!fieldType || !TYPED_MODEL_FIELDS.has(fieldType)) continue;
        if (!(property.name in incomingProperties)) continue;
        const value = incomingProperties[property.name];
        if (!isString(value)) continue;
        throw new Error(
          `Property '${property.name}' is a ${fieldType} object, not a string. ` +
            `Pass the full object from ui_search_models, e.g. ` +
            `{ type: "${fieldType}", provider: "<provider>", id: "${value}", name: "...", repo_id: null }.`
        );
      }
    }

    // Split `properties` from the rest so we can merge property updates
    // instead of replacing the whole dict (the bare `updateNodeData` shallow-
    // merges into `data`, which would wipe untouched properties).
    const { properties: propsUpdate, ...restData } = data as {
      properties?: Record<string, unknown>;
      [key: string]: unknown;
    };
    if (Object.keys(restData).length > 0) {
      nodeStore.updateNodeData(node_id, restData);
    }
    if (propsUpdate && isObjectLike(propsUpdate)) {
      nodeStore.updateNodeProperties(node_id, propsUpdate);
    }
    if (
      isCodeNodeType(node.type) &&
      propsUpdate &&
      isString(propsUpdate.code)
    ) {
      const latest = nodeStore.findNode(node_id);
      nodeStore.updateNodeData(
        node_id,
        deriveCodeIOUpdates(
          propsUpdate.code,
          (latest?.data?.dynamic_properties || {}) as Record<string, unknown>,
          latest?.data?.dynamic_outputs || {}
        )
      );
    }
    return { ok: true, node_id };
  }
});
