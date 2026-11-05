// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "export/FrameExporter.h"
#include "assets/AssetMedia.h"
#include "../../tests/TestHttpServer.h"
#include <QScopeGuard>
#include "model/TimelineJson.h"
#include <QFile>
#include <QDir>
#include <memory>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QImageReader>
#include <QSignalSpy>
#include <QQmlComponent>
#include <QQmlEngine>
#include "playback/PlaybackClock.h"
#include <QElapsedTimer>
#include <QSemaphore>
#include <QtTest>
#include <atomic>
#include <memory>

class TestFrameExport : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    QString dirPath() const { return m_dir.path(); }
private slots:
    void captureAndSave_data() {
        QTest::addColumn<QString>("mode");
        for (const auto& mode : {"png", "jpeg", "unwritable", "second", "delete capture", "delete save"}) {
            QTest::newRow(mode) << QString(mode);
        }
    }
    void captureAndSave() {
        QFETCH(QString, mode);
        QTemporaryDir dir;
        TimelineModel model;
        const auto raw = QJsonDocument::fromJson(R"({"fps":30,"width":640,"height":360,"durationMs":1000,
            "tracks":[{"id":"v","type":"video"}],"clips":[{"id":"c","trackId":"v","mediaType":"video",
            "status":"generated","startMs":0,"durationMs":1000,"inPointMs":0}]})").object();
        auto input = raw;
        auto clips = input.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("mediaPath", QStringLiteral(NT_EXPORT_FIXTURES) + "/media/seek-360p30.mp4");
        clips[0] = clip; input.insert("clips", clips);
        auto parsed = nt::parseTimeline(input);
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        const auto before = model.documentJson();
        const int undo = model.undoStack()->count();
        qmlRegisterType<FrameExporter>("FrameExportTest", 1, 0, "FrameExporter");
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData("import FrameExportTest 1.0; FrameExporter {}", QUrl());
        std::unique_ptr<QObject> mounted(component.create());
        QVERIFY2(mounted, qPrintable(component.errorString()));
        auto* exporter = qobject_cast<FrameExporter*>(mounted.get());
        QVERIFY(exporter);
        exporter->setTimeline(&model);
        exporter->captureForTest()->setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        PlaybackClock clock;
        clock.seek(500);
        exporter->captureProgram(clock.time());
        QCOMPARE(exporter->state(), QString("capturing"));
        if (mode == "delete capture") { mounted.reset(); return; }
        clock.seek(800);
        if (mode == "second") exporter->captureProgram(600);
        QTRY_COMPARE_WITH_TIMEOUT(exporter->state(), QString("ready"), 60000);
        QCOMPARE(exporter->timeMs(), mode == "second" ? 600.0 : 500.0);
        QCOMPARE(exporter->frameSize(), QSize(640, 360));
        QVERIFY(!exporter->image().isNull());
        const auto url = exporter->fileUrl(dir.path(), "frame", mode == "jpeg" ? "jpeg" : "png");
        const auto output = mode == "unwritable" ? QUrl::fromLocalFile(dir.filePath("missing/frame.png")) : url;
        QSignalSpy saved(exporter, &FrameExporter::saved);
        exporter->saveToFile(output, mode == "jpeg" ? "jpeg" : "png");
        QCOMPARE(exporter->state(), QString("saving"));
        if (mode == "delete save") { mounted.reset(); return; }
        if (mode == "unwritable") {
            QTRY_COMPARE(exporter->state(), QString("ready"));
            QVERIFY(!exporter->error().isEmpty());
            QCOMPARE(saved.size(), 0);
        } else {
            QTRY_COMPARE(exporter->state(), QString("saved"));
            QCOMPARE(saved.size(), 1);
            QCOMPARE(exporter->savedPath(), output.toLocalFile());
            QCOMPARE(exporter->lastFolder(), dir.path());
            FrameExporter other;
            QCOMPARE(other.lastFolder(), dir.path());
            // Release the reader before replacing the file on Windows.
            {
                QImageReader reader(output.toLocalFile());
                QCOMPARE(reader.size(), QSize(640, 360));
                QCOMPARE(reader.format(), mode == "jpeg" ? QByteArray("jpeg") : QByteArray("png"));
                if (mode == "png") QCOMPARE(reader.read(), exporter->image().convertToFormat(QImage::Format_RGB32));
            }
            exporter->saveToFile(output, mode == "jpeg" ? "jpeg" : "png");
            QTRY_COMPARE(saved.size(), 2);
        }
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), undo);
    }
    void sourceAndRefusals() {
        FrameExporter exporter;
        exporter.captureForTest()->setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        const auto still = QDir(dirPath()).filePath("frameexport-source.png");
        QImage picture(23, 17, QImage::Format_RGB32); picture.fill(Qt::red);
        QVERIFY(picture.save(still));
        exporter.captureSource({{"mediaType", "image"}}, still, 9999);
        QCOMPARE(exporter.state(), QString("capturing"));
        QTRY_VERIFY_WITH_TIMEOUT(exporter.state() != "capturing", 60000);
        QCOMPARE(exporter.state(), QString("ready"));
        QCOMPARE(exporter.image().pixelColor(0, 0), QColor(Qt::red));
        exporter.captureSource({{"mediaType", "video"}}, QStringLiteral(NT_EXPORT_FIXTURES) + "/media/seek-360p30.mp4", 500);
        QTRY_COMPARE_WITH_TIMEOUT(exporter.state(), QString("ready"), 60000);
        QCOMPARE(exporter.frameSize(), QSize(640, 360));
        exporter.saveToLibrary("   ", "png");
        QCOMPARE(exporter.state(), QString("ready"));
        QCOMPARE(exporter.error(), QString("Enter a name for the frame."));
        exporter.captureSource({{"mediaType", "audio"}}, "unused.wav", 0);
        QCOMPARE(exporter.state(), QString("failed"));
        QCOMPARE(exporter.error(), QString("This asset has no picture to export."));
        exporter.captureProgram(0);
        QTRY_COMPARE(exporter.state(), QString("failed"));
        QVERIFY(!exporter.error().isEmpty());
        exporter.reset();
        QCOMPARE(exporter.state(), QString("idle"));
        QVERIFY(exporter.image().isNull());
    }
    void originalMediaNeverUsesProxy_data() {
        QTest::addColumn<bool>("available");
        QTest::newRow("original") << true;
        QTest::newRow("original fails") << false;
    }
    void originalMediaNeverUsesProxy() {
        QFETCH(bool, available);
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        const QByteArray bytes("original video bytes");
        http.setFile("/original.mp4", ServedFile(bytes));
        http.setFile("/proxy.mp4", ServedFile("proxy bytes"));
        http.setJson([&](const QByteArray&, const QUrl&) {
            const QJsonObject asset{{"id", "asset"}, {"get_url", available ? "/original.mp4" : "/missing.mp4"},
                {"size", bytes.size()}, {"content_type", "video/mp4"}, {"proxy_status", "ready"},
                {"proxy_url", "/proxy.mp4?v=proxy"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson();
        });
        QTemporaryDir dir;
        nt::assets::MediaProtection protection;
        nt::server::FetchResult result;
        auto thread = std::unique_ptr<QThread>(QThread::create([&] {
            nt::server::ServerClient client(http.base());
            result = nt::assets::resolveOriginalMedia(client, dir.path(), "asset", protection);
        }));
        const auto join = qScopeGuard([&] { thread->requestInterruption(); thread->wait(); });
        thread->start();
        QTRY_VERIFY_WITH_TIMEOUT(thread->isFinished(), 5000);
        thread->wait();
        QCOMPARE(result.ok(), available);
        if (available) {
            QVERIFY(result.path.contains("/original/"));
            QFile file(result.path); QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), bytes);
        } else { QVERIFY(!result.error.isEmpty()); }
        QCOMPARE(http.countRequests("GET", "/proxy.mp4"), 0);
        QCOMPARE(http.countRequests("GET", "/trpc/assets.get"), 1);
    }
    void cancellingDoesNotWaitForABlockedWorker() {
        // A Source capture can sit on another download's cache lock, which does not see an interruption.
        auto gate = std::make_shared<QSemaphore>();
        auto finished = std::make_shared<std::atomic_bool>(false);
        {
            FrameExporter exporter;
            exporter.startWorkerForTest([gate, finished] { gate->acquire(); finished->store(true); });
            QElapsedTimer timer;
            timer.start();
            exporter.reset();
            QVERIFY2(timer.elapsed() < 1000, "reset waited for the worker");
            QCOMPARE(exporter.state(), QStringLiteral("idle"));
        }
        gate->release();
        QTRY_VERIFY(finished->load());
    }
    void namesAndFileExists() {
        QTemporaryDir dir;
        FrameExporter exporter;
        const auto file = exporter.fileUrl(dir.path(), " a/b\\c:*?\"<>| ", "jpeg");
        QCOMPARE(file.toLocalFile(), dir.filePath("a_b_c_______.jpg"));
        QVERIFY(!exporter.fileExists(file));
        QFile output(file.toLocalFile());
        QVERIFY(output.open(QIODevice::WriteOnly));
        output.close();
        QVERIFY(exporter.fileExists(file));
    }
};
QTEST_MAIN(TestFrameExport)
#include "tst_frameexport.moc"
