/**
 * Subject isolation — `POST /api/timelines/:id/isolate-subject`.
 *
 * The inspector's "Isolate subject" button posts here. Nothing is generated or
 * written in the browser: the route hands the body to the `isolate_subject`
 * capability, which reads the stored document, marks the clip's matte in
 * flight, runs the chosen provider's `matte_video` task, stores the mask it
 * returns as an asset, and persists the result. The client reloads the
 * document the capability saved, so the agent path and the inspector path
 * write the same bytes.
 *
 * The body being this route's own schema rather than the capability's JSON
 * Schema, the timeline id coming off the path, a refusal being a 400 — all of
 * it matches `timeline-audio-bake.ts`, because a browser request is untrusted
 * input at an HTTP boundary either way.
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
import { isJsonContentType } from "../lib/json-body.js";

const ISOLATE_HOST = "isolate-subject route";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

/**
 * The capability's inputs minus `timeline_id`, which the path carries. Which
 * provider and model can cut a matte is the provider catalog's answer, so the
 * capability checks the pair against it rather than this schema.
 */
export const isolateSubjectRequest = z.object({
  clip_id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
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
  if (!isJsonContentType(contentType)) {
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
      // A route has nobody to ask, so it runs `auto` with escalations denied,
      // the way every headless host does; the run reads that gate back off
      // the context rather than being built ungated.
      context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate(ISOLATE_HOST));

      const result = await createCapabilityRun({
        context,
        gate: gateFromContext(context, ISOLATE_HOST),
        availableSecrets: contextSecretAvailability(context)
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
