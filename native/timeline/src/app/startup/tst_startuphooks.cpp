#include "app/startup/DecodeDefault.h"
#include "app/startup/LocalDocumentSaver.h"
#include "model/TimelineJson.h"
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QJsonDocument>
#include <QtTest>

class TestStartupHooks : public QObject {
    Q_OBJECT
private slots:
    void localFileFollowsEdits() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("timeline.json");
        const QByteArray initial = R"({"name":"local","fps":30,"width":100,"height":100,"tracks":[],"clips":[],"unknown":{"keep":true}})";
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); QCOMPARE(file.write(initial), initial.size()); }
        TimelineModel model;
        auto parsed = nt::loadTimelineFile(path);
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        nt::app::LocalDocumentSaver saver(model, path, 1);
        QVERIFY(saver.flush());
        { QFile file(path); QVERIFY(file.open(QIODevice::ReadOnly)); QCOMPARE(file.readAll(), initial); }
        model.addMarker(12, "edit");
        QTRY_VERIFY_WITH_TIMEOUT(nt::loadTimelineFile(path).timeline->raw == model.timeline().raw, 2000);
        auto saved = nt::loadTimelineFile(path);
        QVERIFY(saved.timeline);
        QVERIFY2(saved.timeline->raw == model.timeline().raw, "local file must contain the edited document");
        model.undoStack()->undo();
        QVERIFY(saver.flush());
        QCOMPARE(nt::loadTimelineFile(path).timeline->raw, model.timeline().raw);
        model.undoStack()->redo();
        QVERIFY(saver.flush());
        QCOMPARE(nt::loadTimelineFile(path).timeline->raw, model.timeline().raw);
    }
    void settlementIsSavedAndPendingEditFlushesAtDestruction() {
        QTemporaryDir dir;
        const auto path = dir.filePath("timeline.json");
        const QByteArray initial = R"({"name":"local","fps":30,"width":100,"height":100,"tracks":[{"id":"v","type":"video"}],"clips":[]})";
        { QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); QCOMPARE(file.write(initial), initial.size()); }
        TimelineModel model;
        model.setTimeline(*nt::loadTimelineFile(path).timeline);
        {
            nt::app::LocalDocumentSaver saver(model, path, 10000);
            auto clip = QJsonObject{{"id","drop"},{"trackId","v"},{"mediaType","video"},{"startMs",0},{"durationMs",1000}};
            const auto token = model.commitEdit("drop", {}, QJsonArray{clip});
            QVERIFY(saver.flush());
            auto settled = model.timeline().raw;
            settled.insert("name", "settled");
            QVERIFY(model.settleCommand(token, settled));
            QVERIFY(saver.flush());
            QCOMPARE(nt::loadTimelineFile(path).timeline->raw, settled);
            model.addMarker(25, "pending at quit");
        }
        QCOMPARE(nt::loadTimelineFile(path).timeline->raw, model.timeline().raw);
    }
    // A project folder holds `Timelines/<name>.timeline.json`: the sequence
    // settings beside `document`, with no name (the file name is the name).
    void projectTimelineFileKeepsItsEnvelope() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        QVERIFY(QDir(dir.path()).mkpath("Timelines"));
        const auto path = dir.filePath("Timelines/Opening cut.timeline.json");
        const QJsonObject document{
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"name", "V1"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "shape"},
                                             {"startMs", 0}, {"durationMs", 1500}}}},
            {"markers", QJsonArray{}},
            {"unknown", QJsonObject{{"keep", true}}}};
        const QJsonObject envelope{{"format", "nodetool.timeline"}, {"version", 1}, {"id", "tl-file"},
                                   {"fps", 25}, {"width", 640}, {"height", 360}, {"duration_ms", 1500},
                                   {"document", document}};
        {
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            file.write(QJsonDocument(envelope).toJson());
        }
        auto parsed = nt::loadTimelineFile(path);
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        QCOMPARE(parsed.timeline->tracks.size(), size_t(1));
        QCOMPARE(parsed.timeline->clips.size(), size_t(1));
        QCOMPARE(parsed.timeline->fps, 25.0);
        QCOMPARE(parsed.timeline->width, 640);
        QCOMPARE(parsed.timeline->durationMs, 1500.0);
        QCOMPARE(QString::fromStdString(parsed.timeline->id), QString("tl-file"));
        QCOMPARE(QString::fromStdString(parsed.timeline->name), QString("Opening cut"));
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        nt::app::LocalDocumentSaver saver(model, path, 1);
        model.addMarker(12, "edit");
        QVERIFY(saver.flush());
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto saved = QJsonDocument::fromJson(file.readAll()).object();
        QCOMPARE(saved.value("format").toString(), QString("nodetool.timeline"));
        QCOMPARE(saved.value("version").toInt(), 1);
        QCOMPARE(saved.value("id").toString(), QString("tl-file"));
        QCOMPARE(saved.value("fps").toDouble(), 25.0);
        QCOMPARE(saved.value("width").toInt(), 640);
        QCOMPARE(saved.value("height").toInt(), 360);
        QVERIFY(saved.contains("duration_ms"));
        QVERIFY2(!saved.contains("name"), "the file name is the name");
        for (const char* key : {"tracks", "clips", "markers", "durationMs"}) {
            QVERIFY2(!saved.contains(key), key);
        }
        const auto savedDocument = saved.value("document").toObject();
        QCOMPARE(savedDocument.value("tracks"), document.value("tracks"));
        QCOMPARE(savedDocument.value("clips"), document.value("clips"));
        QCOMPARE(savedDocument.value("unknown"), document.value("unknown"));
        QCOMPARE(savedDocument.value("markers").toArray().size(), 1);
        for (const char* key : {"id", "name", "fps", "width", "height", "durationMs"}) {
            QVERIFY2(!savedDocument.contains(key), key);
        }
        // The saved file opens to the edited document.
        const auto reopened = nt::loadTimelineFile(path);
        QVERIFY(reopened.timeline);
        QCOMPARE(reopened.timeline->raw, model.timeline().raw);
    }
    void unknownTimelineFileVersionDoesNotOpen() {
        QTemporaryDir dir;
        const auto path = dir.filePath("later.timeline.json");
        {
            QFile file(path);
            QVERIFY(file.open(QIODevice::WriteOnly));
            file.write(R"({"format":"nodetool.timeline","version":2,"id":"x","fps":30,"width":100,"height":100,"document":{"tracks":[],"clips":[],"markers":[]}})");
        }
        const auto parsed = nt::loadTimelineFile(path);
        QVERIFY(!parsed.timeline);
        QVERIFY2(parsed.error.contains("version 2"), qPrintable(parsed.error));
    }
    void failedLocalSaveDoesNotReportSuccessfulExit() {
        QTemporaryDir dir;
        TimelineModel model;
        nt::app::LocalDocumentSaver saver(model, dir.filePath("missing/timeline.json"));
        model.addMarker(0, "unsaved");
        QSignalSpy failures(&saver, &nt::app::LocalDocumentSaver::saveFailed);
        QCOMPARE(nt::app::exitCodeAfterLocalSave(&saver, 0), 4);
        QVERIFY(!failures.isEmpty());
        QCOMPARE(nt::app::exitCodeAfterLocalSave(nullptr, 7), 7);
    }
    void cleanup() { nt::app::clearDecodeModeProvider(); }
    void decodePrecedence() {
        QCOMPARE(nt::app::resolveDecodeMode(), QStringLiteral("sw"));
        nt::app::registerDecodeModeProvider(QStringLiteral("Preferences"), [] { return QStringLiteral("auto"); });
        QCOMPARE(nt::app::resolveDecodeMode(QStringLiteral("sw")), QStringLiteral("sw"));
        QCOMPARE(nt::app::resolveDecodeMode(QStringLiteral("sw"), QStringLiteral("hw")), QStringLiteral("hw"));
        QCOMPARE(nt::app::resolveDecodeMode(), QStringLiteral("auto"));
    }
    void helpNamesProvider() {
        nt::app::registerDecodeModeProvider(QStringLiteral("Preferences"), [] { return QStringLiteral("auto"); });
        QVERIFY2(nt::app::decodeModeHelp().contains("Preferences"), "decode help must name the registered provider");
    }
};
QTEST_GUILESS_MAIN(TestStartupHooks)
#include "tst_startuphooks.moc"
