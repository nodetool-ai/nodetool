#include "ui/EditorWindow.h"
#include <QApplication>
#include <QDir>
#include <QAbstractButton>
#include <QJsonDocument>
#include <QMessageBox>
#include <QPointer>
#include <QScopeGuard>
#include <QUuid>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QtTest>
#include <memory>
#include <algorithm>
using namespace nodetool;
static void captureWindow(QWidget &window,const QString &name) {
  const auto directory=qEnvironmentVariable("NODETOOL_AUTHORING_CAPTURE_DIR");
  if(directory.isEmpty()) { return; }
  QVERIFY(QDir().mkpath(directory));
  QVERIFY(window.grab().save(directory+"/"+name+".png"));
}
class BrowserFixture final : public QTcpServer {
public:
  QList<QByteArray> requests;
  QPointer<QTcpSocket> delayed;
  std::function<QByteArray(const QByteArray &)> response;
  BrowserFixture() {
    listen(QHostAddress::LocalHost);
    connect(this, &QTcpServer::newConnection, this, [this] {
      auto socket = nextPendingConnection(); socket->setParent(this);
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto bytes = std::make_shared<QByteArray>();
      // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
      auto served = std::make_shared<bool>(false);
      connect(socket, &QTcpSocket::readyRead, this, [this, socket, bytes, served] {
        *bytes += socket->readAll();
        const auto end = bytes->indexOf("\r\n\r\n");
        if (*served || end < 0) { return; }
        int length = 0;
        for (const auto &line : bytes->left(end).split('\n')) { if (line.toLower().startsWith("content-length:")) { length = line.mid(15).trimmed().toInt(); } }
        if (bytes->size() < end + 4 + length) { return; }
        *served = true; requests.append(*bytes);
        if (bytes->startsWith("GET /ws ")) { socket->disconnectFromHost(); return; }
        const auto body = response ? response(*bytes) : QByteArray("{}");
        if (body.isNull()) { delayed = socket; return; }
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
    });
  }
  QUrl url() const { return QUrl(QString("http://127.0.0.1:%1").arg(serverPort())); }
  int count(const QByteArray &prefix) const { return std::count_if(requests.cbegin(), requests.cend(), [&prefix](const auto &request) { return request.startsWith(prefix); }); }
};
class AuthoringUiTest final : public QObject {
  Q_OBJECT
private:
  static QQuickItem *find(QQuickItem *item, const QString &name) {
    if (item->objectName() == name) { return item; }
    for (auto child : item->childItems()) { if (auto result = find(child, name)) { return result; } }
    return nullptr;
  }
  static QQuickWidget *panel(EditorWindow &window, const QString &name) {
    for (auto widget : window.findChildren<QQuickWidget *>()) { if (widget->source().fileName() == name + ".qml") { return widget; } }
    return nullptr;
  }
  static QQuickItem *item(EditorWindow &window, const QString &name) {
    // The window's content item also holds the overlay, where menus open.
    for (auto widget : window.findChildren<QQuickWidget *>()) { if (widget->rootObject()) { if (auto result = find(widget->quickWindow()->contentItem(), name)) { return result; } } }
    return nullptr;
  }
  static void doubleClick(QQuickWidget *panel, QQuickItem *control) {
    QVERIFY(control);
    QTest::mouseDClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
    QCoreApplication::processEvents();
  }
  // The row menu from the keyboard's Menu key, as WorkflowContextMenu.tsx opens on right-click.
  static void rowMenu(QQuickWidget *panel, QQuickItem *row) {
    QVERIFY(row); panel->setFocus(); row->forceActiveFocus();
    QTest::keyClick(panel->quickWindow(), Qt::Key_Menu);
    QCoreApplication::processEvents();
  }
  static void click(QQuickWidget *panel, QQuickItem *control) {
    QVERIFY(control);
    for (auto parent = control->parentItem(); parent; parent = parent->parentItem()) {
      if (parent->metaObject()->indexOfProperty("contentY") >= 0) {
        const auto y = control->mapToItem(parent, QPointF()).y();
        parent->setProperty("contentY", parent->property("contentY").toDouble() + y - 30); break;
      }
    }
    QCoreApplication::processEvents();
    QList<QQuickItem *> ancestors;
    for (auto parent = control->parentItem(); parent; parent = parent->parentItem()) { ancestors.prepend(parent); }
    for (auto ancestor : ancestors) { ancestor->ensurePolished(); }
    control->ensurePolished();
    QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width()/2, control->height()/2)).toPoint());
    QCoreApplication::processEvents();
  }
  static void type(QQuickWidget *panel, QQuickItem *control, const QByteArray &text) {
    QVERIFY(control); panel->setFocus(); control->forceActiveFocus();
    QTest::keyClick(panel->quickWindow(), Qt::Key_A, Qt::ControlModifier);
    for (const auto c : text) { QTest::keyClick(panel->quickWindow(), c); }
  }
  static bool hasProjectedPort(EditorWindow &window, const QString &name) {
    const auto model = window.findChild<WorkflowGraphModel *>();
    if (!model) { return false; }
    for (const auto id : model->allNodeIds()) {
      if (model->resourceId(id) != window.selection()) { continue; }
      for (const auto &entry : model->ports(id,QtNodes::PortType::In)) { if (entry.toObject()["name"].toString() == name) { return true; } }
    }
    return false;
  }
  static void answer(QMessageBox::StandardButton button) {
    auto timer = new QTimer(qApp);
    QObject::connect(timer, &QTimer::timeout, timer, [timer, button] {
      for (auto widget : QApplication::topLevelWidgets()) {
        if (auto box = qobject_cast<QMessageBox *>(widget)) { if (auto choice = box->button(button)) { choice->click(); }
          timer->stop(); timer->deleteLater(); return; }
      }
    });
    QTimer::singleShot(10000, timer, &QObject::deleteLater);
    timer->start(10);
  }
  static QJsonObject remote() { return {{"id", "remote"}, {"name", "Remote workflow"}, {"updated_at", "revision"}, {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}}; }
private slots:
  void liveBrowser() {
    const auto origin = qEnvironmentVariable("NODETOOL_BROWSER_LIVE_URL");
    if (origin.isEmpty()) { QSKIP("Set NODETOOL_BROWSER_LIVE_URL for the disposable live browser test"); }
    const auto token = qEnvironmentVariable("NODETOOL_TOKEN");
    node_editor::WorkflowBrowser fixture;
    fixture.configure(QUrl(origin), token);
    QSignalSpy created(&fixture, &node_editor::WorkflowBrowser::created);
    fixture.createWorkflow("Native browser fixture " + QUuid::createUuid().toString(QUuid::WithoutBraces));
    QTRY_VERIFY_WITH_TIMEOUT(created.count() == 1 || !fixture.error().isEmpty(), 30000);
    QVERIFY2(created.count() == 1, qPrintable(fixture.error()));
    const auto id = created.first().first().toString();
    const auto cleanup = qScopeGuard([&fixture, id] {
      QTRY_VERIFY_WITH_TIMEOUT(!fixture.loading() && !fixture.busy(), 30000);
      QSignalSpy deleted(&fixture, &node_editor::WorkflowBrowser::deleted);
      fixture.deleteWorkflow(id);
      QTRY_VERIFY_WITH_TIMEOUT(deleted.count() == 1 || !fixture.error().isEmpty(), 30000);
      QVERIFY2(deleted.count() == 1, qPrintable(fixture.error()));
      QTRY_VERIFY_WITH_TIMEOUT(!fixture.loading(), 30000);
    });
    EditorWindow window; window.show();
    window.session()->connectToServer(QUrl(origin), token);
    QTRY_VERIFY_WITH_TIMEOUT(window.session()->connected(),30000);
    window.action("Open");
    auto service = window.workflowBrowser();
    QTRY_VERIFY_WITH_TIMEOUT(!service->loading() && !service->projectsLoading(),30000);
    QVERIFY2(service->error().isEmpty(),qPrintable(service->error()));
    const auto containsFixture = [service, id] {
      for (const auto &row : service->rows()) {
        if (row.toMap()["id"].toString() == id) { return true; }
      }
      return false;
    };
    while (!containsFixture() && service->hasNext()) {
      service->loadNext();
      QTRY_VERIFY_WITH_TIMEOUT(!service->loading(), 30000);
      QVERIFY2(service->error().isEmpty(), qPrintable(service->error()));
    }
    QVERIFY(containsFixture());
    QTest::qWait(250);
    captureWindow(window,"live-browser");
  }
  void dynamicPortsThroughInspector() {
    EditorWindow window; window.resize(1400, 1200);
    const QJsonArray metadata{QJsonObject{{"node_type", "Node"}, {"title", "Dynamic node"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}}};
    window.setCatalog(metadata);
    QVERIFY(window.document()->loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","ui_properties":{"position":{"x":-300,"y":0}},"dynamic_outputs":{"out":{"type":"str"}}},{"id":"b","type":"Node","ui_properties":{"position":{"x":100,"y":0}},"dynamic_properties":{"slot":"value"},"dynamic_inputs":{"slot":{"type":{"type":"str"}}}}],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"slot"}]}})"));
    window.show(); QCoreApplication::processEvents(); QVERIFY(window.selectNode("b"));
    auto inspector = panel(window,"Inspector"); QVERIFY(inspector);
    click(inspector, item(window,"tab-io"));
    QTRY_VERIFY(item(window,"input-name-slot"));
    type(inspector,item(window,"input-name-slot"),"renamed");
    QCOMPARE(item(window,"input-name-slot")->property("text").toString(),QString("renamed"));
    QVERIFY(!window.readOnly());
    QVERIFY(item(window,"rename-input-slot")->isEnabled());
    QSignalSpy renamed(item(window,"rename-input-slot"),SIGNAL(clicked()));
    click(inspector,item(window,"rename-input-slot"));
    QCOMPARE(renamed.size(),1);
    QVERIFY2(window.dynamicPorts()->error().isEmpty(),qPrintable(window.dynamicPorts()->error()));
    QTRY_COMPARE(window.document()->edges().first().toObject()["targetHandle"].toString(), QString("renamed"));
    QCOMPARE(window.document()->undoStack()->count(),1);
    window.document()->undo(); QCOMPARE(window.document()->edges().first().toObject()["targetHandle"].toString(),QString("slot"));
    window.document()->redo();
    QTRY_VERIFY(item(window,"delete-input-renamed"));
    click(inspector,item(window,"delete-input-renamed"));
    QTRY_VERIFY(window.document()->edges().isEmpty());
    window.document()->undo(); QCOMPARE(window.document()->edges().size(),1);
    type(inspector,item(window,"new-input-name"),"extra");
    click(inspector,item(window,"add-input"));
    QTRY_VERIFY(window.document()->node("b")["dynamic_properties"].toObject().contains("extra"));
    QCOMPARE(window.document()->edges().size(),1);
    QTRY_VERIFY(hasProjectedPort(window,"extra"));
    window.fit();
    item(window,"inspector-io")->setProperty("contentY",0);
    QTest::qWait(150);
    captureWindow(window,"dynamic-ports");
    window.document()->undo(); QVERIFY(!window.document()->node("b")["dynamic_properties"].toObject().contains("extra"));
  }
  void workflowOpenClearsDynamicDraft() {
    BrowserFixture server;
    const QJsonArray metadata{QJsonObject{{"node_type","Node"},{"supports_dynamic_inputs",true}}};
    auto next = remote(); next["graph"] = QJsonObject{{"nodes",QJsonArray{QJsonObject{{"id","b"},{"type","Node"}}}},{"edges",QJsonArray{}}};
    server.response = [metadata,next](const QByteArray &request) -> QByteArray {
      if (request.startsWith("GET /api/nodes/")) { return QJsonDocument(QJsonObject{{"nodes",metadata}}).toJson(); }
      return QJsonDocument(next).toJson();
    };
    EditorWindow window; window.show(); window.session()->connectToServer(server.url(),{});
    QTRY_VERIFY(!window.session()->catalog().isEmpty());
    QVERIFY(window.document()->loadJson(R"({"graph":{"nodes":[{"id":"b","type":"Node"}],"edges":[]}})"));
    QCoreApplication::processEvents(); QVERIFY(window.selectNode("b"));
    auto inspector = panel(window,"Inspector"); click(inspector,item(window,"tab-io"));
    QTRY_VERIFY(item(window,"new-input-name")); type(inspector,item(window,"new-input-name"),"uncommitted");
    QCOMPARE(item(window,"new-input-name")->property("text").toString(),QString("uncommitted"));
    window.openWorkflow("remote"); QTRY_COMPARE(window.workflowName(),QString("Remote workflow"));
    // The workflow opens in its own tab, so the draft cannot reach its document.
    QCOMPARE(window.workflowTabs().size(),2);
    auto &remoteTab = *window.activeEditor();
    QVERIFY(window.document()->node("b")["dynamic_properties"].toObject().isEmpty());
    const auto *remoteField = item(remoteTab,"new-input-name");
    QVERIFY(!remoteField || remoteField->property("text").toString().isEmpty());
  }
  void browserCreateAndRename() {
    BrowserFixture server;
    auto workflow = remote(); workflow["id"] = "created"; workflow["name"] = "Initial";
    server.response = [&workflow](const QByteArray &request) -> QByteArray {
      if (request.startsWith("GET /api/nodes/")) { return R"({"nodes":[]})"; }
      if (request.startsWith("GET /trpc/projects.list")) { return R"({"result":{"data":[]}})"; }
      if (request.startsWith("GET /api/workflows?")) { return QJsonDocument(QJsonObject{{"workflows",QJsonArray{workflow}}, {"next",QJsonValue::Null}}).toJson(); }
      if (request.startsWith("POST ") || request.startsWith("PUT ")) {
        const auto body = QJsonDocument::fromJson(request.mid(request.indexOf("\r\n\r\n")+4)).object();
        workflow["name"] = body["name"];
        return QJsonDocument(workflow).toJson();
      }
      return QJsonDocument(workflow).toJson();
    };
    EditorWindow window; window.resize(1400,1200); window.show();
    window.session()->connectToServer(server.url(), "fixture-token", "fixture-user"); window.action("Open");
    auto browser = panel(window,"WorkflowBrowser"); QVERIFY(browser);
    auto service = window.workflowBrowser();
    QTRY_VERIFY(!service->loading() && !service->projectsLoading() && !service->rows().isEmpty());
    type(browser,item(window,"new-workflow-name"),"Created through UI");
    click(browser,item(window,"create-workflow"));
    QTRY_COMPARE(window.workflowName(),QString("Created through UI"));
    QCOMPARE(server.count("POST /api/workflows "),1);
    bool scoped = false;
    for (const auto &request : server.requests) { if (request.startsWith("POST /api/workflows ") && request.toLower().contains("x-user-id: fixture-user") && request.contains("Bearer fixture-token")) { scoped = true; } }
    QVERIFY(scoped);
    window.action("Open"); QTRY_VERIFY(!service->loading() && !service->projectsLoading());
    QTRY_VERIFY(item(window,"workflow-row-created"));
    // A double-click on the row renames in place.
    doubleClick(browser,item(window,"workflow-row-created"));
    QTRY_VERIFY(item(window,"workflow-rename-created")->isVisible());
    type(browser,item(window,"workflow-rename-created"),"Renamed through UI");
    QTest::keyClick(browser->quickWindow(),Qt::Key_Return);
    QTRY_COMPARE(window.workflowName(),QString("Renamed through UI"));
    QCOMPARE(server.count("PUT /api/workflows/created "),1);
  }
  void browserCancelsPreviousServer() {
    BrowserFixture oldServer, newServer;
    const auto projects = [](const QByteArray &request) { return request.startsWith("GET /trpc/"); };
    oldServer.response = [projects](const QByteArray &request) -> QByteArray {
      if (projects(request)) { return R"({"result":{"data":[]}})"; }
      if (request.startsWith("GET /api/workflows?")) { return {}; }
      return R"({"nodes":[]})";
    };
    newServer.response = [projects](const QByteArray &request) -> QByteArray {
      if (projects(request)) { return R"({"result":{"data":[]}})"; }
      if (request.startsWith("GET /api/workflows?")) { return R"({"workflows":[{"id":"new","name":"New server workflow"}],"next":null})"; }
      return R"({"nodes":[]})";
    };
    EditorWindow window; window.show();
    window.session()->connectToServer(oldServer.url(), "old-token"); window.action("Open");
    QTRY_VERIFY(oldServer.delayed);
    auto service = window.workflowBrowser(); QVERIFY(service->loading());
    window.session()->connectToServer(newServer.url(), "new-token");
    QTRY_COMPARE(service->rows().size(),1);
    QCOMPARE(service->rows().first().toMap()["id"].toString(),QString("new"));
    QTRY_COMPARE(oldServer.delayed->state(),QAbstractSocket::UnconnectedState);
    window.session()->disconnectFromServer(); QTRY_VERIFY(service->rows().isEmpty()); QVERIFY(service->error().isEmpty());
  }
  void browserReachabilityScopesAndDirtyProtection() {
    BrowserFixture server;
    bool failFirstPage = true;
    server.response = [&failFirstPage](const QByteArray &request) -> QByteArray {
      if (request.startsWith("GET /api/nodes/")) { return R"({"nodes":[]})"; }
      if (request.startsWith("GET /trpc/projects.list")) { return R"({"result":{"data":[{"id":"project","name":"Project"}]}})"; }
      if (request.startsWith("GET /api/workflows/remote")) { return QJsonDocument(remote()).toJson(QJsonDocument::Compact); }
      if (request.startsWith("GET /api/workflows?")) {
        if (failFirstPage) { failFirstPage = false; return "invalid JSON"; }
        if (request.contains("cursor=")) { return R"({"workflows":[{"id":"second","name":"Second workflow"}],"next":null})"; }
        return R"({"workflows":[{"id":"remote","name":"Remote workflow"}],"next":"next-page"})";
      }
      return "{}";
    };
    EditorWindow window; window.resize(1400,1200); window.show();
    window.session()->connectToServer(server.url(), "fixture-token");
    click(panel(window,"Rail"),item(window,"rail-documents"));
    QVERIFY(window.browserVisible()); QVERIFY(!window.catalogVisible());
    auto browser = panel(window,"WorkflowBrowser"); QVERIFY(browser);
    auto service = window.workflowBrowser();
    QTRY_VERIFY(!service->error().isEmpty());
    QVERIFY(item(window,"browser-retry")->isVisible());
    click(browser,item(window,"browser-retry"));
    QTRY_VERIFY(item(window,"workflow-row-remote")); QTRY_VERIFY(!service->loading() && !service->projectsLoading());
    auto project = item(window,"workflow-project"); QVERIFY(project);
    QVERIFY(QMetaObject::invokeMethod(project,"valueCommitted",Q_ARG(QVariant,"project")));
    QTRY_VERIFY(server.count("GET /api/workflows?limit=100&project_id=project") > 0);
    QTRY_VERIFY(!service->loading());
    click(browser,item(window,"load-more-workflows"));
    QTRY_COMPARE(service->rows().size(),2);
    type(browser,item(window,"workflow-search"),"Second"); QTRY_COMPARE(service->rows().size(),1);
    type(browser,item(window,"workflow-search"),""); QTest::keyClick(browser->quickWindow(),Qt::Key_Backspace); QTRY_COMPARE(service->rows().size(),2);
    window.setCatalog(QJsonArray{QJsonObject{{"node_type","Node"}, {"properties",QJsonArray{QJsonObject{{"name","value"},{"type",QJsonObject{{"type","str"}}}}}}}});
    QVERIFY(window.document()->loadJson(R"({"graph":{"nodes":[{"id":"local","type":"Node"}],"edges":[]}})"));
    QVERIFY(window.document()->applyCommand({{"op","setProperty"},{"id","local"},{"name","value"},{"value","unsaved"}}));
    const auto unsaved = window.document()->snapshot();
    // Opening leaves unsaved work in its own tab, as WorkspaceTabsStore.openTab does.
    click(browser,item(window,"workflow-row-remote"));
    QTRY_COMPARE(server.count("GET /api/workflows/remote"),1);
    QTRY_COMPARE(window.workflowName(),QString("Remote workflow")); QVERIFY(!window.browserVisible());
    QCOMPARE(window.workflowTabs().size(),2);
    window.activateTab(0); QCOMPARE(window.document()->snapshot(),unsaved); window.activateTab(1);
    auto &remoteTab = *window.activeEditor();
    window.action("Open"); QTRY_VERIFY(item(remoteTab,"workflow-row-remote"));
    auto remoteBrowser = panel(remoteTab,"WorkflowBrowser"); QVERIFY(remoteBrowser);
    auto remoteService = window.workflowBrowser(); QTRY_VERIFY(!remoteService->loading() && !remoteService->projectsLoading());
    const auto current = window.document()->snapshot();
    const auto deleteFromMenu = [&] {
      rowMenu(remoteBrowser,item(remoteTab,"workflow-row-remote"));
      QTRY_VERIFY(item(remoteTab,"workflow-menu-delete") && item(remoteTab,"workflow-menu-delete")->isVisible());
      click(remoteBrowser,item(remoteTab,"workflow-menu-delete"));
    };
    answer(QMessageBox::Cancel); deleteFromMenu(); QCOMPARE(server.count("DELETE /api/workflows/remote"),0);
    answer(QMessageBox::Yes); deleteFromMenu(); QTRY_COMPARE(server.count("DELETE /api/workflows/remote"),1);
    QCOMPARE(window.document()->snapshot(),current);
    QTRY_VERIFY(!remoteService->loading());
    QTest::qWait(150);
    captureWindow(window,"workflow-browser");
  }
};
QTEST_MAIN(AuthoringUiTest)
#include "AuthoringUiTest.moc"
