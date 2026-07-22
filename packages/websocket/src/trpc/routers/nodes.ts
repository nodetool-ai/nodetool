import { getSecret } from "@nodetool-ai/models";
import { router, publicProcedure } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { ApiErrorCode } from "../../error-codes.js";
import { throwApiError } from "../error-formatter.js";
import { z } from "zod";
import {
  listInput as nodesListInput,
  listOutput as nodesListOutput,
  getInput as nodesGetInput,
  getOutput as nodesGetOutput
} from "@nodetool-ai/protocol/api-schemas/nodes.js";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";

type NodeMetaOut = {
  node_type: string;
  title: string;
  description: string;
  namespace: string;
  [key: string]: unknown;
};

// ── Local schemas (mirrored in packages/protocol/src/api-schemas/nodes.ts) ──

const replicateStatusOutput = z.object({
  configured: z.boolean()
});

function toSummary(n: NodeMetadata): NodeMetaOut {
  return {
    node_type: n.node_type,
    title: n.title,
    description: n.description,
    namespace: n.namespace
  };
}

export const nodesRouter = router({
  /**
   * Check whether the Replicate API token is configured.
   * Public — no auth required.
   */
  replicateStatus: publicProcedure
    .output(replicateStatusOutput)
    .query(async () => {
      const replicateKey = await getSecret("REPLICATE_API_TOKEN", "1");
      return { configured: Boolean(replicateKey) };
    }),

  /**
   * List node metadata. Mirrors the legacy GET /api/nodes/metadata
   * filtering: optional `namespace` prefix, comma-separated `query`
   * full-text scoring over title/description/node_type/namespace, and
   * `fields=summary` (default) vs `fields=full`.
   *
   * Lazy-loaded Python nodes only appear after the Python bridge has
   * hydrated — same caveat as the REST endpoint, no regression.
   */
  list: protectedProcedure
    .input(nodesListInput)
    .output(nodesListOutput)
    .query(({ ctx, input }) => {
      let nodes: NodeMetadata[] = ctx.registry.listMetadata();
      nodes.sort((a, b) => a.node_type.localeCompare(b.node_type));

      if (input.namespace) {
        const prefix = input.namespace;
        nodes = nodes.filter((n) => n.namespace?.startsWith(prefix));
      }

      if (input.query) {
        const terms = input.query
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0);
        if (terms.length > 0) {
          const scored = nodes.map((n) => {
            const haystack =
              `${n.title ?? ""} ${n.description ?? ""} ${n.node_type} ${n.namespace ?? ""}`.toLowerCase();
            let score = 0;
            for (const term of terms) if (haystack.includes(term)) score++;
            return { node: n, score };
          });
          nodes = scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((s) => s.node);
        }
      }

      if (input.limit !== undefined) {
        nodes = nodes.slice(0, input.limit);
      }

      const payload: NodeMetaOut[] =
        input.fields === "full"
          ? nodes.map((n) => n as unknown as NodeMetaOut)
          : nodes.map(toSummary);
      return { nodes: payload };
    }),

  /**
   * Get a single node's full metadata by `node_type`. Throws NOT_FOUND
   * if the registry doesn't know the type yet (e.g. Python node before
   * bridge hydration).
   */
  get: protectedProcedure
    .input(nodesGetInput)
    .output(nodesGetOutput)
    .query(({ ctx, input }) => {
      const match = ctx.registry
        .listMetadata()
        .find((n) => n.node_type === input.node_type);
      if (!match) {
        throwApiError(
          ApiErrorCode.NOT_FOUND,
          `Node type not found: ${input.node_type}`
        );
      }
      return match as unknown as NodeMetaOut;
    })
});
