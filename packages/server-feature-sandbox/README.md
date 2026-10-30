# Sandbox feature

Install this package explicitly alongside the minimal server and configure
`NODETOOL_FEATURES=code=@nodetool-ai/server-feature-sandbox`. It enables
`nodetool.code.Code` through the shared QuickJS WASM interpreter on an isolated
worker thread. It does not install agents, the full runtime, media codecs or
the sandbox compiler.

Buffered Code receives `inputs` and persistent invocation `state`, and returns
named results through `output` or `emit`. The existing legacy return contract
also works. Node timeout, response limits, secret scopes, logs and progress use
the stored node properties. `createSandboxFeature({ limits })` lets the host
configure memory and output ceilings.

Workspace access stays inside the authenticated run's workspace. Secret and
asset reads use the authenticated user's injected host callbacks. Host filesystem
access and private network access are unavailable in this adapter. Cancellation
terminates the worker, including CPU-bound code.

Streaming-input Code bodies and imported host or WASM capability modules still
require the full composition. The shared runtime accepts explicitly resolved
guest JavaScript modules without a compiler.
