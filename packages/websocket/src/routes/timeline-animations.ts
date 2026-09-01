/**
 * Custom timeline animation bake — `POST /api/timelines/animations/bake`.
 *
 * The editor writes motion as JavaScript; this runs that body once and returns
 * keyframe curves to store on the clip. Nothing runs in the browser and nothing
 * runs at render time: the five surfaces that sample animations read the baked
 * curves, so a custom animation looks the same in the preview, in an export,
 * and on the headless compositor.
 *
 * The body executes through `bakeCustomAnimation`, which uses the same
 * `runCodeBody` core a Code node and a JS script run on — hermetic here, with
 * no toolbelt and no secrets, because a curve generator is a function of time.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  bakeCustomAnimation,
  type BakeCustomAnimationParams
} from "@nodetool-ai/agents";
import { getSecret, JsScript } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  bakeCustomAnimationRequest,
  type BakeCustomAnimationResponse
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

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

const timelineAnimationRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.post("/api/timelines/animations/bake", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const parsed = bakeCustomAnimationRequest.safeParse(
        await readJsonBody(request)
      );
      if (!parsed.success) {
        return jsonResponse(
          { detail: parsed.error.issues[0]?.message ?? "Invalid body" },
          400
        );
      }
      const body = parsed.data;

      let code = body.code;
      if (code === undefined) {
        const script = await JsScript.findById(body.script_id as string);
        // Scripts are per-user: another owner's script is an absence.
        if (!script || script.user_id !== userId) {
          return jsonResponse({ detail: "JS script not found" }, 404);
        }
        code = script.toDocument().code;
      }

      const context = new ProcessingContext({
        jobId: `animation-bake-${Date.now()}`,
        userId,
        secretResolver: getSecret,
        storage: opts.storage ?? getAssetAdapter()
      });

      const bakeParams: BakeCustomAnimationParams = {
        code,
        role: body.role,
        durationMs: body.duration_ms,
        clipDurationMs: body.clip_duration_ms,
        canvas: body.canvas
      };
      if (body.params !== undefined) {
        bakeParams.params = body.params;
      }
      if (body.stagger_count !== undefined) {
        bakeParams.staggerCount = body.stagger_count;
      }
      if (body.sample_count !== undefined) {
        bakeParams.sampleCount = body.sample_count;
      }
      const result = await bakeCustomAnimation(context, bakeParams);

      const response: BakeCustomAnimationResponse = {
        ok: result.ok,
        logs: result.logs,
        duration_ms: result.duration_ms
      };
      if (result.curves !== undefined) {
        response.curves = result.curves;
      }
      if (result.mask !== undefined) {
        response.mask = result.mask;
      }
      if (result.error !== undefined) {
        response.error = result.error;
      }
      return jsonResponse(response);
    });
  });
};

export default timelineAnimationRoutes;
