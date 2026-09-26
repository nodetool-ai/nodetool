# External Asset References for Large Files

## Outcome

In the local (desktop) version, an imported file at or above a size threshold stays where it is. NodeTool creates an asset row that points to the file on disk and copies no bytes into the asset folder. Below the threshold, and in every cloud deployment, import copies the file as it does now.

This plan also lists the other places where large media files fail or waste memory, because an external reference makes those files reachable in the first place.

Professional editors follow the same model. Premiere, Resolve, and Final Cut link to media in place, read only the container index at import, build thumbnails and waveform peaks in the background, and use proxies for editing. See [Other large-file problems](#other-large-file-problems) for where NodeTool differs.

## Current state

- **F1. Files above 2 GB fail.** `getMaxLocalUploadBytes()` defaults to 2 GB ([`storage-limits.ts`](../../packages/storage/src/storage-limits.ts)). A larger import answers 413.
- **F2. An import writes the file to disk twice.** [`local-asset-upload.ts`](../../packages/websocket/src/lib/local-asset-upload.ts) stages the multipart body in a temp folder. Then `FileStorageAdapter.storeFile` copies it into the storage root ([`file-storage-adapter.ts`](../../packages/storage/src/file-storage-adapter.ts)). In Electron the bytes also cross loopback HTTP first.
- **F3. Readers find bytes by storage key only.** They build `<user>/<id>.<ext>` and never read the asset row:
  - `retrieveAssetBytes` in [`asset-paths.ts`](../../packages/websocket/src/lib/asset-paths.ts), with 13 callers in `packages/websocket`
  - the `/api/storage` stream in [`storage-api.ts`](../../packages/websocket/src/storage-api.ts)
  - `ProcessingContext.resolveAssetBytes` in [`context.ts`](../../packages/runtime/src/context.ts)

  The runtime has no asset-row lookup. This is the main obstacle.
- **F4. An in-place `file://` path exists for node inputs.** [`localFile.ts`](../../web/src/utils/localFile.ts) gets the disk path through `webUtils.getPathForFile`. `/api/files/local` streams the file with Range support behind `resolveLocalPath` ([`local-file-access.ts`](../../packages/websocket/src/lib/local-file-access.ts)). Electron sets `NODETOOL_LOCAL_FILE_ROOTS=*` ([`electron/src/config.ts`](../../electron/src/config.ts)). The external-reference work reuses these pieces.
- **F5. Timeline clips name `currentAssetId`, not a URL** ([`assetToClipAdapter.ts`](../../web/src/components/timeline/dnd/assetToClipAdapter.ts)). If an external file stays an asset row, the timeline document format does not change.
- **F6. Asset delete cannot reach an external file.** `deleteAssetObjects` in [`trpc/routers/assets.ts`](../../packages/websocket/src/trpc/routers/assets.ts) deletes only keys inside the storage root.

## Design

- **D1. Add a nullable `external_path` column to `nodetool_assets`.** Write the SQLite migration. Postgres keeps the column null. Store `external_size` and `external_mtime` in `metadata` to detect a changed file. A column rather than only `metadata`, because the resolver, relink, and offline-media queries all read it.
- **D2. Add an import path that sends no bytes.** In Electron, when `getLocalFilePath(file)` returns a path and `file.size` is at or above the threshold, call a new tRPC procedure `assets.createExternal({ path, name, parent_id, project_id })`. The server:
  1. Validates the path with `resolveLocalPath`.
  2. Runs `stat` on the file.
  3. Normalizes the content type with `normalizeAssetContentType`.
  4. Probes the duration with `probeAssetDurationSeconds({ path })`.
  5. Creates the row.
  6. Generates the thumbnail from the path.

  The threshold is a setting with an env override. The default is 1 GB. A plain browser has no disk path, so it keeps the upload path.
- **D3. Resolve external bytes in the storage adapter.** Inject a lookup into `FileStorageAdapter` that maps a missing asset key to its row's `external_path`. `retrieve`, `stat`, and the `/api/storage` stream then work for every key-based caller in F3 without edits. Changing each caller instead means 13 or more edits and a database dependency in `runtime`.
- **D4. Add a path API next to the bytes API.** Add `localPath(uri): Promise<string | null>` to the storage adapter and to `ProcessingContext`. Callers that hand files to ffmpeg use it instead of loading the whole file into memory. See F7, F8, and F10.
- **D5. Keep `get_url` id-based.** For an external row, `toAssetResponse` returns the same `/api/storage/<user>/<id>.<ext>` URL, and D3 serves it. The disk path never appears in a URL, and a relink does not change the URL.
- **D6. Enable the feature in local mode only.** Gate it on `getStorageMode() === "local"` and a `FileStorageAdapter`. Refuse `createExternal` when `NODETOOL_ENV=production`, as `file-api` already does.

## Other large-file problems

These apply to every large file, external or copied.

- **F7. The server render copies each source through memory.** `AssetFiles.write` in [`video-nodes/src/nodes/timeline.ts`](../../packages/video-nodes/src/nodes/timeline.ts) calls `resolveAssetBytes`, then `fs.writeFile`. With D4 the render reads the file in place.
- **F8. `extract-audio` loads the whole video into memory.** `handleExtractAudio` in [`http-api.ts`](../../packages/websocket/src/http-api.ts) loads the bytes, writes a temp copy, and returns a WAV as bytes. The timeline calls it on every video import ([`useVideoAudioImport.ts`](../../web/src/hooks/timeline/useVideoAudioImport.ts)). A 2-hour 48 kHz stereo 16-bit WAV is about 1.4 GB.
- **F9. The browser decodes whole audio files.** `AudioGraph.loadBuffer` ([`AudioGraph.ts`](../../web/src/components/timeline/preview/AudioGraph.ts)) and [`useAudioPeaks.ts`](../../web/src/components/timeline/Tracks/useAudioPeaks.ts) fetch the full file and call `decodeAudioData`. The WAV from F8 becomes about 2.8 GB of float32 in the renderer. Compute peaks on the server once, cache them by asset id and mtime, and stream playback through a media element.
- **F10. Files above 100 MB got no thumbnail.** The generators took bytes, capped by `THUMBNAIL_SOURCE_MAX_BYTES` in [`thumbnail.ts`](../../packages/websocket/src/lib/thumbnail.ts). A2 lets them read a local file by path, so a managed or external file of any size gets one. The cap still applies to bytes pulled back from a cloud store.
- **F11. There are no proxies.** The preview uses one `HTMLVideoElement` per clip ([`OffscreenVideoPool.ts`](../../web/src/components/timeline/render/OffscreenVideoPool.ts)) with Range reads. Streaming works, but seeks in long-GOP 4K H.264 are slow because each seek decodes from the previous keyframe. A background intra-frame proxy (ProRes Proxy or similar, at lower resolution), stored as a managed asset linked to its source, fixes this. Export always reads the original.
- **F12. Exports read whole files.** Timeline zip export ([`routes/timelines.ts`](../../packages/websocket/src/routes/timelines.ts)), [`asset-export.ts`](../../packages/websocket/src/lib/asset-export.ts), and [`project-document-copy.ts`](../../packages/websocket/src/lib/project-document-copy.ts) call `retrieveAssetBytes`. D3 makes them find external files, but they still hold each file in memory. Stream them.

## Risks

- **R1. Missing media.** A user can move, rename, or unmount the file. On a `stat` miss or a size or mtime mismatch, mark the asset offline, show "Media offline" on the clip, and offer a Relink action.
- **R2. Stale caches.** Thumbnails, peaks, and preview caches keyed by asset id go wrong when the file changes in place. Include mtime in the cache key.
- **R3. Sync and sharing.** An external reference cannot resolve on another machine or in the cloud. Before a project leaves the machine, block the action or offer "Copy into library", which converts the asset to a managed copy.
- **R4. Duplicate imports.** A second import of the same path creates a second row. Reuse the row when path, size, and mtime match.
- **R5. Security.** A stored path is a read capability. Validate it once at creation with `resolveLocalPath`. Accept no path on update except through an explicit relink that validates again.

## Open questions

- **Q1.** Does the Python worker bridge read assets through `/api/storage` or through the storage adapter? If through HTTP, D3 covers it. Not traced.
- **Q2.** Is the runtime's `assetStorage` the same adapter instance the server builds in local mode? D3 depends on it. Answered: yes. Every server-built `ProcessingContext` receives the `getAssetAdapter()` singleton from [`lib/storage.ts`](../../packages/websocket/src/lib/storage.ts) as `assetStorage`, and `resolveAssetBytes` probes it before the separate temp `storage` adapter, so wiring the lookup there covers the runtime. CLI-built contexts construct their own adapters without the lookup.

## Tasks

A1 through A4 are implemented. A5 is open.

- **A1.** Add D1, D2, D3, and D6. Add a test that deleting an external asset leaves the original file on disk (F6).
- **A2.** Add the D4 path API and use it in the render (F7), `extract-audio` (F8), and thumbnails (F10).
- **A3.** Add offline detection and relink (R1), mtime cache keys (R2), and dedupe (R4). A missing or changed file is offline: the asset response carries `offline`, and every read, including `/api/storage`, reports it as missing until `assets.relinkExternal` records a file. `thumb_url` and the timeline's media URLs carry the recorded mtime. `assets.update` keeps the recorded size and mtime and refuses new data for an external asset. Dedupe reuses a row only within the same project.
- **A4.** Move peaks to the server (F9) and stream exports (F12). `GET /api/assets/{id}/peaks` decodes with ffmpeg in place and caches on disk by asset, file size and mtime, and count. Preview playback streams a file of 50 MB or five minutes and more through a media element; shorter files keep the sample-exact decoded buffer, and the offline export always decodes. The timeline and storyboard zips stream local files into a streamed archive. A project copy copies managed files on disk one at a time and keeps an external asset as an in-place reference. The workflow bundle still reads each referenced file whole, because its graph rewrite works on bytes.
- **A5.** Add proxies (F11).
