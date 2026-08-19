/**
 * codeAssistantBridge
 *
 * Bridge between the agent tooling layer (the `ui_code_*` frontend tools) and
 * an open Code assistant dialog, mirroring {@link scriptAgentBridge}.
 *
 * The dialog registers a {@link CodeAssistantHandler} under its node id on
 * mount and clears it on unmount, so the tools address a specific Code node's
 * draft explicitly by id.
 *
 * Everything crossing the bridge is a plain serializable value: the agent
 * reads {@link CodeAssistantState} objects and writes code, ports, and package
 * lists as strings — never Zustand handles or React state setters.
 */

/** One declared input or output handle on the draft. */
export interface CodeAssistantPort {
  name: string;
  /** NodeTool type name, e.g. "str", "int", "list", "image", "any". */
  type: string;
}

/** Snapshot of the draft the agent reads to plan its edits. */
export interface CodeAssistantState {
  node_id: string;
  /** The draft code body being edited (not yet applied to the node). */
  code: string;
  inputs: CodeAssistantPort[];
  outputs: CodeAssistantPort[];
  /** Sandbox package specifiers the node declares. */
}

/** Operations an open Code assistant dialog exposes to the tooling layer. */
export interface CodeAssistantHandler {
  getState: () => CodeAssistantState;
  /** Replace the draft code body; the editor updates live. */
  setCode: (code: string) => void;
  /** Replace declared inputs and/or outputs wholesale (omitted = unchanged). */
  setPorts: (ports: {
    inputs?: CodeAssistantPort[];
    outputs?: CodeAssistantPort[];
  }) => void;
}

const handlers = new Map<string, CodeAssistantHandler>();

/**
 * Register the handler for one node id. The dialog calls this on mount and
 * invokes the returned unregister function on unmount.
 */
export function registerCodeAssistantHandler(
  nodeId: string,
  handler: CodeAssistantHandler
): () => void {
  handlers.set(nodeId, handler);
  return () => {
    if (handlers.get(nodeId) === handler) {
      handlers.delete(nodeId);
    }
  };
}

/** Ids of every node with an open Code assistant, in registration order. */
export function listOpenCodeAssistantIds(): string[] {
  return [...handlers.keys()];
}

export function getCodeAssistantHandler(nodeId: string): CodeAssistantHandler {
  const handler = handlers.get(nodeId);
  if (!handler) {
    const open = listOpenCodeAssistantIds();
    throw new Error(
      `No Code assistant is open for node "${nodeId}". ` +
        (open.length > 0
          ? `Open Code assistants: ${open.join(", ")}.`
          : "No Code assistant is currently open. Ask the user to open one from a Code node.")
    );
  }
  return handler;
}
