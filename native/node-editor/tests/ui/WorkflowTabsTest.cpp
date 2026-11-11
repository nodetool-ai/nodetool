#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "server/MsgPack.h"
#include <QWebSocketServer>
#include <QAbstractButton>
#include "graph/CanvasDropController.h"
#include <QDragEnterEvent>
#include <QDropEvent>
#include <QMimeData>
#include <QTcpServer>
#include <QTcpSocket>
#include <QDir>
#include <QFile>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QMessageBox>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQuickWindow>
#include <QDockWidget>
#include <QSettings>
#include <QTemporaryDir>
#include <QTimer>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
class WorkflowTabsTest final : public QObject {
  Q_OBJECT
  QTemporaryDir settingsDir_;
  static QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) return item;
    for (auto child : item->childItems()) if (auto result = find(child, name)) return result;
    return nullptr;
  }
  static bool click(EditorWindow &window, const QString &name) {
    // Panels follow in the next pass and their layout in the pass after. The card
    // toolbar shows 200 ms after the selection settles (NodeSelectionToolbar.tsx).
    QTest::qWaitFor([&] {
      for (auto panel : window.findChildren<QQuickWidget *>()) {
        if (!panel->isVisible() || !panel->rootObject()) continue;
        auto item = find(panel->rootObject(), name);
        if (item && item->isVisible()) return true;
      }
      return false;
    }, 1000);
    for (auto panel : window.findChildren<QQuickWidget *>()) {
      if (!panel->isVisible() || !panel->rootObject()) continue;
      auto item = find(panel->rootObject(), name);
      if (!item || !item->isVisible()) continue;
      QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier,
        item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
      QCoreApplication::processEvents();
      return true;
    }
    return false;
  }
  static QJsonObject workflow(const QString &name, int count = 1) {
    QJsonArray nodes;
    for (int i = 0; i < count; ++i) nodes.append(QJsonObject{{"id", QString("note%1").arg(i)},
      {"type", "nodetool.workflows.base_node.Comment"}, {"data", QJsonObject{{"comment", name}}},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", (i % 40) * 300}, {"y", (i / 40) * 200}}}}}});
    return {{"name", name}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
  }
  static void moveNode(EditorWindow &window) {
    window.fit(); QTest::qWait(100);
    auto scene = window.scene();
    auto view = scene->views().first();
    auto node = scene->nodeGraphicsObject(*scene->graphModel().allNodeIds().begin());
    QVERIFY(node);
    const auto start = view->mapFromScene(node->sceneBoundingRect().topLeft() + QPointF(40, 18));
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    QTest::mouseMove(view->viewport(), start + QPoint(55, 40), 30);
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier, start + QPoint(55, 40));
    QCoreApplication::processEvents();
  }
  static void answerClose(QMessageBox::StandardButton choice) {
    auto timer = new QTimer(qApp);
    QObject::connect(timer, &QTimer::timeout, qApp, [choice, timer] {
      auto box = qobject_cast<QMessageBox *>(QApplication::activeModalWidget());
      if (!box) return;
      timer->stop(); timer->deleteLater();
      QVERIFY(box->button(QMessageBox::Save)); QVERIFY(box->button(QMessageBox::Discard)); QVERIFY(box->button(QMessageBox::Cancel));
      QTest::mouseClick(box->button(choice), Qt::LeftButton);
    });
    timer->start(10);
  }
private slots:
  void initTestCase() {
    QVERIFY(settingsDir_.isValid());
    QSettings::setDefaultFormat(QSettings::IniFormat);
    QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settingsDir_.path());
    // These tests count workflow sockets. An open chat window adds its own.
    QSettings().setValue("canvas-chat-dock/collapsed", true);
  }
  void pointerTabsUndoCloseAndRuntime() {
    QWebSocketServer server("tabs", QWebSocketServer::NonSecureMode);
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QWebSocket *> peers;
    connect(&server, &QWebSocketServer::newConnection, &server, [&] {
      auto peer = server.nextPendingConnection(); peer->setParent(&server); peers.append(peer);
    });
    EditorWindow window; window.show();
    window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    QTRY_VERIFY(window.session()->connected()); QTRY_COMPARE(peers.size(), 1);
    QVERIFY(window.document()->load(workflow("Workflow A")));
    auto docA = window.document(); auto sceneA = window.scene(); auto sessionA = window.session(); auto outputA = window.runOutput();
    moveNode(window); QCOMPARE(docA->undoStack()->count(), 1);
    const auto changedA = docA->snapshot();
    const auto run = sessionA->run(changedA); QVERIFY(!run.isEmpty());
    auto peerA = peers.first();
    QVERIFY(click(window, "new-workflow-tab")); QCOMPARE(window.workflowTabs().size(), 2);
    QVERIFY(window.document()->load(workflow("Workflow B")));
    auto docB = window.document(); moveNode(window); QCOMPARE(docB->undoStack()->count(), 1);
    const auto changedB = docB->snapshot();
    window.action("Undo"); QVERIFY(docB->snapshot() != changedB); QCOMPARE(docA->snapshot(), changedA);
    window.action("Redo"); QCOMPARE(docB->snapshot(), changedB);
    peerA->sendBinaryMessage(node_editor::encodeMsgPack(QJsonObject{{"type", "output_update"}, {"job_id", run}, {"output_name", "value"}, {"node_id", "note0"}, {"value", "Arrived while B active"}}));
    QTRY_COMPARE(outputA->entries().size(), 1); QVERIFY(window.runOutput()->entries().isEmpty());
    QVERIFY(click(window, "activate-tab-0")); QCOMPARE(window.document(), docA); QCOMPARE(window.scene(), sceneA);
    window.action("Undo"); QCOMPARE(docA->undoStack()->index(), 0); QCOMPARE(docB->snapshot(), changedB);
    window.action("Redo");
    QVERIFY(click(window, "activate-tab-1"));
    answerClose(QMessageBox::Cancel); QVERIFY(click(window, "close-tab-1")); QCOMPARE(window.workflowTabs().size(), 2); QCOMPARE(window.document(), docB);
    QTemporaryDir files; QVERIFY(files.isValid()); QVERIFY(window.saveFile(files.filePath("b.json")));
    moveNode(window); QVERIFY(window.hasUnsavedChanges());
    answerClose(QMessageBox::Save); QVERIFY(click(window, "close-tab-1")); QCOMPARE(window.workflowTabs().size(), 1);
    QPointer<node_editor::WorkflowSession> guarded = sessionA;
    bool delivered = false;
    QTimer::singleShot(30, sessionA, [&] { delivered = true; sessionA->runEvent("background-run", {{"type", "output_update"}, {"value", "late"}}); });
    answerClose(QMessageBox::Discard); QVERIFY(click(window, "close-tab-0"));
    QVERIFY(guarded.isNull()); QTest::qWait(60); QVERIFY(!delivered);
    QCOMPARE(window.workflowTabs().size(), 1); QVERIFY(window.document()->nodes().isEmpty()); QVERIFY(window.runOutput()->entries().isEmpty());
  }
  void lateUploadAfterClose() {
    QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
    const QJsonArray metadata{QJsonObject{{"node_type", "nodetool.constant.Image"}, {"title", "Image"},
      {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "image"}}}}}}}};
    QPointer<QTcpSocket> pending;
    const auto reply = [](QTcpSocket *socket, const QJsonObject &value) {
      const auto bytes = QJsonDocument(value).toJson(QJsonDocument::Compact);
      socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + QByteArray::number(bytes.size()) + "\r\n\r\n" + bytes);
      socket->disconnectFromHost();
    };
    connect(&server, &QTcpServer::newConnection, &server, [&] {
      while (server.hasPendingConnections()) {
        auto socket = server.nextPendingConnection(); socket->setParent(&server);
        connect(socket, &QTcpSocket::readyRead, &server, [&, socket] {
          const auto bytes = socket->property("bytes").toByteArray() + socket->readAll(); socket->setProperty("bytes", bytes);
          const auto end = bytes.indexOf("\r\n\r\n"); if (end < 0 || socket->property("done").toBool()) return;
          int length = 0;
          for (const auto &line : bytes.left(end).split('\n')) if (line.toLower().startsWith("content-length:")) length = line.mid(15).trimmed().toInt();
          if (bytes.size() < end + 4 + length) return;
          socket->setProperty("done", true);
          if (bytes.startsWith("POST /api/assets ")) pending = socket;
          else if (bytes.startsWith("GET /api/nodes/metadata")) reply(socket, {{"nodes", metadata}});
          else reply(socket, {});
        });
      }
    });
    EditorWindow window; window.show();
    window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
    QTRY_VERIFY(!window.catalog().isEmpty());
    QTemporaryDir files; QVERIFY(files.isValid()); const auto path = files.filePath("upload.png");
    QImage image(16, 16, QImage::Format_RGB32); image.fill(Qt::blue); QVERIFY(image.save(path));
    QPointer<CanvasDropController> controller = window.activeEditor()->findChild<CanvasDropController *>(); QVERIFY(controller);
    auto view = window.scene()->views().first();
    QMimeData mime; mime.setUrls({QUrl::fromLocalFile(path)});
    const auto point = view->viewport()->rect().center();
    QDragEnterEvent enter(QPointF(point), Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &enter); QVERIFY(enter.isAccepted());
    QDropEvent drop(point, Qt::CopyAction, &mime, Qt::LeftButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &drop); QVERIFY(drop.isAccepted());
    QTRY_VERIFY(pending);
    QVERIFY(click(window, "new-workflow-tab"));
    const auto before = window.document()->snapshot();
    QVERIFY(click(window, "close-tab-0")); QTRY_VERIFY(controller.isNull());
    if (pending && pending->state() == QAbstractSocket::ConnectedState) reply(pending, {{"id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, {"get_url", "/api/content/upload"}});
    QTest::qWait(60);
    QCOMPARE(window.document()->snapshot(), before); QCOMPARE(window.document()->undoStack()->index(), 0);
  }
  void retainedLargeGraphAndCaptures() {
    EditorWindow window; window.show();
    auto large = workflow("Large workflow", 1200);
    auto graph = large["graph"].toObject(); auto nodes = graph["nodes"].toArray();
    for (int i = 0; i < nodes.size(); ++i) { auto node = nodes[i].toObject(); node["type"] = "tabs.Test"; nodes[i] = node; }
    graph["nodes"] = nodes; large["graph"] = graph;
    window.setCatalog({QJsonObject{{"node_type", "tabs.Test"}, {"title", "Background node"}}});
    QVERIFY(window.document()->load(large));
    auto document = window.document(); auto scene = window.scene();
    QCoreApplication::processEvents();
    QSignalSpy changed(document, &node_editor::WorkflowDocument::changed);
    QSignalSpy reset(&scene->graphModel(), SIGNAL(modelReset())); QVERIFY(reset.isValid());
    QVERIFY(window.selectNode("note0")); window.action("Zoom in"); QTest::qWait(40);
    auto view = scene->views().first();
    const auto transform = view->transform(); const auto center = view->mapToScene(view->viewport()->rect().center());
    const auto items = scene->items(); const auto snapshot = document->snapshot();
    QVERIFY(click(window, "new-workflow-tab"));
    QVERIFY(window.document()->load(workflow("Small workflow")));
    for (int i = 0; i < 6; ++i) {
      QVERIFY(click(window, "activate-tab-0")); QCOMPARE(window.scene(), scene);
      QCOMPARE(window.selection(), QString("note0")); QCOMPARE(view->transform(), transform);
      QVERIFY(QLineF(view->mapToScene(view->viewport()->rect().center()), center).length() < 2);
      QVERIFY(click(window, "activate-tab-1"));
    }
    QCOMPARE(changed.count(), 0); QCOMPARE(reset.count(), 0); QCOMPARE(scene->items(), items); QCOMPARE(document->snapshot(), snapshot); QCOMPARE(document->undoStack()->index(), 0);
    moveNode(window); QVERIFY(window.hasUnsavedChanges());
    QCoreApplication::processEvents();
    bool markerVisible = false;
    for (auto panel : window.findChildren<QQuickWidget *>()) {
      if (!panel->isVisible() || !panel->rootObject()) continue;
      auto active = find(panel->rootObject(), "workflow-tab-1");
      if (active) { auto marker = find(active, "unsaved-indicator"); markerVisible = marker && marker->isVisible(); }
    }
    QVERIFY(markerVisible);
    const auto directory = qEnvironmentVariable("NODETOOL_TABS_CAPTURE_DIR");
    for (bool dark : {true, false}) {
      window.setDarkTheme(dark); window.fit(); QTest::qWait(80);
      if (dark) {
        // Translucent dock dividers must blend with the themed panel, not the outer window.
        const auto image = window.grab().toImage();
        const auto docks = window.activeEditor()->findChildren<QDockWidget *>();
        QVERIFY(!docks.isEmpty());
        for (auto dock : docks) {
          if (!dock->isVisible()) { continue; }
          const auto bounds = QRect(dock->mapTo(&window, QPoint(0, 0)), dock->size());
          for (const int x : {bounds.left() - 1, bounds.right() + 1}) {
            if (x < 0 || x >= image.width()) { continue; }
            QVERIFY2(image.pixelColor(x, bounds.center().y()).lightnessF() < .5, qPrintable(QString("light divider at x=%1").arg(x)));
          }
        }
      }
      if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); QVERIFY(window.grab().save(directory + (dark ? "/tabs-dark.png" : "/tabs-light.png"))); }
    }
  }
  void credentialChangesReachEveryTabOnce() {
    EditorWindow window; window.show();
    const QUrl first("http://127.0.0.1:1"), second("http://127.0.0.1:2");
    window.session()->connectToServer(first, {});
    window.newTab();
    QCOMPARE(window.session()->serverUrl(), first);
    QSignalSpy active(window.session(), &node_editor::WorkflowSession::credentialsChanged);
    window.session()->connectToServer(second, {});
    QCOMPARE(active.size(), 1);
    QCOMPARE(window.session()->serverUrl(), second);
    window.activateTab(0); QCOMPARE(window.session()->serverUrl(), second);
    window.session()->disconnectFromServer();
    QVERIFY(window.session()->serverUrl().isEmpty());
    window.activateTab(1); QVERIFY(window.session()->serverUrl().isEmpty());
  }
  void restoreExcludesActiveChildCanvas() {
      QTemporaryDir files;
      QVERIFY(files.isValid());
      EditorWindow window;
      window.show();
      auto host = workflow("Host");
      auto graph = host["graph"].toObject();
      graph["nodes"] =
          QJsonArray{QJsonObject{{"id", "sub"},
                                 {"type", "nodetool.workflows.subgraph.Subgraph"},
                                 {"data", QJsonObject{{"graph", workflow("Inner")["graph"]}}}}};
      host["graph"] = graph;
      QVERIFY(window.document()->load(host));
      QVERIFY(window.saveFile(files.filePath("host.json")));
      QVERIFY(click(window, "new-workflow-tab"));
      QVERIFY(window.document()->load(workflow("Other")));
      QVERIFY(window.saveFile(files.filePath("other.json")));
      QVERIFY(click(window, "activate-tab-0"));
      QVERIFY(window.selectNode("sub"));
      QVERIFY(click(window, "selection-open-child"));
      QCOMPARE(window.workflowTabs().size(), 2);
      QCOMPARE(window.activeTab(), 0);
      window.persistTabs();
      EditorWindow restored;
      restored.restoreTabs();
      QCOMPARE(restored.workflowTabs().size(), 2);
      QCOMPARE(restored.activeTab(), 0);
      QCOMPARE(restored.workflowName(), QString("Host"));
      QVERIFY(restored.canvasStrips().isEmpty());
  }
  void restoreAndReuseOpenWorkflow() {
    QTemporaryDir files; QVERIFY(files.isValid());
    const auto a = files.filePath("a.json"), b = files.filePath("b.json");
    {
      EditorWindow window;
      QVERIFY(window.document()->load(workflow("Restored A"))); QVERIFY(window.saveFile(a));
      window.newTab(); QVERIFY(window.document()->load(workflow("Restored B"))); QVERIFY(window.saveFile(b));
      window.activateTab(0); QVERIFY(window.close());
    }
    EditorWindow restored; restored.restoreTabs(); QCOMPARE(restored.workflowTabs().size(), 2); QCOMPARE(restored.activeTab(), 0);
    QCOMPARE(restored.document()->snapshot()["name"].toString(), QString("Restored A"));
    restored.activateTab(1); QCOMPARE(restored.localFilePath(), b);
    restored.openWorkflow("server-workflow"); const auto count = restored.workflowTabs().size();
    restored.activateTab(0); restored.openWorkflow("server-workflow"); QCOMPARE(restored.workflowTabs().size(), count); QCOMPARE(restored.activeTab(), count - 1);
    QVERIFY(restored.openFile(a));
    restored.openWorkflow("server-workflow"); QCOMPARE(restored.workflowTabs().size(), count + 1);
  }
};
QTEST_MAIN(WorkflowTabsTest)
#include "WorkflowTabsTest.moc"
