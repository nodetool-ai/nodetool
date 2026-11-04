#include "../../src/run/NodeRuntimeModel.h"
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
};
QTEST_GUILESS_MAIN(NodeRuntimeModelTests)
#include "NodeRuntimeModelTests.moc"
