import { getSecret } from "@nodetool/models";
import { router, publicProcedure } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { z } from "zod";

// ── Local schemas (mirrored in packages/protocol/src/api-schemas/nodes.ts) ──

const replicateStatusOutput = z.object({
  configured: z.boolean()
});

const validateUsernameInput = z.object({
  username: z.string().min(3).max(32)
});

const validateUsernameOutput = z.object({
  valid: z.boolean(),
  available: z.boolean()
});

const dummyOutput = z.object({
  type: z.string(),
  uri: z.string(),
  asset_id: z.string().nullable(),
  data: z.unknown().nullable(),
  metadata: z.unknown().nullable()
});

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
   * Validate a username string against the allowed pattern.
   * Protected — requires auth.
   */
  validateUsername: protectedProcedure
    .input(validateUsernameInput)
    .output(validateUsernameOutput)
    .query(({ input }) => {
      const valid = /^[a-zA-Z0-9_-]{3,32}$/.test(input.username);
      return { valid, available: true };
    }),

  /**
   * Return a dummy asset response (used by client boot sequence).
   * Protected — requires auth.
   */
  dummy: protectedProcedure.output(dummyOutput).query(() => ({
    type: "asset",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  }))
});
