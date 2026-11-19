#include "../support/OverlayProbe.h"
#include "../support/CanvasProbe.h"
#include "ui/EditorWindow.h"
#include "canvas/CanvasStyle.h"
#include "graph/CompatibleNodePicker.h"
#include "graph/CompatibleNodePlacement.h"
#include "../graph/CompatiblePickerFixture.h"
#include <QMouseEvent>
#include <QContextMenuEvent>
#include <QQuickWidget>
#include <QQuickItem>
#include <QSignalSpy>
#include <QWindow>
#include <QWheelEvent>
#include <qtnodes/AbstractNodeGeometry.hpp>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
QQuickItem *findItem(QQuickItem *root,const QString &name) {
  if (root->objectName()==name) { return root; }
  for (auto child:root->childItems()) { if (auto found=findItem(child,name)) { return found; } }
  return nullptr;
}
QPoint emptyDrop(nodetool::CanvasSurface &view,NodeId id) {
  const auto bounds=view.nodeBounds(id);
  return view.mapFromScene(QPointF(bounds.center().x(),bounds.bottom()+64));
}
bool emptyAt(nodetool::CanvasSurface &view,const QPointF &point) {
  return view.nodeAt(view.mapFromScene(point))==InvalidNodeId;
}
void drag(nodetool::CanvasSurface &view,const QPoint &start,const QPoint &drop) {
  QTest::mousePress(&view.viewportWidget(),Qt::LeftButton,Qt::NoModifier,start);
  QMouseEvent move(QEvent::MouseMove,QPointF(drop),QPointF(view.viewportWidget().mapToGlobal(drop)),Qt::NoButton,Qt::LeftButton,Qt::NoModifier);
  QApplication::sendEvent(&view.viewportWidget(),&move);
  QTest::mouseRelease(&view.viewportWidget(),Qt::LeftButton,Qt::NoModifier,drop);
}
}
class CompatiblePickerHostTest final : public QObject {
  Q_OBJECT
private slots:
  void topLevelPointerDeliveryChoosesPopupRow() {
    EditorWindow window; window.setCatalog(picker_fixture::catalog());
    QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=&window.canvas(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker); QVERIFY(window.windowHandle());
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id=picker_fixture::id(model,"origin");
    const auto start=view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
    const auto drop=emptyDrop(*view,id);
    QVERIFY(emptyAt(*view,view->mapToScene(drop)));
    QSignalSpy loose(&window.scene()->interaction(), &nodetool::canvas::CanvasInteraction::looseWireDropped);
    drag(*view,start,drop); QCOMPARE(loose.count(),1); QTRY_VERIFY(picker->active());
    auto popup=test::overlay(window, "compatible-node-picker"); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    const auto baseline=window.document()->snapshot();
    const auto zoom = view->zoom();
    const auto selection=window.selection();
    const auto paddingGlobal=popup->mapToGlobal(popup->rootObject()->mapToScene(QPointF(5, popup->height()-5)).toPoint());
    const auto paddingWindow=window.windowHandle()->mapFromGlobal(paddingGlobal);
    QTest::mouseClick(window.windowHandle(),Qt::LeftButton,Qt::NoModifier,paddingWindow);
    QVERIFY(picker->active()); QCOMPARE(window.document()->snapshot(),baseline); QCOMPARE(window.selection(),selection);
    QWheelEvent wheel(QPointF(paddingWindow),QPointF(paddingGlobal),QPoint(),QPoint(0,-120),Qt::NoButton,Qt::NoModifier,Qt::NoScrollPhase,false);
    QApplication::sendEvent(window.windowHandle(),&wheel);
    QVERIFY(picker->active()); QCOMPARE(view->zoom(), zoom); QCOMPARE(window.document()->snapshot(),baseline); QCOMPARE(window.selection(),selection);
    popup->setFocus();
    auto search=popup->rootObject()->findChild<QQuickItem *>("compatible-search"); search->forceActiveFocus();
    QTest::keyClicks(popup->inputWidget(),"Receiver prompt"); QTRY_COMPARE(picker->rows().size(),2);
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
    catalog.append(QJsonObject{{"node_type","Zed"},{"title","Zed"},{"inline_fields",QJsonArray{"input"}},
      {"properties",QJsonArray{picker_fixture::slot("input",picker_fixture::type("str"))}},{"outputs",QJsonArray{}}});
    window.setCatalog(catalog); QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=&window.canvas(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto id=picker_fixture::id(model,"origin");
    const auto start=view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
    const auto toolbar = test::overlay(window, "Toolbar.qml", true);
    QVERIFY(toolbar);
    // Drop at the toolbar's left edge, so the popup opens across the centered toolbar.
    auto drop=emptyDrop(*view,id);
    drop.setX(view->viewportWidget().mapFromGlobal(toolbar->mapToGlobal(toolbar->rootObject()->mapToScene(QPointF()).toPoint())).x());
    QVERIFY(emptyAt(*view,view->mapToScene(drop)));
    drag(*view,start,drop); QTRY_VERIFY(picker->active());
    auto popup=test::overlay(window, "compatible-node-picker"); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QQuickItem *row=nullptr; QTRY_VERIFY((row=findItem(popup->rootObject(),"compatible-result-5")));
    const auto rowTop=popup->mapToGlobal(row->mapToScene(QPointF(0,0)).toPoint());
    const QRect rowRect(rowTop,QSize(int(row->width()),int(row->height())));
    const QRect toolbarRect(toolbar->mapToGlobal(toolbar->rootObject()->mapToScene(QPointF()).toPoint()),toolbar->size());
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
      auto view=&window.canvas(); auto picker=window.findChild<CompatibleNodePicker *>();
      QVERIFY(view); QVERIFY(picker);
      auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
      const auto id=picker_fixture::id(model,"origin"); QVERIFY(id!=InvalidNodeId);
      const auto start=view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,direction,0));
      const auto drop=emptyDrop(*view,id);
      QVERIFY(emptyAt(*view,view->mapToScene(drop)));
      QVERIFY(view->viewportWidget().rect().contains(start)); QVERIFY(view->viewportWidget().rect().contains(drop));
      const auto expected=view->mapToScene(drop);
      const auto baseline=window.document()->snapshot();
      QSignalSpy loose(&window.scene()->interaction(), &nodetool::canvas::CanvasInteraction::looseWireDropped);
      drag(*view,start,drop);
      QCOMPARE(loose.count(),1);
      QTRY_VERIFY(picker->active());
      QCOMPARE(window.document()->snapshot(),baseline);
      auto popup=test::overlay(window, "compatible-node-picker"); QVERIFY(popup);
      auto search=popup->rootObject()->findChild<QQuickItem *>("compatible-search"); QVERIFY(search);
      QTRY_VERIFY(search->hasActiveFocus());
      const auto capture=qEnvironmentVariable("NODETOOL_COMPATIBLE_CAPTURE");
      if (!capture.isEmpty() && direction==PortType::Out) {
        view->centerOn(window.canvas().nodeBounds(id).center()+QPointF(100,100));
        view->requestRepaint();
        view->viewportWidget().repaint();
        QTest::qWait(50); QVERIFY(window.grab().save(capture+"-dark.png"));
        window.setDarkTheme(false); QTest::qWait(50);
        QVERIFY(window.grab().save(capture+"-light.png"));
      }
      QTest::keyClicks(popup->inputWidget(),direction==PortType::Out ? "Receiver prompt":"Producer");
      QTRY_COMPARE(picker->rows().size(),direction==PortType::Out ? 2:1);
      QTest::keyClick(popup->inputWidget(),Qt::Key_Return);
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
    auto view=&window.canvas(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker); view->centerOn(QPointF(400, 300)); QTest::qWait(30);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto baseline=window.document()->snapshot();
    for (const bool ownHandle:{true,false}) {
      const auto id=picker_fixture::id(model,"origin");
      const auto start=view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
      const auto drop=ownHandle ? start:view->mapFromScene(QPointF(400,450));
      QVERIFY(view->viewportWidget().rect().contains(start)); QVERIFY(view->viewportWidget().rect().contains(drop));
      QSignalSpy loose(&window.scene()->interaction(), &nodetool::canvas::CanvasInteraction::looseWireDropped);
      if (ownHandle) { QTest::mouseClick(&view->viewportWidget(),Qt::LeftButton,Qt::NoModifier,start); }
      else { drag(*view,start,drop); }
      QCOMPARE(loose.count(),1); QTRY_VERIFY(picker->active());
      QCOMPARE(window.document()->snapshot(),baseline);
      auto popup=test::overlay(window, "compatible-node-picker"); QVERIFY(popup);
      QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
      QTest::keyClicks(popup->inputWidget(),"Receiver prompt"); QTest::keyClick(popup->inputWidget(),Qt::Key_Return);
      QTRY_COMPARE(window.document()->nodes().size(),3);
      const auto edge=window.document()->edges().first().toObject();
      const auto node=window.document()->node(edge["target"].toString());
      QVERIFY(!node.contains("parent_id"));
      QCOMPARE(window.document()->undoStack()->count(),1);
      window.action("Undo"); QCOMPARE(window.document()->snapshot(),baseline);
      QVERIFY(window.selectNode("origin")); view->centerOn(QPointF(400, 300)); QTest::qWait(20);
    }
  }
  void actualEscapeAndStaleAccountDocumentCallbacks() {
    EditorWindow window; window.setCatalog(picker_fixture::catalog());
    QVERIFY(window.document()->load(picker_fixture::workflow()));
    window.show(); QVERIFY(window.selectNode("origin")); window.action("Reset zoom"); QTest::qWait(80);
    auto view=&window.canvas(); auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view); QVERIFY(picker);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    auto open=[&] {
      const auto id=picker_fixture::id(model,"origin");
      const auto start=view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
      const auto drop=emptyDrop(*view,id);
      QVERIFY(emptyAt(*view,view->mapToScene(drop)));
      drag(*view,start,drop);
    };
    const auto baseline=window.document()->snapshot();
    open(); QTRY_VERIFY(picker->active());
    auto popup=test::overlay(window, "compatible-node-picker"); QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QTest::keyClick(popup->inputWidget(),Qt::Key_Escape); QTRY_VERIFY(!picker->active());
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
  // F03: a right-click on a handle opens its connection menu, as the web
  // NodeOutput.tsx:66-84 and PropertyField.tsx:165-180 handlers do. A dynamic
  // output's menu also deletes it with its wires (OutputContextMenu.tsx:93-124).
  void rightClickHandleOpensMenuAndDeletesDynamicOutput() {
    EditorWindow window;
    auto catalog=picker_fixture::catalog();
    catalog.append(QJsonObject{{"node_type","DynamicOut"},{"title","Dynamic out"},{"supports_dynamic_outputs",true},
      {"properties",QJsonArray{}},{"outputs",QJsonArray{}}});
    window.setCatalog(catalog);
    auto workflow=picker_fixture::workflow();
    auto graph=workflow["graph"].toObject();
    auto nodes=graph["nodes"].toArray();
    nodes.append(QJsonObject{{"id","dynamic"},{"type","DynamicOut"},{"data",QJsonObject{}},
      {"dynamic_outputs",QJsonObject{{"extra",QJsonObject{{"type","str"},{"optional",false},{"type_args",QJsonArray{}}}}}},
      {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",-300},{"y",100}}}}}});
    graph["nodes"]=nodes;
    graph["edges"]=QJsonArray{QJsonObject{{"id","wire"},{"source","dynamic"},{"sourceHandle","extra"},{"target","origin"},{"targetHandle","in"}}};
    workflow["graph"]=graph;
    QVERIFY(window.document()->load(workflow));
    window.show();
    QVERIFY(window.selectNode("origin"));
    window.action("Reset zoom");
    QTest::qWait(80);
    auto view=&window.canvas();
    auto picker=window.findChild<CompatibleNodePicker *>();
    QVERIFY(view);
    QVERIFY(picker);
    view->centerOn(QPointF(0,150));
    QTest::qWait(30);
    auto &model=static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    const auto baseline=window.document()->snapshot();
    const auto handle=[&](const QString &resource) {
      const auto id=picker_fixture::id(model,resource);
      return view->mapFromScene(window.canvas().nodeOrigin(id)+window.scene()->nodeGeometry().portPosition(id,PortType::Out,0));
    };
    QSignalSpy requested(&window.scene()->interaction(), &nodetool::canvas::CanvasInteraction::handleContextMenuRequested);
    const auto rightClick=[&](const QPoint &point) {
      QTest::mouseMove(&view->viewportWidget(),point);
      QContextMenuEvent menu(QContextMenuEvent::Mouse,point,view->viewportWidget().mapToGlobal(point));
      QApplication::sendEvent(&view->viewportWidget(),&menu);
    };
    // A static output offers compatible nodes and no delete action.
    rightClick(handle("origin"));
    QCOMPARE(requested.count(),1);
    QTRY_VERIFY(picker->active());
    QVERIFY(!picker->canDeleteOutput());
    auto popup=test::overlay(window, "compatible-node-picker");
    QVERIFY(popup);
    QTRY_VERIFY(popup->rootObject()->findChild<QQuickItem *>("compatible-search")->hasActiveFocus());
    QVERIFY(!picker->rows().isEmpty());
    const auto absent=findItem(popup->rootObject(),"compatible-delete-output");
    QVERIFY(!absent || !absent->isVisible());
    QTest::keyClick(popup->inputWidget(),Qt::Key_Escape);
    QTRY_VERIFY(!picker->active());
    QCOMPARE(window.document()->snapshot(),baseline);
    rightClick(handle("dynamic"));
    QCOMPARE(requested.count(),2);
    QTRY_VERIFY(picker->active());
    QVERIFY(picker->canDeleteOutput());
    popup=test::overlay(window, "compatible-node-picker");
    QVERIFY(popup);
    QQuickItem *remove=nullptr;
    QTRY_VERIFY((remove=findItem(popup->rootObject(),"compatible-delete-output")) && remove->isVisible());
    const auto capture=qEnvironmentVariable("NODETOOL_COMPATIBLE_CAPTURE");
    if (!capture.isEmpty()) {
      QTest::qWait(50);
      QVERIFY(window.grab().save(capture+"-handle-menu-dark.png"));
      window.setDarkTheme(false);
      QTest::qWait(50);
      QVERIFY(window.grab().save(capture+"-handle-menu-light.png"));
      window.setDarkTheme(true);
      QTest::qWait(30);
    }
    // A search hides the action, as the web menu shows it only with an empty search.
    popup->setFocus();
    popup->rootObject()->findChild<QQuickItem *>("compatible-search")->forceActiveFocus();
    QTest::keyClicks(popup->inputWidget(),"Rec");
    // The fixed rows leave the menu while the search has text.
    QTRY_VERIFY(picker->fixedRows().isEmpty());
    QTRY_VERIFY(!findItem(popup->rootObject(),"compatible-delete-output"));
    QTest::keyClick(popup->inputWidget(),Qt::Key_Backspace);
    QTest::keyClick(popup->inputWidget(),Qt::Key_Backspace);
    QTest::keyClick(popup->inputWidget(),Qt::Key_Backspace);
    QTRY_VERIFY((remove=findItem(popup->rootObject(),"compatible-delete-output")) && remove->isVisible());
    QTest::qWait(30);
    const auto global=popup->mapToGlobal(remove->mapToScene(QPointF(remove->width()/2,remove->height()/2)).toPoint());
    QTest::mouseClick(window.windowHandle(),Qt::LeftButton,Qt::NoModifier,window.windowHandle()->mapFromGlobal(global));
    QTRY_VERIFY(!window.document()->node("dynamic")["dynamic_outputs"].toObject().contains("extra"));
    QVERIFY(window.document()->edges().isEmpty());
    QVERIFY(!picker->active());
    QCOMPARE(window.document()->undoStack()->count(),1);
    window.action("Undo");
    QCOMPARE(window.document()->snapshot(),baseline);
  }
};
QTEST_MAIN(CompatiblePickerHostTest)
#include "CompatiblePickerHostTest.moc"
