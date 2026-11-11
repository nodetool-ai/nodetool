/**
 * Bridge between the app agent's frontend tools (`ui_app_run_*`) and an app
 * running in the chat presentation. Each open chat app registers a handler under its app run id
 * (the instance id, or the application id when there is no instance), and the
 * tools address it by that id, the way `ui_app_*` builder tools address an
 * open builder by application id.
 */
import type { ChatAppStateSnapshot } from "@nodetool-ai/app-runtime";

import { createAgentHandlerRegistry } from "../../../lib/tools/agentHandlerRegistry";

export interface ChatAppRunResult {
  operation_id: string;
  /** "running": the run outlived the wait; a settled app event follows. */
  status: "completed" | "failed" | "cancelled" | "running";
  error?: string;
  note?: string;
  run_id?: string;
  failed_span_id?: string;
  /** The step the operation moved the app to, when it set one. */
  step?: string | null;
  outputs?: Record<string, unknown>;
}

export interface ChatAppHandler {
  getState: () => ChatAppStateSnapshot;
  /** Make a step current. Throws for a step the app does not have. */
  showStep: (step: string) => { step: string; title: string };
  setInputs: (values: Record<string, unknown>) => {
    written: string[];
    unknown: string[];
  };
  runOperation: (
    operationId: string,
    signal: AbortSignal
  ) => Promise<ChatAppRunResult>;
  cancelOperation: (operationId: string) => Promise<void>;
}

const handlers = createAgentHandlerRegistry<ChatAppHandler>();

export function setChatAppHandler(
  appRunId: string,
  handler: ChatAppHandler | null
): void {
  handlers.set(appRunId, handler);
}

export function getChatAppHandler(appRunId: string): ChatAppHandler {
  const handler = handlers.get(appRunId);
  if (handler) return handler;
  const open = [...handlers.keys()];
  throw new Error(
    open.length > 0
      ? `No chat app is open with app_run_id "${appRunId}". Open: ${open.join(", ")}.`
      : `No chat app is open. app_run_id "${appRunId}" is not running in this window.`
  );
}
