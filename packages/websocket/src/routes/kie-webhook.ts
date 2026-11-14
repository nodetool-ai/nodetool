import type { FastifyPluginAsync } from "fastify";
import {
  isValidKieWebhookToken,
  rejectWebhook,
  resolveWebhook
} from "@nodetool-ai/runtime";
import { parseJsonBodies } from "../lib/json-body.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";

/**
 * Extract a task ID from the KIE callback body. KIE may nest it under
 * `data.taskId` or send it at the top level — try both.
 */
function extractTaskId(body: unknown): string | undefined {
  if (!isObjectLike(body)) return undefined;
  const b = body as Record<string, unknown>;
  if (isNonEmptyString(b.taskId)) return b.taskId;
  if (isNonEmptyString(b.task_id)) return b.task_id;
  const data = b.data;
  if (isObjectLike(data)) {
    const d = data as Record<string, unknown>;
    if (isNonEmptyString(d.taskId)) return d.taskId;
    if (isNonEmptyString(d.task_id)) return d.task_id;
  }
  return undefined;
}

function extractStatus(body: unknown): string | undefined {
  if (!isObjectLike(body)) return undefined;
  const b = body as Record<string, unknown>;
  if (isString(b.status)) return b.status;
  if (isString(b.state)) return b.state;
  const data = b.data;
  if (isObjectLike(data)) {
    const d = data as Record<string, unknown>;
    if (isString(d.status)) return d.status;
    if (isString(d.state)) return d.state;
  }
  return undefined;
}

const FAILURE_STATES = new Set([
  "failed",
  "fail",
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR"
]);

const kieWebhookRoute: FastifyPluginAsync = async (app) => {
  // The server-wide parser hands handlers a raw Buffer; this route reads an
  // object, so it parses JSON itself.
  parseJsonBodies(app);
  // KIE calls POST /api/kie/webhook?token=… with taskId in the body. KIE signs
  // nothing, so the token in the callBackUrl this server submitted is the only
  // proof the call came from KIE. Without it anyone who learns a task id could
  // fail or resolve a user's paid task.
  app.post("/api/kie/webhook", async (req, reply) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    if (!isValidKieWebhookToken(query["token"])) {
      reply.status(401).send({ error: "Invalid webhook token" });
      return;
    }
    const taskId = extractTaskId(req.body);
    if (!taskId) {
      reply.status(400).send({ error: "No taskId in request body" });
      return;
    }

    const status = extractStatus(req.body);
    if (status && FAILURE_STATES.has(status)) {
      rejectWebhook(taskId, status);
    } else {
      resolveWebhook(taskId, req.body);
    }
    reply.send({ status: "accepted" });
  });
};

export default kieWebhookRoute;
