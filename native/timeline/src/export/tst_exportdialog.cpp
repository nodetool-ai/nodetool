#include "export/ExportController.h"
#include "export/ExportEngine.h"
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
#include <QGuiApplication>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QFile>
#include <QQuickItem>
#include <functional>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QDir>
#include <QtTest>
#include <memory>

class ExportDialogTest : public QObject {
    Q_OBJECT
private slots:
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
            result = nt::exporting::exportTimeline(timeline, options, stop.get_token());
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
            ExportController controller;
            controller.setExecutable(QCoreApplication::applicationFilePath());
            controller.setTimeline(&model);
            controller.start(dir.filePath("never.wav"), "wav");
            QTRY_VERIFY(!QDir(dir.path()).entryList({".nt-export-*"}, QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot).empty());
            const auto staging = QDir(dir.path()).entryList({".nt-export-*"}, QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot).front();
            QTRY_VERIFY(QFileInfo::exists(QDir(dir.path()).filePath(staging + "/output")));
            elapsed.start();
        }
        QVERIFY(elapsed.elapsed() < 7000);
        QCOMPARE(QDir(dir.path()).entryList(QDir::AllEntries | QDir::Hidden | QDir::NoDotAndDotDot), QStringList{});
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
        QQmlComponent component(&engine);
        component.loadFromModule("NodeTool.Timeline", "ExportVideoDialog");
        std::unique_ptr<QObject> root(component.create());
        QVERIFY2(root, qPrintable(component.errorString()));
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
        ExportController controller;
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
        ExportController controller;
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
