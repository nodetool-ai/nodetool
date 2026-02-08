import { z } from "zod";
import { computeSearchResults } from "../../../utils/nodeSearch";
import { FrontendToolRegistry } from "../frontendTools";

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
    "Search available node types from metadata store by query/type filters.",
  parameters: z.object({
    query: z.string(),
    input_type: z.string().optional(),
    output_type: z.string().optional(),
    strict_match: z.boolean().optional(),
    include_properties: z.boolean().optional(),
    include_outputs: z.boolean().optional(),
    limit: z.number().min(1).max(100).optional()
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
    );

    const results = sortedResults.slice(0, limit).map((node) => {
      const base: Record<string, unknown> = {
        node_type: node.node_type,
        title: node.title,
        namespace: node.namespace,
        description: node.description,
        expose_as_tool: node.expose_as_tool ?? false,
      };

      if (includeProperties) {
        const properties = (node.properties || []).map((property) => ({
          name: property.name,
          type: property.type,
          title: property.title,
          required: property.required,
          default: property.default,
          description: property.description,
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

    console.log("[ui_search_nodes] Search results:", {
      query,
      count: results.length,
      total_matches: sortedResults.length,
      result_types: results.map((r) => r.node_type),
    });

    return searchResult;
  },
});
