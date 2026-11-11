# higgsfield-nodes

Higgsfield media nodes use the curated manifest and reach Higgsfield through
`HiggsfieldProvider` in `packages/runtime`. Node code calls
`context.callProviderEndpoint`, `context.uploadProviderMedia` and
`context.downloadProviderMedia` with the `higgsfield` provider id, and never
reads `HIGGSFIELD_API_KEY_ID` or `HIGGSFIELD_API_KEY_SECRET`. Do not add a
model without a source API-reference URL, a schema fixture, and declared
output mapping. Submission requests are never retried. Media inputs must use
typed NodeTool refs and media outputs must be absorbed into storage.

Read [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) and
[root agent rules](../../AGENTS.md) before changing this package.
