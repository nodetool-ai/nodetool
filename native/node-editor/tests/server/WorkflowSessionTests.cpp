#include "../../src/server/MsgPack.h"
#include "../../src/server/WorkflowSession.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QTcpServer>
#include <QTcpSocket>
#include <QNetworkReply>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool::node_editor;
class Tests : public QObject {
  Q_OBJECT
private slots:
    void liveSnapshotsAreCachedPerEdit() {
        WorkflowSession session;
        QJsonObject current{{"name", "initial"}};
        int reads = 0;
        session.setSnapshot(current);
        session.setSnapshotProvider([&] {
            ++reads;
            return current;
        });
        current["name"] = "edited";
        session.documentChanged();
        QVERIFY(session.dirty());
        QCOMPARE(reads, 0);
        QCOMPARE(session.workflow(), current);
        QCOMPARE(session.workflow(), current);
        QCOMPARE(reads, 1);
        current["name"] = "latest";
        session.documentChanged();
        QCOMPARE(reads, 1);
        QCOMPARE(session.workflow(), current);
        QCOMPARE(reads, 2);
        session.detachServerWorkflow();
        QCOMPARE(session.workflow(), current);
        QCOMPARE(reads, 2);
        session.disconnectFromServer();
        QCOMPARE(session.workflow(), current);
        QCOMPARE(reads, 3);
    }
  void rejectsUnsafeServerUrls_data() {
    QTest::addColumn<QUrl>("url");
    QTest::addColumn<QString>("token");
    QTest::newRow("scheme") << QUrl("file:///tmp/server") << QString();
    QTest::newRow("credentials") << QUrl("https://user:secret@example.com") << QString();
    QTest::newRow("query") << QUrl("https://example.com?token=secret") << QString();
    QTest::newRow("fragment") << QUrl("https://example.com#secret") << QString();
    QTest::newRow("remote-http-token") << QUrl("http://example.com") << QString("secret");
  }
  void rejectsUnsafeServerUrls() {
    QFETCH(QUrl, url);
    QFETCH(QString, token);
    WorkflowSession session;
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    session.connectToServer(url, token);
    QCOMPARE(errors.count(), 1);
    QVERIFY(session.serverUrl().isEmpty());
    QVERIFY(!session.connected());
    QVERIFY(!errors.first().first().toString().contains("secret"));
  }
  void codec() {
    QJsonObject value{
        {"command", "run_job"},
        {"data", QJsonObject{{"job_id", "abcdef"}, {"seq", 12}, {"ok", true}}}};
    QCOMPARE(decodeMsgPack(encodeMsgPack(value)).value().toObject(), value);
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("df7fffffff")));
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("81a178")));
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("a1ff")));
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("82a17801a17802")));
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("cb7ff0000000000000")));
    QVERIFY(!decodeMsgPack(QByteArray::fromHex("c000")));
  }
  void selectedRunValidationDependenciesAndConstants() {
    QWebSocketServer server("selected run", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QJsonObject> commands;
    connect(&server, &QWebSocketServer::newConnection, this, [&] {
      auto peer = server.nextPendingConnection(); peer->setParent(&server);
      connect(peer, &QWebSocket::binaryMessageReceived, this, [&](const QByteArray &bytes) {
        const auto message = decodeMsgPack(bytes); QVERIFY(message); commands.append(message->toObject());
      });
    });
    WorkflowSession session;
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    session.connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    QTRY_VERIFY(session.connected());
    const auto node = [](const QString &id, const QString &type) { return QJsonObject{{"id", id}, {"type", type}, {"future", true}, {"data", QJsonObject{{"value", id}}}}; };
    const auto edge = [](const QString &source, const QString &target, const QString &handle = "input") { return QJsonObject{{"id", source + target}, {"source", source}, {"target", target}, {"sourceHandle", "value"}, {"targetHandle", handle}, {"futureEdge", true}}; };
    auto constant = node("constant", "nodetool.constant.String");
    constant["dynamic_properties"] = QJsonObject{{"value", "live dynamic constant"}};
    auto disabled = node("disabled", "computed"); disabled["ui_properties"] = QJsonObject{{"bypassed", true}, {"future", true}};
    const QJsonArray metadata{QJsonObject{{"node_type", "computed"}}, QJsonObject{{"node_type", "generative"}, {"auto_save_asset", true}, {"title", "Generator"}}};
    const QJsonObject graph{{"nodes", QJsonArray{constant, node("upstream", "computed"), node("target", "computed"), node("downstream", "computed"), node("unrelated", "computed"), disabled}},
      {"edges", QJsonArray{edge("constant", "upstream"), edge("upstream", "target"), edge("target", "downstream"), edge("disabled", "target", "other")}}, {"futureGraph", true}};
    const QJsonObject snapshot{{"id", "workflow"}, {"name", "Selection"}, {"futureWorkflow", true}, {"graph", graph}};
    QVERIFY(session.runSelected(snapshot, {}, metadata).isEmpty());
    QVERIFY(session.runSelected(snapshot, {"missing"}, metadata).isEmpty());
    QVERIFY(session.runSelected(snapshot, {"target", "missing"}, metadata).isEmpty());
    QVERIFY(session.runSelected(snapshot, {"disabled"}, metadata).isEmpty());
    QVERIFY(errors.count() >= 4); QTest::qWait(20); QVERIFY(commands.isEmpty());
    auto id = session.runSelected(snapshot, {"target", "target"}, metadata, {{"parameter", 7}}); QVERIFY(!id.isEmpty());
    QTRY_COMPARE(commands.size(), 1);
    const auto data = commands.last()["data"].toObject(); const auto submitted = data["graph"].toObject();
    QCOMPARE(data["params"].toObject()["parameter"].toInt(), 7);
    QCOMPARE(submitted["nodes"].toArray().size(), 2); QCOMPARE(submitted["edges"].toArray(), QJsonArray{edge("upstream", "target")});
    const auto upstream = submitted["nodes"].toArray().first().toObject();
    QCOMPARE(upstream["id"].toString(), QString("upstream")); QCOMPARE(upstream["data"].toObject()["input"].toString(), QString("live dynamic constant")); QVERIFY(upstream["future"].toBool());
    QCOMPARE(snapshot["graph"].toObject(), graph);
    auto generated = snapshot; auto generatedGraph = graph; auto nodes = graph["nodes"].toArray();
    auto generator = nodes[1].toObject(); generator["type"] = "generative"; nodes[1] = generator; generatedGraph["nodes"] = nodes; generated["graph"] = generatedGraph;
    QVERIFY(session.runSelected(generated, {"target"}, metadata).isEmpty());
    QVERIFY(errors.last().first().toString().contains("generative")); QTest::qWait(20); QCOMPARE(commands.size(), 1);
    QVERIFY(!session.runSelected(generated, {"target", "upstream"}, metadata).isEmpty()); QTRY_COMPARE(commands.size(), 2);
    QCOMPARE(commands.last()["data"].toObject()["graph"].toObject()["nodes"].toArray().size(), 2);
    QVERIFY(!session.runSelected(snapshot, {"disabled", "target"}, metadata).isEmpty()); QTRY_COMPARE(commands.size(), 3);
    QCOMPARE(commands.last()["data"].toObject()["graph"].toObject()["nodes"].toArray().size(), 2);
    auto first = node("first", "nodetool.constant.String"); first["data"] = QJsonObject{{"value", QJsonValue::Null}};
    auto second = node("second", "nodetool.input.String");
    auto target = node("collect", "computed"); target["dynamic_properties"] = QJsonObject{{"input", "old"}};
    auto collectMetadata = metadata;
    collectMetadata[0] = QJsonObject{{"node_type", "computed"}, {"properties", QJsonArray{QJsonObject{{"name", "input"}, {"type", QJsonObject{{"type", "list"}, {"type_args", QJsonArray{QJsonObject{{"type", "str"}}}}}}}}}};
    const QJsonObject collect{{"graph", QJsonObject{{"nodes", QJsonArray{first, second, target}}, {"edges", QJsonArray{edge("first", "collect"), edge("second", "collect")}}}}};
    QVERIFY(!session.runSelected(collect, {"collect"}, collectMetadata).isEmpty()); QTRY_COMPARE(commands.size(), 4);
    const auto submittedCollect = commands.last()["data"].toObject()["graph"].toObject();
    QCOMPARE(submittedCollect["nodes"].toArray().size(), 1); QVERIFY(submittedCollect["edges"].toArray().isEmpty());
    QCOMPARE(submittedCollect["nodes"].toArray().first().toObject()["dynamic_properties"].toObject()["input"].toArray(), (QJsonArray{QJsonValue::Null, "second"}));
    QJsonArray chain, chainEdges;
    for (int i = 0; i < 1000; ++i) { chain.append(node(QString::number(i), "computed")); if (i > 0) { chainEdges.append(edge(QString::number(i-1), QString::number(i))); } }
    chainEdges.append(edge("999", "0"));
    const QJsonObject cyclic{{"graph", QJsonObject{{"nodes", chain}, {"edges", chainEdges}}}};
    QVERIFY(!session.runSelected(cyclic, {"999"}, metadata).isEmpty()); QTRY_COMPARE(commands.size(), 5);
    QCOMPARE(commands.last()["data"].toObject()["graph"].toObject()["nodes"].toArray().size(), 1000);
  }
  void authoritativeGenerationReuseOnTheWire() {
    QWebSocketServer server("generation reuse", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QJsonObject> commands; QPointer<QWebSocket> peer;
    connect(&server,&QWebSocketServer::newConnection,this,[&]{peer=server.nextPendingConnection();peer->setParent(&server);connect(peer,&QWebSocket::binaryMessageReceived,this,[&](const QByteArray &bytes){const auto message=decodeMsgPack(bytes);QVERIFY(message);commands.append(message->toObject());});});
    WorkflowSession session; QSignalSpy events(&session,&WorkflowSession::runEvent);
    session.connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),{}); QTRY_VERIFY(session.connected());
    const QJsonArray metadata{QJsonObject{{"node_type","generator"},{"auto_save_asset",true}},QJsonObject{{"node_type","target"}}}; session.setNodeMetadata(metadata);
    const QJsonObject snapshot{{"id","workflow"},{"graph",QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id","g"},{"type","generator"},{"data",QJsonObject{{"prompt","first"}}}},QJsonObject{{"id","t"},{"type","target"}},QJsonObject{{"id","unrelated"},{"type","target"}}}},{"edges",QJsonArray{QJsonObject{{"id","edge"},{"source","g"},{"target","t"},{"sourceHandle","out"},{"targetHandle","input"}}}}}}};
    const auto full=session.run(snapshot); QVERIFY(!full.isEmpty()); QTRY_COMPARE(commands.size(),1);
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type","output_update"},{"job_id",full},{"job_seq",1},{"node_id","g"},{"output_name","out"},{"value","incomplete preview"}})); QTRY_COMPARE(events.count(),1);
    QVERIFY(session.runSelected(snapshot,{"t"},metadata).isEmpty()); QCOMPARE(commands.size(),1);
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type","generation_complete"},{"job_id",full},{"job_seq",2},{"index",0},{"node_id","g"},{"outputs",QJsonObject{{"out","complete authoritative value"}}}}));
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type","job_update"},{"job_id",full},{"job_seq",3},{"status","completed"}})); QTRY_COMPARE(events.count(),3);
    const auto partial=session.runSelected(snapshot,{"t"},metadata); QVERIFY(!partial.isEmpty()); QTRY_COMPARE(commands.size(),2);
    const auto graph=commands.last()["data"].toObject()["graph"].toObject(); QCOMPARE(graph["nodes"].toArray().size(),1); QVERIFY(graph["edges"].toArray().isEmpty());
    const auto target=graph["nodes"].toArray().first().toObject(); QCOMPARE(target["id"].toString(),QString("t")); QCOMPARE(target["data"].toObject()["input"].toString(),QString("complete authoritative value"));
    QCOMPARE(session.lastPartialPlan().reused,QStringList{"g"});
    auto pinned=snapshot; auto pinnedGraph=pinned["graph"].toObject(); auto nodes=pinnedGraph["nodes"].toArray(); auto g=nodes[0].toObject(); g["ui_properties"]=QJsonObject{{"selected_generation","missing"}}; nodes[0]=g; pinnedGraph["nodes"]=nodes; pinned["graph"]=pinnedGraph;
    QVERIFY(session.runSelected(pinned,{"t"},metadata).isEmpty()); QTest::qWait(20); QCOMPARE(commands.size(),2);
    session.clearGenerations(); QVERIFY(session.runSelected(snapshot,{"t"},metadata).isEmpty()); QCOMPARE(commands.size(),2);
  }
  void liveDeterministicSubsetAndCache() {
    const auto base=qEnvironmentVariable("NODETOOL_PARTIAL_LIVE_URL");
    if(base.isEmpty()){QSKIP("Set NODETOOL_PARTIAL_LIVE_URL to a disposable backend for live partial execution");}
    WorkflowSession session; QSignalSpy events(&session,&WorkflowSession::runEvent),errors(&session,&WorkflowSession::errorOccurred);
    session.connectToServer(QUrl(base),{}); QTRY_VERIFY_WITH_TIMEOUT(session.connected(),10000); QTRY_VERIFY_WITH_TIMEOUT(!session.catalog().isEmpty(),10000);
    const auto metadata=session.catalog()["nodes"].toArray(); QVERIFY(!metadata.isEmpty()); session.setNodeMetadata(metadata);
    const auto textNode=[](QString id,QString type,QJsonObject data){return QJsonObject{{"id",id},{"type",type},{"data",data},{"future",true}};};
    auto constant=textNode("source","nodetool.constant.String",{{"value","native"}});
    auto transform=textNode("transform","nodetool.text.Prompt",{{"prompt","{{ input|upper }}"}});
    auto target=textNode("target","nodetool.text.Prompt",{{"prompt","Result {{ input }}"}});
    const QJsonObject input{{"input",QJsonObject{{"type",QJsonObject{{"type","str"},{"type_args",QJsonArray{}}}},{"required",true}}}};
    transform["dynamic_inputs"]=input; transform["dynamic_properties"]=QJsonObject{{"input",""}};
    target["dynamic_inputs"]=input; target["dynamic_properties"]=QJsonObject{{"input",""}};
    auto disabled=textNode("disabled","nodetool.text.Prompt",{{"prompt","must not execute"}}); disabled["ui_properties"]=QJsonObject{{"bypassed",true}};
    const auto edge=[](QString source,QString target,QString handle="input"){return QJsonObject{{"id",source+target},{"source",source},{"sourceHandle","output"},{"target",target},{"targetHandle",handle}};};
    QJsonObject snapshot{{"name","Native deterministic partial execution"},{"graph",QJsonObject{{"nodes",QJsonArray{constant,transform,target,textNode("unrelated","nodetool.text.Prompt",{{"prompt","unrelated"}}),disabled}},{"edges",QJsonArray{edge("source","transform"),edge("transform","target"),edge("disabled","target","ignored")}}}}};
    QNetworkAccessManager network;
    const auto request=[&](const QByteArray &method,const QString &path,const QJsonObject &body){QNetworkRequest req(QUrl(base).resolved(QUrl(path)));req.setHeader(QNetworkRequest::ContentTypeHeader,"application/json");auto reply=network.sendCustomRequest(req,method,(method=="GET" || method=="DELETE") ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));QSignalSpy done(reply,&QNetworkReply::finished);if(!reply->isFinished()){done.wait(10000);}const auto bytes=reply->readAll();const auto status=reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();reply->deleteLater();return qMakePair(status,QJsonDocument::fromJson(bytes).object());};
    const auto created=request("POST","/api/workflows",snapshot); QVERIFY2(created.first>=200 && created.first<300,qPrintable(QString::number(created.first))); const auto workflowId=created.second["id"].toString(); QVERIFY(!workflowId.isEmpty()); snapshot["id"]=workflowId;
    const auto persistedBefore=request("GET","/api/workflows/"+workflowId,{}); QCOMPARE(persistedBefore.first,200);
    const auto authored=snapshot;
    const auto terminal=[&](const QString &job){for(const auto &row:events){const auto event=row[1].toJsonObject();if(row[0].toString()==job && event["type"]=="job_update" && (event["status"]=="completed" || event["status"]=="failed" || event["status"]=="cancelled")){return true;}}return false;};
    const auto executed=[&](const QString &job){QSet<QString> result;for(const auto &row:events){const auto event=row[1].toJsonObject();if(row[0].toString()==job && (event["type"]=="generation_complete" || (event["type"]=="node_update" && event["status"]=="completed"))){result.insert(event["node_id"].toString());}}return result;};
    const auto output=[&](const QString &job){QString result;for(const auto &row:events){const auto event=row[1].toJsonObject();if(row[0].toString()==job && event["type"]=="generation_complete" && event["node_id"]=="target"){result=event["outputs"].toObject()["output"].toString();}}return result;};
    const auto full=session.run(snapshot); QVERIFY(!full.isEmpty()); QTRY_VERIFY_WITH_TIMEOUT(terminal(full),20000); QCOMPARE(output(full),QString("Result NATIVE")); QCOMPARE(executed(full),(QSet<QString>{"transform","target","unrelated"}));
    const auto cached=session.runSelected(snapshot,{"target"},metadata); QVERIFY2(!cached.isEmpty(),qPrintable(session.lastPartialPlan().error)); QTRY_VERIFY_WITH_TIMEOUT(terminal(cached),20000); QCOMPARE(executed(cached),(QSet<QString>{"target"})); QCOMPARE(output(cached),QString("Result NATIVE")); QCOMPARE(snapshot,authored);
    auto graph=snapshot["graph"].toObject(); auto nodes=graph["nodes"].toArray(); constant["data"]=QJsonObject{{"value","changed"}}; nodes[0]=constant; graph["nodes"]=nodes; snapshot["graph"]=graph; const auto edited=snapshot;
    const auto fresh=session.runSelected(snapshot,{"target"},metadata); QVERIFY2(!fresh.isEmpty(),qPrintable(session.lastPartialPlan().error)); QTRY_VERIFY_WITH_TIMEOUT(terminal(fresh),20000); QCOMPARE(executed(fresh),(QSet<QString>{"transform","target"})); QCOMPARE(output(fresh),QString("Result CHANGED")); QCOMPARE(snapshot,edited);
    // Use deterministic Prompt outputs as a generative-metadata fixture to
    // verify the real ForEach replay protocol without a provider-paid call.
    auto replayMetadata=metadata;
    for(qsizetype i=0;i<replayMetadata.size();++i){auto entry=replayMetadata[i].toObject();if(entry["node_type"]=="nodetool.text.Prompt"){entry["auto_save_asset"]=true;replayMetadata[i]=entry;}}
    auto replay=snapshot; auto replayGraph=replay["graph"].toObject(); auto replayNodes=replayGraph["nodes"].toArray(); auto replaySource=replayNodes[1].toObject(); replaySource["ui_properties"]=QJsonObject{{"selected_generations",QJsonArray{fresh,full}}}; replayNodes[1]=replaySource; replayGraph["nodes"]=replayNodes; replay["graph"]=replayGraph; const auto replayOriginal=replay;
    const auto replayJob=session.runSelected(replay,{"target"},replayMetadata); QVERIFY2(!replayJob.isEmpty(),qPrintable(session.lastPartialPlan().error)); QTRY_VERIFY_WITH_TIMEOUT(terminal(replayJob),20000);
    QStringList replayValues; for(const auto &row:events){const auto event=row[1].toJsonObject();if(row[0].toString()==replayJob && event["type"]=="generation_complete" && event["node_id"]=="target"){replayValues.append(event["outputs"].toObject()["output"].toString());}}
    QCOMPARE(replayValues,(QStringList{"Result CHANGED","Result NATIVE"})); const auto replayExecuted=executed(replayJob); QVERIFY(replayExecuted.contains("target")); QVERIFY(!replayExecuted.contains("transform")); QVERIFY(!replayExecuted.contains("disabled")); QVERIFY(!replayExecuted.contains("unrelated")); QCOMPARE(replay,replayOriginal);
    const auto persistedAfter=request("GET","/api/workflows/"+workflowId,{}); QCOMPARE(persistedAfter.first,200); QCOMPARE(persistedAfter.second["graph"],persistedBefore.second["graph"]);
    const auto removed=request("DELETE","/api/workflows/"+workflowId,{}); QVERIFY(removed.first>=200 && removed.first<300);
    qInfo()<<"Live partial execution verified cached target only, edited dependency rerun, ordered replay via deterministic generative-metadata fixture, correct output, disabled/unrelated omission, unchanged local/server workflow";
  }
  void websocketRunsAreIndependent() {
    QWebSocketServer server("test", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QPointer<QWebSocket> peer;
    QList<QJsonObject> commands;
    connect(&server, &QWebSocketServer::newConnection, this, [&] {
      peer = server.nextPendingConnection();
      peer->setParent(&server);
      connect(peer, &QWebSocket::binaryMessageReceived, this,
              [&](QByteArray bytes) {
                auto v = decodeMsgPack(bytes);
                QVERIFY(v.has_value());
                commands.append(v->toObject());
              });
    });
    WorkflowSession session;
    QSignalSpy events(&session, &WorkflowSession::runEvent);
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    session.connectToServer(
        QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),
        "secret");
    QTRY_VERIFY(session.connected());
    const QJsonObject graph{
        {"nodes", QJsonArray{QJsonObject{{"id", "on"}, {"type", "x"}},
                             QJsonObject{{"id", "off"},
                                         {"ui_properties",
                                          QJsonObject{{"bypassed", true}}}}}},
        {"edges",
         QJsonArray{QJsonObject{{"source", "on"}, {"target", "off"}}}}};
    const QJsonObject snapshot{
        {"id", "workflow"}, {"name", "Test"}, {"graph", graph}};
    auto first = session.run(snapshot);
    auto second = session.run(snapshot);
    QVERIFY(first != second);
    QTRY_COMPARE(commands.size(), 2);
    QCOMPARE(commands[0]["command"].toString(), QString("run_job"));
    const auto data = commands[0]["data"].toObject();
    QCOMPARE(data["type"].toString(), QString("run_job_request"));
    QVERIFY(data["concurrent"].toBool());
    QCOMPARE(data["execution_strategy"].toString(), QString("threaded"));
    QCOMPARE(data["params"].toObject(), QJsonObject{});
    QCOMPARE(data["settings"].toObject(), QJsonObject{});
    QVERIFY(!data["explicit_types"].toBool());
    const auto submitted = commands[0]["data"].toObject()["graph"].toObject();
    QCOMPARE(submitted["nodes"].toArray().size(), 1);
    QVERIFY(submitted["edges"].toArray().isEmpty());
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "node_update"},
                                                      {"job_id", first},
                                                      {"node_id", "on"},
                                                      {"job_seq", 1}}));
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "node_update"},
                                                      {"job_id", second},
                                                      {"node_id", "on"},
                                                      {"job_seq", 1}}));
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{
        {"type", "node_update"}, {"job_id", first}, {"job_seq", 1}}));
    QTRY_COMPARE(events.count(), 2);
    QCOMPARE(events[0][0].toString(), first);
    QCOMPARE(events[1][0].toString(), second);
    const auto priorErrors = errors.count();
    peer->sendBinaryMessage(QByteArray::fromHex("81a178"));
    QTRY_COMPARE(errors.count(), priorErrors + 1);
    QCOMPARE(events.count(), 2);
    session.stop(first);
    session.reconnectRuns();
    QTRY_COMPARE(commands.size(), 5);
    QCOMPARE(commands[2]["command"].toString(), QString("cancel_job"));
    QCOMPARE(commands[2]["data"].toObject()["job_id"].toString(), first);
    QCOMPARE(commands[3]["data"].toObject()["last_seq"].toInt(), 1);
    peer->close();
    QTRY_VERIFY(!session.connected());
    QVERIFY(session.run(snapshot).isEmpty());
    session.reconnectTransport();
    QTRY_VERIFY(session.connected());
    QTRY_VERIFY(peer);
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{
        {"type", "node_update"}, {"job_id", first}, {"job_seq", 1}}));
    peer->sendBinaryMessage(encodeMsgPack(QJsonObject{
        {"type", "node_update"}, {"job_id", second}, {"job_seq", 1}}));
    QTest::qWait(20);
    QVERIFY(session.run(snapshot).isEmpty());
    QCOMPARE(events.count(), 2);
    for (const auto &id : {first, second}) {
      peer->sendBinaryMessage(
          encodeMsgPack(QJsonObject{{"type", "job_resumed"},
                                    {"job_id", id},
                                    {"status", "finished"},
                                    {"last_seq", 1},
                                    {"replay_count", 0},
                                    {"replay_incomplete", false}}));
    }
    QTRY_COMPARE(events.count(), 4);
    QVERIFY(!session.run(snapshot).isEmpty());
  }
  void rejectedWebsocketAuthentication() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto *socket = server.nextPendingConnection();
      socket->setParent(&server);
      connect(socket, &QTcpSocket::readyRead, this, [socket] {
        socket->readAll();
        socket->write("HTTP/1.1 401 Unauthorized\r\nConnection: "
                      "close\r\nContent-Length: 2\r\n\r\n{}");
        socket->disconnectFromHost();
      });
    });
    WorkflowSession session;
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    session.connectToServer(
        QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),
        "invalid");
    QTRY_VERIFY(errors.count() >= 2);
    QVERIFY(!session.connected());
    QVERIFY(session.run({}).isEmpty());
  }
  void delayedLoadsAndCreateSave() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QByteArray> requests;
    QList<QPointer<QTcpSocket>> sockets;
    auto respond = [](QTcpSocket *socket, QByteArray body, int status = 200) {
      socket->write("HTTP/1.1 " + QByteArray::number(status) +
                    " Response\r\nConnection: close\r\nContent-Length: " +
                    QByteArray::number(body.size()) + "\r\n\r\n" + body);
      socket->disconnectFromHost();
    };
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto *socket = server.nextPendingConnection();
      socket->setParent(&server);
      connect(socket, &QTcpSocket::readyRead, this, [&, socket] {
        auto bytes =
            socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        const auto end = bytes.indexOf("\r\n\r\n");
        if (end < 0 || socket->property("handled").toBool()) {
          return;
        }
        int length = 0;
        for (auto line : bytes.left(end).split('\n')) {
          if (line.toLower().startsWith("content-length:")) {
            length = line.mid(15).trimmed().toInt();
          }
        }
        if (bytes.size() - end - 4 < length) {
          return;
        }
        socket->setProperty("handled", true);
        if (bytes.startsWith("GET /ws")) {
          socket->disconnectFromHost();
          return;
        }
        if (bytes.startsWith("GET /api/nodes")) {
          respond(socket, "[]");
          return;
        }
        if (bytes.startsWith("GET /trpc/jobs.list")) {
          respond(socket, R"({"result":{"data":{"jobs":[]}}})");
          return;
        }
        requests.append(bytes);
        sockets.append(socket);
      });
    });
    WorkflowSession session;
    QSignalSpy errors(&session, &WorkflowSession::errorOccurred);
    QSignalSpy saved(&session, &WorkflowSession::saved);
    const QUrl base(QString("http://127.0.0.1:%1").arg(server.serverPort()));
    session.connectToServer(base, "secret");
    session.setSnapshot({{"name", "new"},
                         {"graph", QJsonObject{{"nodes", QJsonArray{}},
                                               {"edges", QJsonArray{}}}}});
    session.save();
    QTRY_COMPARE(requests.size(), 1);
    QVERIFY(requests[0].startsWith("POST /api/workflows "));
    QVERIFY(!requests[0].contains("expected_updated_at"));
    QVERIFY(requests[0].contains("\"access\":\"private\""));
    auto edited = session.workflow();
    edited.insert("name", "newer");
    session.setSnapshot(edited);
    respond(
        sockets[0],
        R"({"id":"created","updated_at":"r1","name":"new","graph":{"nodes":[],"edges":[]}})");
    QTRY_COMPARE(saved.count(), 1);
    QVERIFY(session.dirty());
    QCOMPARE(session.workflow()["id"].toString(), QString("created"));
    QCOMPARE(session.workflow()["name"].toString(), QString("newer"));
    session.openWorkflow("forbidden");
    QTRY_COMPARE(requests.size(), 2);
    respond(sockets[1], "{}", 401);
    QTRY_VERIFY(!session.saving());
    QTest::qWait(20);
    session.save();
    QTRY_COMPARE(requests.size(), 3);
    QVERIFY(requests[2].startsWith("PUT /api/workflows/created "));
    QVERIFY(requests[2].contains("\"expected_updated_at\":\"r1\""));
    respond(sockets[2], "{}", 403);
    QTRY_VERIFY(!session.saving());
    QVERIFY(session.dirty());
    session.openWorkflow("old");
    QTRY_COMPARE(requests.size(), 4);
    session.openWorkflow("latest");
    QTRY_COMPARE(requests.size(), 5);
    respond(
        sockets[4],
        R"({"id":"latest","updated_at":"r8","graph":{"nodes":[],"edges":[]}})");
    QTRY_COMPARE(session.workflow()["id"].toString(), QString("latest"));
    respond(
        sockets[3],
        R"({"id":"old","updated_at":"r2","graph":{"nodes":[],"edges":[]}})");
    QTest::qWait(20);
    QCOMPARE(session.workflow()["id"].toString(), QString("latest"));
    session.openWorkflow("old-account");
    QTRY_COMPARE(requests.size(), 6);
    session.connectToServer(base, "other-token", "other-user");
    if (sockets[5]) {
      respond(
          sockets[5],
          R"({"id":"old-account","updated_at":"r2","graph":{"nodes":[],"edges":[]}})");
    }
    QTest::qWait(20);
    QVERIFY(session.workflow().isEmpty());
    QVERIFY(!session.dirty());
    QVERIFY(!session.saving());
    QVERIFY(errors.count() >= 2);
  }
  void authenticatedSaveRetainsNewerEdits() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    WorkflowSession session;
    QSignalSpy loaded(&session, &WorkflowSession::workflowChanged);
    QSignalSpy saved(&session, &WorkflowSession::saved);
    QByteArray put;
    QPointer<QTcpSocket> pending;
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto *socket = server.nextPendingConnection();
      connect(socket, &QTcpSocket::readyRead, this, [&, socket] {
        auto b = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", b);
        if (!b.contains("\r\n\r\n")) {
          return;
        }
        if (b.startsWith("PUT")) {
          const auto header = b.left(b.indexOf("\r\n\r\n"));
          int length = 0;
          for (const auto &line : header.split('\n')) {
            if (line.toLower().startsWith("content-length:")) {
              length = line.mid(15).trimmed().toInt();
            }
          }
          if (b.size() - b.indexOf("\r\n\r\n") - 4 < length) {
            return;
          }
          put = b;
          pending = socket;
          return;
        }
        if (b.startsWith("GET /ws")) {
          socket->disconnectFromHost();
          return;
        }
        const QByteArray body =
            b.startsWith("GET /api/nodes")
                ? R"([{"node_type":"test.node","properties":[{"name":"value","default":7}]}])"
                : R"({"id":"test","updated_at":"r1","name":"old","graph":{"nodes":[],"edges":[]}})";
        socket->write(
            "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " +
            QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
    session.connectToServer(
        QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())),
        "secret");
    session.openWorkflow("test");
    QTRY_VERIFY(session.catalog().contains("nodes"));
    QCOMPARE(session.catalog()["nodes"]
                 .toArray()[0]
                 .toObject()["properties"]
                 .toArray()[0]
                 .toObject()["default"]
                 .toInt(),
             7);
    QTRY_COMPARE(session.workflow()["updated_at"].toString(), QString("r1"));
    auto snapshot = session.workflow();
    snapshot.insert("name", "first");
    session.setSnapshot(snapshot);
    session.save();
    QTRY_VERIFY(!put.isEmpty());
    QVERIFY(put.contains("Authorization: Bearer secret"));
    QVERIFY(put.contains("\"expected_updated_at\":\"r1\""));
    snapshot.insert("name", "second");
    session.setSnapshot(snapshot);
    const QByteArray response =
        R"({"id":"test","name":"first","updated_at":"r2"})";
    pending->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " +
                   QByteArray::number(response.size()) + "\r\n\r\n" + response);
    pending->disconnectFromHost();
    QTRY_COMPARE(saved.count(), 1);
    QVERIFY(session.dirty());
    QCOMPARE(session.workflow()["name"].toString(), QString("second"));
    QSignalSpy conflicts(&session, &WorkflowSession::saveConflict);
    put.clear();
    session.save();
    QTRY_VERIFY(!put.isEmpty());
    QVERIFY(put.contains("\"expected_updated_at\":\"r2\""));
    pending->write("HTTP/1.1 409 Conflict\r\nConnection: "
                   "close\r\nContent-Length: 2\r\n\r\n{}");
    pending->disconnectFromHost();
    QTRY_COMPARE(conflicts.count(), 1);
    QVERIFY(session.dirty());
    QCOMPARE(session.workflow()["name"].toString(), QString("second"));
    put.clear();
    session.save();
    QTest::qWait(20);
    QVERIFY(put.isEmpty()); // An unresolved conflict cannot silently overwrite.
    session.setSnapshot({{"id", "other"},
                         {"name", "local"},
                         {"graph", QJsonObject{{"nodes", QJsonArray{}},
                                               {"edges", QJsonArray{}}}}});
    QTest::qWait(20);
    QCOMPARE(saved.count(), 1);
    QCOMPARE(session.workflow()["id"].toString(), QString("other"));
    QVERIFY(session.dirty());
    QVERIFY(!session.saving());
    session.disconnectFromServer();
    QVERIFY(session.workflow().isEmpty());
  }
};
QTEST_GUILESS_MAIN(Tests)
#include "WorkflowSessionTests.moc"
