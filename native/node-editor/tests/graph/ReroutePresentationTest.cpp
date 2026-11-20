#include "../support/OverlayCanvasFixture.h"
#include "../support/DarkCanvasTheme.h"
#include "graph/WorkflowGraphModel.h"
#include "canvas/CanvasStyle.h"
#include "graph/RerouteTypes.h"
#include <qtnodes/AbstractNodeGeometry.hpp>
#include <QJsonDocument>
#include <QPainter>
#include <QSignalSpy>
#include <QtTest>
using namespace nodetool;
using namespace QtNodes;
namespace {
QJsonObject slot(const QString &name,const QString &type) { return {{"name",name},{"type",QJsonObject{{"type",type}}}}; }
QJsonArray catalog() {
  return {QJsonObject{{"node_type","Source"},{"outputs",QJsonArray{slot("output","image")}}},
    QJsonObject{{"node_type","Sink"},{"properties",QJsonArray{slot("input","any")}}},
    QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{slot("input_value","any")}},{"outputs",QJsonArray{slot("output","any")}}},
    QJsonObject{{"node_type","nodetool.control.If"},{"properties",QJsonArray{slot("value","any")}},{"outputs",QJsonArray{slot("if_true","any"),slot("if_false","any")}}},
    QJsonObject{{"node_type","nodetool.control.Switch"},{"properties",QJsonArray{slot("input","any")}},{"outputs",QJsonArray{slot("matched","any"),slot("default","any")}}}};
}
QJsonObject node(const QString &id,const QString &type,double x=0,double y=0) {
  return {{"id",id},{"type",type},{"data",QJsonObject{{"input_value","not a visible field"}}},
    {"ui_properties",QJsonObject{{"position",QJsonObject{{"x",x},{"y",y}}},{"width",type=="nodetool.control.Reroute" ? 500:280},{"height",type=="nodetool.control.Reroute" ? 400:100},{"title","Reroute label"}}}};
}
QJsonObject edge(const QString &id,const QString &source,const QString &target,const QString &out="output",const QString &in="input_value") {
  return {{"id",id},{"source",source},{"target",target},{"sourceHandle",out},{"targetHandle",in},{"future",42}};
}
QJsonObject fixture() {
  return {{"nodes",QJsonArray{node("source","Source",-320,0),node("r1","nodetool.control.Reroute",0,100),node("r2","nodetool.control.Reroute",220,100),node("sink","Sink",440,0)}},
    {"edges",QJsonArray{edge("first","source","r1"),edge("second","r1","r2"),edge("third","r2","sink","output","input")}}};
}
NodeId id(const WorkflowGraphModel &model,const QString &name) {
  for (const auto n:model.allNodeIds()) { if (model.resourceId(n)==name) { return n; } }return InvalidNodeId;
}
}
class ReroutePresentationTest final : public QObject {
  Q_OBJECT
private slots:
  void exactPillAndCanonicalAnyPorts() {
    WorkflowGraphModel model;test::OverlayCanvasFixture host(model);auto &scene=host.surface().scene();const auto snapshot=fixture();model.project(snapshot,catalog());
    const auto route=id(model,"r1");const auto &layout=model.layout(route);
    QVERIFY(model.isReroute(route));QCOMPARE(layout.size,QSize(60,20));QCOMPARE(layout.minimumSize,QSize(60,20));QVERIFY(layout.rows.isEmpty());QVERIFY(layout.title.isEmpty());
    QCOMPARE(model.nodeSnapshot(route),snapshot["nodes"].toArray()[1].toObject());
    QCOMPARE(scene.nodeGeometry().portPosition(route,PortType::In,0),QPointF(0,10));
    QCOMPARE(scene.nodeGeometry().portPosition(route,PortType::Out,0),QPointF(60,10));
    QCOMPARE(scene.nodeGeometry().checkPortHit(route,PortType::In,{0,10}),PortIndex(0));
    QCOMPARE(scene.nodeGeometry().checkPortHit(route,PortType::Out,{60,10}),PortIndex(0));
    QCOMPARE(model.portData<QString>(route,PortType::In,0,PortRole::DataType),QString("any"));
    QVERIFY(!model.setNodeData(route,NodeRole::Size,QSize(200,300)));QCOMPARE(model.layout(route).size,QSize(60,20));
    QCOMPARE(model.rerouteHandleType(route),QString("image"));
    QCOMPARE(model.rerouteHandleType(id(model,"r2")),QString("any"));
    for (const auto &c:model.allConnectionIds(id(model,"r2"))) {
      QCOMPARE(model.wirePortColor(c,PortType::Out),typeColor("image"));
      if (model.isReroute(c.inNodeId)) { QCOMPARE(model.wirePortColor(c,PortType::In),typeColor("image")); }
      QVERIFY(!model.edge(c)["id"].toString().isEmpty());QCOMPARE(model.edge(c)["future"].toInt(),42);
    }
  }
  void indexedReversedChainsCyclesMissingAndDynamic() {
    QJsonArray nodes{node("source","Source")},edges;
    QString previous="source";
    for (int i=0;i<12000;++i) {
      const auto next="r"+QString::number(i);nodes.append(node(next,"nodetool.control.Reroute"));edges.prepend(edge(QString::number(i),previous,next));previous=next;
    }
    QElapsedTimer timer;timer.start();const auto types=resolveForwardDisplayTypes(nodes,edges,catalog());
    QCOMPARE(types.sources.value(displayPortKey(previous,"output")),QString("image"));
    QCOMPARE(types.rerouteHandles.value("r0"),QString("image"));QCOMPARE(types.rerouteHandles.value("r11999"),QString("any"));
    QVERIFY2(timer.elapsed()<10000,"Forward-chain projection must remain bounded on a reversed 12k chain");
    const auto cyclic=resolveForwardDisplayTypes(QJsonArray{node("a","nodetool.control.Reroute"),node("b","nodetool.control.Reroute")},QJsonArray{edge("a","a","b"),edge("b","b","a")},catalog());
    QCOMPARE(cyclic.sources.value(displayPortKey("a","output")),QString("any"));QCOMPARE(cyclic.sources.value(displayPortKey("b","output")),QString("any"));
    const auto missing=resolveForwardDisplayTypes(QJsonArray{node("r","nodetool.control.Reroute")},QJsonArray{edge("m","missing","r")},catalog());
    QCOMPARE(missing.sources.value(displayPortKey("r","output")),QString("any"));
    auto dynamic=node("source","Source");dynamic["dynamic_outputs"]=QJsonObject{{"movie",QJsonObject{{"type","video"}}},{"unknown",QJsonObject{{"type","future_type"}}},{"cache",QJsonObject{{"type","tjs_cached"}}}};
    const auto declared=resolveForwardDisplayTypes(QJsonArray{dynamic,node("r","nodetool.control.Reroute")},QJsonArray{edge("dynamic","source","r","movie")},catalog());
    QCOMPARE(declared.rerouteHandles.value("r"),QString("video"));QCOMPARE(declared.sources.value(displayPortKey("source","unknown")),QString("any"));
    QCOMPARE(declared.sources.value(displayPortKey("source","cache")),QString("tjs.cached"));
    const auto forwarded=resolveForwardDisplayTypes(QJsonArray{node("source","Source"),node("if","nodetool.control.If"),node("switch","nodetool.control.Switch"),node("r","nodetool.control.Reroute")},QJsonArray{edge("1","source","if","output","value"),edge("2","if","switch","if_true","input"),edge("3","switch","r","default")},catalog());
    QCOMPARE(forwarded.sources.value(displayPortKey("r","output")),QString("image"));
    QCOMPARE(forwarded.rerouteHandles.value("r"),QString("any"));
  }
  void nativePillDoubleClickMoveNoResizeAndPortDraft() {
    WorkflowGraphModel model;
    test::OverlayCanvasFixture host(model);
    auto &view = host.surface();
    auto &scene = view.scene();
    scene.setTheme(test::darkCanvasTheme());
    model.project(fixture(), catalog());
    host.show({1000, 600}, {200, 150});
    QApplication::processEvents();
    auto *viewport = &view.viewportWidget();
    const auto route = id(model, "r1");
    QVERIFY(view.hasNode(route));
    view.selection().setNode(route, true);
    QSignalSpy edit(&scene.interaction(), &canvas::CanvasInteraction::titleEditRequested);
    QSignalSpy loose(&scene.interaction(), &canvas::CanvasInteraction::looseWireDropped);
    const auto center = view.mapFromScene(view.mapFromNode(route, {30, 10}));
    QTest::mouseClick(viewport, Qt::LeftButton, Qt::NoModifier, center);
    QTest::mouseDClick(viewport, Qt::LeftButton, Qt::NoModifier, center);
    QCOMPARE(edit.count(), 1);
    QCOMPARE(edit[0][0].value<NodeId>(), route);
    const auto drag = [&](QPoint start, QPoint end) {
      QTest::mousePress(viewport, Qt::LeftButton, Qt::NoModifier, start);
      QTest::mouseMove(viewport, end);
      QTest::mouseRelease(viewport, Qt::LeftButton, Qt::NoModifier, end);
    };
    const auto start = view.mapFromScene(view.mapFromNode(route, {30, 18}));
    drag(start, start + QPoint(35, 20));
    QCOMPARE(model.layout(route).size, QSize(60, 20));
    QVERIFY(view.nodeOrigin(route) != QPointF(0, 100));
    drag(view.mapFromScene(view.mapFromNode(route, {60, 10})),
         view.mapFromScene(view.mapFromNode(route, {90, 90})));
    QCOMPARE(loose.count(), 1);
    QCOMPARE(model.layout(route).size, QSize(60, 20));
  }

  void contextOwnsCanonicalDataEdgeAndRejectsOthers() {
    for (const auto &kind : {QString("data"), QString("control"), QString("lineage"), QString("readonly")}) {
      WorkflowGraphModel model;
      test::OverlayCanvasFixture host(model);
      auto &view = host.surface();
      auto &scene = view.scene();
      scene.setTheme(test::darkCanvasTheme());
      auto snapshot = fixture();
      auto edges = snapshot["edges"].toArray();
      auto selected = edges[1].toObject();
      if (kind == "control" || kind == "lineage") { selected["edge_type"] = kind; }
      edges[1] = selected;
      snapshot["edges"] = edges;
      model.project(snapshot, catalog(), kind == "readonly");
      host.show({1000, 600}, {200, 150});
      const ConnectionId connection{id(model, "r1"), 0, id(model, "r2"), 0};
      const auto *wire = view.canvasScene().connectionItem(connection);
      QVERIFY(wire);
      const auto point = wireCurve(wire->endPoint(PortType::Out), wire->endPoint(PortType::In)).pointAtPercent(0.5);
      QSignalSpy request(&scene.interaction(), &canvas::CanvasInteraction::dataEdgeContextMenuRequested);
      const QPoint screen(123, 456);
      scene.interaction().contextMenu({.scenePosition = point, .screenPosition = screen});
      // Control edges open the edge menu without its reroute entry, as in EdgeContextMenu.tsx.
      QCOMPARE(request.count(), kind == "data" || kind == "control" ? 1 : 0);
      if (kind == "data") {
        QCOMPARE(request[0][0].toString(), QString("second"));
        QCOMPARE(request[0][1].toPointF(), point);
        QCOMPARE(request[0][2].toPoint(), screen);
      }
    }
  }
  void quickPillAndPortPixels() {
    WorkflowGraphModel model;
    test::OverlayCanvasFixture host(model);
    auto &view = host.surface();
    auto theme = test::darkCanvasTheme();
    const QColor paper("#e8edf0");
    theme.reroutePaper = paper;
    view.scene().setTheme(theme);
    model.project(fixture(), catalog());
    const QRect area(-10, 90, 80, 40);
    QImage image(area.size(), QImage::Format_ARGB32_Premultiplied);
    image.fill(theme.canvas);
    QPainter painter(&image);
    painter.translate(-area.topLeft());
    view.graphCanvas().renderScene(painter, area, 1);
    painter.end();
    QVERIFY(image.pixelColor(40, 20).lightness() > 170);
    QVERIFY(image.pixelColor(12, 12).lightness() < 90);
    QCOMPARE(image.pixelColor(10, 20), typeColor("image"));
    QCOMPARE(image.pixelColor(70, 20), typeColor("image"));
  }

  void deterministicNativeCaptures() {
    const auto prefix=qEnvironmentVariable("NODETOOL_REROUTE_CAPTURE");if (prefix.isEmpty()) { QSKIP("Set NODETOOL_REROUTE_CAPTURE to capture native scene fixtures"); }
    WorkflowGraphModel model;
    test::OverlayCanvasFixture host(model);
    auto &view = host.surface();
    model.project(fixture(), catalog());
    for (const auto &scheme:{QString("dark"),QString("light")}) {
      auto theme = nodetool::test::darkCanvasTheme();
      if (scheme=="light") { theme.textPrimary=QColor("#18181b");theme.textSecondary=QColor("#5b5b66");theme.canvas=QColor("#f5f5f6");theme.node=QColor("#ffffff");theme.grid=QColor("#dcdce1");theme.reroutePaper=QColor("#ffffff");theme.rerouteBorder=QColor("#71717a");theme.primary=QColor("#2f62c4"); }
      view.scene().setTheme(theme);
      view.selection().setNode(id(model, "r1"), true);
      QImage image(1100, 420, QImage::Format_ARGB32_Premultiplied);
      image.fill(theme.canvas);
      QPainter painter(&image);
      const QRectF area(-380, -30, 1150, 440);
      painter.scale(image.width() / area.width(), image.height() / area.height());
      painter.translate(-area.topLeft());
      view.graphCanvas().renderScene(painter, area, image.width() / area.width());
      painter.end();
      QVERIFY(image.save(prefix + "-" + scheme + ".png"));
    }
  }
};
QTEST_MAIN(ReroutePresentationTest)
#include "ReroutePresentationTest.moc"
