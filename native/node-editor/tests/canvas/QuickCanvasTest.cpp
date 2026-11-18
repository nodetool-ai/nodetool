// The Quick canvas (docs/plans/node-editor-quick-canvas/plan.md, Q3): its
// items, hit tests, gestures and culling, on a GraphCanvas in a QQuickWindow
// with the software backend, without an EditorWindow.
#include "../support/DarkCanvasTheme.h"
#include "canvas/CanvasViewport.h"
#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/GridIndex.h"
#include "canvas/MiniMapItem.h"
#include "canvas/NodeItem.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include "ui/QuickCanvas.h"
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QGraphicsScene>
#include <QGraphicsView>
#include <QScrollBar>
#include <QPainter>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QtTest>
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
    Fixture f(snapshot(nodes), {800, 600});
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
