#include "assets/AssetMedia.h"
#include "server/AssetCache.h"
#include "server/ServerTimeline.h"
#include <QDir>
#include <iterator>

namespace nt::assets {
void MediaProtection::reset(QSet<QString> paths) {
    std::map<QString, Lease> replacement;
    for (const auto& path : paths) {
        if (!path.isEmpty()) {
            auto held = nt::server::AssetCache::lease(path);
            const QString key = *held;
            replacement.try_emplace(key, std::move(held));
        }
    }
    const std::lock_guard lock(m_mutex);
    ++m_generation;
    m_paths.swap(replacement);
    m_fetched.clear();
}

void MediaProtection::replaceCurrent(QSet<QString> paths) {
    std::map<QString, Lease> replacement;
    for (const auto& path : paths) {
        if (!path.isEmpty()) {
            auto held = nt::server::AssetCache::lease(path);
            const QString key = *held;
            replacement.try_emplace(key, std::move(held));
        }
    }
    const std::lock_guard lock(m_mutex);
    m_paths.swap(replacement);
    for (auto it = m_fetched.begin(); it != m_fetched.end();) {
        it = m_paths.contains(it->first) ? m_fetched.erase(it) : std::next(it);
    }
}

quint64 MediaProtection::generation() const {
    const std::lock_guard lock(m_mutex);
    return m_generation;
}

void MediaProtection::protect(const QString& path, std::optional<quint64> generation) {
    if (path.isEmpty()) { return; }
    const std::lock_guard lock(m_mutex);
    if (generation && *generation != m_generation) { return; }
    auto held = nt::server::AssetCache::lease(path);
    const QString key = *held;
    if (!m_paths.contains(key) && !m_fetched.contains(key)) {
        m_fetched.emplace(key, std::move(held));
    }
}

std::vector<MediaProtection::Lease> MediaProtection::leasePaths(const QSet<QString>& paths) {
    std::vector<Lease> leases;
    leases.reserve(paths.size());
    for (const auto& path : paths) {
        if (!path.isEmpty()) leases.push_back(nt::server::AssetCache::lease(path));
    }
    return leases;
}

void MediaProtection::evict(const QString& root, qint64 budget, const QString& justFetched,
                            const std::function<void()>& afterScan) {
    nt::server::AssetCache::evictRoot(root, budget, justFetched, afterScan);
}

nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& raw, MediaProtection& protection,
                             quint64 generation) {
    nt::Clip media;
    media.raw = raw;
    const auto type = raw.value("mediaType").toString();
    media.mediaType = type == "image" ? nt::MediaType::Image
        : type == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
    const bool picture = media.mediaType == nt::MediaType::Video || media.mediaType == nt::MediaType::Image;
    const bool audio = media.mediaType == nt::MediaType::Video || media.mediaType == nt::MediaType::Audio;
    const auto id = asset.value("id").toString();
    nt::server::AssetCache cache(cacheRoot, client.serverKey(), client.userKey(),
        [&client](QNetworkRequest& request) { client.decorate(request); });
    const auto budget = cache.budgetBytes();
    cache.setBudgetBytes(0);
    const auto fetch = [&](const QString& variant, const nt::server::RemoteFile& file) {
        const auto result = cache.fetch(id, variant, file,
            [&]() -> std::optional<nt::server::RemoteFile> {
                const auto fresh = client.getAsset(id);
                if (!fresh.ok()) { return std::nullopt; }
                QString why;
                return variant == "proxy" ? nt::server::proxyFile(client, fresh.data.toObject(), &why)
                                          : nt::server::originalFile(client, fresh.data.toObject(), &why);
            }, [&](const QString& path) { protection.protect(path, generation); });
        if (result.ok() && !result.hit) { protection.evict(cacheRoot, budget, result.path); }
        return result;
    };
    QString why;
    const auto original = nt::server::originalFile(client, asset, &why);
    bool failed = !original;
    if (original && picture) {
        const auto proxy = nt::server::proxyFile(client, asset, &why);
        bool usedOriginal = !proxy;
        auto fetched = proxy ? fetch("proxy", *proxy) : fetch("original", *original);
        if (!fetched.ok() && proxy) {
            fetched = fetch("original", *original);
            usedOriginal = true;
        }
        failed = !fetched.ok();
        media.mediaPath = fetched.path.toStdString();
        if (usedOriginal) media.originalMediaPath = fetched.path.toStdString();
    }
    if (!failed && audio) {
        const auto fetched = fetch("original", *original);
        failed = !fetched.ok();
        media.audioPath = fetched.path.toStdString();
        if (picture) media.originalMediaPath = fetched.path.toStdString();
    } else if (!failed && picture && media.originalMediaPath.empty()) {
        const auto fetched = fetch("original", *original);
        failed = !fetched.ok();
        media.originalMediaPath = fetched.path.toStdString();
    }
    if (failed) {
        if (picture) {
            media.mediaPath = QDir(cacheRoot).filePath("missing/" + nt::server::safePathPart(id)).toStdString();
        }
        media.audioPath.clear();
        media.originalMediaPath.clear();
    }
    return media;
}
}
