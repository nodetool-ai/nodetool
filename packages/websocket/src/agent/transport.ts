/**
 * AgentTransport — abstract bridge between the agent runtime and a renderer.
 *
 * The agent runtime (Claude/Codex/OpenCode SDKs) needs to:
 *   1. Stream agent messages back to the renderer.
 *   2. Ask the renderer for the available frontend-tool manifest.
 *   3. Ask the renderer to execute a frontend tool and await its result.
 *   4. Tell the renderer to abort any pending tool calls.
 *
 * In the legacy Electron architecture this was done via Electron IPC
 * (`webContents.send` / `ipcMain.on`). The WebSocket-based architecture
 * provides the same operations over a `ws://.../ws/agent` connection.
 *
 * Implementations live next to their transport (see `socketTransport.ts`).
 */

import type { AgentMessage, FrontendToolManifest } from "./types.js";

export interface AgentTransport {
  /**
   * Push a streaming message for `sessionId` to the renderer.
   * `done=true` signals the end of a turn so the renderer can flush state.
   */
  streamMessage(sessionId: string, message: AgentMessage, done: boolean): void;

  /**
   * Ask the renderer for the current frontend-tool manifest.
   * Resolves with the manifest array (possibly empty if unavailable).
   * Rejects on timeout or transport error.
   */
  requestToolManifest(sessionId: string): Promise<FrontendToolManifest[]>;

  /**
   * Ask the renderer to execute a frontend tool. Resolves with the tool
   * result, rejects on error or timeout.
   */
  executeTool(
    sessionId: string,
    toolCallId: string,
    name: string,
    args: unknown,
  ): Promise<unknown>;

  /** Tell the renderer to abort any pending tool calls for the session. */
  abortTools(sessionId: string): void;

  /** True if the underlying transport is still attached. */
  readonly isAlive: boolean;
}
