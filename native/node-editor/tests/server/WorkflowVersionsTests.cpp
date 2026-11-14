#include "server/WorkflowVersions.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QPointer>
class Fixture final : public QTcpServer {
public:
  int status = 200;
  QList<QByteArray> requests;
  std::function<QByteArray(QByteArray)> respond;
  Fixture() {
    listen(QHostAddress::LocalHost);
    connect(this, &QTcpServer::newConnection, this, [this] {
      auto socket = nextPendingConnection();
      socket->setParent(this);
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto buffer = std::make_shared<QByteArray>();
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto served = std::make_shared<bool>(false);
      connect(socket, &QTcpSocket::readyRead, this, [this, socket, buffer, served] {
        *buffer += socket->readAll();
        const auto split = buffer->indexOf("\r\n\r\n");
        if (*served || split < 0) { return; }
        int length = 0;
        for (const auto &line : buffer->left(split).split('\n')) {
          if (line.toLower().startsWith("content-length:")) { length = line.mid(15).trimmed().toInt(); }
        }
        if (buffer->size() < split + 4 + length) { return; }
        *served = true;
        requests.append(*buffer);
        if (!respond) { return; }
        const auto body = respond(*buffer);
        if (body.isNull()) { return; }
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " Response\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};

using namespace nodetool::node_editor;
class Tests : public QObject {
 Q_OBJECT
private slots:
 void diffPropertiesAndConnections() {
  QJsonObject a{{"id","n"},{"data",QJsonObject{{"text","old"}}},{"dynamic_properties",QJsonObject{{"prompt","old"}}},{"ui_properties",QJsonObject{{"selected",false},{"zIndex",1}}}};
  auto b = a; b.insert("ui_properties", QJsonObject{{"selected",true},{"zIndex",9}});
  QJsonObject old{{"nodes",QJsonArray{a}}}, next{{"nodes",QJsonArray{b}}};
  QVERIFY(!WorkflowVersions::graphDiff(old,next)["hasChanges"].toBool());
  b.insert("dynamic_properties",QJsonObject{{"prompt","new"}}); next.insert("nodes",QJsonArray{b});
  QCOMPARE(WorkflowVersions::graphDiff(old,next)["modifiedNodes"].toList().size(),1);
  old.insert("edges",QJsonArray{QJsonObject{{"source","a"},{"target","b"},{"sourceHandle","one"}}});
  next.insert("edges",QJsonArray{QJsonObject{{"source","a"},{"target","b"},{"sourceHandle","two"}}});
  const auto diff = WorkflowVersions::graphDiff(old,next);
  QCOMPARE(diff["addedEdges"].toList().size(),1); QCOMPARE(diff["removedEdges"].toList().size(),1);
 }
 void diffLargeGraph() {
  QJsonArray nodes, edges;
  for (int i = 0; i < 30000; ++i) {
   nodes.append(QJsonObject{{"id", QString::number(i)}, {"data", QJsonObject{{"value", i}}}});
   edges.append(QJsonObject{{"source", QString::number(i)}, {"target", QString::number(i+1)}});
  }
  QJsonObject old{{"nodes",nodes},{"edges",edges}};
  auto changed = nodes[1].toObject(); changed.insert("data", QJsonObject{{"value", -1}}); nodes[1] = changed;
  nodes.removeFirst(); nodes.append(QJsonObject{{"id","new"}});
  edges.removeFirst(); edges.append(QJsonObject{{"source","new"},{"target","1"}});
  auto diff = WorkflowVersions::graphDiff(old, {{"nodes",nodes},{"edges",edges}});
  for (const auto &key : {"addedNodes","removedNodes","modifiedNodes","addedEdges","removedEdges"}) QCOMPARE(diff[key].toList().size(), 1);
  QCOMPARE(diff["modifiedNodes"].toList()[0].toMap()["changes"].toList()[0].toMap()["key"].toString(), QString("value"));
  QVERIFY(!WorkflowVersions::graphDiff(old, old)["hasChanges"].toBool());
 }
 void listEmptyErrorAndStale() {
  Fixture server;
  QByteArray response = R"({"result":{"data":{"versions":[{"version":1,"graph":{"nodes":[],"edges":[]}}]}}})";
  server.respond = [&response](QByteArray req) { if (req.startsWith("GET /api/workflows/")) return QByteArray(R"({"id":"bound","updated_at":"r1","graph":{"nodes":[],"edges":[]}})"); return response; };
  WorkflowSession session; WorkflowDocument doc; WorkflowVersions versions(&session, &doc);
  session.connectToServer(server.url(), "secret"); session.openWorkflow("bound");
  QTRY_VERIFY(session.serverBound());
  versions.load("versions"); QTRY_VERIFY(!versions.busy()); QCOMPARE(versions.rows().size(), 1);
  const auto before = doc.snapshot(); versions.inspect(0); QVERIFY(!versions.preview().isEmpty()); QCOMPARE(doc.snapshot(), before);
  response = R"({"result":{"data":{"versions":[]}}})";
  versions.load("versions"); QTRY_VERIFY(!versions.busy()); QVERIFY(versions.rows().isEmpty());
  response = R"({"error":{"message":"Permission denied"}})";
  server.status = 403; versions.load("versions"); QTRY_VERIFY(!versions.busy()); QVERIFY(versions.error().contains("Permission denied"));
  server.status = 200; response = "invalid"; versions.load("versions"); QTRY_VERIFY(!versions.busy()); QVERIFY(versions.error().contains("Invalid"));
  response = QByteArray{}; versions.load("versions"); QTRY_VERIFY(versions.busy());
  const auto requests = server.requests.size(); QTRY_VERIFY(server.requests.size() > requests);
  session.detachServerWorkflow(); QTRY_VERIFY(!versions.busy());
  const QByteArray late = R"({"result":{"data":{"versions":[{"version":99}]}}})";
  for (auto *socket : server.findChildren<QTcpSocket *>()) if (socket->state() == QAbstractSocket::ConnectedState) {
   socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + QByteArray::number(late.size()) + "\r\n\r\n" + late); socket->disconnectFromHost();
  }
  QTest::qWait(50); QVERIFY(versions.rows().isEmpty()); QVERIFY(versions.preview().isEmpty());
 }
 void accountChangeDiscardsDelayedList() {
  Fixture server;
  server.respond = [](QByteArray req) { return req.startsWith("GET /api/workflows/") ? QByteArray(R"({"id":"bound","updated_at":"r1","graph":{"nodes":[],"edges":[]}})") : QByteArray{}; };
  WorkflowSession session; WorkflowDocument doc; WorkflowVersions versions(&session, &doc);
  session.connectToServer(server.url(), "old-token"); session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
  const auto count = server.requests.size(); versions.load("versions"); QTRY_VERIFY(server.requests.size() > count);
  QVERIFY(server.requests.last().contains("Bearer old-token"));
  session.connectToServer(server.url(), "new-token", "other-user");
  const QByteArray late = R"({"result":{"data":{"versions":[{"version":99}]}}})";
  for (auto *socket : server.findChildren<QTcpSocket *>()) if (socket->state() == QAbstractSocket::ConnectedState) {
   socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + QByteArray::number(late.size()) + "\r\n\r\n" + late); socket->disconnectFromHost();
  }
  QTest::qWait(50); QVERIFY(versions.rows().isEmpty()); QVERIFY(versions.preview().isEmpty()); QVERIFY(!versions.busy());
 }
 void localUnavailable() { WorkflowSession session; WorkflowDocument doc; WorkflowVersions versions(&session, &doc); versions.load("versions"); QVERIFY(versions.error().contains("server")); }
 void graphUndo() { WorkflowDocument doc; const auto before = doc.snapshot(); auto graph = doc.graph(); graph.insert("extra", "preserved"); QVERIFY(doc.applyCommand({{"op", "replaceGraph"}, {"graph", graph}})); QCOMPARE(doc.graph(), graph); doc.undo(); QCOMPARE(doc.snapshot(), before); }
};
QTEST_MAIN(Tests)
#include "WorkflowVersionsTests.moc"

