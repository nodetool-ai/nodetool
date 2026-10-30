# Asset services

Canonical asset persistence, byte updates, duration probes, storage paths and
thumbnail generation shared by HTTP and local execution hosts. This optional
package includes media services. It does not depend on the HTTP application.

Import `createAssetModelInterface` and `updateAssetBytesModelInterface` from
`@nodetool-ai/asset-services`. Shared storage and thumbnail helpers are exported
through named subpaths. Full server compatibility exports delegate here.
