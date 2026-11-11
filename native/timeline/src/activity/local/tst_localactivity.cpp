#include "LocalActivityStore.h"
#include "export/ExportController.h"
#include <QCoreApplication>
#include <QTextStream>
#include <QTimer>
#include <QFile>
#include <QDir>
#include <QTemporaryDir>
#include <QtTest>

class CancelTarget : public QObject {
    Q_OBJECT
public:
    int calls = 0;
    Q_INVOKABLE void cancel() { ++calls; }
};
class LocalActivityTest : public QObject {
    Q_OBJECT
    QTemporaryDir m_history;
private slots:
    void initTestCase() {
        QVERIFY(m_history.isValid());
        qputenv("NODETOOL_TIMELINE_ACTIVITY_DIR", m_history.path().toUtf8());
    }
    void exportControllerReportsActualProcessResults_data() {
        QTest::addColumn<QString>("mode");
        QTest::addColumn<QString>("expected");
        QTest::newRow("success") << QString("success") << QString("completed");
        QTest::newRow("failure") << QString("failure") << QString("failed");
        QTest::newRow("cancellation") << QString("cancellation") << QString("cancelled");
    }
    void exportControllerReportsActualProcessResults() {
        QFETCH(QString, mode);
        QFETCH(QString, expected);
        QTemporaryDir output;
        nt::Timeline timeline;
        timeline.id = mode.toStdString();
        timeline.name = "Activity test";
        timeline.raw = {{"id", mode}, {"name", "Activity test"}};
        TimelineModel model;
        model.setTimeline(std::move(timeline));
        const auto before = model.documentJson();
        ExportController controller;
        controller.setTimeline(&model);
        controller.setExecutable(QCoreApplication::applicationFilePath());
        QSignalSpy finished(&controller, &ExportController::finished);
        controller.start(output.filePath(mode + ".wav"), "wav");
        const auto scope = nt::activity::localScope(model.timeline().raw);
        auto& store = nt::activity::LocalActivityStore::instance();
        QTRY_COMPARE(store.rows(scope).size(), 1);
        const auto id = store.rows(scope).first().toMap().value("id").toString();
        QTRY_COMPARE_WITH_TIMEOUT(store.rows(scope).first().toMap().value("progress").toDouble(), 0.375, 3000);
        if (mode == "cancellation") {
            QVERIFY(store.cancel(id));
        }
        QTRY_COMPARE_WITH_TIMEOUT(finished.size(), 1, 4000);
        const auto row = store.rows(scope).first().toMap();
        QCOMPARE(row.value("status").toString(), expected);
        QVERIFY(!row.value("cancellable").toBool());
        QVERIFY(!row.value("updatedAt").toString().isEmpty());
        if (mode == "failure") { QVERIFY(row.value("detail").toString().contains("Synthetic encoder failure")); }
        nt::activity::LocalActivityStore reopened(m_history.path());
        QCOMPARE(reopened.rows(scope).first().toMap().value("status").toString(), expected);
        QCOMPARE(model.documentJson(), before);
    }
    void recordsCompletionAndReportedProgress() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        nt::activity::LocalActivityStore store(directory.path());
        CancelTarget target;
        const auto id = store.begin("project-a", "Export sequence", &target);
        QCOMPARE(id.size(), 32);
        QVERIFY(!store.rows("project-a").first().toMap().value("updatedAt").toString().isEmpty());
        QCOMPARE(store.rows("project-a").size(), 1);
        auto row = store.rows("project-a").first().toMap();
        QCOMPARE(row.value("progress").toDouble(), -1.0);
        QCOMPARE(row.value("cost").toString(), "Not reported");
        store.progress(id, "encoding", 0.42);
        row = store.rows("project-a").first().toMap();
        QCOMPARE(row.value("detail").toString(), "encoding");
        QCOMPARE(row.value("progress").toDouble(), 0.42);
        store.finish(id, true, false, {});
        QVERIFY(!store.cancel(id));
        nt::activity::LocalActivityStore reopened(directory.path());
        row = reopened.rows("project-a").first().toMap();
        QCOMPARE(row.value("status").toString(), "completed");
        QVERIFY(!row.value("cancellable").toBool());
        QVERIFY(reopened.rows("project-b").isEmpty());
    }
    void cancellationRequiresSourceAcknowledgement() {
        QTemporaryDir directory;
        nt::activity::LocalActivityStore store(directory.path());
        CancelTarget target;
        const auto id = store.begin("a", "Export", &target);
        QVERIFY(store.cancel(id));
        QCOMPARE(target.calls, 1);
        QCOMPARE(store.rows("a").first().toMap().value("status").toString(), "running");
        store.finish(id, false, true, {});
        QCOMPARE(store.rows("a").first().toMap().value("status").toString(), "cancelled");
        nt::activity::LocalActivityStore reopened(directory.path());
        QCOMPARE(reopened.rows("a").first().toMap().value("status").toString(), "cancelled");
    }
    void recoversUnobservedAndFailedRenders() {
        QTemporaryDir directory;
        nt::activity::LocalActivityStore store(directory.path());
        CancelTarget target;
        const auto active = store.begin("a", "Still running", &target);
        const auto failed = store.begin("a", "Failed render", &target);
        store.finish(failed, false, false, "Encoder unavailable");
        nt::activity::LocalActivityStore reopened(directory.path());
        const auto rows = reopened.rows("a");
        QCOMPARE(rows.size(), 2);
        QCOMPARE(rows.at(0).toMap().value("status").toString(), "failed");
        QCOMPARE(rows.at(0).toMap().value("detail").toString(), "Encoder unavailable");
        QCOMPARE(rows.at(1).toMap().value("id").toString(), active);
        QCOMPARE(rows.at(1).toMap().value("status").toString(), "unobserved");
        QVERIFY(!reopened.cancel(active));
    }
    void preservesOtherSessionHistory() {
        QTemporaryDir directory;
        nt::activity::LocalActivityStore first(directory.path());
        nt::activity::LocalActivityStore second(directory.path());
        CancelTarget firstTarget, secondTarget;
        const auto firstId = first.begin("a", "First render", &firstTarget);
        const auto secondId = second.begin("a", "Second render", &secondTarget);
        QCOMPARE(second.rows("a").size(), 2);
        const auto unattached = second.rows("a").at(1).toMap();
        QCOMPARE(unattached.value("id").toString(), firstId);
        QCOMPARE(unattached.value("status").toString(), "unobserved");
        QVERIFY(!unattached.value("cancellable").toBool());
        second.finish(secondId, true, false, {});
        first.finish(firstId, false, true, {});
        const auto thirdId = second.begin("a", "Third render", &secondTarget);
        second.finish(thirdId, false, false, "Synthetic failure");
        nt::activity::LocalActivityStore reopened(directory.path());
        QHash<QString, QString> states;
        for (const auto& value : reopened.rows("a")) {
            const auto row = value.toMap();
            states.insert(row.value("id").toString(), row.value("status").toString());
        }
        QCOMPARE(states.size(), 3);
        QCOMPARE(states.value(firstId), "cancelled");
        QCOMPARE(states.value(secondId), "completed");
        QCOMPARE(states.value(thirdId), "failed");
    }
    void reportsPersistenceFailures() {
        QTemporaryDir directory;
        QFile blocker(directory.filePath("file"));
        QVERIFY(blocker.open(QIODevice::WriteOnly));
        blocker.close();
        nt::activity::LocalActivityStore store(blocker.fileName());
        store.begin("a", "Export", nullptr);
        QVERIFY(!store.error().isEmpty());
        QCOMPARE(store.rows("a").size(), 1);
    }
    void keepsInvalidHistoryFile() {
        QTemporaryDir directory;
        nt::activity::LocalActivityStore original(directory.path());
        original.begin("a", "Export", nullptr);
        const auto files = QDir(directory.path()).entryList({"*.json"}, QDir::Files);
        QCOMPARE(files.size(), 1);
        QFile file(directory.filePath(files.first()));
        QVERIFY(file.open(QIODevice::WriteOnly | QIODevice::Truncate));
        QCOMPARE(file.write("invalid history"), 15);
        file.close();
        nt::activity::LocalActivityStore reopened(directory.path());
        QVERIFY(reopened.rows("a").isEmpty());
        QVERIFY(!reopened.error().isEmpty());
        reopened.begin("a", "New export", nullptr);
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), QByteArray("invalid history"));
    }
    void scopesByProjectOrTimelineWithoutStoringIdentity() {
        const auto first = nt::activity::localScope({{"projectId", "project-a"}, {"id", "timeline-a"}});
        const auto second = nt::activity::localScope({{"projectId", "project-a"}, {"id", "timeline-b"}});
        QCOMPARE(first, second);
        QVERIFY(first != nt::activity::localScope({{"projectId", "project-b"}, {"id", "timeline-a"}}));
        QVERIFY(nt::activity::localScope({{"id", "timeline-a"}}) != nt::activity::localScope({{"id", "timeline-b"}}));
        QVERIFY(!first.contains("project-a"));
    }
};
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    const auto arguments = app.arguments();
    const auto exportIndex = arguments.indexOf("--export");
    if (exportIndex >= 0) {
        QTextStream diagnostic(stderr);
        diagnostic << "export-progress {\"phase\":\"encoding\",\"frame\":3,\"totalFrames\":8,\"ratio\":0.375}\n";
        diagnostic.flush();
        const auto output = arguments.value(exportIndex + 1);
        const auto cancelIndex = arguments.indexOf("--cancel-file");
        QTimer poll;
        if (output.contains("cancellation.wav")) {
            QObject::connect(&poll, &QTimer::timeout, &app, [&app, arguments, cancelIndex] {
                if (QFile::exists(arguments.value(cancelIndex + 1))) { app.exit(3); }
            });
            poll.start(10);
            QTimer::singleShot(3000, &app, [&app] { app.exit(1); });
        } else {
            const bool failure = output.contains("failure.wav");
            QTimer::singleShot(200, &app, [&app, failure] {
                if (failure) { QTextStream(stderr) << "Synthetic encoder failure\n"; }
                app.exit(failure ? 1 : 0);
            });
        }
        return app.exec();
    }
    LocalActivityTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_localactivity.moc"
