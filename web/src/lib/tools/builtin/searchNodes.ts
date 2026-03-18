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
    "Search available node types from metadata store by query/type filters.\n\nCommon nodes by category (use these as starting points before searching):\n- Text-to-Image: kie.image.Flux2FlexTextToImage, kie.image.FluxProTextToImage\n- LLM/Generators: nodetool.generators.ListGenerator, nodetool.generators.TextGenerator\n- Control Flow: nodetool.control.ForEach, nodetool.control.If, nodetool.control.Switch\n- Constants: nodetool.constant.String, nodetool.constant.Integer, nodetool.constant.Float\n- Text: nodetool.text.Join, nodetool.text.Template, nodetool.text.Replace\n- Image: nodetool.image.Composite, nodetool.image.Resize, nodetool.image.SaveImage\n\nSearch tips: Use broad category terms with limit=20. Multiple words are searched independently and combined.",
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

    const results = sortedResults.slice(0, limit).map((node) => {
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
