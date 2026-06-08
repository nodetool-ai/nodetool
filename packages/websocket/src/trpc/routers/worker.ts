/**
 * Worker router — the tRPC surface over `WorkerManager` (`@nodetool-ai/compute`).
 *
 * Exposes the profiles→instances worker-provisioning model to the UI and any
 * tRPC caller:
 *   - `worker.profiles.list|create|delete` — declarative presets.
 *   - `worker.instances.list` — the live instance registry.
 *   - `worker.provision|stop|stopAll|status|reconcile` — instance lifecycle.
 *   - `worker.attach|detach` — adopt/release the active worker, re-pointing the
 *     live Python bridge at the worker's `{wsUrl, token}` (attach) or back at
 *     the env/stdio default (detach).
 *
 * The manager and the bridge re-point function are injected through the tRPC
 * context so the server bootstrap owns the single `WorkerManager` instance and
 * the live bridge handle; this router stays free of any runtime dependency.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { WorkerManager } from "@nodetool-ai/compute";
import type { RepointPythonBridge } from "../context.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const targetSchema = z.enum(["runpod", "vast"]);

const profileCreateInput = z.object({
  name: z.string().min(1),
  target: targetSchema,
  image: z.string().min(1),
  spec: z.record(z.string(), z.unknown()).optional(),
  token_policy: z.enum(["generate", "fixed"]),
  idle_timeout_minutes: z.number().int().nullable().optional(),
  max_lifetime_minutes: z.number().int().nullable().optional()
});

const idInput = z.object({ id: z.string().min(1) });
const profileNameInput = z.object({ name: z.string().min(1) });
const provisionInput = z.object({ profileName: z.string().min(1) });

/** Pull the wired `WorkerManager` from context or fail loudly. */
function requireManager(manager: WorkerManager | undefined): WorkerManager {
  if (!manager) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Worker manager is not configured on this server"
    });
  }
  return manager;
}

/** Pull the wired bridge re-point function from context or fail loudly. */
function requireRepoint(
  repoint: RepointPythonBridge | undefined
): RepointPythonBridge {
  if (!repoint) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Python bridge re-point is not configured on this server"
    });
  }
  return repoint;
}

const profilesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    requireManager(ctx.workerManager).listProfiles()
  ),

  create: protectedProcedure
    .input(profileCreateInput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).createProfile({
        name: input.name,
        target: input.target,
        image: input.image,
        spec: input.spec,
        token_policy: input.token_policy,
        idle_timeout_minutes: input.idle_timeout_minutes ?? undefined,
        max_lifetime_minutes: input.max_lifetime_minutes ?? undefined
      })
    ),

  delete: protectedProcedure
    .input(profileNameInput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx.workerManager).deleteProfile(input.name);
      return { ok: true as const };
    })
});

const instancesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    requireManager(ctx.workerManager).list()
  )
});

export const workerRouter = router({
  profiles: profilesRouter,
  instances: instancesRouter,

  provision: protectedProcedure
    .input(provisionInput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).provision(input.profileName)
    ),

  stop: protectedProcedure
    .input(idInput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).stop(input.id)
    ),

  stopAll: protectedProcedure.mutation(async ({ ctx }) => {
    await requireManager(ctx.workerManager).stopAll();
    return { ok: true as const };
  }),

  status: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const status = await requireManager(ctx.workerManager).status(input.id);
      return { status };
    }),

  reconcile: protectedProcedure.mutation(({ ctx }) =>
    requireManager(ctx.workerManager).reconcile()
  ),

  attach: protectedProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const connection = await requireManager(ctx.workerManager).attach(
        input.id
      );
      requireRepoint(ctx.repointPythonBridge)(connection);
      return connection;
    }),

  detach: protectedProcedure.mutation(async ({ ctx }) => {
    await requireManager(ctx.workerManager).detach();
    requireRepoint(ctx.repointPythonBridge)(null);
    return { ok: true as const };
  })
});
