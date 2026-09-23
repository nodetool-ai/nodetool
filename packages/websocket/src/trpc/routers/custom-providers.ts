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
  image_models: z.array(z.string()),
  video_models: z.array(z.string()),
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
  models: z.array(z.string()).optional(),
  image_models: z.array(z.string()).optional(),
  video_models: z.array(z.string()).optional()
});

const slugInput = z.object({ slug: z.string().min(1) });

const modelCounts = z.object({
  language: z.number(),
  image: z.number(),
  video: z.number()
});

const testOutput = z.object({
  ok: z.boolean(),
  message: z.string(),
  /** Models per picker; absent when the endpoint could not be reached. */
  counts: modelCounts.optional()
});

const plural = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "12 chat models, 3 image models and 1 video model available." */
export function describeTestCounts(counts: z.infer<typeof modelCounts>): string {
  const parts = [
    counts.language > 0 ? plural(counts.language, "chat model") : null,
    counts.image > 0 ? plural(counts.image, "image model") : null,
    counts.video > 0 ? plural(counts.video, "video model") : null
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) {
    return "The endpoint answered with no models. Enter model ids by hand if it has no /models route.";
  }
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} available.`;
}

const withProviderId = (row: CustomProviderView) => ({
  slug: row.slug,
  name: row.name,
  models: row.models ?? [],
  image_models: row.image_models ?? [],
  video_models: row.video_models ?? [],
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
   * key both work — and say which pickers each model landed in, so a user can
   * see at once whether an image or video model needs marking by hand. An
   * endpoint with no such route is still usable with model ids typed by hand,
   * which is what the empty answer says.
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
        const [language, image, video] = await Promise.all([
          provider.getAvailableLanguageModels(),
          provider.getAvailableImageModels(),
          provider.getAvailableVideoModels()
        ]);
        const counts = {
          language: language.length,
          image: image.length,
          video: video.length
        };
        return {
          ok: counts.language + counts.image + counts.video > 0,
          message: describeTestCounts(counts),
          counts
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err)
        };
      }
    })
});
