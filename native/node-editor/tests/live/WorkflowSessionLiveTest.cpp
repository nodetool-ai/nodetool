#include "../../src/server/WorkflowSession.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
using namespace nodetool::node_editor;
class LiveTest : public QObject {
  Q_OBJECT
private slots:
  void roundTripAndRun() {
    const auto base = qEnvironmentVariable("NODETOOL_LIVE_URL");
    QVERIFY2(!base.isEmpty(), "Set NODETOOL_LIVE_URL to a disposable local backend");
    WorkflowSession session;
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    QSignalSpy saved(&session, &WorkflowSession::saved);
    QSignalSpy events(&session, &WorkflowSession::runEvent);
    session.connectToServer(QUrl(base), qEnvironmentVariable("NODETOOL_TOKEN"));
    QTRY_VERIFY_WITH_TIMEOUT(session.connected(), 10000);
    QTRY_VERIFY_WITH_TIMEOUT(!session.catalog().isEmpty(), 10000);
    bool found = false;
    for (const auto &v : session.catalog()["nodes"].toArray()) {
      if (v.toObject()["node_type"] == "nodetool.text.Concat") { found = true; }
    }
    QVERIFY2(found, "Real catalog must contain nodetool.text.Concat");
    qInfo() << "LIVE catalog nodes" << session.catalog()["nodes"].toArray().size();
    const QJsonObject node{{"id", "concat"}, {"type", "nodetool.text.Concat"},
      {"data", QJsonObject{}},
      {"dynamic_properties", QJsonObject{{"a", "native "}, {"b", "live"}}}};
    session.setSnapshot(QJsonObject{{"name", "Native live integration"},
      {"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}});
    session.save();
    QTRY_COMPARE_WITH_TIMEOUT(saved.size(), 1, 10000);
    QVERIFY(!session.dirty());
    const auto id = session.workflow()["id"].toString();
    const auto revision = session.workflow()["updated_at"].toString();
    QCOMPARE(id.size(), 32);
    QVERIFY(!revision.isEmpty());
    auto edited = session.workflow();
    edited.insert("description", "Updated by the native live harness");
    session.setSnapshot(edited);
    session.save();
    QTRY_COMPARE_WITH_TIMEOUT(saved.size(), 2, 10000);
    QVERIFY(session.workflow()["updated_at"].toString() != revision);
    WorkflowSession opened;
    QSignalSpy openedErrors(&opened, &WorkflowSession::errorOccurred);
    opened.connectToServer(QUrl(base), qEnvironmentVariable("NODETOOL_TOKEN"));
    opened.openWorkflow(id);
    QTRY_COMPARE_WITH_TIMEOUT(opened.workflow()["id"].toString(), id, 10000);
    QCOMPARE(opened.workflow(), session.workflow());
    qInfo() << "LIVE create/update/open" << id << session.workflow()["updated_at"];
    const auto job = session.run(session.workflow());
    QVERIFY(!job.isEmpty());
    bool terminal = false;
    bool output = false;
    bool terminalResult = false;
    QElapsedTimer timer;
    timer.start();
    while (!terminalResult && timer.elapsed() < 20000) {
      QTest::qWait(20);
      for (const auto &args : events) {
        const auto event = args[1].toJsonObject();
        if (event["type"] == "node_update" && event["result"].toObject()["output"] == "native live") { output = true; }
        if (event["type"] == "job_update" && event["status"] == "completed" &&
            event["result"].toObject()["outputs"].toObject()["Concat"].toArray() == QJsonArray{"native live"}) { terminalResult = true; }
        if (event["type"] == "job_update" &&
            (event["status"] == "completed" || event["status"] == "failed")) { terminal = true; }
      }
    }
    for (const auto &args : events) { qInfo().noquote() << "LIVE event" << QJsonDocument(args[1].toJsonObject()).toJson(QJsonDocument::Compact); }
    for (const auto &args : errors) { qInfo() << "LIVE error" << args[0].toString(); }
    QVERIFY2(terminal, "Native WorkflowSession did not observe a terminal run event");
    QVERIFY2(output, "Native WorkflowSession did not observe the expected Concat output");
    QVERIFY2(terminalResult, "Native session did not receive the completed job result");
    auto newer = session.workflow();
    newer.insert("description", "A newer server revision");
    session.setSnapshot(newer);
    session.save();
    QTRY_COMPARE_WITH_TIMEOUT(saved.size(), 3, 10000);
    QSignalSpy conflicts(&opened, &WorkflowSession::saveConflict);
    auto stale = opened.workflow();
    stale.insert("description", "Stale revision must fail");
    opened.setSnapshot(stale);
    opened.save();
    QTRY_COMPARE_WITH_TIMEOUT(conflicts.size(), 1, 10000);
    QCOMPARE(openedErrors.size(), 1);
    QCOMPARE(openedErrors[0][0].toString(), QString("Request failed (HTTP 409)"));
    QVERIFY(opened.dirty());
    qInfo() << "LIVE stale revision rejected with HTTP 409";
    QCOMPARE(errors.size(), 0);

  }
};
QTEST_GUILESS_MAIN(LiveTest)
#include "WorkflowSessionLiveTest.moc"
