/**
 * jsScriptAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_jsscript_*` frontend tools)
 * and the live JS script surface, mirroring {@link scriptAgentBridge}.
 *
 * Every open JsScriptSurface registers a {@link JsScriptAgentHandler} under its
 * script id and clears it on unmount, so the tools address a script explicitly
 * by id — an open script stays addressable whether or not it has focus.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * a {@link JsScriptSnapshot} and never touches Zustand store handles.
 */

import type {
  JsScriptDocument,
  JsScriptPalette,
  JsScriptPort,
  JsScriptRunOutcome,
  JsScriptTestCase,
  JsScriptTestReport
} from "../../stores/jsScript/JsScriptStore";

/** One document-level validation finding, as the protocol checker reports it. */
export interface JsScriptIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

/** Full snapshot of the open script the agent reads before it edits. */
export interface JsScriptSnapshot {
  scriptId: string;
  name: string;
  document: JsScriptDocument;
  /** Document-level issues, recomputed on every read. */
  issues: JsScriptIssue[];
  /** The last run this surface performed, if any. */
  lastRun: JsScriptRunOutcome | null;
  /** The last graded test report, if any. */
  lastTest: JsScriptTestReport | null;
}

/** Metadata `ui_jsscript_set_meta` can write. Omitted fields stay as they are. */
export interface JsScriptMetaInput {
  name?: string;
  description?: string;
  secrets?: string[];
  timeoutSeconds?: number;
  /** Menu placement; `null` takes the script back out of the node menu. */
  palette?: JsScriptPalette | null;
}

/** Operations the live JsScriptSurface exposes to the agent tooling layer. */
export interface JsScriptAgentHandler {
  getSnapshot: () => JsScriptSnapshot;
  setCode: (code: string) => JsScriptSnapshot;
  setPorts: (ports: {
    inputs?: JsScriptPort[];
    outputs?: JsScriptPort[];
  }) => JsScriptSnapshot;
  setMeta: (meta: JsScriptMetaInput) => JsScriptSnapshot;
  setTests: (tests: JsScriptTestCase[]) => JsScriptSnapshot;
  /**
   * Run the saved script server-side with the given inputs, or — for a body
   * that reads `stream` — with items staged per input handle.
   */
  run: (
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>
  ) => Promise<JsScriptRunOutcome>;
  /** Run every saved case and grade it. */
  test: () => Promise<JsScriptTestReport>;
}

const handlers = new Map<string, JsScriptAgentHandler>();

/**
 * Register (or clear, with null) the handler for one JS script id. Each open
 * JsScriptSurface calls this on mount and clears it on unmount.
 */
export function setJsScriptAgentHandler(
  scriptId: string,
  next: JsScriptAgentHandler | null
): void {
  if (next) {
    handlers.set(scriptId, next);
  } else {
    handlers.delete(scriptId);
  }
}

export function hasJsScriptAgentHandler(scriptId: string): boolean {
  return handlers.has(scriptId);
}

/** Ids of every JS script currently open, in registration order. */
export function listOpenJsScriptIds(): string[] {
  return [...handlers.keys()];
}

export function getJsScriptAgentHandler(
  scriptId: string
): JsScriptAgentHandler {
  const handler = handlers.get(scriptId);
  if (!handler) {
    const open = listOpenJsScriptIds();
    throw new Error(
      `No JS script "${scriptId}" is open. ` +
        (open.length > 0
          ? `Open JS scripts: ${open.join(", ")}. `
          : "No JS scripts are currently open. ") +
        'Call ui_open_document with type "jsscript" to open it.'
    );
  }
  return handler;
}
