# Native asset library

The Library browses server assets without changing the open timeline. Dropping
an asset onto a track keeps the existing asset-to-clip behavior.

Library collections are named saved selections. They are local to the native
editor and scoped to its server, authentication identity and project. They do
not move or duplicate assets, and they are separate from vector-search
collections. Asset tags are a string array in `metadata.tags`; changing tags
must preserve unrelated metadata.

## Implementation contract

The existing `AssetBrowser` remains the source for the grid, imports and drops.
Its additions expose `searchText`, `typeFilter`, `tagFilter`, `favoritesOnly`,
`collectionActive`, `collectionAssetIds`, `libraryScope`, `breadcrumbs` and
`transfers`. All filters are writable except the computed scope, breadcrumbs
and transfer rows. Type filters are empty, `image`, `video`, `audio`, `folder`
or `other`. Transfer rows contain `id`, `name`, `status` and `error`; status is
`queued`, `running`, `complete` or `failed`. Do not display invented percentages.

Browser actions are `createFolder(name)`, `renameAsset(id, name)`,
`moveAsset(id, parentId)`, `deleteAsset(id)`, `setAssetTags(id, tags)`,
`setFavorite(id, favorite)`, `retryImport(id)` and `clearFinishedTransfers()`.
Existing `openFolder`, `goUp`, `refresh`, `importFiles`, `mediaUrl` and drop
methods keep their interfaces. The browser rejects stale query completions
and preserves server identity checks for writes.

`LibraryCollections` exposes writable `scope` and `selectedId`, read-only
`collections`, `assetIds` and `error`, with invokables `create(name)`,
`rename(id, name)`, `remove(id)`, `addAssets(id, assetIds)` and
`removeAssets(id, assetIds)`. Collection rows contain `id`, `name` and
`assetIds`. An empty selected collection stays an empty view.

`AssetPreview` is a QML component with `browser`, `asset` and `audioMode`
properties and `openAsset(asset)` / `closePreview()` functions. It reuses the
isolated native media-review service where possible. Opening or closing a
preview must not alter timeline content, undo history or the program playhead.

## Verification

The standalone `tst_librarydata`, `tst_librarycollections` and
`tst_librarypreview` targets cover pagination, stale requests, metadata conflict
retries, isolated preferences, transfer retries and preview cancellation.
`tst_serverclient` checks authenticated JSON folder creation. `tst_assetbrowser`
mounts the real panel against an ephemeral test server and exercises tag-save
failure and retry, rename, favorites, folder navigation and isolated previews.
The `library_ui` CTest entry covers filters, dialogs and a narrow dock.

Search filters enumerate paginated asset results across folders. Collections
remain local to this device and do not synchronize to the server. Transfer
status reports request state without fabricated byte progress.

Server tests use deterministic listeners, never the user's server on port
7777. Native checks run headlessly, without visible windows or system audio.
