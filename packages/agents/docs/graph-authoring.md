# Graph authoring

**Navigation**: [Agents package rules](../AGENTS.md) → **Graph authoring**

Paths are relative to `packages/agents/` unless they name another package.

## Authoring a graph (`src/author-graph.ts`)

`authorGraph(objective, opts)` is how a graph gets written. The app-build plan
stage calls it once per operation (`app-build/build.ts`), and the
`graph-planner` and `graph-e2e` eval suites drive it directly. It streams
`ProcessingMessage`s and returns the graph.

It runs no loop of its own. `runSubAgent` drives one CodeAct child whose
allowlist carries `@nodetool-ai/sandbox-dsl`, so the child authors with the
typed pack — one generated function per node type — instead of the untyped
`node(type, props)` program the retired one-shot planner took. The belt is
discovery
(`search_nodes`, `get_node_info`, `list_nodes`), `validate_workflow`, the
Code-body harness (`validate_code`, `run_code`, `test_code`) and `find_model`
when providers are configured. The graph comes back through `finish()` against
a `{nodes, edges}` output schema: the object is already in the sandbox, so
handing it over costs no tokens.

The prompt is assembled once. `renderWorkflowAuthoringKnowledge()`
(`prompts/workflow-authoring-knowledge.ts`) is the preamble — which node to
reach for, how `agent` steps and `if_` behave, what a Code node is — and the
DSL mechanics are NOT repeated there: `CodeActExecutor` renders
`GRAPH_DSL_PROMPT_SECTION` itself once the pack is on the allowlist.

There is no post-hoc Code-node refinement pass. A whole-graph one-shot had no
way to iterate on a Code body it wrote as a string literal, which is what such
a pass existed to fix; a CodeAct child validates and re-runs a body inside the
same loop. Without a catalog serving the pack the run fails immediately, naming the
pack, rather than spending a provider turn on an import that cannot resolve.

Tests: `tests/author-graph.test.ts` (brief, preamble, belt, plus one scripted
provider driving a real sandbox action over the real shipped pack).

## The graph DSL program (`src/graph-dsl.ts`)

`evaluateGraphDsl` runs a free-form graph program in the QuickJS sandbox (no
host access) and returns `{nodes, edges}`. It is the older, untyped authoring
shape — `node(type, properties)` creates a node, passing `ref.output(slot?)` as
a property value becomes an edge, and the program ends with `return graph();`:

```js
const prompt = node("nodetool.input.StringInput", { name: "prompt" });
const image = node("nodetool.image.TextToImage", {
  prompt: prompt.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
node("nodetool.output.Output", { name: "image", value: image.output() });
return graph();
```

Nothing authors this way any more — `authorGraph` writes typed calls against
`@nodetool-ai/sandbox-dsl` instead — but `validate_workflow` still accepts a
program in this shape, so the evaluator and the wiring core behind it
(`src/graph-dsl-core.ts`, shared with the pack's guest builder) stay.
`GraphBuilder` (`src/graph-builder.ts`) is what loads either shape into a
graph and validates it structurally, alongside node-sdk's `validateGraph`.

Tests: `tests/graph-dsl.test.ts`, `tests/dsl-handle-interpolation.test.ts`,
`tests/dsl-workflow-authoring.test.ts`.
