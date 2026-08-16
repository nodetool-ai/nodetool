/**
 * The supervisor's two read-only tools.
 *
 * Both pull from state the runner already holds, which is why there is no
 * observation pipeline in this design: a clean run costs nothing, and the agent
 * asks for what it needs when it needs it.
 *
 * `read_node_output` is scoped to the failing invocation's causal lineage. In a
 * fan-out, "the last value this node emitted" usually belongs to some other
 * item; handing that to the agent produces repairs built from the wrong data
 * and quietly widens what the model sees beyond the item that failed.
 *
 * See docs/workflow-supervisor-design.md §6.
 */

import { z, type ZodType } from "zod";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Escalation } from "@nodetool-ai/protocol";
import {
  MAX_ESCALATION_VALUE_CHARS,
  redactRecord,
  type RunStateDigest,
  type RunStateReader
} from "@nodetool-ai/kernel";
import { Tool } from "../tools/base-tool.js";

/**
 * Secret values to mask in tool results. `read_node_output` is the one
 * supervisor input that does not come from an already-redacted `Escalation`,
 * so the same layer has to run here.
 */
type SecretSource = () => ReadonlySet<string>;

function resolveSecrets(context: ProcessingContext): ReadonlySet<string> {
  return context.getResolvedSecretValues?.() ?? new Set<string>();
}

export class GetRunStateTool extends Tool {
  readonly name = "get_run_state";
  readonly description =
    "Digest of the run in flight: every node's status, how many invocations " +
    "it has emitted, how many times it has escalated, its error if it has " +
    "one, and the run's provider spend so far.";

  private readonly _reader: RunStateReader;

  constructor(reader: RunStateReader) {
    super();
    this._reader = reader;
  }

  get schema(): ZodType {
    return z.object({});
  }

  async process(): Promise<RunStateDigest> {
    return this._reader.digest();
  }
}

/** What {@link ReadNodeOutputTool} answers: the branch's output, or why not. */
export type NodeOutputReadResult =
  | { error: "not_available"; message: string }
  | {
      nodeId: string;
      lineage: readonly string[];
      outputs: ReturnType<typeof redactRecord>;
    };

export class ReadNodeOutputTool extends Tool {
  readonly name = "read_node_output";
  readonly description =
    "The output a node produced for the failing invocation's own branch of " +
    "the run. Reads outside that branch — another item of the same fan-out, " +
    "an unrelated branch — are refused: that data is not evidence about this " +
    "failure.";

  private readonly _reader: RunStateReader;
  private readonly _escalation: Escalation;
  private readonly _secrets: SecretSource;

  constructor(
    reader: RunStateReader,
    escalation: Escalation,
    secrets: SecretSource
  ) {
    super();
    this._reader = reader;
    this._escalation = escalation;
    this._secrets = secrets;
  }

  get schema(): ZodType {
    return z.object({
      node_id: z.string().describe("Id of the node whose output to read.")
    });
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<NodeOutputReadResult> {
    const nodeId = String(params["node_id"] ?? "");
    const read = this._reader.readOutput(
      nodeId,
      this._escalation.correlationLineage
    );
    if (!read) {
      return {
        error: "not_available",
        message:
          `No output from "${nodeId}" belongs to this invocation's branch ` +
          `(${this._escalation.correlationLineage.join(",") || "root"}).`
      };
    }
    return {
      nodeId: read.nodeId,
      lineage: read.lineage,
      outputs: redactRecord(read.outputs, this._secrets())
    };
  }
}

/** The toolset for one decision, bound to the escalation being decided. */
export function createSupervisorTools(
  reader: RunStateReader,
  escalation: Escalation,
  context: ProcessingContext
): Tool[] {
  return [
    new GetRunStateTool(reader),
    new ReadNodeOutputTool(reader, escalation, () => resolveSecrets(context))
  ];
}

export { MAX_ESCALATION_VALUE_CHARS };
