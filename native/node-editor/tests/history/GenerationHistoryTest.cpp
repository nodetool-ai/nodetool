#include "run/GenerationHistory.h"
#include <QJsonDocument>
#include <QPointer>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
using namespace nodetool::node_editor;
namespace {
QJsonObject workflow(const QString &id="workflow"){return {{"id",id},{"graph",QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id","node"},{"type","generator"}}}},{"edges",QJsonArray{}}}}};}
QJsonObject asset(QString id="asset",QString content="text/plain",QString user="one",QString owner="workflow"){
 QJsonObject metadata{{"text","capped preview"}};if(content.contains("json")){metadata["json"]=QJsonObject{{"preview","not authoritative"}};}
 return {{"id",id},{"user_id",user},{"workflow_id",owner},{"node_id","node"},{"job_id","job"},{"content_type",content},{"created_at","2026-11-05T00:00:00.000Z"},{"get_url","/api/content/"+id},{"metadata",metadata}};
}
QByteArray listing(QJsonArray assets){return QJsonDocument(QJsonObject{{"result",QJsonObject{{"data",QJsonObject{{"assets",assets},{"next",QJsonValue::Null}}}}}}).toJson(QJsonDocument::Compact);}
class Server final:public QTcpServer{
public:
 QList<QByteArray> requests;QPointer<QTcpSocket> delayed;std::function<QByteArray(const QByteArray&)> response;
 Server(){listen(QHostAddress::LocalHost);connect(this,&QTcpServer::newConnection,this,[this]{auto socket=nextPendingConnection();socket->setParent(this);connect(socket,&QTcpSocket::readyRead,this,[this,socket]{const auto request=socket->readAll();requests.append(request);const auto body=response(request);if(body.isNull()){delayed=socket;return;}socket->write("HTTP/1.1 200 OK\r\nContent-Length: "+QByteArray::number(body.size())+"\r\nConnection: close\r\n\r\n"+body);socket->disconnectFromHost();});});}
 QUrl url()const{return QUrl(QString("http://127.0.0.1:%1").arg(serverPort()));}
};
}
class HistoryTest final:public QObject{
 Q_OBJECT
private slots:
 void fullAuthoritativeTextAndSelectionScope(){
  Server server;const QByteArray full(20000,'x');server.response=[&](const auto &request){return request.startsWith("GET /trpc/")?listing({asset()}):full;};
  ExecutionGenerationStore store;GenerationHistory history(&store);history.configure(server.url(),"fixture-token","one");history.setWorkflow(workflow());history.selectNode("node");history.refresh();QTRY_VERIFY(!history.loading());QVERIFY2(history.error().isEmpty(),qPrintable(history.error()));QCOMPARE(history.rows().size(),1);
  QCOMPARE(history.outputs("node","asset")["output"].toString(),QString::fromUtf8(full));QVERIFY(history.rows().first().toMap()["truncated"].toBool());
  QVERIFY(server.requests.first().contains("Authorization: Bearer fixture-token"));QVERIFY(server.requests.first().contains("workflow_id"));
  PartialRunPlanner planner(workflow(),{QJsonObject{{"node_type","generator"},{"auto_save_asset",true}}},store.generations("workflow"),0);QVERIFY(history.contains("node","asset"));
 }
 void jsonMediaAndLiveReconciliation(){
  Server server;server.response=[&](const auto &request){return request.startsWith("GET /trpc/")?listing({asset("json","application/json"),asset("image","image/png")}):QByteArray("{\"first\":1,\"second\":2}");};
  ExecutionGenerationStore store;store.submitted("job",workflow(),{}, {"node"});store.ingest("job",{{"type","generation_complete"},{"node_id","node"},{"index",0},{"outputs",QJsonObject{{"output","live duplicate"}}}},100);
  GenerationHistory history(&store);history.configure(server.url(),{},"one");history.setWorkflow(workflow());history.selectNode("node");history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(history.error().isEmpty());QCOMPARE(history.rows().size(),2);QCOMPARE(history.outputs("node","json")["second"].toInt(),2);QCOMPARE(history.outputs("node","image")["output"].toObject()["asset_id"].toString(),QString("image"));QVERIFY(!history.contains("node","job"));
 }
 void staleWorkflowAndAccountResponses(){
  Server old;old.response=[](const auto&){return QByteArray{};};ExecutionGenerationStore store;GenerationHistory history(&store);history.configure(old.url(),"old-token","one");history.setWorkflow(workflow());store.submitted("old-job",workflow(),{},{"node"});store.ingest("old-job",{{"type","generation_complete"},{"node_id","node"},{"outputs",QJsonObject{{"output","old account value"}}}},1000);history.refresh();QTRY_VERIFY(old.delayed);
  Server current;current.response=[](const auto&){return listing({});};history.configure(current.url(),"new-token","two");history.setWorkflow(workflow("other"));history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(history.rows().isEmpty());QVERIFY(history.error().isEmpty());
  if(old.delayed){old.delayed->write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");old.delayed->disconnectFromHost();}QTest::qWait(20);QVERIFY(history.error().isEmpty());QVERIFY(store.generations("workflow").isEmpty());QVERIFY(current.requests.first().contains("new-token"));QVERIFY(!current.requests.first().contains("old-token"));
 }
 void nestedMediaAndUnstructuredJsonReference(){
  ExecutionGenerationStore store;GenerationHistory history(&store);Server server;
  history.configure(server.url(),{},"one");history.setWorkflow(workflow());history.selectNode("node");
  store.submitted("media",workflow(),{},{"node"});store.ingest("media",{{"type","generation_complete"},{"node_id","node"},{"outputs",QJsonObject{{"images",QJsonArray{QJsonObject{{"type","image"},{"uri","asset://first"}},QJsonObject{{"type","image"},{"uri","asset://second"}}}}}}},1000);
  QCOMPARE(history.rows().first().toMap()["media"].toList().size(),2);
  auto json=asset("plain-json","application/json");json["metadata"]=QJsonObject{};server.response=[&](const auto &){return listing({json});};history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(history.error().isEmpty());QCOMPARE(history.outputs("node","plain-json")["output"].toObject()["type"].toString(),QString("json"));QCOMPARE(server.requests.size(),1);
 }
 void wrongScopeAndDeletedGeneration(){
  Server server;bool removed=false;bool wrong=false;server.response=[&](const auto &request){if(request.startsWith("GET /trpc/")){return listing(removed?QJsonArray{}:QJsonArray{asset("asset","text/plain",wrong?"other":"one")});}return QByteArray("complete");};ExecutionGenerationStore store;GenerationHistory history(&store);history.configure(server.url(),{},"one");history.setWorkflow(workflow());history.selectNode("node");history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(history.contains("node","asset"));removed=true;history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(!history.contains("node","asset"));removed=false;wrong=true;history.refresh();QTRY_VERIFY(!history.loading());QVERIFY(history.error().contains("scope"));QVERIFY(store.generations("workflow").isEmpty());
 }
};
QTEST_GUILESS_MAIN(HistoryTest)
#include "GenerationHistoryTest.moc"
