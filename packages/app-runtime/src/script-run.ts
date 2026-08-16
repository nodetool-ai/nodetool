/**
 * The script-operation execution contract, shared by every host.
 *
 * A mini-app operation can run a JS script instead of a workflow. A script has
 * no graph, so two things have to be manufactured: the bindable surface the
 * binding layer resolves names against (its declared ports, which are its
 * stable identifiers — a script has no node ids), and the message stream the
 * fold consumes, because the run endpoint answers with plain JSON rather than
 * streaming.
 *
 * Both live here, above the browser and above the simulator, so the two hosts
 * cannot fold one script run two different ways. This package carries no
 * dependencies, so the script document is typed structurally and the one fact
 * that needs a parser — whether the body reads its inputs through `stream` —
 * arrives as a flag from the caller.
 */

/** One declared port. `type` is a TypeMetadata name (`"str"`, `"list[str]"`). */
export interface ScriptPort {
  name: string;
  type: string;
}

/** The fields of a JS script document an app operation reads. */
export interface ScriptOperationDocument {
  inputs: ScriptPort[];
  outputs: ScriptPort[];
}

/** What one script run returned — the body `POST /api/js-scripts/:id/run` answers with. */
export interface ScriptRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  /** `{name, value}` entries under the emit contract, in call order. */
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}

/** How one invocation's mapped values reach the body. */
export interface ScriptInvocationInput {
  inputs: Record<string, unknown>;
  /** Items staged per handle for a body that reads `stream`. */
  inputStreams?: Record<string, unknown[]>;
}

/**
 * Split an operation's mapped values the way the body reads them.
 *
 * An app operation is one shot: a widget holds one value per input, not a
 * stream of them. A body that reads `stream` still has to be fed through the
 * inbox, so each mapped value is staged as a one-item stream and `inputs` stays
 * empty — the split a graph run makes, where a connected handle is reachable
 * through `stream` and never through `inputs`. A buffered body is untouched.
 */
export function scriptInvocationInput(
  inputs: Record<string, unknown>,
  usesStreamInputs: boolean
): ScriptInvocationInput {
  if (!usesStreamInputs) return { inputs };
  const staged: Record<string, unknown[]> = {};
  for (const [handle, value] of Object.entries(inputs)) {
    staged[handle] = [value];
  }
  return { inputs: {}, inputStreams: staged };
}

const emitEntry = (item: unknown): { name: string; value: unknown } | null => {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  return typeof record.name === "string"
    ? { name: record.name, value: record.value }
    : null;
};

/**
 * The message stream a script run would have produced: its emits in order,
 * then its final outputs, then the job's terminal status.
 *
 * Emits append (they are one output handle streaming), finals replace and mark
 * the handle done — the same dispositions the kernel sends for a streaming
 * node followed by its final bag. A `jobId` stamps every message, because the
 * fold resolves a message to its invocation by job id.
 */
export function scriptRunMessages(
  result: ScriptRunResult,
  jobId?: string
): Array<Record<string, unknown>> {
  const job = jobId === undefined ? {} : { job_id: jobId };
  const messages: Array<Record<string, unknown>> = [];
  for (const item of result.streamed ?? []) {
    const entry = emitEntry(item);
    if (!entry) continue;
    messages.push({
      ...job,
      type: "output_update",
      node_id: entry.name,
      output_name: entry.name,
      value: entry.value,
      disposition: "append"
    });
  }
  for (const [name, value] of Object.entries(result.outputs ?? {})) {
    messages.push({
      ...job,
      type: "output_update",
      node_id: name,
      output_name: name,
      value,
      disposition: "replace",
      done: true
    });
  }
  const jobUpdate = {
    ...job,
    type: "job_update",
    status: result.ok ? "completed" : "failed"
  };
  messages.push(
    result.error === undefined
      ? jobUpdate
      : { ...jobUpdate, error: result.error }
  );
  return messages;
}

/** A script port as the binding layer sees it: the name stands in for a node id. */
export interface ScriptPortIO {
  nodeId: string;
  nodeType: string;
  name: string;
}

/**
 * A script's bindable surface. Port names stand in for node ids: a script
 * declares no nodes, and its port names are what every mapping already keys on.
 */
export function scriptPortIO(document: ScriptOperationDocument) {
  return {
    inputs: document.inputs.map((port) => ({
      nodeId: port.name,
      nodeType: `jsscript.input.${port.type}`,
      name: port.name
    })),
    outputs: document.outputs.map((port) => ({
      nodeId: port.name,
      nodeType: `jsscript.output.${port.type}`,
      name: port.name
    })),
    nodeIds: [
      ...document.inputs.map((port) => port.name),
      ...document.outputs.map((port) => port.name)
    ]
  };
}
