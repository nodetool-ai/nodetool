#include "assets/AssetDuration.h"
#include "assets/AssetClip.h"
#include "preview/FfmpegSource.h"
#include "server/ServerTimeline.h"
#include <QTemporaryDir>
#include <cmath>

namespace nt::assets {
QJsonObject withProbedVideoDuration(nt::server::ServerClient& client, QJsonObject asset) {
    const auto duration = asset.value("duration");
    if (assetMediaType(asset) != "video" || (!duration.isNull() && !duration.isUndefined())) { return asset; }
    QString reason;
    const auto file = nt::server::originalFile(client, asset, &reason);
    if (!file) { return asset; }
    QTemporaryDir staging;
    if (!staging.isValid()) { return asset; }
    nt::server::AssetCache cache(staging.path(), client.serverKey(), client.userKey(),
        [&client](QNetworkRequest& request) { client.decorate(request); });
    const auto fetched = cache.fetch(asset.value("id").toString(), "original", *file);
    if (!fetched.ok()) { return asset; }
    const auto facts = nt::probeMedia(fetched.path.toStdString());
    if (facts.opened && std::isfinite(facts.durationSec) && facts.durationSec > 0) {
        asset.insert("duration", facts.durationSec);
    }
    return asset;
}
}
