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
  BoundedHandle,
  ensureBounded,
  FailClosedHandle,
  computeAllowedActions,
  failureSignature,
  redactRecord,
  redactValue,
  DEFAULT_SUPERVISOR_BOUNDS,
  MAX_ESCALATION_VALUE_CHARS,
  type SupervisorHandle,
  type DecisionOutcome,
  type SupervisorBounds,
  type AllowedActionsInput
} from "./supervisor.js";
export {
  lineageRelated,
  type RunStateReader,
  type RunStateDigest,
  type NodeRunState,
  type NodeOutputRead
} from "./run-state.js";
export {
  validateSubstituteOutputs,
  hasFullValidatorCoverage,
  type SubstituteValidationResult,
  type SubstituteValidatorOptions
} from "./substitute-validator.js";
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
  applyDynamicSlotTypes,
  dynamicSlotPropertyTypes,
  dynamicSlotTypeErrorMessage,
  dynamicSlotTypeString,
  getDynamicSlotTypeString
} from "./dynamic-slots.js";
export {
  findNodeOrThrow,
  getInputTypeString,
  getNodeInputTypes,
  getDownstreamSubgraph,
  isNodeBypassed,
  rewriteBypassedNodes
} from "./graph-utils.js";
export {
  DurableInbox,
  MemoryDurableInboxStore,
  type DurableInboxStore,
  type DurableMessage
} from "./durable-inbox.js";
export {
  TriggerWakeupService,
  MemoryTriggerInputStore,
  type TriggerInput,
  type TriggerInputStore
} from "./trigger-wakeup.js";
