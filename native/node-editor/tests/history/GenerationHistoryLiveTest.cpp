#include "server/WorkflowSession.h"
#include <QHttpMultiPart>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QScopeGuard>
#include <QtTest>
using namespace nodetool::node_editor;
class GenerationHistoryLiveTest final:public QObject{
 Q_OBJECT
private slots:
 void generateSaveReopenPinAndReuse(){
  const auto base=qEnvironmentVariable("NODETOOL_PARTIAL_LIVE_URL");if(base.isEmpty()){QSKIP("Set NODETOOL_PARTIAL_LIVE_URL to a disposable backend");}
  QNetworkAccessManager network;
  const auto request=[&](const QByteArray &method,const QString &path,const QJsonObject &body){QNetworkRequest req(QUrl(base).resolved(QUrl(path)));req.setHeader(QNetworkRequest::ContentTypeHeader,"application/json");auto reply=network.sendCustomRequest(req,method,method=="GET" || method=="DELETE"?QByteArray{}:QJsonDocument(body).toJson(QJsonDocument::Compact));QSignalSpy done(reply,&QNetworkReply::finished);if(!reply->isFinished()){done.wait(10000);}const auto bytes=reply->readAll();const auto status=reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();reply->deleteLater();return qMakePair(status,QJsonDocument::fromJson(bytes).object());};
  const QJsonObject input{{"input",QJsonObject{{"type",QJsonObject{{"type","str"},{"type_args",QJsonArray{}}}},{"required",true}}}};
  const QJsonObject graph{{"nodes",QJsonArray{QJsonObject{{"id","source"},{"type","nodetool.text.Prompt"},{"data",QJsonObject{{"prompt","Saved durable generation"}}},{"ui_properties",QJsonObject{{"future",42}}}},QJsonObject{{"id","target"},{"type","nodetool.text.Prompt"},{"data",QJsonObject{{"prompt","Downstream {{ input }}"}}},{"dynamic_inputs",input},{"dynamic_properties",QJsonObject{{"input",""}}}}}},{"edges",QJsonArray{QJsonObject{{"id","edge"},{"source","source"},{"sourceHandle","output"},{"target","target"},{"targetHandle","input"}}}}};
  const auto created=request("POST","/api/workflows",{{"name","Native durable generation proof"},{"graph",graph}});QVERIFY(created.first>=200 && created.first<300);const auto workflowId=created.second["id"].toString();QVERIFY(!workflowId.isEmpty());QString assetId;
  auto cleanup=qScopeGuard([&]{if(!assetId.isEmpty()){request("POST","/trpc/assets.delete",{{"id",assetId}});}request("DELETE","/api/workflows/"+workflowId,{});});
  WorkflowSession first;QSignalSpy events(&first,&WorkflowSession::runEvent);first.connectToServer(QUrl(base),{});QTRY_VERIFY_WITH_TIMEOUT(first.connected(),10000);QTRY_VERIFY_WITH_TIMEOUT(!first.catalog().isEmpty(),10000);first.openWorkflow(workflowId);QTRY_COMPARE(first.workflow()["id"].toString(),workflowId);QTRY_VERIFY(!first.generationHistory()->loading());
  const auto job=first.run(first.workflow());QVERIFY(!job.isEmpty());
  const auto terminal=[&](const QSignalSpy &rows,const QString &id){for(const auto &row:rows){const auto event=row[1].toJsonObject();if(row[0].toString()==id && event["type"]=="job_update" && (event["status"]=="completed" || event["status"]=="failed")){return true;}}return false;};
  QTRY_VERIFY_WITH_TIMEOUT(terminal(events,job),20000);QJsonObject outputs;
  for(const auto &row:events){const auto event=row[1].toJsonObject();if(row[0].toString()==job && event["type"]=="generation_complete" && event["node_id"]=="source"){outputs=event["outputs"].toObject();}}
  QCOMPARE(outputs["output"].toString(),QString("Saved durable generation"));
  // Persist exactly the real deterministic output. Metadata deliberately
  // contains a different capped preview, which hydration must ignore.
  // native-rules #2: naked new QHttpMultiPart, parent not documented in the statement
  auto multipart=new QHttpMultiPart(QHttpMultiPart::FormDataType);QHttpPart metadataPart;metadataPart.setHeader(QNetworkRequest::ContentDispositionHeader,"form-data; name=\"asset\"");metadataPart.setBody(QJsonDocument(QJsonObject{{"name","Generation.json"},{"parent_id","1"},{"workflow_id",workflowId},{"node_id","source"},{"job_id",job},{"content_type","application/json"},{"metadata",QJsonObject{{"json",QJsonObject{{"output","Wrong preview"}}},{"text","Wrong preview"}}}}).toJson(QJsonDocument::Compact));multipart->append(metadataPart);
  QHttpPart file;file.setHeader(QNetworkRequest::ContentDispositionHeader,"form-data; name=\"file\"; filename=\"generation.json\"");file.setHeader(QNetworkRequest::ContentTypeHeader,"application/json");file.setBody(QJsonDocument(outputs).toJson(QJsonDocument::Compact));multipart->append(file);
  auto reply=network.post(QNetworkRequest(QUrl(base).resolved(QUrl("/api/assets"))),multipart);multipart->setParent(reply);QSignalSpy uploaded(reply,&QNetworkReply::finished);if(!reply->isFinished()){QVERIFY(uploaded.wait(10000));}const auto status=reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();const auto asset=QJsonDocument::fromJson(reply->readAll()).object();reply->deleteLater();QVERIFY2(status>=200 && status<300,qPrintable(QString::number(status)));assetId=asset["id"].toString();QVERIFY(!assetId.isEmpty());QCOMPARE(asset["workflow_id"].toString(),workflowId);QCOMPARE(asset["node_id"].toString(),QString("source"));
  first.generationHistory()->refresh();QTRY_VERIFY(!first.generationHistory()->loading());QVERIFY2(first.generationHistory()->error().isEmpty(),qPrintable(first.generationHistory()->error()));QCOMPARE(first.generationHistory()->outputs("source",assetId),outputs);
  auto pinned=first.workflow();auto pinnedGraph=pinned["graph"].toObject();auto nodes=pinnedGraph["nodes"].toArray();auto source=nodes[0].toObject();auto ui=source["ui_properties"].toObject();ui["selected_generation"]=assetId;source["ui_properties"]=ui;nodes[0]=source;pinnedGraph["nodes"]=nodes;pinned["graph"]=pinnedGraph;first.setSnapshot(pinned);QSignalSpy saved(&first,&WorkflowSession::saved);first.save();QTRY_COMPARE(saved.count(),1);QVERIFY(!first.dirty());
  WorkflowSession reopened;QSignalSpy reopenedEvents(&reopened,&WorkflowSession::runEvent),submitted(&reopened,&WorkflowSession::runSubmitted);reopened.connectToServer(QUrl(base),{});QTRY_VERIFY(reopened.connected());QTRY_VERIFY(!reopened.catalog().isEmpty());reopened.openWorkflow(workflowId);QTRY_COMPARE(reopened.workflow()["id"].toString(),workflowId);QTRY_VERIFY(!reopened.generationHistory()->loading());QVERIFY2(reopened.generationHistory()->error().isEmpty(),qPrintable(reopened.generationHistory()->error()));QVERIFY(reopened.generationHistory()->contains("source",assetId));QCOMPARE(reopened.workflow()["graph"].toObject()["nodes"].toArray()[0].toObject()["ui_properties"].toObject()["selected_generation"].toString(),assetId);
  // Classify deterministic Prompt as a saved-output fixture locally so no
  // provider is paid to verify the generative reuse contract after reopening.
  auto metadata=reopened.catalog()["nodes"].toArray();for(qsizetype i=0;i<metadata.size();++i){auto entry=metadata[i].toObject();if(entry["node_type"]=="nodetool.text.Prompt"){entry["auto_save_asset"]=true;metadata[i]=entry;}}
  const auto before=reopened.workflow();const auto partial=reopened.runSelected(before,{"target"},metadata);QVERIFY2(!partial.isEmpty(),qPrintable(reopened.lastPartialPlan().error));QTRY_VERIFY_WITH_TIMEOUT(terminal(reopenedEvents,partial),20000);QSet<QString> executed;QString result;for(const auto &row:reopenedEvents){const auto event=row[1].toJsonObject();if(row[0].toString()==partial && event["type"]=="generation_complete"){executed.insert(event["node_id"].toString());if(event["node_id"]=="target"){result=event["outputs"].toObject()["output"].toString();}}}QCOMPARE(executed,(QSet<QString>{"target"}));QCOMPARE(result,QString("Downstream Saved durable generation"));QCOMPARE(reopened.workflow(),before);QCOMPARE(request("GET","/api/workflows/"+workflowId,{}).second["graph"],before["graph"]);
  const auto deleted=request("POST","/trpc/assets.delete",{{"id",assetId}});QCOMPARE(deleted.first,200);assetId.clear();reopened.generationHistory()->refresh();QTRY_VERIFY(!reopened.generationHistory()->loading());const auto count=submitted.count();QVERIFY(reopened.runSelected(before,{"target"},metadata).isEmpty());QCOMPARE(submitted.count(),count);QCOMPARE(reopened.workflow(),before);
  qInfo()<<"Live durable proof: generated, persisted full output, pinned/saved/reopened, hydrated authoritative bytes, ran target only, deletion blocked without mutation";
 }
};
QTEST_GUILESS_MAIN(GenerationHistoryLiveTest)
#include "GenerationHistoryLiveTest.moc"
