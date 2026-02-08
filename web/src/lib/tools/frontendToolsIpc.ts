/**
 * Frontend Tools IPC Bridge
 *
 * This module bridges the FrontendToolRegistry with the Electron IPC system,
 * allowing the Claude Agent SDK (running in the main process) to call frontend
 * tools (running in the renderer process).
 *
 * When running in Electron, this module registers IPC listeners that:
 * 1. Return the frontend tools manifest
 * 2. Execute tools and return results
 * 3. Handle tool abortion
 *
 * The main process sends request events, and this module responds back
 * with paired response events.
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
import "./builtin/deleteNode";
import "./builtin/deleteEdge";

/**
 * Check if we're running in an Electron environment with IPC available.
 */
function isElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    window.api !== undefined &&
    window.api.claudeAgent !== undefined
  );
}

/**
 * Get the IPC methods from the exposed API.
 * This is set up by the preload script's contextBridge.
 */
function getIpc() {
  return typeof window !== "undefined" ? (window as any).api?.ipc : null;
}

async function requestUserConsent(
  toolName: string,
  args: unknown,
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
    `Allow Claude Agent to run ${toolName}?\n\nArguments:\n${prettyArgs}`
  );
}

/**
 * Initialize the IPC bridge for frontend tools.
 *
 * This registers handlers that the main process can call to:
 * - Get the tools manifest
 * - Execute tools
 *
 * This should be called once at application startup.
 */
export function initFrontendToolsIpc(): void {
  if (!isElectron()) {
    return;
  }

  const ipc = getIpc();
  if (!ipc) {
    console.warn("IPC methods not available - frontend tools IPC bridge not initialized");
    return;
  }

  const manifest = FrontendToolRegistry.getManifest();
  console.info(
    `[frontend-tools] Registered ${manifest.length} tools: ${manifest
      .map((tool) => tool.name)
      .join(", ")}`
  );

  // Listener for getting the frontend tools manifest
  ipc.on(
    "frontend-tools-get-manifest-request",
    (_event: unknown, request: { requestId: string; sessionId: string }) => {
      const currentManifest = FrontendToolRegistry.getManifest();
      console.debug(
        `[frontend-tools] Manifest requested (session=${request.sessionId}, requestId=${request.requestId}) -> ${currentManifest.length} tools`
      );
      ipc.send("frontend-tools-get-manifest-response", {
        requestId: request.requestId,
        sessionId: request.sessionId,
        manifest: currentManifest,
      });
    },
  );

  // Listener for calling a frontend tool
  ipc.on(
    "frontend-tools-call-request",
    async (
      _event: unknown,
      request: {
        requestId: string;
        sessionId: string;
        toolCallId: string;
        name: string;
        args: unknown;
      },
    ) => {
      const { requestId, sessionId, toolCallId, name, args } = request;
      console.debug(
        `[frontend-tools] Tool call requested: ${name} (session=${sessionId}, callId=${toolCallId}, requestId=${requestId})`
      );

      if (!FrontendToolRegistry.has(name)) {
        console.warn(
          `[frontend-tools] Unknown tool requested: ${name} (session=${sessionId}, callId=${toolCallId})`
        );
        ipc.send("frontend-tools-call-response", {
          requestId,
          sessionId,
          result: {
            result: null,
            isError: true,
            error: `Unknown tool: ${name}`,
          },
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
            ipc.send("frontend-tools-call-response", {
              requestId,
              sessionId,
              result: {
                result: null,
                isError: true,
                error: `User denied consent for ${name}`,
              },
            });
            return;
          }
        }

        const result = await FrontendToolRegistry.call(
          name,
          args,
          toolCallId,
          {
            getState: getFrontendToolRuntimeState,
          },
        );

        ipc.send("frontend-tools-call-response", {
          requestId,
          sessionId,
          result: {
            result,
            isError: false,
          },
        });
        console.debug(
          `[frontend-tools] Tool call succeeded: ${name} (session=${sessionId}, callId=${toolCallId})`
        );
      } catch (error) {
        console.error(
          `[frontend-tools] Tool call failed: ${name} (session=${sessionId}, callId=${toolCallId})`,
          error
        );
        ipc.send("frontend-tools-call-response", {
          requestId,
          sessionId,
          result: {
            result: null,
            isError: true,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  );

  // Handler for aborting tool calls
  ipc.on(
    "frontend-tools-abort",
    (_event: unknown, data: { sessionId: string }) => {
      console.info(`[frontend-tools] Abort requested (session=${data.sessionId})`);
      // Abort all tool calls for this session
      FrontendToolRegistry.abortAll();
    },
  );
}

/**
 * Auto-initialize the IPC bridge when running in Electron.
 */
if (isElectron()) {
  initFrontendToolsIpc();
}
