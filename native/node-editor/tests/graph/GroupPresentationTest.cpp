#include "../support/OverlayCanvasFixture.h"
#include "../support/DarkCanvasTheme.h"
#include "graph/WorkflowGraphModel.h"
#include "graph/EditorScene.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QJsonDocument>
#include <QtTest>
#include <cmath>
#include <QPainter>
#include <QGraphicsSceneMouseEvent>
#include "document/WorkflowDocument.h"
using namespace nodetool;
using namespace QtNodes;
class GroupPresentationTest final : public QObject {
  Q_OBJECT
private slots:
  void labelZoomMatchesWeb() {
    QCOMPARE(groupLabelScale(0.25) * 0.25, 1.0);
    QCOMPARE(groupLabelScale(0.5) * 0.5, 1.0);
    QCOMPARE(groupLabelScale(1), 1.0);
    QVERIFY(std::abs(groupLabelScale(2) * 2 - std::pow(2, 0.2)) < 0.00001);
  }
  void nestedMovementAndGeometry();
  void labelHitOutsideItemBounds();
  void resizeCommitsOnceAndPreservesChildren();
  void resizeCancelAndReadOnly();
  void ordinaryNodeResizeBounds();
  void nativeLabelRendering();
  void invalidCycleDoesNotRecurse();
  void fractionalSizesKeepTheirSize();
};
#ifndef Q_MOC_RUN
namespace {
void sceneMouse(test::OverlayCanvasFixture &fixture, QEvent::Type type, QPointF point) {
  auto &surface = fixture.surface();
  auto &viewport = surface.viewportWidget();
  const auto local = surface.mapFromScene(point);
  const auto global = viewport.mapToGlobal(local);
  const auto button = type == QEvent::GraphicsSceneMouseMove ? Qt::NoButton : Qt::LeftButton;
  const auto buttons = type == QEvent::GraphicsSceneMouseRelease ? Qt::NoButton : Qt::LeftButton;
  if (auto *legacy = fixture.legacyScene()) {
    QGraphicsSceneMouseEvent event(type);
    event.setWidget(&viewport);
    event.setScenePos(point);
    event.setLastScenePos(point);
    event.setScreenPos(global);
    event.setButton(button);
    event.setButtons(buttons);
    QApplication::sendEvent(legacy, &event);
  } else {
    const auto mouseType = type == QEvent::GraphicsSceneMouseMove ? QEvent::MouseMove
                         : type == QEvent::GraphicsSceneMouseRelease ? QEvent::MouseButtonRelease
                                                                    : QEvent::MouseButtonPress;
    QMouseEvent event(mouseType, local, global, button, buttons, Qt::NoModifier);
    QApplication::sendEvent(&viewport, &event);
  }
}

double stackZ(test::OverlayCanvasFixture &fixture, NodeId id) {
  if (auto *quick = fixture.quick()) { return quick->canvasScene().nodeItem(id)->z(); }
  return test::graphicsNode(*fixture.legacyScene(), id)->zValue();
}

void escape(test::OverlayCanvasFixture &fixture) {
  QKeyEvent event(QEvent::KeyPress, Qt::Key_Escape, Qt::NoModifier);
  auto &scene = fixture.surface().scene().sceneObject();
  QObject *target = fixture.quick() ? static_cast<QObject *>(&fixture.surface().viewportWidget()) : &scene;
  QApplication::sendEvent(target, &event);
}

QJsonObject gestureFixture() {
  return QJsonDocument::fromJson(R"JSON({"graph":{"nodes":[
    {"id":"group","type":"nodetool.workflows.base_node.Group","data":{"headline":"Frame","future":5},"ui_properties":{"position":{"x":100,"y":200},"width":400,"height":300,"future":"retained"}},
    {"id":"child","parent_id":"group","type":"nodetool.workflows.base_node.Comment","data":{"comment":"Hello"},"ui_properties":{"position":{"x":40,"y":50},"width":100,"height":80}}
  ],"edges":[]}})JSON").object();
}
NodeId idFor(const WorkflowGraphModel &model, const QString &resource) {
  for (const auto id : model.allNodeIds()) { if (model.resourceId(id) == resource) { return id; } }
  return InvalidNodeId;
}
}
void GroupPresentationTest::labelHitOutsideItemBounds() {
  WorkflowGraphModel model;
  test::OverlayCanvasFixture fixture(model);
  model.project(gestureFixture());
  fixture.show(QSize(1400, 1100), QRectF(-600, -500, 1600, 1400), QPointF(300, 270));
  fixture.surface().setView(0.25, QPointF(300, 270));
  const auto group = idFor(model, "group"), child = idFor(model, "child");
  const auto label = fixture.surface().scene().groupLabelRect(group, 0.25);
  const auto point = label.center();
  QVERIFY(point.y() < fixture.surface().nodeBounds(group).top());
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress, point);
  QVERIFY(fixture.surface().selection().contains(group));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove, point + QPointF(80, 40));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseRelease, point + QPointF(80, 40));
  QCOMPARE(model.nodeData(group, NodeRole::Position).toPointF(), QPointF(180,240));
  QCOMPARE(model.nodeData(child, NodeRole::Position).toPointF(), QPointF(220,290));
  QVERIFY(stackZ(fixture, group) < stackZ(fixture, child));
}
// React Flow writes fractional sizes after a resize. They round, and never
// fall back to the default 400 x 300 frame or a card's natural height.
void GroupPresentationTest::fractionalSizesKeepTheirSize() {
  WorkflowGraphModel model;
  model.project(QJsonDocument::fromJson(R"JSON({"graph":{"nodes":[
    {"id":"group","type":"nodetool.workflows.base_node.Group","data":{"headline":"Frame"},"ui_properties":{"position":{"x":0,"y":0},"width":612.4,"height":455.6}},
    {"id":"note","type":"nodetool.workflows.base_node.Comment","data":{"comment":"Hi"},"ui_properties":{"position":{"x":700,"y":0},"width":250.5,"height":120.2}},
    {"id":"preview","type":"nodetool.workflows.base_node.Preview","data":{},"ui_properties":{"position":{"x":0,"y":600},"width":300,"height":420.5}}
  ],"edges":[]}})JSON").object());
  QCOMPARE(model.layout(idFor(model, "group")).size, QSize(612, 456));
  QCOMPARE(model.layout(idFor(model, "note")).size, QSize(251, 120));
  // Cards too: a fractional height is the height the web resized it to.
  QCOMPARE(model.layout(idFor(model, "preview")).size.height(), 421);
}
void GroupPresentationTest::resizeCommitsOnceAndPreservesChildren() {
  node_editor::WorkflowDocument document;
  QVERIFY(document.load(gestureFixture()));
  WorkflowGraphModel model;
  test::OverlayCanvasFixture fixture(model);
  model.project(document.snapshot());
  fixture.show(QSize(1400, 1100), QRectF(-600, -500, 1600, 1400), QPointF(300, 270));
  int commits = 0;
  model.commit = [&](const QJsonObject &command) {
    ++commits;
    const bool result = bool(document.applyCommand(command));
    if (result) { model.project(document.snapshot()); }
    return result;
  };
  const auto group = idFor(model, "group"), child = idFor(model, "child");
  const auto before = document.snapshot();
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress, QPointF(495,495));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove, QPointF(595,575));
  QCOMPARE(model.layout(group).size, QSize(500,380));
  QCOMPARE(document.snapshot(), before);
  sceneMouse(fixture, QEvent::GraphicsSceneMouseRelease, QPointF(595,575));
  QCOMPARE(commits,1);
  QCOMPARE(document.undoStack()->count(),1);
  QCOMPARE(document.node("group")["ui_properties"].toObject()["future"].toString(),QString("retained"));
  QCOMPARE(model.nodeData(child,NodeRole::Position).toPointF(),QPointF(140,250));
  document.undo(); model.project(document.snapshot());
  QCOMPARE(document.snapshot(),before);
  fixture.surface().selection().setNode(group, true);
  // Top-left resize preserves child absolute coordinates while updating its
  // relative offset inside the resized frame in the same history entry.
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress, QPointF(100,200));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove, QPointF(50,150));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseRelease, QPointF(50,150));
  QCOMPARE(model.layout(group).size,QSize(450,350));
  QCOMPARE(model.nodeData(group,NodeRole::Position).toPointF(),QPointF(50,150));
  QCOMPARE(model.nodeData(child,NodeRole::Position).toPointF(),QPointF(140,250));
  QCOMPARE(document.node("child")["ui_properties"].toObject()["position"].toObject(),(QJsonObject{{"x",90},{"y",100}}));
  QCOMPARE(document.undoStack()->count(),1);
  document.undo(); QCOMPARE(document.snapshot(),before);
}
void GroupPresentationTest::nativeLabelRendering() {
  WorkflowGraphModel model;
  test::OverlayCanvasFixture fixture(model);
  fixture.surface().scene().setTheme(test::darkCanvasTheme());
  model.project(gestureFixture());
  QImage image(600,500,QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  const QRectF area(50, 80, 600, 500);
  if (auto *quick = fixture.quick()) {
    painter.translate(-area.topLeft());
    quick->graphCanvas().renderScene(painter, area, 1);
  } else {
    fixture.legacyScene()->render(&painter, QRectF(QPointF(), area.size()), area);
  }
  painter.end();
  // The headline lives outside the group body and the QtNodes item clip.
  int ink = 0;
  for (int y=84;y<115;++y) {
    for (int x=50;x<150;++x) {
      const auto pixel = image.pixelColor(x,y);
      if (pixel.red()>80 && pixel.green()>80 && pixel.blue()>80) { ++ink; }
    }
  }
  QVERIFY(ink>20);
  const auto path = qEnvironmentVariable("NODETOOL_GROUP_CAPTURE");
  if (!path.isEmpty()) { QVERIFY(image.save(path)); }
}
void GroupPresentationTest::ordinaryNodeResizeBounds() {
  WorkflowGraphModel model;
  test::OverlayCanvasFixture fixture(model);
  const QJsonObject node{{"id","card"},{"type","test.Empty"},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",0},{"y",0}}},{"future",42}}}};
  model.project(QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}});
  fixture.show(QSize(1400, 1100), QRectF(-600, -500, 1600, 1400), QPointF(300, 270));
  const auto id = idFor(model,"card");
  const auto initial = model.layout(id).size;
  const auto handle = QPointF(initial.width()-5,initial.height()-5);
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress,handle);
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove,handle+QPointF(1000,100));
  QCOMPARE(model.layout(id).size.width(),800);
  QCOMPARE(model.layout(id).size.height(),initial.height()+100);
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove,handle-QPointF(1000,1000));
  QCOMPARE(model.layout(id).size,QSize(150,initial.height()));
  escape(fixture);
  QCOMPARE(model.layout(id).size,initial);
}
void GroupPresentationTest::resizeCancelAndReadOnly() {
  WorkflowGraphModel model;
  test::OverlayCanvasFixture fixture(model);
  model.project(gestureFixture());
  fixture.show(QSize(1400, 1100), QRectF(-600, -500, 1600, 1400), QPointF(300, 270));
  const auto child = idFor(model,"child");
  int commits = 0;
  model.commit = [&](const QJsonObject &) { ++commits; return true; };
  QCOMPARE(fixture.surface().nodeOrigin(child),QPointF(140,250));
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress,QPointF(235,325));
  QVERIFY(fixture.surface().selection().contains(child));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove,QPointF(145,255));
  QCOMPARE(model.layout(child).size,QSize(30,40));
  escape(fixture);
  QCOMPARE(model.layout(child).size,QSize(100,80));
  QCOMPARE(commits,0);
  model.project(gestureFixture(),{},true);
  sceneMouse(fixture, QEvent::GraphicsSceneMousePress,QPointF(235,325));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseMove,QPointF(335,425));
  sceneMouse(fixture, QEvent::GraphicsSceneMouseRelease,QPointF(335,425));
  QCOMPARE(model.layout(child).size,QSize(100,80));
  QCOMPARE(commits,0);
}
void GroupPresentationTest::nestedMovementAndGeometry() {
    const auto snapshot = QJsonDocument::fromJson(R"JSON({"nodes":[
      {"id":"outer","type":"nodetool.workflows.base_node.Group","data":{"headline":"Outer","group_color":"#ffcc00"},"ui_properties":{"position":{"x":100,"y":200},"width":700,"height":500}},
      {"id":"inner","parent_id":"outer","type":"nodetool.workflows.base_node.Group","ui_properties":{"position":{"x":40,"y":50}}},
      {"id":"note","parent_id":"inner","type":"nodetool.workflows.base_node.Comment","data":{"comment":"**Hello**"},"ui_properties":{"position":{"x":10,"y":20},"width":240,"height":120}}
    ],"edges":[]})JSON").object();
    WorkflowGraphModel model;
    test::OverlayCanvasFixture fixture(model);
    model.project(snapshot);
    NodeId outer = InvalidNodeId, inner = InvalidNodeId, note = InvalidNodeId;
    for (const auto id : model.allNodeIds()) {
      if (model.resourceId(id) == "outer") { outer = id; }
      if (model.resourceId(id) == "inner") { inner = id; }
      if (model.resourceId(id) == "note") { note = id; }
    }
    QCOMPARE(model.nodeData(note, NodeRole::Position).toPointF(), QPointF(150,270));
    QCOMPARE(model.layout(outer).size, QSize(700,500));
    QCOMPARE(model.layout(note).size, QSize(240,120));
    QCOMPARE(model.layout(outer).title, QString("Outer"));
    QVERIFY(model.ports(note, PortType::In).isEmpty());
    QVERIFY(stackZ(fixture, outer) < stackZ(fixture, inner));
    QVERIFY(stackZ(fixture, inner) < stackZ(fixture, note));
    QHash<NodeId,QPointF> before;
    for (const auto id : model.allNodeIds()) { before[id] = model.nodeData(id,NodeRole::Position).toPointF(); }
    QVERIFY(model.setNodeData(outer,NodeRole::Position,QPointF(120,230)));
    model.moveDescendants(before);
    QCOMPARE(model.nodeData(note,NodeRole::Position).toPointF(),QPointF(170,300));
    for (const auto id : model.allNodeIds()) { before[id] = model.nodeData(id,NodeRole::Position).toPointF(); }
    QVERIFY(model.setNodeData(outer,NodeRole::Position,QPointF(140,260)));
    QVERIFY(model.setNodeData(inner,NodeRole::Position,QPointF(180,310)));
    model.moveDescendants(before);
    QCOMPARE(model.nodeData(note,NodeRole::Position).toPointF(),QPointF(190,330));
    QCOMPARE(model.comment(note).toString(),QString("**Hello**"));
  }
void GroupPresentationTest::invalidCycleDoesNotRecurse() {
    WorkflowGraphModel model;
    model.project(QJsonDocument::fromJson(R"JSON({"nodes":[{"id":"a","parent_id":"b","type":"nodetool.workflows.base_node.Group"},{"id":"b","parent_id":"a","type":"nodetool.workflows.base_node.Group"}],"edges":[]})JSON").object());
    QCOMPARE(model.allNodeIds().size(),size_t(2));
    QHash<NodeId,QPointF> before;
    for (const auto id : model.allNodeIds()) { before[id] = model.nodeData(id,NodeRole::Position).toPointF(); }
    model.moveDescendants(before);
    for (const auto id : model.allNodeIds()) { QCOMPARE(model.nodeData(id,NodeRole::Position).toPointF(),QPointF()); }
  }
#endif
QTEST_MAIN(GroupPresentationTest)
#include "GroupPresentationTest.moc"
