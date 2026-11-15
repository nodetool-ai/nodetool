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
`createStoredAsset` remains for a `createAsset` call with no content, which
creates a row and no file.

The index is kept in line with the folder by `reconcileProjectIndex` in
[`@nodetool-ai/project-services`](../project-services/src/project-index.ts). It
marks a row whose file is gone with `workspace_offline` in the row's metadata,
and `projectAssetFile` then answers null, so every reader reports the bytes as
missing. `relinkProjectAsset` points such an asset at another file under the
same id. Asset writers and the reconcile share `withProjectFolderLock`, and a
path whose row is still being saved is reported by `isProjectAssetPathInFlux`.
See [the asset index follows the folder](../../docs/workspaces.md#the-asset-index-follows-the-folder).

Within a project the asset browser's folders are directories of the folder.
`project-asset-directories` lists a project by directory, makes a directory
for a new folder, and moves a directory with `moveProjectDirectory`, which
rewrites the rows under it in one statement. `moveProjectAssetToDirectory`
moves one asset's file. See
[folders in the asset browser](../../docs/workspaces.md#folders-in-the-asset-browser).
