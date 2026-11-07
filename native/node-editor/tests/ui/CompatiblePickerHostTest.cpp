#include "ui/EditorWindow.h"
#include "graph/EditorScene.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/CompatibleNodePlacement.h"
#include "../graph/CompatiblePickerFixture.h"
#include <QGraphicsView>
#include <QMouseEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QSignalSpy>
#include <QWindow>
#include <QWheelEvent>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
QQuickItem *findItem(QQuickItem *root,const QString &name) {
  if (root->objectName()==name) { return root; }
  for (auto child:root->childItems()) { if (auto found=findItem(child,name)) { return found; } }
  return nullptr;
}
QPoint emptyDrop(QGraphicsView &view,EditorScene &scene,NodeId id) {
  const auto bounds=scene.nodeGraphicsObject(id)->sceneBoundingRect();
  return view.mapFromScene(QPointF(bounds.center().x(),bounds.bottom()+64));
}
bool emptyAt(EditorScene &scene,const QPointF &point) {
  for (auto item:scene.items(point)) { if (qgraphicsitem_cast<NodeGraphicsObject *>(item)) { return false; } }
  return true;
}
void drag(QGraphicsView &view,const QPoint &start,const QPoint &drop) {
  QTest::mousePress(view.viewport(),Qt::LeftButton,Qt::NoModifier,start);
  QMouseEvent move(QEvent::MouseMove,QPointF(drop),QPointF(view.viewport()->mapToGlobal(drop)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
  QApplication::sendEvent(view.viewport(),&move);
  QTest::mouseRelease(view.viewport(),Qt::LeftButton,Qt::NoModifier,drop);
}
}
class CompatiblePickerHostTest final : public QObject {
  Q_OBJECT
private slots:
  void topLevelPointerDeliveryChoosesPopupRow() {
    EditorWindow window; window.setCatalog(picker_fixture::catalog());
    QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=window.findChild<QGraphicsView *>(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker); QVERIFY(window.windowHandle());
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id=picker_fixture::id(model,"origin");
    const auto start=view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
    const auto drop=emptyDrop(*view,*window.scene(),id);
    QVERIFY(emptyAt(*window.scene(),view->mapToScene(drop)));
    QSignalSpy loose(window.scene(),&EditorScene::looseWireDropped);
    drag(*view,start,drop); QCOMPARE(loose.count(),1); QTRY_VERIFY(picker->active());
    auto popup=picker->widget(); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    const auto baseline=window.document()->snapshot();
    const auto transform=view->transform();
    const auto selection=window.selection();
    const auto paddingGlobal=popup->mapToGlobal(QPoint(5,popup->height()-5));
    const auto paddingWindow=window.windowHandle()->mapFromGlobal(paddingGlobal);
    QTest::mouseClick(window.windowHandle(),Qt::LeftButton,Qt::NoModifier,paddingWindow);
    QVERIFY(picker->active()); QCOMPARE(window.document()->snapshot(),baseline); QCOMPARE(window.selection(),selection);
    QWheelEvent wheel(QPointF(paddingWindow),QPointF(paddingGlobal),QPoint(),QPoint(0,-120),Qt::NoButton,Qt::NoModifier,Qt::NoScrollPhase,false);
    QApplication::sendEvent(window.windowHandle(),&wheel);
    QVERIFY(picker->active()); QCOMPARE(view->transform(),transform); QCOMPARE(window.document()->snapshot(),baseline); QCOMPARE(window.selection(),selection);
    popup->setFocus();
    auto search=popup->rootObject()->findChild<QQuickItem *>("compatible-search"); search->forceActiveFocus();
    QTest::keyClicks(popup,"Receiver prompt"); QTRY_COMPARE(picker->rows().size(),1);
    QTest::qWait(30);
    QQuickItem *row=nullptr;
    QTRY_VERIFY((row=findItem(popup->rootObject(),"compatible-result-0")));
    const auto global=popup->mapToGlobal(row->mapToScene(QPointF(row->width()/2,row->height()/2)).toPoint());
    QTest::mouseClick(window.windowHandle(),Qt::LeftButton,Qt::NoModifier,window.windowHandle()->mapFromGlobal(global));
    QTest::qWait(50);
    QTRY_COMPARE(window.document()->nodes().size(),2);
    QCOMPARE(window.document()->edges().size(),1);
    QCOMPARE(window.document()->undoStack()->count(),1);
  }
  void lowerPopupRowStaysAboveRunToolbar() {
    EditorWindow window;
    auto catalog=picker_fixture::catalog();
    catalog.append(QJsonObject{{"node_type","Zed"},{"title","Zed"},
      {"properties",QJsonArray{picker_fixture::slot("input",picker_fixture::type("str"))}},{"outputs",QJsonArray{}}});
    window.setCatalog(catalog); QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=window.findChild<QGraphicsView *>(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id=picker_fixture::id(model,"origin");
    const auto start=view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
    drag(*view,start,emptyDrop(*view,*window.scene(),id)); QTRY_VERIFY(picker->active());
    auto popup=picker->widget(); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QQuickItem *row=nullptr; QTRY_VERIFY((row=findItem(popup->rootObject(),"compatible-result-5")));
    QQuickWidget *toolbar=nullptr;
    for (auto candidate:window.findChildren<QQuickWidget *>()) {
      if (candidate->isVisible() && candidate->source().path().endsWith("/Toolbar.qml")) { toolbar=candidate; break; }
    }
    QVERIFY(toolbar);
    const auto rowTop=popup->mapToGlobal(row->mapToScene(QPointF(0,0)).toPoint());
    const QRect rowRect(rowTop,QSize(int(row->width()),int(row->height())));
    const QRect toolbarRect(toolbar->mapToGlobal(QPoint()),toolbar->size());
    const auto overlap=rowRect.intersected(toolbarRect); QVERIFY(!overlap.isEmpty());
    QTest::mouseClick(window.windowHandle(),Qt::LeftButton,Qt::NoModifier,window.windowHandle()->mapFromGlobal(overlap.center()));
    QTRY_COMPARE(window.document()->nodes().size(),2);
    const auto edge=window.document()->edges().first().toObject();
    QCOMPARE(window.document()->node(edge["target"].toString())["type"].toString(),QString("Zed"));
    QCOMPARE(window.document()->undoStack()->count(),1);
  }
  void outputAndInputLooseDropCreateCanonicalBatch() {
    for (const auto direction:{PortType::Out,PortType::In}) {
      EditorWindow window;
      window.setCatalog(picker_fixture::catalog());
      QVERIFY(window.document()->load(picker_fixture::workflow()));
      window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom");
      QTest::qWait(80); window.action("Zoom out"); QTest::qWait(30);
      auto view=window.findChild<QGraphicsView *>(); auto picker=window.findChild<CompatibleNodePicker *>();
      QVERIFY(view); QVERIFY(picker);
      auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
      const auto id=picker_fixture::id(model,"origin"); QVERIFY(id!=InvalidNodeId);
      const auto start=view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,direction,0));
      const auto drop=emptyDrop(*view,*window.scene(),id);
      QVERIFY(emptyAt(*window.scene(),view->mapToScene(drop)));
      QVERIFY(view->viewport()->rect().contains(start)); QVERIFY(view->viewport()->rect().contains(drop));
      const auto expected=view->mapToScene(drop);
      const auto baseline=window.document()->snapshot();
      QSignalSpy loose(window.scene(),&EditorScene::looseWireDropped);
      drag(*view,start,drop);
      QCOMPARE(loose.count(),1);
      QTRY_VERIFY(picker->active());
      QCOMPARE(window.document()->snapshot(),baseline);
      auto popup=picker->widget(); QVERIFY(popup);
      auto search=popup->rootObject()->findChild<QQuickItem *>("compatible-search"); QVERIFY(search);
      QTRY_VERIFY(search->hasActiveFocus());
      const auto capture=qEnvironmentVariable("NODETOOL_COMPATIBLE_CAPTURE");
      if (!capture.isEmpty() && direction==PortType::Out) {
        view->centerOn(window.scene()->nodeGraphicsObject(id)->sceneBoundingRect().center()+QPointF(100,100));
        view->invalidateScene(QRectF(),QGraphicsScene::AllLayers);
        view->viewport()->repaint();
        QTest::qWait(50); QVERIFY(window.grab().save(capture+"-dark.png"));
        window.setDarkTheme(false); QTest::qWait(50);
        QVERIFY(window.grab().save(capture+"-light.png"));
      }
      QTest::keyClicks(popup,direction==PortType::Out ? "Receiver prompt":"Producer");
      QTRY_COMPARE(picker->rows().size(),1);
      QTest::keyClick(popup,Qt::Key_Return);
      QTRY_COMPARE(window.document()->nodes().size(),2);
      QCOMPARE(window.document()->edges().size(),1);
      const auto edge=window.document()->edges().first().toObject();
      const auto newId=edge[direction==PortType::Out ? "target":"source"].toString();
      QCOMPARE(edge[direction==PortType::Out ? "source":"target"].toString(),QString("origin"));
      const auto position=window.document()->node(newId)["ui_properties"].toObject()["position"].toObject();
      const auto newNode=picker_fixture::id(model,newId);
      const auto &layout=model.layout(newNode);
      const auto desired=direction==PortType::Out
          ? QPointF(expected.x()+60,expected.y()-layout.inputY[2])
          : QPointF(expected.x()-40-layout.size.width(),expected.y()-layout.size.height()/2.0);
      const auto oldRect=QRectF(model.nodeData(id,NodeRole::Position).toPointF(),model.layout(id).size);
      const auto expectedY=compatibleNodeY(QRectF(desired,layout.size),{oldRect});
      QCOMPARE(QPointF(position["x"].toDouble(),position["y"].toDouble()),QPointF(desired.x(),expectedY));
      QVERIFY(!window.document()->node(newId).contains("parent_id"));
      if (direction==PortType::Out) { QCOMPARE(window.document()->node(newId)["data"].toObject()["prompt"].toString(),QString("hello")); }
      QCOMPARE(window.document()->undoStack()->count(),1);
      window.action("Undo"); QCOMPARE(window.document()->snapshot(),baseline);
    }
  }
  void ownHandleAndGroupBackdropKeepNewNodeRootLevel() {
    EditorWindow window; window.setCatalog(picker_fixture::catalog());
    auto workflow=picker_fixture::workflow(); auto graph=workflow["graph"].toObject(); auto nodes=graph["nodes"].toArray();
    nodes.append(QJsonObject{{"id","group"},{"type","nodetool.workflows.base_node.Group"},
      {"data",QJsonObject{{"headline","Backdrop"}}},
      {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",0},{"y",250}}},{"width",900},{"height",500}}}});
    graph["nodes"]=nodes; workflow["graph"]=graph;
    QVERIFY(window.document()->load(workflow)); window.show(); QVERIFY(window.selectNode("origin"));
    window.action("Reset zoom"); QTest::qWait(80);
    auto view=window.findChild<QGraphicsView *>(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker); view->centerOn(400,300); QTest::qWait(30);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto baseline=window.document()->snapshot();
    for (const bool ownHandle:{true,false}) {
      const auto id=picker_fixture::id(model,"origin");
      const auto start=view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
      const auto drop=ownHandle ? start:view->mapFromScene(QPointF(400,450));
      QVERIFY(view->viewport()->rect().contains(start)); QVERIFY(view->viewport()->rect().contains(drop));
      QSignalSpy loose(window.scene(),&EditorScene::looseWireDropped);
      if (ownHandle) { QTest::mouseClick(view->viewport(),Qt::LeftButton,Qt::NoModifier,start); }
      else { drag(*view,start,drop); }
      QCOMPARE(loose.count(),1); QTRY_VERIFY(picker->active());
      QCOMPARE(window.document()->snapshot(),baseline);
      auto popup=picker->widget(); QVERIFY(popup);
      QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
      QTest::keyClicks(popup,"Receiver prompt"); QTest::keyClick(popup,Qt::Key_Return);
      QTRY_COMPARE(window.document()->nodes().size(),3);
      const auto edge=window.document()->edges().first().toObject();
      const auto node=window.document()->node(edge["target"].toString());
      QVERIFY(!node.contains("parent_id"));
      QCOMPARE(window.document()->undoStack()->count(),1);
      window.action("Undo"); QCOMPARE(window.document()->snapshot(),baseline);
      QVERIFY(window.selectNode("origin")); view->centerOn(400,300); QTest::qWait(20);
    }
  }
  void actualEscapeAndStaleAccountDocumentCallbacks() {
    EditorWindow window; window.setCatalog(picker_fixture::catalog());
    QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=window.findChild<QGraphicsView *>(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    auto open=[&] {
      const auto id=picker_fixture::id(model,"origin");
      const auto start=view->mapFromScene(window.scene()->nodeGraphicsObject(id)->scenePos()+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
      const auto drop=emptyDrop(*view,*window.scene(),id);
      QVERIFY(emptyAt(*window.scene(),view->mapToScene(drop)));
      drag(*view,start,drop);
    };
    const auto baseline=window.document()->snapshot();
    open(); QTRY_VERIFY(picker->active());
    auto popup=picker->widget(); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClick(popup,Qt::Key_Escape); QTRY_VERIFY(!picker->active());
    QCOMPARE(window.document()->snapshot(),baseline); QCOMPARE(window.document()->undoStack()->count(),0);
    open(); QTRY_VERIFY(picker->active());
    const auto token=picker->generation(); const auto key=picker->rows().first().toMap()["key"].toString();
    window.session()->credentialsChanged(QUrl{}, {}, "other-account");
    QVERIFY(!picker->active());
    open(); QTRY_VERIFY(picker->active());
    picker->choose(key,token); picker->search("stale",token); picker->dismiss(token);
    QVERIFY(picker->active()); QVERIFY(picker->query().isEmpty()); QCOMPARE(window.document()->snapshot(),baseline);
    QVERIFY(window.document()->load(picker_fixture::workflow())); QVERIFY(!picker->active());
    picker->choose(key,token); QCOMPARE(window.document()->snapshot(),baseline);
    auto readOnly=picker_fixture::workflow(); auto graph=readOnly["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto node=nodes[0].toObject();
    node["dynamic_outputs"]="unsupported"; nodes[0]=node; graph["nodes"]=nodes; readOnly["graph"]=graph;
    QVERIFY(window.document()->load(readOnly));
    QVERIFY(window.document()->isReadOnly());
    const auto before=window.document()->snapshot();
    picker->open(picker_fixture::id(model,"origin"),PortType::Out,0,QPointF(400,300));
    QVERIFY(!picker->active()); QCOMPARE(window.document()->snapshot(),before);
  }
};
QTEST_MAIN(CompatiblePickerHostTest)
#include "CompatiblePickerHostTest.moc"
