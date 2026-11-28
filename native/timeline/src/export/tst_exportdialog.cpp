#include "../../tests/RequireValue.h"
#include "../../tests/TestAssetCacheRoot.h"
#include "export/ExportController.h"
#include "export/ExportEngine.h"
#include "export/ExportSettings.h"
#include "assets/AssetWav.h"
#include "preview/effects/Masks.h"
#include "audio/AudioEngine.h"
#include "audio/AudioSource.h"
#include <QTcpServer>
#include <QTcpSocket>
#include <array>
#include <atomic>
#include <thread>
extern "C" {
#include <libavformat/avio.h>
}
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/SceneEval.h"
#include "server/AssetCache.h"
#include <QGuiApplication>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QFile>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickItem>
#include <QQuickWindow>
#include <functional>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QDir>
#include <QtTest>
#include <memory>
#include <limits>
#include <cfenv>
#include <QPainter>

class ExportDialogTest : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
private slots:
    void rangeResolution() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        nt::Timeline timeline;
        timeline.width = 64;
        timeline.height = 64;
        timeline.fps = 30;
        timeline.durationMs = 1000;
        nt::exporting::Options options;
        options.format = "png_sequence";
        int serial = 0;
        const auto run = [&] {
            options.output = dir.filePath(QString::number(++serial));
            return nt::exporting::exportTimeline(timeline, options, nt::server::AssetCacheRoot{});
        };
        auto result = run();
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.frames, 30);
        QCOMPARE(result.samples, 48000);
        QCOMPARE(result.width, 64);
        QCOMPARE(result.height, 64);
        QCOMPARE(result.startMs, 0.0);
        QCOMPARE(result.endMs, 1000.0);
        options.startMs = 200;
        options.endMs = 700;
        result = run();
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.frames, 15);
        QCOMPARE(result.startMs, 200.0);
        QCOMPARE(result.endMs, 700.0);
        options.endMs = 2000;
        result = run();
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.frames, 24);
        QCOMPARE(result.endMs, 1000.0);
        for (double start : {1000.0, 1200.0, std::numeric_limits<double>::quiet_NaN()}) {
            options.startMs = start;
            QCOMPARE(run().error, QString("The export range is empty."));
        }
        options.startMs = 700;
        options.endMs = 700;
        QCOMPARE(run().error, QString("The export range is empty."));
        options.endMs = std::numeric_limits<double>::quiet_NaN();
        QCOMPARE(run().error, QString("The export range is empty."));
        options.startMs = 0;
        options.endMs = -1;
        options.fps = 24;
        options.width = 33;
        options.height = 19;
        result = run();
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.frames, 24);
        QCOMPARE(result.fps, 24.0);
        // A PNG sequence keeps the exact size asked for, a video rounds it down to even.
        QCOMPARE(result.width, 33);
        QCOMPARE(result.height, 19);
        options.format = "wav";
        options.startMs = 250;
        options.endMs = 750;
        result = run();
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.samples, 24000);
        QCOMPARE(result.width, 0);
        QCOMPARE(result.height, 0);
        for (double fps : {-1.0, std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity()}) {
            options.fps = fps;
            QCOMPARE(run().error, QString("Invalid export frame rate or canvas size"));
        }
        options.fps = 0;
        options.width = -1;
        QCOMPARE(run().error, QString("Invalid export frame rate or canvas size"));
        options.width = 0;
        options.height = -1;
        QCOMPARE(run().error, QString("Invalid export frame rate or canvas size"));
    }
    void fitFrameModes() {
        QImage image(160, 90, QImage::Format_RGBA8888);
        image.fill(Qt::red);
        QPainter painter(&image);
        painter.fillRect(60, 0, 40, 90, Qt::green);
        painter.end();
        const QSize target(90, 160);
        const auto fit = nt::exporting::fitFrame(image, target, "fit");
        QCOMPARE(fit.size(), target);
        QCOMPARE(fit.format(), QImage::Format_RGBA8888);
        QCOMPARE(fit.pixelColor(45, 0), QColor(Qt::black));
        QCOMPARE(fit.pixelColor(45, 159), QColor(Qt::black));
        QCOMPARE(fit.pixelColor(0, 80), QColor(Qt::red));
        QCOMPARE(fit.pixelColor(45, 80), QColor(Qt::green));
        QCOMPARE(nt::exporting::fitFrame(image, target, "unknown"), fit);
        const auto fill = nt::exporting::fitFrame(image, target, "fill");
        QCOMPARE(fill.size(), target);
        QCOMPARE(fill.format(), QImage::Format_RGBA8888);
        QCOMPARE(fill.pixelColor(45, 0), QColor(Qt::green));
        QCOMPARE(fill.pixelColor(45, 159), QColor(Qt::green));
        QVERIFY(fill.pixelColor(0, 0) != QColor(Qt::black));
        QCOMPARE(nt::exporting::fitFrame(image, image.size(), "fit"), image);
    }
    void bitrateExport() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        // A moving picture: a still is one key frame, which no rate control can shrink below its lowest quality.
        const QJsonObject doc{{"width", 640}, {"height", 360}, {"fps", 30}, {"durationMs", 3000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "video"},
                {"status", "generated"}, {"durationMs", 3000}, {"outPointMs", 3000},
                {"mediaPath", QDir(QStringLiteral(NT_EXPORT_FIXTURES)).filePath("media/numbered-a-1080p30.mp4")}}}}};
        // The export child decodes in software like the editor's export does.
        QFile document(dir.filePath("moving.json"));
        QVERIFY(document.open(QIODevice::WriteOnly));
        document.write(QJsonDocument(doc).toJson());
        document.close();
        const auto run = [&](const QString& name, const QStringList& extra) {
            QProcess process;
            // The default encoder, as the app exports: the LGPL FFmpeg of the packages has no libx264.
            process.start(QStringLiteral(NT_EXPORT_BINARY), QStringList{dir.filePath("moving.json"), "--export", dir.filePath(name),
                "--format", "mp4"} + extra);
            if (!process.waitForFinished(60000) || process.exitCode() != 0) {
                qWarning().noquote() << name << "failed:" << process.readAllStandardError();
                return qint64(-1);
            }
            return QFileInfo(dir.filePath(name)).size();
        };
        const auto qualitySize = run("quality.mp4", {});
        const auto bitrateSize = run("bitrate.mp4", {"--video-bitrate", "200"});
        QVERIFY(qualitySize > 0 && bitrateSize > 0);
        QVERIFY2(bitrateSize * 2 < qualitySize, qPrintable(QString("target %1 vs quality %2 bytes").arg(bitrateSize).arg(qualitySize)));
    }
    void refusesUnavailableServerOriginal() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QImage proxy(16, 16, QImage::Format_RGBA8888);
        proxy.fill(Qt::blue);
        const QString proxyPath = dir.filePath("proxy.png");
        QVERIFY(proxy.save(proxyPath));
        const QJsonObject raw{{"width", 16}, {"height", 16}, {"fps", 1},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"},
                {"mediaType", "image"}, {"durationMs", 1000}, {"status", "generated"},
                {"currentAssetId", QString(32, u'a')}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        parsed.timeline->clips.front().mediaPath = proxyPath.toStdString();
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        ExportController controller(m_testCache.root());
        controller.setTimeline(&model);
        QSignalSpy finished(&controller, &ExportController::finished);
        controller.start(dir.filePath("unsafe.zip"), "png_sequence");
        QCOMPARE(finished.count(), 1);
        QVERIFY(!finished.first().first().toBool());
        QVERIFY(controller.error().contains("original media"));
        QVERIFY(!QFile::exists(dir.filePath("unsafe.zip")));
    }
    void audioOnlyExportAllowsMissingPictureOriginal() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString audioPath = QDir(QStringLiteral(NT_EXPORT_FIXTURES)).filePath("media/tone-440-48k-mono.wav");
        QVERIFY(QFile::exists(audioPath));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 3},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"},
                {"mediaType", "video"}, {"durationMs", 1000}, {"status", "generated"},
                {"currentAssetId", QString(32, u'a')}, {"audioPath", audioPath}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        ExportController controller(m_testCache.root());
        controller.setTimeline(&model);
        controller.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        QSignalSpy finished(&controller, &ExportController::finished);
        const QString output = dir.filePath("audio.wav");
        controller.start(output, "wav");
        QTRY_VERIFY_WITH_TIMEOUT(!finished.empty(), 60000);
        QVERIFY2(finished.first().first().toBool(), qPrintable(controller.error()));
        QVERIFY(QFileInfo(output).size() > 0);
    }
    void snapshotRendersOriginalPicture() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString originalPath = QDir(QStringLiteral(NT_EXPORT_FIXTURES)).filePath("media/rgb-solid-720p.mp4");
        const QString proxyPath = QDir(QStringLiteral(NT_EXPORT_FIXTURES)).filePath("media/colorbars-bt709-full.mp4");
        QVERIFY(QFile::exists(originalPath));
        QVERIFY(QFile::exists(proxyPath));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 3},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"},
                {"mediaType", "video"}, {"status", "generated"}, {"sourceType", "imported"},
                {"currentAssetId", QString(32, u'a')}, {"durationMs", 1000},
                {"width", 1280}, {"height", 720},
                {"mediaPath", proxyPath}, {"originalMediaPath", originalPath}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto snapshot = nt::exporting::exportSnapshot(model);
        QCOMPARE(snapshot.value("clips").toArray().first().toObject().value("mediaPath").toString(), originalPath);
        const auto exportDoc = nt::parseTimelineJson(QJsonDocument(snapshot).toJson());
        QVERIFY(exportDoc.timeline);
        QCOMPARE(QString::fromStdString(exportDoc.timeline->clips.front().mediaPath), originalPath);
        QCOMPARE(nt::activeLayersAt(*exportDoc.timeline, 0).size(), size_t{1});
        auto render = [&](QJsonObject document, const QString& name) -> QImage {
            const QString snapshotPath = dir.filePath(name + ".json");
            QFile snapshotFile(snapshotPath);
            if (!snapshotFile.open(QIODevice::WriteOnly) || snapshotFile.write(QJsonDocument(document).toJson()) < 0) return {};
            snapshotFile.close();
            const QString archivePath = dir.filePath(name + ".zip");
            QProcess process;
            process.start(QStringLiteral(NT_EXPORT_BINARY),
                {snapshotPath, "--export", archivePath, "--format", "png_sequence", "--json"});
            if (!process.waitForFinished(60000) || process.exitCode() != 0) return {};
            QFile archive(archivePath);
            if (!archive.open(QIODevice::ReadOnly)) return {};
            const QByteArray bytes = archive.readAll();
            if (!bytes.startsWith("PK\003\004") || bytes.size() < 30) return {};
            const auto u16 = [&](int offset) {
                return static_cast<int>(static_cast<quint8>(bytes.at(offset))) |
                    (static_cast<int>(static_cast<quint8>(bytes.at(offset + 1))) << 8);
            };
            const auto u32 = [&](int offset) {
                return static_cast<quint32>(u16(offset)) | (static_cast<quint32>(u16(offset + 2)) << 16);
            };
            const int imageOffset = 30 + u16(26) + u16(28);
            return QImage::fromData(bytes.mid(imageOffset, u32(18)), "PNG");
        };
        const QImage actual = render(snapshot, "selected-original");
        QVERIFY(!actual.isNull());
        const QImage directServerExport = render(raw, "direct-server");
        QVERIFY(!directServerExport.isNull());
        QCOMPARE(actual, directServerExport);
        auto direct = snapshot;
        auto clips = direct.value("clips").toArray();
        auto clip = clips.first().toObject();
        clip.insert("mediaPath", proxyPath);
        clip.remove("originalMediaPath");
        clips[0] = clip;
        direct.insert("clips", clips);
        const QImage proxyFrame = render(direct, "proxy-control");
        QVERIFY(!proxyFrame.isNull());
        QVERIFY(actual != proxyFrame);
    }
    void relativeMatteSurvivesOriginalPictureSelection() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        for (const auto& [name, color] : std::array<std::pair<const char*, QColor>, 3>{
                 {{"proxy.png", Qt::blue}, {"original.png", Qt::red}, {"matte.png", Qt::black}}}) {
            QImage image(64, 48, QImage::Format_RGBA8888);
            image.fill(color);
            QVERIFY(image.save(dir.filePath(name)));
        }
        const QJsonObject matte{{"mediaPath", "matte.png"}, {"status", "ready"}};
        const QJsonObject clip{{"id", "c"}, {"trackId", "v"}, {"mediaType", "image"},
            {"status", "generated"}, {"sourceType", "imported"}, {"durationMs", 1000},
            {"width", 64}, {"height", 48}, {"mediaPath", "proxy.png"},
            {"originalMediaPath", "original.png"}, {"generatedMatte", matte}};
        const QJsonObject document{{"width", 64}, {"height", 48}, {"fps", 1}, {"durationMs", 1000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{clip}}};
        auto render = [&](const QJsonObject& source, const QString& name) -> QImage {
            const QString input = dir.filePath(name + ".json");
            QFile file(input);
            if (!file.open(QIODevice::WriteOnly) || file.write(QJsonDocument(source).toJson()) < 0) return {};
            file.close();
            const QString output = dir.filePath(name + ".zip");
            QProcess process;
            process.start(QStringLiteral(NT_EXPORT_BINARY), {input, "--export", output,
                "--format", "png_sequence", "--json"});
            if (!process.waitForFinished(60000) || process.exitCode() != 0) return {};
            QFile archive(output);
            if (!archive.open(QIODevice::ReadOnly)) return {};
            const QByteArray bytes = archive.readAll();
            if (!bytes.startsWith("PK\003\004") || bytes.size() < 30) return {};
            const auto u16 = [&](int i) { return int(quint8(bytes.at(i))) | (int(quint8(bytes.at(i + 1))) << 8); };
            const int start = 30 + u16(26) + u16(28);
            const quint32 size = quint32(u16(18)) | (quint32(u16(20)) << 16);
            return QImage::fromData(bytes.mid(start, size), "PNG");
        };
        const QImage relative = render(document, "relative");
        QVERIFY(!relative.isNull());
        auto absolute = document;
        auto clips = absolute.value("clips").toArray();
        auto absoluteClip = clips.first().toObject();
        auto absoluteMatte = absoluteClip.value("generatedMatte").toObject();
        absoluteMatte.insert("mediaPath", dir.filePath("matte.png"));
        absoluteClip.insert("generatedMatte", absoluteMatte);
        clips[0] = absoluteClip;
        absolute.insert("clips", clips);
        const QImage expected = render(absolute, "absolute");
        QVERIFY(!expected.isNull());
        QCOMPARE(relative, expected);
        const QColor pixel = relative.pixelColor(32, 24);
        QVERIFY2(pixel.red() < 30 && pixel.green() < 30 && pixel.blue() < 30, qPrintable(pixel.name()));
    }
    void replacesExistingFileOnlyWhenAsked() {
        QTemporaryDir dir;
        nt::Timeline timeline;
        timeline.width = timeline.height = 64;
        timeline.fps = 30;
        timeline.durationMs = 200;
        nt::Track track;
        track.id = "audio";
        track.type = nt::TrackType::Audio;
        timeline.tracks.push_back(track);
        nt::exporting::Options options;
        options.output = dir.filePath("again.wav");
        options.format = "wav";
        QFile old(options.output);
        QVERIFY(old.open(QIODevice::WriteOnly));
        old.write("old export");
        old.close();
        auto result = nt::exporting::exportTimeline(timeline, options, nt::server::AssetCacheRoot{});
        QCOMPARE(result.error, QStringLiteral("Export destination already exists"));
        options.replace = true;
        result = nt::exporting::exportTimeline(timeline, options, nt::server::AssetCacheRoot{});
        QVERIFY2(result.error.isEmpty(), qPrintable(result.error));
        QVERIFY(old.open(QIODevice::ReadOnly));
        QVERIFY(old.read(4) == QByteArrayLiteral("RIFF"));
        QCOMPARE(QDir(dir.path()).entryList(QDir::AllEntries | QDir::Hidden | QDir::NoDotAndDotDot), QStringList{"again.wav"});
    }
    void cancelExportDuringAudio() {
        if (!avio_find_protocol_name("tcp://127.0.0.1:1")) { QSKIP("FFmpeg has no TCP protocol"); }
        QTemporaryDir dir;
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        nt::Timeline timeline;
        timeline.width = timeline.height = 64;
        timeline.fps = 30;
        timeline.durationMs = 1000;
        nt::Track track;
        track.id = "audio";
        track.type = nt::TrackType::Audio;
        timeline.tracks.push_back(track);
        nt::Clip clip;
        clip.id = "clip";
        clip.trackId = track.id;
        clip.mediaType = nt::MediaType::Audio;
        clip.status = "generated";
        clip.durationMs = 1000;
        clip.mediaPath = "tcp://127.0.0.1:" + std::to_string(server.serverPort());
        timeline.clips.push_back(clip);
        std::stop_source stop;
        std::atomic<bool> done{false};
        nt::exporting::Result result;
        nt::exporting::Options options;
        options.output = dir.filePath("cancelled.wav");
        options.format = "wav";
        std::jthread worker([&] {
            result = nt::exporting::exportTimeline(timeline, options, nt::server::AssetCacheRoot{}, stop.get_token());
            done = true;
        });
        QTRY_VERIFY(server.hasPendingConnections());
        std::unique_ptr<QTcpSocket> connection(server.nextPendingConnection());
        stop.request_stop();
        QTRY_VERIFY_WITH_TIMEOUT(done.load(), 3000);
        QVERIFY(result.cancelled);
        QVERIFY(result.error.isEmpty());
        QCOMPARE(QDir(dir.path()).entryList(QDir::AllEntries | QDir::Hidden | QDir::NoDotAndDotDot), QStringList{});
    }
    void cancelBlockedAudio_data() {
        QTest::addColumn<bool>("sendHeader");
        QTest::newRow("open") << false;
        QTest::newRow("read") << true;
    }
    void cancelBlockedAudio() {
        if (!avio_find_protocol_name("tcp://127.0.0.1:1")) { QSKIP("FFmpeg has no TCP protocol"); }
        QFETCH(bool, sendHeader);
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        const auto path = "tcp://127.0.0.1:" + std::to_string(server.serverPort());
        std::atomic<bool> cancelled{false}, done{false}, reading{false};
        std::jthread worker([&] {
            std::string error;
            auto source = nt::audio::AudioSource::open(path, 48000, &error, [&] { return cancelled.load(); });
            if (source) {
                std::array<float, 2048> prefix{};
                if (source->read(prefix.data(), 1024) == 1024) {
                    reading = true;
                    source->readAll();
                }
            }
            done = true;
        });
        QTRY_VERIFY(server.hasPendingConnections());
        std::unique_ptr<QTcpSocket> connection(server.nextPendingConnection());
        if (sendHeader) {
            QByteArray header = QByteArray::fromHex("5249464624093d0057415645666d7420100000000100020080bb000000dc0500080020006461746100093d00");
            // A PCM WAV declaring four million data bytes, with only a prefix supplied.
            header.append(QByteArray(3 * 1024 * 1024, '\0'));
            connection->write(header);
            connection->flush();
            QTRY_VERIFY_WITH_TIMEOUT(reading.load(), 3000);
        }
        cancelled = true;
        QTRY_VERIFY_WITH_TIMEOUT(done.load(), 3000);
    }
    void stuckChildTeardownCleansStaging() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/audio-mix.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        QElapsedTimer elapsed;
        {
            ExportController controller(m_testCache.root());
            controller.setExecutable(QCoreApplication::applicationFilePath());
            controller.setTimeline(&model);
            controller.start(dir.filePath("never.wav"), "wav");
            QTRY_VERIFY(!QDir(dir.path()).entryList({".nt-export-*"}, QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot).empty());
            const auto staging = QDir(dir.path()).entryList({".nt-export-*"}, QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot).front();
            QTRY_VERIFY(QFileInfo::exists(QDir(dir.path()).filePath(staging + "/output")));
            elapsed.start();
        }
        QVERIFY(elapsed.elapsed() < 3500);
        QCOMPARE(QDir(dir.path()).entryList(QDir::AllEntries | QDir::Hidden | QDir::NoDotAndDotDot), QStringList{});
    }
    // AU-8: the 24-bit WAV preset. A known float signal is exported through the
    // engine and the data chunk is read back against the offline mix.
    void wav24WritesA24BitPcmHeaderAndRoundTrips() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        constexpr int frames = 24000;  // half a second
        std::vector<float> signal(std::size_t{frames} * 2);
        for (int i = 0; i < frames; ++i) {
            const double t = i / 48000.0;
            signal[std::size_t{2} * i] = float(0.7 * std::sin(2 * M_PI * 440 * t));
            signal[2 * i + 1] = float(0.3 * std::sin(2 * M_PI * 1234.5 * t) + 1e-5 * std::sin(2 * M_PI * 3 * t));
        }
        signal[0] = 1.0f;       // full scale
        signal[2] = -1.0f;
        const QString source = dir.filePath("signal.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(source, signal));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 500},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 500}, {"status", "generated"}, {"mediaPath", source}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        const auto reference = nt::audio::renderOffline(requireValue(parsed.timeline), 48000, 0, 500);
        QCOMPARE(reference.size(), size_t(frames * 2));
        QVERIFY(std::any_of(reference.begin(), reference.end(), [](float v) { return std::fabs(v) > 0.1f; }));

        nt::exporting::Options options;
        options.format = "wav";
        options.audioBitDepth = 24;
        options.output = dir.filePath("mix24.wav");
        const auto result = nt::exporting::exportTimeline(requireValue(parsed.timeline), options, m_testCache.root());
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.audioEncoder, QString("pcm_s24le"));

        QFile file(options.output);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QByteArray bytes = file.readAll();
        QVERIFY(bytes.startsWith("RIFF"));
        QCOMPARE(bytes.mid(8, 4), QByteArray("WAVE"));
        const auto u16 = [&](qsizetype o) { return quint16(quint8(bytes[o]) | (quint8(bytes[o + 1]) << 8)); };
        const auto u32 = [&](qsizetype o) { return quint32(u16(o)) | (quint32(u16(o + 2)) << 16); };
        qsizetype fmt = -1, data = -1;
        for (qsizetype o = 12; o + 8 <= bytes.size();) {
            const auto id = bytes.mid(o, 4);
            const auto size = qsizetype(u32(o + 4));
            if (id == "fmt ") { fmt = o + 8; }
            if (id == "data") { data = o + 8; break; }
            o += 8 + size + (size & 1);
        }
        QVERIFY(fmt > 0 && data > 0);
        // ffmpeg writes 24-bit PCM as WAVE_FORMAT_EXTENSIBLE with the PCM sub-format.
        QCOMPARE(u16(fmt), quint16(0xFFFE));
        QCOMPARE(u16(fmt + 16), quint16(22));    // cbSize
        QCOMPARE(u16(fmt + 18), quint16(24));    // valid bits
        QCOMPARE(u16(fmt + 24), quint16(1));     // sub-format: PCM
        QCOMPARE(u16(fmt + 2), quint16(2));      // stereo
        QCOMPARE(u32(fmt + 4), quint32(48000));
        QCOMPARE(u32(fmt + 8), quint32(48000 * 2 * 3));  // byte rate
        QCOMPARE(u16(fmt + 12), quint16(6));     // block align
        QCOMPARE(u16(fmt + 14), quint16(24));    // bits per sample
        QCOMPARE(qsizetype(u32(data - 4)), qsizetype(frames * 6));
        QCOMPARE(bytes.size() - data, qsizetype(frames * 6));

        // Every sample is within half a 24-bit step of the mix, and the mean
        // error is near zero (a truncating conversion would sit at half a step).
        double worst = 0, sum = 0;
        for (qsizetype i = 0; i < qsizetype(reference.size()); ++i) {
            const auto* p = reinterpret_cast<const quint8*>(bytes.constData() + data + i * 3);
            qint32 v = qint32(p[0] | (p[1] << 8) | (p[2] << 16));
            if (v & 0x800000) v -= 0x1000000;
            const double error = double(v) / 8388608.0 - double(std::clamp(reference[size_t(i)], -1.0f, 8388607.0f / 8388608.0f));
            worst = std::max(worst, std::fabs(error));
            sum += error;
        }
        QVERIFY2(worst <= 0.5 / 8388608.0 + 1e-12, qPrintable(QString::number(worst, 'g', 12)));
        QVERIFY(std::fabs(sum / double(reference.size())) < 0.1 / 8388608.0);

        // The same mix at 16 bit keeps its header and its coarser step.
        options.audioBitDepth = 16;
        options.output = dir.filePath("mix16.wav");
        QVERIFY(nt::exporting::exportTimeline(requireValue(parsed.timeline), options, m_testCache.root()).ok());
        QFile file16(options.output);
        QVERIFY(file16.open(QIODevice::ReadOnly));
        const QByteArray bytes16 = file16.readAll();
        QCOMPARE(quint16(quint8(bytes16[34]) | (quint8(bytes16[35]) << 8)), quint16(16));
    }
    // F4: 16-bit WAV export applies TPDF dither (preserving sub-LSB sine energy); 24-bit clamps without dither.
    void wav16UsesTpdfDitherAnd24BitClamps() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        constexpr int frames = 48000;  // 1 second
        constexpr double freq = 1000.0;
        constexpr double amp = 0.35 / 32768.0;  // below 0.5 LSB of 16-bit PCM
        std::vector<float> quiet(std::size_t{frames} * 2);
        for (int i = 0; i < frames; ++i) {
            const float s = static_cast<float>(amp * std::sin(2.0 * M_PI * freq * i / 48000.0));
            quiet[std::size_t{2} * i] = s;
            quiet[std::size_t{2} * i + 1] = s;
        }
        const QString source = dir.filePath("quiet.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(source, quiet));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 1000},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 1000}, {"status", "generated"}, {"mediaPath", source}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);

        nt::exporting::Options options;
        options.format = "wav";
        options.audioBitDepth = 16;
        options.output = dir.filePath("quiet16.wav");
        const auto result = nt::exporting::exportTimeline(requireValue(parsed.timeline), options, m_testCache.root());
        QVERIFY2(result.ok(), qPrintable(result.error));

        QFile file(options.output);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QByteArray bytes = file.readAll();
        const auto u32 = [&](qsizetype o) {
            return quint32(quint8(bytes[o]) | (quint8(bytes[o + 1]) << 8) | (quint8(bytes[o + 2]) << 16) | (quint8(bytes[o + 3]) << 24));
        };
        qsizetype data = -1;
        for (qsizetype o = 12; o + 8 <= bytes.size();) {
            const auto id = bytes.mid(o, 4);
            const auto size = qsizetype(u32(o + 4));
            if (id == "data") { data = o + 8; break; }
            o += 8 + size + (size & 1);
        }
        QVERIFY(data > 0);
        const auto* samples = reinterpret_cast<const qint16*>(bytes.constData() + data);
        double sinCorr = 0.0, cosCorr = 0.0, errSqSum = 0.0, maxErrLsb = 0.0;
        int nonZero = 0;
        for (int i = 0; i < frames; ++i) {
            const double q = static_cast<double>(samples[2 * i]) / 32768.0;
            if (samples[2 * i] != 0) ++nonZero;
            const double phase = 2.0 * M_PI * freq * i / 48000.0;
            sinCorr += q * std::sin(phase);
            cosCorr += q * std::cos(phase);
            const double errLsb = static_cast<double>(samples[2 * i]) - static_cast<double>(quiet[std::size_t{2} * i]) * 32768.0;
            errSqSum += errLsb * errLsb;
            maxErrLsb = std::max(maxErrLsb, std::abs(errLsb));
        }
        const double recoveredAmp = 2.0 * std::hypot(sinCorr, cosCorr) / frames;
        const double errVarLsb = errSqSum / frames;
        // Without TPDF dither, every sample rounds to 0 (nonZero == 0, recoveredAmp == 0).
        QVERIFY2(nonZero > frames / 10, qPrintable(QStringLiteral("expected dithered non-zero samples, got %1").arg(nonZero)));
        QVERIFY2(std::abs(recoveredAmp - amp) < 0.06 / 32768.0,
                 qPrintable(QStringLiteral("recovered sub-LSB sine=%1 expected=%2").arg(recoveredAmp * 32768.0).arg(amp * 32768.0)));
        // TPDF quantization error variance is 1/4 LSB^2 = 0.25 (1/12 quantization + 1/6 TPDF dither), max <= 1.5 LSB.
        QVERIFY2(errVarLsb > 0.20 && errVarLsb < 0.30, qPrintable(QStringLiteral("errVarLsb=%1").arg(errVarLsb)));
        QVERIFY2(maxErrLsb <= 1.5 + 1e-6, qPrintable(QStringLiteral("maxErrLsb=%1").arg(maxErrLsb)));

        // 24-bit WAV keeps hard clamp with no dither on hot (> 1.0) input when limiter is off.
        std::vector<float> hot(std::size_t{256} * 2, 1.5f);
        hot[2] = -1.5f; hot[3] = -1.5f;
        const QString hotSource = dir.filePath("hot24.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(hotSource, hot));
        QJsonObject hotRaw = raw;
        hotRaw.insert("durationMs", 5.0);
        auto clips = hotRaw.value("clips").toArray();
        auto c0 = clips[0].toObject();
        c0.insert("durationMs", 5.0);
        c0.insert("mediaPath", hotSource);
        clips[0] = c0;
        hotRaw.insert("clips", clips);
        auto hotParsed = nt::parseTimelineJson(QJsonDocument(hotRaw).toJson());
        QVERIFY(hotParsed.timeline);
        options.audioBitDepth = 24;
        options.output = dir.filePath("hot24out.wav");
        QVERIFY(nt::exporting::exportTimeline(requireValue(hotParsed.timeline), options, m_testCache.root()).ok());
        QFile f24(options.output);
        QVERIFY(f24.open(QIODevice::ReadOnly));
        const QByteArray b24 = f24.readAll();
        qsizetype d24 = -1;
        for (qsizetype o = 12; o + 8 <= b24.size();) {
            const auto id = b24.mid(o, 4);
            const auto sz = qsizetype(quint32(quint8(b24[o + 4]) | (quint8(b24[o + 5]) << 8) | (quint8(b24[o + 6]) << 16) | (quint8(b24[o + 7]) << 24)));
            if (id == "data") { d24 = o + 8; break; }
            o += 8 + sz + (sz & 1);
        }
        QVERIFY(d24 > 0);
        const auto s24 = [&](qsizetype idx) {
            const auto* p = reinterpret_cast<const quint8*>(b24.constData() + d24 + idx * 3);
            qint32 v = qint32(p[0] | (p[1] << 8) | (p[2] << 16));
            if (v & 0x800000) v -= 0x1000000;
            return v;
        };
        QCOMPARE(s24(0), qint32(8388607));
        QCOMPARE(s24(2), qint32(-8388608));
    }
    // D17: 16-bit WAV TPDF dither must sanitize NaN and Inf samples (e.g. from a VST) to 0 instead of UB / full-scale pop.
    void d17_wav16TpdfDitherSanitizesNanSamples() {
        class NonFiniteInjector final : public nt::audio::BlockProcessor {
        public:
            void process(std::span<float> stereo, const nt::audio::BlockContext& ctx) noexcept override {
                if (ctx.timelineMs < 1.0 && stereo.size() >= 24) {
                    stereo[20] = std::numeric_limits<float>::quiet_NaN();
                    stereo[21] = std::numeric_limits<float>::quiet_NaN();
                    stereo[22] = std::numeric_limits<float>::infinity();
                    stereo[23] = -std::numeric_limits<float>::infinity();
                }
            }
        };
        const auto token = nt::audio::registerMixPlanStage(
            "dsp1-d17-nonfinite",
            [](const nt::Timeline&, nt::audio::MixPlan& plan) {
                plan.processors.push_back(std::make_shared<NonFiniteInjector>());
            },
            900);
        const auto cleanup = qScopeGuard([token] { nt::audio::unregisterMixPlanStage(token); });

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 5.0},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        nt::exporting::Options options;
        options.format = "wav";
        options.audioBitDepth = 16;
        options.output = dir.filePath("nan16.wav");
        const auto result = nt::exporting::exportTimeline(requireValue(parsed.timeline), options, m_testCache.root());
        QVERIFY2(result.ok(), qPrintable(result.error));
        QFile file(options.output);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QByteArray bytes = file.readAll();
        qsizetype data = -1;
        for (qsizetype o = 12; o + 8 <= bytes.size();) {
            const auto id = bytes.mid(o, 4);
            const auto sz = qsizetype(quint32(quint8(bytes[o + 4]) | (quint8(bytes[o + 5]) << 8) | (quint8(bytes[o + 6]) << 16) | (quint8(bytes[o + 7]) << 24)));
            if (id == "data") { data = o + 8; break; }
            o += 8 + sz + (sz & 1);
        }
        QVERIFY(data > 0);
        const auto* samples = reinterpret_cast<const qint16*>(bytes.constData() + data);
        QVERIFY2(std::abs(samples[20]) <= 1 && std::abs(samples[21]) <= 1 &&
                     std::abs(samples[22]) <= 1 && std::abs(samples[23]) <= 1,
                 qPrintable(QStringLiteral("Non-finite sample produced pop (%1, %2, %3, %4)")
                                .arg(samples[20]).arg(samples[21]).arg(samples[22]).arg(samples[23])));
    }
    // D18: 16-bit WAV TPDF dither must not depend on ambient FP rounding mode (FE_TOWARDZERO vs FE_TONEAREST).
    void d18_wav16TpdfDitherIgnoresAmbientRoundingMode() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        constexpr int frames = 4800;
        std::vector<float> pcm(std::size_t{frames} * 2);
        for (int i = 0; i < frames; ++i) {
            const float s = static_cast<float>(0.25 * std::sin(2.0 * M_PI * 1000.0 * i / 48000.0));
            pcm[std::size_t{2} * i] = s;
            pcm[std::size_t{2} * i + 1] = s;
        }
        const QString source = dir.filePath("tone.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(source, pcm));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 100.0},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 100.0}, {"status", "generated"}, {"mediaPath", source}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        const int savedRound = std::fegetround();
        const auto restoreRound = qScopeGuard([savedRound] { std::fesetround(savedRound); });

        auto exportUnderMode = [&](int mode, const QString& name) {
            std::fesetround(mode);
            nt::exporting::Options options;
            options.format = "wav";
            options.audioBitDepth = 16;
            options.output = dir.filePath(name);
            const auto res = nt::exporting::exportTimeline(requireValue(parsed.timeline), options, m_testCache.root());
            QByteArray bytes;
            if (res.ok()) {
                QFile f(options.output);
                if (f.open(QIODevice::ReadOnly)) bytes = f.readAll();
            }
            return bytes;
        };
        const QByteArray nearest = exportUnderMode(FE_TONEAREST, "nearest.wav");
        const QByteArray towardZero = exportUnderMode(FE_TOWARDZERO, "towardzero.wav");
        QVERIFY(!nearest.isEmpty() && !towardZero.isEmpty());
        QCOMPARE(towardZero, nearest);
    }
    void wav24SettingsReachTheCommandLine() {
        auto settings = nt::exporting::settingsFromVariant({{"format", "wav"}, {"audioBitDepth", 24}});
        QCOMPARE(settings.audioBitDepth, 24);
        QVERIFY(nt::exporting::cliArguments(settings).join(' ').contains("--audio-bit-depth 24"));
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "wav"}, {"audioBitDepth", 20}}).audioBitDepth, 16);
        QVERIFY(!nt::exporting::cliArguments(nt::exporting::settingsFromVariant({{"format", "wav"}})).join(' ').contains("bit-depth"));
        QVERIFY(!nt::exporting::cliArguments(nt::exporting::settingsFromVariant({{"format", "mp3"}, {"audioBitDepth", 24}})).join(' ').contains("bit-depth"));
    }
    // DSP2 F5: 32-bit float WAV export (exact round-trip, preserves >0 dBFS headroom, no dither)
    // and export sample-rate selection (44100 / 96000 Hz) in engine and ExportSettings.
    void dsp2_f5_wav32FloatAndSampleRateRoundTrip() {
        // Settings model round-trip and CLI argument propagation.
        const auto s32 = nt::exporting::settingsFromVariant({{"format", "wav"}, {"audioBitDepth", 32}, {"audioSampleRate", 96000}});
        QCOMPARE(s32.audioBitDepth, 32);
        QCOMPARE(s32.audioSampleRate, 96000);
        const auto map32 = nt::exporting::toVariant(s32);
        QCOMPARE(map32.value("audioBitDepth").toInt(), 32);
        QCOMPARE(map32.value("audioSampleRate").toInt(), 96000);
        const auto cli32 = nt::exporting::cliArguments(s32).join(' ');
        QVERIFY2(cli32.contains("--audio-bit-depth 32"), qPrintable(cli32));
        QVERIFY2(cli32.contains("--audio-sample-rate 96000"), qPrintable(cli32));
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "wav"}, {"audioSampleRate", 12345}}).audioSampleRate, 48000);
        QVERIFY(!nt::exporting::cliArguments(nt::exporting::settingsFromVariant({{"format", "wav"}})).join(' ').contains("sample-rate"));

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        constexpr int frames48 = 12000;  // 250 ms at 48 kHz
        std::vector<float> signal(std::size_t{frames48} * 2);
        for (int i = 0; i < frames48; ++i) {
            const double t = i / 48000.0;
            signal[std::size_t{2} * i] = static_cast<float>(0.6 * std::sin(2.0 * M_PI * 440.0 * t));
            signal[std::size_t{2} * i + 1] = static_cast<float>(0.4 * std::sin(2.0 * M_PI * 1000.0 * t));
        }
        // Hot values above 0 dBFS must survive 32-bit float WAV when master limiter is disabled.
        signal[100] = 1.75f;
        signal[101] = -2.25f;
        const QString source = dir.filePath("src48.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(source, signal));
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 250.0},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 250.0}, {"status", "generated"}, {"mediaPath", source}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);

        // 1. 32-bit IEEE float WAV at 48 kHz round-trips exact float samples (including >1.0) with no dither.
        nt::exporting::Options opt32;
        opt32.format = "wav";
        opt32.audioBitDepth = 32;
        opt32.audioSampleRate = 48000;
        opt32.output = dir.filePath("mix32_48k.wav");
        const auto res32 = nt::exporting::exportTimeline(requireValue(parsed.timeline), opt32, m_testCache.root());
        QVERIFY2(res32.ok(), qPrintable(res32.error));
        QCOMPARE(res32.audioEncoder, QString("pcm_f32le"));
        QCOMPARE(res32.samples, qint64(frames48));

        auto parseWav = [](const QString& path, quint16& fmtTag, quint16& subFmt, quint32& rate, quint16& bits, QByteArray& pcmBytes) {
            QFile f(path);
            if (!f.open(QIODevice::ReadOnly)) return false;
            const QByteArray bytes = f.readAll();
            if (!bytes.startsWith("RIFF") || bytes.mid(8, 4) != "WAVE") return false;
            auto u16 = [&](qsizetype o) { return quint16(quint8(bytes[o]) | (quint8(bytes[o + 1]) << 8)); };
            auto u32 = [&](qsizetype o) { return quint32(u16(o)) | (quint32(u16(o + 2)) << 16); };
            qsizetype fmt = -1, data = -1;
            quint32 dataSize = 0;
            for (qsizetype o = 12; o + 8 <= bytes.size();) {
                const auto id = bytes.mid(o, 4);
                const auto sz = qsizetype(u32(o + 4));
                if (id == "fmt ") { fmt = o + 8; }
                if (id == "data") { data = o + 8; dataSize = u32(o + 4); break; }
                o += 8 + sz + (sz & 1);
            }
            if (fmt < 0 || data < 0) return false;
            fmtTag = u16(fmt);
            rate = u32(fmt + 4);
            bits = u16(fmt + 14);
            subFmt = (fmtTag == 0xFFFE) ? u16(fmt + 24) : fmtTag;
            pcmBytes = bytes.mid(data, qsizetype(dataSize));
            return true;
        };

        quint16 fmtTag = 0, subFmt = 0, bits = 0;
        quint32 rate = 0;
        QByteArray data32;
        QVERIFY(parseWav(opt32.output, fmtTag, subFmt, rate, bits, data32));
        QCOMPARE(subFmt, quint16(3));  // WAVE_FORMAT_IEEE_FLOAT
        QCOMPARE(rate, quint32(48000));
        QCOMPARE(bits, quint16(32));
        QCOMPARE(data32.size(), qsizetype(frames48 * 8));
        const auto* outFloats = reinterpret_cast<const float*>(data32.constData());
        float maxDiff = 0.0f;
        for (std::size_t i = 0; i < signal.size(); ++i) {
            maxDiff = std::max(maxDiff, std::abs(outFloats[i] - signal[i]));
        }
        QVERIFY2(maxDiff == 0.0f, qPrintable(QStringLiteral("32-bit float round-trip diff=%1").arg(maxDiff)));
        QCOMPARE(outFloats[100], 1.75f);
        QCOMPARE(outFloats[101], -2.25f);

        // 2. Sample-rate export at 44100 Hz and 96000 Hz writes exact header rate, frame count, and tone frequency.
        for (const int targetRate : {44100, 96000}) {
            nt::exporting::Options optRate;
            optRate.format = "wav";
            optRate.audioBitDepth = 32;
            optRate.audioSampleRate = targetRate;
            optRate.output = dir.filePath(QStringLiteral("mix32_%1.wav").arg(targetRate));
            const auto resRate = nt::exporting::exportTimeline(requireValue(parsed.timeline), optRate, m_testCache.root());
            QVERIFY2(resRate.ok(), qPrintable(resRate.error));
            const qint64 expectedFrames = std::llround(0.250 * targetRate);
            QCOMPARE(resRate.samples, expectedFrames);
            QByteArray pcmBytes;
            QVERIFY(parseWav(optRate.output, fmtTag, subFmt, rate, bits, pcmBytes));
            QCOMPARE(rate, quint32(targetRate));
            QCOMPARE(bits, quint16(32));
            QCOMPARE(pcmBytes.size(), qsizetype(expectedFrames * 8));
            // Verify 440 Hz tone on left channel over interior frames.
            const auto* s = reinterpret_cast<const float*>(pcmBytes.constData());
            double sinAcc = 0.0, cosAcc = 0.0;
            const int start = targetRate / 50;
            const int end = int(expectedFrames) - start;
            for (int i = start; i < end; ++i) {
                const double ph = 2.0 * M_PI * 440.0 * i / targetRate;
                sinAcc += s[2 * i] * std::sin(ph);
                cosAcc += s[2 * i] * std::cos(ph);
            }
            const double amp = 2.0 * std::hypot(sinAcc, cosAcc) / (end - start);
            QVERIFY2(std::abs(amp - 0.6) < 0.01, qPrintable(QStringLiteral("rate=%1 amp=%2").arg(targetRate).arg(amp)));
        }
    }

    // DSP2 fix1 D10 + D12: 32-bit float WAV NaN/Inf sanitization, 16-bit TPDF dither at
    // non-48 kHz rates, per-format sample-rate validation in settings/engine/QML UI.
    void dsp2_fix1_d10_d12_exportEdgeCasesAndUi() {
        // 1. ExportSettings per-format sample-rate validation and CLI arg filtering.
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "wav"}, {"audioSampleRate", 192000}}).audioSampleRate, 192000);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "mp4"}, {"audioSampleRate", 44100}}).audioSampleRate, 44100);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "mp4"}, {"audioSampleRate", 96000}}).audioSampleRate, 96000);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "mp4"}, {"audioSampleRate", 192000}}).audioSampleRate, 48000);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "mp3"}, {"audioSampleRate", 44100}}).audioSampleRate, 44100);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "mp3"}, {"audioSampleRate", 96000}}).audioSampleRate, 48000);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "webm"}, {"audioSampleRate", 44100}}).audioSampleRate, 48000);
        QCOMPARE(nt::exporting::settingsFromVariant({{"format", "webm"}, {"audioSampleRate", 96000}}).audioSampleRate, 48000);

        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        constexpr int frames48 = 12000;  // 250 ms at 48 kHz
        std::vector<float> dirtySignal(std::size_t{frames48} * 2, 0.0f);
        dirtySignal[10] = 1.5f;
        dirtySignal[11] = -1.75f;
        dirtySignal[20] = std::numeric_limits<float>::quiet_NaN();
        dirtySignal[21] = std::numeric_limits<float>::infinity();
        dirtySignal[22] = -std::numeric_limits<float>::infinity();
        dirtySignal[23] = 0.25f;
        const QString dirtyPath = dir.filePath("dirty48.wav");
        QVERIFY(nt::assets::writeStereoFloatWav(dirtyPath, dirtySignal));

        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 30}, {"durationMs", 250.0},
            {"master", QJsonObject{{"volumeDb", 0}, {"limiter", false}}},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}, {"index", 0}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"},
                {"startMs", 0}, {"durationMs", 250.0}, {"status", "generated"}, {"mediaPath", dirtyPath}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);

        auto parseWav = [](const QString& path, quint32& rate, quint16& bits, QByteArray& pcmBytes) {
            QFile f(path);
            if (!f.open(QIODevice::ReadOnly)) return false;
            const QByteArray bytes = f.readAll();
            if (!bytes.startsWith("RIFF") || bytes.mid(8, 4) != "WAVE") return false;
            auto u16 = [&](qsizetype o) { return quint16(quint8(bytes[o]) | (quint8(bytes[o + 1]) << 8)); };
            auto u32 = [&](qsizetype o) { return quint32(u16(o)) | (quint32(u16(o + 2)) << 16); };
            qsizetype fmt = -1, data = -1;
            quint32 dataSize = 0;
            for (qsizetype o = 12; o + 8 <= bytes.size();) {
                const auto id = bytes.mid(o, 4);
                const auto sz = qsizetype(u32(o + 4));
                if (id == "fmt ") { fmt = o + 8; }
                if (id == "data") { data = o + 8; dataSize = u32(o + 4); break; }
                o += 8 + sz + (sz & 1);
            }
            if (fmt < 0 || data < 0) return false;
            rate = u32(fmt + 4);
            bits = u16(fmt + 14);
            pcmBytes = bytes.mid(data, qsizetype(dataSize));
            return true;
        };

        // 2. 32-bit float WAV sanitizes NaN / +-Inf to 0.0f while preserving finite samples (>0 dBFS).
        {
            nt::exporting::Options opt;
            opt.format = "wav";
            opt.audioBitDepth = 32;
            opt.audioSampleRate = 48000;
            opt.output = dir.filePath("sanitized32.wav");
            const auto res = nt::exporting::exportTimeline(requireValue(parsed.timeline), opt, m_testCache.root());
            QVERIFY2(res.ok(), qPrintable(res.error));
            quint32 rate = 0; quint16 bits = 0; QByteArray pcm;
            QVERIFY(parseWav(opt.output, rate, bits, pcm));
            QCOMPARE(rate, quint32(48000));
            QCOMPARE(bits, quint16(32));
            const auto* s = reinterpret_cast<const float*>(pcm.constData());
            for (int i = 0; i < frames48 * 2; ++i) {
                QVERIFY2(std::isfinite(s[i]), qPrintable(QStringLiteral("Non-finite float at %1").arg(i)));
            }
            QCOMPARE(s[10], 1.5f);
            QCOMPARE(s[11], -1.75f);
            QCOMPARE(s[20], 0.0f);
            QCOMPARE(s[21], 0.0f);
            QCOMPARE(s[22], 0.0f);
            QCOMPARE(s[23], 0.25f);
        }

        // 3. 16-bit TPDF dither at non-48 kHz rates (44100 Hz and 96000 Hz).
        {
            nt::Timeline silentTl;
            silentTl.width = 64; silentTl.height = 48; silentTl.fps = 30; silentTl.durationMs = 250.0;
            for (const int targetRate : {44100, 96000}) {
                nt::exporting::Options opt;
                opt.format = "wav";
                opt.audioBitDepth = 16;
                opt.audioSampleRate = targetRate;
                opt.output = dir.filePath(QStringLiteral("dither16_%1.wav").arg(targetRate));
                const auto res = nt::exporting::exportTimeline(silentTl, opt, m_testCache.root());
                QVERIFY2(res.ok(), qPrintable(res.error));
                quint32 rate = 0; quint16 bits = 0; QByteArray pcm;
                QVERIFY(parseWav(opt.output, rate, bits, pcm));
                QCOMPARE(rate, quint32(targetRate));
                QCOMPARE(bits, quint16(16));
                const auto* s = reinterpret_cast<const int16_t*>(pcm.constData());
                const int count = int(pcm.size() / 2);
                int nonZero = 0;
                int maxAbs = 0;
                for (int i = 0; i < count; ++i) {
                    if (s[i] != 0) ++nonZero;
                    maxAbs = std::max(maxAbs, std::abs(int(s[i])));
                }
                QVERIFY2(nonZero > count / 10, qPrintable(QStringLiteral("Expected TPDF dither at %1 Hz, nonZero=%2").arg(targetRate).arg(nonZero)));
                QVERIFY2(maxAbs <= 1, qPrintable(QStringLiteral("TPDF dither on silence exceeded 1 LSB: %1").arg(maxAbs)));
            }
        }

        // 4. Non-WAV format/rate compatibility in ExportEngine: MP3 at 44.1 kHz succeeds;
        // MP3 at 96 kHz, WebM at 44.1 kHz, and MP4 at 192 kHz fail cleanly before render.
        {
            nt::exporting::Options mp3Ok;
            mp3Ok.format = "mp3";
            mp3Ok.audioSampleRate = 44100;
            mp3Ok.output = dir.filePath("ok_44k.mp3");
            const auto resOk = nt::exporting::exportTimeline(requireValue(parsed.timeline), mp3Ok, m_testCache.root());
            QVERIFY2(resOk.ok(), qPrintable(resOk.error));
            QCOMPARE(resOk.audioSampleRate, 44100);

            for (const auto& [fmt, badRate] : std::array<std::pair<const char*, int>, 3>{
                     {{"mp3", 96000}, {"webm", 44100}, {"mp4", 192000}}}) {
                nt::exporting::Options bad;
                bad.format = QString::fromLatin1(fmt);
                bad.audioSampleRate = badRate;
                bad.output = dir.filePath(QStringLiteral("bad_%1_%2.out").arg(fmt).arg(badRate));
                const auto resBad = nt::exporting::exportTimeline(requireValue(parsed.timeline), bad, m_testCache.root());
                QVERIFY2(!resBad.ok(), qPrintable(QStringLiteral("Expected failure for %1 at %2 Hz").arg(fmt).arg(badRate)));
            }
        }

        // 5. QML ExportVideoDialog UI selectors: visibility, per-format rate filtering, and coercion.
        {
            QQmlEngine engine;
            m_testCache.install(engine);
            QQmlComponent component(&engine);
            component.loadFromModule("NodeTool.Timeline", "ExportVideoDialog");
            std::unique_ptr<QObject> root(component.create());
            QVERIFY2(root, qPrintable(component.errorString()));
            root->setProperty("mp4Supported", true);

            QQuickWindow window;
            window.resize(800, 600);
            auto* rootItem = qobject_cast<QQuickItem*>(root.get());
            QVERIFY(rootItem != nullptr);
            rootItem->setParentItem(window.contentItem());
            rootItem->setSize(QSizeF(800, 600));
            auto* dialog = root->findChild<QObject*>("exportVideoDialog");
            auto* depthSelect = root->findChild<QObject*>("audioBitDepthSelect");
            auto* rateSelect = root->findChild<QObject*>("audioSampleRateSelect");
            QVERIFY(dialog != nullptr);
            QVERIFY(depthSelect != nullptr);
            QVERIFY(rateSelect != nullptr);
            QVERIFY(QMetaObject::invokeMethod(dialog, "open"));
            QCoreApplication::processEvents();

            // WAV: bit depth visible, all 5 rates available.
            root->setProperty("format", "wav");
            QCOMPARE(depthSelect->property("visible").toBool(), true);
            QCOMPARE(rateSelect->property("visible").toBool(), true);
            QCOMPARE(root->property("sampleRateOptions").value<QJSValue>().toVariant().toList().size(), 5);

            // Select 32-bit float and 192 kHz on WAV, verify confirmExport emits both.
            root->setProperty("audioBitDepth", 32);
            root->setProperty("audioSampleRate", 192000);
            QSignalSpy exported(root.get(), SIGNAL(exportRequested(QVariant)));
            QVERIFY(QMetaObject::invokeMethod(root.get(), "confirmExport"));
            QCOMPARE(exported.last().first().toMap().value("audioBitDepth").toInt(), 32);
            QCOMPARE(exported.last().first().toMap().value("audioSampleRate").toInt(), 192000);

            // Switch WAV (192 kHz) -> MP4: bit depth hidden, 4 rates, rate coerced to 48000.
            root->setProperty("format", "mp4");
            QCOMPARE(depthSelect->property("visible").toBool(), false);
            QCOMPARE(root->property("sampleRateOptions").value<QJSValue>().toVariant().toList().size(), 4);
            QCOMPARE(root->property("audioSampleRate").toInt(), 48000);

            // Select 96 kHz on MP4, switch -> MP3: 2 rates, coerced to 48000.
            root->setProperty("audioSampleRate", 96000);
            root->setProperty("format", "mp3");
            QCOMPARE(root->property("sampleRateOptions").value<QJSValue>().toVariant().toList().size(), 2);
            QCOMPARE(root->property("audioSampleRate").toInt(), 48000);

            // Select 44.1 kHz on MP3, switch -> WebM: 1 rate (48 kHz), coerced to 48000.
            root->setProperty("audioSampleRate", 44100);
            root->setProperty("format", "webm");
            QCOMPARE(root->property("sampleRateOptions").value<QJSValue>().toVariant().toList().size(), 1);
            QCOMPARE(root->property("audioSampleRate").toInt(), 48000);

            // PNG sequence: sample rate selector hidden.
            root->setProperty("format", "png_sequence");
            QCOMPARE(rateSelect->property("visible").toBool(), false);
        }

        // 6. ExportCli flag parsing, per-format rejection, and JSON output payload.
        {
            const auto wavCli = nt::exporting::parseExportCliArguments({
                "nodetool-timeline", "cut.json", "--export", "/tmp/out.wav",
                "--format", "wav", "--audio-bit-depth", "32", "--audio-sample-rate", "96000", "--json"
            });
            QVERIFY2(wavCli.ok, qPrintable(wavCli.error));
            QCOMPARE(wavCli.options.format, QString("wav"));
            QCOMPARE(wavCli.options.audioBitDepth, 32);
            QCOMPARE(wavCli.options.audioSampleRate, 96000);
            nt::exporting::Result fakeRes;
            fakeRes.samples = 24000;
            fakeRes.audioEncoder = "pcm_f32le";
            fakeRes.audioSampleRate = 96000;
            const auto json = nt::exporting::exportResultJson(wavCli.options, fakeRes);
            QCOMPARE(json.value("audioSampleRate").toInt(), 96000);
            QCOMPARE(json.value("audioBitDepth").toInt(), 32);
            QCOMPARE(json.value("audioEncoder").toString(), QString("pcm_f32le"));

            const auto badWebm = nt::exporting::parseExportCliArguments({
                "nodetool-timeline", "cut.json", "--export", "/tmp/out.webm",
                "--format", "webm", "--audio-sample-rate", "44100"
            });
            QVERIFY(!badWebm.ok);
            const auto badMp3 = nt::exporting::parseExportCliArguments({
                "nodetool-timeline", "cut.json", "--export", "/tmp/out.mp3",
                "--format", "mp3", "--audio-sample-rate", "96000"
            });
            QVERIFY(!badMp3.ok);
            const auto badMp4 = nt::exporting::parseExportCliArguments({
                "nodetool-timeline", "cut.json", "--export", "/tmp/out.mp4",
                "--format", "mp4", "--audio-sample-rate", "192000"
            });
            QVERIFY(!badMp4.ok);
            const auto okMp4 = nt::exporting::parseExportCliArguments({
                "nodetool-timeline", "cut.json", "--export", "/tmp/out.mp4",
                "--format", "mp4", "--audio-sample-rate", "44100"
            });
            QVERIFY2(okMp4.ok, qPrintable(okMp4.error));
            QCOMPARE(okMp4.options.audioSampleRate, 44100);
        }
    }

    void cancelOfflineMix() {
        nt::Timeline timeline;
        timeline.durationMs = 60000;
        int probes = 0;
        const auto output = nt::audio::renderOffline(timeline, 48000, 0, 60000, nullptr,
            [&] { return ++probes > 5; });
        QVERIFY(output.empty());
        QVERIFY(probes > 5);
    }

    void snapshotKeepsResolvedAssetMatte() {
        auto parsed = nt::parseTimelineJson(R"({"width":64,"height":64,"fps":30,"tracks":[{"id":"v","type":"video"}],
            "clips":[{"id":"c","trackId":"v","mediaType":"video","durationMs":1000,
                "generatedMatte":{"assetId":"cccccccccccccccccccccccccccccccc","unknown":42}}]})");
        QVERIFY(parsed.timeline);
        parsed.timeline->clips.front().generatedMattePath = "/cache/matte.mp4";
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        const auto before = model.documentJson();
        const auto snapshot = nt::exporting::exportSnapshot(model);
        const auto matte = snapshot["clips"].toArray().first().toObject()["generatedMatte"].toObject();
        QCOMPARE(matte["mediaPath"].toString(), QString("/cache/matte.mp4"));
        QCOMPARE(matte["unknown"].toInt(), 42);
        QCOMPARE(model.documentJson(), before);
    }

    void snapshotKeepsRelativeMatte() {
        const auto parsed = nt::parseTimelineJson(R"({"width":64,"height":64,"fps":30,"tracks":[{"id":"v","type":"video"}],
            "clips":[{"id":"c","trackId":"v","mediaType":"video","durationMs":1000,"mediaPath":"picture.mp4",
                "generatedMatte":{"mediaPath":"matte.mp4","status":"ready"}}]})", "/fixtures");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        const auto snapshot = nt::exporting::exportSnapshot(model);
        const auto json = snapshot["clips"].toArray().first().toObject();
        QCOMPARE(json["mediaPath"].toString(), QString("/fixtures/picture.mp4"));
        QCOMPARE(json["generatedMatte"].toObject()["mediaPath"].toString(), QString("/fixtures/matte.mp4"));
        const auto restored = nt::parseTimelineJson(QJsonDocument(snapshot).toJson(), "/temporary-export");
        QVERIFY(restored.timeline);
        nt::ActiveLayer layer;
        nt::effects::decorateMasks(layer, restored.timeline->clips.front());
        QVERIFY(layer.matte);
        const auto sources = nt::effects::generatedMatteSources(*layer.matte->layer, restored.timeline->clips.front());
        QCOMPARE(sources.size(), std::size_t{1});
        QCOMPARE(sources.front().mediaPath, std::string("/fixtures/matte.mp4"));
    }

    void dialog() {
        QQmlEngine engine;
        m_testCache.install(engine);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ExportVideoDialog");
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
        // Exercise each format independently of the host's installed encoders.
        root->setProperty("mp4Supported", true);
        const auto options = root->property("formatOptions").value<QJSValue>().toVariant().toList();
        const QStringList labels{"MP4 (H.264)", "WebM (VP9)", "PNG sequence (.zip)", "WAV audio (16-bit)", "MP3 audio (320 kbps)"};
        QCOMPARE(options.size(), labels.size());
        for (int i = 0; i < labels.size(); ++i) QCOMPARE(options[i].toMap().value("label").toString(), labels[i]);
        QSignalSpy exported(root.get(), SIGNAL(exportRequested(QVariant)));
        QVERIFY(exported.isValid());
        const QStringList formats{"mp4", "webm", "png_sequence", "wav", "mp3"};
        for (const auto& format : formats) {
            root->setProperty("format", format);
            root->setProperty("alpha", true);
            QCoreApplication::processEvents();
            QCOMPARE(root->property("alphaEnabled").toBool(), false);
            QCOMPARE(root->property("alpha").toBool(), false);
            QVERIFY(QMetaObject::invokeMethod(root.get(), "confirmExport"));
            QCOMPARE(exported.last().first().toMap().value("alpha").toBool(), false);
            QCOMPARE(exported.last().first().toMap().value("format").toString(), format);
        }
        root->setProperty("alphaAvailable", true);
        for (const auto& format : formats) {
            root->setProperty("format", format);
            root->setProperty("alpha", true);
            const bool enabled = format == "webm" || format == "png_sequence";
            QCOMPARE(root->property("alphaEnabled").toBool(), enabled);
            QCOMPARE(root->property("alpha").toBool(), enabled);
        }
        root->setProperty("mp4Supported", false);
        root->setProperty("format", "mp4");
        QCOMPARE(root->property("format").toString(), QString("webm"));
        QCOMPARE(root->property("alphaEnabled").toBool(), true);
        root->setProperty("alpha", true);
        QVERIFY(QMetaObject::invokeMethod(root.get(), "confirmExport"));
        QCOMPARE(exported.last().first().toMap().value("format").toString(), QString("webm"));
        QCOMPARE(exported.last().first().toMap().value("alpha").toBool(), true);
        auto* select = root->findChild<QObject*>("formatSelect");
        QVERIFY(select);
        const auto updated = root->property("formatOptions").value<QJSValue>().toVariant().toList();
        QCOMPARE(updated.first().toMap().value("disabled").toBool(), true);
    }
    void panelContext() {
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/av-sync.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        QQmlEngine engine;
        m_testCache.install(engine);
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "TimelineEditor");
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 800}, {"height", 600}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        const std::function<QQuickItem*(QQuickItem*)> findPanel = [&](QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == "exportPanel") return item;
            for (auto* child : item->childItems()) {
                if (auto* found = findPanel(child)) return found;
            }
            return nullptr;
        };
        auto* item = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(item);
        QTRY_VERIFY(findPanel(item));
        auto* controller = findPanel(item)->property("controller").value<ExportController*>();
        QVERIFY(controller);
        QCOMPARE(controller->timeline(), &model);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void controllerCancelBeforeFrames() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/audio-mix.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const QByteArray before = model.documentJson();
        ExportController controller(m_testCache.root());
        controller.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        controller.setTimeline(&model);
        QSignalSpy opened(&controller, &ExportController::openRequested);
        controller.open();
        QCOMPARE(opened.size(), 1);
        QSignalSpy finished(&controller, &ExportController::finished);
        controller.start(dir.filePath("cancelled.wav"), "wav", false);
        controller.cancel();
        QTRY_VERIFY_WITH_TIMEOUT(!finished.empty(), 15000);
        QVERIFY(!finished.first().first().toBool());
        QVERIFY2(controller.error().isEmpty(), qPrintable(controller.error()));
        QCOMPARE(QDir(dir.path()).entryList(QDir::NoDotAndDotDot | QDir::AllEntries | QDir::Hidden), QStringList{});
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void controllerCancel() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/av-sync.json"));
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        bool sent = false;
        ExportController controller(m_testCache.root());
        controller.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        controller.setTimeline(&model);
        QSignalSpy finished(&controller, &ExportController::finished);
        connect(&controller, &ExportController::progressChanged, &controller, [&] {
            if (controller.frame() >= 2 && !sent) { sent = true; controller.cancel(); }
        });
        controller.start(dir.filePath("cancelled.mp4"), "mp4", false);
        QTRY_VERIFY_WITH_TIMEOUT(!finished.empty(), 45000);
        QVERIFY2(sent, qPrintable(controller.error()));
        QVERIFY(!finished.first().first().toBool());
        QVERIFY(controller.error().isEmpty());
        QCOMPARE(QDir(dir.path()).entryList(QDir::NoDotAndDotDot | QDir::AllEntries | QDir::Hidden), QStringList{});
        QCOMPARE(model.undoStack()->count(), 0);
    }
};
int main(int argc, char** argv) {
    // These engine tests capture through QRhi in the otherwise software-only group.
    for (int i = 1; i < argc; ++i) {
        if (QByteArray(argv[i]) == "rangeResolution" || QByteArray(argv[i]) == "bitrateExport") {
            qunsetenv("QT_QUICK_BACKEND");
#ifdef Q_OS_LINUX
            // nttest supplies Xvfb. Qt's offscreen plugin cannot create Vulkan instances.
            if (!qEnvironmentVariableIsEmpty("DISPLAY")) qputenv("QT_QPA_PLATFORM", "xcb");
#endif
        }
    }
    QGuiApplication app(argc, argv);
    const auto args = app.arguments();
    if (args.contains("--export")) {
        const auto staging = args.value(args.indexOf("--staging-directory") + 1);
        QFile partial(QDir(staging).filePath("output"));
        if (!partial.open(QIODevice::WriteOnly) || partial.write("partial") != 7) { return 2; }
        partial.close();
        // Simulate a child that ignores cooperative cancellation.
        QThread::sleep(10);
        return 2;
    }
    ExportDialogTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_exportdialog.moc"
