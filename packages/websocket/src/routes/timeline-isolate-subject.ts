/**
 * Subject isolation — `POST /api/timelines/:id/isolate-subject`.
 *
 * The inspector's "Isolate subject" button posts here. Nothing is generated or
 * written in the browser: the route hands the body to the `isolate_subject`
 * capability, which reads the stored document, marks the clip's matte in
 * flight, runs the provider, stores the mask it returns as an asset, and
 * persists the result. The client reloads the document the capability saved,
 * so the agent path and the inspector path write the same bytes.
 *
 * Unlike the audio bake, this capability calls a provider through a node, so
 * the run carries the server's node registry. Everything else — the body being
 * this route's own schema rather than the capability's JSON Schema, the
 * timeline id coming off the path, a refusal being a 400 — matches
 * `timeline-audio-bake.ts`, because a browser request is untrusted input at an
 * HTTP boundary either way.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createCapabilityRun, UNGATED } from "@nodetool-ai/agents";
import { getSecret } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { bridge } from "../lib/bridge.js";
import {
  getUserId,
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

/**
 * The capability's inputs minus `timeline_id`, which the path carries.
 *
 * The two enums are spelled out rather than imported so the door refuses a
 * value the endpoint would reject; the capability checks them again for
 * callers that never come through HTTP.
 */
export const isolateSubjectRequest = z.object({
  clip_id: z.string().min(1),
  model: z
    .enum([
      "General Use (Light)",
      "General Use (Light 2K)",
      "General Use (Heavy)",
      "Matting",
      "Portrait",
      "General Use (Dynamic)"
    ])
    .optional(),
  operating_resolution: z
    .enum(["1024x1024", "2048x2048", "2304x2304"])
    .optional(),
  refine_foreground: z.boolean().optional(),
  regenerate: z.boolean().optional(),
  background: z.boolean().optional()
});

export type IsolateSubjectRequest = z.infer<typeof isolateSubjectRequest>;

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

/**
 * A capability refusal — a missing clip, a clip with no asset, a document that
 * moved under the call. A generation that ran and failed is not one of these:
 * it comes back with `status: "failed"` and the previous matte still in place,
 * which is a 200 the client renders.
 */
function capabilityRefusal(result: unknown): string | null {
  if (
    result !== null &&
    typeof result === "object" &&
    !("status" in result) &&
    typeof (result as { error?: unknown }).error === "string"
  ) {
    return (result as { error: string }).error;
  }
  return null;
}

const timelineIsolateSubjectRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.post("/api/timelines/:id/isolate-subject", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const parsed = isolateSubjectRequest.safeParse(
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
        jobId: `isolate-subject-${Date.now()}`,
        userId,
        secretResolver: getSecret,
        storage: opts.storage ?? getAssetAdapter()
      });

      const nodeRegistry =
        apiOptions.registry ??
        (await getWorkflowRuntimeEnvironment(apiOptions)).registry;

      const result = await createCapabilityRun({
        context,
        gate: UNGATED,
        nodeRegistry
      }).invoke("isolate_subject", { ...parsed.data, timeline_id: id });

      const refusal = capabilityRefusal(result);
      if (refusal !== null) {
        return jsonResponse({ detail: refusal }, 400);
      }
      return jsonResponse(result);
    });
  });
};

export default timelineIsolateSubjectRoutes;
