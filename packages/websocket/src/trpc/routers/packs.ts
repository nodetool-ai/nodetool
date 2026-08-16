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
  getSandboxCatalog,
  getSandboxCatalogDiagnostics
} from "../../sandbox-catalog.js";
import { detectRuntimes, KNOWN_RUNTIMES } from "../../lib/runtime-detection.js";
import {
  readBuiltinPackOverrides,
  readPackTrustFromFile,
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

const sandboxModulesOutput = z.object({
  modules: z.array(
    z.object({
      specifier: z.string(),
      packName: z.string(),
      packVersion: z.string().optional(),
      kind: z.enum(["js", "wasm", "host"]),
      /** The pack's one-line description, already sanitized and capped. */
      description: z.string().optional(),
      /** Stamped onto a declaration so a saved graph pins what it ran against. */
      contentDigest: z.string().optional()
    })
  ),
  diagnostics: z.array(
    z.object({
      packName: z.string(),
      specifier: z.string().optional(),
      status: z.enum(["ready", "warning", "skipped", "error"]),
      code: z.string(),
      message: z.string()
    })
  )
});

const sandboxPackDocsOutput = z
  .object({
    packName: z.string(),
    packVersion: z.string().optional(),
    /** True only when the pack is on the pack-loader allowlist. */
    trusted: z.boolean(),
    name: z.string(),
    description: z.string(),
    /** The rendered SKILL.md body — served by request, never in a summary. */
    body: z.string()
  })
  .nullable();

// ── DTO mapping ──────────────────────────────────────────────────────────

function toDto(r: LoadedPackResult): z.infer<typeof packResultSchema> {
  const dto: z.infer<typeof packResultSchema> = {
    name: r.pack.name,
    status: r.status,
    registered: r.registered,
    skippedNodes: r.skippedNodes
  };
  if (r.pack.version !== undefined) {
    dto.version = r.pack.version;
  }
  if (r.reason !== undefined) {
    dto.reason = r.reason;
  }
  if (r.error) {
    dto.error = r.error.message;
  }
  return dto;
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

  /**
   * Which external runtimes (ffmpeg, pandoc, yt-dlp, …) are on the *server's*
   * PATH. The desktop app answers this over Electron IPC; browser clients —
   * including every Docker deployment — have no IPC and ask the server that
   * would actually spawn the binary.
   */
  runtimeStatuses: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).max(64).optional() }).optional())
    .output(
      z.object({
        statuses: z.array(z.object({ id: z.string(), installed: z.boolean() }))
      })
    )
    .query(async ({ input }) => ({
      statuses: await detectRuntimes(input?.ids ?? KNOWN_RUNTIMES)
    })),

  /** Effective trust config (env + config file + defaults merged). */
  getTrust: protectedProcedure
    .output(trustSchema)
    .query(() => resolvePackTrust()),

  /**
   * Persist a partial trust update to `~/.config/nodetool/packs.json` and
   * return the new effective trust. Callers can then invoke `reload` to apply
   * the change to the live registry.
   */
  setTrust: protectedProcedure
    .input(trustUpdateInput)
    .output(trustSchema)
    .mutation(({ input }) => {
      // Base unspecified fields on what's ON DISK, not the env/default-merged
      // effective values — otherwise a partial update bakes an ephemeral
      // NODETOOL_PACKS_ALLOWLIST env override permanently into packs.json.
      const fromFile = readPackTrustFromFile();
      const isProd = process.env["NODETOOL_ENV"] === "production";
      const next = {
        allowlist: input.allowlist ?? fromFile.allow ?? [],
        allowUnlisted: input.allowUnlisted ?? fromFile.allowUnlisted ?? !isProd
      };
      writePackTrustConfig(next);
      // Return the effective trust (env + file + defaults) so the client sees
      // what's actually in force, consistent with getTrust.
      return resolvePackTrust();
    }),

  /**
   * Sandbox modules the installed packs declare, and every diagnostic discovery
   * produced. Separate from `list`: a pack's sandbox modules and its nodes are
   * discovered by different code and fail independently.
   */
  sandboxModules: protectedProcedure.output(sandboxModulesOutput).query(() => {
    const catalog = getSandboxCatalog();
    return {
      modules: (catalog?.summaries() ?? []).map((summary) => {
        const dto: z.infer<typeof sandboxModulesOutput>["modules"][number] = {
          specifier: summary.specifier,
          packName: summary.packName,
          kind: summary.kind
        };
        if (summary.packVersion !== undefined) {
          dto.packVersion = summary.packVersion;
        }
        if (summary.description !== undefined) {
          dto.description = summary.description;
        }
        if (summary.contentDigest !== undefined) {
          dto.contentDigest = summary.contentDigest;
        }
        return dto;
      }),
      diagnostics: [...getSandboxCatalogDiagnostics()]
    };
  }),

  /**
   * One pack's SKILL.md, by name.
   *
   * Its own procedure on purpose: the body is third-party prompt content, so it
   * travels only when something asks for this pack — never riding along in the
   * module summaries every client fetches. `trusted` says which disclosure rule
   * applies, so the UI can label documentation the operator has not vouched
   * for.
   */
  sandboxPackageDocs: protectedProcedure
    .input(z.object({ packName: z.string().min(1).max(214) }))
    .output(sandboxPackDocsOutput)
    .query(({ input }) => {
      const skill = getSandboxCatalog()?.packSkill?.(input.packName);
      if (skill === undefined) return null;
      const docs: NonNullable<z.infer<typeof sandboxPackDocsOutput>> = {
        packName: skill.packName,
        trusted: skill.trusted,
        name: skill.name,
        description: skill.description,
        body: skill.body
      };
      if (skill.packVersion !== undefined) {
        docs.packVersion = skill.packVersion;
      }
      return docs;
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
      const { applyBuiltinPackEnabled } =
        await import("../../node-registry-setup.js");
      applyBuiltinPackEnabled(ctx.registry, input.id, input.enabled);
      return { packs: builtinPackDtos() };
    }),

  /**
   * Re-scan installed packs and register any new ones into the live registry.
   * Returns the refreshed snapshot.
   */
  reload: protectedProcedure
    .output(packsListOutput)
    .mutation(async ({ ctx }) => {
      await reloadPacks(ctx.registry);
      return { packs: getPackSnapshot().map(toDto) };
    })
});
