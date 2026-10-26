#pragma once
#include "model/TimelineTypes.h"
#include "server/ServerClient.h"
#include <QSet>
#include <functional>
#include <mutex>
#include <optional>

namespace nt::assets {
class MediaProtection {
public:
    void reset(QSet<QString> paths);
    quint64 generation() const;
    void protect(const QString& path, std::optional<quint64> generation = std::nullopt);
    void evict(const QString& root, qint64 budget, const QString& justFetched,
               const std::function<void()>& afterScan = {});
private:
    mutable std::mutex m_mutex;
    QSet<QString> m_paths;
    quint64 m_generation = 0;
};
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& clip, MediaProtection& protection,
                             quint64 generation);
}
