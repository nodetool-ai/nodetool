#include "../../src/run/NodeRuntimeModel.h"
#include "../../src/run/UntakenBranch.h"
#include <QtTest>
#include <QJsonDocument>
using namespace nodetool::node_editor;
class NodeRuntimeModelTests : public QObject {
 Q_OBJECT
private slots:
 void isolatesAndReplays() {
  NodeRuntimeModel model;
  QSignalSpy changed(&model, &NodeRuntimeModel::nodeChanged);
  model.beginRun("a"); model.beginRun("b");
  QJsonObject event{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"node_name","Text"},{"node_type","nodetool.text.Text"},{"status","running"}};
  model.ingest("a",event);
  QVERIFY(model.nodeState("n").isEmpty()); QCOMPARE(changed.size(),0);
  model.selectRun("a"); QCOMPARE(model.nodeState("n")["status"].toString(),"running");
  model.ingest("a",event); QCOMPARE(changed.size(),0);
  event["job_seq"]=2; event["status"]="completed"; model.ingest("a",event);
  QCOMPARE(changed.size(),1);
  event["job_seq"]=3; event["status"]="running"; model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["status"].toString(),"completed");
 }
 // A new run shows the previous run's results until its own replace them, so
 // a card keeps its image while a preview reruns. Statuses start empty, and
 // the first streamed output starts fresh.
 void newRunHoldsPreviousResults() {
  NodeRuntimeModel model; model.beginRun("a");
  const QJsonObject image{{"type","image"},{"uri","local-media://1"}};
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","completed"},{"result",QJsonObject{{"output",image}}}});
  model.ingest("a",{{"type","output_update"},{"job_id","a"},{"job_seq",2},{"node_id","t"},{"output_name","text"},{"value","old"}});
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",3},{"status","completed"}});
  model.beginRun("b");
  QCOMPARE(model.nodeState("n")["result"].toObject()["output"].toObject(), image);
  QVERIFY(model.nodeState("n")["status"].toString().isEmpty());
  QCOMPARE(model.nodeState("t")["text"].toString(), QString("old"));
  model.ingest("b",{{"type","node_update"},{"job_id","b"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  QCOMPARE(model.nodeState("n")["result"].toObject()["output"].toObject(), image);
  model.ingest("b",{{"type","output_update"},{"job_id","b"},{"job_seq",2},{"node_id","t"},{"output_name","text"},{"value","new"}});
  QCOMPARE(model.nodeState("t")["text"].toString(), QString("new"));
  model.ingest("b",{{"type","output_update"},{"job_id","b"},{"job_seq",3},{"node_id","t"},{"output_name","text"},{"value","er"}});
  QCOMPARE(model.nodeState("t")["text"].toString(), QString("newer"));
 }
 void streamAndDisconnect() {
  NodeRuntimeModel model; model.beginRun("a");
  QJsonObject event{{"type","output_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"node_name","Output"},{"output_name","text"},{"output_type","str"},{"metadata",QJsonObject{}},{"value","hello"}};
  model.ingest("a",event); model.setConnected(false);
  QCOMPARE(model.nodeState("n")["text"].toString(),"hello");
  model.setConnected(true); model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["text"].toString(),"hello");
  event["job_seq"]=2; event["value"]=" world"; model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["text"].toString(),"hello world");
  event["job_seq"]=3; event["disposition"]="replace"; event["value"]="final"; model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["text"].toString(),"final");
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",4},{"status","completed"}});
  event["job_seq"]=5; event["value"]="late"; model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["text"].toString(),"late");
 }
 void completionBeforeArtifacts() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",1},{"status","completed"}});
  model.ingest("a",{{"type","generation_complete"},{"job_id","a"},{"job_seq",2},{"node_id","n"},{"outputs",QJsonObject{{"image",QJsonObject{{"type","image"},{"uri","asset://abc"}}}}}});
  QCOMPARE(model.nodeState("n")["status"].toString(),"completed");
  QCOMPARE(model.nodeState("n")["result"].toObject()["image"].toObject()["uri"].toString(),"asset://abc");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",3},{"node_id","n"},{"status","running"},{"result",QJsonObject{{"text","late result"}}}});
  QCOMPARE(model.nodeState("n")["status"].toString(),"completed");
  QCOMPARE(model.nodeState("n")["result"].toObject()["text"].toString(),"late result");
  model.ingest("a",{{"type","node_progress"},{"job_id","a"},{"job_seq",4},{"node_id","n"},{"progress",1},{"total",2}});
  QVERIFY(!model.nodeState("n").contains("progress"));
 }
 void boundsRetainMediaAndExplainTruncation() {
  NodeRuntimeModel model; model.beginRun("a");
  const QJsonObject image{{"type","image"},{"uri","asset://0123456789abcdef0123456789abcdef"}};
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"node_id","n"},{"status","completed"},{"result",QJsonObject{{"image",image},{"text",QString(200000, QChar('x'))}}}});
  auto state = model.nodeState("n");
  QVERIFY(state["truncated"].toBool()); QVERIFY(state["text"].toString().contains("Preview truncated"));
  QCOMPARE(state["result"].toObject()["image"].toObject(),image);
  QVERIFY(QJsonDocument(state).toJson().size() < 300000);
  model.ingest("a",{{"type","output_update"},{"job_id","a"},{"node_id","n"},{"output_name","image"},{"value",image}});
  QCOMPARE(model.nodeState("n")["outputs"].toObject()["image"].toObject(),image);
 }
 void edgeStorageIsBoundedAndReported() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"node_id","n"},{"status","running"}});
  for (int i = 0; i < 10001; ++i) {
    model.ingest("a",{{"type","edge_update"},{"job_id","a"},{"edge_id",QString::number(i)},{"status","active"}});
  }
  int retained = 0;
  for (int i = 0; i < 10001; ++i) { retained += !model.edgeState(QString::number(i)).isEmpty(); }
  QCOMPARE(retained,10000);
  QVERIFY(model.nodeState("n")["text"].toString().contains("Run preview truncated"));
 }
 void oversizedMediaNeverBecomesCorruptLocator() {
  NodeRuntimeModel model; model.beginRun("a");
  QJsonObject media{{"type","image"},{"data",QString(200000,QChar('A'))}};
  model.ingest("a",{{"type","generation_complete"},{"job_id","a"},{"node_id","n"},{"outputs",QJsonObject{{"image",media}}}});
  auto result = model.nodeState("n")["result"].toObject()["image"].toObject();
  QCOMPARE(result["type"].toString(),"preview_omitted"); QVERIFY(!result.contains("data"));
  media["uri"] = "asset://0123456789abcdef0123456789abcdef";
  model.ingest("a",{{"type","generation_complete"},{"job_id","a"},{"node_id","n"},{"outputs",QJsonObject{{"image",media}}}});
  result = model.nodeState("n")["result"].toObject()["image"].toObject();
  QCOMPARE(result["type"].toString(),"image"); QCOMPARE(result["uri"],media["uri"]); QVERIFY(!result.contains("data"));
 }
 void progressNoopAndWrongJob() {
  NodeRuntimeModel model; model.beginRun("a"); QSignalSpy changed(&model,&NodeRuntimeModel::nodeChanged);
  QJsonObject event{{"type","node_progress"},{"job_id","a"},{"node_id","n"},{"progress",1},{"total",4}};
  model.ingest("a",event); model.ingest("a",event); QCOMPARE(changed.size(),1);
  event["job_id"]="b"; event["progress"]=2; model.ingest("a",event);
  QCOMPARE(model.nodeState("n")["progress"].toDouble(),1.0);
 }
 // NodeProgress.tsx times the remaining work from the first progress report.
 void progressRecordsWhenItStarted() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","node_progress"},{"job_id","a"},{"node_id","n"},{"progress",1},{"total",4}});
  const auto started = model.nodeState("n")["progressStarted"].toDouble();
  QVERIFY(started > 0);
  QTest::qWait(5);
  model.ingest("a",{{"type","node_progress"},{"job_id","a"},{"node_id","n"},{"progress",2},{"total",4}});
  QCOMPARE(model.nodeState("n")["progressStarted"].toDouble(), started);
  model.ingest("a",{{"type","node_progress"},{"job_id","a"},{"node_id","n"},{"progress",0},{"total",4}});
  QVERIFY(model.nodeState("n")["progressStarted"].toDouble() > started);
 }
 // The canvas keeps marking the untaken branch after the run ends, so edge reports outlive the job.
 void edgeReportsOutliveTheFinishedRun() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","edge_update"},{"job_id","a"},{"job_seq",1},{"edge_id","e"},{"status","completed"}});
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",2},{"status","completed"}});
  QCOMPARE(model.edgeState("e")["status"].toString(),"completed");
  model.ingest("a",{{"type","edge_update"},{"job_id","a"},{"job_seq",3},{"edge_id","late"},{"status","active"}});
  QVERIFY(model.edgeState("late").isEmpty());
 }
 // F27. A `job_resumed` "unknown" reply means the server lost the run. Like settleLostRun in
 // web/src/stores/workflowUpdates.ts, its node statuses, progress and edge reports are dropped, so
 // nothing on the canvas keeps running.
 void lostRunClearsItsRunningState() {
  NodeRuntimeModel model; model.beginRun("a");
  QSignalSpy projection(&model,&NodeRuntimeModel::projectionChanged);
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  model.ingest("a",{{"type","node_progress"},{"job_id","a"},{"job_seq",2},{"node_id","n"},{"progress",1},{"total",4}});
  model.ingest("a",{{"type","edge_update"},{"job_id","a"},{"job_seq",3},{"edge_id","e"},{"status","active"}});
  model.ingest("a",{{"type","job_resumed"},{"job_id","a"},{"status","unknown"},{"last_seq",3},{"replay_count",0}});
  QVERIFY(!model.nodeState("n").contains("status"));
  QVERIFY(!model.nodeState("n").contains("progress"));
  QVERIFY(!model.nodeState("n").contains("progressStarted"));
  QVERIFY(model.edgeState("e").isEmpty());
  QVERIFY(projection.size() > 0);
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",4},{"node_id","n"},{"status","running"}});
  QVERIFY(model.nodeState("n")["status"].toString().isEmpty());
 }
 // F27. A "finished" reply with frames to replay is followed by the run's own terminal job_update,
 // as handleJobResumed in web/src/stores/workflowUpdates.ts expects. The reply alone must not end
 // the run, or the replayed failure would be lost.
 void resumedFinishedRunWaitsForItsReplayedOutcome() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  model.ingest("a",{{"type","job_resumed"},{"job_id","a"},{"status","finished"},{"last_seq",1},{"replay_count",2}});
  QCOMPARE(model.nodeState("n")["status"].toString(),"running");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",2},{"node_id","n"},{"status","error"},{"error","boom"}});
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",3},{"status","failed"}});
  QCOMPARE(model.nodeState("n")["status"].toString(),"error");
  // With nothing left to replay the reply settles the run.
  model.beginRun("b");
  model.ingest("b",{{"type","node_update"},{"job_id","b"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  model.ingest("b",{{"type","job_resumed"},{"job_id","b"},{"status","finished"},{"last_seq",1},{"replay_count",0}});
  QVERIFY(model.nodeState("n")["status"].toString() != "running");
 }
 // F27. handleNodeUpdate in web/src/stores/workflowUpdates.ts drops late node frames of a
 // cancelled run, so a result arriving after Stop does not appear.
 void cancelledRunDropsLateNodeFrames() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  model.ingest("a",{{"type","job_update"},{"job_id","a"},{"job_seq",2},{"status","cancelled"}});
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",3},{"node_id","n"},{"status","completed"},{"result",QJsonObject{{"text","late"}}}});
  QCOMPARE(model.nodeState("n")["status"].toString(),"cancelled");
  QVERIFY(!model.nodeState("n").contains("result"));
 }
 // F27. The output panel drops its runs on a server, workflow or file change and then selects no
 // run. The canvas projection must follow instead of keeping the previous run's states.
 void selectingNoRunClearsTheProjection() {
  NodeRuntimeModel model; model.beginRun("a");
  model.ingest("a",{{"type","node_update"},{"job_id","a"},{"job_seq",1},{"node_id","n"},{"status","running"}});
  QSignalSpy projection(&model,&NodeRuntimeModel::projectionChanged);
  model.selectRun({});
  QVERIFY(model.nodeState("n").isEmpty());
  QCOMPARE(projection.size(),1);
  model.selectRun("unknown");
  QVERIFY(model.nodeState("n").isEmpty());
  QCOMPARE(projection.size(),1);
  model.selectRun("a");
  QCOMPARE(model.nodeState("n")["status"].toString(),"running");
 }
 // web/src/utils/__tests__/untakenBranches.test.ts shapes: a branch output that completed without a
 // message is dead, death cascades only through nodes whose data inputs are all dead, and control
 // edges and non-branch sources never start it.
 void untakenBranchFollowsTheWebRules() {
  const QHash<QString,QString> types{{"if","nodetool.control.If"},{"sw","nodetool.control.Switch"},{"a","x"},{"b","x"},{"c","x"},{"d","x"},{"e","x"}};
  const auto edge=[](const char *id,const char *from,const char *to,const char *kind="data") { return QJsonObject{{"id",id},{"source",from},{"target",to},{"edge_type",kind}}; };
  const QJsonArray edges{edge("ia","if","a"),edge("ib","if","b"),edge("bc","b","c"),edge("ad","a","d"),edge("bd","b","d"),edge("sd","sw","e"),edge("ctl","b","e","control")};
  QHash<QString,QJsonObject> states{{"ia",{{"status","completed"},{"counter",1}}},{"ib",{{"status","completed"}}},{"sd",{{"status","active"}}}};
  const auto found=findUntakenBranch(types,edges,[&](const QString &id) { return states.value(id); });
  QCOMPARE(found.nodeIds,(QSet<QString>{"b","c"}));
  QCOMPARE(found.edgeIds,(QSet<QString>{"ib","bc","bd"}));
  QVERIFY(!found.nodeIds.contains("d"));
  // A source that is not an If or Switch never marks its edges, whatever they report.
  states["bc"]={{"status","completed"}};
  QCOMPARE(findUntakenBranch(types,edges,[&](const QString &id) { return states.value(id); }),found);
  // Nothing reported yet means nothing is dead.
  QVERIFY(findUntakenBranch(types,edges,[](const QString &) { return QJsonObject{}; }).empty());
  // When both outputs are dead the shared target dies as well.
  states["ia"]={{"status","completed"}};
  const auto both=findUntakenBranch(types,edges,[&](const QString &id) { return states.value(id); });
  QVERIFY(both.nodeIds.contains("a")); QVERIFY(both.nodeIds.contains("d"));
 }
};
QTEST_GUILESS_MAIN(NodeRuntimeModelTests)
#include "NodeRuntimeModelTests.moc"
