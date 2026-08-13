/**
 * Framework-independent runtime core for NodeTool mini apps.
 *
 * An application is a UI document plus typed bindings to workflow operations
 * and resources. All computation stays in workflow graphs; the only logic this
 * layer holds is a closed vocabulary of widget props. This package owns the
 * shared semantics — document parsing, binding resolution, instance state, the
 * streaming fold, run policy, conditions, and the widget catalog — so the web
 * runtime, the CLI `app debug` harness, and the eval suites cannot drift apart.
 */
export * from "./document.js";
export * from "./bindings.js";
export * from "./state.js";
export * from "./operations.js";
export * from "./fold.js";
export * from "./policy.js";
export * from "./conditions.js";
export * from "./actions.js";
export * from "./widgets.js";
export * from "./chat.js";
export * from "./documents.js";
export * from "./doc-ops.js";
export * from "./bundle.js";
export * from "./script-run.js";
