#include "assets/AssetMedia.h"
#include "server/ServerTimeline.h"
#include <QDir>
#include <algorithm>

namespace nt::assets {
void MediaProtection::reset(QSet<QString> paths) {
    const std::lock_guard lock(m_mutex);
    ++m_generation;
    m_paths = std::move(paths);
    // Downloads already in flight must also protect the newly opened document.
    for (const auto& weak : m_caches) {
        if (const auto cache = weak.lock()) {
            for (const auto& path : m_paths) { cache->protect(path); }
        }
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
    m_paths.insert(path);
    for (const auto& weak : m_caches) {
        if (const auto cache = weak.lock()) { cache->protect(path); }
    }
}

void MediaProtection::applyTo(const std::shared_ptr<nt::server::AssetCache>& cache) {
    const std::lock_guard lock(m_mutex);
    std::erase_if(m_caches, [](const auto& weak) { return weak.expired(); });
    m_caches.push_back(cache);
    for (const auto& path : m_paths) { cache->protect(path); }
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
    const auto cache = std::make_shared<nt::server::AssetCache>(cacheRoot, client.serverKey(), client.userKey(),
        [&client](QNetworkRequest& request) { client.decorate(request); });
    protection.applyTo(cache);
    const auto fetch = [&](const QString& variant, const nt::server::RemoteFile& file) {
        const auto result = cache->fetch(id, variant, file, [&]() -> std::optional<nt::server::RemoteFile> {
            const auto fresh = client.getAsset(id);
            if (!fresh.ok()) { return std::nullopt; }
            QString why;
            return variant == "proxy" ? nt::server::proxyFile(client, fresh.data.toObject(), &why)
                                      : nt::server::originalFile(client, fresh.data.toObject(), &why);
        });
        if (result.ok()) { protection.protect(result.path, generation); }
        return result;
    };
    QString why;
    const auto original = nt::server::originalFile(client, asset, &why);
    bool failed = !original;
    if (original && picture) {
        const auto proxy = nt::server::proxyFile(client, asset, &why);
        auto fetched = proxy ? fetch("proxy", *proxy) : fetch("original", *original);
        if (!fetched.ok() && proxy) { fetched = fetch("original", *original); }
        failed = !fetched.ok();
        media.mediaPath = fetched.path.toStdString();
    }
    if (!failed && audio) {
        const auto fetched = fetch("original", *original);
        failed = !fetched.ok();
        media.audioPath = fetched.path.toStdString();
    }
    if (failed) {
        if (picture) {
            media.mediaPath = QDir(cacheRoot).filePath("missing/" + nt::server::safePathPart(id)).toStdString();
        }
        media.audioPath.clear();
    }
    return media;
}
}
