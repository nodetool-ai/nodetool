#pragma once
#include "model/TimelineTypes.h"
#include "server/ServerClient.h"
#include "server/AssetCache.h"
#include <QSet>
#include <memory>
#include <mutex>
#include <optional>
#include <vector>

namespace nt::assets {
class MediaProtection {
public:
    void reset(QSet<QString> paths);
    quint64 generation() const;
    void protect(const QString& path, std::optional<quint64> generation = std::nullopt);
    void applyTo(const std::shared_ptr<nt::server::AssetCache>& cache);
private:
    mutable std::mutex m_mutex;
    QSet<QString> m_paths;
    quint64 m_generation = 0;
    std::vector<std::weak_ptr<nt::server::AssetCache>> m_caches;
};
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& clip, MediaProtection& protection,
                             quint64 generation);
}
