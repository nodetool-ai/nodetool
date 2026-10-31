# Execution host

Authenticated HTTP and MsgPack WebSocket routes for workflow execution. Compose
`createServerCore` with an authentication provider, tenant-scoped repository,
executor, asset directory and explicit capabilities. The host does not install
features or decode media. Its caller owns repository shutdown.

The standalone composition lives in `@nodetool-ai/server-minimal`.
