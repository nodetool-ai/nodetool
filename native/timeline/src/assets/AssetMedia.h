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
class MediaProtection {
public:
    using Lease = nt::server::AssetCache::Lease;
    MediaProtection() = default;
    ~MediaProtection() = default;
    MediaProtection(const MediaProtection&) = delete;
    MediaProtection& operator=(const MediaProtection&) = delete;
    void reset(QSet<QString> paths);
    void replaceCurrent(QSet<QString> paths);
    quint64 generation() const;
    void protect(const QString& path, std::optional<quint64> generation = std::nullopt);
    static std::vector<Lease> leasePaths(const QSet<QString>& paths);
    void evict(const QString& root, qint64 budget, const QString& justFetched,
               const std::function<void()>& afterScan = {});
private:
    mutable std::mutex m_mutex;
    std::map<QString, Lease> m_paths;
    std::map<QString, Lease> m_fetched;
    quint64 m_generation = 0;
};
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& clip, MediaProtection& protection,
                             quint64 generation);
}
