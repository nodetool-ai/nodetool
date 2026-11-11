// The server half of Remix against a scratch server: uploads a click track, analyses and
// remixes the copy the server hands back, saves the result as a new asset and loads that.
// Usage: nt_remix_server_check <server url> <cache dir>. Prints one JSON report.
#include "assets/AssetWav.h"
#include "audio/AudioSource.h"
#include "remix/RemixFile.h"
#include "remix/clip/RemixBackend.h"

#include <QCoreApplication>
#include <QDir>
#include <QJsonDocument>
#include <QJsonObject>
#include <cmath>
#include <cstdio>

namespace {
// A click and a low thump on every beat of 120 beats per minute, the first beat of each bar stronger.
bool writeClicks(const QString& path, double seconds) {
    const int rate = 48000;
    const size_t frames = size_t(seconds * rate);
    size_t at = 0;
    return nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) -> qint64 {
        const size_t n = std::min(buffer.size() / 2, frames - at);
        for (size_t i = 0; i < n; ++i) {
            const double t = double(at + i) / rate;
            const int beat = int(t / 0.5);
            const double inBeat = t - beat * 0.5;
            const double gain = beat % 4 == 0 ? 1.0 : 0.6;
            const double v = gain * (0.7 * std::exp(-inBeat * 30.0) * std::sin(6.283185307 * 1200.0 * inBeat) +
                                     0.6 * std::exp(-inBeat * 12.0) * std::sin(6.283185307 * 70.0 * inBeat));
            buffer[i * 2] = buffer[i * 2 + 1] = float(v);
        }
        at += n;
        return qint64(n);
    }, [] { return false; }).has_value();
}
}  // namespace

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 3) { return 2; }
    const QUrl url(QString::fromLocal8Bit(argv[1]));
    if (!url.isValid() || url.port() == 7777 || url.host().isEmpty()) { return 2; }
    const QString cache = QString::fromLocal8Bit(argv[2]);
    QDir().mkpath(cache + "/server/user/timelines");
    nt::server::SaveTarget target;
    target.server = url;
    target.backupDir = cache + "/server/user/timelines";
    target.expectedInstance = qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE");
    const auto backend = nt::remix::serverBackend(target);
    QJsonObject report{{"ok", false}};
    auto fail = [&](const QString& why) {
        report.insert("error", why);
        std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
        return 1;
    };
    const QString clicks = cache + "/clicks.wav";
    if (!writeClicks(clicks, 24)) { return fail("could not write the click track"); }
    const auto source = backend->upload(clicks, "Click track", "");
    if (!source.ok()) { return fail("source upload: " + source.error); }
    nt::assets::MediaProtection protection;
    const auto resolved = backend->resolve(source.asset.value("id").toString(), protection, 0);
    if (!resolved.ok()) { return fail("source resolve: " + resolved.error); }
    const nt::remix::FileWindow window{resolved.media.audioPath, 0, 24000};
    const auto analysis = nt::remix::analyzeFile(window);
    if (!analysis.analysis) { return fail(QString("analysis: ") + nt::remix::describe(analysis.error)); }
    const long long targetFrames = 15 * 48000;
    const auto planned = nt::remix::plan(*analysis.analysis, targetFrames / 2, {50, 50});
    if (!planned.plan) { return fail(QString("plan: ") + nt::remix::describe(planned.error)); }
    const QString baked = cache + "/baked.wav";
    if (const auto error = nt::remix::bakeWav(window, *planned.plan, targetFrames, baked); error != nt::remix::Error::None) {
        return fail(QString("bake: ") + nt::remix::describe(error));
    }
    const auto uploaded = backend->upload(baked, "Click track (remix 0:15)", source.asset.value("id").toString());
    if (!uploaded.ok()) { return fail("remix upload: " + uploaded.error); }
    const auto loaded = backend->resolve(uploaded.asset.value("id").toString(), protection, 0);
    if (!loaded.ok()) { return fail("remix resolve: " + loaded.error); }
    std::string error;
    auto decoded = nt::audio::AudioSource::open(loaded.media.audioPath, 48000, &error);
    if (!decoded) { return fail(QString::fromStdString("decode: " + error)); }
    long long frames = 0;
    std::vector<float> block(48000 * 2);
    while (const auto n = decoded->read(block.data(), 48000)) { frames += n; }
    report = QJsonObject{{"ok", true}, {"bpm", analysis.analysis->bpm}, {"pieces", int(planned.plan->pieces.size())}, {"frames", frames},
                         {"targetFrames", targetFrames}, {"sourceId", source.asset.value("id")}, {"remixId", uploaded.asset.value("id")},
                         {"remixName", uploaded.asset.value("name")}, {"contentType", uploaded.asset.value("content_type")}};
    std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
    return 0;
}
