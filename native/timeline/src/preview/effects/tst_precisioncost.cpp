#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
#include "preview/effects/ClipEffects.h"
#include "playback/PlaybackClock.h"
#include <QFile>
#include <QJsonDocument>
#include <QtTest>
#include <array>
#ifdef Q_OS_LINUX
#include <unistd.h>
#endif

namespace {
QJsonObject environment() {
#ifndef Q_OS_LINUX
    return {};  // Load and memory only qualify the Linux measurement runs.
#else
    double load[3]{};
    getloadavg(load, 3);
    QFile mem("/proc/meminfo");
    if (!mem.open(QIODevice::ReadOnly)) { qFatal("cannot read available memory"); }
    double available = 0;
    for (const auto& line : mem.readAll().split('\n')) {
        if (line.startsWith("MemAvailable:")) { available = line.simplified().split(' ')[1].toDouble(); }
    }
    return {{"load1", load[0]}, {"availableKiB", available}};
#endif
}
struct Route {
    TimelineModel model;
    PlaybackClock clock;
    nt::test::Still still;
    QRhi* rhi = nullptr;
    quint64 peakBytes = 0;
    bool settled = false;
    QRhiTexture::Format storage = QRhiTexture::UnknownFormat;
};
}
class TestPrecisionCost : public QObject {
    Q_OBJECT
private slots:
    void completedFrames() {
        const auto output = qEnvironmentVariable("NT_COST_OUTPUT");
        if (output.isEmpty()) {
#ifdef Q_OS_LINUX
            QVERIFY(environment().contains("availableKiB"));
#endif
            return;
        }
        const auto before = environment();
        QVERIFY(before["load1"].toDouble() <= 6);
        QVERIFY(before["availableKiB"].toDouble() >= 8 * 1024 * 1024);
        QJsonArray effects;
        for (int i = 0; i < 8; ++i) {
            effects.append(QJsonObject{{"id", QString::number(i)}, {"type", "levels"},
                {"enabled", true}, {"gamma", i % 2 ? 1.02 : 0.98}});
        }
        QCOMPARE(nt::effects::planChain(effects).size(), size_t(8));
        const auto parsed = nt::parseTimeline(QJsonObject{{"width", 3840}, {"height", 2160}, {"fps", 60},
            {"durationMs", 2000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "shape"}, {"trackId", "v"}, {"mediaType", "shape"},
                {"startMs", 0}, {"durationMs", 2000}, {"width", 3840}, {"height", 2160},
                {"shapeStyle", QJsonObject{{"kind", "ellipse"}, {"fill", "#b08040"}}},
                {"effects", effects}}}}});
        QVERIFY(parsed.timeline);
        std::array<Route, 2> routes;
        QJsonArray samples;
        for (int mode = 0; mode < 2; ++mode) {
            auto& route = routes[mode];
            const auto runBefore = environment();
            QElapsedTimer timer; timer.start();
            route.model.setTimeline(*parsed.timeline);
            route.clock.setDurationMs(2000);
            route.clock.setNowSource([] { return std::int64_t(0); });
            QVERIFY(route.still.initialize(route.model));
            route.still.setClock(&route.clock);
            route.still.compositor()->setWorkingFormat(mode ? nt::WorkingFormat::Rgba16F : nt::WorkingFormat::Rgba8);
            route.still.compositor()->workingObserver = [&route](QRhi* rhi, QRhiCommandBuffer*, QRhiTexture* texture, bool ready, bool, int, bool) {
                route.rhi = rhi;
                route.storage = texture->format();
                route.settled = ready;
                route.peakBytes = std::max(route.peakBytes, rhi->statistics().usedBytes);
            };
            route.still.frame();
            QVERIFY(route.rhi);
            samples.append(QJsonObject{{"kind", "cold"}, {"mode", mode}, {"before", runBefore},
                {"ms", timer.nsecsElapsed() / 1e6}, {"adapter", QString::fromUtf8(route.rhi->driverInfo().deviceName)},
                {"backend", QString::fromLatin1(route.rhi->backendName())}});
            qInfo() << "adapter" << mode << route.rhi->backendName() << route.rhi->driverInfo().deviceName;
            if (qEnvironmentVariableIsSet("NT_COST_HARDWARE")) {
                QVERIFY(route.rhi->driverInfo().deviceName.contains("RTX 3060"));
            }
        }
        for (int i = 0; i < 25; ++i) {
            for (int mode = 0; mode < 2; ++mode) {
                auto& route = routes[mode];
                const auto runBefore = environment();
                QVERIFY2(runBefore["load1"].toDouble() <= 6, "discard whole run: high load");
                QVERIFY(runBefore["availableKiB"].toDouble() >= 8 * 1024 * 1024);
                route.clock.seek(100 + i * 10);
                QElapsedTimer timer; timer.start();
                route.still.frame();
                const double completedMs = timer.nsecsElapsed() / 1e6;
                QVERIFY(route.settled);
                QCOMPARE(route.storage, mode ? QRhiTexture::RGBA16F : QRhiTexture::RGBA8);
                const auto& stat = route.still.stats().back();
                QCOMPARE(stat.resourceFailures, 0);
                samples.append(QJsonObject{{"kind", i < 5 ? "warmup" : "steady"}, {"i", i - 5},
                    {"mode", mode}, {"before", runBefore}, {"ms", completedMs},
                    {"cpuMs", stat.renderCpuMs}, {"surfaceBytes", double(stat.surfaceBytes)},
                    {"peakGpuBytes", double(route.peakBytes)}});
            }
        }
        QJsonObject result{{"before", before}, {"samples", samples}};
        QFile file(output); QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(QJsonDocument(result).toJson());
        for (auto& route : routes) { route.still.compositor()->workingObserver = {}; }
    }
};
QTEST_MAIN(TestPrecisionCost)
#include "tst_precisioncost.moc"
