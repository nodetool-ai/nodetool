#include "assets/librarypreview/PreviewDuration.h"
#include "aiassist/CandidatePreview.h"
#include "model/TimelineJson.h"
#include "server/ServerSource.h"
#include "../../../tests/TestHttpServer.h"
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUrlQuery>
#include <QImage>
#include <QJsonDocument>
#include <QDataStream>
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

class TestLibraryPreview : public QObject {
    Q_OBJECT
private slots:
    void durationReadsAudioWithoutADevice() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto path = directory.filePath("tone.wav");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        QDataStream stream(&file);
        stream.setByteOrder(QDataStream::LittleEndian);
        stream.writeRawData("RIFF", 4); stream << quint32(36 + 96000);
        stream.writeRawData("WAVEfmt ", 8); stream << quint32(16) << quint16(1) << quint16(1)
            << quint32(48000) << quint32(96000) << quint16(2) << quint16(16);
        stream.writeRawData("data", 4); stream << quint32(96000);
        const QByteArray silence(96000, '\0');
        QCOMPARE(stream.writeRawData(silence.constData(), silence.size()), silence.size());
        file.close();
        QCOMPARE(nt::assets::previewDurationMs(path.toStdString()), 1000.0);
        QVERIFY(nt::assets::previewMediaFacts(path.toStdString(), "audio", {}).readable);
        QVERIFY(!nt::assets::previewMediaFacts(path.toStdString(), "video", {}).readable);
        QVERIFY(!nt::assets::previewMediaFacts(path.toStdString(), "image", {}).readable);
        QCOMPARE(nt::assets::previewDurationMs(path.toStdString(), [] { return true; }), 0.0);
        QCOMPARE(nt::assets::previewDurationMs(directory.filePath("missing").toStdString()), 0.0);
    }
    void dimensionsComeFromMediaBeforeMetadata_data() {
        QTest::addColumn<QSize>("size");
        QTest::newRow("landscape") << QSize(120, 60);
        QTest::newRow("portrait") << QSize(60, 120);
    }
    void dimensionsComeFromMediaBeforeMetadata() {
        QFETCH(QSize, size);
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto path = directory.filePath("image.png");
        QImage image(size, QImage::Format_RGB32);
        image.fill(Qt::red);
        QVERIFY(image.save(path));
        const QJsonObject wrongMetadata{{"metadata", QJsonObject{{"width", 1920}, {"height", 1080}}}};
        QVERIFY(nt::assets::previewMediaFacts(path.toStdString(), "image", wrongMetadata).readable);
        QCOMPARE(nt::assets::previewMediaFacts(path.toStdString(), "image", wrongMetadata).size, size);
        QCOMPARE(nt::assets::previewMediaFacts(path.toStdString(), "image", {}).size, size);
        const auto missing = directory.filePath("missing.png").toStdString();
        const QJsonObject metadata{{"metadata", QJsonObject{{"width", size.width()}, {"height", size.height()}}}};
        QCOMPARE(nt::assets::previewMediaFacts(missing, "image", metadata).size, size);
        QCOMPARE(nt::assets::previewMediaFacts(missing, "image", {}).size, QSize(1920, 1080));
        const QJsonObject invalid{{"metadata", QJsonObject{{"width", -1}, {"height", 0}}}};
        QCOMPARE(nt::assets::previewMediaFacts(missing, "image", invalid).size, QSize(1920, 1080));
    }
    void closeAndRejectedLoadsLeaveTheCutAlone() {
        TimelineModel cut;
        const auto parsed = nt::parseTimelineJson(R"({"id":"cut","fps":30,"width":640,"height":360,"durationMs":4000,"tracks":[],"clips":[]})");
        QVERIFY(parsed.timeline);
        cut.setTimeline(*parsed.timeline);
        const auto before = cut.snapshot();
        const auto generation = cut.documentGeneration();
        const auto undoCount = cut.undoStack()->count();
        CandidatePreview preview;
        preview.setTimeline(&cut);
        QVERIFY(preview.previewTimeline() != &cut);
        QCOMPARE(preview.audioMode(), QString("none"));
        QVERIFY(!preview.preview("", "video", 0));
        QVERIFY(!preview.preview("asset", "folder", 10));
        preview.togglePlay();
        QVERIFY(!preview.previewClock()->playing());
        preview.close();
        QVERIFY(!preview.ready());
        QVERIFY(!preview.busy());
        QCOMPARE(preview.previewClock()->time(), 0.0);
        QCOMPARE(preview.previewClock()->durationMs(), 0.0);
        QCOMPARE(cut.snapshot(), before);
        QCOMPARE(cut.documentGeneration(), generation);
        QCOMPARE(cut.undoStack()->count(), undoCount);
        preview.setAudioMode("null");
        QCOMPARE(preview.audioMode(), QString("null"));
        preview.setAudioMode("invalid");
        QCOMPARE(preview.audioMode(), QString("null"));
    }
    void corruptImageMetadataCannotMakeMediaReadable() {
        TestHttpServer server;
        QVERIFY(server.base().port() != 7777);
        const QByteArray invalid("This is not an image.");
        server.setFile("/corrupt.png", ServedFile{invalid});
        const QString assetId(32, 'a');
        const QJsonObject metadata{{"width", 120}, {"height", 60}};
        server.setJson([&](const QByteArray& path, const QUrl&) {
            if (path != "/trpc/assets.get") { return QByteArray(); }
            const QJsonObject asset{{"id", assetId}, {"get_url", "/corrupt.png"}, {"size", invalid.size()},
                {"content_type", "image/png"}, {"metadata", metadata}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        QTemporaryDir cache;
        const auto filePath = cache.filePath("invalid.png");
        QFile invalidFile(filePath);
        QVERIFY(invalidFile.open(QIODevice::WriteOnly));
        QCOMPARE(invalidFile.write(invalid), invalid.size());
        invalidFile.close();
        const auto facts = nt::assets::previewMediaFacts(filePath.toStdString(), "image", QJsonObject{{"metadata", metadata}});
        QVERIFY(!facts.readable);
        QCOMPARE(facts.size, QSize(120, 60));
        QByteArray executable("preview-test"), serverOption("--server"), timelineOption("--timeline"), timelineId("test"), cacheOption("--cache-dir");
        auto url = server.base().toString().toUtf8();
        auto cachePath = cache.path().toUtf8();
        char* arguments[]{executable.data(), serverOption.data(), url.data(), timelineOption.data(), timelineId.data(), cacheOption.data(), cachePath.data(), nullptr};
        int count = 7;
        QCOMPARE(nt::server::takeServerArgs(count, arguments), 0);
        TimelineModel cut;
        const auto before = cut.snapshot();
        CandidatePreview preview;
        preview.setTimeline(&cut);
        QVERIFY(preview.preview(assetId, "image", 5000));
        QTRY_VERIFY(!preview.busy());
        QVERIFY(!preview.ready());
        QVERIFY(!preview.error().isEmpty());
        QCOMPARE(cut.snapshot(), before);
        QCOMPARE(cut.undoStack()->count(), 0);
    }
    void rapidSelectionCoalescesAndCloseDiscardsPending() {
        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost, 0));
        QVERIFY(server.serverPort() != 7777);
        QStringList requested;
        int active = 0;
        int maximum = 0;
        connect(&server, &QTcpServer::newConnection, this, [&] {
            while (auto* socket = server.nextPendingConnection()) {
                connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
                connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
                    auto buffer = socket->property("request").toByteArray() + socket->readAll();
                    socket->setProperty("request", buffer);
                    if (!buffer.contains("\r\n\r\n") || socket->property("handled").toBool()) { return; }
                    socket->setProperty("handled", true);
                    const auto target = buffer.split(' ').value(1);
                    const QUrl url(QString::fromUtf8(target));
                    const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
                    requested.append(input.value("id").toString());
                    maximum = std::max(maximum, ++active);
                    QTimer::singleShot(150, socket, [&, socket] {
                        --active;
                        const QByteArray body = R"({"error":{"message":"Not found","code":-32004,"data":{"httpStatus":404}}})";
                        socket->write("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\n\r\n" + body);
                        socket->disconnectFromHost();
                    });
                });
            }
        });
        QTemporaryDir cache;
        QByteArray executable("preview-test"), serverOption("--server"), timelineOption("--timeline"), timelineId("test"), cacheOption("--cache-dir");
        auto url = QString("http://127.0.0.1:%1").arg(server.serverPort()).toUtf8();
        auto cachePath = cache.path().toUtf8();
        char* arguments[]{executable.data(), serverOption.data(), url.data(), timelineOption.data(), timelineId.data(), cacheOption.data(), cachePath.data(), nullptr};
        int count = 7;
        QCOMPARE(nt::server::takeServerArgs(count, arguments), 0);
        TimelineModel cut;
        CandidatePreview preview;
        preview.setTimeline(&cut);
        QVERIFY(preview.preview("first", "image", 0));
        QTRY_COMPARE(requested.size(), 1);
        for (int i = 0; i < 100; ++i) {
            QVERIFY(preview.preview(QString::number(i), "image", 0));
        }
        QVERIFY(preview.busy());
        QTRY_COMPARE(requested.size(), 2);
        QCOMPARE(requested.last(), QString("99"));
        QTRY_VERIFY(!preview.busy());
        QCOMPARE(maximum, 1);
        QVERIFY(!preview.ready());
        QVERIFY(!preview.error().isEmpty());
        QVERIFY(preview.preview("closing", "image", 0));
        QTRY_COMPARE(requested.size(), 3);
        QVERIFY(preview.preview("discarded", "image", 0));
        preview.close();
        QVERIFY(!preview.busy());
        QTest::qWait(250);
        QCOMPARE(requested.size(), 3);
        QVERIFY(!preview.ready());
        QVERIFY(preview.error().isEmpty());
    }

};
QTEST_GUILESS_MAIN(TestLibraryPreview)
#include "tst_librarypreview.moc"
