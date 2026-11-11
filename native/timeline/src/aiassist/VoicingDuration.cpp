#include "aiassist/VoicingDuration.h"
#include "preview/FfmpegSource.h"
#include "server/ServerTimeline.h"
#include <QTemporaryDir>
#include <QThread>
#include <cmath>
namespace nt::aiassist {
double voicingDurationMs(nt::server::ServerClient& client, const QJsonObject& asset) {
    const double seconds = asset.value("duration").toDouble();
    if (std::isfinite(seconds) && seconds > 0) { return seconds * 1000; }
    if (QThread::currentThread()->isInterruptionRequested()) { return 0; }
    QString reason;
    const auto original = nt::server::originalFile(client, asset, &reason);
    QTemporaryDir staging;
    if (!original || !staging.isValid()) { return 0; }
    nt::server::AssetCache cache(staging.path(), client.serverKey(), client.userKey(), [&client](QNetworkRequest& request) { client.decorate(request); });
    const auto fetched = cache.fetch(asset.value("id").toString(), "original", *original);
    if (!fetched.ok() || QThread::currentThread()->isInterruptionRequested()) { return 0; }
    const auto facts = nt::probeMedia(fetched.path.toStdString());
    return facts.opened && std::isfinite(facts.durationSec) && facts.durationSec > 0 ? facts.durationSec * 1000 : 0;
}
}
