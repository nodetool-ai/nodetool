#pragma once

// The local file a Library tile scrubs over: the asset's proxy when it has one, else its original,
// fetched into the asset cache. The Library lists remote assets, and FFmpeg decodes from a file.

#include "server/AssetCache.h"
#include "server/ServerClient.h"
#include <QJsonObject>
#include <QString>
#include <functional>

namespace nt::assets {
struct ScrubSource {
    QString path;
    // Keeps the file in the cache while the caller holds it.
    nt::server::AssetCache::Lease lease;
    bool ok() const { return !path.isEmpty(); }
};
// Blocks until the file is cached, the fetch fails or `interrupted` turns true. `asset` is a full
// `assets.get` answer. A cache hit costs no download.
ScrubSource fetchScrubSource(nt::server::ServerClient& client, const QString& cacheRoot, const QJsonObject& asset,
                             const std::function<bool()>& interrupted = {});
}  // namespace nt::assets
