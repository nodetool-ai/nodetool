# @nodetool-ai/execution

`ExecutionSession` owns top-level Node/server workflow execution. CLI, DSL,
HTTP/MCP saved-workflow runs, WebSocket jobs, headless jobs and app execution
provide graphs, execution environments and host hooks to this lifecycle.

The session normalizes and hydrates graphs, runs provider preflight, resolves
executors, owns its Python connection, constructs the kernel runner, handles
cancel and timeout, and cleans up after setup failure or terminal completion.
Injected contexts choose secrets, storage, workspace and generation hooks.
Persistence and output naming are optional policies. Existing server defaults
include a headless permission gate and cost recording, which hosts can disable
explicitly.

A host with multiple TS registries supplies `hasTsExecutor` and an
`executorResolverFactory` that receives the session-owned Python bridge. A host
with a shared bridge supplies `resolveExecutor` and `jobLifecycleBridge` instead,
keeping the connection alive across runs.

The [construction inventory and responsibility audit](../../docs/execution-lifecycle.md)
describe the boundary and remaining direct constructions. Nested graph runs
inherit the parent environment. Browser runs use `@nodetool-ai/workflow-runner`
and the kernel's portable message buffer, without importing this package.

Run `npm run check:execution-boundary` to check production construction sites.
