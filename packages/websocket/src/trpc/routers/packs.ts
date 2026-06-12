/**
 * Packs router — backs the Settings → Packages UI.
 *
 * Read operations return the in-memory snapshot populated by
 * {@link bootstrapNodeRegistry} at startup. `setTrust` persists the allowlist
 * to disk; `reload` re-scans installed packs and registers any new ones into
 * the live registry (soft reload).
 */

import { z } from "zod";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { getPackSnapshot, reloadPacks } from "../../pack-snapshot.js";
import {
  readBuiltinPackOverrides,
  resolvePackTrust,
  writeBuiltinPackOverrides,
  writePackTrustConfig,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";
import {
  BUILTIN_NODE_PACKS,
  resolveBuiltinPackEnabled
} from "@nodetool-ai/protocol";

// ── Schemas ──────────────────────────────────────────────────────────────

const skipReasonSchema = z.enum([
  "not-allowed",
  "api-version",
  "reserved-namespace",
  "collision",
  "no-node-type"
]);

const packResultSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  status: z.enum(["loaded", "skipped", "error"]),
  reason: z.string().optional(),
  registered: z.array(z.string()),
  skippedNodes: z.array(
    z.object({ nodeType: z.string(), reason: skipReasonSchema })
  ),
  error: z.string().optional()
});

const packsListOutput = z.object({ packs: z.array(packResultSchema) });

const trustSchema = z.object({
  allowlist: z.array(z.string()),
  allowUnlisted: z.boolean()
});

const trustUpdateInput = z
  .object({
    allowlist: z.array(z.string()).optional(),
    allowUnlisted: z.boolean().optional()
  })
  .refine((v) => v.allowlist !== undefined || v.allowUnlisted !== undefined, {
    message: "at least one of allowlist or allowUnlisted must be set"
  });

const builtinPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  required: z.boolean()
});

const builtinsOutput = z.object({ packs: z.array(builtinPackSchema) });

// ── DTO mapping ──────────────────────────────────────────────────────────

function toDto(r: LoadedPackResult): z.infer<typeof packResultSchema> {
  return {
    name: r.pack.name,
    ...(r.pack.version !== undefined ? { version: r.pack.version } : {}),
    status: r.status,
    ...(r.reason !== undefined ? { reason: r.reason } : {}),
    registered: r.registered,
    skippedNodes: r.skippedNodes,
    ...(r.error ? { error: r.error.message } : {})
  };
}

function builtinPackDtos(): z.infer<typeof builtinPackSchema>[] {
  const overrides = readBuiltinPackOverrides();
  return BUILTIN_NODE_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    required: pack.required ?? false,
    enabled: resolveBuiltinPackEnabled(pack, overrides[pack.id])
  }));
}

// ── Router ───────────────────────────────────────────────────────────────

export const packsRouter = router({
  /** Startup snapshot of every discovered pack and what happened to it. */
  list: protectedProcedure.output(packsListOutput).query(() => ({
    packs: getPackSnapshot().map(toDto)
  })),

  /** Effective trust config (env + config file + defaults merged). */
  getTrust: protectedProcedure.output(trustSchema).query(() =>
    resolvePackTrust()
  ),

  /**
   * Persist a partial trust update to `~/.config/nodetool/packs.json` and
   * return the new effective trust. Callers can then invoke `reload` to apply
   * the change to the live registry.
   */
  setTrust: protectedProcedure
    .input(trustUpdateInput)
    .output(trustSchema)
    .mutation(({ input }) => {
      const current = resolvePackTrust();
      const next = {
        allowlist: input.allowlist ?? current.allowlist,
        allowUnlisted: input.allowUnlisted ?? current.allowUnlisted
      };
      writePackTrustConfig(next);
      return next;
    }),

  /** Built-in packs that ship with NodeTool and whether each is enabled. */
  listBuiltins: protectedProcedure
    .output(builtinsOutput)
    .query(() => ({ packs: builtinPackDtos() })),

  /**
   * Enable or disable a built-in pack. Persisted to
   * `~/.config/nodetool/packs.json` and applied to the live registry
   * immediately, so clients only need to refetch node metadata.
   */
  setBuiltinEnabled: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .output(builtinsOutput)
    .mutation(async ({ input, ctx }) => {
      const pack = BUILTIN_NODE_PACKS.find((p) => p.id === input.id);
      if (!pack) {
        throw new Error(`Unknown built-in pack "${input.id}"`);
      }
      if (pack.required && !input.enabled) {
        throw new Error(`Built-in pack "${input.id}" cannot be disabled`);
      }
      writeBuiltinPackOverrides({
        ...readBuiltinPackOverrides(),
        [input.id]: input.enabled
      });
      // Lazy import: node-registry-setup pulls in every built-in pack, which
      // must not load just because the router module is imported.
      const { applyBuiltinPackEnabled } = await import(
        "../../node-registry-setup.js"
      );
      applyBuiltinPackEnabled(ctx.registry, input.id, input.enabled);
      return { packs: builtinPackDtos() };
    }),

  /**
   * Re-scan installed packs and register any new ones into the live registry.
   * Returns the refreshed snapshot.
   */
  reload: protectedProcedure.output(packsListOutput).mutation(async ({ ctx }) => {
    await reloadPacks(ctx.registry);
    return { packs: getPackSnapshot().map(toDto) };
  })
});
