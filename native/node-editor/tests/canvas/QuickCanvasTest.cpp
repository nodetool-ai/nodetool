// The Quick canvas (docs/plans/node-editor-quick-canvas/plan.md, Q3): its
// items, hit tests, gestures and culling, on a GraphCanvas in a QQuickWindow
// with the software backend, without an EditorWindow.
#include "../support/DarkCanvasTheme.h"
#include "../../../graph-runner/unittests/sanitizer_build.h"
#include "canvas/CanvasViewport.h"
#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/GridIndex.h"
#include "canvas/LineageItem.h"
#include "canvas/MiniMapItem.h"
#include "canvas/NodeItem.h"
#include "graph/EditorScene.h"
#include "graph/LineageLayer.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include "ui/QuickCanvas.h"
#include "ui/QtNodesCanvas.h"
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/AbstractNodePainter.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QGraphicsScene>
#include <QHelpEvent>
#include <QGraphicsView>
#include <QScrollBar>
#include <QScopeGuard>
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

double glyphError(const QImage &reference, const QImage &rendered, int background) {
  double best = 1;
  for (int dy = -1; dy <= 1; ++dy) {
    for (int dx = -1; dx <= 1; ++dx) {
      double difference = 0, total = 0;
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
  return best;
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
    QVERIFY2(wire->rasterBytes() < 8 * 1024 * 1024, qPrintable(QString::number(wire->rasterBytes())));
    QVERIFY(!lineage.hasImage());
    qInfo() << "Long wire bytes" << wire->rasterBytes();
    QVERIFY(f.canvas->offscreenRasterBytes() <= GraphCanvas::rasterCacheBudget);
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

  void nativeResolutionForWideForegroundAndLongWire() {
    // Keep the wire endpoints offscreen and place foreground labels near
    // opposite viewport edges, as on a wide canvas at normal zoom.
    const auto graph = snapshot({
        sized(node("left", kGroup, 90, 140), 240, 140),
        sized(node("right", kGroup, 1610, 940), 240, 140),
        node("source", kSource, -850, 220),
        node("target", kTarget, 2380, 715),
    }, {edge("long", "source", "target")});
    Fixture quick(graph, {1920, 1080});
    WorkflowGraphModel model;
    EditorScene legacyScene(model);
    model.project(graph, catalog());
    QWidget host;
    auto &view = QtNodesCanvas::createView(legacyScene, host);
    host.resize(quick.window.size());
    view.resize(host.size());
    QtNodesCanvas legacy(legacyScene, view);
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    auto theme = test::darkCanvasTheme();
    theme.grid = theme.canvas;
    quick.canvas->setTheme(theme);
    legacy.scene().setTheme(theme);
    legacy.setView(1, QPointF(960, 540));
    for (const auto &id : {QString("left"), QString("right")}) {
      quick.canvas->selection().setNode(quick.id(id), true);
      for (const auto nodeId : model.allNodeIds()) {
        if (model.resourceId(nodeId) == id) { legacy.selection().setNode(nodeId, true); }
      }
    }
    quick.canvas->flushRaster();
    const auto quickFrame = quick.window.grabWindow();
    const auto legacyFrame = view.viewport()->grab().toImage();
    QVERIFY(!quickFrame.isNull());
    const auto inkError = [&](QPointF origin, QSize extent) {
      const auto dpr = quick.window.effectiveDevicePixelRatio();
      const auto size = (QSizeF(extent) * dpr).toSize();
      const auto reference = legacyFrame.copy(QRect((QPointF(legacy.mapFromScene(origin)) * dpr).toPoint(), size));
      const auto rendered = quickFrame.copy(QRect((QPointF(quick.view(origin)) * dpr).toPoint(), size));
      return glyphError(reference, rendered, qGray(theme.canvas.rgb()));
    };
    const auto left = inkError({90, 108}, {120, 26});
    const auto right = inkError({1610, 908}, {120, 26});
    const auto *wire = quick.canvas->scene().connectionItems().first();
    const QPointF from = wire->endPoint(PortType::Out);
    const auto [c1, c2] = wire->pointsC1C2();
    QPainterPath path(from);
    path.cubicTo(c1, c2, wire->endPoint(PortType::In));
    const auto stroke = inkError(path.pointAtPercent(.5) - QPointF(80, 35), {160, 70});
    qInfo() << "Foreground errors" << left << right << "wire error" << stroke;
    QVERIFY(left < .02);
    QVERIFY(right < .02);
    QVERIFY(stroke < .02);
  }

  void largeRastersShareSettleBudget() {
    const auto graph = snapshot({
        sized(node("left", kGroup, 8, 22), 600, 400),
        sized(node("right", kGroup, 612, 311), 240, 140),
        node("source", kSource, -450, -180),
        node("target", kTarget, 940, 620),
    }, {edge("long", "source", "target")});
    Fixture f(graph, {1920, 1080});
    auto theme = test::darkCanvasTheme();
    theme.grid = theme.canvas;
    f.canvas->setTheme(theme);
    f.canvas->selection().setNode(f.id("left"), true);
    f.canvas->selection().setNode(f.id("right"), true);
    f.canvas->resetRasterStats();
    f.canvas->setView(3, QPointF(320, 180));
    QTRY_VERIFY(!f.canvas->zoomSettling() && !f.canvas->rasterPending());
    const auto stats = f.canvas->rasterStats();
    const auto bytes = stats.peakBytes;
    qInfo() << "Large raster DPR" << f.window.effectiveDevicePixelRatio()
            << "slowest polish (ms)" << stats.slowestPass / 1e6 << "cache bytes" << bytes
            << "card/wire/foreground jobs" << stats.cards << stats.wires << stats.foreground;
    QVERIFY(stats.cards > 0 && stats.wires > 0 && stats.foreground > 0);
    QVERIFY(stats.slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale);
    QVERIFY(f.canvas->offscreenRasterBytes() <= GraphCanvas::rasterCacheBudget);
    const auto *largeCard = f.item("left");
    const auto *wire = f.canvas->scene().connectionItems().first();
    QVERIFY(largeCard->tiles().size() > 1);
    QVERIFY(wire->tiles().size() > 1);
    const auto dpr = f.window.effectiveDevicePixelRatio();
    for (const auto *item : {static_cast<const CanvasItem *>(largeCard), static_cast<const CanvasItem *>(wire)}) {
      for (const auto &tile : item->tiles()) {
        QVERIFY(tile.geometry.device.width() <= CanvasImageItem::tileSide);
        QVERIFY(tile.geometry.device.height() <= CanvasImageItem::tileSide);
        QCOMPARE(tile.geometry.scale, 3 * dpr);
      }
    }

    WorkflowGraphModel model;
    EditorScene scene(model);
    model.project(graph, catalog());
    QWidget host;
    auto &view = QtNodesCanvas::createView(scene, host);
    host.resize(f.window.size());
    view.resize(host.size());
    QtNodesCanvas legacy(scene, view);
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    scene.setTheme(theme);
    legacy.setView(3, QPointF(320, 180));
    for (const auto id : model.groupIds()) { legacy.selection().setNode(id, true); }
    const auto reference = view.viewport()->grab().toImage();
    const auto rendered = f.window.grabWindow();
    const auto compare = [&](QPointF scenePoint, QSize extent) {
      const auto size = (QSizeF(extent) * dpr).toSize();
      const auto expected = reference.copy(QRect((QPointF(legacy.mapFromScene(scenePoint)) * dpr).toPoint(), size));
      const auto actual = rendered.copy(QRect((QPointF(f.view(scenePoint)) * dpr).toPoint(), size));
      return glyphError(expected, actual, qGray(theme.canvas.rgb()));
    };
    const auto left = compare({8, 6}, {100, 46});
    const auto right = compare({612, 295}, {80, 46});
    qInfo() << "Large raster label error" << left << right;
    QVERIFY(left < .02);
    QVERIFY(right < .02);

    // A resize must discard the old coverage. Once it settles, a small pan
    // in the new view uses the existing exact-scale tiles.
    f.window.resize(800, 600);
    f.canvas->setSize(f.window.size());
    QTRY_VERIFY(!f.canvas->rasterPending());
    f.canvas->resetRasterStats();
    const auto scroll = f.canvas->viewport().scroll();
    f.canvas->setScroll(scroll.x() + 1, scroll.y());
    f.window.grabWindow();
    QCOMPARE(f.canvas->rasterStats().cards, 0);
    QCOMPARE(f.canvas->rasterStats().wires, 0);
  }

  void movingOneGroupOnlyRepaintsItsLabel() {
    Fixture f(snapshot({
        sized(node("left", kGroup, 32, 120), 220, 200),
        sized(node("right", kGroup, 505, 355), 220, 200),
    }));
    f.canvas->resetRasterStats();
    f.canvas->flushRaster();
    f.canvas->resetRasterStats();
    QVERIFY(f.model.setNodeData(f.id("left"), NodeRole::Position, QPointF(40, 125)));
    QTRY_COMPARE(f.canvas->rasterStats().foreground, 1);
    QTRY_VERIFY(!f.canvas->rasterPending());
    QCOMPARE(f.canvas->rasterStats().foreground, 1);
  }

  void settledCardTextMatchesDevicePixels_data() {
    QTest::addColumn<double>("zoom");
    QTest::newRow("fit") << .53;
    QTest::newRow("normal") << 1.0;
  }

  void settledCardTextMatchesDevicePixels() {
    QFETCH(double, zoom);
    const QPointF origin(zoom == 1. ? QPointF(73, 77) : QPointF(73.25, 77.4)), center(400, 300);
    const auto graph = snapshot({node("source", kSource, origin.x(), origin.y())});
    Fixture quick(graph);
    WorkflowGraphModel model;
    EditorScene legacyScene(model);
    model.project(graph, catalog());
    QWidget host;
    auto &view = QtNodesCanvas::createView(legacyScene, host);
    host.resize(quick.window.size());
    view.resize(host.size());
    QtNodesCanvas legacy(legacyScene, view);
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    const auto theme = test::darkCanvasTheme();
    legacy.scene().setTheme(theme);
    quick.canvas->setView(zoom, center);
    legacy.setView(zoom, center);
    QTRY_VERIFY(!quick.canvas->zoomSettling() && !quick.canvas->rasterPending());

    // Paint the QtNodes card at the same display density. Its device-coordinate
    // cache paints at a pixmap-relative phase that can differ at fractional DPR.
    auto *referenceCard = legacyScene.nodeGraphicsObject(*model.allNodeIds().begin());
    QVERIFY(referenceCard);
    const auto dpr = quick.window.effectiveDevicePixelRatio();
    QCOMPARE(view.devicePixelRatioF(), dpr);
    QImage legacyFrame((QSizeF(view.viewport()->size()) * dpr).toSize(), QImage::Format_ARGB32_Premultiplied);
    legacyFrame.setDevicePixelRatio(dpr);
    legacyFrame.fill(theme.canvas);
    {
      QPainter painter(&legacyFrame);
      painter.setWorldTransform(legacy.viewportTransform());
      painter.translate(referenceCard->scenePos());
      legacyScene.nodePainter().paint(&painter, *referenceCard);
    }
    const auto textOrigin = origin + QPointF(8, 4);
    const QSize extent(qRound(133 * zoom), qRound(27 * zoom));
    const auto sample = [&](const QImage &frame, QPoint origin) {
      return frame.copy(QRect((QPointF(origin) * dpr).toPoint(), (QSizeF(extent) * dpr).toSize()));
    };
    const auto reference = sample(legacyFrame, legacy.mapFromScene(textOrigin));
    const auto rendered = sample(quick.window.grabWindow(), quick.view(textOrigin));
    QCOMPARE(reference.size(), rendered.size());
    if (zoom == 1. && dpr == 1.) {
      const auto widgetGrab = sample(view.viewport()->grab().toImage(), legacy.mapFromScene(textOrigin));
      const auto grabError = glyphError(widgetGrab, rendered, qGray(theme.node.rgb()));
      qInfo() << "QtNodes viewport title error" << grabError;
      QVERIFY(grabError < .02);
    }
    const auto *card = quick.item("source");
    const auto error = glyphError(reference, rendered, qGray(theme.node.rgb()));
    const auto toDevice = [&](const QRectF &local) {
      const auto &content = quick.canvas->contentLayer();
      const auto position = ((local.topLeft() + card->scenePosition()) * content.scale() + content.position()) * dpr;
      return QRectF(position, local.size() * content.scale() * dpr);
    };
    QRect painted;
    for (const auto &tile : card->tiles()) {
      QCOMPARE(tile.geometry.scale, zoom * dpr);
      const auto rect = toDevice(tile.geometry.localRect());
      QVERIFY(QLineF(rect.topLeft(), QPointF(rect.topLeft().toPoint())).length() < 1e-6);
      QCOMPARE(tile.pixels.size(), rect.size().toSize());
      painted |= QRect(rect.topLeft().toPoint(), tile.pixels.size());
    }
    const auto expected = toDevice(card->rasterBounds());
    const auto phase = -QPointF(quick.canvas->viewport().scroll()) * dpr - quick.canvas->contentLayer().position() * dpr;
    const auto deviceBounds = expected.translated(phase).toAlignedRect();
    qInfo() << "Settled title error" << error << "pixels" << painted << "expected" << deviceBounds;
    QCOMPARE(painted, deviceBounds);
    QVERIFY(error < .02);
  }

  void rasterInvariants_data() {
    QTest::addColumn<QString>("graphKind");
    QTest::addColumn<double>("zoom");
    QTest::addColumn<QSize>("size");
    QTest::addColumn<int>("panStep");
    QTest::newRow("F1-scale-swap") << QString("swap") << 3.0 << QSize(1920, 1080) << 7;
    QTest::newRow("F2-visible-budget") << QString("pressure") << 1.0 << QSize(1920, 1080) << 12;
    QTest::newRow("F3-fractional-pan") << QString("small") << 1.0 << QSize(1390, 900) << 1;
    QTest::newRow("P2-gesture-seams") << QString("seam") << 3.0 << QSize(1920, 1080) << 7;

    for (const auto *kind : {"small", "dense", "nested", "wires", "selection"}) {
      for (const double zoom : {.12, .53, 1., 3.}) {
        for (const QSize size : {QSize(1390, 900), QSize(1920, 1080)}) {
          for (const int step : {1, 7, 12}) {
            const auto name = QString("%1-z%2-%3-pan%4").arg(kind).arg(zoom).arg(size.width()).arg(step);
            QTest::newRow(qPrintable(name)) << QString(kind) << zoom << size << step;
          }
        }
      }
    }
  }

  void rasterInvariants() {
    QFETCH(QString, graphKind);
    QFETCH(double, zoom);
    QFETCH(QSize, size);
    QFETCH(int, panStep);
    const bool group = graphKind == "swap" || graphKind == "pressure" || graphKind == "seam" || graphKind == "nested";
    const bool pressure = graphKind == "pressure";
    const bool seam = graphKind == "seam";
    const bool swap = graphKind == "swap";
    const QPointF center = group ? QPointF(310, 210) : QPointF(400, 300);
    QJsonArray nodes;
    QJsonArray edges;
    if (group) {
      const auto extent = graphKind == "nested" || pressure
          ? QSizeF(size) * (1.25 / zoom) : QSizeF(600, 400);
      const auto at = center - QPointF(extent.width(), extent.height()) / 2;
      nodes.append(sized(node("group", kGroup, at.x(), at.y()), extent.width(), extent.height()));
      if (pressure || graphKind == "nested") {
        nodes.append(sized(node("inner", kGroup, 20, 20, {{"parent_id", "group"}}),
                           extent.width() - 40, extent.height() - 40));
      }
    } else if (graphKind == "dense") {
      for (int i = 0; i < 2000; ++i) {
        nodes.append(node(QString::number(i), kSource, i % 50 * 350 - 8400, i / 50 * 190 - 3500));
      }
    } else {
      const auto distance = graphKind == "wires" ? 1900 / zoom : 165;
      nodes = {node("source", kSource, center.x() - distance, center.y() - 79),
               node("target", kTarget, center.x() + distance, center.y() + 51)};
      edges = {edge("wire", "source", "target")};
      if (graphKind == "selection") {
        nodes.append(sized(node("group", kGroup, center.x() - 130 / zoom, center.y() + 64 / zoom),
                           480 / zoom, 150 / zoom));
      }
    }
    const auto graph = snapshot(nodes, edges);
    Fixture f(graph, size);
    // Frame grabs can synthesize hover as a different fixture leaves the
    // cursor over this window. The matrix changes only raster inputs itself.
    f.canvas->setAcceptHoverEvents(false);
    auto theme = test::darkCanvasTheme();
    theme.grid = theme.canvas;
    f.canvas->setTheme(theme);
    if (graphKind == "selection") {
      for (const auto id : f.model.allNodeIds()) { f.canvas->selection().setNode(id, true); }
    }
    const auto dpr = f.window.effectiveDevicePixelRatio();
    GraphCanvas::RasterTestHooks hooks(*f.canvas);
    f.canvas->setView(zoom, center);
    f.canvas->flushRaster();
    f.window.grabWindow();

    const auto deviceRect = [&](const QRectF &sceneRect) {
      const auto &content = f.canvas->contentLayer();
      return QRectF((sceneRect.topLeft() * content.scale() + content.position()) * dpr,
                    sceneRect.size() * content.scale() * dpr);
    };
    const auto roundEdges = [](const QRectF &rect) {
      const auto topLeft = rect.topLeft().toPoint();
      return QRect(topLeft, QSize(rect.bottomRight().toPoint().x() - topLeft.x(),
                                  rect.bottomRight().toPoint().y() - topLeft.y()));
    };
    double minimumCoverage = 1;
    bool assertExact = false;
    bool exact = true;
    int frames = 0;
    qsizetype offscreenBytes = 0;
    // The software test window synchronizes on the GUI thread. Collect
    // metrics here so intermediate polish passes are part of the assertion.
    const auto sampleFrame = connect(&f.window, &QQuickWindow::beforeSynchronizing, this, [&] {
      ++frames;
      const QRect frame(QPoint(), (QSizeF(f.window.size()) * dpr).toSize());
      const auto items = f.canvas->scene().itemsIn(f.canvas->viewport().visibleSceneRect());
      for (const auto *item : items) {
        const auto origin = item->scenePosition();
        // The item bounds include an antialiasing margin. Exclude the
        // outermost two pixels when comparing the old grid during scaling.
        const auto wanted = roundEdges(deviceRect(item->rasterBounds().translated(origin)))
                                .adjusted(2, 2, -2, -2).intersected(frame);
        if (wanted.isEmpty()) { continue; }
        QRegion painted;
        for (const auto &tile : item->tiles()) {
          const auto rect = deviceRect(tile.geometry.localRect().translated(origin));
          if (assertExact && rect.intersects(frame)) {
            exact &= qFuzzyCompare(tile.geometry.scale, f.canvas->viewport().zoom() * dpr)
                && QLineF(rect.topLeft(), QPointF(rect.topLeft().toPoint())).length() < 1e-6
                && (tile.pixels.isNull() || tile.pixels.size() == rect.size().toSize());
          }
          const auto target = CanvasImageItem::alignedImageRect(QRectF(rect.topLeft() / dpr, rect.size() / dpr), dpr);
          painted |= QRect((target.topLeft() * dpr).toPoint(), (target.size() * dpr).toSize());
        }
        qsizetype area = 0;
        const auto covered = painted.intersected(wanted);
        for (const auto &rect : covered) { area += qsizetype(rect.width()) * rect.height(); }
        minimumCoverage = std::min(minimumCoverage, double(area) / (qsizetype(wanted.width()) * wanted.height()));
      }
      qsizetype bytes = 0;
      const auto count = [&](const CanvasImageItem &item, QPointF position) {
        for (const auto *grid : {&item.tiles(), &item.stagedTiles()}) {
          for (const auto &tile : *grid) {
            if (!deviceRect(tile.geometry.localRect().translated(position)).intersects(frame)) { bytes += tile.bytes(); }
          }
        }
      };
      for (const auto *child : f.canvas->contentLayer().childItems()) {
        if (const auto *item = dynamic_cast<const CanvasItem *>(child)) {
          count(*item, item->scenePosition());
        } else {
          for (const auto *part : child->childItems()) {
            if (const auto *item = dynamic_cast<const ForegroundItem *>(part)) { count(*item, item->position()); }
          }
        }
      }
      offscreenBytes = std::max(offscreenBytes, bytes);
    });
    const auto disconnectFrame = qScopeGuard([&] { disconnect(sampleFrame); });

    if (pressure) {
      // Two already-rastered groups compete after reducing the retention
      // budget below one visible layer and making the tiles stale.
      hooks.setCacheBudget(4 * 1024 * 1024);
      f.canvas->resetRasterStats();
      for (const auto *name : {"group", "inner"}) { f.item(name)->markDirty(); }
      QTRY_VERIFY(!f.canvas->rasterPending());
      const auto passes = f.canvas->rasterStats();
      for (const auto &tile : f.item("inner")->tiles()) {
        QCOMPARE(tile.revision, f.item("inner")->rasterRevision());
      }
      f.window.grabWindow();
      f.canvas->resetRasterStats();
      f.canvas->scene().requestRaster();
      QTRY_VERIFY(!f.canvas->rasterPending());
      f.window.grabWindow();
      QCOMPARE(f.canvas->rasterStats().cards, 0);
      QVERIFY(passes.slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale);
    } else if (seam) {
      f.canvas->resetRasterStats();
      const auto checkSeams = [&] {
        const auto frame = f.window.grabWindow();
        const auto *card = f.item("group");
        for (const auto &tile : card->tiles()) {
          const auto rect = deviceRect(tile.geometry.localRect().translated(card->scenePosition()));
          const auto target = CanvasImageItem::alignedImageRect(QRectF(rect.topLeft() / dpr, rect.size() / dpr), dpr);
          const auto end = target.bottomRight() * dpr;
          const auto start = target.topLeft() * dpr;
          QVERIFY2(QLineF(start, QPointF(start.toPoint())).length() < 1e-6 &&
                       QLineF(end, QPointF(end.toPoint())).length() < 1e-6,
                   "Gesture tile has a fractional destination edge");
        }
        const auto interior = roundEdges(deviceRect(f.item("group")->sceneBoundingRect()))
                                  .intersected(frame.rect()).adjusted(25, 25, -25, -25);
        QVERIFY(!interior.isEmpty());
        const auto background = theme.canvas.rgb();
        int gaps = 0;
        for (int y = interior.top(); y <= interior.bottom(); ++y) {
          for (int x = interior.left(); x <= interior.right(); ++x) {
            if (frame.pixel(x, y) == background) { ++gaps; }
          }
        }
        QCOMPARE(gaps, 0);
      };
      for (int step = 0; step < 2; ++step) {
        f.canvas->scaleBy(1.07, false, {});
        checkSeams();
      }
      QTRY_VERIFY(!f.canvas->zoomSettling() && !f.canvas->rasterPending());
      checkSeams();
      QVERIFY(f.canvas->rasterStats().slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale);
    } else {
      const auto scroll = f.canvas->viewport().scroll();
      f.canvas->resetRasterStats();
      for (int step = 1; !swap && step <= 8; ++step) {
        f.canvas->setScroll(scroll.x() + step * panStep, scroll.y());
        f.window.grabWindow();
      }
      const auto panning = f.canvas->rasterStats();
      QCOMPARE(panning.cards + panning.wires + panning.foreground, 0);
      f.canvas->setScroll(scroll.x(), scroll.y());
      f.canvas->resetRasterStats();
      if (swap) { hooks.setTimeBudget(0); }
      f.canvas->scaleBy(1.07, false, {});
      f.window.grabWindow();
      QTRY_VERIFY(!f.canvas->zoomSettling() && !f.canvas->rasterPending());
      if (swap) { hooks.setTimeBudget(1'400'000); }
      assertExact = true;
      f.canvas->update();
      f.window.grabWindow();
      QVERIFY(exact);
      const auto stats = f.canvas->rasterStats();
      QVERIFY2(stats.slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale,
               qPrintable(QString::number(stats.slowestPass)));
      f.canvas->resetRasterStats();
      f.canvas->scene().requestRaster();
      QTRY_VERIFY(!f.canvas->rasterPending());
      const auto unchanged = f.canvas->rasterStats();
      QCOMPARE(unchanged.cards + unchanged.wires + unchanged.foreground, 0);
      const auto beforeResize = f.window.size();
      f.window.resize(beforeResize - QSize(36, 24));
      f.canvas->setSize(f.window.size());
      f.window.grabWindow();
      QTRY_VERIFY(!f.canvas->rasterPending());
    }
    QVERIFY(frames > 0);
    QCOMPARE(minimumCoverage, 1.);
    QVERIFY2(offscreenBytes <= (pressure ? 4 * 1024 * 1024 : GraphCanvas::rasterCacheBudget),
             qPrintable(QString::number(offscreenBytes)));
  }

  void visibleItemsSurviveCachePressure() {
    Fixture f(snapshot({
        node("source", kSource, -80, 0),
        node("target", kTarget, 500, 0),
        node("target2", kTarget, 500, 300),
        node("prefetch", kTarget, 910, 0),
    }, {edge("e", "source", "target")}));
    f.canvas->flushRaster();
    // Keep the initial visible set with no room to prefetch the fourth card.
    GraphCanvas::RasterTestHooks(*f.canvas).setCacheBudget(0);
    f.canvas->setView(1, QPointF(4000, 4000));
    f.canvas->flushRaster();
    f.canvas->setView(1, QPointF(400, 300));
    f.canvas->resetRasterStats();
    f.canvas->flushRaster();
    const auto first = f.canvas->rasterStats();
    for (int update = 0; update < 5; ++update) {
      f.item("source")->markDirty();
      f.canvas->flushRaster();
    }
    QVERIFY(f.item("source")->hasImage());
    QVERIFY(f.item("target")->hasImage());
    QVERIFY(f.item("target2")->hasImage());
    QVERIFY(f.canvas->scene().connectionItems().first()->hasImage());
    QCOMPARE(first.cards, 3);
    QCOMPARE(first.wires, 1);
    QCOMPARE(f.canvas->rasterStats().cards - first.cards, 5);
    QCOMPARE(f.canvas->rasterStats().wires, first.wires);
    QVERIFY(!f.item("prefetch")->hasImage());
    // This pan stays inside the same coverage. The deferred card must paint
    // as soon as the view reaches it even though the cache is still full.
    f.canvas->centerOn(QPointF(620, 300));
    QTRY_VERIFY(f.item("prefetch")->hasImage());
  }

  void cachePressureEvictsFarthestTile() {
    Fixture f(snapshot({node("visible", kSource, 120, 100),
                        node("near", kSource, 850, 100),
                        node("far", kSource, 1080, 100)}));
    f.canvas->flushRaster();
    QVERIFY(f.item("near")->hasImage());
    QVERIFY(f.item("far")->hasImage());
    GraphCanvas::RasterTestHooks(*f.canvas).setCacheBudget(f.item("near")->rasterBytes());
    f.canvas->scene().requestRaster();
    QTRY_VERIFY(!f.canvas->rasterPending());
    QVERIFY(f.item("near")->hasImage());
    QVERIFY(!f.item("far")->hasImage());
    QVERIFY(f.item("visible")->hasImage());
  }

  void lineageRetainsKeyboardFocusAcrossModelResets() {
    auto graph = pair();
    WorkflowGraphModel model;
    EditorScene scene(model);
    model.project(graph, catalog());
    node_editor::LineageLayer lineage(scene);
    auto linked = graph["graph"].toObject();
    linked["links"] = QJsonArray{QJsonObject{
        {"id", "reference"}, {"source", "source"}, {"target", "target"}, {"label", "reference"}, {"kind", "source"}}};
    QVERIFY(lineage.update(linked, {{"source", QRectF(0, 0, 100, 60)}, {"target", QRectF(300, 0, 100, 60)}}).isEmpty());
    QGraphicsView view(&scene);
    view.resize(700, 460);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    auto *chip = qobject_cast<QGraphicsObject *>(lineage.linkItem("reference"));
    QVERIFY(chip);
    chip->setFocus();
    QCOMPARE(scene.focusItem(), chip);
    auto expanded = catalog();
    expanded.append(QJsonObject{{"node_type", "fixture.More"}});
    model.project(graph, expanded);
    QCOMPARE(scene.focusItem(), chip);
    model.project(graph, expanded, true);
    QCOMPARE(scene.focusItem(), chip);
    graph["id"] = "another-workflow";
    model.project(graph, expanded, true);
    QCOMPARE(scene.focusItem(), chip);
    QSignalSpy removed(&lineage, &node_editor::LineageLayer::deleteRequested);
    QTest::keyClick(&view, Qt::Key_Delete);
    QCOMPARE(removed.size(), 1);
  }

  void animatedRastersDoNotStarveVisibleEdits() {
    Fixture f(pair());
    f.canvas->flushRaster();
    GraphCanvas::RasterTestHooks hooks(*f.canvas);
    hooks.setTimeBudget(0); // Deterministically paint one visible item per pass.
    const auto cards = f.canvas->scene().nodeItems();
    QSet<NodeItem *> repainted;
    int ticks = 0;
    QTimer timer;
    connect(&timer, &QTimer::timeout, this, [&] {
      for (auto *card : cards) { card->markDirty(); }
      hooks.polish();
      for (auto *card : cards) {
        const auto &tiles = card->tiles();
        if (!tiles.isEmpty() && tiles.cbegin()->revision == card->rasterRevision()) { repainted.insert(card); }
      }
      if (++ticks == cards.size()) { timer.stop(); }
    });
    // Drive one invalidation per pass without interleaved window frames.
    f.window.hide();
    timer.start(0);
    QTRY_COMPARE(ticks, cards.size());
    QCOMPARE(repainted.size(), cards.size());
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

  void widgetUngrabCancelsCardDrag() {
    QWidget host;
    host.resize(800, 600);
    WorkflowGraphModel model;
    model.project(pair(), catalog());
    QuickCanvas surface(model, host);
    auto &view = surface.viewportWidget();
    view.resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    surface.setView(1, QPointF(400, 300));
    auto &scene = surface.graphCanvas().scene();
    const auto *card = scene.nodeAt(QPointF(80, 20));
    QVERIFY(card);
    const auto origin = card->scenePosition();
    const auto press = surface.mapFromScene(origin + QPointF(80, 20));
    const auto end = press + QPoint(80, 60);
    QTest::mousePress(&view, Qt::LeftButton, {}, press);
    QTest::mouseMove(&view, end);
    QVERIFY(scene.nodeDragActive());
    QVERIFY(card->scenePosition() != origin);
    QEvent ungrab(QEvent::UngrabMouse);
    QApplication::sendEvent(&view, &ungrab);
    QVERIFY(!scene.nodeDragActive());
    QVERIFY(!scene.mouseGrabber());
    QCOMPARE(card->scenePosition(), origin);
    QTest::mouseRelease(&view, Qt::LeftButton, {}, end);
    QTest::mousePress(&view, Qt::LeftButton, {}, press);
    QVERIFY(scene.mouseGrabber());
    QTest::mouseRelease(&view, Qt::LeftButton, {}, press);
  }

  void focusOnHostDoesNotPreserveDrag() {
    QWidget host;
    host.resize(800, 600);
    WorkflowGraphModel model;
    model.project(pair(), catalog());
    QuickCanvas surface(model, host);
    auto &view = surface.viewportWidget();
    view.resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    view.setFocus();
    surface.setView(1, QPointF(400, 300));
    auto &graph = surface.graphCanvas();
    const auto press = surface.mapFromScene(QPointF(80, 20));
    QTest::mousePress(&view, Qt::LeftButton, {}, press);
    QTest::mouseMove(&view, press + QPoint(80, 60));
    QVERIFY(graph.scene().nodeDragActive());
    QCOMPARE(QApplication::focusWidget(), &view);
    QQuickItem nextFocus(graph.parentItem());
    nextFocus.forceActiveFocus();
    QVERIFY(!graph.scene().nodeDragActive());
    QVERIFY(!graph.scene().mouseGrabber());
    QTest::mouseRelease(&view, Qt::LeftButton, {}, press + QPoint(80, 60));
  }

  void inlineOverlayFocusPreservesPress() {
    QWidget host;
    host.resize(800, 600);
    WorkflowGraphModel model;
    const QJsonArray metadata{QJsonObject{{"node_type", kTarget}, {"inline_fields", QJsonArray{"in"}},
        {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", QJsonObject{{"type", "str"}}}}}}}};
    model.project(snapshot({node("target", kTarget, 500, 0)}), metadata);
    QuickCanvas surface(model, host);
    auto &view = surface.viewportWidget();
    // The editor is a child of the canvas widget and takes focus in the press.
    QWidget overlay(&view);
    overlay.resize(20, 20);
    overlay.move(600, 400);
    overlay.setFocusPolicy(Qt::StrongFocus);
    view.resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    surface.setView(1, QPointF(400, 300));
    auto &scene = surface.graphCanvas().scene();
    auto *target = scene.nodeAt(QPointF(540, 20));
    QVERIFY(target);
    const auto field = model.inlineFieldRect(target->nodeId(), "in");
    QVERIFY(!field.isEmpty());
    const auto press = surface.mapFromScene(target->scenePosition() + field.center());
    connect(&scene.interaction(), &CanvasInteraction::inlineEditRequested, &overlay,
            [&overlay] { overlay.setFocus(Qt::MouseFocusReason); });
    view.setFocus(Qt::OtherFocusReason);
    QTest::mouseMove(&view, press);
    QVERIFY(target->nodeState().hovered());
    QTest::mousePress(&view, Qt::LeftButton, {}, press);
    QVERIFY(overlay.hasFocus());
    const bool hoveredAfterFocusTransfer = target->nodeState().hovered();
    QTest::mouseRelease(&view, Qt::LeftButton, {}, press);
    QVERIFY(hoveredAfterFocusTransfer);
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
    const auto best = glyphError(reference, rendered, background);
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
