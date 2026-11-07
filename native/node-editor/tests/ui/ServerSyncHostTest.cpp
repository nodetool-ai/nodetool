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
#include "ui/EditorWindow.h"
#include <QQuickWidget>
#include <QDialog>
#include <QFileDialog>
#include <QApplication>
#include <QTimer>
#include <QFile>
#include <QTemporaryDir>
#include <QQuickView>
#include <QQmlEngine>
#include <QDir>
#include <QQuickItem>
using namespace nodetool::node_editor;
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
using namespace nodetool;
class ServerSyncHostTest final : public QObject {
  Q_OBJECT
  static QQuickWidget *panel(EditorWindow &window) {
    for (auto *widget : window.findChildren<QQuickWidget *>())
      if (widget->source().fileName() == "ServerSyncPanel.qml") return widget;
    return nullptr;
  }
  static QQuickItem *item(QQuickWidget *widget, const char *name) {
    return widget && widget->rootObject() ? widget->rootObject()->findChild<QQuickItem *>(name) : nullptr;
  }
  static QQuickWidget *status(EditorWindow &window) {
    for (auto *widget : window.findChildren<QQuickWidget *>())
      if (widget->source().fileName() == "StatusBar.qml") return widget;
    return nullptr;
  }
  static void click(QQuickWidget *widget, const char *name) {
    auto *control = item(widget, name); QVERIFY(control); QVERIFY(control->isVisible()); QVERIFY(control->isEnabled());
    for (auto *ancestor = control->parentItem(); ancestor; ancestor = ancestor->parentItem()) {
      if (ancestor->metaObject()->indexOfProperty("contentY") >= 0) {
        const auto y = control->mapToItem(ancestor, QPointF()).y();
        ancestor->setProperty("contentY", ancestor->property("contentY").toDouble() + y - 30); break;
      }
    }
    QCoreApplication::processEvents();
    QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier,
      control->mapToScene(QPointF(control->width() / 2, control->height() / 2)).toPoint());
  }
  static bool addComment(EditorWindow &window, const QString &id) {
    return bool(window.document()->applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", id},
      {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", id}}},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 100}, {"y", 100}}}}}}}}));
  }
private slots:
  void initTestCase() { QApplication::setAttribute(Qt::AA_DontUseNativeDialogs); }
  void conflictLaterStatusReopenKeepLocalAndReload() {
    Http http; EditorWindow window; window.resize(1280, 900); window.show();
    window.session()->setAutosaveDelay(60000); window.session()->connectToServer(http.url(), {});
    window.session()->openWorkflow("bound"); QTRY_VERIFY(window.session()->serverBound());
    QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("bound"));
    QVERIFY(!window.outputVisible());
    QVERIFY(addComment(window, "local draft")); const auto local = window.document()->snapshot();
    const auto undo = window.document()->undoStack()->index();
    http.remote["updated_at"] = "external1"; http.status = 409; window.session()->flushAutosave();
    QTRY_VERIFY(window.session()->conflictPending()); QTRY_VERIFY(!window.session()->conflictWorkflow().isEmpty());
    QVERIFY(!window.outputVisible());
    QTRY_VERIFY(window.findChild<QDialog *>("server-sync-dialog"));
    auto *dialog = window.findChild<QDialog *>("server-sync-dialog"); QTRY_VERIFY(dialog->isVisible());
    auto *widget = panel(window); QVERIFY(widget); QVERIFY(widget->rootObject());
    QVERIFY(item(widget, "server-sync-local")->property("readOnly").toBool());
    QVERIFY(item(widget, "server-sync-remote")->property("readOnly").toBool());
    QCOMPARE(window.document()->snapshot(), local); QCOMPARE(window.document()->undoStack()->index(), undo);
    const auto captureDir = qEnvironmentVariable("NODETOOL_SERVER_SYNC_HOST_CAPTURE_DIR");
    if (!captureDir.isEmpty()) {
      QVERIFY(QDir().mkpath(captureDir));
      for (const auto &scheme : {QString("dark"), QString("light")}) {
        window.setDarkTheme(scheme == "dark"); QTest::qWait(80);
        QVERIFY(window.grab().save(captureDir + "/server-sync-host-" + scheme + ".png"));
        QVERIFY(dialog->grab().save(captureDir + "/server-sync-dialog-" + scheme + ".png"));
      }
    }
    click(widget, "server-sync-later"); QTRY_VERIFY(!window.findChild<QDialog *>("server-sync-dialog") || !window.findChild<QDialog *>("server-sync-dialog")->isVisible());
    QVERIFY(window.session()->dirty()); QVERIFY(window.session()->conflictPending());
    QCOMPARE(window.document()->snapshot(), local); QCOMPARE(window.document()->undoStack()->index(), undo);
    auto *statusWidget = status(window); QVERIFY(statusWidget); QTRY_VERIFY(item(statusWidget, "status-server-sync")); QTRY_VERIFY(item(statusWidget, "status-server-sync")->isVisible());
    click(statusWidget, "status-server-sync"); QTRY_VERIFY(panel(window)); widget = panel(window);
    QTRY_VERIFY(window.findChild<QDialog *>("server-sync-dialog")->isVisible());
    http.status = 200; click(widget, "server-sync-keep-local"); QTRY_VERIFY(!window.session()->saving()); QTRY_VERIFY(!window.session()->dirty());
    QCOMPARE(http.writes.size(), 2); QCOMPARE(http.writes.last()["expected_updated_at"].toString(), QString("external1"));
    QCOMPARE(window.document()->snapshot()["graph"], local["graph"]);
    QVERIFY(addComment(window, "second local edit"));
    http.remote["updated_at"] = "external2"; http.remote["graph"] = QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}};
    window.session()->refreshRemoteWorkflow(); QTRY_VERIFY(window.session()->conflictPending());
    window.action("Server sync"); QTRY_VERIFY(panel(window)); click(panel(window), "server-sync-reload");
    QTRY_VERIFY(!window.session()->conflictPending()); QVERIFY(!window.session()->dirty());
    QCOMPARE(window.document()->snapshot()["graph"], http.remote["graph"]);
  }
  void deletionSaveCopyAndCredentialsClose() {
    Http http; EditorWindow window; window.show(); window.session()->setAutosaveDelay(60000);
    window.session()->connectToServer(http.url(), {}); window.session()->openWorkflow("bound");
    QTRY_VERIFY(window.session()->serverBound()); QTRY_VERIFY(http.peer); QVERIFY(!window.outputVisible()); QVERIFY(addComment(window, "recovery draft"));
    const auto local = window.document()->snapshot(); const auto undo = window.document()->undoStack()->index();
    http.peer->sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "resource_change"}, {"resource_type", "workflow"},
      {"event", "deleted"}, {"resource", QJsonObject{{"id", "bound"}}}}));
    QTRY_COMPARE(window.session()->autosaveState(), QString("deleted")); QTRY_VERIFY(panel(window)); QVERIFY(!window.outputVisible());
    auto *widget = panel(window); QVERIFY(!item(widget, "server-sync-keep-local")->isEnabled());
    QTemporaryDir dir; QVERIFY(dir.isValid()); const auto path = dir.filePath("recovered.json");
    QTimer acceptFile;
    acceptFile.setInterval(10);
    connect(&acceptFile, &QTimer::timeout, &window, [&] {
      if (auto *fileDialog = qobject_cast<QFileDialog *>(QApplication::activeModalWidget())) {
        acceptFile.stop(); fileDialog->selectFile(path);
        QMetaObject::invokeMethod(fileDialog, "accept", Qt::QueuedConnection);
      }
    });
    acceptFile.start();
    QTimer::singleShot(2000, &window, [] {
      if (auto *fileDialog = qobject_cast<QFileDialog *>(QApplication::activeModalWidget())) fileDialog->reject();
    });
    click(widget, "server-sync-save-local");
    acceptFile.stop();
    QFile saved(path); QVERIFY(saved.open(QIODevice::ReadOnly)); const auto recovered = QJsonDocument::fromJson(saved.readAll()).object();
    QCOMPARE(recovered["graph"], local["graph"]); QCOMPARE(window.document()->snapshot(), local);
    QCOMPARE(window.document()->undoStack()->index(), undo); QVERIFY(window.session()->dirty()); QVERIFY(window.session()->conflictPending());
    QVERIFY(window.serverSyncNeedsAttention()); QVERIFY(window.hasUnsavedChanges());
    QCOMPARE(window.serverSaveState(), QString("Server deleted"));
    QVERIFY(window.localFilePath().isEmpty());
    auto *statusWidget = status(window); QVERIFY(statusWidget); auto *serverStatus = item(statusWidget, "status-server-sync"); QVERIFY(serverStatus);
    QVERIFY(serverStatus->isVisible()); QCOMPARE(serverStatus->property("text").toString(), QString("Server deleted"));
    QCOMPARE(serverStatus->property("variant").toInt(), 0); // Outlined attention treatment.
    QVERIFY(http.writes.isEmpty());
    QPointer<QDialog> oldDialog = window.findChild<QDialog *>("server-sync-dialog");
    QPointer<QQuickItem> oldKeep = item(widget, "server-sync-keep-local");
    window.session()->connectToServer(http.url(), "next-account", "next");
    QTRY_VERIFY(!oldDialog || !oldDialog->isVisible());
    auto other = local; other["id"] = "next-account-local"; window.session()->setSnapshot(other);
    if (oldKeep) QMetaObject::invokeMethod(oldKeep, "clicked");
    QTest::qWait(30); QCOMPARE(window.session()->workflow(), other); QVERIFY(http.writes.isEmpty()); QVERIFY(!window.session()->serverBound());
  }
};
QTEST_MAIN(ServerSyncHostTest)
#include "ServerSyncHostTest.moc"
