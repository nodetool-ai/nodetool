/**
 * Subject tracking — `POST /api/timelines/:id/track-object`.
 *
 * The inspector sends the same inputs as the `track_object` capability. The
 * capability owns source validation, provider execution, and compare-and-swap
 * persistence, so the browser never writes a MediaTrack directly.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  contextSecretAvailability,
  createCapabilityRun,
  gateFromContext
} from "@nodetool-ai/agents";
import { getSecret } from "@nodetool-ai/models";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate
} from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { bridge } from "../lib/bridge.js";
import {
  getUserId,
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";

const TRACK_OBJECT_HOST = "track-object route";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

export const trackObjectRequest = z.object({
  clip_id: z.string().min(1),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  initial_region: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }),
  start_ms: z.number(),
  end_ms: z.number(),
  direction: z.enum(["forward", "backward", "both"]).optional(),
  track_id: z.string().min(1).optional(),
  regenerate: z.boolean().optional()
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function capabilityRefusal(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as { error?: unknown }).error === "string" &&
    !("status" in result)
  ) {
    return (result as { error: string }).error;
  }
  return null;
}

const timelineTrackObjectRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  app.post("/api/timelines/:id/track-object", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(
        request,
        opts.apiOptions.userIdHeader ?? "x-user-id"
      );
      const parsed = trackObjectRequest.safeParse(await readJsonBody(request));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path.join(".") ?? "";
        return jsonResponse(
          {
            detail: path
              ? `${path}: ${issue?.message ?? "Invalid body"}`
              : (issue?.message ?? "Invalid body")
          },
          400
        );
      }

      const context = new ProcessingContext({
        jobId: `track-object-${Date.now()}`,
        userId,
        secretResolver: getSecret,
        storage: opts.storage ?? getAssetAdapter()
      });
      context.set(
        PERMISSION_GATE_CONTEXT_KEY,
        headlessGate(TRACK_OBJECT_HOST)
      );

      const nodeRegistry =
        opts.apiOptions.registry ??
        (await getWorkflowRuntimeEnvironment(opts.apiOptions)).registry;
      const result = await createCapabilityRun({
        context,
        gate: gateFromContext(context, TRACK_OBJECT_HOST),
        nodeRegistry,
        availableSecrets: contextSecretAvailability(context)
      }).invoke("track_object", { ...parsed.data, timeline_id: id });

      const refusal = capabilityRefusal(result);
      if (refusal !== null) return jsonResponse({ detail: refusal }, 400);
      return jsonResponse(result);
    });
  });
};

export default timelineTrackObjectRoutes;
