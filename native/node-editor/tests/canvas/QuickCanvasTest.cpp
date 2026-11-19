// The Quick canvas (docs/plans/node-editor-quick-canvas/plan.md, Q3): its
// items, hit tests, gestures and culling, on a GraphCanvas in a QQuickWindow
// with the software backend, without an EditorWindow.
#include "../support/DarkCanvasTheme.h"
#include "../../../graph-runner/unittests/sanitizer_build.h"
#include "canvas/CanvasViewport.h"
#include "canvas/CardOverlay.h"
#include "canvas/ConnectionItem.h"
#include "canvas/GraphCanvas.h"
#include "canvas/GridIndex.h"
#include "canvas/LineageItem.h"
#include "canvas/MiniMapItem.h"
#include "canvas/NodeItem.h"
#include "canvas/NodePainter.h"
#include "document/WorkflowDocument.h"
#include "graph/CardBodies.h"
#include "canvas/EditorCanvasScene.h"
#include "graph/LineageLayer.h"
#include "graph/NodeLayout.h"
#include "graph/WorkflowGraphModel.h"
#include "run/NodeRuntimeModel.h"
#include "ui/CanvasSurface.h"
#include "ui/QuickCanvas.h"
#include <qtnodes/AbstractNodeGeometry.hpp>
#include <QElapsedTimer>
#include <QGraphicsScene>
#include <QHelpEvent>
#include <QGraphicsView>
#include <QScrollBar>
#include <QScopeGuard>
#include <QPainter>
#include <QQuickPaintedItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QSignalSpy>
#include <QToolTip>
#include <QUndoStack>
#include <QtTest>
#include <limits>
#include <memory>
#include <numeric>

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
      // Inputs of several types give the running ring several colours.
      QJsonObject{{"node_type", "fixture.Multi"},
                  {"properties", QJsonArray{QJsonObject{{"name", "count"}, {"type", QJsonObject{{"type", "int"}}}},
                                            QJsonObject{{"name", "picture"}, {"type", QJsonObject{{"type", "image"}}}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", portType}}}}},
  };
}

QJsonObject snapshot(const QJsonArray &nodes, const QJsonArray &edges = {}) {
  return {{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
}

const QString kSource = QStringLiteral("fixture.Source");
const QString kTarget = QStringLiteral("fixture.Target");
const QString kGroup = QStringLiteral("nodetool.workflows.base_node.Group");
const QString kMulti = QStringLiteral("fixture.Multi");

// UI thread only. Members are declared so that the canvas goes before the
// model, and both before the window.
// UI thread only. Paint a small card control outside the sampled title.
class OverlayMarker final : public QQuickPaintedItem {
public:
  explicit OverlayMarker(CardOverlay &overlay) {
    setParentItem(&overlay);
    setPosition({60, 45});
    setSize({20, 14});
  }
  void paint(QPainter *painter) override { painter->fillRect(boundingRect(), Qt::red); }
};

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

QImage paintViewport(const GraphCanvas &canvas, QSize deviceSize, qreal dpr) {
  QImage image(deviceSize, QImage::Format_ARGB32_Premultiplied);
  image.setDevicePixelRatio(dpr);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setWorldTransform(canvas.viewport().viewportTransform());
  canvas.renderScene(painter, canvas.viewport().visibleSceneRect(), canvas.viewport().zoom());
  return image;
}

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
    // A key listed in several cells is reported once, for areas that start
    // before, inside and after its first cell.
    index.insert(4, QRectF(300, 300, 1200, 900));
    for (const auto &area : {QRectF(-600, -600, 3000, 3000), QRectF(700, 700, 600, 300), QRectF(1400, 1100, 10, 10)}) {
      QCOMPARE(index.query(area).count(4), 1);
    }
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
    const auto press = f.item("source")->scenePosition() + QPointF(80, 20);
    f.press(press);
    QCOMPARE(scene.mouseGrabber(), static_cast<CanvasItem *>(f.item("source")));
    f.model.resetOnNextProjection();
    f.model.project(pair({edge("e", "source", "target")}), catalog());
    QCOMPARE(reset.size(), 1);
    QVERIFY(!scene.mouseGrabber());
    f.release(press);
    QCOMPARE(scene.nodeItems().size(), 3);
    QCOMPARE(scene.connectionItems().size(), 1);
  }

  void modelResetCancelsSlider() {
    const auto type = QStringLiteral("nodetool.image.Blur");
    const auto card = node("blur", type, 100, 100, {{"data", QJsonObject{{"size", 2}}}});
    const auto graph = snapshot({card});
    const QJsonArray metadata{QJsonObject{
        {"node_type", type},
        {"properties", QJsonArray{QJsonObject{{"name", "size"}, {"type", QJsonObject{{"type", "float"}}},
                                             {"min", 0}, {"max", 100}, {"default", 2}}}}}};
    node_editor::WorkflowDocument document;
    document.setNodeMetadata(metadata);
    QVERIFY(document.load(graph));
    Fixture f(graph);
    f.model.project(graph, metadata);
    f.model.commit = [&](const QJsonObject &command) {
      f.commands.append(command);
      return document.applyCommand(command).ok;
    };
    const auto id = f.id("blur");
    const auto &rows = f.model.layout(id).rows;
    const auto row = std::ranges::find(rows, NodeRowKind::Slider, &NodeRow::kind);
    QVERIFY(row != rows.end());
    const auto track = sliderTrack(*row).translated(f.item("blur")->scenePosition());
    const auto start = track.center() - QPointF(track.width() / 4, 0);
    const auto end = track.center() + QPointF(track.width() / 4, 0);
    f.press(start);
    f.move(end);
    QCOMPARE(f.canvas->scene().sliderDraftNode(), id);
    QVERIFY(f.canvas->scene().sliderDraftValue() > 50);

    const auto undoCount = document.undoStack()->count();
    QSignalSpy reset(&f.model, &AbstractGraphModel::modelReset);
    auto refreshed = metadata;
    refreshed.append(QJsonObject{{"node_type", "fixture.More"}});
    f.model.project(graph, refreshed);
    QCOMPARE(reset.size(), 1);
    QCOMPARE(f.id("blur"), id);
    f.release(end);
    QCOMPARE(document.undoStack()->count(), undoCount);
    QVERIFY(f.commands.isEmpty());
    QCOMPARE(document.node("blur")["data"].toObject()["size"].toInt(), 2);
  }

  void stagedRasterPublication_data() {
    QTest::addColumn<QString>("scenario");
    QTest::newRow("F1-threshold") << QString("threshold");
    QTest::newRow("F2-live-pan") << QString("pan");
    QTest::newRow("F2-changed-edge") << QString("edge");
  }

  void stagedRasterPublication() {
    QFETCH(QString, scenario);
    const bool threshold = scenario == "threshold";
    const bool pan = scenario == "pan";
    Fixture f(snapshot({sized(node("card", kSource, 100, 100), threshold ? 480 : 900, 420)}), {400, 220});
    const auto dpr = f.window.effectiveDevicePixelRatio();
    f.window.resize(QSizeF(400 / dpr, 220 / dpr).toSize());
    f.canvas->setSize(f.window.size());
    const auto center = QPointF(threshold ? 410 : pan ? 390 : 440, 310);
    f.canvas->setView((threshold ? 1. : .9) / dpr, center);
    f.canvas->flushRaster();

    auto *card = f.item("card");
    QVERIFY(card && !card->tiles().isEmpty());
    const auto oldScale = card->tiles().cbegin()->geometry.scale;
    GraphCanvas::RasterTestHooks hooks(*f.canvas);
    hooks.setTimeBudget(1);
    f.canvas->setView((threshold ? 1.25 : 1.) / dpr, center);
    if (!threshold) { hooks.endZoom(); }
    f.canvas->resetRasterStats();
    hooks.polish(); // Plan only.
    QCOMPARE(f.canvas->rasterStats().cards, 0);

    const auto checkPixels = [&](QPointF left, QPointF right) {
      for (const auto sample : {left, right}) {
        const auto pixel = (QPointF(f.view(sample)) * dpr).toPoint();
        QImage composite(1, 1, QImage::Format_ARGB32_Premultiplied);
        composite.fill(Qt::transparent);
        QPainter painter(&composite);
        painter.translate(-pixel);
        int layers = 0;
        for (const auto &tile : card->tiles()) {
          if (tile.pixels.isNull()) { continue; }
          const auto rect = f.canvas->contentLayer().mapRectToScene(
              tile.geometry.localRect().translated(card->scenePosition()));
          const auto target = CanvasImageItem::tileTarget(rect, tile.pixels, dpr);
          const QRectF device(target.topLeft() * dpr, target.size() * dpr);
          if (device.contains(QPointF(pixel) + QPointF(.5, .5))) { ++layers; }
          painter.drawImage(device, tile.pixels);
        }
        painter.end();
        QVERIFY2(composite.pixelColor(0, 0).alpha() > 0, qPrintable(QString("Card hole at x=%1").arg(sample.x())));
        QCOMPARE(layers, 1);
      }
    };

    const auto checkEdge = [&] {
      const auto cell = card->tiles().constFind(QPoint());
      QVERIFY(cell != card->tiles().cend());
      const auto full = CanvasImageItem::rasterGeometryOnGrid(card->rasterBounds(), cell->geometry);
      QCOMPARE(cell->geometry.device, full.device.intersected(QRect(0, 0, 512, 512)));
    };

    if (pan) {
      // The first plan has one visible cell. Before it paints, expose the next.
      const auto scroll = f.canvas->viewport().scroll();
      f.canvas->setScroll(scroll.x() + qRound(60 / dpr), scroll.y());
      hooks.polish();
      QCOMPARE(f.canvas->rasterStats().cards, 1);
      checkPixels({490, 310}, {630, 310});
      QCOMPARE(card->tiles().cbegin()->geometry.scale, oldScale);
    } else if (threshold) {
      // The zoom crosses 512 device pixels, but the retained scale still fits.
      for (int pass = 0; pass < 6; ++pass) {
        hooks.polish();
        checkPixels({300, 310}, {550, 310});
      }
      QCOMPARE(card->tiles().size(), 1);
      hooks.endZoom();
      hooks.polish(); // Plan the tiled replacement.
      hooks.polish(); // Only one cell can paint.
      QCOMPARE(card->stagedTiles().size(), 1);
      QCOMPARE(card->tiles().cbegin()->geometry.scale, oldScale);
      checkPixels({300, 310}, {550, 310});
    } else {
      hooks.polish();
      QCOMPARE(card->stagedTiles().size(), 1);
      // Change an edge of the staged cell without changing its key.
      QVERIFY(f.model.setNodeData(card->nodeId(), NodeRole::Size, QSize(900, 400)));
      for (int pass = 0; pass < 4; ++pass) {
        hooks.polish();
        if (card->tiles().cbegin()->geometry.scale != oldScale) { checkEdge(); }
      }
    }
    f.canvas->flushRaster();
    QVERIFY(card->tiles().cbegin()->geometry.scale != oldScale);
    if (threshold) {
      QVERIFY(card->tiles().size() > 1);
      checkPixels({300, 310}, {550, 310});
    } else {
      checkPixels({490, 310}, {630, 310});
      if (!pan) { checkEdge(); }
    }
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

  void rubberBandCountsCardsAndWire() {
    Fixture f(snapshot({node("source", kSource, 80, 160), node("target", kTarget, 440, 160),
                        node("outside", kSource, 80, 460)},
                       {edge("wire", "source", "target")}));
    const auto connection = *f.model.allConnectionIds(f.id("source")).begin();
    auto &scene = f.canvas->scene();
    const auto *wire = scene.connectionItem(connection);
    QVERIFY(wire && wire->shown());
    const QPointF start(55, 130), end(745, 400);
    QVERIFY(scene.itemsAt(start).isEmpty());
    f.press(start);
    f.drag(start, end);
    QVERIFY(f.canvas->rubberBandActive());
    f.release(end);
    QVERIFY(!f.canvas->rubberBandActive());
    QVERIFY(f.item("source")->isSelected());
    QVERIFY(f.item("target")->isSelected());
    QVERIFY(!f.item("outside")->isSelected());
    QVERIFY(wire->isSelected());
    QCOMPARE(f.canvas->selection().count(), 3);
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
    auto theme = test::darkCanvasTheme();
    theme.grid = theme.canvas;
    quick.canvas->setTheme(theme);
    for (const auto &id : {QString("left"), QString("right")}) {
      quick.canvas->selection().setNode(quick.id(id), true);
    }
    quick.canvas->flushRaster();
    const auto quickFrame = quick.window.grabWindow();
    const auto referenceFrame = paintViewport(*quick.canvas, quickFrame.size(), quick.window.effectiveDevicePixelRatio());
    QVERIFY(!quickFrame.isNull());
    const auto inkError = [&](QPointF origin, QSize extent) {
      const auto dpr = quick.window.effectiveDevicePixelRatio();
      const auto size = (QSizeF(extent) * dpr).toSize();
      const auto reference = referenceFrame.copy(QRect((QPointF(quick.view(origin)) * dpr).toPoint(), size));
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

    const auto rendered = f.window.grabWindow();
    const auto reference = paintViewport(*f.canvas, rendered.size(), dpr);
    const auto compare = [&](QPointF scenePoint, QSize extent) {
      const auto size = (QSizeF(extent) * dpr).toSize();
      const auto expected = reference.copy(QRect((QPointF(f.view(scenePoint)) * dpr).toPoint(), size));
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

  // The error label pulses until the delayed running indicator disappears.
  void terminalStatusDamage() {
    Fixture f(pair());
    const auto &layout = f.model.layout(f.id("source"));
    const auto theme = test::darkCanvasTheme();
    for (const auto *status : {"failed", "error"}) {
      CardPaintState state{.theme = theme, .layout = layout, .bounds = f.item("source")->boundingRect(),
                           .runningShown = true, .runtimeConnected = true, .runtime = {{"status", status}}};
      const auto paint = [&](double phase) {
        state.animationPhase = phase;
        QImage image(layout.size, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        QPainter painter(&image);
        NodePainter::paint(&painter, state);
        painter.end();
        return image;
      };
      const auto first = paint(0), second = paint(.25);
      const auto damage = NodePainter::animatedRegion(state);
      int changed = 0;
      for (int y = 0; y < first.height(); ++y) {
        for (int x = 0; x < first.width(); ++x) {
          if (first.pixel(x, y) == second.pixel(x, y)) { continue; }
          ++changed;
          QVERIFY(std::ranges::any_of(damage, [&](const QRectF &rect) { return rect.contains(QPointF(x + .5, y + .5)); }));
        }
      }
      QVERIFY(changed > 0);
    }
  }

  void settledCardTextMatchesDevicePixels_data() {
    QTest::addColumn<double>("zoom");
    QTest::addColumn<int>("panStep");
    QTest::addColumn<bool>("withOverlay");
    QTest::newRow("fit") << .53 << 0 << false;
    QTest::newRow("normal") << 1.0 << 0 << false;
    // Odd pans move the content by fractional device pixels at 1.25 and 1.5.
    QTest::newRow("fit-odd-pan") << .53 << 7 << false;
    QTest::newRow("normal-odd-pan") << 1.0 << 7 << false;
    QTest::newRow("overlay-odd-pan") << 1.0 << 7 << true;
  }

  void settledCardTextMatchesDevicePixels() {
    QFETCH(double, zoom);
    QFETCH(int, panStep);
    QFETCH(bool, withOverlay);
    const QPointF origin(73.25, 77.4), center(400, 300);
    const auto graph = snapshot({node("source", kSource, origin.x(), origin.y())});
    Fixture quick(graph);
    const auto theme = test::darkCanvasTheme();
    quick.canvas->setView(zoom, center);
    CardOverlay overlay(*quick.item("source"));
    OverlayMarker marker(overlay);
    marker.setVisible(withOverlay);
    if (withOverlay) { quick.canvas->setCardOverlayVisible(overlay, true); }
    const auto unregister = qScopeGuard([&] {
      if (withOverlay) { quick.canvas->setCardOverlayVisible(overlay, false); }
    });
    QTRY_VERIFY(!quick.canvas->zoomSettling() && !quick.canvas->rasterPending());
    if (panStep) {
      const auto scroll = quick.canvas->viewport().scroll();
      for (int step = 1; step <= 5; ++step) {
        quick.canvas->setScroll(scroll.x() + step * panStep, scroll.y() + step * panStep);
        quick.window.grabWindow();
      }
      // The settled raster follows the new fractional device offset.
      QTRY_VERIFY(!quick.canvas->zoomSettling() && !quick.canvas->rasterPending());
    }

    // Compare the scene graph's settled tiles against a direct paint at the device pixel ratio.
    const auto dpr = quick.window.effectiveDevicePixelRatio();
    const auto frame = quick.window.grabWindow();
    const auto referenceFrame = paintViewport(*quick.canvas, frame.size(), dpr);
    const auto textOrigin = origin + QPointF(8, 4);
    const QSize extent(qRound(133 * zoom), qRound(27 * zoom));
    const auto sample = [&](const QImage &frame, QPoint origin) {
      return frame.copy(QRect((QPointF(origin) * dpr).toPoint(), (QSizeF(extent) * dpr).toSize()));
    };
    const auto reference = sample(referenceFrame, quick.view(textOrigin));
    const auto rendered = sample(frame, quick.view(textOrigin));
    QCOMPARE(reference.size(), rendered.size());
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
    QTest::newRow("overlay-pan") << QString("overlay") << 1.0 << QSize(1390, 900) << 7;
    QTest::newRow("F3-fractional-pan") << QString("small") << 1.0 << QSize(1390, 900) << 1;
    QTest::newRow("P2-gesture-seams") << QString("seam") << 3.0 << QSize(1920, 1080) << 7;
    // Fix set 5: an animated card through a scale swap, cache pressure while
    // panning, a model reset, a draft wire, background prefetch and the grid.
    QTest::newRow("F1-running-large") << QString("running") << 1.0 << QSize(1390, 900) << 7;
    QTest::newRow("F1-running-card") << QString("running-card") << 3.0 << QSize(1920, 1080) << 7;
    QTest::newRow("F5-pressure-pan") << QString("deep") << 1.0 << QSize(1920, 1080) << 40;
    QTest::newRow("F6-model-reset") << QString("reset") << 1.0 << QSize(1390, 900) << 7;
    QTest::newRow("draft-settle-pan") << QString("draft") << 2.0 << QSize(1390, 900) << 7;
    for (const auto *kind : {"small", "dense", "nested"}) {
      for (const double zoom : {.53, 1.}) {
        for (const int step : {1, 7}) {
          const auto name = QString("prefetch-%1-z%2-pan%3").arg(kind).arg(zoom).arg(step);
          QTest::newRow(qPrintable(name)) << QString("prefetch-%1").arg(kind) << zoom << QSize(1390, 900) << step;
        }
      }
    }
    for (const double zoom : {1., 1.07, 1.1449, .53, .873, 2.5, .3}) {
      QTest::newRow(qPrintable(QString("grid-z%1").arg(zoom))) << QString("grid") << zoom << QSize(1390, 900) << 0;
    }

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
    // A prefetch row waits for background passes instead of flushing before it pans.
    const bool prefetch = graphKind.startsWith("prefetch-");
    if (prefetch) { graphKind = graphKind.mid(int(qstrlen("prefetch-"))); }
    const bool group = graphKind == "swap" || graphKind == "pressure" || graphKind == "seam" || graphKind == "nested";
    const bool pressure = graphKind == "pressure";
    const bool seam = graphKind == "seam";
    const bool swap = graphKind == "swap";
    const bool running = graphKind == "running" || graphKind == "running-card";
    const bool deep = graphKind == "deep";
    const bool reset = graphKind == "reset";
    const bool draft = graphKind == "draft";
    const bool gridRow = graphKind == "grid";
    QPointF center = group ? QPointF(310, 210) : QPointF(400, 300);
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
    } else if (running) {
      // The multi-type card's running ring has several colours and turns.
      // The plain card's ring has one colour, so it never changes on screen.
      const auto extent = graphKind == "running" ? QSizeF(1600, 1100) : QSizeF(280, 140);
      nodes = {sized(node("multi", kMulti, center.x() - extent.width() / 2, center.y() - extent.height() / 2),
                     extent.width(), extent.height()),
               node("plain", kSource, center.x() + 60, center.y() + 40)};
    } else if (deep) {
      center = QPointF(0, 300);
      nodes = {sized(node("outer", kGroup, -4000, -2000), 9000, 5000),
               sized(node("inner", kGroup, 40, 40, {{"parent_id", "outer"}}), 8900, 4900),
               sized(node("inner2", kGroup, 40, 40, {{"parent_id", "inner"}}), 8800, 4800)};
    } else if (reset) {
      // More cards than one pass paints, so a rebuilt scene shows blank cards.
      for (int i = 0; i < 30; ++i) {
        nodes.append(node(QString("card%1").arg(i), i % 2 ? kSource : kTarget, i % 6 * 220 - 260, i / 6 * 170 - 100));
      }
      nodes.append(sized(node("frame", kGroup, -300, 760), 420, 160));
      edges = {edge("wire", "card1", "card2")};
    } else if (draft) {
      center = QPointF(500, 200);
      nodes = {node("source", kSource, 0, 0), node("target", kTarget, 1800, 600)};
    } else if (gridRow) {
      center = QPointF(1234.5, 777.25);
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
    std::unique_ptr<CardOverlay> overlay;
    std::unique_ptr<OverlayMarker> marker;
    if (graphKind == "overlay") {
      QVERIFY(f.item("source"));
      overlay = std::make_unique<CardOverlay>(*f.item("source"));
      marker = std::make_unique<OverlayMarker>(*overlay);
      f.canvas->setCardOverlayVisible(*overlay, true);
    }
    const auto unregister = qScopeGuard([&] {
      if (overlay) { f.canvas->setCardOverlayVisible(*overlay, false); }
    });
    // Frame grabs can synthesize hover as a different fixture leaves the
    // cursor over this window. The matrix changes only raster inputs itself.
    f.canvas->setAcceptHoverEvents(false);
    // The grid keeps its visible colour, so its paths are part of every frame.
    const auto theme = test::darkCanvasTheme();
    f.canvas->setTheme(theme);
    if (graphKind == "selection") {
      for (const auto id : f.model.allNodeIds()) { f.canvas->selection().setNode(id, true); }
    }
    const auto dpr = f.window.effectiveDevicePixelRatio();
    const bool software = f.window.rendererInterface()->graphicsApi() == QSGRendererInterface::Software;
    // Sanitizer builds run every raster job several times slower. The frame
    // budget and the waits scale with the timing limits, so each frame does
    // the same share of the work.
    constexpr qint64 kFrameBudget = 1'400'000 * gr::test::kSanitizerTimeScale;
    constexpr int kWait = 5000 * gr::test::kSanitizerTimeScale;

    if (gridRow) {
      f.canvas->setView(zoom, center);
      // At these zooms the 25-unit cross spacing doubles only in the overview.
      const double sceneGap = zoom < .48 ? 50. : 25.;
      const double devicePeriod = sceneGap * zoom * dpr;
      const double deviceArm = 1.5 * zoom * dpr;
      const QPointF latticeStart(std::ceil(center.x() / sceneGap) * sceneGap,
                                 std::ceil(center.y() / sceneGap) * sceneGap);
      if (!software && std::abs(devicePeriod - std::round(devicePeriod)) > 1e-6) {
        QSKIP("The RHI grid repeats a texture, which is exact only for whole device-pixel periods");
      }
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling() && !f.canvas->rasterPending(), kWait);
      const auto compareGrids = [&](const char *when) {
        const auto quickFrame = f.window.grabWindow().convertToFormat(QImage::Format_RGB32);
        const auto reference = paintViewport(*f.canvas, quickFrame.size(), dpr).convertToFormat(QImage::Format_RGB32);
        QCOMPARE(quickFrame.size(), reference.size());
        const auto background = theme.canvas.rgb() & 0xffffff;
        int quickGrid = 0, referenceGrid = 0, differing = 0;
        // Exclude the edge where a fractional device pixel can be clipped.
        for (int y = 0; y < quickFrame.height() - 1; ++y) {
          for (int x = 0; x < quickFrame.width() - 1; ++x) {
            const auto a = quickFrame.pixel(x, y) & 0xffffff, b = reference.pixel(x, y) & 0xffffff;
            quickGrid += a != background;
            referenceGrid += b != background;
            differing += a != b;
          }
        }
        qInfo() << "Grid pixels" << when << "quick" << quickGrid << "direct paint" << referenceGrid << "differing" << differing;
        QVERIFY(referenceGrid > 0);
        QCOMPARE(differing, 0);
        // Check the lattice independently of the shared grid painter. In
        // device space an aliased cosmetic stroke can land one pixel from
        // its projected coordinate. Sample away from the origin axes.
        const auto scroll = QPointF(f.canvas->viewport().scroll());
        const auto gridColor = theme.grid.rgb();
        const auto backgroundColor = theme.canvas.rgb();
        const int margin = qCeil(deviceArm) + 2;
        const int side = 2 * margin + 1;
        for (int row = 0; row < 3; ++row) {
          for (int column = 0; column < 3; ++column) {
            const auto sceneCross = latticeStart + QPointF(column * sceneGap, row * sceneGap);
            const auto deviceCross = (sceneCross * zoom - scroll) * dpr;
            const auto topLeft = deviceCross.toPoint() - QPoint(margin, margin);
            QVERIFY(quickFrame.rect().contains(QRect(topLeft, QSize(side, side))));
            QList<int> horizontal(side, 0), vertical(side, 0);
            for (int y = 0; y < side; ++y) {
              for (int x = 0; x < side; ++x) {
                if (quickFrame.pixel(topLeft + QPoint(x, y)) == gridColor) {
                  ++horizontal[y];
                  ++vertical[x];
                }
              }
            }
            const auto rowWithInk = std::max_element(horizontal.cbegin(), horizontal.cend());
            const auto columnWithInk = std::max_element(vertical.cbegin(), vertical.cend());
            const int crossY = topLeft.y() + int(rowWithInk - horizontal.cbegin());
            const int crossX = topLeft.x() + int(columnWithInk - vertical.cbegin());
            QVERIFY(std::abs(crossX - deviceCross.x()) <= 1.0);
            QVERIFY(std::abs(crossY - deviceCross.y()) <= 1.0);
            QCOMPARE(quickFrame.pixel(crossX, crossY), gridColor);
            if (deviceArm >= 1.25) {
              QVERIFY(*rowWithInk >= 2);
              QVERIFY(*columnWithInk >= 2);
            }
            if (deviceArm >= 2) {
              for (const auto offset : {QPoint(-1, 0), QPoint(1, 0), QPoint(0, -1), QPoint(0, 1)}) {
                QCOMPARE(quickFrame.pixel(QPoint(crossX, crossY) + offset), gridColor);
              }
            }
            QCOMPARE(std::accumulate(horizontal.cbegin(), horizontal.cend(), 0),
                     *rowWithInk + *columnWithInk - 1);
            const auto between = deviceCross + QPointF(devicePeriod / 2, devicePeriod / 2);
            QCOMPARE(quickFrame.pixel(between.toPoint()), backgroundColor);
          }
        }
      };
      compareGrids("settled");
      if (QTest::currentTestFailed()) { return; }
      // Pans move the cached grid by whole device pixels, or paint it again.
      for (const auto step : {QPoint(12, 0), QPoint(0, 8), QPoint(-7, 5), QPoint(4, -12)}) {
        const auto scroll = f.canvas->viewport().scroll() + step;
        f.canvas->setScroll(scroll.x(), scroll.y());
        compareGrids("panned");
        if (QTest::currentTestFailed()) { return; }
      }
      return;
    }

    GraphCanvas::RasterTestHooks hooks(*f.canvas);
    hooks.setTimeBudget(kFrameBudget);
    f.canvas->setView(zoom, center);
    if (prefetch) {
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling() && !f.canvas->rasterPending(), kWait);
    } else {
      f.canvas->flushRaster();
    }
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
    // The fractional device offset of the current scroll, which a settled
    // raster paints so that its pixels match a direct paint of the scene.
    const auto truePhase = [&] {
      const auto translation = -QPointF(f.canvas->viewport().scroll()) * dpr;
      return translation - QPointF(translation.toPoint());
    };
    // Phases a whole pixel apart place pixels identically, with the snapped
    // translation rounded the other way.
    const auto samePhase = [](QPointF a, QPointF b) {
      const auto d = a - b;
      return QLineF(QPointF(), d - QPointF(std::round(d.x()), std::round(d.y()))).length() < 1e-6;
    };
    double minimumCoverage = 1;
    QString worstCoverage;
    bool assertExact = false;
    bool exact = true;
    QString inexact;
    int frames = 0;
    qsizetype offscreenBytes = 0;
    // Sample during synchronization, while the GUI thread is blocked on a
    // threaded renderer. Queuing this callback can outlive the current row
    // and would miss the exact frame requested by checkExact.
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
            const bool tileExact = qFuzzyCompare(tile.geometry.scale, f.canvas->viewport().zoom() * dpr)
                && QLineF(rect.topLeft(), QPointF(rect.topLeft().toPoint())).length() < 1e-6
                && samePhase(tile.geometry.viewportPhase, truePhase())
                && (tile.pixels.isNull() || tile.pixels.size() == rect.size().toSize());
            if (!tileExact && exact) {
              QDebug(&inexact) << "item" << item->indexKey() << "scale" << tile.geometry.scale << "rect" << rect
                               << "phase" << tile.geometry.viewportPhase << "expected" << truePhase();
            }
            exact &= tileExact;
          }
          const auto target = CanvasImageItem::tileTarget(QRectF(rect.topLeft() / dpr, rect.size() / dpr), tile.pixels, dpr);
          painted |= QRect((target.topLeft() * dpr).toPoint(), (target.size() * dpr).toSize());
        }
        qsizetype area = 0;
        const auto covered = painted.intersected(wanted);
        for (const auto &rect : covered) { area += qsizetype(rect.width()) * rect.height(); }
        const auto coverage = double(area) / (qsizetype(wanted.width()) * wanted.height());
        if (coverage < minimumCoverage) {
          minimumCoverage = coverage;
          worstCoverage = QString("frame %1 item %2 coverage %3").arg(frames).arg(item->indexKey()).arg(coverage);
          QDebug(&worstCoverage) << "wanted" << wanted << "missing" << (QRegion(wanted) - painted)
                                 << "scroll" << f.canvas->viewport().scroll() << "size" << item->size();
        }
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
    }, Qt::DirectConnection);
    const auto disconnectFrame = qScopeGuard([&] { disconnect(sampleFrame); });
    const auto checkExact = [&](const char *when) {
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling() && !f.canvas->rasterPending(), kWait);
      exact = true;
      inexact.clear();
      assertExact = true;
      const auto before = frames;
      f.canvas->update();
      f.window.grabWindow();
      assertExact = false;
      QVERIFY(frames > before);
      QVERIFY2(exact, qPrintable(QString("%1: %2").arg(when, inexact)));
    };

    if (pressure) {
      // Two already-rastered groups compete after reducing the retention
      // budget below one visible layer and making the tiles stale.
      hooks.setCacheBudget(4 * 1024 * 1024);
      f.canvas->resetRasterStats();
      for (const auto *name : {"group", "inner"}) { f.item(name)->markDirty(); }
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->rasterPending(), kWait);
      const auto passes = f.canvas->rasterStats();
      for (const auto &tile : f.item("inner")->tiles()) {
        QCOMPARE(tile.revision, f.item("inner")->rasterRevision());
      }
      f.window.grabWindow();
      f.canvas->resetRasterStats();
      f.canvas->scene().requestRaster();
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->rasterPending(), kWait);
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
          const auto target = CanvasImageItem::tileTarget(QRectF(rect.topLeft() / dpr, rect.size() / dpr), tile.pixels, dpr);
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
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling() && !f.canvas->rasterPending(), kWait);
      checkSeams();
      QVERIFY(f.canvas->rasterStats().slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale);
    } else if (running) {
      // F1 and F8: a card that animates while its exact-scale grid is
      // staged still publishes it, and only the ring repaints afterwards.
      node_editor::NodeRuntimeModel runtime;
      f.model.setRuntimeModel(&runtime);
      const auto detach = qScopeGuard([&] { f.model.setRuntimeModel(nullptr); });
      runtime.beginRun("run");
      int sequence = 0;
      for (const auto *name : {"multi", "plain"}) {
        runtime.ingest("run", {{"type", "node_update"}, {"job_id", "run"}, {"job_seq", ++sequence},
                               {"node_id", name}, {"status", "running"}});
      }
      QTRY_VERIFY_WITH_TIMEOUT(f.model.runningShown(f.id("multi")) && f.model.runningShown(f.id("plain")), kWait);
      QTest::qWait(100);
      f.canvas->resetRasterStats();
      f.canvas->scaleBy(1.07, false, {});
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling(), kWait);
      const auto *multi = f.item("multi");
      const auto *plain = f.item("plain");
      const auto visibleExact = [&](const NodeItem &item) {
        const QRect frame(QPoint(), (QSizeF(f.window.size()) * dpr).toSize());
        bool sampled = false;
        for (const auto &tile : item.tiles()) {
          if (!deviceRect(tile.geometry.localRect().translated(item.scenePosition())).intersects(frame)) { continue; }
          if (tile.pixels.isNull() || !qFuzzyCompare(tile.geometry.scale, f.canvas->viewport().zoom() * dpr) ||
              !samePhase(tile.geometry.viewportPhase, truePhase())) {
            return false;
          }
          sampled = true;
        }
        return sampled;
      };
      int firstExact = -1;
      QElapsedTimer clock;
      clock.start();
      for (int frame = 1; clock.elapsed() < 1500 * gr::test::kSanitizerTimeScale; ++frame) {
        QTest::qWait(16);
        f.window.grabWindow();
        const bool exactNow = visibleExact(*multi) && visibleExact(*plain);
        if (exactNow && firstExact < 0) { firstExact = frame; }
        if (firstExact >= 0) {
          QVERIFY2(exactNow, "A running card returned to an old-scale grid");
        }
      }
      qInfo() << "Running card exact after" << firstExact << "frames";
      QVERIFY2(firstExact > 0 && firstExact <= 30, qPrintable(QString("first exact frame %1").arg(firstExact)));
      // Tiles away from the ring, and every tile of the one-colour card, keep their images.
      const auto box = QRectF(QPointF(), multi->size());
      const auto inner = box.adjusted(13, 13, -13, -13);
      const auto images = [](const CanvasImageItem &item, const std::function<bool(const QRectF &)> &select) {
        QHash<QPoint, qint64> keys;
        for (auto it = item.tiles().cbegin(); it != item.tiles().cend(); ++it) {
          if (select(it->geometry.localRect())) { keys.insert(it.key(), it->pixels.cacheKey()); }
        }
        return keys;
      };
      const auto interior = [&](const QRectF &rect) { return inner.contains(rect); };
      const auto ring = [&](const QRectF &rect) { return !inner.contains(rect); };
      const auto all = [](const QRectF &) { return true; };
      const auto interiorBefore = images(*multi, interior), plainBefore = images(*plain, all);
      QHash<QPoint, QImage> ringBefore;
      for (auto it = multi->tiles().cbegin(); it != multi->tiles().cend(); ++it) {
        if (ring(it->geometry.localRect()) && !it->pixels.isNull()) { ringBefore.insert(it.key(), it->pixels); }
      }
      QVERIFY(!ringBefore.isEmpty());
      f.canvas->resetRasterStats();
      for (int frame = 0; frame < 20; ++frame) {
        QTest::qWait(16);
        f.window.grabWindow();
      }
      const auto animated = f.canvas->rasterStats();
      qInfo() << "Running card tiles: interior" << interiorBefore.size() << "ring" << ringBefore.size()
              << "card rasters in 20 frames" << animated.cards;
      if (graphKind == "running") { QVERIFY(!interiorBefore.isEmpty()); }
      QCOMPARE(images(*multi, interior), interiorBefore);
      QCOMPARE(images(*plain, all), plainBefore);
      bool ringChanged = false;
      for (auto it = multi->tiles().cbegin(); it != multi->tiles().cend(); ++it) {
        const auto before = ringBefore.constFind(it.key());
        ringChanged |= before != ringBefore.cend() && !it->pixels.isNull() && it->pixels != *before;
      }
      QVERIFY2(ringChanged, "The running ring pixels stopped changing");
      QVERIFY(animated.slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale);
      const auto scroll = f.canvas->viewport().scroll();
      for (int step = 1; step <= 5; ++step) {
        f.canvas->setScroll(scroll.x() + step * panStep, scroll.y() + step * panStep);
        QTest::qWait(16);
        f.window.grabWindow();
      }
      QTRY_VERIFY_WITH_TIMEOUT(visibleExact(*multi) && visibleExact(*plain), kWait);
    } else if (deep) {
      // F5: viewport-filling groups at the default budget keep full coverage
      // while panning faster than the prefetch margin refills.
      f.canvas->resetRasterStats();
      const auto scroll = f.canvas->viewport().scroll();
      for (int step = 1; step <= 60; ++step) {
        f.canvas->setScroll(scroll.x() + step * panStep, scroll.y() + step * panStep / 3);
        f.window.grabWindow();
      }
      QVERIFY2(f.canvas->rasterStats().slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale,
               qPrintable(QString::number(f.canvas->rasterStats().slowestPass)));
    } else if (reset) {
      // F6: a model reset keeps every item, and every tile until its
      // replacement is painted.
      // Item keys are never reused, unlike the addresses of deleted items.
      QHash<NodeId, quint64> before;
      for (const auto *item : f.canvas->scene().nodeItems()) { before.insert(item->nodeId(), item->indexKey()); }
      const auto wire = f.canvas->scene().connectionItems().first()->indexKey();
      f.model.project(graph, catalog(), true);
      for (int frame = 0; frame < 6; ++frame) { f.window.grabWindow(); }
      auto expanded = catalog();
      expanded.append(QJsonObject{{"node_type", "fixture.More"}});
      f.model.project(graph, expanded, true);
      for (int frame = 0; frame < 6; ++frame) { f.window.grabWindow(); }
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->rasterPending(), kWait);
      f.window.grabWindow();
      for (auto it = before.cbegin(); it != before.cend(); ++it) {
        QCOMPARE(f.canvas->scene().nodeItem(it.key())->indexKey(), it.value());
      }
      QCOMPARE(f.canvas->scene().connectionItems().first()->indexKey(), wire);
      checkExact("after reset");
      if (QTest::currentTestFailed()) { return; }
    } else if (draft) {
      // A draft wire follows the pointer through a zoom, its settle and pans.
      f.canvas->resetRasterStats();
      const auto start = f.port("source", PortType::Out);
      f.press(start);
      QPointF pointer = start;
      for (int step = 1; step <= 6; ++step) {
        pointer = start + QPointF(40 * step, 15 * step);
        f.move(pointer);
        f.window.grabWindow();
      }
      QVERIFY(f.canvas->scene().draftConnection());
      f.canvas->scaleBy(1.07, false, {});
      for (int frame = 0; frame < 40; ++frame) {
        pointer += QPointF(frame % 2 ? -3 : 5, frame % 3 ? 2 : -1);
        f.move(pointer);
        QTest::qWait(8);
        f.window.grabWindow();
      }
      const auto scroll = f.canvas->viewport().scroll();
      for (int step = 1; step <= 8; ++step) {
        f.canvas->setScroll(scroll.x() + step * panStep, scroll.y());
        pointer += QPointF(4, 1);
        f.move(pointer);
        f.window.grabWindow();
      }
      QVERIFY(f.canvas->scene().draftConnection());
      checkExact("draft settled");
      if (QTest::currentTestFailed()) { return; }
      QVERIFY2(f.canvas->rasterStats().slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale,
               qPrintable(QString::number(f.canvas->rasterStats().slowestPass)));
      const auto *wire = f.canvas->scene().draftConnection();
      QVERIFY(wire && wire->hasImage());
      QCOMPARE(f.view(wire->endPoint(PortType::In)), f.view(pointer));
      const auto endpoint = (QPointF(f.view(pointer)) * dpr).toPoint();
      const auto frameWithWire = f.window.grabWindow();
      const auto patch = QRect(endpoint - QPoint(10, 10), QSize(21, 21)).intersected(frameWithWire.rect());
      QVERIFY(!patch.isEmpty());
      f.release(pointer);
      QVERIFY(!f.canvas->scene().draftConnection());
      QVERIFY2(frameWithWire.copy(patch) != f.window.grabWindow().copy(patch),
               "The composed draft has no pixels at its dragged endpoint");
    } else {
      const auto scroll = f.canvas->viewport().scroll();
      f.canvas->resetRasterStats();
      for (int step = 1; !swap && step <= 8; ++step) {
        f.canvas->setScroll(scroll.x() + step * panStep, scroll.y());
        f.window.grabWindow();
      }
      // Eight steps return to the starting device phase at 1.25 and 1.5. One
      // more pixel leaves the view at another phase.
      if (!swap) {
        f.canvas->setScroll(scroll.x() + 8 * panStep + 1, scroll.y() + 1);
        f.window.grabWindow();
      }
      const auto panning = f.canvas->rasterStats();
      if (prefetch) {
        QCOMPARE(panning.visible, 0);
      } else {
        QCOMPARE(panning.cards + panning.wires + panning.foreground, 0);
      }
      // I2 also holds once the view is still after a pan.
      if (!swap) {
        checkExact("after pan");
        if (QTest::currentTestFailed()) { return; }
      }
      f.canvas->setScroll(scroll.x(), scroll.y());
      f.canvas->resetRasterStats();
      if (swap) { hooks.setTimeBudget(0); }
      f.canvas->scaleBy(1.07, false, {});
      f.window.grabWindow();
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->zoomSettling() && !f.canvas->rasterPending(), kWait);
      if (swap) { hooks.setTimeBudget(kFrameBudget); }
      checkExact("after zoom");
      if (QTest::currentTestFailed()) { return; }
      const auto stats = f.canvas->rasterStats();
      if (overlay) {
        qInfo() << "Card overlay raster" << stats.slowestPass << "ns max pass," << offscreenBytes << "offscreen bytes";
      }
      QVERIFY2(stats.slowestPass < 4'000'000 * gr::test::kSanitizerTimeScale,
               qPrintable(QString::number(stats.slowestPass)));
      f.canvas->resetRasterStats();
      f.canvas->scene().requestRaster();
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->rasterPending(), kWait);
      const auto unchanged = f.canvas->rasterStats();
      QCOMPARE(unchanged.cards + unchanged.wires + unchanged.foreground, 0);
      const auto beforeResize = f.window.size();
      f.window.resize(beforeResize - QSize(36, 24));
      f.canvas->setSize(f.window.size());
      f.window.grabWindow();
      QTRY_VERIFY_WITH_TIMEOUT(!f.canvas->rasterPending(), kWait);
    }
    QVERIFY(frames > 0);
    QVERIFY2(minimumCoverage == 1., qPrintable(worstCoverage));
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
    Fixture f(graph, {700, 460});
    auto &scene = f.canvas->scene();
    node_editor::LineageLayer lineage(scene);
    auto linked = graph["graph"].toObject();
    linked["links"] = QJsonArray{QJsonObject{
        {"id", "reference"}, {"source", "source"}, {"target", "target"}, {"label", "reference"}, {"kind", "source"}}};
    QVERIFY(lineage.update(linked, {{"source", f.item("source")->sceneBoundingRect()},
                                    {"target", f.item("target")->sceneBoundingRect()}}).isEmpty());
    auto *chip = lineage.linkItem("reference");
    QVERIFY(chip);
    QTest::mouseClick(&f.window, Qt::LeftButton, {}, f.view(lineage.linkPath("reference").pointAtPercent(.5)));
    QCOMPARE(scene.focusItem(), chip);
    auto expanded = catalog();
    expanded.append(QJsonObject{{"node_type", "fixture.More"}});
    f.model.project(graph, expanded);
    QCOMPARE(scene.focusItem(), chip);
    f.model.project(graph, expanded, true);
    QCOMPARE(scene.focusItem(), chip);
    graph["id"] = "another-workflow";
    f.model.project(graph, expanded, true);
    QCOMPARE(scene.focusItem(), chip);
    QSignalSpy removed(&lineage, &node_editor::LineageLayer::deleteRequested);
    QTest::keyClick(&f.window, Qt::Key_Delete);
    QCOMPARE(removed.size(), 1);
    lineage.clear();
    QVERIFY(!scene.focusItem());
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
    WorkflowGraphModel quickModel;
    quickModel.project(pair(), catalog());
    QuickCanvas quick(quickModel, host);
    quick.hostWidget().resize(host.size());
    host.show();
    QVERIFY(QTest::qWaitForWindowExposed(&host));
    const auto theme = test::darkCanvasTheme();
    quick.scene().setTheme(theme);
    const QPointF center(400, 200);
    const auto id = quick.canvasScene().nodeAt(QPointF(80, 20))->nodeId();
    const auto quickNote = quick.addNote(id, "2 Title", "note", {}, {});
    QVERIFY(quickNote);
    quick.setView(.53, center);
    quick.graphCanvas().flushRaster();
    const auto quickFrame = quick.quickWidget().grabFramebuffer();
    const auto ink = [&](const CanvasSurface &canvas, const QImage &frame, NodeId card) {
      const QPointF textOrigin = canvas.nodeRect(card).bottomLeft() + QPointF(20, 18);
      return frame.copy(QRect(canvas.mapFromScene(textOrigin) - QPoint(1, 1), QSize(27, 9)));
    };
    const auto referenceFrame = paintViewport(quick.graphCanvas(), quickFrame.size(), quickFrame.devicePixelRatio());
    const auto reference = ink(quick, referenceFrame, id);
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
