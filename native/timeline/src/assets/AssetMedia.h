#pragma once
#include "model/TimelineTypes.h"
#include "server/ServerClient.h"
#include "server/AssetCache.h"
#include <QSet>
#include <mutex>

namespace nt::assets {
class MediaProtection {
public:
    void protect(const QString& path);
    void applyTo(nt::server::AssetCache& cache) const;
private:
    mutable std::mutex m_mutex;
    QSet<QString> m_paths;
};
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& clip, MediaProtection& protection);
}
