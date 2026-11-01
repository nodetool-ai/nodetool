#pragma once

// Opens a timeline from the NodeTool server (PLAN.md M5a): `timeline.get`,
// the model with raw JSON per entity (D4), the asset files in the disk cache
// (D33), and the loader report.
//
// Asset choice per clip, for a clip whose `status` lets its asset show
// (generated, stale, locked, generating; the D6 asset rule):
//   - picture (video, image): the proxy only when `proxy_status` is `ready`
//     and `proxy_url` carries its `?v=` version, else the original. A proxy
//     that is absent, pending or failed falls back to the original (F4).
//   - audio (video, audio): always the original. A proxy has no audio track.
//   - `package://` references download from `/api/assets/packages/`.
// A clip whose asset is missing gets a media path that does not exist, so
// the preview draws a placeholder and the media report names the reason.
//
// The loader report (JSON):
//   source, timings{getMs,metadataMs,downloadMs,probeMs,totalMs},
//   fields (FieldAudit), assets[] per clip, missingAssets[], rejectedMedia[],
//   summary{clips, mediaClips, unsupportedFields, missingAssets, rejectedMedia,
//           downloads, cacheHits}, rawDocument (the path of the saved raw JSON).

#include "model/TimelineTypes.h"
#include "server/AssetCache.h"

#include <QJsonObject>
#include <QString>
#include <QUrl>

#include <optional>
#include <vector>

namespace nt::server {

class ServerClient;

struct ServerOpenOptions {
    QUrl server;
    QString timelineId;
    QString cacheRoot;
    QString token;
    bool probeMedia = true;  // run probeMedia (D10a) on each picture file
    QString expectedInstance;
};

struct ServerOpenResult {
    std::optional<Timeline> timeline;
    QString error;        // a load error; the timeline is absent
    QJsonObject report;   // the loader report, also on a load error
    std::vector<AssetCache::Lease> mediaLeases; // keep fetched files through model adoption
};

ServerOpenResult openServerTimeline(const ServerOpenOptions& options);
// Resolve a recovered local document's assets without fetching or replacing
// the current server timeline or its last-load raw backup.
ServerOpenResult resolveTimelineDocumentMedia(const ServerOpenOptions& options, const QJsonObject& raw);

// Normalize a supported asset reference for assets.get.
QString assetIdForReference(const QString& reference);

// The D33 version of an original: a hash of `updated_at`, `size` and
// `content_type` from `assets.get`.
QString originalVersion(const QJsonObject& asset);

// The original's file, or nullopt with `why` (no get_url, offline, folder).
std::optional<RemoteFile> originalFile(const ServerClient& client, const QJsonObject& asset, QString* why);
// The proxy's file when `proxy_status` is ready and `proxy_url` has `?v=`,
// else nullopt with `why` (for example "proxy pending (running)").
std::optional<RemoteFile> proxyFile(const ServerClient& client, const QJsonObject& asset, QString* why);

}  // namespace nt::server
