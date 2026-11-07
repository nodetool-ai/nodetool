#include "graph/WorkflowGraphModel.h"
#include "graph/EditorScene.h"
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QJsonDocument>
#include <QtTest>
#include <cmath>
#include <QGraphicsView>
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
};
#ifndef Q_MOC_RUN
namespace {
void sceneMouse(EditorScene &scene, QGraphicsView &view, QEvent::Type type, QPointF point) {
  QGraphicsSceneMouseEvent event(type);
  event.setWidget(view.viewport());
  event.setScenePos(point);
  event.setLastScenePos(point);
  event.setScreenPos(view.viewport()->mapToGlobal(view.mapFromScene(point)));
  event.setButton(type == QEvent::GraphicsSceneMouseMove ? Qt::NoButton : Qt::LeftButton);
  event.setButtons(type == QEvent::GraphicsSceneMouseRelease ? Qt::NoButton : Qt::LeftButton);
  QApplication::sendEvent(&scene, &event);
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
  EditorScene scene(model);
  model.project(gestureFixture());
  QGraphicsView view(&scene);
  view.scale(0.25, 0.25);
  const auto group = idFor(model, "group"), child = idFor(model, "child");
  const auto label = scene.groupLabelRect(group, 0.25);
  const auto point = label.center();
  QVERIFY(point.y() < scene.nodeGraphicsObject(group)->sceneBoundingRect().top());
  sceneMouse(scene, view, QEvent::GraphicsSceneMousePress, point);
  QVERIFY(scene.nodeGraphicsObject(group)->isSelected());
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseMove, point + QPointF(80, 40));
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseRelease, point + QPointF(80, 40));
  QCOMPARE(model.nodeData(group, NodeRole::Position).toPointF(), QPointF(180,240));
  QCOMPARE(model.nodeData(child, NodeRole::Position).toPointF(), QPointF(220,290));
  QVERIFY(scene.nodeGraphicsObject(group)->zValue() < scene.nodeGraphicsObject(child)->zValue());
}
void GroupPresentationTest::resizeCommitsOnceAndPreservesChildren() {
  node_editor::WorkflowDocument document;
  QVERIFY(document.load(gestureFixture()));
  WorkflowGraphModel model;
  EditorScene scene(model);
  model.project(document.snapshot());
  QGraphicsView view(&scene);
  int commits = 0;
  model.commit = [&](const QJsonObject &command) {
    ++commits;
    const bool result = bool(document.applyCommand(command));
    if (result) { model.project(document.snapshot()); }
    return result;
  };
  const auto group = idFor(model, "group"), child = idFor(model, "child");
  const auto before = document.snapshot();
  sceneMouse(scene, view, QEvent::GraphicsSceneMousePress, QPointF(495,495));
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseMove, QPointF(595,575));
  QCOMPARE(model.layout(group).size, QSize(500,380));
  QCOMPARE(document.snapshot(), before);
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseRelease, QPointF(595,575));
  QCOMPARE(commits,1);
  QCOMPARE(document.undoStack()->count(),1);
  QCOMPARE(document.node("group")["ui_properties"].toObject()["future"].toString(),QString("retained"));
  QCOMPARE(model.nodeData(child,NodeRole::Position).toPointF(),QPointF(140,250));
  document.undo(); model.project(document.snapshot());
  QCOMPARE(document.snapshot(),before);
  scene.nodeGraphicsObject(group)->setSelected(true);
  // Top-left resize preserves child absolute coordinates while updating its
  // relative offset inside the resized frame in the same history entry.
  sceneMouse(scene, view, QEvent::GraphicsSceneMousePress, QPointF(100,200));
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseMove, QPointF(50,150));
  sceneMouse(scene, view, QEvent::GraphicsSceneMouseRelease, QPointF(50,150));
  QCOMPARE(model.layout(group).size,QSize(450,350));
  QCOMPARE(model.nodeData(group,NodeRole::Position).toPointF(),QPointF(50,150));
  QCOMPARE(model.nodeData(child,NodeRole::Position).toPointF(),QPointF(140,250));
  QCOMPARE(document.node("child")["ui_properties"].toObject()["position"].toObject(),(QJsonObject{{"x",90},{"y",100}}));
  QCOMPARE(document.undoStack()->count(),1);
  document.undo(); QCOMPARE(document.snapshot(),before);
}
void GroupPresentationTest::nativeLabelRendering() {
  WorkflowGraphModel model;
  EditorScene scene(model);
  model.project(gestureFixture());
  QImage image(600,500,QImage::Format_ARGB32_Premultiplied);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  scene.render(&painter,QRectF(0,0,600,500),QRectF(50,80,600,500));
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
  EditorScene scene(model);
  const QJsonObject node{{"id","card"},{"type","test.Empty"},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",0},{"y",0}}},{"future",42}}}};
  model.project(QJsonObject{{"nodes",QJsonArray{node}},{"edges",QJsonArray{}}});
  QGraphicsView view(&scene);
  const auto id = idFor(model,"card");
  const auto initial = model.layout(id).size;
  const auto handle = QPointF(initial.width()-5,initial.height()-5);
  sceneMouse(scene,view,QEvent::GraphicsSceneMousePress,handle);
  sceneMouse(scene,view,QEvent::GraphicsSceneMouseMove,handle+QPointF(1000,100));
  QCOMPARE(model.layout(id).size.width(),800);
  QCOMPARE(model.layout(id).size.height(),initial.height()+100);
  sceneMouse(scene,view,QEvent::GraphicsSceneMouseMove,handle-QPointF(1000,1000));
  QCOMPARE(model.layout(id).size,QSize(150,initial.height()));
  QKeyEvent escape(QEvent::KeyPress,Qt::Key_Escape,Qt::NoModifier);
  QApplication::sendEvent(&scene,&escape);
  QCOMPARE(model.layout(id).size,initial);
}
void GroupPresentationTest::resizeCancelAndReadOnly() {
  WorkflowGraphModel model;
  EditorScene scene(model);
  model.project(gestureFixture());
  QGraphicsView view(&scene);
  const auto child = idFor(model,"child");
  int commits = 0;
  model.commit = [&](const QJsonObject &) { ++commits; return true; };
  QCOMPARE(scene.nodeGraphicsObject(child)->scenePos(),QPointF(140,250));
  sceneMouse(scene,view,QEvent::GraphicsSceneMousePress,QPointF(235,325));
  QVERIFY(scene.nodeGraphicsObject(child)->isSelected());
  sceneMouse(scene,view,QEvent::GraphicsSceneMouseMove,QPointF(145,255));
  QCOMPARE(model.layout(child).size,QSize(30,40));
  QKeyEvent escape(QEvent::KeyPress,Qt::Key_Escape,Qt::NoModifier);
  QApplication::sendEvent(&scene,&escape);
  QCOMPARE(model.layout(child).size,QSize(100,80));
  QCOMPARE(commits,0);
  model.project(gestureFixture(),{},true);
  sceneMouse(scene,view,QEvent::GraphicsSceneMousePress,QPointF(235,325));
  sceneMouse(scene,view,QEvent::GraphicsSceneMouseMove,QPointF(335,425));
  sceneMouse(scene,view,QEvent::GraphicsSceneMouseRelease,QPointF(335,425));
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
    EditorScene scene(model);
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
    QVERIFY(scene.nodeGraphicsObject(outer)->zValue() < scene.nodeGraphicsObject(inner)->zValue());
    QVERIFY(scene.nodeGraphicsObject(inner)->zValue() < scene.nodeGraphicsObject(note)->zValue());
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
