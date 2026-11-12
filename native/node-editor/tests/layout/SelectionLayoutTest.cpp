#include "layout/SelectionLayout.h"
#include "document/WorkflowDocument.h"
#include <QJsonArray>
#include <QtTest>
#include <limits>
using namespace nodetool::node_editor;
using namespace nodetool::node_editor::layout;
namespace {
QJsonObject node(const QString& id, const QString& parent = {}) {
    QJsonObject value{{"id",id},{"type","Node"},{"future",42},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",10},{"y",20},{"future",7}}}}}};
    if (!parent.isEmpty()) { value.insert("parent_id",parent); }
    return value;
}
QJsonObject graph() { return {{"nodes",QJsonArray{node("a"),node("b"),node("c")}},{"edges",QJsonArray{}}}; }
QHash<QString,QRectF> geometry() { return {{"a",{100,200,100,40}},{"b",{300,100,60,80}},{"c",{200,300,200,120}}}; }
QPointF position(const SelectionLayoutResult& result, const QString& id) {
    const auto value=result.command["positions"].toObject()[id].toObject();
    return {value["x"].toDouble(),value["y"].toDouble()};
}
}
class SelectionLayoutTest final : public QObject {
    Q_OBJECT
private slots:
    void alignmentFormulas_data() {
        QTest::addColumn<int>("action"); QTest::addColumn<QPointF>("a"); QTest::addColumn<QPointF>("b"); QTest::addColumn<QPointF>("c");
        QTest::newRow("left")<<int(SelectionAction::AlignLeft)<<QPointF(100,200)<<QPointF(100,100)<<QPointF(100,300);
        QTest::newRow("center-average")<<int(SelectionAction::AlignCenter)<<QPointF(210,200)<<QPointF(230,100)<<QPointF(160,300);
        QTest::newRow("right")<<int(SelectionAction::AlignRight)<<QPointF(300,200)<<QPointF(340,100)<<QPointF(200,300);
        QTest::newRow("top")<<int(SelectionAction::AlignTop)<<QPointF(100,100)<<QPointF(300,100)<<QPointF(200,100);
        QTest::newRow("middle-average")<<int(SelectionAction::AlignMiddle)<<QPointF(100,220)<<QPointF(300,200)<<QPointF(200,180);
        QTest::newRow("bottom")<<int(SelectionAction::AlignBottom)<<QPointF(100,380)<<QPointF(300,340)<<QPointF(200,300);
        QTest::newRow("horizontal-fixed-gap")<<int(SelectionAction::DistributeHorizontal)<<QPointF(100,200)<<QPointF(480,100)<<QPointF(240,300);
        QTest::newRow("vertical-fixed-gap")<<int(SelectionAction::DistributeVertical)<<QPointF(100,200)<<QPointF(300,100)<<QPointF(200,260);
        QTest::newRow("stack-reading-order")<<int(SelectionAction::Stack)<<QPointF(100,200)<<QPointF(100,100)<<QPointF(100,260);
        // Reading order b,a,c. Column0 max width200, row0 max height80.
        QTest::newRow("grid-column-row-maxima")<<int(SelectionAction::Grid)<<QPointF(340,100)<<QPointF(100,100)<<QPointF(100,200);
    }
    void alignmentFormulas() {
        QFETCH(int,action); QFETCH(QPointF,a); QFETCH(QPointF,b); QFETCH(QPointF,c);
        const auto result=selectionLayoutCommand(graph(),{"c","a","b"},geometry(),static_cast<SelectionAction>(action));
        QVERIFY2(result.ok,qPrintable(result.error)); QCOMPARE(result.command["op"].toString(),"moveNodes"); QCOMPARE(result.command["space"].toString(),"absolute");
        QCOMPARE(position(result,"a"),a); QCOMPARE(position(result,"b"),b); QCOMPARE(position(result,"c"),c);
        QCOMPARE(result.command,selectionLayoutCommand(graph(),{"c","a","b"},geometry(),static_cast<SelectionAction>(action)).command);
    }
    void tieOrderAndIncompleteGrid() {
        auto measured=geometry(); measured["a"]=QRectF(10,10,100,30); measured["b"]=QRectF(10,10,60,80); measured["c"]=QRectF(10,10,200,120);
        const auto horizontal=selectionLayoutCommand(graph(),{"c","b","a"},measured,SelectionAction::DistributeHorizontal);
        QVERIFY(horizontal.ok); QCOMPARE(position(horizontal,"a"),QPointF(10,10)); QCOMPARE(position(horizontal,"b"),QPointF(150,10)); QCOMPARE(position(horizontal,"c"),QPointF(250,10));
        const auto vertical=selectionLayoutCommand(graph(),{"c","b","a"},measured,SelectionAction::DistributeVertical);
        QVERIFY(vertical.ok); QCOMPARE(position(vertical,"a"),QPointF(10,10)); QCOMPARE(position(vertical,"b"),QPointF(10,60)); QCOMPARE(position(vertical,"c"),QPointF(10,160));
        const auto grid=selectionLayoutCommand(graph(),{"c","b","a"},measured,SelectionAction::Grid);
        QVERIFY(grid.ok); QCOMPARE(position(grid,"a"),QPointF(10,10)); QCOMPARE(position(grid,"b"),QPointF(250,10)); QCOMPARE(position(grid,"c"),QPointF(10,110));
    }
    void hierarchyAndSingleUndo() {
        const QJsonObject documentGraph{{"nodes",QJsonArray{node("group"),node("nested","group"),node("child","nested"),node("other-group"),node("other-child","other-group"),node("unselected")}},{"edges",QJsonArray{QJsonObject{{"id","wire"},{"source","child"},{"target","other-child"},{"sourceHandle","out"},{"targetHandle","in"},{"future",42}}}}};
        const QHash<QString,QRectF> measured{{"group",{10,20,400,300}},{"nested",{20,40,300,200}},{"child",{30,60,280,100}},{"other-child",{20,40,280,100}}};
        const auto result=selectionLayoutCommand(documentGraph,{"child","nested","group","other-child","group"},measured,SelectionAction::AlignRight);
        QVERIFY2(result.ok,qPrintable(result.error)); QCOMPARE(result.roots,(QStringList{"group","other-child"})); QCOMPARE(result.command["positions"].toObject().size(),2);
        WorkflowDocument document; const QJsonObject original{{"graph",documentGraph},{"futureWorkflow",true}}; QVERIFY(document.load(original)); QVERIFY(document.applyCommand(result.command));
        QCOMPARE(document.undoStack()->count(),1); QCOMPARE(document.node("child"),node("child","nested")); QCOMPARE(document.node("nested"),node("nested","group"));
        QCOMPARE(document.node("other-child")["parent_id"].toString(),"other-group");
        // Align right at410. The child's absolute x130 subtracts parent x10.
        QCOMPARE(document.node("other-child")["ui_properties"].toObject()["position"].toObject()["x"].toDouble(),120.0);
        QCOMPARE(document.node("other-child")["ui_properties"].toObject()["position"].toObject()["future"].toInt(),7);
        QCOMPARE(document.graph()["edges"],documentGraph["edges"]); QCOMPARE(document.node("unselected"),node("unselected"));
        const auto after=document.snapshot(); document.undo(); QCOMPARE(document.snapshot(),original); document.redo(); QCOMPARE(document.snapshot(),after);
    }
    void invalidInputsAndSmallSelection() {
        QVERIFY(selectionLayoutCommand(graph(),{},geometry(),SelectionAction::Grid).command["positions"].toObject().isEmpty());
        QVERIFY(selectionLayoutCommand(graph(),{"a"},geometry(),SelectionAction::Grid).command["positions"].toObject().isEmpty());
        QVERIFY(!selectionLayoutCommand(graph(),{"missing"},geometry(),SelectionAction::Grid).ok);
        QVERIFY(!selectionLayoutCommand(graph(),{},geometry(),static_cast<SelectionAction>(-1)).ok);
        QVERIFY(!selectionLayoutCommand(graph(),{"a","b"},{},SelectionAction::Grid).ok);
        for (const auto& invalid : {QRectF(0,0,0,20),QRectF(0,0,-1,20),QRectF(0,0,20,0),QRectF(std::numeric_limits<double>::infinity(),0,20,20),QRectF(0,0,20,std::numeric_limits<double>::quiet_NaN())}) {
            auto measured=geometry(); measured["a"]=invalid;
            QVERIFY(!selectionLayoutCommand(graph(),{"a","b"},measured,SelectionAction::Grid).ok);
        }
        QVERIFY(!selectionLayoutCommand(QJsonObject{{"nodes",QJsonArray{node("a","missing")}}},{"a"},geometry(),SelectionAction::Grid).ok);
        QVERIFY(!selectionLayoutCommand(QJsonObject{{"nodes",QJsonArray{node("a","b"),node("b","a")}}},{"a"},geometry(),SelectionAction::Grid).ok);
        QVERIFY(!selectionLayoutCommand(QJsonObject{{"nodes",QJsonArray{node("a"),node("a")}}},{"a"},geometry(),SelectionAction::Grid).ok);
    }
    void deepHierarchyAndLargeGrid() {
        constexpr int count=12000;
        QJsonArray nodes; QStringList selection; QHash<QString,QRectF> measured;
        for(int i=0;i<count;++i){const auto id=QString::number(i);nodes.append(node(id,i?QString::number(i-1):QString{}));selection.append(id);measured.insert(id,QRectF(i*10.0,i*20.0,280,100));}
        const QJsonObject deep{{"nodes",nodes},{"edges",QJsonArray{}}};
        const auto filtered=selectionLayoutCommand(deep,selection,measured,SelectionAction::Grid);
        QVERIFY(filtered.ok); QCOMPARE(filtered.roots,QStringList{"0"}); QVERIFY(filtered.command["positions"].toObject().isEmpty());
        nodes=QJsonArray{};
        for(int i=0;i<count;++i){nodes.append(node(QString::number(i)));}
        const auto grid=selectionLayoutCommand(QJsonObject{{"nodes",nodes}},selection,measured,SelectionAction::Grid);
        QVERIFY(grid.ok); QCOMPARE(grid.command["positions"].toObject().size(),count);
        QCOMPARE(position(grid,"0"),QPointF(0,0)); QCOMPARE(position(grid,"109"),QPointF(109*320,0)); QCOMPARE(position(grid,"110"),QPointF(0,120));
        QCOMPARE(grid.command,selectionLayoutCommand(QJsonObject{{"nodes",nodes}},selection,measured,SelectionAction::Grid).command);
    }
};
QTEST_GUILESS_MAIN(SelectionLayoutTest)
#include "SelectionLayoutTest.moc"
