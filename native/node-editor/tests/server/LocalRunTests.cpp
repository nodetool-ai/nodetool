#include "../../src/run/NodeRuntimeModel.h"
#include "../../src/run/RunOutputModel.h"
#include "../../src/server/WorkflowSession.h"
#include <QFileInfo>
#include <QJsonArray>
#include <QtTest>
#include <memory>
using namespace nodetool::node_editor;
namespace {
QJsonObject node(const QString &id, const QString &type, const QJsonObject &data, bool bypassed = false) {
  QJsonObject ui{{"position", QJsonObject{{"x", 0}, {"y", 0}}}, {"selectable", true}};
  if (bypassed) { ui["bypassed"] = true; }
  return {{"id", id}, {"type", type}, {"data", data}, {"ui_properties", ui}, {"dynamic_properties", QJsonObject{}}};
}
QJsonObject edge(const QString &id, const QString &source, const QString &sourceHandle, const QString &target, const QString &targetHandle) {
  return {{"id", id}, {"source", source}, {"sourceHandle", sourceHandle}, {"target", target},
          {"targetHandle", targetHandle}, {"ui_properties", QJsonObject{{"className", "int"}}}};
}
// The repeat-collect fixture as the editor's document snapshot holds it, with
// a disabled node the editor leaves out of the submitted graph.
QJsonObject snapshot(qint64 count, const QString &extraType = {}) {
  QJsonArray nodes{node("count", "nodetool.constant.Integer", {{"value", count}}),
                   node("repeat", "nodetool.control.RepeatCount", {{"count", 1}}),
                   node("collect", "nodetool.control.Collect", {}),
                   node("out", "nodetool.output.Output", {{"name", "items"}}),
                   node("disabled", "nodetool.text.Concat", {{"a", "x"}}, true)};
  QJsonArray edges{edge("e1", "count", "output", "repeat", "count"),
                   edge("e2", "repeat", "output", "collect", "input_item"),
                   edge("e3", "collect", "output", "out", "value"),
                   edge("e4", "repeat", "output", "disabled", "a")};
  if (!extraType.isEmpty()) { nodes.append(node("extra", extraType, {})); }
  return {{"id", "wf-local"}, {"name", "Local run"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
}
QString statusOf(const WorkflowSession &session, const QString &id) {
  for (const auto &item : session.queue()) {
    const auto row = item.toMap();
    if (row["jobId"].toString() == id) { return row["status"].toString(); }
  }
  return {};
}
void observe(WorkflowSession &session, NodeRuntimeModel &runtime) {
  QObject::connect(&session, &WorkflowSession::runSubmitted, &runtime, &NodeRuntimeModel::beginRun);
  QObject::connect(&session, &WorkflowSession::runEvent, &runtime, &NodeRuntimeModel::ingest);
}
// The Output panel's job row for the selected run.
QVariantMap jobEntry(const RunOutputModel &output) {
  for (const auto &entry : output.entries()) {
    if (entry.toMap()["kind"] == "job") { return entry.toMap(); }
  }
  return {};
}
}
class LocalRunTests : public QObject {
  Q_OBJECT
private slots:
  void initTestCase() {
    QVERIFY2(QFileInfo::exists(GUEST_BUNDLE), "Build the guest bundle with node native/graph-runner/guest/build.mjs");
    qputenv("NODETOOL_LOCAL_RUNNER", "1");
    WorkflowSession::setGuestBundlePath(GUEST_BUNDLE);
  }
  void runsWithoutServer() {
    WorkflowSession session;
    NodeRuntimeModel runtime;
    observe(session, runtime);
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 60000);
    QVERIFY(!session.connected());
    const auto id = session.run(snapshot(3));
    QVERIFY(!id.isEmpty());
    QVERIFY(session.runsInProcess(id));
    QTRY_COMPARE_WITH_TIMEOUT(statusOf(session, id), QString("completed"), 30000);
    QCOMPARE(runtime.selectedRunId(), id);
    QCOMPARE(runtime.nodeState("out")["outputs"].toObject()["items"].toArray(), (QJsonArray{0, 1, 2}));
    QCOMPARE(runtime.nodeState("out")["text"].toString(), QString("[0,1,2]"));
    QCOMPARE(runtime.nodeState("repeat")["status"].toString(), QString("completed"));
    QVERIFY(runtime.nodeState("disabled").isEmpty());
    QVERIFY2(errors.isEmpty(), qPrintable(errors.isEmpty() ? QString() : errors.first().first().toString()));
  }
  void cancelsThenRunsAgain() {
    WorkflowSession session;
    NodeRuntimeModel runtime;
    observe(session, runtime);
    QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 60000);
    const auto id = session.run(snapshot(1000000000));
    QVERIFY(session.runsInProcess(id));
    QTRY_COMPARE_WITH_TIMEOUT(runtime.nodeState("repeat")["status"].toString(), QString("running"), 30000);
    QTest::qWait(100);
    session.stop(id);
    QTRY_COMPARE_WITH_TIMEOUT(statusOf(session, id), QString("cancelled"), 30000);
    QVERIFY(runtime.nodeState("out")["outputs"].toObject().isEmpty());
    const auto next = session.run(snapshot(4));
    QVERIFY(!next.isEmpty() && next != id);
    QTRY_COMPARE_WITH_TIMEOUT(statusOf(session, next), QString("completed"), 30000);
    QCOMPARE(runtime.nodeState("out")["outputs"].toObject()["items"].toArray(), (QJsonArray{0, 1, 2, 3}));
    QCOMPARE(statusOf(session, id), QString("cancelled"));
  }
  void dropsEventsForDestroyedSession() {
    WorkflowSession keeper;
    QTRY_VERIFY_WITH_TIMEOUT(keeper.localRunnerReady(), 60000);
    auto doomed = std::make_unique<WorkflowSession>();
    QVERIFY(doomed->localRunnerReady());
    const auto id = doomed->run(snapshot(1000000000));
    QVERIFY(!id.isEmpty());
    QTest::qWait(150);
    doomed.reset();
    // Messages already posted to the destroyed session are dropped, and its
    // run is cancelled, so the shared runner takes the next job.
    NodeRuntimeModel runtime;
    observe(keeper, runtime);
    const auto next = keeper.run(snapshot(2));
    QTRY_COMPARE_WITH_TIMEOUT(statusOf(keeper, next), QString("completed"), 30000);
    QCOMPARE(runtime.nodeState("out")["outputs"].toObject()["items"].toArray(), (QJsonArray{0, 1}));
  }
  // Comment and Group nodes are pruned before the run, as on the server, so
  // they no longer send the graph to the server. The Group's child runs.
  void runsGraphWithCommentAndGroup() {
    WorkflowSession session;
    NodeRuntimeModel runtime;
    observe(session, runtime);
    QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 60000);
    auto workflow = snapshot(3);
    auto graph = workflow["graph"].toObject();
    auto nodes = graph["nodes"].toArray();
    auto edges = graph["edges"].toArray();
    nodes.append(node("note", "nodetool.workflows.base_node.Comment", {{"comment", "Counts to three"}}));
    nodes.append(node("group", "nodetool.workflows.base_node.Group", {}));
    auto repeat = nodes[1].toObject();
    repeat["parent_id"] = "group";
    nodes[1] = repeat;
    edges.append(edge("e5", "note", "output", "out", "value"));
    graph["nodes"] = nodes;
    graph["edges"] = edges;
    workflow["graph"] = graph;
    const auto id = session.run(workflow);
    QVERIFY(!id.isEmpty());
    QVERIFY(session.runsInProcess(id));
    QTRY_COMPARE_WITH_TIMEOUT(statusOf(session, id), QString("completed"), 30000);
    QCOMPARE(runtime.nodeState("out")["outputs"].toObject()["items"].toArray(), (QJsonArray{0, 1, 2}));
    QCOMPARE(runtime.nodeState("repeat")["status"].toString(), QString("completed"));
    QVERIFY(runtime.nodeState("note").isEmpty());
    QVERIFY(runtime.nodeState("group").isEmpty());
  }
  // The job summary that follows the terminal job_update reaches the Output
  // panel's job row, as it does for a server run.
  void completedRunShowsJobSummary() {
    WorkflowSession session;
    RunOutputModel output;
    QObject::connect(&session, &WorkflowSession::runSubmitted, &output, &RunOutputModel::beginRun);
    QObject::connect(&session, &WorkflowSession::runEvent, &output, &RunOutputModel::ingest);
    QList<QJsonObject> updates;
    QObject::connect(&session, &WorkflowSession::runEvent, [&updates](const QString &, const QJsonObject &event) {
      if (event["type"] == "job_update" && event["status"] == "completed") { updates.append(event); }
    });
    QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 60000);
    const auto id = session.run(snapshot(3));
    QVERIFY(session.runsInProcess(id));
    QTRY_COMPARE_WITH_TIMEOUT(updates.size(), 2, 30000);
    QVERIFY(!updates[0].contains("result"));
    const QJsonObject outputs{{"Output", QJsonArray{QJsonArray{0, 1, 2}}}};
    QCOMPARE(updates[1]["result"].toObject(), (QJsonObject{{"outputs", outputs}}));
    QCOMPARE(statusOf(session, id), QString("completed"));
    QCOMPARE(output.selectedRunId(), id);
    const auto job = jobEntry(output);
    QCOMPARE(job["status"].toString(), QString("completed"));
    QCOMPARE(job["text"].toString(), QString(R"({"outputs":{"Output":[[0,1,2]]}})"));
  }
  void unsupportedGraphUsesServer() {
    WorkflowSession session;
    QTRY_VERIFY_WITH_TIMEOUT(session.localRunnerReady(), 60000);
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    QVERIFY(session.run(snapshot(3, "nodetool.text.Concat")).isEmpty());
    QCOMPARE(errors.count(), 1);
    QCOMPARE(errors.first().first().toString(), QString("Connect before running"));
    QVERIFY(session.queue().isEmpty());
  }
  void environmentDisablesLocalRuns() {
    WorkflowSession loaded;
    QTRY_VERIFY_WITH_TIMEOUT(loaded.localRunnerReady(), 60000);
    qputenv("NODETOOL_LOCAL_RUNNER", "0");
    WorkflowSession session;
    qputenv("NODETOOL_LOCAL_RUNNER", "1");
    QVERIFY(!session.localRunnerReady());
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    QVERIFY(session.run(snapshot(3)).isEmpty());
    QCOMPARE(errors.count(), 1);
  }
};
QTEST_GUILESS_MAIN(LocalRunTests)
#include "LocalRunTests.moc"
