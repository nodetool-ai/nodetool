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
`createStoredAsset` still writes under the storage key for callers that have not
moved to project files.

The index is kept in line with the folder by `reconcileProjectIndex` in
[`@nodetool-ai/project-services`](../project-services/src/project-index.ts). It
marks a row whose file is gone with `workspace_offline` in the row's metadata,
and `projectAssetFile` then answers null, so every reader reports the bytes as
missing. `relinkProjectAsset` points such an asset at another file under the
same id. Asset writers and the reconcile share `withProjectFolderLock`, and a
path whose row is still being saved is reported by `isProjectAssetPathInFlux`.
The fingerprint in the row's metadata covers the file's size, mtime and a hash
of its first and last 1 MiB. `nodetool_assets.content_hash` holds the SHA-256
of the whole file. `contentHashOfWorkspaceFile` computes it as a stream, the
hash job in `project-services` stores it, and every writer here that replaces
an asset's bytes sets it back to null. `refreshAssetThumbnail` replaces the
thumbnail of a file that changed in place, and `projectAssetMtime` versions
the thumbnail URL.
See [the asset index follows the folder](../../docs/workspaces.md#the-asset-index-follows-the-folder).

`moveLegacyAssetIntoFolder` in `legacy-asset-move` moves the bytes of one asset
from before project folders out of the asset store and into its project's
folder. It records the target path in the row's metadata under
`workspace_move_target`, copies the object with `claimFile`, verifies the copy
by size and partial hash, names the file on the row with
`Asset.saveFilePlacementIf`, deletes the legacy object and then removes the
recorded target. A call that finds a recorded target continues that move. The
job in
[`@nodetool-ai/project-services`](../project-services/src/project-asset-move-job.ts)
runs it for every asset of a project and deletes the folder rows that are left
empty. See
[existing assets move into the folder](../../docs/workspaces.md#existing-assets-move-into-the-folder).

Within a project the asset browser's folders are directories of the folder.
`project-asset-directories` lists a project by directory, makes a directory
for a new folder, and moves a directory with `moveProjectDirectory`, which
rewrites the rows under it in one statement. `moveProjectAssetToDirectory`
moves one asset's file. See
[folders in the asset browser](../../docs/workspaces.md#folders-in-the-asset-browser).
