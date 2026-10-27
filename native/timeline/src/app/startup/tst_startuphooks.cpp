#include "app/startup/DecodeDefault.h"
#include "app/startup/LocalDocumentSaver.h"
#include "model/TimelineJson.h"
#include <QFile>
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
        QTest::qWait(20);
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
