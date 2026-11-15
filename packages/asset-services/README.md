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
`context.createAsset` and workflow output auto-save. `renameProjectAssetFile`,
`replaceProjectAssetBytes` and `deleteProjectAssetFile` keep the file and the
row together afterwards. A new file name is claimed with `Workspace.writeNew`,
an exclusive create, so no save, rename or move replaces a file.

`workspace_path` is relative to the folder of `project_id`. Change an asset's
project only through `saveAssetInProject` from `@nodetool-ai/models`. It calls
`moveProjectAssetFile`, which this package installs when it loads, to copy the
file into the new folder before the row is saved. See
[project folders, T3](../../docs/project-folders/prd.md#t3-assets-as-files).

The folder is resolved through `getProjectFolderResolver` from
`@nodetool-ai/runtime`, which `@nodetool-ai/execution/service` installs when it
loads. A host that wires `createAssetModelInterface` must load that module.

A key-based reader asks the asset store for `<owner>/<assetId>.<ext>`. When no
object is there, the lookup in `external-asset-lookup` resolves the key through
the asset row: `workspace_path` in the project folder, then `external_path`.
`getAssetAdapter` is built with the lookup. A host that builds its own
`FileStorageAdapter` over the asset folder, as the CLI commands do, gets it
through `installAssetFolderLookup`, which `getAssetAdapter` and the CLI's
`installLocalModelInterfaces` call.
`createStoredAsset` still writes under the storage key for callers that have not
moved to project files.
