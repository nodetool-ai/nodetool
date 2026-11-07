#include "model/TimelineJson.h"
#include "server/AutosaveController.h"
#include "server/FieldAudit.h"
#include "TestHttpServer.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QProcessEnvironment>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QtTest>

class TestColorSpaceVersion : public QObject {
    Q_OBJECT
private slots:
    void versions_data() {
        QTest::addColumn<QJsonValue>("version");
        QTest::addColumn<bool>("supported");
        QFile fixtures(QStringLiteral(NT_COLOR_VERSION_FIXTURES));
        QVERIFY2(fixtures.open(QIODevice::ReadOnly), qPrintable(fixtures.errorString()));
        QJsonParseError error;
        const auto document = QJsonDocument::fromJson(fixtures.readAll(), &error);
        QCOMPARE(error.error, QJsonParseError::NoError);
        QVERIFY(document.isArray());
        QVERIFY(!document.array().isEmpty());
        for (const auto& entry : document.array()) {
            const auto fixture = entry.toObject();
            const auto version = fixture.value("document").toObject().value("workingColorSpaceVersion");
            const auto name = fixture.value("name").toString().toUtf8();
            QVERIFY(!name.isEmpty());
            QTest::newRow(name.constData()) << version << (version.isUndefined() || version == QJsonValue(1));
        }
        QTest::newRow("zero") << QJsonValue(0) << false;
        QTest::newRow("negative") << QJsonValue(-1) << false;
        QTest::newRow("fraction") << QJsonValue(1.5) << false;
        QTest::newRow("string") << QJsonValue(QStringLiteral("1")) << false;
        QTest::newRow("null") << QJsonValue(QJsonValue::Null) << false;
        QTest::newRow("boolean") << QJsonValue(true) << false;
        QTest::newRow("array") << QJsonValue(QJsonArray{1}) << false;
        QTest::newRow("object") << QJsonValue(QJsonObject{{"version", 1}}) << false;
    }
    void versions() {
        QFETCH(QJsonValue, version);
        QFETCH(bool, supported);
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QImage source(16, 16, QImage::Format_RGB32);
        source.fill(Qt::red);
        const auto media = dir.filePath("source.png");
        QVERIFY(source.save(media));
        const QJsonArray tracks{QJsonObject{{"id", "v"}, {"type", "video"}}};
        const QJsonArray clips{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "image"},
                                           {"mediaPath", media}, {"startMs", 0}, {"durationMs", 34},
                                           {"width", 16}, {"height", 16}}};
        QJsonObject raw{{"id", "seq"}, {"fps", 30}, {"width", 16}, {"height", 16},
                        {"durationMs", 34}, {"tracks", tracks}, {"clips", clips}};
        if (!version.isUndefined()) { raw.insert("workingColorSpaceVersion", version); }
        const auto bytes = QJsonDocument(raw).toJson();
        const auto parsed = nt::parseTimelineJson(bytes);
        QCOMPARE(parsed.timeline.has_value(), supported);
        QCOMPARE(parsed.unsupportedColorSpaceVersion, !supported);
        if (supported) {
            QCOMPARE(parsed.timeline->raw, raw);
            QVERIFY(!nt::server::auditTimelineFields(raw).value("fields").toObject()
                         .contains("sequence.workingColorSpaceVersion"));
        } else {
            QVERIFY(parsed.error.contains("supports versions up to 1"));
        }

        // Exercise the real autosave request with the unchanged source JSON,
        // including values the editor refuses to load. Saving must not repair it.
        TestHttpServer http;
        QJsonObject sent;
        http.setPost([&sent](const QByteArray&, const QByteArray& body) {
            sent = QJsonDocument::fromJson(body).object().value("document").toObject();
            return QByteArray(R"({"result":{"data":{"id":"seq","updatedAt":"u1","stripped":[]}}})");
        });
        QUndoStack undo;
        auto draft = raw;
        nt::server::SaveTarget target{http.base(), QString(), "seq", dir.path(), QString()};
        nt::server::AutosaveController save(target, &undo, [&draft] { return draft; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(true);
        draft.insert("markers", QJsonArray{QJsonObject{{"id", "edit"}, {"timeMs", 0}}});
        undo.push(new QUndoCommand("edit"));
        QTRY_VERIFY_WITH_TIMEOUT(!sent.isEmpty(), 3000);
        QTRY_VERIFY_WITH_TIMEOUT(!save.dirty(), 3000);
        QCOMPARE(sent.value("workingColorSpaceVersion"), version);
        QCOMPARE(sent.contains("workingColorSpaceVersion"), !version.isUndefined());
        auto roundTrip = raw;
        for (auto it = sent.begin(); it != sent.end(); ++it) { roundTrip.insert(it.key(), it.value()); }
        const auto reparsed = nt::parseTimeline(roundTrip);
        QCOMPARE(reparsed.timeline.has_value(), supported);
        if (supported) {
            QCOMPARE(reparsed.timeline->raw.value("workingColorSpaceVersion"), version);
            QCOMPARE(reparsed.timeline->raw.contains("workingColorSpaceVersion"), !version.isUndefined());
        }

        const auto path = dir.filePath("input.json");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        QCOMPARE(file.write(bytes), bytes.size());
        file.close();
        for (const QString& route : {QStringLiteral("editor"), QStringLiteral("export"),
                                     QStringLiteral("stills"), QStringLiteral("frame-server"),
                                     QStringLiteral("frame-server-eof")}) {
            if (supported && (route == "frame-server-eof" || route == "editor")) { continue; }
            QProcess process;
            auto env = QProcessEnvironment::systemEnvironment();
            env.insert("XDG_CONFIG_HOME", dir.filePath("config"));
            process.setProcessEnvironment(env);
            QStringList args;
            if (route == "export") { args = {"--export", dir.filePath("out.zip"), "--format", "png_sequence", path}; }
            else if (route == "stills") { args = {"--stills", dir.filePath("stills"), "--still-frames", "0", path}; }
            else if (route.startsWith("frame-server")) { args = {"--frame-server"}; }
            else { args = {"--screenshot", dir.filePath("editor.png"), path}; }
            QByteArray response;
            process.start(QStringLiteral(NT_TIMELINE_BINARY), args);
            QVERIFY(process.waitForStarted());
            if (route.startsWith("frame-server")) {
                const QJsonObject request{{"id", 1}, {"kind", "sequence"}, {"snapshot", path},
                                          {"timeMs", 0}, {"dir", dir.path()}};
                process.write(QJsonDocument(request).toJson(QJsonDocument::Compact) + '\n');
                // Exercise both a persistent client and immediate EOF.
                if (supported) {
                    while (!response.contains('\n')) {
                        QVERIFY(process.waitForReadyRead(30000));
                        response += process.readAllStandardOutput();
                    }
                    const auto reply = QJsonDocument::fromJson(response).object();
                    QVERIFY2(reply.contains("file"), response.constData());
                    QVERIFY(QFileInfo::exists(reply.value("file").toString()));
                    process.closeWriteChannel();
                } else if (route == "frame-server-eof") { process.closeWriteChannel(); }
            }
            const bool finished = process.waitForFinished(30000);
            const auto diagnostics = process.readAllStandardError();
            QVERIFY2(finished, qPrintable(route + ": " + QString::fromUtf8(diagnostics)));
            QVERIFY2(process.exitStatus() == QProcess::NormalExit && process.exitCode() == (supported || route == "editor" ? 0 : 1),
                     qPrintable(route + ": exit " + QString::number(process.exitCode()) + ": " + QString::fromUtf8(diagnostics.right(4000))));
            const auto output = process.readAllStandardOutput();
            const auto report = diagnostics + output;
            if (supported) {
                if (route == "export") { QVERIFY(QFileInfo::exists(dir.filePath("out.zip"))); }
                if (route == "stills") { QVERIFY(QFileInfo::exists(dir.filePath("stills/frame_000000.png"))); }
            } else {
                if (route.startsWith("frame-server")) {
                    QCOMPARE(QJsonDocument::fromJson(output).object().value("error").toString(), parsed.error);
                } else if (route == "editor") {
                    const QImage reportImage(dir.filePath("editor.png"));
                    QVERIFY(!reportImage.isNull());
                    // The source is solid red. The report must contain text but no media pixels.
                    int textPixels = 0;
                    for (int y = 0; y < reportImage.height(); ++y) {
                        for (int x = 0; x < reportImage.width(); ++x) {
                            const auto pixel = reportImage.pixelColor(x, y);
                            QVERIFY(!(pixel.red() > 200 && pixel.green() < 40 && pixel.blue() < 40));
                            if (pixel.red() > 150 && pixel.green() > 150 && pixel.blue() > 150) { ++textPixels; }
                        }
                    }
                    QVERIFY(textPixels > 100);
                    const auto message = QStringLiteral("This timeline uses color version %1. This version of NodeTool supports up to version 1. Update NodeTool to edit or export it.")
                                             .arg(parsed.unsupportedColorSpaceVersionText);
                    QVERIFY2(report.contains(message.toUtf8()), report.constData());
                    // Without a capture request the launcher window stays open.
                    process.start(QStringLiteral(NT_TIMELINE_BINARY), {path});
                    QVERIFY(process.waitForStarted());
                    QVERIFY(!process.waitForFinished(1500));
                    QCOMPARE(process.state(), QProcess::Running);
                    process.terminate();
                    QVERIFY(process.waitForFinished(10000));
                } else {
                    QVERIFY2(report.contains(parsed.error.toUtf8()), report.constData());
                }
                QVERIFY(!QFileInfo::exists(dir.filePath("out.zip")));
                QVERIFY(!QFileInfo::exists(dir.filePath("stills")));
                if (route != "editor") { QVERIFY(!QFileInfo::exists(dir.filePath("editor.png"))); }
                else { QVERIFY(QFile::remove(dir.filePath("editor.png"))); }
                QVERIFY(QDir(dir.path()).entryList({"*.rgba"}, QDir::Files).isEmpty());
            }
            QVERIFY(file.open(QIODevice::ReadOnly));
            QCOMPARE(file.readAll(), bytes);
            file.close();
        }
        if (!supported) {
            http.setJson([&raw](const QByteArray&, const QUrl&) {
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", raw}}}}).toJson();
            });
            http.clearRequests();
            QProcess process;
            auto env = QProcessEnvironment::systemEnvironment();
            env.insert("XDG_CONFIG_HOME", dir.filePath("server-config"));
            process.setProcessEnvironment(env);
            process.start(QStringLiteral(NT_TIMELINE_BINARY),
                          {"--server", http.base().toString(), "--timeline", "seq",
                           "--cache-dir", dir.filePath("cache"), "--screenshot", dir.filePath("server-report.png")});
            QVERIFY(process.waitForStarted());
            QTRY_VERIFY_WITH_TIMEOUT(process.state() == QProcess::NotRunning, 15000);
            QCOMPARE(process.exitCode(), 0);
            const auto diagnostics = process.readAllStandardError();
            QVERIFY2(diagnostics.contains("Update NodeTool to edit or export it."), diagnostics.constData());
            QVERIFY(QFileInfo::exists(dir.filePath("server-report.png")));
            // Opening the report may fetch the document, but cannot fetch media or save it.
            QVERIFY(http.countRequests("GET", "/trpc/timeline.get") > 0);
            QCOMPARE(http.countRequests("POST", "/"), 0);
            QCOMPARE(http.countRequests("GET", "/trpc/assets."), 0);
        }

    }
};
QTEST_GUILESS_MAIN(TestColorSpaceVersion)
#include "tst_colorspaceversion.moc"
