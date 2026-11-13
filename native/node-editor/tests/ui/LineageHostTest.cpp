#include "graph/EditorScene.h"
#include "graph/LineageLayer.h"
#include "graph/NodeLayout.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QGraphicsView>
#include "EntryMenuSupport.h"
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
namespace {
QJsonObject node(const QString &id, double x, double y,
                 const QString &parent = {},
                 const QString &type = "fixture.Node") {
  QJsonObject value{
      {"id", id},
      {"type", type},
      {"data", QJsonObject{{"future", 42}}},
      {"ui_properties",
       QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}, {"future", 7}}},
                   {"width", 280},
                   {"height", 120}}}};
  if (!parent.isEmpty()) {
    value["parent_id"] = parent;
  }
  return value;
}
QJsonObject fixture(bool links = true) {
  return {
      {"name", "Lineage host fixture"},
      {"futureWorkflow", true},
      {"graph",
       QJsonObject{
           {"nodes", QJsonArray{node("a", 0, 0), node("b", 650, 0),
                                node("c", 0, 380), node("d", 650, 380)}},
           {"edges", QJsonArray{}},
           {"futureGraph", 42},
           {"links", links ? QJsonArray{QJsonObject{{"id", "ab"},
                                                    {"source", "a"},
                                                    {"target", "b"},
                                                    {"label", "Reference one"},
                                                    {"kind", "source"},
                                                    {"future", 11}},
                                        QJsonObject{{"id", "cd"},
                                                    {"source", "c"},
                                                    {"target", "d"},
                                                    {"label", "Reference two"},
                                                    {"kind", "branch"},
                                                    {"future", 12}}}
                           : QJsonArray{}}}}};
}
QtNodes::NodeGraphicsObject *item(EditorWindow &window,
                                  const QString &resource) {
  auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
  for (const auto id : model.allNodeIds()) {
    if (model.resourceId(id) == resource) {
      return window.scene()->nodeGraphicsObject(id);
    }
  }
  return nullptr;
}
bool select(EditorWindow &window, const QStringList &ids) {
  window.scene()->clearSelection();
  for (const auto &id : ids) {
    auto *object = item(window, id);
    if (!object) {
      return false;
    }
    object->setSelected(true);
  }
  return true;
}
void clickLink(EditorWindow &window, LineageLayer &layer, const QString &id,
               Qt::KeyboardModifiers modifiers = Qt::NoModifier) {
  auto *view = window.findChild<QGraphicsView *>();
  QVERIFY(view);
  QVERIFY(!layer.linkPath(id).isEmpty());
  const auto point = view->mapFromScene(layer.linkPath(id).pointAtPercent(.5));
  QTest::mouseClick(view->viewport(), Qt::LeftButton, modifiers, point);
}
QQuickItem *find(QQuickItem *root, const QString &name) {
  if (!root) {
    return nullptr;
  }
  if (root->objectName() == name) {
    return root;
  }
  for (auto *child : root->childItems()) {
    if (auto *found = find(child, name)) {
      return found;
    }
  }
  return nullptr;
}
} // namespace
class LineageHostTest final : public QObject {
  Q_OBJECT
private slots:
  void savedLinksEditableAndSelectionDeletionUndo() {
    EditorWindow window;
    QVERIFY(window.document()->load(fixture()));
    window.show();
    window.fit();
    auto *layer = window.findChild<LineageLayer *>();
    QVERIFY(layer);
    QTRY_VERIFY(!window.readOnly());
    QTRY_VERIFY(layer->linkItem("ab"));
    QTRY_VERIFY(layer->linkItem("cd"));
    QTest::qWait(60);
    const auto original = window.document()->snapshot();
    QVERIFY(select(window, {"a", "b"}));
    QCOMPARE(window.selectedCount(), 2);
    clickLink(window, *layer, "ab");
    QTRY_COMPARE(layer->selectedLinkIds(), QStringList{"ab"});
    QCOMPARE(window.selectedCount(), 0);
    auto *view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    QTest::keyClick(view, Qt::Key_Delete);
    QTRY_COMPARE(window.document()->graph()["links"].toArray().size(), 1);
    QCOMPARE(window.document()->nodes().size(), 4);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_VERIFY(layer->linkItem("ab"));
    QSignalSpy middleDelete(layer, &LineageLayer::deleteRequested);
    QTest::mouseClick(
        view->viewport(), Qt::MiddleButton, Qt::NoModifier,
        view->mapFromScene(layer->linkPath("ab").pointAtPercent(.5)));
    QTRY_COMPARE(middleDelete.size(), 1);
    QCOMPARE(middleDelete.first()[0].toString(), QString("ab"));
    QTRY_COMPARE(window.document()->graph()["links"].toArray().size(), 1);
    QCOMPARE(window.document()->nodes().size(), 4);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_VERIFY(layer->linkItem("ab"));
    clickLink(window, *layer, "ab");
    clickLink(window, *layer, "cd", Qt::ShiftModifier);
    QTRY_COMPARE(layer->selectedLinkIds(), (QStringList{"ab", "cd"}));
    window.action("Delete");
    QTRY_VERIFY(window.document()->graph()["links"].toArray().isEmpty());
    QCOMPARE(window.document()->nodes().size(), 4);
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_VERIFY(layer->linkItem("ab"));
    // Mixed node/link deletion removes each selected resource once, with one
    // undo.
    QVERIFY(select(window, {"a"}));
    clickLink(window, *layer, "cd", Qt::ControlModifier);
    QTRY_VERIFY(layer->selectedLinkIds().contains("cd"));
    QCOMPARE(window.selectedCount(), 1);
    const auto index = window.document()->undoStack()->index();
    window.action("Delete");
    QTRY_COMPARE(window.document()->nodes().size(), 3);
    QVERIFY(window.document()->node("a").isEmpty());
    QVERIFY(window.document()->graph()["links"].toArray().isEmpty());
    QCOMPARE(window.document()->undoStack()->index(), index + 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_VERIFY(layer->linkItem("ab"));
    QTRY_VERIFY(layer->linkItem("cd"));
    QTemporaryDir temporary;
    QVERIFY(temporary.isValid());
    const auto file = temporary.filePath("lineage.json");
    QVERIFY(window.saveFile(file));
    EditorWindow reopened;
    QVERIFY(reopened.openFile(file));
    QVERIFY(!reopened.readOnly());
    QCOMPARE(reopened.document()->snapshot(), original);
    const auto capture = qEnvironmentVariable("NODETOOL_LINEAGE_CAPTURE_DIR");
    if (!capture.isEmpty()) {
      QVERIFY(QDir().mkpath(capture));
      for (const bool dark : {true, false}) {
        window.setDarkTheme(dark);
        window.fit();
        QTest::qWait(80);
        QVERIFY(window.grab().save(
            capture + (dark ? "/lineage-dark.png" : "/lineage-light.png")));
      }
    }
  }
  void linkSelectedEntryPointAndExactlyTwoNodes() {
    EditorWindow window;
    QVERIFY(window.document()->load(fixture(false)));
    window.show();
    window.fit();
    QTest::qWait(60);
    auto *layer = window.findChild<LineageLayer *>();
    QVERIFY(layer);
    QVERIFY(select(window, {"a"}));
    window.action("Link selected");
    QVERIFY(window.document()->graph()["links"].toArray().isEmpty());
    QVERIFY(select(window, {"a", "b", "c"}));
    window.action("Link selected");
    QVERIFY(window.document()->graph()["links"].toArray().isEmpty());
    QVERIFY(select(window, {"b", "a"}));
    QCOMPARE(window.selectedCount(), 2);
    QQuickWidget *toolbar = nullptr;
    for (auto *panel : window.findChildren<QQuickWidget *>()) {
      if (panel->source().fileName() == "SelectionToolbar.qml") {
        toolbar = panel;
      }
    }
    QVERIFY(toolbar);
    QQuickItem *linkButton =
        find(toolbar->rootObject(), "selection-link-selected");
    if (linkButton && linkButton->isVisible()) {
      QTRY_VERIFY(linkButton->isEnabled());
      QSignalSpy clicked(linkButton, SIGNAL(clicked()));
      QTest::mouseClick(toolbar->quickWindow(), Qt::LeftButton, Qt::NoModifier,
                        linkButton
                            ->mapToScene(QPointF(linkButton->width() / 2,
                                                 linkButton->height() / 2))
                            .toPoint());
      QCOMPARE(clicked.size(), 1);
    } else {
      window.action("More");
      auto *menu = entry_menu::host(window, "more");
      QVERIFY(menu);
      QVERIFY(entry_menu::entry(menu, "Link selected")["enabled"].toBool());
      QVERIFY(entry_menu::click(menu, "Link selected"));
    }
    QTRY_COMPARE(window.document()->graph()["links"].toArray().size(), 1);
    const auto link =
        window.document()->graph()["links"].toArray()[0].toObject();
    QCOMPARE(link["source"].toString(), "a");
    QCOMPARE(link["target"].toString(), "b");
    QTRY_VERIFY(layer->linkItem(link["id"].toString()));
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Link selected");
    QCOMPARE(window.document()->graph()["links"].toArray().size(), 1);
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Undo");
    QVERIFY(window.document()->graph()["links"].toArray().isEmpty());
    window.action("Redo");
    QCOMPARE(window.document()->graph()["links"].toArray().size(), 1);
  }
  void nestedGroupDragAndResetKeepAnchorsCurrent() {
    auto outer = node("outer", 0, 0, {}, "nodetool.workflows.base_node.Group");
    auto ui = outer["ui_properties"].toObject();
    ui["width"] = 550;
    ui["height"] = 450;
    outer["ui_properties"] = ui;
    auto nested =
        node("nested", 50, 70, "outer", "nodetool.workflows.base_node.Group");
    ui = nested["ui_properties"].toObject();
    ui["width"] = 400;
    ui["height"] = 280;
    nested["ui_properties"] = ui;
    const QJsonObject snapshot{
        {"graph", QJsonObject{{"nodes", QJsonArray{outer, nested,
                                                   node("a", 40, 80, "nested"),
                                                   node("b", 950, 200)}},
                              {"edges", QJsonArray{}},
                              {"links", QJsonArray{QJsonObject{
                                            {"id", "ab"},
                                            {"source", "a"},
                                            {"target", "b"},
                                            {"label", "Nested reference"}}}}}}};
    EditorWindow window;
    QVERIFY(window.document()->load(snapshot));
    window.show();
    window.fit();
    QTest::qWait(80);
    auto *layer = window.findChild<LineageLayer *>();
    auto *view = window.findChild<QGraphicsView *>();
    QVERIFY(layer);
    QVERIFY(view);
    QVERIFY(!window.readOnly());
    QTRY_VERIFY(layer->linkItem("ab"));
    const auto original = window.document()->snapshot();
    const auto path = layer->linkPath("ab");
    const QJsonValue childPosition =
        window.document()->node("a")["ui_properties"].toObject()["position"];
    QVERIFY(window.selectNode("outer"));
    auto *frame = item(window, "outer");
    QVERIFY(frame);
    const auto start = view->mapFromScene(frame->scenePos() + QPointF(12, 12));
    QTest::mousePress(view->viewport(), Qt::LeftButton, Qt::NoModifier, start);
    QTest::mouseMove(view->viewport(), start + QPoint(70, 45), 30);
    QTRY_VERIFY(layer->linkPath("ab") != path);
    const auto transient = layer->linkPath("ab");
    QVERIFY(transient.pointAtPercent(0) != path.pointAtPercent(0));
    QTest::mouseRelease(view->viewport(), Qt::LeftButton, Qt::NoModifier,
                        start + QPoint(70, 45));
    QTRY_VERIFY(window.document()->snapshot() != original);
    QCOMPARE(
        window.document()->node("a")["ui_properties"].toObject()["position"],
        childPosition);
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_COMPARE(layer->linkPath("ab"), path);
    window.action("Redo");
    QTRY_VERIFY(layer->linkPath("ab") != path);
    window.action("Undo");
    QTRY_COMPARE(layer->linkPath("ab"), path);
    // Loading a new snapshot clears all scene-owned graphics items.
    QPointer<QGraphicsObject> former = layer->linkItem("ab");
    QVERIFY(window.document()->load(fixture()));
    QTRY_VERIFY(former.isNull());
    QTRY_VERIFY(layer->linkItem("cd"));
    QVERIFY(!window.readOnly());
  }
  void malformedLinksStayReadOnly() {
    const auto source = fixture();
    const auto validLink =
        source["graph"].toObject()["links"].toArray().first().toObject();
    EditorWindow window;
    for (const auto &change :
         QJsonArray{QJsonObject{{"target", "missing"}}, QJsonObject{{"id", ""}},
                    QJsonObject{{"label", 42}}, QJsonObject{{"kind", true}}}) {
      auto link = validLink;
      const auto fields = change.toObject();
      for (auto it = fields.cbegin(); it != fields.cend(); ++it) {
        link[it.key()] = it.value();
      }
      auto malformed = source;
      auto graph = malformed["graph"].toObject();
      graph["links"] = QJsonArray{link};
      malformed["graph"] = graph;
      QVERIFY(window.document()->load(malformed));
      QVERIFY(window.readOnly());
      const auto before = window.document()->snapshot();
      window.action("Link selected");
      window.action("Delete");
      QCOMPARE(window.document()->snapshot(), before);
      QCOMPARE(window.document()->undoStack()->count(), 0);
    }
    QVERIFY(window.document()->load(fixture()));
    QTRY_VERIFY(!window.readOnly());
    auto *layer = window.findChild<LineageLayer *>();
    QVERIFY(layer);
    QTRY_VERIFY(layer->linkItem("ab"));
  }
  // web/src/components/node_editor/ControlEdge.tsx and BaseNode.tsx lines 756 and 840: an Agent
  // control edge leaves the bottom center of the controller, enters the top center of the controlled
  // node, and is drawn amber and dashed. Selection, deletion and the edge menu are the wire's own.
  void controlEdgesDrawSelectAndDelete() {
    EditorWindow window;
    const auto text = QJsonObject{{"type", "str"}};
    window.setCatalog({QJsonObject{{"node_type", "fixture.Node"}, {"title", "Fixture"}, {"input_fields", QJsonArray{"in"}},
        {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", text}}}}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", text}}}}}});
    auto workflow = fixture(false);
    auto graph = workflow["graph"].toObject();
    graph["edges"] = QJsonArray{QJsonObject{{"id", "ctl"}, {"source", "a"}, {"target", "d"}, {"sourceHandle", "__control__"},
                                            {"targetHandle", "__control__"}, {"edge_type", "control"}, {"future", 5}}};
    workflow["graph"] = graph;
    QVERIFY(window.document()->load(workflow));
    window.show();
    window.fit();
    QTRY_VERIFY(!window.readOnly());
    QTest::qWait(60);
    auto *scene = window.scene();
    auto &model = static_cast<WorkflowGraphModel &>(scene->graphModel());
    const auto wire = [&]() -> QtNodes::ConnectionGraphicsObject * {
      for (const auto id : model.allNodeIds()) {
        for (const auto &connection : model.allConnectionIds(id)) {
          if (model.edge(connection)["id"] == "ctl") { return scene->connectionGraphicsObject(connection); }
        }
      }
      return nullptr;
    };
    QTRY_VERIFY(wire());
    const auto original = window.document()->snapshot();
    // Bottom center of the controller to top center of the controlled node.
    const auto out = wire()->endPoint(QtNodes::PortType::Out);
    const auto in = wire()->endPoint(QtNodes::PortType::In);
    const auto nodeId = [&](const QString &resource) {
      for (const auto id : model.allNodeIds()) {
        if (model.resourceId(id) == resource) { return id; }
      }
      return QtNodes::InvalidNodeId;
    };
    const auto source = model.layout(nodeId("a")).size;
    const auto target = model.layout(nodeId("d")).size;
    QCOMPARE(out, item(window, "a")->pos() + QPointF(source.width() / 2.0, source.height()));
    QCOMPARE(in, item(window, "d")->pos() + QPointF(target.width() / 2.0, 0));
    // The stroke is amber and dashed, so a dash gap leaves the canvas visible.
    const auto curve = controlWireCurve(out, in);
    const QRectF region = curve.boundingRect().adjusted(-8, -8, 8, 8);
    QImage image(region.size().toSize() * 2, QImage::Format_ARGB32);
    image.fill(Qt::transparent);
    { QPainter painter(&image); scene->render(&painter, QRectF(QPointF(), QSizeF(image.size())), region); }
    int amber = 0;
    for (int y = 0; y < image.height(); ++y) {
      for (int x = 0; x < image.width(); ++x) {
        const auto c = image.pixelColor(x, y);
        amber += c.alpha() > 100 && c.red() > 150 && c.green() > 80 && c.green() < 190 && c.blue() < 90;
      }
    }
    QVERIFY2(amber > 100, qPrintable(QString::number(amber)));
    auto *view = window.findChild<QGraphicsView *>();
    QVERIFY(view);
    const auto middle = [&] { return view->mapFromScene(controlWireCurve(wire()->endPoint(QtNodes::PortType::Out), wire()->endPoint(QtNodes::PortType::In)).pointAtPercent(.5)); };
    QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, middle());
    QTRY_VERIFY(wire() && wire()->isSelected());
    QTest::keyClick(view, Qt::Key_Delete);
    QTRY_COMPARE(window.document()->graph()["edges"].toArray().size(), 0);
    QCOMPARE(window.document()->nodes().size(), 4);
    QCOMPARE(window.document()->undoStack()->count(), 1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    QTRY_VERIFY(wire());
    // Middle click deletes, as the web's edge handler does.
    QTest::mouseClick(view->viewport(), Qt::MiddleButton, Qt::NoModifier, middle());
    QTRY_COMPARE(window.document()->graph()["edges"].toArray().size(), 0);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(), original);
    // The edge menu names the control edge.
    QTRY_VERIFY(wire());
    QSignalSpy menu(scene, &EditorScene::dataEdgeContextMenuRequested);
    QContextMenuEvent request(QContextMenuEvent::Mouse, middle(), view->viewport()->mapToGlobal(middle()));
    QApplication::sendEvent(view->viewport(), &request);
    QTRY_COMPARE(menu.size(), 1);
    QCOMPARE(menu.first()[0].toString(), QString("ctl"));
  }
  // A run reports edge counts and the untaken side of an If. The canvas shows a flowing wire from the
  // running node, a count pill, the not-run fade and the control edge together.
  void executionStateCapture() {
    EditorWindow window;
    const auto text = QJsonObject{{"type", "str"}};
    const auto port = [&](const char *name) { return QJsonObject{{"name", name}, {"type", text}}; };
    window.setCatalog({QJsonObject{{"node_type", "fixture.Node"}, {"title", "Step"}, {"input_fields", QJsonArray{"in", "in2"}},
                                   {"properties", QJsonArray{port("in"), port("in2")}}, {"outputs", QJsonArray{port("out")}}},
                       QJsonObject{{"node_type", "nodetool.control.If"}, {"title", "If"}, {"input_fields", QJsonArray{"in"}},
                                   {"properties", QJsonArray{port("in")}}, {"outputs", QJsonArray{port("if_true"), port("if_false")}}}});
    const auto wire = [](const char *id, const char *from, const char *out, const char *to, const char *in) {
      return QJsonObject{{"id", id}, {"source", from}, {"sourceHandle", out}, {"target", to}, {"targetHandle", in}};
    };
    QJsonObject control = wire("ctl", "x", "__control__", "c", "__control__");
    control["edge_type"] = "control";
    QJsonObject workflow{{"graph", QJsonObject{
        {"nodes", QJsonArray{node("i", 0, 0, {}, "nodetool.control.If"), node("a", 450, 0), node("b", 450, 260), node("c", 900, 260),
                             node("d", 900, 0), node("x", 0, 260)}},
        {"edges", QJsonArray{wire("ia", "i", "if_true", "a", "in"), wire("ib", "i", "if_false", "b", "in"), wire("bc", "b", "out", "c", "in"),
                             wire("ad", "a", "out", "d", "in"), wire("bd", "b", "out", "d", "in2"), control}}}}};
    QVERIFY(window.document()->load(workflow));
    window.resize(1500, 900);
    window.show();
    window.fit();
    QTRY_VERIFY(!window.readOnly());
    QTest::qWait(80);
    emit window.session()->runSubmitted("run");
    const auto send = [&](QJsonObject event, int sequence) {
      event["job_id"] = "run";
      event["job_seq"] = sequence;
      emit window.session()->runEvent("run", event);
    };
    send({{"type", "edge_update"}, {"edge_id", "ia"}, {"status", "completed"}, {"counter", 1}}, 1);
    send({{"type", "edge_update"}, {"edge_id", "ib"}, {"status", "completed"}}, 2);
    send({{"type", "edge_update"}, {"edge_id", "ad"}, {"status", "active"}, {"counter", 12}}, 3);
    send({{"type", "node_update"}, {"node_id", "a"}, {"status", "running"}}, 4);
    auto &model = static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto opacityOf = [&](const QString &resource) {
      for (const auto id : model.allNodeIds()) {
        if (model.resourceId(id) == resource) { return window.scene()->nodeGraphicsObject(id)->opacity(); }
      }
      return -1.0;
    };
    QTRY_COMPARE(opacityOf("b"), node_metrics::notRunOpacity);
    QCOMPARE(opacityOf("c"), node_metrics::notRunOpacity);
    QCOMPARE(opacityOf("a"), 1.0);
    QCOMPARE(opacityOf("d"), 1.0);
    const auto capture = qEnvironmentVariable("NODETOOL_LINEAGE_CAPTURE_DIR");
    if (!capture.isEmpty()) {
      QVERIFY(QDir().mkpath(capture));
      for (const bool dark : {true, false}) {
        window.setDarkTheme(dark);
        window.fit();
        QTest::qWait(120);
        QVERIFY(window.grab().save(capture + (dark ? "/execution-dark.png" : "/execution-light.png")));
      }
    }
  }
};
QTEST_MAIN(LineageHostTest)
#include "LineageHostTest.moc"
