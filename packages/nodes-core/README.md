# Core nodes

Audited constants, inputs, outputs, branching, text, JSON, HTTP and remote text
nodes for the lean execution server. Execution uses the actor kernel from
`@nodetool-ai/execution-core`. HTTP uses the shared URL egress policy.

`createCoreExecutionHost` accepts a tenant-aware text provider and optional node
ownership catalog. Explicit features register node definitions through `register`.
