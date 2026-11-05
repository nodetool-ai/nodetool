#include "../../src/server/WorkflowSession.h"
#include <QJsonDocument>
#include <QWebSocketServer>
#include "../../src/server/MsgPack.h"
#include <QPointer>
#include <QNetworkReply>
#include <QScopeGuard>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
using namespace nodetool::node_editor;
static QJsonObject graphValue(const QJsonValue &value) {
  return {{"nodes", QJsonArray{QJsonObject{{"id", "node"}, {"type", "fixture"}, {"data", QJsonObject{{"value", value}}}}}}, {"edges", QJsonArray{}}};
}
class Http final : public QObject {
public:
  QTcpServer server;
  QWebSocketServer websocket{"changes", QWebSocketServer::NonSecureMode};
  QPointer<QWebSocket> peer;
  QJsonObject remote{{"id", "bound"}, {"updated_at", "r1"}, {"name", "Original"},
    {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
  QList<QJsonObject> writes;
  int status = 200, reads = 0;
  bool skip = false, delay = false, delayReads = false;
  QPointer<QTcpSocket> pending, pendingRead;
  QJsonObject pendingBody;
  Http() {
    server.listen(QHostAddress::LocalHost);
    connect(&websocket, &QWebSocketServer::newConnection, this, [this] {
      peer = websocket.nextPendingConnection(); peer->setParent(this);
    });
    connect(&server, &QTcpServer::newConnection, this, [this] {
      while (server.hasPendingConnections()) {
        auto *socket = server.nextPendingConnection(); socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          if (socket->peek(32).startsWith("GET /ws ")) {
            socket->disconnect(this); websocket.handleConnection(socket); return;
          }
          auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
          socket->setProperty("bytes", bytes);
          const auto end = bytes.indexOf("\r\n\r\n"); if (end < 0) return;
          int length = 0;
          for (const auto &line : bytes.left(end).split('\n'))
            if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toInt();
          if (bytes.size() < end + 4 + length || socket->property("done").toBool()) return;
          socket->setProperty("done", true);
          const auto path = bytes.split(' ').value(1);
          const auto body = QJsonDocument::fromJson(bytes.mid(end + 4)).object();
          if (path == "/trpc/workflows.autosave" || (bytes.startsWith("PUT") && path == "/api/workflows/bound")) {
            writes.append(body);
            if (delay) { pending = socket; pendingBody = body; return; }
            finish(socket, body, path.startsWith("/trpc"));
          } else if (path == "/api/workflows/bound") {
            ++reads;
            if (delayReads) { pendingRead = socket; return; }
            reply(socket, remote);
          }
          else if (path.startsWith("/trpc/assets.list")) reply(socket, QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"assets", QJsonArray{}}, {"next", QJsonValue::Null}}}}}});
          else reply(socket, {});
        });
      }
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())); }
  void reply(QTcpSocket *socket, const QJsonObject &value, int code = 200) {
    auto data = QJsonDocument(value).toJson(QJsonDocument::Compact);
    socket->write("HTTP/1.1 " + QByteArray::number(code) + " Response\r\nConnection: close\r\nContent-Length: " + QByteArray::number(data.size()) + "\r\n\r\n" + data);
    socket->disconnectFromHost();
  }
  void finish(QTcpSocket *socket, const QJsonObject &body, bool autosave = true) {
    if (status != 200) { reply(socket, {}, status); return; }
    if (!skip) { remote["graph"] = body["graph"]; remote["updated_at"] = "r" + QString::number(writes.size() + 1); }
    if (autosave) reply(socket, QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"updated_at", remote["updated_at"]}, {"skipped", skip}, {"etag", "etag"}}}}}});
    else reply(socket, remote);
  }
};
class AutosaveTests final : public QObject {
  Q_OBJECT
private slots:
  void liveDisposableAutosaveAndExternalUpdate() {
    const auto base = qEnvironmentVariable("NODETOOL_PARTIAL_LIVE_URL");
    if (base.isEmpty()) QSKIP("Set NODETOOL_PARTIAL_LIVE_URL to a disposable backend");
    QNetworkAccessManager network;
    const auto request = [&](const QByteArray &method, const QString &path, const QJsonObject &body) {
      QNetworkRequest req(QUrl(base).resolved(QUrl(path)));
      req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
      auto *reply = network.sendCustomRequest(req, method, method == "GET" || method == "DELETE" ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));
      QSignalSpy done(reply, &QNetworkReply::finished); if (!reply->isFinished()) done.wait(10000);
      const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
      const auto object = QJsonDocument::fromJson(reply->readAll()).object(); reply->deleteLater();
      return qMakePair(status, object);
    };
    const QJsonObject graph{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}};
    auto created = request("POST", "/api/workflows", {{"name", "Native autosave disposable proof"}, {"graph", graph}});
    QVERIFY(created.first >= 200 && created.first < 300);
    const auto id = created.second["id"].toString(); QVERIFY(!id.isEmpty());
    auto cleanup = qScopeGuard([&] { request("DELETE", "/api/workflows/" + id, {}); });
    WorkflowSession session; session.setAutosaveDelay(20); session.connectToServer(QUrl(base), {});
    QTRY_VERIFY(session.connected()); session.openWorkflow(id); QTRY_VERIFY(session.serverBound());
    auto draft = session.workflow(); auto changed = graph; changed["nodes"] = QJsonArray{QJsonObject{{"id", "proof"}, {"type", "nodetool.text.Prompt"}, {"data", QJsonObject{{"prompt", "autosaved"}}}}}; draft["graph"] = changed;
    session.setSnapshot(draft); QTRY_VERIFY_WITH_TIMEOUT(!session.dirty(), 10000);
    auto persisted = request("GET", "/api/workflows/" + id, {}); QCOMPARE(persisted.second["graph"].toObject(), changed);
    session.setAutosaveEnabled(false);
    auto external = persisted.second; auto externalGraph = changed; externalGraph["nodes"] = QJsonArray{QJsonObject{{"id", "proof"}, {"type", "nodetool.text.Prompt"}, {"data", QJsonObject{{"prompt", "external"}}}}};
    external["graph"] = externalGraph; external["expected_updated_at"] = external["updated_at"];
    QCOMPARE(request("PUT", "/api/workflows/" + id, external).first, 200);
    QTRY_COMPARE_WITH_TIMEOUT(session.workflow()["graph"].toObject(), externalGraph, 10000);
    auto local = session.workflow(); local["graph"] = graphValue("preserved"); session.setSnapshot(local);
    external = request("GET", "/api/workflows/" + id, {}).second; externalGraph["nodes"] = QJsonArray{QJsonObject{{"id", "proof"}, {"type", "nodetool.text.Prompt"}, {"data", QJsonObject{{"prompt", "conflicting"}}}}};
    external["graph"] = externalGraph; external["expected_updated_at"] = external["updated_at"];
    QCOMPARE(request("PUT", "/api/workflows/" + id, external).first, 200);
    QTRY_VERIFY_WITH_TIMEOUT(session.conflictPending(), 10000);
    QCOMPARE(session.workflow(), local); QTRY_COMPARE(session.conflictWorkflow()["graph"].toObject(), externalGraph);
    session.reloadRemoteWorkflow(); QVERIFY(!session.dirty()); QCOMPARE(session.workflow()["graph"].toObject(), externalGraph);
    qInfo() << "Live proof: versioned CAS autosave persisted; authenticated resource_change reloaded clean workflow and retained dirty draft on external conflict";
  }
  void unsafeGraphAndUnsupportedWorkflowMetadataStayDirty() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    auto draft = session.workflow(); auto graph = draft["graph"].toObject(); graph["future"] = 42; draft["graph"] = graph;
    session.setSnapshot(draft); session.flushAutosave(); QTest::qWait(20);
    QVERIFY(http.writes.isEmpty()); QVERIFY(session.dirty()); QCOMPARE(session.workflow(), draft);
    draft["graph"] = graphValue("supported"); draft["description"] = "Requires explicit full save";
    session.setSnapshot(draft); session.flushAutosave(); QTRY_COMPARE(http.writes.size(), 1); QTRY_VERIFY(!session.saving());
    QVERIFY(session.dirty()); QCOMPARE(session.workflow()["description"].toString(), QString("Requires explicit full save"));
    QCOMPARE(session.workflow()["graph"], draft["graph"]);
  }
  void accountChangeCancelsOutstandingSave() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), "account-one", "one");
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    auto draft = session.workflow(); draft["graph"] = graphValue("draft"); session.setSnapshot(draft);
    http.delay = true; session.flushAutosave(); QTRY_VERIFY(http.pending);
    QSignalSpy saved(&session, &WorkflowSession::saved);
    session.connectToServer(http.url(), "account-two", "two");
    auto local = draft; local["id"] = "new-account-local"; session.setSnapshot(local);
    http.finish(http.pending, http.pendingBody); QTest::qWait(30);
    QCOMPARE(saved.count(), 0); QCOMPARE(session.workflow(), local); QVERIFY(session.dirty()); QVERIFY(!session.serverBound());
    session.flushAutosave(); QTest::qWait(20); QCOMPARE(http.writes.size(), 1);
  }
  void unboundNeverWrites() {
    Http http; WorkflowSession session; session.setAutosaveDelay(5); session.connectToServer(http.url(), {});
    session.setSnapshot(http.remote); session.flushAutosave(); QTest::qWait(30);
    QVERIFY(http.writes.isEmpty()); QVERIFY(session.dirty()); QVERIFY(!session.serverBound());
  }
  void debounceAndConcurrentEdit() {
    Http http; WorkflowSession session; session.setAutosaveDelay(15); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    auto draft = session.workflow(); draft["graph"] = graphValue(1);
    session.setSnapshot(draft); draft["graph"] = graphValue(2); session.setSnapshot(draft);
    http.delay = true; QTRY_COMPARE(http.writes.size(), 1);
    QCOMPARE(http.writes[0]["expected_updated_at"].toString(), QString("r1"));
    QCOMPARE(http.writes[0]["graph"].toObject()["nodes"].toArray()[0].toObject()["data"].toObject()["value"].toInt(), 2);
    QVERIFY(!http.writes[0]["force"].toBool()); QCOMPARE(http.writes[0]["save_type"].toString(), QString("autosave"));
    draft["graph"] = graphValue(3); session.setSnapshot(draft);
    http.delay = false; http.finish(http.pending, http.pendingBody);
    QTRY_COMPARE(http.writes.size(), 2); QTRY_VERIFY(!session.dirty());
    QCOMPARE(http.writes[1]["expected_updated_at"].toString(), QString("r2"));
    QCOMPARE(session.workflow()["graph"].toObject()["nodes"].toArray()[0].toObject()["data"].toObject()["value"].toInt(), 3);
  }
  void skipFailureAndConflictKeepDraft() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    auto draft = session.workflow(); draft["graph"] = graphValue("local"); session.setSnapshot(draft);
    http.skip = true; session.flushAutosave(); QTRY_COMPARE(http.writes.size(), 1); QTRY_VERIFY(!session.saving());
    QVERIFY(session.dirty()); QCOMPARE(session.workflow(), draft);
    http.skip = false; http.status = 500; session.flushAutosave(); QTRY_COMPARE(http.writes.size(), 2); QTRY_VERIFY(!session.saving());
    QVERIFY(session.dirty()); QCOMPARE(session.workflow(), draft);
    http.status = 409; http.remote["updated_at"] = "external"; http.remote["graph"] = graphValue("remote");
    session.flushAutosave(); QTRY_VERIFY(session.conflictPending()); QTRY_VERIFY(!session.conflictWorkflow().isEmpty());
    QCOMPARE(session.workflow(), draft); QCOMPARE(session.conflictWorkflow(), http.remote);
    session.flushAutosave(); session.save(); QTest::qWait(20); QCOMPARE(http.writes.size(), 3);
    http.status = 200; session.keepLocalWorkflow(); QTRY_COMPARE(http.writes.size(), 4); QTRY_VERIFY(!session.dirty());
    QCOMPARE(http.writes.last()["expected_updated_at"].toString(), QString("external"));
    QCOMPARE(session.workflow()["graph"], draft["graph"]);
  }
  void websocketChangesAndDeletion() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    QTRY_VERIFY(session.connected()); QTRY_VERIFY(http.peer);
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    const auto notify = [&](const QString &kind, const QString &revision, const QString &id = "bound") {
      http.peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "resource_change"}, {"resource_type", "workflow"},
        {"event", kind}, {"resource", QJsonObject{{"id", id}, {"updated_at", revision}}}}));
    };
    const auto before = http.reads;
    notify("updated", "r1"); notify("updated", "elsewhere", "other"); QTest::qWait(20); QCOMPARE(http.reads, before);
    http.remote["updated_at"] = "live2"; http.remote["graph"] = graphValue("live");
    notify("updated", "live2"); QTRY_COMPARE(session.workflow(), http.remote); QVERIFY(!session.dirty());
    auto draft = session.workflow(); draft["graph"] = graphValue("local"); session.setSnapshot(draft);
    http.remote["updated_at"] = "live3"; notify("updated", "live3"); QTRY_VERIFY(session.conflictPending());
    QCOMPARE(session.workflow(), draft); QTRY_COMPARE(session.conflictWorkflow(), http.remote);
    notify("deleted", ""); QTRY_COMPARE(session.autosaveState(), QString("deleted"));
    QVERIFY(session.conflictWorkflow().isEmpty()); session.keepLocalWorkflow(); session.flushAutosave(); session.save();
    QTest::qWait(20); QVERIFY(http.writes.isEmpty()); QCOMPARE(session.workflow(), draft);
  }
  void flushWaitsForRemoteComparison() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound()); QTRY_VERIFY(http.peer);
    QTest::qWait(50);
    auto draft = session.workflow(); draft["graph"] = graphValue("local"); session.setSnapshot(draft);
    http.delayReads = true; session.refreshRemoteWorkflow(); QTRY_VERIFY(http.pendingRead);
    session.flushAutosave(); QTest::qWait(20); QCOMPARE(http.writes.size(), 0);
    http.delayReads = false; http.reply(http.pendingRead, http.remote);
    // The debounce is 60 s, so only the deferred flush can write within the wait.
    QTRY_COMPARE(http.writes.size(), 1);
    QCOMPARE(http.writes[0]["expected_updated_at"].toString(), QString("r1"));
  }
  void remoteReloadAndScopeDiscards() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    http.remote["updated_at"] = "remote2"; http.remote["graph"] = graphValue("remote2");
    session.refreshRemoteWorkflow(); QTRY_COMPARE(session.workflow(), http.remote); QVERIFY(!session.dirty());
    auto draft = session.workflow(); draft["graph"] = graphValue("local"); session.setSnapshot(draft);
    http.remote["updated_at"] = "remote3"; session.refreshRemoteWorkflow(); QTRY_VERIFY(session.conflictPending());
    session.reloadRemoteWorkflow(); QCOMPARE(session.workflow(), http.remote); QVERIFY(!session.dirty());
    draft = session.workflow(); draft["graph"] = graphValue("local2"); session.setSnapshot(draft);
    http.delay = true; session.flushAutosave(); QTRY_VERIFY(http.pending);
    session.detachServerWorkflow(); // Local file provenance also works for the same workflow id.
    session.setSnapshot(draft); http.finish(http.pending, http.pendingBody);
    QTest::qWait(20); QCOMPARE(session.workflow(), draft); QVERIFY(session.dirty()); QVERIFY(!session.serverBound()); QVERIFY(!session.saving());
  }
};
QTEST_GUILESS_MAIN(AutosaveTests)
#include "WorkflowAutosaveTests.moc"
