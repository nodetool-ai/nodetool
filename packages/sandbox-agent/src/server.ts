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
  ShellKillProcessInput,
  BrowserViewInput,
  BrowserNavigateInput,
  BrowserRestartInput,
  BrowserClickInput,
  BrowserInputTextInput,
  BrowserMoveMouseInput,
  BrowserPressKeyInput,
  BrowserSelectOptionInput,
  BrowserScrollInput,
  BrowserConsoleExecInput,
  BrowserConsoleViewInput,
  ScreenCaptureInput,
  ScreenFindInput,
  MouseMoveInput,
  MouseClickInput,
  MouseDragInput,
  MouseScrollInput,
  KeyPressInput,
  KeyTypeInput,
  InfoSearchWebInput,
  MessageNotifyUserInput,
  MessageAskUserInput,
  IdleInput,
  ExposePortInput
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
import {
  browserView,
  browserNavigate,
  browserRestart,
  browserClick,
  browserInput,
  browserMoveMouse,
  browserPressKey,
  browserSelectOption,
  browserScroll,
  browserConsoleExec,
  browserConsoleView
} from "./tools/browser.js";
import {
  screenCapture,
  screenFind,
  mouseMove,
  mouseClick,
  mouseDrag,
  mouseScroll,
  keyPress,
  keyType,
  cursorPosition
} from "./tools/desktop.js";
import { infoSearchWeb } from "./tools/search.js";
import {
  messageNotifyUser,
  messageAskUser,
  idle
} from "./tools/message.js";
import { exposePort } from "./tools/deploy.js";
import { replay, subscribe } from "./event-bus.js";
import { setPortMap } from "./port-map.js";

export const SANDBOX_AGENT_VERSION = "0.1.0";

export interface BuildServerOptions {
  workspace?: string;
  startedAt?: number;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024 * 1024 });
  const startedAt = options.startedAt ?? Date.now();
  const workspace = options.workspace ?? "/workspace";

  app.get("/health", async () => ({
    ok: true as const,
    version: SANDBOX_AGENT_VERSION,
    uptime_seconds: (Date.now() - startedAt) / 1000,
    workspace
  }));

  // --- File tools --------------------------------------------------------
  route(app, "/file/read", FileReadInput, fileRead);
  route(app, "/file/write", FileWriteInput, fileWrite);
  route(app, "/file/str-replace", FileStrReplaceInput, fileStrReplace);
  route(app, "/file/find-in-content", FileFindInContentInput, fileFindInContent);
  route(app, "/file/find-by-name", FileFindByNameInput, fileFindByName);

  // --- Shell tools -------------------------------------------------------
  route(app, "/shell/exec", ShellExecInput, shellExec);
  route(app, "/shell/view", ShellViewInput, shellView);
  route(app, "/shell/wait", ShellWaitInput, shellWait);
  route(app, "/shell/write", ShellWriteToProcessInput, shellWriteToProcess);
  route(app, "/shell/kill", ShellKillProcessInput, shellKillProcess);

  // --- Browser tools -----------------------------------------------------
  route(app, "/browser/view", BrowserViewInput, browserView);
  route(app, "/browser/navigate", BrowserNavigateInput, browserNavigate);
  route(app, "/browser/restart", BrowserRestartInput, browserRestart);
  route(app, "/browser/click", BrowserClickInput, browserClick);
  route(app, "/browser/input", BrowserInputTextInput, browserInput);
  route(app, "/browser/move-mouse", BrowserMoveMouseInput, browserMoveMouse);
  route(app, "/browser/press-key", BrowserPressKeyInput, browserPressKey);
  route(app, "/browser/select-option", BrowserSelectOptionInput, browserSelectOption);
  route(app, "/browser/scroll", BrowserScrollInput, browserScroll);
  route(app, "/browser/console-exec", BrowserConsoleExecInput, browserConsoleExec);
  route(app, "/browser/console-view", BrowserConsoleViewInput, browserConsoleView);

  // --- Desktop tools -----------------------------------------------------
  route(app, "/desktop/capture", ScreenCaptureInput, screenCapture);
  route(app, "/desktop/find", ScreenFindInput, screenFind);
  route(app, "/desktop/mouse/move", MouseMoveInput, mouseMove);
  route(app, "/desktop/mouse/click", MouseClickInput, mouseClick);
  route(app, "/desktop/mouse/drag", MouseDragInput, mouseDrag);
  route(app, "/desktop/mouse/scroll", MouseScrollInput, mouseScroll);
  route(app, "/desktop/key/press", KeyPressInput, keyPress);
  route(app, "/desktop/key/type", KeyTypeInput, keyType);
  app.get("/desktop/cursor-position", async () => cursorPosition());

  // --- Search ------------------------------------------------------------
  route(app, "/search/web", InfoSearchWebInput, infoSearchWeb);

  // --- Messaging ---------------------------------------------------------
  route(app, "/message/notify", MessageNotifyUserInput, messageNotifyUser);
  route(app, "/message/ask", MessageAskUserInput, messageAskUser);
  route(app, "/idle", IdleInput, idle);

  // --- Deploy ------------------------------------------------------------
  route(app, "/deploy/expose-port", ExposePortInput, exposePort);

  // Internal control plane (host → server). Not an agent-facing tool.
  app.post("/internal/set-port-map", async (req, reply) => {
    const body = req.body as { map?: Record<string, string> } | undefined;
    if (!body || typeof body.map !== "object" || body.map === null) {
      reply.status(400).send({ error: "missing map" });
      return;
    }
    setPortMap(body.map);
    reply.send({ ok: true });
  });

  // --- Event stream (SSE) ------------------------------------------------
  app.get("/events", async (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    // Replay buffered events so reconnecting clients catch up.
    for (const ev of replay()) {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    }

    const unsubscribe = subscribe((ev) => {
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    });

    // Heartbeat comments keep intermediaries from closing the pipe.
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15_000);

    const close = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        reply.raw.end();
      } catch {
        // ignore
      }
    };
    req.raw.on("close", close);
    req.raw.on("error", close);
  });

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
