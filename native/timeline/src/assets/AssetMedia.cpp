#include "assets/AssetMedia.h"
#include "server/ServerTimeline.h"
#include <QDir>

namespace nt::assets {
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& raw) {
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
    const auto fetch = [&](const QString& variant, const nt::server::RemoteFile& file) {
        const auto result = cache.fetch(id, variant, file, [&]() -> std::optional<nt::server::RemoteFile> {
            const auto fresh = client.getAsset(id);
            if (!fresh.ok()) { return std::nullopt; }
            QString why;
            return variant == "proxy" ? nt::server::proxyFile(client, fresh.data.toObject(), &why)
                                      : nt::server::originalFile(client, fresh.data.toObject(), &why);
        });
        if (result.ok()) { cache.protect(result.path); }
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
