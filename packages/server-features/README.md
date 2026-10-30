# Server features

Dependency-free contracts for administrator-configured server features. Hosts supply
loaders from their installed pack source. This package never installs packages.

`configureFeatures` checks descriptors and prerequisites before activation, closes
activated features if startup fails, and advertises installed capabilities.
`requireNode` reports unavailable catalog nodes without changing stored graphs.

Feature failures expose a stable `code`, `featureIds` and `recovery` list.
`FEATURE_NOT_INSTALLED` identifies unavailable features,
`FEATURE_NOT_CONFIGURED` identifies selected packs without the required node or
scoped service configuration, and `FEATURE_INITIALIZATION_FAILED` identifies
loader or activation failure. Recovery includes the pack ID, package name,
explicit installation command, configuration instructions and restart guidance.
Hosts should preserve this payload at their validation and transport boundaries.
Installation requires authorization and never activates a feature automatically.
