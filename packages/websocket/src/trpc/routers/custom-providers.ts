/**
 * Custom OpenAI-compatible providers — the CRUD behind Settings → Models &
 * Providers → "OpenAI-compatible endpoints".
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getProvider } from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import { customProviderId } from "@nodetool-ai/protocol";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  deleteCustomProvider,
  listCustomProviders,
  saveCustomProvider,
  syncCustomProviderRegistry,
  type CustomProviderView
} from "../../custom-providers.js";

const customProviderOutput = z.object({
  slug: z.string(),
  name: z.string(),
  models: z.array(z.string()),
  base_url: z.string(),
  has_api_key: z.boolean(),
  provider_id: z.string()
});

const saveInput = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  base_url: z.string().min(1),
  /** Omit to keep the stored key; empty string clears it. */
  api_key: z.string().optional(),
  models: z.array(z.string()).optional()
});

const slugInput = z.object({ slug: z.string().min(1) });

const testOutput = z.object({
  ok: z.boolean(),
  message: z.string()
});

const withProviderId = (row: CustomProviderView) => ({
  slug: row.slug,
  name: row.name,
  models: row.models ?? [],
  base_url: row.base_url,
  has_api_key: row.has_api_key,
  provider_id: customProviderId(row.slug)
});

export const customProvidersRouter = router({
  list: protectedProcedure
    .output(z.array(customProviderOutput))
    .query(async ({ ctx }) => {
      const rows = await listCustomProviders(ctx.userId);
      return rows.map(withProviderId);
    }),

  save: protectedProcedure
    .input(saveInput)
    .output(customProviderOutput)
    .mutation(async ({ ctx, input }) => {
      try {
        return withProviderId(await saveCustomProvider(ctx.userId, input));
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }),

  delete: protectedProcedure
    .input(slugInput)
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteCustomProvider(ctx.userId, input.slug);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
      }
      return { deleted };
    }),

  /**
   * Ask the endpoint what it serves — one `GET /models` proves the URL and the
   * key both work. An endpoint with no such route is still usable with model
   * ids typed by hand, which is what the empty answer says.
   */
  test: protectedProcedure
    .input(slugInput)
    .output(testOutput)
    .mutation(async ({ ctx, input }) => {
      await syncCustomProviderRegistry(ctx.userId);
      try {
        const provider = await getProvider(customProviderId(input.slug), (key) =>
          getStoredSecret(key, ctx.userId).then((v) => v ?? undefined)
        );
        const models = await provider.getAvailableLanguageModels();
        return {
          ok: models.length > 0,
          message:
            models.length > 0
              ? `${models.length} model${models.length === 1 ? "" : "s"} available.`
              : "The endpoint answered with no models. Enter model ids by hand if it has no /models route."
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err)
        };
      }
    })
});
