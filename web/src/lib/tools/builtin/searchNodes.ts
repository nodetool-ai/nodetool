import { z } from "zod";
import { uiSearchNodesParams } from "@nodetool/protocol";
import { computeSearchResults } from "../../../utils/nodeSearch";
import { FrontendToolRegistry } from "../frontendTools";

const booleanLikeOptional = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean().optional());

type SearchNodesArgs = {
  query: string;
  input_type?: string;
  output_type?: string;
  strict_match?: boolean;
  include_properties?: boolean;
  include_outputs?: boolean;
  limit?: number;
};

FrontendToolRegistry.register({
  name: "ui_search_nodes",
  description:
    "Search available node types from the metadata store by query/type filters. Always call this BEFORE `ui_add_node` to find the exact `node_type` string — node-type names cannot be guessed and there is no global list to memorize. Set `include_properties: true` and `include_outputs: true` to also see input property names and output port names (which you'll need for `ui_update_node_data` and `ui_connect_nodes`). Multiple query words are matched independently. Use broad category terms (e.g. \"image generate\", \"text format\") with limit=20.",
  parameters: z.object({
    ...uiSearchNodesParams,
    strict_match: booleanLikeOptional,
    include_properties: booleanLikeOptional,
    include_outputs: booleanLikeOptional,
  }),
  async execute(args: SearchNodesArgs, ctx) {
    const state = ctx.getState();
    const metadata = Object.values(state.nodeMetadata ?? {});

    const query = args.query.trim();
    const includeProperties = Boolean(args.include_properties);
    const includeOutputs = Boolean(args.include_outputs);
    const strictMatch = Boolean(args.strict_match);
    const limit = Math.max(1, Math.min(100, args.limit ?? 25));

    const { sortedResults } = computeSearchResults(
      metadata,
      query,
      [],
      args.input_type,
      args.output_type,
      strictMatch,
      "all",
    );

    // Agent-facing preference: surface first-party `nodetool.*` nodes ahead of
    // heavy integrations (huggingface, comfy, kie, fal, replicate, etc.) when
    // their relevance is otherwise tied. The visual node-search UI keeps the
    // unbiased ranking; this only reorders the LLM's view because it tends to
    // pick the first plausible result and integration nodes often need
    // credentials/model downloads the user didn't ask for.
    const namespaceRank = (nodeType: string): number => {
      if (nodeType.startsWith("nodetool.")) return 0;
      if (nodeType.startsWith("comfy.")) return 2;
      if (nodeType.startsWith("huggingface.")) return 2;
      return 1;
    };
    const preferred = sortedResults
      .map((node, index) => ({ node, index, rank: namespaceRank(node.node_type) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.node);

    const results = preferred.slice(0, limit).map((node) => {
      const base: Record<string, unknown> = {
        node_type: node.node_type,
        title: node.title,
        namespace: node.namespace,
        expose_as_tool: node.expose_as_tool ?? false,
      };

      if (includeProperties) {
        const properties = (node.properties || []).map((property) => ({
          name: property.name,
          type: property.type,
          required: property.required,
        }));
        base.properties = properties;
        base.input_handles = properties.map((property) => ({
          name: property.name,
          type: property.type,
        }));
      }

      if (includeOutputs) {
        const outputs = (node.outputs || []).map((output) => ({
          name: output.name,
          type: output.type,
          stream: output.stream,
        }));
        base.outputs = outputs;
        base.output_handles = outputs.map((output) => ({
          name: output.name,
          type: output.type,
        }));
      }

      return base;
    });

    const searchResult = {
      ok: true,
      query,
      count: results.length,
      total_matches: sortedResults.length,
      results,
    };

    return searchResult;
  },
});
