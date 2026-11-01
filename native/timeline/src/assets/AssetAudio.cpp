#include "assets/AssetAudio.h"
#include "assets/AssetWav.h"
#include "audio/AudioSource.h"
#include "server/ServerTimeline.h"
#include <QTemporaryDir>
#include <QThread>

namespace nt::assets {
QJsonObject extractLinkedAudio(nt::server::ServerClient& client, const QJsonObject& video) {
    const QJsonObject failed{{"outcome", "failed"}};
    const auto interrupted = [] { return QThread::currentThread()->isInterruptionRequested(); };
    if (interrupted()) { return failed; }
    QString reason;
    const auto file = nt::server::originalFile(client, video, &reason);
    QTemporaryDir staging;
    if (!file || !staging.isValid()) { return failed; }
    nt::server::AssetCache cache(staging.path(), client.serverKey(), client.userKey(),
        [&client](QNetworkRequest& request) { client.decorate(request); });
    const auto fetched = cache.fetch(video.value("id").toString(), "original", *file);
    if (!fetched.ok() || interrupted()) { return failed; }
    std::string error;
    auto source = nt::audio::AudioSource::open(fetched.path.toStdString(), 48000, &error);
    if (interrupted()) { return failed; }
    if (!source) { return error == "no audio stream" ? QJsonObject{{"outcome", "silent"}} : failed; }
    const auto wav = staging.filePath("audio.wav");
    const auto frames = writeStereoWavStream(wav, [&source](std::span<float> buffer) -> qint64 {
        const auto count = source->read(buffer.data(), static_cast<std::int64_t>(buffer.size() / 2));
        return source->decodeErrors() == 0 ? count : -1;
    }, interrupted);
    if (!frames || interrupted()) { return failed; }
    QJsonObject fields{{"name", video.value("name").toString() + " (audio)"},
        {"content_type", "audio/wav"}, {"parent_id", video.value("id")}};
    for (const auto& key : {QStringLiteral("project_id"), QStringLiteral("workflow_id")}) {
        if (!video.value(key).toString().isEmpty()) { fields.insert(key, video.value(key)); }
    }
    const auto uploaded = client.upload(fields, wav, "audio/wav");
    if (!uploaded.ok() || interrupted()) { return failed; }
    auto asset = uploaded.data.toObject();
    if (asset.value("id").toString().isEmpty()) { return failed; }
    if (!asset.value("duration").isDouble()) { asset.insert("duration", static_cast<double>(*frames) / 48000); }
    return {{"outcome", "audio"}, {"asset", asset}};
}
}
