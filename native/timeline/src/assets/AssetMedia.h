#pragma once
#include "model/TimelineTypes.h"
#include "server/AssetCache.h"
#include "server/ServerClient.h"
#include <QSet>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <vector>

namespace nt::assets {
// Thread-safe. The mutex guards the current document and fetched leases.
class MediaProtection {
public:
    using Lease = nt::server::AssetCache::Lease;
    explicit MediaProtection(nt::server::AssetCacheRoot cache) : m_cache(std::move(cache)) {}
    const nt::server::AssetCacheRoot& cache() const { return m_cache; }
    ~MediaProtection() = default;
    MediaProtection(const MediaProtection&) = delete;
    MediaProtection& operator=(const MediaProtection&) = delete;
    void reset(QSet<QString> paths);
    void replaceCurrent(QSet<QString> paths);
    quint64 generation() const;
    void protect(const QString& path, std::optional<quint64> generation = std::nullopt);
    static std::vector<Lease> leasePaths(const nt::server::AssetCacheRoot& cache, const QSet<QString>& paths);
private:
    const nt::server::AssetCacheRoot m_cache;
    // Guards the paths, fetched leases and generation.
    mutable std::mutex m_mutex;
    std::map<QString, Lease> m_paths;
    std::map<QString, Lease> m_fetched;
    quint64 m_generation = 0;
};
nt::server::FetchResult resolveOriginalMedia(nt::server::ServerClient& client,
                                              const QString& assetId, MediaProtection& protection);
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client,
                             const QJsonObject& asset, const QJsonObject& clip, MediaProtection& protection,
                             quint64 generation);
}
