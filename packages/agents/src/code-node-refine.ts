/**
 * Code-node refinement -- a post-submit pass that re-authors the bodies the
 * GraphPlanner wrote inline.
 *
 * A graph program carries a Code node's body as a string literal inside one
 * DSL submission, so the body gets whatever attention was left over from
 * wiring twenty nodes. `CodePlanner` authors a body with the sandbox reference
 * in front of the model, one submission at a time, and its own feedback rounds.
 * This pass hands each accepted Code node to it.
 *
 * Refinement never widens the graph's contract. The wired input handles are
 * seeded as required inputs, the consumed output handles must survive, and the
 * patched graph is re-validated — anything that fails leaves the original body
 * in place and adds a warning. A CodePlanner failure does the same.
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { isJsCodeNodeType, validateGraph } from "@nodetool-ai/node-sdk";
import { createLogger } from "@nodetool-ai/config";
import type {
  Edge,
  GraphData,
  NodeDescriptor,
  PlanningUpdate,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type {
  CodeGenInputPort,
  CodeGenOutputPort,
  CodeGenTypeMetadata
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import { CodePlanner } from "./code-planner.js";
import { linkAbort } from "./utils/link-abort.js";
import {
  metadataAwareRegistry,
  supportsDeepValidation
} from "./tools/graph-validation-registry.js";

const log = createLogger("nodetool.agents.code-node-refine");

const NODE_ID = "code_refine";

/** Code nodes refined per graph. A wide graph must not turn into a spend. */
const DEFAULT_MAX_NODES = 3;
/** Feedback rounds per node — one fewer than the dialog path's three. */
const DEFAULT_MAX_ROUNDS = 2;
/** Wall clock for one node, after which the original body stands. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Handles like `__control__` are framework-internal, never Code node slots. */
const isReservedHandle = (handle: string): boolean =>
  handle.startsWith("__") && handle.endsWith("__");

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const ANY_TYPE: CodeGenTypeMetadata = { type: "any" };

export interface CodeNodeRefinementOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** The workflow objective, so the body is written for the right step. */
  objective: string;
  signal?: AbortSignal;
  threadId?: string;
  /** Nodes to refine. Defaults to 3. */
  maxNodes?: number;
  /** Feedback rounds per node. Defaults to 2. */
  maxRounds?: number;
  /** Wall clock per node in ms. Defaults to 60000. */
  timeoutMs?: number;
}

export interface CodeNodeRefinementOutcome {
  nodeId: string;
  /** `refined` means the node's body was replaced. */
  status: "refined" | "kept";
  /** Why the original body stands, for a `kept` outcome. */
  reason?: string;
}

export interface CodeNodeRefinementReport {
  /** Code nodes eligible for the pass, before the `maxNodes` cap. */
  eligible: number;
  refined: number;
  outcomes: CodeNodeRefinementOutcome[];
  warnings: string[];
}

/** Read a node's `properties` map without trusting its shape. */
function readProperties(node: NodeDescriptor): Record<string, unknown> {
  const props = node.properties;
  return props && typeof props === "object"
    ? (props as Record<string, unknown>)
    : {};
}

function asTypeMetadata(value: unknown): CodeGenTypeMetadata {
  return value && typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
    ? (value as CodeGenTypeMetadata)
    : ANY_TYPE;
}

/** Static property names of a node type — never dynamic slots. */
function staticPropertyNames(
  registry: NodeRegistry,
  nodeType: string
): Set<string> {
  const metadata = registry.getMetadata?.(nodeType);
  const names = (metadata?.properties ?? []).map((property) => property.name);
  return new Set(names);
}

/**
 * The input slots the graph already gives this node: every handle an edge
 * lands on, plus the slots and inline values the program declared.
 *
 * These are a contract, not a suggestion — an edge points at each one, so a
 * submission that renames or drops one breaks the wire.
 */
function deriveInputs(
  node: NodeDescriptor,
  edges: readonly Edge[],
  reserved: ReadonlySet<string>
): CodeGenInputPort[] {
  const slots = node.dynamic_inputs ?? {};
  const names = new Set<string>([
    ...Object.keys(slots),
    ...Object.keys(node.dynamic_properties ?? {}),
    ...edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.targetHandle ?? "")
  ]);

  const ports: CodeGenInputPort[] = [];
  for (const name of names) {
    if (!name || reserved.has(name) || isReservedHandle(name)) continue;
    if (!IDENTIFIER.test(name)) continue;
    ports.push({ name, type: asTypeMetadata(slots[name]?.type) });
  }
  return ports;
}

/** The output slots downstream nodes consume, plus any declared slot. */
function deriveOutputs(
  node: NodeDescriptor,
  edges: readonly Edge[]
): CodeGenOutputPort[] {
  const slots = node.dynamic_outputs ?? {};
  const names = new Set<string>([
    ...Object.keys(slots),
    ...edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => edge.sourceHandle ?? "")
  ]);

  const ports: CodeGenOutputPort[] = [];
  for (const name of names) {
    if (!name || isReservedHandle(name)) continue;
    if (!IDENTIFIER.test(name)) continue;
    ports.push({ name, type: asTypeMetadata(slots[name]) });
  }
  return ports;
}

/** Output handles an edge already reads. Losing one dangles that edge. */
function consumedOutputNames(
  node: NodeDescriptor,
  edges: readonly Edge[]
): string[] {
  const names = new Set<string>();
  for (const edge of edges) {
    if (edge.source !== node.id) continue;
    const handle = edge.sourceHandle;
    if (handle && !isReservedHandle(handle)) names.add(handle);
  }
  return [...names];
}

function buildInstruction(
  node: NodeDescriptor,
  objective: string,
  inputs: readonly CodeGenInputPort[],
  consumed: readonly string[]
): string {
  const parts = [
    `This Code node is one step of a workflow with this objective:\n${objective}`
  ];
  if (node.name && node.name !== node.id) {
    parts.push(`The step is called "${node.name}".`);
  }
  parts.push(
    "Rewrite the node so it does that step. Submit the full replacement."
  );
  if (inputs.length > 0) {
    parts.push(
      `Declare exactly these inputs and no others — an edge already feeds each ` +
        `one, and an input nothing wires arrives undefined: ` +
        `${inputs.map((input) => input.name).join(", ")}.`
    );
  } else {
    parts.push("The node takes no inputs; compute from constants in the body.");
  }
  if (consumed.length > 0) {
    parts.push(
      `Keep an output named ${consumed
        .map((name) => `"${name}"`)
        .join(", ")} — downstream nodes read it.`
    );
  }
  return parts.join("\n\n");
}

/** Error messages `validateGraph` reports, or none when the registry is thin. */
function graphErrors(graph: GraphData, registry: NodeRegistry): string[] {
  if (!supportsDeepValidation(registry)) return [];
  const report = validateGraph(graph, metadataAwareRegistry(registry));
  return report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

/**
 * Refine every Code node in an accepted graph. Mutates the graph in place and
 * returns what happened per node.
 */
export async function* refineCodeNodes(
  graph: GraphData,
  options: CodeNodeRefinementOptions
): AsyncGenerator<ProcessingMessage, CodeNodeRefinementReport> {
  const maxNodes = Math.max(0, options.maxNodes ?? DEFAULT_MAX_NODES);
  const maxRounds = Math.max(1, options.maxRounds ?? DEFAULT_MAX_ROUNDS);
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const outcomes: CodeNodeRefinementOutcome[] = [];
  const warnings: string[] = [];

  const edges = graph.edges ?? [];
  const fedByEdge = new Set(
    edges.map((edge) => `${edge.target} ${edge.targetHandle ?? ""}`)
  );

  // A `code` handle an edge feeds carries a body from upstream; there is
  // nothing authored here to refine.
  const candidates = (graph.nodes ?? []).filter(
    (node) =>
      isJsCodeNodeType(node.type) &&
      !fedByEdge.has(`${node.id} code`) &&
      typeof readProperties(node).code === "string" &&
      String(readProperties(node).code).trim().length > 0
  );

  if (candidates.length === 0) {
    return { eligible: 0, refined: 0, outcomes, warnings };
  }

  const selected = candidates.slice(0, maxNodes);
  if (candidates.length > selected.length) {
    warnings.push(
      `Refined ${selected.length} of ${candidates.length} Code nodes; the rest keep their authored body.`
    );
  }

  yield {
    type: "planning_update",
    node_id: NODE_ID,
    phase: "code_refinement",
    status: "running",
    content: `Refining ${selected.length} Code node${selected.length > 1 ? "s" : ""}...`
  } satisfies PlanningUpdate;

  // Errors already in the graph are not this pass's to fix. Compare against
  // them so an unrelated pre-existing issue can't revert every body.
  const baseline = new Set(graphErrors(graph, options.registry));
  let refined = 0;

  for (const node of selected) {
    if (options.signal?.aborted) {
      warnings.push("Code refinement was cancelled.");
      break;
    }

    const properties = readProperties(node);
    const originalCode = String(properties.code);
    const reserved = staticPropertyNames(options.registry, node.type);
    const inputs = deriveInputs(node, edges, reserved);
    const outputs = deriveOutputs(node, edges);
    const consumed = consumedOutputNames(node, edges);

    const abort = new AbortController();
    const unlink = linkAbort(abort, options.signal);
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    if (typeof timer === "object" && "unref" in timer) timer.unref();

    let keptReason: string | null = null;
    try {
      const planner = new CodePlanner({
        provider: options.provider,
        model: options.model,
        instruction: buildInstruction(node, options.objective, inputs, consumed),
        inputs,
        currentCode: originalCode,
        currentInputs: inputs,
        ...(outputs.length > 0 ? { currentOutputs: outputs } : {}),
        maxRounds,
        signal: abort.signal,
        ...(options.threadId ? { threadId: options.threadId } : {})
      });

      const response = yield* planner.plan();

      if (response.status !== "ok") {
        keptReason = `code generation failed (${response.error.code}): ${response.error.message}`;
      } else {
        const submission = response.submission;
        const declaredOutputs = new Set(
          submission.outputs.map((port) => port.name)
        );
        const missing = consumed.filter((name) => !declaredOutputs.has(name));
        const declaredInputs = new Set(inputs.map((port) => port.name));
        const extra = submission.inputs
          .map((port) => port.name)
          .filter((name) => !declaredInputs.has(name));

        if (missing.length > 0) {
          keptReason = `the new body drops connected output${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`;
        } else if (extra.length > 0) {
          keptReason = `the new body reads unwired input${extra.length > 1 ? "s" : ""} ${extra.join(", ")}`;
        } else if (submission.code === originalCode) {
          keptReason = "the body is unchanged";
        } else {
          properties.code = submission.code;
          const introduced = graphErrors(graph, options.registry).filter(
            (message) => !baseline.has(message)
          );
          if (introduced.length > 0) {
            properties.code = originalCode;
            keptReason = `the new body fails validation: ${introduced.join("; ")}`;
          } else {
            refined++;
            outcomes.push({ nodeId: node.id, status: "refined" });
          }
        }
      }
    } catch (error) {
      // A refinement is an improvement, never a precondition: whatever the
      // planner throws, the authored body still runs.
      keptReason = `code generation threw: ${
        error instanceof Error ? error.message : String(error)
      }`;
    } finally {
      clearTimeout(timer);
      unlink();
    }

    if (keptReason) {
      outcomes.push({ nodeId: node.id, status: "kept", reason: keptReason });
      const warning = `Code node "${node.id}" keeps its authored body: ${keptReason}`;
      warnings.push(warning);
      log.warn("Code node refinement kept the original body", {
        nodeId: node.id,
        reason: keptReason
      });
      yield {
        type: "planning_update",
        node_id: NODE_ID,
        phase: "code_refinement",
        status: "failed",
        content: warning
      } satisfies PlanningUpdate;
    }
  }

  yield {
    type: "planning_update",
    node_id: NODE_ID,
    phase: "code_refinement",
    status: refined > 0 ? "success" : "skipped",
    content: `Refined ${refined} of ${selected.length} Code node${selected.length > 1 ? "s" : ""}`
  } satisfies PlanningUpdate;

  log.info("Code node refinement finished", {
    eligible: candidates.length,
    refined,
    kept: outcomes.filter((outcome) => outcome.status === "kept").length
  });

  return { eligible: candidates.length, refined, outcomes, warnings };
}
