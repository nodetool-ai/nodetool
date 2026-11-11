#include "LibraryScrubSource.h"
#include "server/ServerTimeline.h"
#include <QNetworkRequest>

namespace nt::assets {
ScrubSource fetchScrubSource(nt::server::ServerClient& client, const QString& cacheRoot, const QJsonObject& asset,
                             const std::function<bool()>& interrupted) {
    const auto id = asset.value("id").toString();
    if (id.isEmpty() || (interrupted && interrupted())) { return {}; }
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
            });
        if (!result.ok()) { return ScrubSource{}; }
        // Held before eviction runs, so the file just fetched stays.
        ScrubSource source{result.path, nt::server::AssetCache::lease(result.path)};
        if (!result.hit) { nt::server::AssetCache::evictRoot(cacheRoot, budget, result.path); }
        return source;
    };
    QString why;
    if (const auto proxy = nt::server::proxyFile(client, asset, &why)) {
        if (auto source = fetch("proxy", *proxy); source.ok()) { return source; }
    }
    if (interrupted && interrupted()) { return {}; }
    if (const auto original = nt::server::originalFile(client, asset, &why)) { return fetch("original", *original); }
    return {};
}
}  // namespace nt::assets
