// NodeContext members (packages/runtime-core/node-context-members.json) that
// the guest context (guest/host/context.mjs and context-services.mjs) does not
// implement, each with the reason. unittests/node-context.test.mjs fails when
// a member is neither implemented nor listed here, when a listed member is
// implemented, and when a listed name is not a NodeContext member. The parity
// profile (guest/parity/profile.mjs) names the reason when node code reaches
// one of them.
//
// Reasons, the same set as REASONS in guest/module-contract.mjs:
//   server-only     needs state or services only a NodeTool server has
//   python          runs in the Python bridge
//   host-binary     runs an executable on the host
//   native-addon    needs a Node native addon
//   kernel          drives the TypeScript workflow runner, which the C++
//                   kernel replaces
//   not-yet-ported  the guest can implement it and has not yet
export const UNAVAILABLE_REASONS = Object.freeze([
  "server-only",
  "python",
  "host-binary",
  "native-addon",
  "kernel",
  "not-yet-ported"
]);

export const contextUnavailable = Object.freeze({
  // What core-nodes' inner-graph nodes (run-inner-graph.ts) use to run a
  // nested TypeScript WorkflowRunner: a copied context and the parent's
  // executor and node type resolvers. The C++ kernel runs Subgraph nodes
  // itself, forks the guest context with forkContext (guest/subgraph-context.mjs)
  // and resolves executors in src/kernel/runner.cpp. The Workflow and App
  // nodes need @nodetool-ai/kernel's WorkflowRunner, which the module
  // contract classifies `kernel` too, so the guest never reaches these.
  copy: "kernel",
  resolveExecutor: "kernel",
  resolveNodeType: "kernel",
  setResolveExecutor: "kernel",
  setResolveNodeType: "kernel"
});
