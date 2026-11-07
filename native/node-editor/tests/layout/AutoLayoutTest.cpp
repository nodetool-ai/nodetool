#include "layout/AutoLayout.h"
#include "document/WorkflowDocument.h"
#include <QElapsedTimer>
#include <QJsonArray>
#include <QRectF>
#include <QtTest>
using namespace nodetool::node_editor;
using namespace nodetool::node_editor::layout;
namespace {
QJsonObject node(QString id,QString parent={}) { QJsonObject n{{"id",id},{"type","Node"},{"future",42},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",400},{"y",200},{"futurePosition",true}}},{"future",true}}}}; if (!parent.isEmpty()) { n.insert("parent_id",parent); } return n; }
QJsonObject edge(QString a,QString b,QString type="data") { return {{"source",a},{"target",b},{"sourceHandle","out"},{"targetHandle","in"},{"edge_type",type}}; }
QPointF position(const LayoutResult& r,const QString& id) { const auto p=r.command["positions"].toObject()[id].toObject(); return {p["x"].toDouble(),p["y"].toDouble()}; }
}
class AutoLayoutTest final : public QObject {
 Q_OBJECT
private slots:
 void layeredAndDeterministic() {
    const QJsonObject graph{{"nodes",QJsonArray{node("a"),node("b"),node("c"),node("d")}}, {"edges",QJsonArray{edge("a","b"),edge("a","c"),edge("b","d"),edge("c","d")}}};
    const QHash<QString,QSizeF> sizes{{"a",{350,180}},{"b",{280,75}},{"c",{390,240}},{"d",{100,100}}};
    const auto r=autoLayoutCommand(graph,sizes); QVERIFY(r.ok); QCOMPARE(r.command,autoLayoutCommand(graph,sizes).command);
    QVERIFY(position(r,"b").x()>=position(r,"a").x()+350+30); QVERIFY(position(r,"d").x()>=position(r,"c").x()+390+30);
    const auto ids=sizes.keys();
    for (int a=0;a<ids.size();++a) { for (int b=a+1;b<ids.size();++b) { QVERIFY(!QRectF(position(r,ids[a]),sizes[ids[a]]).intersects(QRectF(position(r,ids[b]),sizes[ids[b]]))); } }
    WorkflowDocument document; const QJsonObject original{{"graph",graph},{"future",true}}; QVERIFY(document.load(original)); QVERIFY(document.applyCommand(r.command));
    QCOMPARE(document.undoStack()->count(),1); QCOMPARE(document.node("a")["ui_properties"].toObject()["position"].toObject()["futurePosition"].toBool(),true); QCOMPARE(document.node("a")["future"].toInt(),42); QCOMPARE(document.graph()["edges"],graph["edges"]);
    document.undo(); QCOMPARE(document.snapshot(),original); document.redo(); QCOMPARE(document.node("a")["ui_properties"].toObject()["future"].toBool(),true);
 }
 void hierarchyAndSelection() {
    const QJsonObject graph{{"nodes",QJsonArray{node("g"),node("a","g"),node("b","g"),node("outside")}}, {"edges",QJsonArray{edge("a","b")}}};
    const auto whole=autoLayoutCommand(graph); QVERIFY(whole.ok); QCOMPARE(position(whole,"a"),QPointF(50,50)); QVERIFY(position(whole,"b").x()>position(whole,"a").x());
    LayoutOptions options; options.selection=QStringList{"g","a","outside"};
    auto selected=autoLayoutCommand(graph,{},options); QVERIFY(selected.ok); QCOMPARE(selected.command["positions"].toObject().size(),2); QVERIFY(!selected.command["positions"].toObject().contains("a"));
    options.selection=QStringList{"a","outside"}; selected=autoLayoutCommand(graph,{},options); QVERIFY(selected.ok);
    QVERIFY(!selected.command["positions"].toObject().contains("g")); QVERIFY(!selected.command["positions"].toObject().contains("b"));
    // Child absolute position subtracts its unchanged parent's canvas origin.
    QCOMPARE(position(selected,"a").x()+400,position(selected,"outside").x());
    options.selection=QStringList{}; QVERIFY(autoLayoutCommand(graph,{},options).command["positions"].toObject().isEmpty());
 }
 void cyclesControlAndLineage() {
    QJsonObject graph{{"nodes",QJsonArray{node("a"),node("b"),node("c"),node("d")}}, {"edges",QJsonArray{edge("a","b"),edge("b","a"),edge("b","c"),edge("c","d","control")}}, {"links",QJsonArray{edge("d","a")}}};
    const auto r=autoLayoutCommand(graph); QVERIFY(r.ok); QCOMPARE(position(r,"a").x(),position(r,"b").x()); QVERIFY(position(r,"c").x()>position(r,"a").x()); QCOMPARE(position(r,"c").x(),position(r,"d").x());
    graph["links"]=QJsonArray{}; QCOMPARE(autoLayoutCommand(graph).command,r.command);
    auto edges=graph["edges"].toArray(); edges.append(edge("d","a","lineage")); graph["edges"]=edges; QCOMPARE(autoLayoutCommand(graph).command,r.command);
 }
 void groupFootprintAndDeepHierarchy() {
    const QJsonObject graph{{"nodes",QJsonArray{node("g"),node("a","g"),node("b","g"),node("outside")}}, {"edges",QJsonArray{edge("a","b"),edge("g","outside")}}};
    const auto r=autoLayoutCommand(graph); QVERIFY(r.ok);
    QVERIFY(position(r,"outside").x()>=position(r,"g").x()+position(r,"b").x()+280+50+30);
    QJsonArray nested;
    for (int i=0;i<1000;++i) { nested.append(node(QString::number(i),i ? QString::number(i-1) : QString())); }
    const QJsonObject deep{{"nodes",nested},{"edges",QJsonArray{}}};
    LayoutOptions options; options.selection=QStringList{"0","999"};
    const auto selected=autoLayoutCommand(deep,{},options); QVERIFY(selected.ok); QCOMPARE(selected.command["positions"].toObject().size(),1);
    QVERIFY(autoLayoutCommand(deep).ok);
 }
 void emptyInvalidAndFallback() {
    QVERIFY(autoLayoutCommand({{"nodes",QJsonArray{}},{"edges",QJsonArray{}}}).ok);
    QVERIFY(!autoLayoutCommand({}).ok);
    auto graph=QJsonObject{{"nodes",QJsonArray{node("a")}}, {"edges",QJsonArray{}}};
    QVERIFY(autoLayoutCommand(graph,{{"a",QSizeF(-1,0)}}).ok);
    LayoutOptions options; options.selection=QStringList{"missing"}; QVERIFY(!autoLayoutCommand(graph,{},options).ok);
    graph["nodes"]=QJsonArray{node("a","b"),node("b","a")}; QVERIFY(!autoLayoutCommand(graph).ok);
 }
 // Web: NodeStore.autoLayout moves the laid out top-level nodes back so their top left stays where it was.
 void wholeGraphKeepsTheTopLeftOfTopLevelNodes() {
    const QJsonObject graph{{"nodes",QJsonArray{node("a"),node("b")}},{"edges",QJsonArray{edge("a","b")}}};
    const auto r=autoLayoutCommand(graph,{{"a",{200,100}},{"b",{200,100}}}); QVERIFY(r.ok);
    QCOMPARE(position(r,"a"),QPointF(400,200)); QCOMPARE(position(r,"b"),QPointF(400+200+30,200));
 }
 // Web: core/graph.ts resizes a group to its children's extent plus 50 after laying them out.
 void groupsReportTheirFittedSize() {
    const QJsonObject graph{{"nodes",QJsonArray{node("g"),node("a","g"),node("b","g")}},{"edges",QJsonArray{edge("a","b")}}};
    const auto r=autoLayoutCommand(graph,{{"g",{900,900}},{"a",{200,100}},{"b",{200,100}}}); QVERIFY(r.ok);
    QVERIFY(r.groupSizes.contains("g"));
    QCOMPARE(r.groupSizes.value("g"),QSizeF(position(r,"b").x()+200+50,position(r,"b").y()+100+50));
    LayoutOptions options; options.selection=QStringList{"g","a"};
    QVERIFY(autoLayoutCommand(graph,{},options).groupSizes.isEmpty());
 }
 // Web: orderByUpstreamHandles keeps siblings of one source in that source's output order.
 void siblingsFollowTheirSourceOutputOrder() {
    QJsonObject first=edge("s","t1"); first["sourceHandle"]="second";
    QJsonObject second=edge("s","t2"); second["sourceHandle"]="first";
    const QJsonObject graph{{"nodes",QJsonArray{node("s"),node("t1"),node("t2")}},{"edges",QJsonArray{first,second}}};
    QVERIFY(position(autoLayoutCommand(graph),"t1").y()<position(autoLayoutCommand(graph),"t2").y());
    LayoutOptions options; options.outputOrder.insert("s",QStringList{"first","second"});
    const auto r=autoLayoutCommand(graph,{},options); QVERIFY(r.ok);
    QVERIFY(position(r,"t2").y()<position(r,"t1").y());
 }
 // Web: orderForControlPlacement puts a controlled node directly after its controller.
 void controlledNodeFollowsItsController() {
    const QJsonObject graph{{"nodes",QJsonArray{node("c"),node("o"),node("d")}},{"edges",QJsonArray{edge("c","d","control")}}};
    const auto r=autoLayoutCommand(graph,{{"c",{200,100}},{"o",{200,100}},{"d",{200,100}}}); QVERIFY(r.ok);
    QCOMPARE(position(r,"c").x(),position(r,"d").x()); QCOMPARE(position(r,"d").y(),position(r,"c").y()+100+50); QVERIFY(position(r,"o").y()>position(r,"d").y());
 }
 // Each node and edge is visited a bounded number of times, so growth stays linear.
 void largeGraphsStayLinear() {
    const auto build=[](int count,qint64* elapsed) {
        QJsonArray nodes,edges;
        for (int i=0;i<count;++i) { nodes.append(node(QString::number(i))); if (i) { edges.append(edge(QString::number(i-1),QString::number(i))); } if (i>1) { edges.append(edge(QString::number(i-2),QString::number(i))); } if (i%7==0 && i>20) { edges.append(edge(QString::number(i-20),QString::number(i))); } }
        QElapsedTimer timer; timer.start(); const auto r=autoLayoutCommand({{"nodes",nodes},{"edges",edges}}); *elapsed=timer.elapsed();
        QVERIFY(r.ok); QCOMPARE(r.stats.nodes,count);
    };
    qint64 small=0,medium=0,large=0; build(2000,&medium); build(500,&small); build(20000,&large);
    qInfo()<<"500 nodes:"<<small<<"ms, 2000 nodes:"<<medium<<"ms, 20000 nodes:"<<large<<"ms";
    QVERIFY2(medium<1000,"2,000 node layout must finish within a second");
    QVERIFY2(large<20000,"20,000 node layout must not grow quadratically");
 }
 void largeGraphMeasured() {
    QJsonArray nodes,edges;
    for (int i=0;i<1000;++i) { nodes.append(node(QString::number(i))); if (i) { edges.append(edge(QString::number(i-1),QString::number(i))); } if (i>1) { edges.append(edge(QString::number(i-2),QString::number(i))); } }
    const QJsonObject graph{{"nodes",nodes},{"edges",edges}}; QElapsedTimer timer; timer.start(); const auto r=autoLayoutCommand(graph);
    QVERIFY(r.ok); QCOMPARE(r.stats.nodes,1000); QCOMPARE(r.stats.edges,1997); QCOMPARE(r.command["positions"].toObject().size(),1000);
    qInfo()<<"1000 nodes / 1997 edges layout milliseconds:"<<timer.elapsed();
 }
};
QTEST_MAIN(AutoLayoutTest)
#include "AutoLayoutTest.moc"
