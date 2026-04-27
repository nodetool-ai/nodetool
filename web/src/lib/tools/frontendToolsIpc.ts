/**
 * Frontend Tools WebSocket Bridge
 *
 * This module bridges the FrontendToolRegistry with the agent WebSocket
 * (`/ws/agent`), allowing the server-side agent runtime to call frontend
 * tools that execute against the live workflow graph in the renderer.
 *
 * The server emits `tools_manifest_request` and `tool_call_request` events;
 * this module replies with `tools_manifest_response` and
 * `tool_call_response` envelopes via {@link AgentSocketClient}.
 */

import { FrontendToolRegistry } from "./frontendTools";
import { getFrontendToolRuntimeState } from "./frontendToolRuntimeState";
import "./builtin/graph";
import "./builtin/addNode";
import "./builtin/updateNodeData";
import "./builtin/connectNodes";
import "./builtin/setNodeTitle";
import "./builtin/setNodeSyncMode";
import "./builtin/moveNode";
import "./builtin/getGraph";
import "./builtin/searchNodes";
import "./builtin/searchModels";
import "./builtin/deleteNode";
import "./builtin/deleteEdge";
import "./builtin/uiActions";
import { getAgentSocketClient } from "../agent/AgentSocketClient";
import type {
  ToolCallRequestEvent,
  ToolsManifestRequestEvent
} from "../agent/AgentSocketClient";

async function requestUserConsent(
  toolName: string,
  args: unknown
): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return false;
  }

  const prettyArgs = (() => {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  })();

  return window.confirm(
    `Allow agent to run ${toolName}?\n\nArguments:\n${prettyArgs}`
  );
}

let initialized = false;

/**
 * Initialize the WebSocket bridge for frontend tools.
 *
 * Subscribes to manifest/tool-call events on the agent socket. Idempotent —
 * additional calls are no-ops.
 */
export function initFrontendToolsBridge(): void {
  if (initialized) return;
  initialized = true;

  const client = getAgentSocketClient();

  const manifest = FrontendToolRegistry.getManifest();
  console.info(
    `[frontend-tools] Registered ${manifest.length} tools: ${manifest
      .map((tool) => tool.name)
      .join(", ")}`
  );

  client.on(
    "toolsManifestRequest",
    (request: ToolsManifestRequestEvent): void => {
      const currentManifest = FrontendToolRegistry.getManifest();
      console.debug(
        `[frontend-tools] Manifest requested (session=${request.sessionId}, requestId=${request.requestId}) -> ${currentManifest.length} tools`
      );
      client.sendToolsManifestResponse(request.requestId, currentManifest);
    }
  );

  client.on("toolCallRequest", async (request: ToolCallRequestEvent): Promise<void> => {
    const { requestId, sessionId, toolCallId, name, args } = request;
    console.debug(
      `[frontend-tools] Tool call requested: ${name} (session=${sessionId}, callId=${toolCallId}, requestId=${requestId})`
    );

    if (!FrontendToolRegistry.has(name)) {
      console.warn(
        `[frontend-tools] Unknown tool requested: ${name} (session=${sessionId}, callId=${toolCallId})`
      );
      client.sendToolCallResponse(requestId, {
        result: null,
        isError: true,
        error: `Unknown tool: ${name}`
      });
      return;
    }

    try {
      const toolDef = FrontendToolRegistry.get(name);
      if (!toolDef) {
        throw new Error(`Unknown tool: ${name}`);
      }

      if (toolDef.requireUserConsent) {
        const approved = await requestUserConsent(name, args);
        if (!approved) {
          client.sendToolCallResponse(requestId, {
            result: null,
            isError: true,
            error: `User denied consent for ${name}`
          });
          return;
        }
      }

      const result = await FrontendToolRegistry.call(name, args, toolCallId, {
        getState: getFrontendToolRuntimeState
      });

      client.sendToolCallResponse(requestId, {
        result,
        isError: false
      });
      console.debug(
        `[frontend-tools] Tool call succeeded: ${name} (session=${sessionId}, callId=${toolCallId})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Args can be large (e.g. ui_add_node properties); cap so the log line
      // stays readable but the model's intent is still recoverable from logs.
      let argsPreview: string;
      try {
        argsPreview = JSON.stringify(args);
      } catch {
        argsPreview = "[unserializable]";
      }
      if (argsPreview.length > 500) {
        argsPreview = argsPreview.slice(0, 497) + "...";
      }
      console.error(
        `[frontend-tools] Tool call failed: ${name} (session=${sessionId}, callId=${toolCallId}) — ${message} | args=${argsPreview}`,
        error
      );
      client.sendToolCallResponse(requestId, {
        result: null,
        isError: true,
        error: message
      });
    }
  });

  client.on("toolCallAbort", (event: { sessionId: string }): void => {
    console.info(`[frontend-tools] Abort requested (session=${event.sessionId})`);
    FrontendToolRegistry.abortAll();
  });
}

if (typeof window !== "undefined") {
  initFrontendToolsBridge();
}
