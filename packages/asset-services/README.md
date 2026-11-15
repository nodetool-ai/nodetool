# Asset services

Canonical asset persistence, byte updates, duration probes, storage paths and
thumbnail generation shared by HTTP and local execution hosts. This optional
package includes media services. It does not depend on the HTTP application.

Import `createAssetModelInterface` and `updateAssetBytesModelInterface` from
`@nodetool-ai/asset-services`. Shared storage and thumbnail helpers are exported
through named subpaths. Full server compatibility exports delegate here.

## Assets as files

`saveProjectAsset` creates an asset as one file in its project's folder plus an
index row with `project_id` and `workspace_path`. It is the function behind
`context.createAsset`, workflow output auto-save, uploads and imports
(`uploadDirectory` picks the directory), the agent media tools and Save-file
nodes. With `path` the file is at that project-relative path; with `asset` an
existing row gets the file, which is how a direct upload is finalized. `renameProjectAssetFile`,
`replaceProjectAssetBytes` and `deleteProjectAssetFile` keep the file and the
row together afterwards. See
[project folders, T3](../../docs/project-folders/prd.md#t3-assets-as-files).

The folder is resolved through `getProjectFolderResolver` from
`@nodetool-ai/runtime`, which `@nodetool-ai/execution/service` installs when it
loads. A host that wires `createAssetModelInterface` must load that module.

A key-based reader asks the asset store for `<owner>/<assetId>.<ext>`. When no
object is there, the lookup in `external-asset-lookup` resolves the key through
the asset row: `workspace_path` in the project folder, then `external_path`.
`createStoredAsset` remains for a `createAsset` call with no content, which
creates a row and no file.
