# Runtime core

Execution contracts, cancellable runs, the shared workspace implementation,
URL egress policy and an OpenAI-compatible text streaming adapter. This package
does not load media codecs, browser automation or local inference.

Install `@nodetool-ai/runtime-core` to use `OpenAITextProvider`,
`createLocalWorkspace` and `RunCancellation`. Hosts supply the authenticated
owner, secret resolver and usage accounting through `ExecutionContext`.
