/**
 * The unauthenticated read behind a workflow's public share link.
 *
 *   GET /api/shared-workflows/:token → PublicSharedWorkflow
 *
 * It sits outside `/api/workflows` deliberately: everything under that prefix
 * reads the caller's own library, and a public route there would be one
 * `startsWith` away from exempting the rest. The prefix is the allowlist entry
 * (`isPublicSharedWorkflowRequest`). The token in the path is the credential;
 * copying the workflow needs an account and goes through the authenticated
 * `workflows.sharing.duplicatePublic` tRPC mutation.
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { TRPCError } from "@trpc/server";
import { publicSharedWorkflow } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { z } from "zod";

import { getPublicSharedWorkflow } from "../lib/public-workflow-share.js";

const { $schema: _dialect, ...publicSharedWorkflowJsonSchema } = z.toJSONSchema(
  publicSharedWorkflow,
  { target: "draft-2020-12", io: "input", unrepresentable: "any" }
);

const sharedWorkflowSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["token"],
    properties: { token: { type: "string", minLength: 1 } }
  },
  response: {
    200: publicSharedWorkflowJsonSchema,
    404: {
      type: "object",
      additionalProperties: false,
      required: ["detail"],
      properties: { detail: { type: "string" } }
    }
  }
} as const;

function sendUnavailable(reply: FastifyReply): void {
  reply
    .header("cache-control", "no-store")
    .code(404)
    .send({ detail: "This workflow is not available" });
}

const publicSharedWorkflowRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      sendUnavailable(reply);
      return;
    }
    reply.send(error);
  });

  app.get<{ Params: { token: string } }>(
    "/api/shared-workflows/:token",
    { schema: sharedWorkflowSchema },
    async (req, reply) => {
      const workflow = await getPublicSharedWorkflow(req.params.token);
      reply.header("cache-control", "no-store").send(workflow);
    }
  );
};

export default publicSharedWorkflowRoutes;
