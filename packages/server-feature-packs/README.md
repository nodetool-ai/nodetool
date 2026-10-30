# Installed node pack feature

`createInstalledPackFeature({packId,nodeTypes})` loads one explicitly installed
pack through NodeTool's existing pack loader. It never installs or enumerates
other installed packs. Only the selected, audited node types are registered.

The initial isolated-host audit admits text filters, Checkerboard GPU rendering and Save Image Asset.
Other legacy nodes fail at configuration with the access that needs auditing.
Filesystem loaders, browser automation and local model nodes need their host
access extracted before they can run for remote tenants.

Each run gets an actual ProcessingContext with its own workspace, owner-scoped
secrets and byte assets. Global model interfaces, process environment defaults
and unconfigured providers are blocked. Missing optional persistence operations
return a configuration error.

For CLI configuration, select `@nodetool-ai/server-feature-packs/text` or
`@nodetool-ai/server-feature-packs/image` after explicitly installing the
corresponding text-nodes or image-nodes package. These exports declare the
existing `text` and `image` feature IDs and retain missing-node diagnostics for
other nodes in those packs.
