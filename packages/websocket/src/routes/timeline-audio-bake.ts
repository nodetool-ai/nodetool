/**
 * Audio-driven animation bake — `POST /api/timelines/:id/bake-audio-animation`.
 *
 * The editor's "Animate from audio" panel posts here. Nothing is measured or
 * written in the browser: the route hands the body to the `bake_audio_animation`
 * capability, which reads the stored document, decodes the audio clip's asset,
 * turns loudness or onsets into keyframes on the target clip's own media clock,
 * and persists the result. The client then reloads the document the capability
 * saved, so the agent path and the inspector path write the same bytes.
 *
 * The body is this route's own schema rather than the capability's JSON Schema
 * because a browser request is untrusted input at an HTTP boundary; the two are
 * the same field set minus `timeline_id`, which the URL carries.
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
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";

const BAKE_HOST = "audio-bake route";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

/** The capability's inputs minus `timeline_id`, which the path carries. */
export const bakeAudioAnimationRequest = z.object({
  audio_clip_id: z.string().min(1),
  target_clip_id: z.string().min(1),
  property: z.enum(["scale", "opacity", "offsetX", "offsetY"]),
  /** `[quiet, loud]` — the values the curve runs between. */
  output_range: z.tuple([z.number(), z.number()]),
  mode: z.enum(["envelope", "beats"]).optional(),
  sensitivity: z.number().positive().optional(),
  attack_ms: z.number().nonnegative().optional(),
  release_ms: z.number().nonnegative().optional(),
  offset_ms: z.number().optional(),
  tolerance: z.number().nonnegative().optional(),
  max_points: z.number().int().positive().optional(),
  frame_ms: z.number().positive().optional(),
  max_seconds: z.number().positive().optional(),
  replace: z.boolean().optional()
});

export type BakeAudioAnimationRequest = z.infer<
  typeof bakeAudioAnimationRequest
>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/** A capability refusal — a missing clip, a time remap, an unreadable asset. */
function capabilityError(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as { error?: unknown }).error === "string"
  ) {
    return (result as { error: string }).error;
  }
  return null;
}

const timelineAudioBakeRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.post("/api/timelines/:id/bake-audio-animation", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const parsed = bakeAudioAnimationRequest.safeParse(
        await readJsonBody(request)
      );
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
        jobId: `audio-animation-bake-${Date.now()}`,
        userId,
        secretResolver: getSecret,
        storage: opts.storage ?? getAssetAdapter()
      });

      // A route has nobody to ask, so it runs `auto` with escalations denied,
      // the way every headless host does; the run reads that gate back off
      // the context rather than being built ungated.
      context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate(BAKE_HOST));
      const result = await createCapabilityRun({
        context,
        gate: gateFromContext(context, BAKE_HOST),
        availableSecrets: contextSecretAvailability(context)
      }).invoke("bake_audio_animation", { ...parsed.data, timeline_id: id });

      // The capability reports a missing clip, a time remap it cannot invert,
      // or an unreadable asset as `{error}`; none of those are server faults.
      const error = capabilityError(result);
      if (error !== null) {
        return jsonResponse({ detail: error }, 400);
      }
      return jsonResponse(result);
    });
  });
};

export default timelineAudioBakeRoutes;
