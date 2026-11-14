#include "ui/EditorWindow.h"
#include <QtTest>
#include <QTcpServer>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QQuickWidget>
#include <QQuickItem>
#include <QDialog>
#include <QDockWidget>
#include <QDir>
#include <QApplication>
#include <QClipboard>
class Fixture final : public QTcpServer {
public:
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
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
};


using namespace nodetool;
class HostTest : public QObject {
 Q_OBJECT
 static QQuickWidget *panel(EditorWindow &window) {
  // A closed dock's panel stays alive until deferred deletion, so only a visible panel counts.
  for (auto *widget : window.findChildren<QQuickWidget *>()) if ((widget->source().fileName() == "WorkflowDetails.qml" || widget->source().fileName() == "VersionHistoryPanel.qml") && widget->isVisible()) return widget;
  return nullptr;
 }
 static QQuickItem *find(QQuickItem *item, const QString &name) {
  if (item->objectName() == name) return item;
  for (auto *child : item->childItems()) if (auto *found = find(child, name)) return found;
  return nullptr;
 }
 static void resetScroll(QQuickItem *item) {
  if (item->metaObject()->indexOfProperty("contentY") >= 0) item->setProperty("contentY", 0);
  for (auto *child : item->childItems()) resetScroll(child);
 }
 static void click(QQuickWidget *widget, const char *name) {
  auto *item = find(widget->rootObject(), name);
  if (!item) { item = find(widget->quickWindow()->contentItem(), name); }
  QVERIFY(item); QVERIFY(item->isEnabled());
  for (auto *parent = item->parentItem(); parent; parent = parent->parentItem()) {
   if (parent->metaObject()->indexOfProperty("contentY") >= 0) { parent->setProperty("contentY", parent->property("contentY").toDouble() + item->mapToItem(parent, QPointF()).y()); break; }
  }
  QCoreApplication::processEvents();
  QTest::mouseClick(widget->quickWindow(), Qt::LeftButton, Qt::NoModifier, item->mapToScene({item->width()/2,item->height()/2}).toPoint());
 }
private slots:
 void inspectRestoreUndoAndCapture() {
  Fixture server;
  bool restored = false, deleted = false;
  server.respond = [&restored, &deleted](QByteArray req) {
   if (req.startsWith("GET /api/workflows/") && restored) return QByteArray(R"({"id":"bound","name":"Original","extension":{"kept":true},"updated_at":"r2","graph":{"nodes":[],"edges":[],"links":[]}})");
   if (req.startsWith("GET /api/workflows/")) return QByteArray(R"({"id":"bound","extension":{"kept":true},"name":"Original","updated_at":"r1","graph":{"nodes":[],"edges":[]}})");
   if (req.contains("versions.delete")) { deleted = true; return QByteArray(R"({"result":{"data":{"ok":true}}})"); }
   if (req.contains("versions.list") && deleted) return QByteArray(R"({"result":{"data":{"versions":[]}}})");
   if (req.contains("versions.list")) return QByteArray(R"({"result":{"data":{"versions":[{"id":"version-one","version":1,"name":"Checkpoint","created_at":"2026-01-01T12:00:00Z","description":"Initial text pipeline","graph":{"nodes":[{"id":"source","type":"Text","ui_properties":{"position":{"x":0,"y":0}}},{"id":"output","type":"Preview","ui_properties":{"position":{"x":220,"y":100}}}],"edges":[{"source":"source","target":"output"}]}},{"version":2,"name":"Manual save","graph":{"nodes":[],"edges":[]}}]}}})");
   if (req.contains("versions.restore")) { restored = true; return QByteArray(R"({"result":{"data":{"id":"bound","updated_at":"r2","graph":{"nodes":[],"edges":[],"links":[]}}}})"); }
   if (req.startsWith("PUT /api/workflows/")) {
    auto body = QJsonDocument::fromJson(req.mid(req.indexOf("\r\n\r\n") + 4)).object(); body.insert("updated_at", "r3"); body.remove("extension"); return QJsonDocument(body).toJson(QJsonDocument::Compact);
   }
   return QByteArray(R"({"error":{"message":"Permission denied"}})");
  };
  EditorWindow window; window.resize(1280,900); window.show();
  window.session()->connectToServer(server.url(), {}); window.session()->setAutosaveEnabled(false); window.session()->openWorkflow("bound");
  QTRY_VERIFY(window.session()->serverBound()); QTRY_COMPARE(window.document()->snapshot()["id"].toString(), QString("bound"));
  window.action("Version history"); QTRY_VERIFY(panel(window)); auto *widget = panel(window);
  QTRY_VERIFY(widget->width() > 800);
  QTRY_VERIFY(!widget->rootObject()->property("controller").value<QObject *>()->property("busy").toBool());
  QTRY_VERIFY(find(widget->rootObject(), "version-row-0"));
  const auto before = window.document()->snapshot();
  const auto beforeIndex = window.document()->undoStack()->index(); const auto beforeDirty = window.session()->dirty();
  click(widget,"version-row-0"); QCOMPARE(window.document()->snapshot(), before);
  QCOMPARE(window.document()->undoStack()->index(), beforeIndex); QCOMPARE(window.session()->dirty(), beforeDirty);
  QVERIFY(find(widget->rootObject(), "version-graph-preview")->property("graph").toMap()["nodes"].toList().size() == 2);
  auto *controller = widget->rootObject()->property("controller").value<QObject *>();
  QCOMPARE(controller->property("comparison").toMap()["addedNodes"].toList().size(), 2);
  // Compare mode picks the second version with a row click. The lower version is the older side,
  // as in the web panel, so version 1 (two nodes) against version 2 (none) removes both nodes.
  click(widget,"compare-toggle"); QTest::qWait(100);
  click(widget,"version-row-1");
  QCOMPARE(controller->property("compareIndex").toInt(), 1);
  QCOMPARE(controller->property("selectedIndex").toInt(), 0);
  QCOMPARE(controller->property("comparison").toMap()["removedNodes"].toList().size(), 2);
  QCOMPARE(controller->property("comparison").toMap()["addedNodes"].toList().size(), 0);
  click(widget,"compare-toggle");
  QCOMPARE(controller->property("compareIndex").toInt(), -1);
  QCOMPARE(window.document()->snapshot(), before);
  QCOMPARE(window.document()->undoStack()->index(), beforeIndex); QCOMPARE(window.session()->dirty(), beforeDirty);
  auto graph = window.document()->graph(); graph.insert("draft_marker", "local");
  QVERIFY(window.document()->applyCommand({{"op","replaceGraph"},{"graph",graph}}));
  const auto dirty = window.document()->snapshot(); const auto index = window.document()->undoStack()->index();
  click(widget,"restore-version"); QVERIFY(find(widget->rootObject(), "versions-error")->property("text").toString().contains("Unsaved"));
  const auto capture = qEnvironmentVariable("NODETOOL_VERSIONS_CAPTURE_DIR");
  if (!capture.isEmpty()) { QVERIFY(QDir().mkpath(capture)); for (const auto &scheme : {QString("dark"),QString("light")}) { window.setDarkTheme(scheme == "dark"); resetScroll(widget->rootObject()); QTest::qWait(80); QVERIFY(window.grab().save(capture + "/versions-" + scheme + ".png")); } }
  click(widget,"restore-confirm"); click(widget,"restore-version");
  QTRY_VERIFY(!window.session()->saving());
  QCOMPARE(window.document()->undoStack()->index(), index + 1);
  QQuickWidget *toolbar = nullptr;
  for (auto *candidate : window.findChildren<QQuickWidget *>()) { if (candidate->source().fileName() == "HeaderRow.qml") { toolbar = candidate; break; } }
  QVERIFY(toolbar); click(toolbar,"header-undo"); QCOMPARE(window.document()->graph(), dirty["graph"].toObject());
  click(widget,"delete-selected-version"); click(widget,"cancel-delete-version"); QVERIFY(!deleted);
  click(widget,"delete-selected-version"); click(widget,"confirm-delete-version");
  QTRY_VERIFY(deleted); QTRY_COMPARE(controller->property("rows").toList().size(), 0);
  QCOMPARE(window.document()->graph(), dirty["graph"].toObject());
  window.findChild<QDockWidget *>("workflow-versions-dock")->close(); QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
  window.action("Workflow metadata"); QTRY_VERIFY(panel(window)); widget = panel(window);
  click(widget, "metadata-name"); QTest::keyClick(widget->quickWindow(), Qt::Key_A, Qt::ControlModifier);
  QTest::keyClicks(widget, "Renamed"); QTest::keyClick(widget->quickWindow(), Qt::Key_Return);
  QTRY_COMPARE(window.document()->snapshot()["name"].toString(), QString("Renamed"));
  QTRY_VERIFY(!window.session()->saving());
  QVERIFY(window.document()->snapshot()["extension"].toObject()["kept"].toBool());
  bool wrote = false; for (const auto &request : server.requests) if (request.startsWith("PUT")) { wrote = true; QVERIFY(request.contains("Renamed")); QVERIFY(request.contains("extension")); }
  QVERIFY(wrote);
  if (!capture.isEmpty()) { for (const auto &scheme : {QString("dark"),QString("light")}) { window.setDarkTheme(scheme == "dark"); panel(window)->rootObject()->forceActiveFocus(); resetScroll(panel(window)->rootObject()); QTest::qWait(80); QVERIFY(panel(window)->grab().save(capture + "/metadata-" + scheme + ".png")); } }
 }
};
QTEST_MAIN(HostTest)
#include "WorkflowVersionsHostTest.moc"
