#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/CompatibleNodePicker.h"
#include "../graph/BodyConnectionFixture.h"
#include <QGraphicsView>
#include <QMouseEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QSignalSpy>
#include <QDir>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
QJsonObject workflow(const QString &type,const QJsonArray &edges={},const QJsonArray &extra={}) {
  QJsonArray nodes{body_fixture::node("origin","Fixed",100),body_fixture::node("target",type,500)};
  for (const auto &value:extra) { nodes.append(value); }
  return {{"graph",QJsonObject{{"nodes",nodes},{"edges",edges}}}};
}
void drag(QGraphicsView &view,const QPoint &start,const QPoint &drop) {
  QTest::mousePress(view.viewport(),Qt::LeftButton,Qt::NoModifier,start);
  QMouseEvent move(QEvent::MouseMove,QPointF(drop),QPointF(view.viewport()->mapToGlobal(drop)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
  QApplication::sendEvent(view.viewport(),&move);
  QTest::mouseRelease(view.viewport(),Qt::LeftButton,Qt::NoModifier,drop);
}
struct Host {
  EditorWindow window;
  QGraphicsView *view=nullptr;
  WorkflowGraphModel *model=nullptr;
  CompatibleNodePicker *picker=nullptr;
  explicit Host(const QJsonObject &snapshot) {
    window.setCatalog(body_fixture::catalog()); const auto loaded=window.document()->load(snapshot); Q_ASSERT(loaded.ok);
    window.show(); window.selectNode("origin"); window.action("Reset zoom"); QTest::qWait(80);
    view=window.findChild<QGraphicsView *>(); model=&static_cast<WorkflowGraphModel &>(window.scene()->graphModel()); picker=window.findChild<CompatibleNodePicker *>();
    view->fitInView(window.scene()->itemsBoundingRect().adjusted(-48,-48,48,48),Qt::KeepAspectRatio);
  }
  QPoint port(const QString &resource,PortType side) const {
    const auto id=picker_fixture::id(*model,resource);
    return view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,side,0));
  }
  QPoint body(const QString &resource) const {
    return view->mapFromScene(window.scene()->nodeGraphicsObject(picker_fixture::id(*model,resource))->sceneBoundingRect().center());
  }
};
}
class BodyDropHostTest final : public QObject {
  Q_OBJECT
private slots:
  void reconnectInvalidTargetDeletesWithUndoAtZoom() {
    const QJsonObject original{{"id","original"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"},{"future",42}};
    for (const double zoom : {0.5, 1.0, 1.5}) {
      Host h(workflow("Sink",QJsonArray{original},QJsonArray{body_fixture::node("invalid","FloatOnly",500,350)}));
      h.view->resetTransform(); h.view->scale(zoom,zoom);
      h.view->centerOn(h.window.scene()->itemsBoundingRect().center());
      const auto before=h.window.document()->snapshot();
      const auto start=h.port("target",PortType::In),end=h.port("invalid",PortType::In);
      QVERIFY(h.view->viewport()->rect().contains(start)); QVERIFY(h.view->viewport()->rect().contains(end));
      drag(*h.view,start,end);
      QTRY_VERIFY(h.window.document()->edges().isEmpty());
      QCOMPARE(h.window.document()->undoStack()->count(),1);
      h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
      QTRY_VERIFY(h.window.scene()->reconnectingEdgeId().isEmpty());
    }
  }
  void successfulTargetReconnectPreservesEdge() {
    const QJsonObject prior{{"id","original"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"},{"future",QJsonObject{{"label","keep"}}}};
    Host h(workflow("Sink",QJsonArray{prior},QJsonArray{body_fixture::node("next","SinkHandle",500,350)}));
    const auto before=h.window.document()->snapshot();
    drag(*h.view,h.port("target",PortType::In),h.port("next",PortType::In));
    QTRY_COMPARE(h.window.document()->edges().size(),1);
    QTRY_COMPARE(h.window.document()->edges().first().toObject()["target"].toString(),QString("next"));
    auto expected=prior; expected["target"]="next";
    QCOMPARE(h.window.document()->edges().first().toObject(),expected);
    QCOMPARE(h.window.document()->undoStack()->count(),1);
    const auto capture=qEnvironmentVariable("NODETOOL_RECONNECT_CAPTURE");
    if (!capture.isEmpty()) {
      QVERIFY(QDir().mkpath(capture));
      QTest::qWait(60);
      QVERIFY(h.window.grab().save(capture+"/reconnected-graph.png"));
    }
    h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
  }
  void selectedOutputBodyScalarAndCollectOneUndo() {
    for (const auto &type:{QString("Sink"),QString("Collect")}) {
      const QJsonObject prior{{"id","old"},{"source","older"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"},{"future",99}};
      Host h(workflow(type,QJsonArray{prior},QJsonArray{body_fixture::node("older","Fixed",100,350)}));
      QVERIFY(h.view); QVERIFY(h.picker); const auto before=h.window.document()->snapshot();
      const auto start=h.port("origin",PortType::Out),target=h.body("target");
      QVERIFY(h.view->viewport()->rect().contains(start)); QVERIFY(h.view->viewport()->rect().contains(target));
      QSignalSpy dropped(h.window.scene(),&EditorScene::wireBodyDropped);
      drag(*h.view,start,target); QCOMPARE(dropped.count(),1);
      QTRY_COMPARE(h.window.document()->edges().size(),type=="Collect" ? 2:1);
      QCOMPARE(h.window.document()->edges().last().toObject()["source"].toString(),QString("origin"));
      QCOMPARE(h.window.document()->undoStack()->count(),1);
      QVERIFY(h.window.document()->node("target")["ui_properties"].toObject()["exposed_inputs"].toArray().contains("message"));
      h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
    }
  }
  void ambiguousBodyPickerKeyboardAndSourceInvalidation() {
    Host h(workflow("Receiver")); const auto before=h.window.document()->snapshot();
    drag(*h.view,h.port("origin",PortType::Out),h.body("target")); QTRY_VERIFY(h.picker->active()); QCOMPARE(h.picker->rows().size(),3);
    auto popup=h.picker->widget(); QVERIFY(popup); QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClicks(popup,"prompt"); QTest::keyClick(popup,Qt::Key_Return);
    QTRY_COMPARE(h.window.document()->edges().size(),1); QCOMPARE(h.window.document()->edges().first().toObject()["targetHandle"].toString(),QString("prompt"));
    QCOMPARE(h.window.document()->undoStack()->count(),1); h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
    QVERIFY(h.window.selectNode("origin"));
    drag(*h.view,h.port("origin",PortType::Out),h.body("target")); QTRY_VERIFY(h.picker->active()); const auto generation=h.picker->generation();
    h.window.session()->credentialsChanged(QUrl{}, {},"new-account"); QVERIFY(!h.picker->active());
    h.picker->choose("prompt",generation); QCOMPARE(h.window.document()->snapshot(),before);
  }
  void inputToExistingProducerChoosesExplicitOutput() {
    Host h(workflow("Producer")); const auto before=h.window.document()->snapshot();
    QSignalSpy dropped(h.window.scene(),&EditorScene::wireBodyDropped);
    drag(*h.view,h.port("origin",PortType::In),h.body("target")); QCOMPARE(dropped.count(),1); QTRY_VERIFY(h.picker->active()); QCOMPARE(h.picker->rows().size(),3);
    auto popup=h.picker->widget(); QVERIFY(popup); QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClicks(popup,"other"); QTest::keyClick(popup,Qt::Key_Return);
    QTRY_COMPARE(h.window.document()->edges().size(),1); const auto edge=h.window.document()->edges().first().toObject();
    QCOMPARE(edge["source"].toString(),QString("target")); QCOMPARE(edge["sourceHandle"].toString(),QString("other")); QCOMPARE(edge["target"].toString(),QString("origin"));
    QCOMPARE(h.window.document()->undoStack()->count(),1); h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
  }
  void dynamicInputAndOutputBodyDrops() {
    for (const bool output:{false,true}) {
      Host h(workflow(output ? "DynamicOut":"DynamicIn")); const auto before=h.window.document()->snapshot();
      const auto start=h.port("origin",output ? PortType::In:PortType::Out);
      QSignalSpy dropped(h.window.scene(),&EditorScene::wireBodyDropped);
      drag(*h.view,start,h.body("target")); QCOMPARE(dropped.count(),1);
      QTRY_COMPARE(h.window.document()->edges().size(),1);
      const auto edge=h.window.document()->edges().first().toObject();
      const auto handle=edge[output ? "sourceHandle":"targetHandle"].toString(); QCOMPARE(handle,QString("Fixed_1"));
      const auto target=h.window.document()->node("target"); QVERIFY(target[output ? "dynamic_outputs":"dynamic_inputs"].toObject().contains(handle));
      QCOMPARE(h.window.document()->undoStack()->count(),1); h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
    }
  }
  void invalidPhysicalHandleAndCycleDoNotLeaveSlots() {
    Host h(workflow("DynamicIn")); const auto before=h.window.document()->snapshot();
    QSignalSpy dropped(h.window.scene(),&EditorScene::wireBodyDropped);
    drag(*h.view,h.port("origin",PortType::Out),h.port("target",PortType::In));
    QApplication::processEvents(); QCOMPARE(dropped.count(),0); QCOMPARE(h.window.document()->snapshot(),before); QCOMPARE(h.window.document()->undoStack()->count(),0);
    const QJsonObject back{{"id","back"},{"source","target"},{"target","origin"},{"sourceHandle","out"},{"targetHandle","in"}};
    Host cycle(workflow("DynamicIn",QJsonArray{back})); const auto baseline=cycle.window.document()->snapshot();
    drag(*cycle.view,cycle.port("origin",PortType::Out),cycle.body("target"));
    QApplication::processEvents(); QCOMPARE(cycle.window.document()->snapshot(),baseline); QCOMPARE(cycle.window.document()->undoStack()->count(),0);
  }
  void draggedWireDrawsAboveEveryCard() {
    Host h(workflow("Sink",QJsonArray{}));
    QVERIFY(h.window.selectNode("target"));
    QTest::mousePress(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.port("origin",PortType::Out));
    auto draft=qgraphicsitem_cast<ConnectionGraphicsObject *>(h.window.scene()->mouseGrabberItem()); QVERIFY(draft);
    const auto move=h.view->viewport()->rect().center();
    QMouseEvent event(QEvent::MouseMove,QPointF(move),QPointF(h.view->viewport()->mapToGlobal(move)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
    QApplication::sendEvent(h.view->viewport(),&event);
    for (const auto id:h.model->allNodeIds()) {
      QVERIFY(draft->zValue()>h.window.scene()->nodeGraphicsObject(id)->zValue());
    }
    QTest::mouseRelease(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,move); QApplication::processEvents();
  }
  void midDragAccountAndSameIdWorkflowReplacementCancel() {
    const QJsonObject prior{{"id","old"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"}};
    Host h(workflow("Sink",QJsonArray{prior}));
    QVERIFY(h.window.selectNode("target"));
    auto before=h.window.document()->snapshot();
    QTest::mousePress(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.port("target",PortType::In));
    QVERIFY(qgraphicsitem_cast<ConnectionGraphicsObject *>(h.window.scene()->mouseGrabberItem()));
    h.window.session()->credentialsChanged(QUrl{}, {},"switched-account");
    const auto move=h.view->viewport()->rect().center();
    QMouseEvent event(QEvent::MouseMove,QPointF(move),QPointF(h.view->viewport()->mapToGlobal(move)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
    QApplication::sendEvent(h.view->viewport(),&event);
    QTest::mouseRelease(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,move); QApplication::processEvents();
    QCOMPARE(h.window.document()->snapshot(),before); QCOMPARE(h.window.document()->undoStack()->count(),0);
    auto source=picker_fixture::id(*h.model,"origin");
    QCOMPARE(h.model->allConnectionIds(source).size(),size_t(1));
    QVERIFY(h.window.scene()->connectionGraphicsObject(*h.model->allConnectionIds(source).begin()));
    QVERIFY(h.window.selectNode("target"));
    QTest::mousePress(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.port("target",PortType::In));
    QVERIFY(qgraphicsitem_cast<ConnectionGraphicsObject *>(h.window.scene()->mouseGrabberItem()));
    auto graph=before["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto origin=nodes[0].toObject();
    auto ui=origin["ui_properties"].toObject(); auto position=ui["position"].toObject(); position["x"]=200; ui["position"]=position;
    origin["ui_properties"]=ui; origin["data"]=QJsonObject{{"new-source",true}}; nodes[0]=origin; graph["nodes"]=nodes; before["graph"]=graph;
    QVERIFY(h.window.document()->load(before));
    QTRY_COMPARE(h.model->nodeData(picker_fixture::id(*h.model,"origin"),NodeRole::Position).toPointF().x(),200.0);
    QApplication::sendEvent(h.view->viewport(),&event); QTest::mouseRelease(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,move); QApplication::processEvents();
    QCOMPARE(h.window.document()->snapshot(),before); QCOMPARE(h.window.document()->undoStack()->count(),0); QVERIFY(!h.picker->active());
    source=picker_fixture::id(*h.model,"origin"); QVERIFY(h.window.scene()->connectionGraphicsObject(*h.model->allConnectionIds(source).begin()));
  }
  void reconnectPaneDropDeletesWithUndo() {
    const QJsonObject prior{{"id","old"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"}};
    Host h(workflow("Sink",QJsonArray{prior})); const auto before=h.window.document()->snapshot();
    QVERIFY(h.window.selectNode("target")); const auto id=picker_fixture::id(*h.model,"target");
    const auto bounds=h.window.scene()->nodeGraphicsObject(id)->sceneBoundingRect();
    const auto drop=h.view->mapFromScene(QPointF(bounds.center().x(),bounds.bottom()+80));
    QSignalSpy body(h.window.scene(),&EditorScene::wireBodyDropped),pane(h.window.scene(),&EditorScene::looseWireDropped);
    drag(*h.view,h.port("target",PortType::In),drop); QApplication::processEvents();
    QCOMPARE(body.count(),0); QCOMPARE(pane.count(),0); QVERIFY(!h.picker->active());
    QTRY_VERIFY(h.window.document()->edges().isEmpty()); QCOMPARE(h.window.document()->undoStack()->count(),1);
    h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
  }
  void reconnectOccupiedScalarCollectAndSameHandle() {
    for (const auto &type : {QString("Sink"), QString("Collect")}) {
      const QJsonObject original{{"id","original"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"},{"future",42}};
      const QJsonObject occupant{{"id","occupant"},{"source","older"},{"target","next"},{"sourceHandle","out"},{"targetHandle","message"}};
      Host h(workflow(type,QJsonArray{original,occupant},QJsonArray{body_fixture::node("next",type,500,350),body_fixture::node("older","Fixed",100,350)}));
      const auto before=h.window.document()->snapshot();
      drag(*h.view,h.port("target",PortType::In),h.port("target",PortType::In));
      QCoreApplication::processEvents(); QCOMPARE(h.window.document()->snapshot(),before); QCOMPARE(h.window.document()->undoStack()->count(),0);
      drag(*h.view,h.port("target",PortType::In),h.port("next",PortType::In));
      QTRY_COMPARE(h.window.document()->undoStack()->count(),1);
      QCOMPARE(h.window.document()->edges().size(),type=="Collect" ? 2:1);
      auto moved=original; moved["target"]="next";
      QVERIFY(h.window.document()->edges().contains(moved));
      h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before);
    }
  }
  void selectedWireSourceReconnectAndEscape() {
    const QJsonObject original{{"id","original"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"},{"future",42}};
    Host h(workflow("Sink",QJsonArray{original},QJsonArray{body_fixture::node("next","Fixed",100,350)}));
    const auto before=h.window.document()->snapshot();
    const auto source=picker_fixture::id(*h.model,"origin");
    auto wire=h.window.scene()->connectionGraphicsObject(*h.model->allConnectionIds(source).begin()); QVERIFY(wire);
    const auto out=h.window.scene()->nodeGraphicsObject(source)->scenePos()+h.window.scene()->nodeGeometry().portPosition(source,PortType::Out,0);
    const auto target=picker_fixture::id(*h.model,"target");
    const auto in=h.window.scene()->nodeGraphicsObject(target)->scenePos()+h.window.scene()->nodeGeometry().portPosition(target,PortType::In,0);
    QTest::mouseClick(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.view->mapFromScene(wireCurve(out,in).pointAtPercent(.5)));
    QVERIFY(wire->isSelected());
    drag(*h.view,h.port("origin",PortType::Out),h.port("next",PortType::Out));
    QTRY_COMPARE(h.window.document()->undoStack()->count(),1);
    auto moved=original; moved["source"]="next";
    QCOMPARE(h.window.document()->edges().first().toObject(),moved);
    h.window.action("Undo"); QCOMPARE(h.window.document()->snapshot(),before); QTest::qWait(20);
    QTest::mousePress(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.port("target",PortType::In));
    QVERIFY(!h.window.scene()->reconnectingEdgeId().isEmpty());
    QTest::keyClick(h.view->viewport(),Qt::Key_Escape);
    QTest::mouseRelease(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,h.view->viewport()->rect().center());
    QCoreApplication::processEvents(); QCOMPARE(h.window.document()->snapshot(),before); QCOMPARE(h.window.document()->undoStack()->index(),0);
  }
  // F03: while a wire is dragged each handle shows whether it accepts it, and
  // the styling ends with the drag (web NodeOutput.tsx:105-122,
  // PropertyField.tsx:148-158, styles/handle_edge_tooltip.css:62-78, :121-126).
  void dragMarksConnectableHandles() {
    Host h(workflow("SinkHandle",{},QJsonArray{body_fixture::node("float","FloatOnly",500,350)}));
    auto scene=h.window.scene();
    // No selection, so branch dimming does not mask the handle styling.
    scene->clearSelection();
    QTest::qWait(20);
    const auto origin=picker_fixture::id(*h.model,"origin");
    const auto target=picker_fixture::id(*h.model,"target");
    const auto number=picker_fixture::id(*h.model,"float");
    QCOMPARE(scene->handleConnectable(target,PortType::In,0),0);
    const auto start=h.port("origin",PortType::Out);
    const auto pane=h.view->mapFromScene(QPointF(300,700));
    QTest::mousePress(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,start);
    QMouseEvent move(QEvent::MouseMove,QPointF(pane),QPointF(h.view->viewport()->mapToGlobal(pane)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
    QApplication::sendEvent(h.view->viewport(),&move);
    QCOMPARE(scene->draftEnd().node,origin);
    QCOMPARE(scene->handleConnectable(origin,PortType::Out,0),1);
    QCOMPARE(scene->handleConnectable(target,PortType::In,0),1);
    QCOMPARE(scene->handleConnectable(number,PortType::In,0),-1);
    QCOMPARE(scene->handleConnectable(origin,PortType::In,0),-1);
    QCOMPARE(scene->handleConnectable(target,PortType::Out,0),-1);
    const auto capture=qEnvironmentVariable("NODETOOL_RECONNECT_CAPTURE");
    if (!capture.isEmpty()) {
      QVERIFY(QDir().mkpath(capture));
      h.view->viewport()->repaint();
      QTest::qWait(40);
      QVERIFY(h.window.grab().save(QDir(capture).filePath("connecting-dark.png")));
      h.window.setDarkTheme(false);
      h.view->viewport()->repaint();
      QTest::qWait(40);
      QVERIFY(h.window.grab().save(QDir(capture).filePath("connecting-light.png")));
      h.window.setDarkTheme(true);
    }
    QTest::mouseRelease(h.view->viewport(),Qt::LeftButton,Qt::NoModifier,pane);
    QTRY_VERIFY(h.picker->active());
    QCOMPARE(scene->handleConnectable(target,PortType::In,0),0);
    h.picker->cancel();
    QCOMPARE(h.window.document()->undoStack()->count(),0);
  }
  // A wire released on a handle that rejects it reports the refusal and adds
  // nothing (web useConnectionHandlers.ts:333-352).
  void refusedHandleReleaseReportsAndAddsNothing() {
    Host h(workflow("SinkHandle",{},QJsonArray{body_fixture::node("float","FloatOnly",500,350)}));
    const auto before=h.window.document()->snapshot();
    QSignalSpy refused(h.window.scene(),&EditorScene::connectionRefused);
    QSignalSpy body(h.window.scene(),&EditorScene::wireBodyDropped);
    drag(*h.view,h.port("origin",PortType::Out),h.port("float",PortType::In));
    QApplication::processEvents();
    QCOMPARE(refused.count(),1);
    QCOMPARE(body.count(),0);
    QCOMPARE(h.window.message(),QString("Cannot connect these handles"));
    QVERIFY(!h.picker->active());
    QCOMPARE(h.window.document()->snapshot(),before);
    QCOMPARE(h.window.document()->undoStack()->count(),0);
    drag(*h.view,h.port("origin",PortType::Out),h.port("target",PortType::In));
    QTRY_COMPARE(h.window.document()->edges().size(),1);
    QCOMPARE(refused.count(),1);
  }
  // A middle click on a wire deletes it with one undo entry. A middle drag
  // that starts on the wire pans and keeps it (web useEdgeHandlers.ts:116-126).
  void middleClickDeletesWire() {
    const QJsonObject edge{{"id","wire"},{"source","origin"},{"target","target"},{"sourceHandle","out"},{"targetHandle","message"}};
    Host h(workflow("SinkHandle",QJsonArray{edge}));
    const auto before=h.window.document()->snapshot();
    const auto midpoint=[&] {
      const auto source=picker_fixture::id(*h.model,"origin");
      const auto target=picker_fixture::id(*h.model,"target");
      const auto out=h.window.scene()->nodeGraphicsObject(source)->scenePos()+h.window.scene()->nodeGeometry().portPosition(source,PortType::Out,0);
      const auto in=h.window.scene()->nodeGraphicsObject(target)->scenePos()+h.window.scene()->nodeGeometry().portPosition(target,PortType::In,0);
      return h.view->mapFromScene(wireCurve(out,in).pointAtPercent(.5));
    };
    auto point=midpoint();
    QTest::mousePress(h.view->viewport(),Qt::MiddleButton,Qt::NoModifier,point);
    const auto moved=point+QPoint(40,30);
    QMouseEvent pan(QEvent::MouseMove,QPointF(moved),QPointF(h.view->viewport()->mapToGlobal(moved)),Qt::NoButton,Qt::MiddleButton,Qt::NoModifier);
    QApplication::sendEvent(h.view->viewport(),&pan);
    QTest::mouseRelease(h.view->viewport(),Qt::MiddleButton,Qt::NoModifier,moved);
    QCOMPARE(h.window.document()->edges().size(),1);
    point=midpoint();
    QTest::mouseClick(h.view->viewport(),Qt::MiddleButton,Qt::NoModifier,point);
    QTRY_VERIFY(h.window.document()->edges().isEmpty());
    QCOMPARE(h.window.document()->undoStack()->count(),1);
    h.window.action("Undo");
    QCOMPARE(h.window.document()->snapshot(),before);
  }
};
QTEST_MAIN(BodyDropHostTest)
#include "BodyDropHostTest.moc"
