# Server features

Dependency-free contracts for administrator-configured server features. Hosts supply
loaders from their installed pack source. This package never installs packages.

`configureFeatures` checks descriptors and prerequisites before activation, closes
activated features if startup fails, and advertises installed capabilities.
`requireNode` reports unavailable catalog nodes without changing stored graphs.
