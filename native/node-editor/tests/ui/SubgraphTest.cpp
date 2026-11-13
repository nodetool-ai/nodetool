#include "document/ChildPorts.h"
#include "graph/EditorScene.h"
#include "ui/EditorWindow.h"
#include <QCryptographicHash>
#include <QDir>
#include <QJsonDocument>
#include "EntryMenuSupport.h"
#include <QQuickItem>
#include <QQuickWidget>
#include <QGraphicsView>
#include <QQuickWindow>
#include <QSettings>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
class ChildServer : public QTcpServer {
public:
  QPointer<QTcpSocket> pending;
  ChildServer() {
    listen(QHostAddress::LocalHost);
    connect(this, &QTcpServer::newConnection, this, [this] {
      while (hasPendingConnections()) {
        auto socket = nextPendingConnection();
        socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
          const auto bytes =
              socket->property("bytes").toByteArray() + socket->readAll();
          socket->setProperty("bytes", bytes);
          if (!bytes.contains("\r\n\r\n") ||
              socket->property("done").toBool()) {
            return;
          }
          socket->setProperty("done", true);
          if (bytes.toLower().contains("upgrade: websocket")) {
            QByteArray key;
            for (const auto &line : bytes.split('\n')) {
              if (line.toLower().startsWith("sec-websocket-key:")) {
                key = line.mid(18).trimmed();
              }
            }
            const auto accept =
                QCryptographicHash::hash(
                    key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
                    QCryptographicHash::Sha1)
                    .toBase64();
            socket->write(
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: "
                "websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
                accept + "\r\n\r\n");
            return;
          }
          if (bytes.startsWith("GET /trpc/jobs.list")) {
              respond(socket, {{"result", QJsonObject{{"data", QJsonObject{{"jobs", QJsonArray{}}}}}}});
          } else if (bytes.startsWith("GET /api/workflows/linked")) {
            pending = socket;
          } else {
            respond(socket, {{"nodes", QJsonArray{}}});
          }
        });
      }
    });
  }
  static void respond(QTcpSocket *socket, QJsonObject value, int status = 200) {
    const auto bytes = QJsonDocument(value).toJson(QJsonDocument::Compact);
    socket->write("HTTP/1.1 " + QByteArray::number(status) +
                  " OK\r\nConnection: close\r\nContent-Type: "
                  "application/json\r\nContent-Length: " +
                  QByteArray::number(bytes.size()) + "\r\n\r\n" + bytes);
    socket->disconnectFromHost();
  }
  QUrl url() const {
    return QUrl(QString("http://127.0.0.1:%1").arg(serverPort()));
  }
};
class SubgraphTest : public QObject {
  Q_OBJECT
  static QJsonObject input(QString name = "prompt") {
    return {{"id", "input"},
            {"type", "nodetool.input.StringInput"},
            {"data", QJsonObject{{"name", name}, {"value", "seed"}}}};
  }
  static QJsonObject graph() {
    return {{"nodes", QJsonArray{input()}},
            {"edges", QJsonArray{}},
            {"unknown", "keep"}};
  }
  static QJsonObject subgraph() {
    return {{"id", "child"},
            {"type", "nodetool.workflows.subgraph.Subgraph"},
            {"data", QJsonObject{{"graph", graph()}}},
            {"extra", 42}};
  }
  static QQuickItem *find(QQuickItem *item, QString name) {
    if (item->objectName() == name) {
      return item;
    }
    for (auto child : item->childItems()) {
      if (auto result = find(child, name)) {
        return result;
      }
    }
    return nullptr;
  }
  static bool click(EditorWindow &w, QString name) {
    // Panels follow in the next pass and their layout in the pass after. The card
    // toolbar shows 200 ms after the selection settles (NodeSelectionToolbar.tsx).
    QTest::qWaitFor([&] {
      for (auto panel : w.findChildren<QQuickWidget *>()) {
        if (!panel->isVisible() || !panel->rootObject()) continue;
        auto item = find(panel->rootObject(), name);
        if (item && item->isVisible()) return true;
      }
      return false;
    }, 1000);
    for (auto panel : w.findChildren<QQuickWidget *>()) {
      if (!panel->isVisible() || !panel->rootObject()) {
        continue;
      }
      auto item = find(panel->rootObject(), name);
      if (!item || !item->isVisible()) {
        continue;
      }
      QTest::mouseClick(
          panel->quickWindow(), Qt::LeftButton, Qt::NoModifier,
          item->mapToScene(QPointF(item->width() / 2, item->height() / 2))
              .toPoint());
      QCoreApplication::processEvents();
      return true;
    }
    return false;
  }
private slots:
  void initTestCase() {
    QCoreApplication::setApplicationName("subgraph-tests");
  }
  void lateChildResponsesAndMissing() {
    ChildServer server;
    QVERIFY(server.isListening());
    EditorWindow w;
    w.show();
    w.session()->connectToServer(server.url(), {}, "first");
    auto linked = subgraph();
    linked["type"] = "nodetool.workflows.workflow_node.Workflow";
    linked["data"] = QJsonObject{{"workflow_id", "linked"}};
    QVERIFY(
        w.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{linked}},
                                                  {"edges", QJsonArray{}}}}}));
    auto parent = w.document();
    const auto original = parent->snapshot();
    QVERIFY(w.selectNode("child"));
    QVERIFY(click(w, "selection-open-child"));
    QTRY_VERIFY(server.pending);
    auto response =
        QJsonObject{{"id", "linked"}, {"updated_at", "r1"}, {"graph", graph()}};
    auto socket = server.pending;
    server.pending.clear();
    // A newly opened linked tab is clean until the response arrives.
    QVERIFY2(!w.hasUnsavedChanges(), qPrintable(w.saveState()));
    QVERIFY(click(w, "close-tab-1"));
    ChildServer::respond(socket, response);
    QTest::qWait(40);
    QCOMPARE(parent->snapshot(), original);
    QVERIFY(w.selectNode("child"));
    QVERIFY(click(w, "selection-open-child"));
    QTRY_VERIFY(server.pending);
    socket = server.pending;
    server.pending.clear();
    w.session()->connectToServer(server.url(), {}, "second");
    const auto before = w.document()->snapshot();
    ChildServer::respond(socket, response);
    QTest::qWait(40);
    QCOMPARE(parent->snapshot(), original);
    QCOMPARE(w.document()->snapshot(), before);
    QVERIFY2(!w.hasUnsavedChanges(), qPrintable(w.saveState()));
    QVERIFY(click(w, "close-tab-1"));
    QVERIFY(w.selectNode("child"));
    QVERIFY(click(w, "selection-open-child"));
    QTRY_VERIFY(server.pending);
    ChildServer::respond(server.pending, {{"message", "Child not found"}}, 404);
    server.pending.clear();
    QTRY_VERIFY2(w.message().contains("404") ||
                     w.message().contains("not found"),
                 qPrintable(w.message()));
    QCOMPARE(parent->snapshot(), original);
    QVERIFY(click(w, "close-tab-1"));
    w.action("Linked workflows");
    auto menu = entry_menu::host(*w.activeEditor(), "linked-workflows-menu");
    QVERIFY(menu);
    QVERIFY(!entry_menu::entries(menu).isEmpty());
    QVERIFY(entry_menu::click(menu, entry_menu::entries(menu).first().toMap()["id"].toString()));
    QTRY_VERIFY(server.pending);
    ChildServer::respond(server.pending, response);
    server.pending.clear();
    QTRY_COMPARE(w.document()->snapshot()["id"].toString(), QString("linked"));
    QTRY_VERIFY(
        parent->node("child")["dynamic_inputs"].toObject().contains("prompt"));
  }
  void edgesAndNestedCopy() {
    WorkflowDocument doc;
    auto child = withChildPorts(subgraph());
    QJsonObject source{{"id", "source"}, {"type", "test.Source"}};
    const QJsonObject edge{{"id", "edge"},
                           {"source", "source"},
                           {"target", "child"},
                           {"sourceHandle", "value"},
                           {"targetHandle", "prompt"},
                           {"unknown", "retained"}};
    QVERIFY(
        doc.load({{"graph", QJsonObject{{"nodes", QJsonArray{source, child}},
                                        {"edges", QJsonArray{edge}}}}}));
    auto next = graph();
    next["additional"] = "preserved";
    QVERIFY(doc.applyCommand(
        {{"op", "setChildGraph"}, {"id", "child"}, {"graph", next}}));
    QCOMPARE(doc.edges(), QJsonArray{edge});
    auto renamed = graph();
    renamed["nodes"] = QJsonArray{input("new")};
    QVERIFY(doc.applyCommand(
        {{"op", "setChildGraph"}, {"id", "child"}, {"graph", renamed}}));
    QVERIFY(doc.edges().isEmpty());
    doc.undo();
    QCOMPARE(doc.edges(), QJsonArray{edge});
    QCOMPARE(childGraph(doc.node("child")), next);
    auto nested = subgraph();
    auto nestedData = nested["data"].toObject();
    auto inner = graph();
    inner["nodes"] = QJsonArray{subgraph()};
    nestedData["graph"] = inner;
    nested["data"] = nestedData;
    QVERIFY(doc.load({{"graph", QJsonObject{{"nodes", QJsonArray{nested}},
                                            {"edges", QJsonArray{}}}}}));
    QVERIFY(doc.duplicate({"child"}));
    QCOMPARE(doc.nodes().size(), 2);
    QCOMPARE(childGraph(doc.nodes().last().toObject()), inner);
    QCOMPARE(doc.nodes().last().toObject()["extra"].toInt(), 42);
  }
  void largeStreamGraph() {
    QJsonArray nodes, edges;
    for (int i = 0; i < 12000; ++i) {
      QJsonObject n{{"id", QString::number(i)}, {"type", i == 11999 ? "nodetool.output.Output" : "test.Pass"}};
      if (i == 0) n["dynamic_output_correlation"] = QJsonObject{{"value", QJsonObject{{"kind", "iteration"}}}};
      nodes.append(n);
      if (i) edges.append(QJsonObject{{"source", QString::number(i-1)}, {"sourceHandle", "value"}, {"target", QString::number(i)}});
    }
    const auto result = withChildPorts({{"type", "nodetool.workflows.app_node.App"}, {"data", QJsonObject{{"app_json", QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}}}}}});
    QCOMPARE(result["dynamic_output_correlation"].toObject()["Output"].toObject()["kind"].toString(), QString("chunk"));
  }
  void appBindings() {
    auto n = subgraph();
    n["type"] = "nodetool.workflows.app_node.App";
    auto g = graph();
    g["nodes"] = QJsonArray{
        input(),
        QJsonObject{{"id", "fixed"},
                    {"type", "nodetool.input.IntegerInput"},
                    {"data", QJsonObject{{"name", "count"}, {"value", 2}}}},
        QJsonObject{{"id", "out"},
                    {"type", "nodetool.output.CustomOutput"},
                    {"data", QJsonObject{{"name", " result "}}}},
        QJsonObject{
            {"id", "stream"},
            {"type", "test.Stream"},
            {"dynamic_output_correlation",
             QJsonObject{{"value", QJsonObject{{"kind", "iteration"}}}}}}};
    g["edges"] = QJsonArray{QJsonObject{
        {"source", "stream"}, {"sourceHandle", "value"}, {"target", "out"}}};
    n["data"] = QJsonObject{
        {"app_json",
         QJsonObject{{"graph", g},
                     {"input_bindings",
                      QJsonObject{{"fixed", QJsonObject{{"from", "constant"},
                                                        {"value", 7}}},
                                  {"input", QJsonObject{{"from", "variable"},
                                                        {"variableId", "v"}}}}},
                     {"variables",
                      QJsonArray{QJsonObject{
                          {"id", "v"}, {"default", "variable default"}}}}}}};
    const auto derived = withChildPorts(n);
    QVERIFY(!derived["dynamic_inputs"].toObject().contains("count"));
    QCOMPARE(derived["dynamic_properties"].toObject()["prompt"].toString(),
             QString("variable default"));
    QCOMPARE(derived["dynamic_output_correlation"]
                 .toObject()["result"]
                 .toObject()["kind"]
                 .toString(),
             QString("chunk"));
    QJsonArray edges{QJsonObject{
        {"id", "retained"}, {"target", "child"}, {"targetHandle", "prompt"}}};
    auto next = derived;
    next["dynamic_inputs"] = QJsonObject{};
    removeStaleChildEdges(derived, next, edges);
    QCOMPARE(edges.size(), 1);
  }
  void derivation() {
    auto node = subgraph();
    auto derived = withChildPorts(node);
    QCOMPARE(derived["dynamic_inputs"]
                 .toObject()["prompt"]
                 .toObject()["type"]
                 .toObject()["type"]
                 .toString(),
             QString("str"));
    QCOMPARE(derived["dynamic_properties"].toObject()["prompt"].toString(),
             QString("seed"));
    auto data = node["data"].toObject();
    auto g = graph();
    g["nodes"] = QJsonArray{
        QJsonObject{
            {"id", "custom"},
            {"type", "nodetool.input.CustomInput"},
            {"data", QJsonObject{{"properties",
                                  QJsonObject{{"name", "custom"},
                                              {"description", "help"}}}}}},
        QJsonObject{{"id", "o"},
                    {"type", "nodetool.output.Output"},
                    {"data", QJsonObject{}}}};
    data["graph"] = g;
    node["data"] = data;
    derived = withChildPorts(node);
    QVERIFY(derived["dynamic_inputs"].toObject().contains("custom"));
    QVERIFY(derived["dynamic_outputs"].toObject().contains("Output"));
  }
  void stripCloseCascadeAndRestore() {
      QTemporaryDir files;
      QVERIFY(files.isValid());
      EditorWindow window;
      window.show();
      QVERIFY(window.canvasStrips().isEmpty());
      window.setCatalog({QJsonObject{
          {"node_type", "nodetool.input.StringInput"},
          {"properties",
           QJsonArray{QJsonObject{{"name", "name"}, {"type", QJsonObject{{"type", "str"}}}}}}}});
      auto child = subgraph();
      auto inner = graph();
      inner["nodes"] = QJsonArray{subgraph()};
      child["data"] = QJsonObject{{"graph", inner}};
      QVERIFY(window.document()->load(
          {{"name", "Host"},
           {"graph", QJsonObject{{"nodes", QJsonArray{child}}, {"edges", QJsonArray{}}}}}));
      auto parent = window.document();
      QVERIFY(window.saveFile(files.filePath("host.json")));
      QVERIFY(window.selectNode("child"));
      QVERIFY(click(window, "selection-open-child"));
      QPointer<EditorWindow> first = window.activeEditor();
      QCOMPARE(window.workflowTabs().size(), 1);
      QCOMPARE(window.canvasStrips().size(), 1);
      QVERIFY(!click(window, "close-canvas-0-0"));
      QVERIFY(click(window, "activate-canvas-0-0"));
      QCOMPARE(window.document(), parent);
      QVERIFY(click(window, "activate-canvas-0-1"));
      QCOMPARE(window.activeEditor(), first.data());
      QVERIFY(window.selectNode("child"));
      QVERIFY(click(window, "selection-open-child"));
      QPointer<EditorWindow> second = window.activeEditor();
      QCOMPARE(window.canvasStrips().size(), 2);
        QCOMPARE(window.canvasStrips().first().toMap()["entries"].toList()[0].toMap()["title"].toString(), QString("Workflow"));
        QCOMPARE(window.canvasStrips().last().toMap()["entries"].toList()[0].toMap()["title"].toString(), first->workflowName());
        QQuickWidget *strips = nullptr;
        for (auto widget : window.findChildren<QQuickWidget *>()) {
            if (widget->isVisible() && widget->source().fileName() == "CanvasTabStrip.qml") {
                strips = widget;
            }
        }
        QVERIFY(strips);
        auto view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(view);
        QTRY_COMPARE(strips->width(), view->width());
        QCOMPARE(strips->mapTo(&window, QPoint()).x(), view->mapTo(&window, QPoint()).x());
        QCOMPARE(strips->mapTo(&window, QPoint(0, strips->height())).y(), view->mapTo(&window, QPoint()).y());
        QCOMPARE(find(strips->rootObject(), "canvas-label-0-0")->property("text").toString(), QString("Workflow"));
        QCOMPARE(find(strips->rootObject(), "canvas-label-1-0")->property("text").toString(), first->workflowName());
      const auto entries = window.canvasStrips().first().toMap()["entries"].toList();
      QVERIFY(entries[1].toMap()["selected"].toBool());
      QVERIFY(window.document()->applyCommand(
          {{"op", "setProperty"}, {"id", "input"}, {"name", "name"}, {"value", "changed"}}));
      QTRY_VERIFY(!parent->undoStack()->isClean());
      // The web toolbar has no Save button. Ctrl+S saves the parent from a child surface.
      QTest::keyClick(view->viewport(), Qt::Key_S, Qt::ControlModifier);
      QVERIFY(parent->undoStack()->isClean());
      QVERIFY(!window.hasUnsavedChanges());
      window.persistTabs();
      const auto restoredEntries =
          QJsonDocument::fromJson(QSettings().value("workflowTabs/documents").toByteArray())
              .array();
      QCOMPARE(restoredEntries.size(), 1);
      QCOMPARE(QSettings().value("workflowTabs/active").toInt(), 0);
      QVERIFY(click(window, "close-canvas-0-1"));
      QTRY_VERIFY(first.isNull());
      QVERIFY(second.isNull());
      QVERIFY(window.canvasStrips().isEmpty());
      QVERIFY(window.selectNode("child"));
      QVERIFY(click(window, "selection-open-child"));
      QVERIFY(window.selectNode("child"));
      QVERIFY(click(window, "selection-open-child"));
      QCOMPARE(window.document()->node("input")["data"].toObject()["name"].toString(),
               QString("changed"));
      first = window.activeEditor();
      QVERIFY(click(window, "close-tab-0"));
      QTRY_VERIFY(first.isNull());
      QVERIFY(window.canvasStrips().isEmpty());
      EditorWindow restored;
      restored.restoreTabs();
      QCOMPARE(restored.workflowTabs().size(), 1);
      QVERIFY(restored.canvasStrips().isEmpty());
      QCOMPARE(restored.document()->snapshot()["name"].toString(), QString("Host"));
  }
  void replacementDiscardsPendingChildWriteback() {
      EditorWindow window;
      window.show();
      const QJsonObject workflow{
          {"name", "Host"},
          {"graph", QJsonObject{{"nodes", QJsonArray{subgraph()}}, {"edges", QJsonArray{}}}}};
      QVERIFY(window.document()->load(workflow));
      auto parent = window.document();
      QVERIFY(window.selectNode("child"));
      QVERIFY(click(window, "selection-open-child"));
      QPointer<EditorWindow> child = window.activeEditor();
      QVERIFY(window.document()->applyCommand(
          {{"op", "moveNodes"},
           {"positions", QJsonObject{{"input", QJsonObject{{"x", 100}, {"y", 100}}}}}}));
      QVERIFY(parent->load(workflow));
      QVERIFY(child.isNull());
      QCOMPARE(parent->snapshot(), workflow);
      QTest::qWait(350);
      QCOMPARE(parent->snapshot(), workflow);
      QVERIFY(window.canvasStrips().isEmpty());
  }
  void childEditingRoundTrip() {
    EditorWindow window;
    window.show();
    window.setCatalog(
        {QJsonObject{{"node_type", "nodetool.workflows.subgraph.Subgraph"},
                     {"title", "Subgraph"}},
         QJsonObject{
             {"node_type", "nodetool.input.StringInput"},
             {"title", "String input"},
             {"properties",
              QJsonArray{
                  QJsonObject{{"name", "name"},
                              {"type", QJsonObject{{"type", "str"}}}},
                  QJsonObject{{"name", "value"},
                              {"type", QJsonObject{{"type", "str"}}}}}}}});
    auto child = subgraph();
    auto inner = graph();
    auto keep = input("keep");
    keep["id"] = "keep";
    auto nested = subgraph(); nested["id"] = "nested";
    inner["nodes"] = QJsonArray{input(), keep, nested};
    child["data"] = QJsonObject{{"graph", inner}};
    const QJsonObject edge{{"id", "kept-edge"},      {"source", "source"},
                           {"sourceHandle", "out"},  {"target", "child"},
                           {"targetHandle", "keep"}, {"extra", 42}};
    QVERIFY(window.document()->load(
        {{"name", "Parent"},
         {"graph",
          QJsonObject{{"nodes",
                       QJsonArray{child, QJsonObject{{"id", "source"},
                                                     {"type", "test.Source"}}}},
                      {"edges", QJsonArray{edge}}}}}));
    auto parent = window.document();
    QVERIFY(window.selectNode("child"));
    QVERIFY(click(window, "selection-open-child"));
    QCOMPARE(window.workflowTabs().size(), 1);
    QCOMPARE(window.document()->nodes().size(), 3);
    QVERIFY(window.selectNode("nested")); QVERIFY(click(window, "selection-open-child"));
    QCOMPARE(window.workflowTabs().size(), 1); QCOMPARE(window.document()->nodes().size(), 1);
    QVERIFY(click(window, "activate-canvas-0-1"));
    QVERIFY(window.selectNode("input"));
    QVERIFY(click(window, "property-name"));
    for (auto panel : window.findChildren<QQuickWidget *>()) {
      if (!panel->isVisible() || !panel->rootObject()) {
        continue;
      }
      auto field = find(panel->rootObject(), "property-name");
      if (!field) {
        continue;
      }
      panel->setFocus();
      field->forceActiveFocus();
      QTest::keyClick(panel, Qt::Key_A, Qt::ControlModifier);
      for (const auto c : QString("renamed")) {
        QTest::keyClick(panel->quickWindow(), Qt::Key(c.toUpper().unicode()));
      }

      QVERIFY(click(window, "property-value"));
      break;
    }
    QTRY_COMPARE(
        window.document()->node("input")["data"].toObject()["name"].toString(),
        QString("renamed"));
    QTRY_VERIFY(!parent->undoStack()->isClean());
    QVERIFY(window.hasUnsavedChanges());
    QVERIFY(click(window, "activate-canvas-0-0"));
    QCOMPARE(window.document(), parent);
    QVERIFY(withChildPorts(parent->node("child"))["dynamic_inputs"]
                .toObject()
                .contains("renamed"));
    QCOMPARE(parent->node("child")["data"]
                 .toObject()["graph"]
                 .toObject()["unknown"]
                 .toString(),
             QString("keep"));
    QCOMPARE(parent->edges(), QJsonArray{edge});
    QCoreApplication::processEvents();
    auto &projection =
        static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    for (const auto id : projection.allNodeIds()) {
      if (projection.resourceId(id) != "child") {
        continue;
      }
      QStringList names;
      for (const auto &v : projection.ports(id, QtNodes::PortType::In)) {
        names.append(v.toObject()["name"].toString());
      }
      QVERIFY(names.contains("keep"));
      QVERIFY(names.contains("renamed"));
      QCOMPARE(projection.allConnectionIds(id).size(), size_t(1));
    }

    auto childDocument = window.document();
    QVERIFY(click(window, "activate-canvas-0-1"));
    childDocument = window.document();
    const auto childUndo = childDocument->undoStack()->index();
    QVERIFY(click(window, "activate-canvas-0-0"));
    window.action("Undo");
    QCOMPARE(childDocument->undoStack()->index(), childUndo);
    QVERIFY(click(window, "activate-canvas-0-1"));
    QCOMPARE(
        window.document()->node("input")["data"].toObject()["name"].toString(),
        QString("prompt"));
    QCOMPARE(window.document()->undoStack()->index(), 0);
    QCOMPARE(window.canvasStrips().size(), 1);
    QVERIFY(click(window, "activate-canvas-0-0"));
    window.action("Redo");
    QVERIFY(window.selectNode("child"));
    QVERIFY(click(window, "selection-duplicate"));
    QCOMPARE(parent->nodes().size(), 3);
    QJsonObject positions;
    int column = 0;
    for (const auto &v : parent->nodes()) positions[v.toObject()["id"].toString()] = QJsonObject{{"x", column++ * 360}, {"y", 100}};
    QVERIFY(parent->applyCommand({{"op", "moveNodes"}, {"positions", positions}}));
    QTemporaryDir files;
    QVERIFY(window.saveFile(files.filePath("parent.json")));
    auto saved = parent->snapshot();
    QVERIFY(window.openFile(files.filePath("parent.json")));
    QCOMPARE(window.document()->snapshot(), saved);
    QVERIFY(window.selectNode("child"));
    QVERIFY(click(window, "selection-open-child"));
    const auto dir = qEnvironmentVariable("NODETOOL_SUBGRAPH_CAPTURE_DIR");
    for (bool dark : {true, false}) {
        window.setDarkTheme(dark);
        window.fit();
        QTest::qWait(100);
        if (!dir.isEmpty()) {
            QVERIFY(QDir().mkpath(dir));
            QVERIFY(window.grab().save(
                    dir + (dark ? "/subgraph-dark.png" : "/subgraph-light.png")));
        }
        QVERIFY(window.selectNode("nested"));
        QVERIFY(click(window, "selection-open-child"));
        QTest::qWait(100);
        if (!dir.isEmpty()) {
            QVERIFY(window.grab().save(dir + (dark ? "/subgraph-nested-dark.png" : "/subgraph-nested-light.png")));
        }
        QVERIFY(click(window, "close-canvas-1-1"));
    }
  }
};
QTEST_MAIN(SubgraphTest)
#include "SubgraphTest.moc"
