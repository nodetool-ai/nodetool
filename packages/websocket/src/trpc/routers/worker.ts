/**
 * Worker router — the tRPC surface over `WorkerManager` (`@nodetool-ai/compute`).
 *
 * Exposes the profiles→instances worker-provisioning model to the UI and any
 * tRPC caller:
 *   - `worker.profiles.list|create|delete` — declarative presets.
 *   - `worker.instances.list` — the live instance registry.
 *   - `worker.provision|stop|stopAll|reconcile` — instance lifecycle.
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
import type { RepointPythonBridge, ProbeWorkerHealth } from "../context.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const targetSchema = z.enum(["runpod", "vast"]);

const profileCreateInput = z.object({
  name: z.string().min(1),
  target: targetSchema,
  image: z.string().min(1),
  spec: z.record(z.string(), z.unknown()).optional(),
  token_policy: z.enum(["generate", "fixed"]),
  idle_timeout_minutes: z.number().int().positive().nullable().optional(),
  max_lifetime_minutes: z.number().int().positive().nullable().optional()
});

const idInput = z.object({ id: z.string().min(1) });
const profileNameInput = z.object({ name: z.string().min(1) });
const provisionInput = z.object({ profileName: z.string().min(1) });

const workerStatusSchema = z.enum([
  "provisioning",
  "running",
  "attached",
  "stopping",
  "stopped",
  "terminated",
  "error"
]);

const workerProfileOutput = z.object({
  id: z.string(),
  name: z.string(),
  target: targetSchema,
  image: z.string(),
  spec: z.record(z.string(), z.unknown()),
  token_policy: z.enum(["generate", "fixed"]),
  idle_timeout_minutes: z.number().nullable(),
  max_lifetime_minutes: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

const workerInstanceOutput = z.object({
  id: z.string(),
  profile_name: z.string(),
  target: targetSchema,
  provider_ref: z.string(),
  ws_url: z.string(),
  token: z.string().nullable(),
  status: workerStatusSchema,
  attached_to: z.string().nullable(),
  created_at: z.string(),
  last_activity_at: z.string(),
  estimated_cost_usd: z.number().nullable()
});

const okOutput = z.object({ ok: z.literal(true) });
const apiKeyStatusOutput = z.object({
  runpod: z.boolean(),
  vast: z.boolean()
});
const connectionOutput = z.object({
  wsUrl: z.string(),
  token: z.string().nullable()
});
const reconcileOutput = z.object({
  orphans: z.array(
    z.object({
      target: targetSchema,
      providerRef: z.string(),
      status: workerStatusSchema
    })
  ),
  liveCount: z.number(),
  estimatedCostUsd: z.number()
});
const healthOutput = z.object({
  healthy: z.boolean(),
  protocolVersion: z.number().optional(),
  error: z.string().optional()
});

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

/** Pull the wired worker health-probe function from context or fail loudly. */
function requireProbe(probe: ProbeWorkerHealth | undefined): ProbeWorkerHealth {
  if (!probe) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Worker health probe is not configured on this server"
    });
  }
  return probe;
}

const profilesRouter = router({
  list: protectedProcedure
    .output(z.array(workerProfileOutput))
    .query(({ ctx }) => requireManager(ctx.workerManager).listProfiles()),

  create: protectedProcedure
    .input(profileCreateInput)
    .output(workerProfileOutput)
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
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await requireManager(ctx.workerManager).deleteProfile(input.name);
      return { ok: true as const };
    })
});

const instancesRouter = router({
  list: protectedProcedure
    .output(z.array(workerInstanceOutput))
    .query(({ ctx }) => requireManager(ctx.workerManager).list())
});

export const workerRouter = router({
  profiles: profilesRouter,
  instances: instancesRouter,

  // Whether each provider's API key is available (secret store OR env) — the
  // same resolution provisioning uses, so the UI doesn't false-warn on an
  // env-provided key.
  apiKeyStatus: protectedProcedure
    .output(apiKeyStatusOutput)
    .query(({ ctx }) => requireManager(ctx.workerManager).apiKeyStatus()),

  provision: protectedProcedure
    .input(provisionInput)
    .output(workerInstanceOutput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).provision(input.profileName)
    ),

  stop: protectedProcedure
    .input(idInput)
    .output(workerInstanceOutput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).stop(input.id)
    ),

  // Resume a paused worker (re-allocates the GPU, keeps the volume). May fail
  // if the provider cannot re-allocate a GPU.
  resume: protectedProcedure
    .input(idInput)
    .output(workerInstanceOutput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).resume(input.id)
    ),

  // Destroy a worker and its volume — the real teardown that stops all billing.
  terminate: protectedProcedure
    .input(idInput)
    .output(workerInstanceOutput)
    .mutation(({ ctx, input }) =>
      requireManager(ctx.workerManager).terminate(input.id)
    ),

  stopAll: protectedProcedure.output(okOutput).mutation(async ({ ctx }) => {
    await requireManager(ctx.workerManager).stopAll();
    return { ok: true as const };
  }),

  reconcile: protectedProcedure
    .output(reconcileOutput)
    .mutation(({ ctx }) => requireManager(ctx.workerManager).reconcile()),

  /**
   * Health-probe a worker that is `running` but not yet attached: open a
   * transient bridge to its `{wsUrl, token}` (the same handshake attach uses)
   * and report whether it answered. Lets the panel show true readiness
   * ("Booting…" → "Ready") before the user attaches.
   */
  health: protectedProcedure
    .input(idInput)
    .output(healthOutput)
    .query(async ({ ctx, input }) => {
      const connection = await requireManager(ctx.workerManager).connectionInfo(
        input.id
      );
      return requireProbe(ctx.probeWorkerHealth)(connection);
    }),

  attach: protectedProcedure
    .input(idInput)
    .output(connectionOutput)
    .mutation(async ({ ctx, input }) => {
      const connection = await requireManager(ctx.workerManager).attach(
        input.id
      );
      try {
        // Connect the bridge to the worker. If it can't be reached, roll the
        // attach back so the manager doesn't report a worker we can't talk to.
        await requireRepoint(ctx.repointPythonBridge)(connection);
      } catch (err) {
        await requireManager(ctx.workerManager).detach();
        throw err;
      }
      return connection;
    }),

  detach: protectedProcedure.output(okOutput).mutation(async ({ ctx }) => {
    await requireManager(ctx.workerManager).detach();
    await requireRepoint(ctx.repointPythonBridge)(null);
    return { ok: true as const };
  })
});
