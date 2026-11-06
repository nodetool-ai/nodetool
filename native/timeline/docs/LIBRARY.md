# Native asset library

The Library browses server assets without changing the open timeline. Dropping
an asset onto a track keeps the existing asset-to-clip behavior.

The asset type dropdown filters images, video, audio, folders or other files.
Drop an asset onto a folder tile to move it there. Asset tags are a string
array in `metadata.tags`. Changing tags must preserve unrelated metadata.

## Implementation contract

The existing `AssetBrowser` remains the source for the grid, imports and drops.
Its filters are `searchText`, `typeFilter`, `tagFilter` and `favoritesOnly`.
`libraryScope`, `breadcrumbs` and `transfers` are read-only. Type filters are
empty, `image`, `video`, `audio`, `folder` or `other`. Transfer rows contain `id`, `name`, `status` and `error`; status is
`queued`, `running`, `complete` or `failed`. Do not display invented percentages.

Browser actions are `createFolder(name)`, `renameAsset(id, name)`,
`moveAsset(id, parentId)`, `deleteAsset(id)`, `setAssetTags(id, tags)`,
`setFavorite(id, favorite)`, `retryImport(id)` and `clearFinishedTransfers()`.
Existing `openFolder`, `goUp`, `refresh`, `importFiles`, `mediaUrl` and drop
methods keep their interfaces. The browser rejects stale query completions
and preserves server identity checks for writes.

`AssetPreview` is a QML component with `browser`, `asset` and `audioMode`
properties and `openAsset(asset)` / `closePreview()` functions. It reuses the
isolated native media-review service where possible. Opening or closing a
preview must not alter timeline content, undo history or the program playhead.

## Verification

The standalone `tst_librarydata` and `tst_librarypreview` targets cover
pagination, stale requests, metadata conflict retries, isolated preferences,
transfer retries and preview cancellation.
`tst_serverclient` checks authenticated JSON folder creation. `tst_assetbrowser`
mounts the real panel against an ephemeral test server and exercises tag-save
failure and retry, rename, favorites, folder navigation and isolated previews.
The `library_ui` CTest entry covers filters, dialogs and a narrow dock.

Search filters enumerate paginated asset results across folders. Transfer
status reports request state without fabricated byte progress.

Server tests use deterministic listeners, never the user's server on port
7777. Native checks run headlessly, without visible windows or system audio.
