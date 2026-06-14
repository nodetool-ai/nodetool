/**
 * @nodetool-ai/kernel – Public API
 */

export {
  Graph,
  GraphValidationError,
  withExplicitNodeFlags,
  type HydratedGraph,
  type GraphValidationIssue,
  type GraphFromDictOptions,
  type GraphLoadOptions,
  type NodeTypeResolver,
  type ResolvedNodeType
} from "./graph.js";
export { NodeInbox, type MessageEnvelope } from "./inbox.js";
export { syntheticEdgeId, externalEdgeId } from "./edge-ids.js";
export {
  analyzeCorrelation,
  CorrelationAnalysisError,
  comparable,
  isPrefixOf,
  iterationRootId,
  edgeKey,
  projectLineageKey,
  tryProjectLineageKey,
  type Scope,
  type EdgeAnalysis,
  type OutputAnalysis,
  type InputAnalysis,
  type NodeAnalysis,
  type CorrelationAnalysisIssue,
  type CorrelationAnalysisResult,
  type AnalyzeOptions
} from "./correlation-analysis.js";
export { NodeActor, type NodeExecutor, type ActorResult } from "./actor.js";
export {
  WorkflowRunner,
  type RunJobRequest,
  type WorkflowRunnerOptions,
  type RunResult,
  type NodeValidationIssue,
  type NodeValidator,
  type OutputRoutingHints
} from "./runner.js";
export {
  NodeInputs,
  NodeOutputs,
  type NodeOutputsOptions,
  type EmitOptions
} from "./io.js";
export {
  findNodeOrThrow,
  getNodeInputTypes,
  getDownstreamSubgraph,
  isNodeBypassed,
  rewriteBypassedNodes
} from "./graph-utils.js";
export {
  TriggerWorkflowManager,
  type TriggerJob,
  type StartJobFn,
  type HasTriggerNodesFn
} from "./trigger-manager.js";
export {
  WorkflowSuspendedError,
  SuspendableState,
  type SuspendableNode
} from "./suspendable.js";
export { TriggerState, TriggerInactivityTimeout } from "./trigger.js";
export {
  DurableInbox,
  MemoryDurableInboxStore,
  type DurableInboxStore,
  type DurableMessage
} from "./durable-inbox.js";
export { TriggerWakeupService, type TriggerInput } from "./trigger-wakeup.js";
