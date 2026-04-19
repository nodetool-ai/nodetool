/**
 * In-container Fastify server exposing sandbox tools on NODETOOL_TOOL_PORT.
 *
 * Every route is validated against the shared Zod schemas in
 * @nodetool/sandbox/schemas, so host and container agree on shapes by
 * construction.
 */

import Fastify, { type FastifyInstance } from "fastify";
import {
  FileReadInput,
  FileWriteInput,
  FileStrReplaceInput,
  FileFindInContentInput,
  FileFindByNameInput,
  ShellExecInput,
  ShellViewInput,
  ShellWaitInput,
  ShellWriteToProcessInput,
  ShellKillProcessInput
} from "@nodetool/sandbox/schemas";
import {
  fileRead,
  fileWrite,
  fileStrReplace,
  fileFindInContent,
  fileFindByName
} from "./tools/file.js";
import {
  shellExec,
  shellView,
  shellWait,
  shellWriteToProcess,
  shellKillProcess
} from "./tools/shell.js";

export const SANDBOX_AGENT_VERSION = "0.1.0";

export interface BuildServerOptions {
  workspace?: string;
  startedAt?: number;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const startedAt = options.startedAt ?? Date.now();
  const workspace = options.workspace ?? "/workspace";

  app.get("/health", async () => ({
    ok: true as const,
    version: SANDBOX_AGENT_VERSION,
    uptime_seconds: (Date.now() - startedAt) / 1000,
    workspace
  }));

  route(app, "/file/read", FileReadInput, fileRead);
  route(app, "/file/write", FileWriteInput, fileWrite);
  route(app, "/file/str-replace", FileStrReplaceInput, fileStrReplace);
  route(app, "/file/find-in-content", FileFindInContentInput, fileFindInContent);
  route(app, "/file/find-by-name", FileFindByNameInput, fileFindByName);

  route(app, "/shell/exec", ShellExecInput, shellExec);
  route(app, "/shell/view", ShellViewInput, shellView);
  route(app, "/shell/wait", ShellWaitInput, shellWait);
  route(app, "/shell/write", ShellWriteToProcessInput, shellWriteToProcess);
  route(app, "/shell/kill", ShellKillProcessInput, shellKillProcess);

  app.setErrorHandler((err: unknown, _req, reply) => {
    const status =
      err !== null &&
      typeof err === "object" &&
      "statusCode" in err &&
      typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message =
      err !== null &&
      typeof err === "object" &&
      "message" in err &&
      typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "internal error";
    reply.status(status).send({ error: message });
  });

  return app;
}

import type { ZodType } from "zod";

function route<TIn, TOut>(
  app: FastifyInstance,
  path: string,
  schema: ZodType<TIn>,
  handler: (input: TIn) => Promise<TOut>
): void {
  app.post(path, async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400).send({
        error: "invalid input",
        issues: parsed.error.issues
      });
      return;
    }
    const result = await handler(parsed.data);
    reply.send(result);
  });
}
