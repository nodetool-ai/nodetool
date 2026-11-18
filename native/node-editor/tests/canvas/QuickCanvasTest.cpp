// The Quick canvas (docs/plans/node-editor-quick-canvas/plan.md, Q3): its
// items, hit tests, gestures and culling, on a GraphCanvas in a QQuickWindow
// with the software backend, without an EditorWindow.
#include "../support/DarkCanvasTheme.h"
#include "canvas/CanvasViewport.h"
#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/GridIndex.h"
#include "canvas/LineageItem.h"
#include "canvas/MiniMapItem.h"
#include "canvas/NodeItem.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include "ui/QuickCanvas.h"
#include "ui/QtNodesCanvas.h"
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QGraphicsScene>
#include <QHelpEvent>
#include <QGraphicsView>
#include <QScrollBar>
#include <QPainter>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QToolTip>
#include <QtTest>
#include <limits>
#include <memory>

using namespace nodetool;
using namespace nodetool::canvas;
using namespace QtNodes;

namespace {

QJsonObject node(const QString &id, const QString &type, double x, double y, const QJsonObject &extra = {}) {
  QJsonObject result{{"id", id},
                     {"type", type},
                     {"data", QJsonObject{}},
                     {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", y}}}}}};
  for (auto it = extra.begin(); it != extra.end(); ++it) { result.insert(it.key(), it.value()); }
  return result;
}

QJsonObject edge(const QString &id, const QString &source, const QString &target) {
  return {{"id", id}, {"source", source}, {"target", target}, {"sourceHandle", "out"}, {"targetHandle", "in"}};
}

QJsonArray catalog() {
  const QJsonObject portType{{"type", "str"}};
  return {
      QJsonObject{{"node_type", "fixture.Source"}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", portType}}}}},
      QJsonObject{{"node_type", "fixture.Target"},
                  {"input_fields", QJsonArray{"in"}},
                  {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", portType}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", portType}}}}},
  };
}

QJsonObject snapshot(const QJsonArray &nodes, const QJsonArray &edges = {}) {
  return {{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
}

const QString kSource = QStringLiteral("fixture.Source");
const QString kTarget = QStringLiteral("fixture.Target");
const QString kGroup = QStringLiteral("nodetool.workflows.base_node.Group");

// UI thread only. Members are declared so that the canvas goes before the
// model, and both before the window.
class Fixture {
public:
  explicit Fixture(const QJsonObject &graph, QSize size = {800, 600}) {
    model.project(graph, catalog());
    model.commit = [this](const QJsonObject &command) {
      commands.append(command);
      return true;
    };
    model.validateConnection = [](const QJsonObject &) { return true; };
    window.resize(size);
    canvas = std::make_unique<GraphCanvas>(model);
    canvas->setParentItem(window.contentItem());
    canvas->setSize(QSizeF(size));
    canvas->setTheme(test::darkCanvasTheme());
    canvas->setView(1, QPointF(size.width() / 2.0, size.height() / 2.0));
    window.show();
    if (!QTest::qWaitForWindowExposed(&window)) { qWarning("window not exposed"); }
    canvas->forceActiveFocus();
  }
  ~Fixture() { canvas.reset(); }

  NodeId id(const QString &resource) const {
    for (const auto node : model.allNodeIds()) {
      if (model.resourceId(node) == resource) { return node; }
    }
    return InvalidNodeId;
  }
  NodeItem *item(const QString &resource) const { return canvas->scene().nodeItem(id(resource)); }
  QPointF port(const QString &resource, PortType side) const {
    const auto node = id(resource);
    return canvas->scene().nodeItem(node)->scenePosition() + canvas->scene().nodeGeometry().portPosition(node, side, 0);
  }
  QPoint view(QPointF scenePoint) const { return canvas->viewport().mapFromScene(scenePoint); }
  void press(QPointF scenePoint, Qt::KeyboardModifiers modifiers = {}) {
    QTest::mousePress(&window, Qt::LeftButton, modifiers, view(scenePoint));
  }
  void move(QPointF scenePoint) { QTest::mouseMove(&window, view(scenePoint)); }
  void release(QPointF scenePoint, Qt::KeyboardModifiers modifiers = {}) {
    QTest::mouseRelease(&window, Qt::LeftButton, modifiers, view(scenePoint));
  }
  // Moves in steps, as a pointer does, so that every gesture threshold is passed.
  void drag(QPointF from, QPointF to, int steps = 8) {
    for (int i = 1; i <= steps; ++i) { move(from + (to - from) * i / steps); }
  }

  QQuickWindow window;
  WorkflowGraphModel model;
  std::unique_ptr<GraphCanvas> canvas;
  QList<QJsonObject> commands;
};

QJsonObject sized(QJsonObject card, double width, double height) {
  auto ui = card["ui_properties"].toObject();
  ui["width"] = width;
  ui["height"] = height;
  card["ui_properties"] = ui;
  return card;
}

QJsonObject stacked() {
  return snapshot({sized(node("group", kGroup, -100, 300), 900, 250), node("source", kSource, 0, 0),
                   node("target", kTarget, 500, 0), node("upper", kTarget, 60, 40)},
                  {edge("e", "source", "target")});
}

QJsonObject framed() {
  return snapshot({sized(node("group", kGroup, 100, 250), 400, 300), node("inner", kSource, 40, 60, {{"parent_id", "group"}}),
                   node("outside", kTarget, 600, 300)});
}

QJsonObject pair(const QJsonArray &edges = {}) {
  return snapshot({node("source", kSource, 0, 0), node("target", kTarget, 500, 0), node("target2", kTarget, 500, 300)},
                  edges);
}

} // namespace

// UI thread only.
class QuickCanvasTest final : public QObject {
  Q_OBJECT

private slots:
  void gridIndexQueries() {
    GridIndex index;
    index.insert(1, QRectF(0, 0, 100, 100));
    index.insert(2, QRectF(2000, 2000, 50, 50));
    index.insert(3, QRectF(-1e6, -1e6, 2e6, 2e6));
    QCOMPARE(index.query(QPointF(50, 50)).size(), 2);
    QVERIFY(index.query(QPointF(2010, 2010)).contains(2));
    QVERIFY(!index.query(QPointF(2010, 2010)).contains(1));
    index.insert(1, QRectF(2000, 2000, 10, 10));
    QVERIFY(!index.query(QPointF(50, 50)).contains(1));
    QVERIFY(index.query(QRectF(1990, 1990, 30, 30)).contains(1));
    index.remove(3);
    QVERIFY(index.query(QPointF(50, 50)).isEmpty());
    QCOMPARE(index.size(), 2);
    QVERIFY(index.query(QRectF(2008, 2005, -2, 0)).isEmpty());
    QVERIFY(index.query(QRectF(2005, 2008, 0, -2)).isEmpty());
    QVERIFY(index.query(QRectF(std::numeric_limits<double>::quiet_NaN(), 0, 0, 10)).isEmpty());
  }

  // CanvasViewport reproduces QGraphicsView's mapping, so both canvases put a
  // scene point on the same pixel.
  void viewportMatchesGraphicsView() {
    QGraphicsScene scene;
    QGraphicsView view(&scene);
    view.setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    view.setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    view.setFrameShape(QFrame::NoFrame);
    view.setSceneRect(-32767, -32767, 65534, 65534);
    view.resize(731, 517);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    CanvasViewport viewport;
    viewport.resize(view.viewport()->size(), true);
    for (const auto zoom : {1.0, 0.37, 2.5, 0.12}) {
      for (const auto center : {QPointF(0, 0), QPointF(123.4, -567.8), QPointF(5000.25, 300.5)}) {
        view.setTransformationAnchor(QGraphicsView::AnchorViewCenter);
        view.setTransform(QTransform::fromScale(zoom, zoom));
        view.centerOn(center);
        viewport.setZoom(zoom);
        viewport.centerOn(center);
        const QPointF probe(center.x() + 37.3, center.y() - 12.9);
        QCOMPARE(viewport.scroll(), QPoint(view.horizontalScrollBar()->value(), view.verticalScrollBar()->value()));
        QCOMPARE(viewport.mapFromScene(probe), view.mapFromScene(probe));
        QCOMPARE(viewport.mapToScene(QPoint(10, 20)), view.mapToScene(QPoint(10, 20)));
        QCOMPARE(viewport.mapFromScene(QRectF(probe, QSizeF(80, 40))), view.mapFromScene(QRectF(probe, QSizeF(80, 40))).boundingRect());
        QCOMPARE(viewport.visibleSceneRect(), view.mapToScene(view.viewport()->rect()).boundingRect());
        view.ensureVisible(QRectF(center + QPointF(900, 700), QSizeF(50, 50)), 16, 16);
        viewport.ensureVisible(QRectF(center + QPointF(900, 700), QSizeF(50, 50)), 16, 16);
        QCOMPARE(viewport.mapToScene(QPoint(0, 0)), view.mapToScene(QPoint(0, 0)));
      }
    }
  }

  // BasicGraphicsScene's slots: a reset builds every item, an incremental
  // projection adds and removes items, and position and size updates move
  // the item, its wires and its grid index entry.
  void itemsFollowModelSignals() {
    Fixture f(pair());
    auto &scene = f.canvas->scene();
    QCOMPARE(scene.nodeItems().size(), 3);
    QVERIFY(scene.connectionItems().isEmpty());

    QSignalSpy created(&f.model, &AbstractGraphModel::connectionCreated);
    f.model.project(pair({edge("e", "source", "target")}), catalog());
    QCOMPARE(created.size(), 1);
    QCOMPARE(scene.connectionItems().size(), 1);
    auto *wire = scene.connectionItems().first();
    QCOMPARE(wire->endPoint(PortType::Out), f.port("source", PortType::Out));
    QCOMPARE(wire->endPoint(PortType::In), f.port("target", PortType::In));

    QSignalSpy moved(&f.model, &AbstractGraphModel::nodePositionUpdated);
    QVERIFY(f.model.setNodeData(f.id("target"), NodeRole::Position, QPointF(600, 120)));
    QCOMPARE(moved.size(), 1);
    QCOMPARE(f.item("target")->scenePosition(), QPointF(600, 120));
    QCOMPARE(wire->endPoint(PortType::In), f.port("target", PortType::In));
    QCOMPARE(scene.nodeAt(QPointF(610, 140)), f.item("target"));
    QVERIFY(scene.nodeAt(QPointF(510, 20)) != f.item("target"));

    QSignalSpy updated(&f.model, &AbstractGraphModel::nodeUpdated);
    QVERIFY(f.model.setNodeData(f.id("target"), NodeRole::Size, QSize(420, 260)));
    QVERIFY(updated.size() >= 1);
    QCOMPARE(f.item("target")->size(), QSizeF(420, 260));
    QVERIFY(f.item("target")->sceneBoundingRect().contains(QPointF(1000, 370)));
    QCOMPARE(scene.nodeAt(QPointF(1000, 370)), f.item("target"));

    QSignalSpy removedEdge(&f.model, &AbstractGraphModel::connectionDeleted);
    QSignalSpy removedNode(&f.model, &AbstractGraphModel::nodeDeleted);
    f.model.project(snapshot({node("source", kSource, 0, 0), node("target", kTarget, 600, 120)}), catalog());
    QCOMPARE(removedEdge.size(), 1);
    QCOMPARE(removedNode.size(), 1);
    QVERIFY(scene.connectionItems().isEmpty());
    QCOMPARE(scene.nodeItems().size(), 2);
    QVERIFY(!scene.nodeItem(f.id("target2")));

    QSignalSpy reset(&f.model, &AbstractGraphModel::modelReset);
    f.model.resetOnNextProjection();
    f.model.project(pair({edge("e", "source", "target")}), catalog());
    QCOMPARE(reset.size(), 1);
    QCOMPARE(scene.nodeItems().size(), 3);
    QCOMPARE(scene.connectionItems().size(), 1);
  }

  // Cards sit above wires, wires above groups, a hovered card above the card
  // it overlaps, and the draft above everything.
  void hitTestsAndZOrder() {
    Fixture f(stacked());
    auto &scene = f.canvas->scene();
    // The document lists "upper" after "source", so it stacks above it.
    const QPointF overlap = f.item("upper")->scenePosition() + QPointF(20, 20);
    QVERIFY(f.item("source")->sceneBoundingRect().contains(overlap));
    QCOMPARE(scene.nodeAt(overlap), f.item("upper"));
    // A wire between the cards is hit on its stroke, and a card covers a wire.
    auto *wire = scene.connectionItems().first();
    const auto middle = (wire->endPoint(PortType::Out) + wire->endPoint(PortType::In)) / 2;
    QVERIFY(!scene.itemsAt(middle).isEmpty());
    QCOMPARE(scene.itemsAt(middle).first(), static_cast<CanvasItem *>(wire));
    // The group's frame is under everything else.
    const QPointF inGroup(700, 500);
    QCOMPARE(scene.itemsAt(inGroup).first(), static_cast<CanvasItem *>(f.item("group")));
    QVERIFY(f.item("group")->z() < wire->z());
    QVERIFY(wire->z() < f.item("source")->z());
    // QtNodes raises a hovered card above the cards it overlaps.
    f.move(f.item("source")->scenePosition() + QPointF(5, 20));
    QTRY_VERIFY(f.item("source")->nodeState().hovered());
    QVERIFY(f.item("source")->z() > f.item("upper")->z());
    QCOMPARE(scene.nodeAt(overlap), f.item("source"));
    f.move(QPointF(300, 250));
    QTRY_VERIFY(!f.item("source")->nodeState().hovered());
    QCOMPARE(scene.nodeAt(overlap), f.item("upper"));
    // A wire dragged from a port draws above every card.
    const auto from = f.port("target", PortType::Out);
    f.press(from);
    f.drag(from, from + QPointF(80, 30));
    QVERIFY(scene.draftConnection());
    QVERIFY(scene.draftConnection()->z() > f.item("source")->z());
    QCOMPARE(scene.mouseGrabber(), static_cast<CanvasItem *>(scene.draftConnection()));
    f.release(from + QPointF(80, 30));
  }

  // A drag from an output to an input adds the edge, a drop on the pane asks
  // for the picker, and a drag from a connected input reconnects or discards.
  void draftConnectionAndReconnect() {
    Fixture f(pair());
    auto &scene = f.canvas->scene();
    auto &interaction = scene.interaction();
    const auto from = f.port("source", PortType::Out), to = f.port("target", PortType::In);
    f.press(from);
    f.drag(from, to);
    QVERIFY(scene.draftConnection());
    QCOMPARE(scene.draftConnection()->endPoint(PortType::In), to);
    QCOMPARE(scene.draftConnection()->endPoint(PortType::Out), from);
    QCOMPARE(scene.draftEnd().node, f.id("source"));
    QCOMPARE(scene.handleConnectable(f.id("target"), PortType::In, 0), 1);
    f.release(to);
    QVERIFY(!scene.draftConnection());
    QCOMPARE(f.commands.size(), 1);
    QCOMPARE(f.commands.first()["op"].toString(), QString("addEdge"));
    QCOMPARE(f.commands.first()["edge"].toObject()["target"].toString(), QString("target"));

    QSignalSpy loose(&interaction, &CanvasInteraction::looseWireDropped);
    f.press(from);
    f.drag(from, QPointF(300, 450));
    f.release(QPointF(300, 450));
    QCOMPARE(loose.size(), 1);
    QVERIFY(!scene.draftConnection());
    QCOMPARE(f.commands.size(), 1);

    f.model.project(pair({edge("e", "source", "target")}), catalog());
    auto *wire = scene.connectionItems().first();
    QSignalSpy discarded(&interaction, &CanvasInteraction::reconnectDiscarded);
    QSignalSpy reconnected(&interaction, &CanvasInteraction::reconnectRequested);
    f.press(to);
    QVERIFY(scene.draftConnection());
    QVERIFY(!wire->shown());
    QCOMPARE(scene.reconnectingEdgeId(), QString("e"));
    f.drag(to, QPointF(300, 450));
    f.release(QPointF(300, 450));
    QCOMPARE(discarded.size(), 1);
    QCOMPARE(discarded.first().first().toString(), QString("e"));
    QVERIFY(wire->shown());
    QVERIFY(!scene.draftConnection());

    const auto other = f.port("target2", PortType::In);
    f.press(to);
    f.drag(to, other);
    f.release(other);
    QCOMPARE(reconnected.size(), 1);
    QCOMPARE(reconnected.first().at(1).toJsonObject()["target"].toString(), QString("target2"));
    QVERIFY(!scene.draftConnection());
  }

  // useSelectionEvents.ts: a box selects the cards it touches and a group only
  // when it encloses the group's frame.
  void rubberBandWithEnclosedGroups() {
    Fixture f(framed());
    QSignalSpy band(f.canvas.get(), &GraphCanvas::rubberBandChanged);
    const QPointF start(60, 200);
    QVERIFY(f.canvas->scene().itemsAt(start).isEmpty());
    // Touches the inner card and cuts the group frame.
    f.press(start);
    f.drag(start, QPointF(220, 400));
    QVERIFY(f.canvas->rubberBandActive());
    QCOMPARE(band.size(), 1);
    QVERIFY(f.item("inner")->isSelected());
    QVERIFY(!f.item("group")->isSelected());
    QVERIFY(!f.item("outside")->isSelected());
    // Encloses the whole frame.
    f.drag(QPointF(220, 400), QPointF(540, 600));
    QVERIFY(f.item("group")->isSelected());
    QVERIFY(f.item("inner")->isSelected());
    f.release(QPointF(540, 600));
    QVERIFY(!f.canvas->rubberBandActive());
    QCOMPARE(band.size(), 2);
    QVERIFY(f.item("group")->isSelected());
    // A click on the pane clears the selection.
    f.press(start);
    f.release(start);
    QCOMPARE(f.canvas->selection().count(), 0);
  }

  // Cards near the view hold a texture; cards far away hold none and are not
  // visible. A pan paints the cards it reaches and releases the ones it leaves.
  void cullingKeepsTexturesNearTheView() {
    QJsonArray nodes;
    for (int i = 0; i < 40; ++i) { nodes.append(node(QString("n%1").arg(i), kTarget, i * 1000, 0)); }
    nodes.append(node("far", kTarget, 20000, 20000));
    Fixture f(snapshot(nodes, {edge("long", "n0", "far")}), {800, 600});
    LineageItem lineage(f.canvas->scene(), "offscreen");
    QPainterPath path(QPointF(20000, 300));
    path.lineTo(20100, 350);
    lineage.updateGeometry(path, "Reference", {}, false);
    f.canvas->setView(.12, QPointF(3200, 2400));
    f.canvas->flushRaster();
    const auto *wire = f.canvas->scene().connectionItems().first();
    QVERIFY(wire->hasImage());
    QVERIFY2(wire->image().sizeInBytes() < 8 * 1024 * 1024, qPrintable(QString::number(wire->image().sizeInBytes())));
    QVERIFY(!lineage.hasImage());
    qInfo() << "Long wire bytes" << wire->image().sizeInBytes();
    QVERIFY(f.canvas->cachedRasterBytes() <= GraphCanvas::rasterCacheBudget);
    f.canvas->resetRasterStats();
    f.canvas->setView(1, QPointF(400, 300));
    f.canvas->flushRaster();
    QVERIFY(f.item("n0")->hasImage());
    QVERIFY(f.item("n0")->isVisible());
    QVERIFY(!f.item("n20")->hasImage());
    QVERIFY(!f.item("n20")->isVisible());
    const auto before = f.canvas->rasterStats().cards;
    QVERIFY(before >= 1);
    QVERIFY(before < 10);
    f.canvas->centerOn(QPointF(20150, 300));
    f.canvas->flushRaster();
    QVERIFY(f.item("n20")->hasImage());
    QVERIFY(f.item("n20")->isVisible());
    QVERIFY(lineage.hasImage());
    QVERIFY(!f.item("n0")->hasImage());
    QVERIFY(!f.item("n0")->isVisible());
    // A pan inside the prefetched margin paints nothing new.
    const auto painted = f.canvas->rasterStats().cards;
    f.canvas->setScroll(f.canvas->viewport().scroll().x() + 40, f.canvas->viewport().scroll().y());
    f.canvas->flushRaster();
    QCOMPARE(f.canvas->rasterStats().cards, painted);
    // A rendered frame paints the same set without a flush.
    f.canvas->centerOn(QPointF(30150, 300));
    QTRY_VERIFY(f.item("n30")->hasImage());
    QTRY_VERIFY(!f.item("n20")->hasImage());
    QTRY_VERIFY(!lineage.hasImage());
  }

  void retainedDecorationHandles_data() {
    QTest::addColumn<QString>("order");
    QTest::newRow("handles-first") << QString("handles");
    QTest::newRow("card-first") << QString("card");
    QTest::newRow("canvas-first") << QString("canvas");
  }

  void retainedDecorationHandles() {
    QFETCH(QString, order);
    QWidget host;
    WorkflowGraphModel model;
    model.project(pair(), catalog());
    auto surface = std::make_unique<QuickCanvas>(model, host);
    auto layer = std::make_unique<node_editor::LineageLayer>(surface->canvasScene());
    auto graph = pair()["graph"].toObject();
    graph["links"] = QJsonArray{QJsonObject{
        {"id", "ref"}, {"source", "source"}, {"target", "target"}, {"label", "Reference"}}};
    QVERIFY(layer->update(graph, model, *surface).isEmpty());
    QVERIFY(layer->linkItem("ref"));
    auto note = surface->addNote(surface->canvasScene().nodeAt(QPointF(80, 20))->nodeId(), "Title", "note", {}, {});
    QVERIFY(note);
    if (order == "card") {
      model.project(snapshot({node("target", kTarget, 500, 0)}), catalog());
      note->updateCardGeometry({200, 100});
    } else if (order == "canvas") {
      surface.reset();
      layer->setSelectedLinkIds({"ref"});
      note->setVisible(false);
    }
    note.reset();
    layer.reset();
    surface.reset();
  }

  void interruptedGesture_data() {
    QTest::addColumn<bool>("reconnect");
    QTest::addColumn<bool>("hide");
    QTest::newRow("ungrab-card") << false << false;
    QTest::newRow("ungrab-reconnect") << true << false;
    QTest::newRow("hide-card") << false << true;
    QTest::newRow("hide-band") << true << true;
  }

  void interruptedGesture() {
    QFETCH(bool, reconnect);
    QFETCH(bool, hide);
    Fixture f(pair({edge("e", "source", "target")}));
    auto &scene = f.canvas->scene();
    const auto initial = f.item("source")->scenePosition();
    const auto start = hide && reconnect ? QPointF(320, 260)
                       : reconnect ? f.port("target", PortType::In) : initial + QPointF(80, 20);
    const auto end = start + QPointF(70, 90);
    f.press(start);
    f.drag(start, end);
    if (!reconnect) {
      QVERIFY(scene.nodeDragActive());
      QVERIFY(f.item("source")->scenePosition() != initial);
    } else if (hide) {
      QVERIFY(f.canvas->rubberBandActive());
    } else {
      QVERIFY(scene.draftConnection());
      QVERIFY(!scene.connectionItems().first()->shown());
    }

    if (hide) {
      f.canvas->setViewShown(false);
      f.canvas->setViewShown(true);
    } else {
      f.canvas->ungrabMouse();
    }
    QVERIFY(!scene.mouseGrabber());
    QVERIFY(!scene.nodeDragActive());
    QVERIFY(!scene.draftConnection());
    QVERIFY(!f.canvas->rubberBandActive());
    QCOMPARE(f.item("source")->scenePosition(), initial);
    QVERIFY(scene.connectionItems().first()->shown());

    f.release(end);
    f.press(start);
    if (hide && reconnect) {
      f.drag(start, end);
      QVERIFY(f.canvas->rubberBandActive());
    } else {
      QVERIFY(scene.mouseGrabber());
    }
    f.release(start);
  }

  void stackedLineageToolTip() {
    QWidget host;
    host.resize(800, 600);
    WorkflowGraphModel model;
    model.project(pair({edge("e", "source", "target")}), catalog());
    QuickCanvas surface(model, host);
    surface.hostWidget().resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    surface.setView(1, QPointF(400, 300));
    auto *wire = surface.canvasScene().connectionItems().first();
    const auto out = wire->endPoint(PortType::Out);
    const auto in = wire->endPoint(PortType::In);
    const auto [c1, c2] = wire->pointsC1C2();
    QPainterPath path(out);
    path.cubicTo(c1, c2, in);
    LineageItem lineage(surface.canvasScene(), "ref");
    lineage.updateGeometry(path, "Reference under a wire", {}, false);
    const auto point = path.pointAtPercent(.5);
    QCOMPARE(surface.canvasScene().itemsAt(point).first()->kind(), CanvasItem::Kind::Connection);
    auto &viewport = surface.viewportWidget();
    const auto pixel = surface.mapFromScene(point);
    QHelpEvent event(QEvent::ToolTip, pixel, viewport.mapToGlobal(pixel));
    QApplication::sendEvent(&viewport, &event);
    QCOMPARE(QToolTip::text(), QString("Reference under a wire"));
    QToolTip::hideText();
  }

  void reattachRestoresRasters() {
    QWidget host;
    host.resize(800, 600);
    WorkflowGraphModel model;
    model.project(pair({edge("e", "source", "target")}), catalog());
    QuickCanvas surface(model, host);
    surface.hostWidget().resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    surface.setView(1, QPointF(400, 300));
    auto &graph = surface.graphCanvas();
    auto *card = graph.scene().nodeAt(QPointF(80, 20));
    auto note = surface.addNote(card->nodeId(), "2 Title", "note", {}, {});
    auto *chip = static_cast<CanvasItem *>(card->childItems().first());
    LineageItem lineage(graph.scene(), "ref");
    QPainterPath path(QPointF(320, 240));
    path.lineTo(500, 280);
    lineage.updateGeometry(path, "Reference", {}, false);
    graph.flushRaster();
    surface.quickWidget().grabFramebuffer();
    QVERIFY(card->hasImage());
    QVERIFY(chip->hasImage());
    QVERIFY(lineage.hasImage());

    auto *parent = graph.parentItem();
    graph.setParentItem(nullptr);
    QVERIFY(!card->hasImage());
    graph.setParentItem(parent);
    QTRY_VERIFY(card->hasImage());
    QTRY_VERIFY(chip->hasImage());
    QTRY_VERIFY(lineage.hasImage());
  }

  void noteChipAtFitZoom() {
    QWidget host;
    host.resize(640, 400);
    WorkflowGraphModel quickModel, legacyModel;
    EditorScene legacyScene(legacyModel);
    for (auto *model : {&quickModel, &legacyModel}) { model->project(pair(), catalog()); }
    QuickCanvas quick(quickModel, host);
    quick.hostWidget().resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    QWidget legacyHost;
    auto &view = QtNodesCanvas::createView(legacyScene, legacyHost);
    view.resize(host.size());
    legacyHost.resize(host.size());
    QtNodesCanvas legacy(legacyScene, view);
    legacyHost.show();
    QVERIFY(QTest::qWaitForWindowExposed(&legacyHost));
    const auto theme = test::darkCanvasTheme();
    quick.scene().setTheme(theme);
    legacy.scene().setTheme(theme);
    const QPointF center(400, 200);
    const auto id = quick.canvasScene().nodeAt(QPointF(80, 20))->nodeId();
    const auto legacyId = legacy.nodeAt(legacy.mapFromScene(QPointF(80, 20)));
    const auto quickNote = quick.addNote(id, "2 Title", "note", {}, {});
    const auto legacyNote = legacy.addNote(legacyId, "2 Title", "note", {}, {});
    QVERIFY(quickNote);
    QVERIFY(legacyNote);
    quick.setView(.53, center);
    legacy.setView(.53, center);
    quick.graphCanvas().flushRaster();
    const auto quickFrame = quick.quickWidget().grabFramebuffer();
    const auto legacyFrame = view.viewport()->grab().toImage();
    const auto ink = [&](const CanvasSurface &canvas, const QImage &frame, NodeId card) {
      const QPointF textOrigin = canvas.nodeRect(card).bottomLeft() + QPointF(20, 18);
      return frame.copy(QRect(canvas.mapFromScene(textOrigin) - QPoint(1, 1), QSize(27, 9)));
    };
    const auto reference = ink(legacy, legacyFrame, legacyId);
    const auto rendered = ink(quick, quickFrame, id);
    // Compare the distribution of glyph ink, allowing a pixel of offset from
    // the view mapping and different subpixel coverage from the raster bucket.
    const auto background = qGray(theme.canvas.rgb());
    double best = 1;
    for (int dy = -1; dy <= 1; ++dy) {
      for (int dx = -1; dx <= 1; ++dx) {
        double difference = 0;
        double total = 0;
        for (int y = 1; y < reference.height() - 1; ++y) {
          for (int x = 1; x < reference.width() - 1; ++x) {
            const auto a = std::max(0, qGray(reference.pixel(x, y)) - background);
            const auto b = std::max(0, qGray(rendered.pixel(x + dx, y + dy)) - background);
            difference += std::abs(a - b);
            total += std::max(a, b);
          }
        }
        if (total > 0) { best = std::min(best, difference / total); }
      }
    }
    qInfo() << "Normalized glyph error" << best;
    QVERIFY2(best < .28, qPrintable(QString("Normalized glyph error: %1").arg(best)));
  }

  // Destroying the canvas, or resetting the model, while a card or a wire is
  // dragged leaves no dangling grab, hover or draft (run under ASan).
  void teardownDuringDrag() {
    {
      Fixture f(pair({edge("e", "source", "target")}));
      const auto card = f.item("source")->scenePosition() + QPointF(80, 20);
      f.press(card);
      f.drag(card, card + QPointF(60, 40));
      QVERIFY(f.canvas->scene().nodeDragActive());
      f.canvas.reset();
      QTest::mouseRelease(&f.window, Qt::LeftButton, {}, QPoint(200, 200));
    }
    {
      Fixture f(pair());
      const auto from = f.port("source", PortType::Out);
      f.press(from);
      f.drag(from, from + QPointF(100, 50));
      QVERIFY(f.canvas->scene().draftConnection());
      f.model.resetOnNextProjection();
      f.model.project(pair(), catalog());
      QVERIFY(!f.canvas->scene().draftConnection());
      f.move(from + QPointF(120, 60));
      f.release(from + QPointF(120, 60));
      QVERIFY(!f.canvas->scene().mouseGrabber());
      f.canvas.reset();
    }
    {
      Fixture f(pair());
      const auto card = f.item("target")->scenePosition() + QPointF(80, 20);
      f.press(card);
      f.drag(card, card + QPointF(40, 0));
      // The model drops the grabbed card in the middle of the drag.
      f.model.project(snapshot({node("source", kSource, 0, 0)}), catalog());
      QVERIFY(!f.canvas->scene().mouseGrabber());
      f.drag(card + QPointF(40, 0), card + QPointF(80, 0));
      f.release(card + QPointF(80, 0));
    }
  }

  // QuickCanvas maps through the GraphCanvas, and the mini-map item collects
  // the cards through the CanvasSurface.
  void surfaceAndMiniMap() {
    QWidget host;
    host.resize(900, 700);
    WorkflowGraphModel model;
    model.project(pair({edge("e", "source", "target")}), catalog());
    QuickCanvas surface(model, host);
    surface.hostWidget().resize(900, 700);
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    surface.setView(1, QPointF(450, 300));
    NodeId target = InvalidNodeId;
    for (const auto id : model.allNodeIds()) {
      if (model.resourceId(id) == "target") { target = id; }
    }
    QCOMPARE(surface.nodeOrigin(target), QPointF(500, 0));
    QVERIFY2(surface.visibleSceneRect().contains(QPointF(520, 30)), qPrintable(QString("%1 %2 %3 %4").arg(surface.visibleSceneRect().x()).arg(surface.visibleSceneRect().y()).arg(surface.visibleSceneRect().width()).arg(surface.visibleSceneRect().height())));
    QCOMPARE(surface.nodeAt(surface.mapFromScene(QPointF(520, 30))), target);
    QVERIFY(surface.edgeBounds(*model.allConnectionIds(target).begin()).width() > 0);
    canvas::MiniMapItem map(model, surface.scene(), surface);
    QTRY_COMPARE(map.nodeCount(), qsizetype(3));
    QImage image(200, 150, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    map.paint(&painter);
    painter.end();
    QVERIFY(image.pixelColor(100, 75).alpha() > 0);
  }
};

QTEST_MAIN(QuickCanvasTest)
#include "QuickCanvasTest.moc"
