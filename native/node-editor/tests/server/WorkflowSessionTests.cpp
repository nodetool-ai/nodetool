#include "../../src/server/MsgPack.h"
#include "../../src/server/WorkflowSession.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QTcpServer>
#include <QTcpSocket>
#include <QWebSocketServer>
#include <QtTest>
using namespace nodetool::node_editor;
class Tests : public QObject {
  Q_OBJECT
private slots:
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
    QTRY_VERIFY(!put.isEmpty());
    session.setSnapshot({{"id", "other"},
                         {"name", "local"},
                         {"graph", QJsonObject{{"nodes", QJsonArray{}},
                                               {"edges", QJsonArray{}}}}});
    pending->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " +
                   QByteArray::number(response.size()) + "\r\n\r\n" + response);
    pending->disconnectFromHost();
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
