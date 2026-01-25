import { NodeTypes } from "@xyflow/react";
import { Property, UnifiedModel, NodeMetadata } from "../stores/ApiTypes";
import BaseNode from "../components/node/BaseNode";
import { client } from "../stores/ApiClient";
import useMetadataStore from "../stores/MetadataStore";
import { createConnectabilityMatrix } from "../components/node_menu/typeFilterUtils";

const STRING_INPUT_NODE_TYPE = "nodetool.input.StringInput";
const DEFAULT_STRING_INPUT_MAX_LENGTH = 100000;

const upsertProperty = (properties: Property[], next: Property): Property[] => {
  const idx = properties.findIndex((p) => p.name === next.name);
  if (idx === -1) {
    return [...properties, next];
  }
  const merged = { ...properties[idx], ...next } satisfies Property;
  const copy = [...properties];
  copy[idx] = merged;
  return copy;
};

const patchStringInputMetadata = (md: NodeMetadata): NodeMetadata => {
  if (md.node_type !== STRING_INPUT_NODE_TYPE) {
    return md;
  }

  const base = md.properties ?? [];

  const lineModeProperty: Property = {
    name: "line_mode",
    title: "Line mode",
    description: "Choose between a single-line input or a multiline text area.",
    required: false,
    default: "single_line",
    type: {
      type: "enum",
      optional: true,
      values: ["single_line", "multiline"],
      type_args: [],
      type_name: null
    }
  };

  const maxLengthProperty: Property = {
    name: "max_length",
    title: "Max length",
    description:
      "Maximum number of characters allowed. Use 0 for unlimited.",
    required: false,
    default: DEFAULT_STRING_INPUT_MAX_LENGTH,
    min: 0,
    max: null,
    type: {
      type: "int",
      optional: true,
      values: null,
      type_args: [],
      type_name: null
    }
  };

  const patchedProperties = upsertProperty(
    upsertProperty(base, lineModeProperty),
    maxLengthProperty
  );

  return {
    ...md,
    properties: patchedProperties
  };
};

const defaultMetadata: Record<string, NodeMetadata> = {
  "nodetool.workflows.base_node.Preview": {
    title: "Preview",
    description: "Preview",
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Preview",
    layout: "default",
    basic_fields: [],
    is_dynamic: false,
    properties: [
      {
        name: "value",
        type: {
          type: "any",
          optional: true,
          type_args: []
        },
        required: false
      }
    ],
    outputs: [],
    the_model_info: {},
    recommended_models: [],
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false
  }
};

export const loadMetadata = async () => {
  const { data, error } = await client.GET("/api/nodes/metadata", {});
  if (error) {
    console.error(error);
    return "error";
  }

  const nodeTypes: NodeTypes = {};
  const metadataByType: Record<string, NodeMetadata> = { ...defaultMetadata };
  
  data.forEach((md: NodeMetadata) => {
    const patched = patchStringInputMetadata(md);
    nodeTypes[md.node_type] = BaseNode;
    metadataByType[patched.node_type] = patched;
  });

  const recommendedModels = data.reduce<UnifiedModel[]>(
    (result, md) => [...result, ...md.recommended_models],
    []
  );

  // deduplicate by type, repo_id, path
  const uniqueRecommendedModels = Array.from(
    recommendedModels.reduce((acc, model) => {
      const key = `${model.type ?? ""}:${model.repo_id ?? ""}:${
        model.path ?? ""
      }`;
      if (!acc.has(key)) {
        acc.set(key, model);
      }
      return acc;
    }, new Map<string, UnifiedModel>()).values()
  );

  useMetadataStore.getState().setMetadata(metadataByType);
  useMetadataStore.getState().setRecommendedModels(uniqueRecommendedModels);
  useMetadataStore.getState().setNodeTypes(nodeTypes);

  createConnectabilityMatrix(Object.values(metadataByType));

  return "success";
};
