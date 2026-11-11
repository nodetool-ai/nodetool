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
#include <QQuickView>
#include <QQmlEngine>
#include <QDir>
#include <QQuickItem>
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
  bool skip = false, delay = false, delayRemote = false;
  QPointer<QTcpSocket> pendingRemote;
  QPointer<QTcpSocket> pending;
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
          } else if (path == "/api/workflows/bound") { ++reads; if (delayRemote) pendingRemote = socket; else reply(socket, remote); }
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
class ServerSyncPanelTest final : public QObject {
  Q_OBJECT
  static QQuickItem *control(QQuickView &view, const char *name) { return view.rootObject()->findChild<QQuickItem *>(name); }
  static void click(QQuickView &view, const char *name) {
    auto *item = control(view, name); QVERIFY(item); QVERIFY(item->isVisible()); QVERIFY(item->isEnabled());
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
  }
  static void load(QQuickView &view, WorkflowSession &session) {
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setInitialProperties({{"workflowSession", QVariant::fromValue(&session)}});
    view.setSource(QUrl::fromLocalFile(QStringLiteral(PANEL_SOURCE)));
    QCOMPARE(view.status(), QQuickView::Ready);
    view.resize(900, 1200); view.show(); QVERIFY(QTest::qWaitForWindowExposed(&view));
  }
private slots:
  void unboundAndBoundToggle() {
    Http http; WorkflowSession session; QQuickView view; load(view, session); QVERIFY(view.rootObject());
    QVERIFY(!control(view, "server-sync-autosave")->isEnabled());
    QVERIFY(control(view, "server-sync-state")->property("text").toString().contains("Local workflow"));
    session.connectToServer(http.url(), {}); session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound());
    QTRY_VERIFY(control(view, "server-sync-autosave")->isEnabled());
    click(view, "server-sync-autosave"); QVERIFY(!session.autosaveEnabled());
    click(view, "server-sync-autosave"); QVERIFY(session.autosaveEnabled());
    QSignalSpy close(view.rootObject(), SIGNAL(closeRequested())); click(view, "server-sync-later"); QCOMPARE(close.count(), 1);
  }
  void compareLaterReloadAndKeepLocal() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound()); QQuickView view; load(view, session); QVERIFY(view.rootObject());
    auto local = session.workflow(); local["graph"] = graphValue("local draft"); session.setSnapshot(local);
    http.remote["graph"] = graphValue("external graph"); http.remote["updated_at"] = "external1";
    session.refreshRemoteWorkflow(); QTRY_VERIFY(session.conflictPending());
    QTRY_VERIFY(control(view, "server-sync-local")->property("text").toString().contains("local draft"));
    QVERIFY(control(view, "server-sync-remote")->property("text").toString().contains("external graph"));
    QVERIFY(control(view, "server-sync-local")->property("readOnly").toBool());
    QVERIFY(control(view, "server-sync-remote")->property("readOnly").toBool());
    auto *localScroll = control(view, "server-sync-local-scroll"); QVERIFY(localScroll);
    auto *flickable = localScroll->property("contentItem").value<QQuickItem *>(); QVERIFY(flickable);
    QTRY_VERIFY(flickable->property("contentHeight").toDouble() > flickable->height());
    QTest::wheelEvent(&view, localScroll->mapToScene(QPointF(localScroll->width() / 2, localScroll->height() / 2)), QPoint(0, -120));
    QTRY_VERIFY(flickable->property("contentY").toDouble() > 0);
    flickable->setProperty("contentY", 0);

    const auto captureDir = qEnvironmentVariable("NODETOOL_SERVER_SYNC_CAPTURE_DIR");
    if (!captureDir.isEmpty()) {
      QVERIFY(QDir().mkpath(captureDir));
      auto *theme = view.engine()->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme"); QVERIFY(theme);
      for (const auto &scheme : {QString("dark"), QString("light")}) {
        theme->setProperty("preference", scheme == "dark" ? 2 : 3);
        view.resize(640, 1000); QTest::qWait(50);
        const auto image = view.grabWindow(); QVERIFY(!image.isNull()); QVERIFY(image.save(captureDir + "/server-sync-" + scheme + ".png"));
      }
      view.resize(900, 1200);
    }

    control(view, "server-sync-local")->forceActiveFocus(); QTest::keyClick(&view, Qt::Key_X);
    QCOMPARE(session.workflow(), local);
    view.resize(360, 1200); QTest::qWait(20);
    auto *localText = control(view, "server-sync-local"); auto *remoteText = control(view, "server-sync-remote");
    QVERIFY(remoteText->mapToScene(QPointF()).y() > localText->mapToScene(QPointF()).y());
    auto *autosave = control(view, "server-sync-autosave");
    QVERIFY(autosave->mapToScene(QPointF(autosave->width(), 0)).x() <= view.width());
    if (!captureDir.isEmpty()) QVERIFY(view.grabWindow().save(captureDir + "/server-sync-narrow.png"));
    view.resize(900, 1200); QTest::qWait(20);
    QSignalSpy close(view.rootObject(), SIGNAL(closeRequested())); click(view, "server-sync-later"); QCOMPARE(close.count(), 1);
    QCOMPARE(session.workflow(), local); QVERIFY(session.dirty()); QVERIFY(session.conflictPending()); QVERIFY(http.writes.isEmpty());
    click(view, "server-sync-reload"); QCOMPARE(session.workflow(), http.remote); QVERIFY(!session.dirty());
    local = session.workflow(); local["graph"] = graphValue("second local"); session.setSnapshot(local);
    http.remote["updated_at"] = "external2"; session.refreshRemoteWorkflow(); QTRY_VERIFY(session.conflictPending());
    click(view, "server-sync-keep-local"); QTRY_COMPARE(http.writes.size(), 1); QTRY_VERIFY(!session.saving());
    QCOMPARE(http.writes[0]["expected_updated_at"].toString(), QString("external2"));
    QCOMPARE(session.workflow()["graph"], local["graph"]); QVERIFY(!session.dirty());
  }
  void staleRemoteComparisonCannotCrossDocumentScope() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound()); QQuickView view; load(view, session); QVERIFY(view.rootObject());
    auto local = session.workflow(); local["graph"] = graphValue("old draft"); session.setSnapshot(local);
    http.remote["updated_at"] = "stale revision"; http.remote["graph"] = graphValue("stale remote");
    http.delayRemote = true; session.refreshRemoteWorkflow(); QTRY_VERIFY(http.pendingRemote);
    session.detachServerWorkflow(); auto other = local; other["id"] = "other"; other["graph"] = graphValue("new document"); session.setSnapshot(other);
    http.reply(http.pendingRemote, http.remote); QTest::qWait(30);
    QVERIFY(!session.conflictPending()); QCOMPARE(session.workflow(), other);
    QVERIFY(!control(view, "server-sync-reload")->isVisible()); QVERIFY(!control(view, "server-sync-keep-local")->isVisible());
    QVERIFY(control(view, "server-sync-local")->property("text").toString().isEmpty()); QVERIFY(http.writes.isEmpty());
  }
  void failureRetryDeletionAndScopeSwitch() {
    Http http; WorkflowSession session; session.setAutosaveDelay(60000); session.connectToServer(http.url(), {});
    session.openWorkflow("bound"); QTRY_VERIFY(session.serverBound()); QTRY_VERIFY(http.peer); QQuickView view; load(view, session); QVERIFY(view.rootObject());
    auto local = session.workflow(); local["graph"] = graphValue("preserved"); session.setSnapshot(local);
    http.status = 500; session.flushAutosave(); QTRY_COMPARE(session.autosaveState(), QString("error"));
    QTRY_VERIFY(control(view, "server-sync-error")->property("text").toString().contains("500")); QCOMPARE(session.workflow(), local);
    http.status = 200; click(view, "server-sync-retry"); QTRY_VERIFY(!session.dirty()); QCOMPARE(http.writes.size(), 2);
    QVERIFY(control(view, "server-sync-error")->property("text").toString().isEmpty());
    local = session.workflow(); local["graph"] = graphValue("unsaved after delete"); session.setSnapshot(local);
    http.peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "resource_change"}, {"resource_type", "workflow"},
      {"event", "deleted"}, {"resource", QJsonObject{{"id", "bound"}}}}));
    QTRY_COMPARE(session.autosaveState(), QString("deleted"));
    QVERIFY(!control(view, "server-sync-keep-local")->isEnabled()); QVERIFY(!control(view, "server-sync-reload")->isEnabled());
    QSignalSpy saveAs(view.rootObject(), SIGNAL(saveLocalAsRequested())); click(view, "server-sync-save-local"); QCOMPARE(saveAs.count(), 1);
    QCOMPARE(session.workflow(), local); QCOMPARE(http.writes.size(), 2); QVERIFY(session.dirty());
    session.detachServerWorkflow(); auto other = local; other["id"] = "local-other"; session.setSnapshot(other);
    QTRY_VERIFY(!control(view, "server-sync-reload")->isVisible()); QVERIFY(!session.conflictPending());
    QVERIFY(control(view, "server-sync-local")->property("text").toString().isEmpty());
    QCOMPARE(session.workflow(), other); QCOMPARE(http.writes.size(), 2);
  }
};
QTEST_MAIN(ServerSyncPanelTest)
#include "ServerSyncPanelTest.moc"
