#include "document/WorkflowDocument.h"
#include <QJsonDocument>
#include <QElapsedTimer>
#include <QSignalSpy>
#include <QSet>
#include <QtTest>
#include <limits>
using namespace nodetool::node_editor;
namespace {
QJsonObject fixture() {
    return QJsonDocument::fromJson(R"({"id":"0123456789abcdef0123456789abcdef","future":{"a":[null,7]},"graph":{"futureGraph":true,"nodes":[{"id":"a","type":"unknown.Provider","data":{"prompt":"hello","future":[1,2]},"dynamic_properties":{"input":2},"dynamic_inputs":{"input":{"type":{"type":"int"}}},"dynamic_outputs":{"out":{"type":"int"}},"futureNode":42,"ui_properties":{"position":{"x":2,"y":3},"bypassed":true}},{"id":"b","type":"nodetool.text.Output","data":{}}],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"value","futureEdge":42}],"links":[{"id":"l","source":"a","target":"b","kind":"lineage","futureLink":true}]}})").object();
}
}
static QStringList edgesInto(const WorkflowDocument &document, const QString &handle) {
    QStringList ids;
    for (const auto &value : document.edges()) {
        if (value.toObject()["targetHandle"] == handle) { ids.append(value.toObject()["id"].toString()); }
    }
    return ids;
}
class WorkflowDocumentTest final : public QObject {
    Q_OBJECT
private slots:
    void connectingHiddenInputExposesItAsOneUndoStep() {
        WorkflowDocument document;
        const QJsonObject type{{"type","str"}};
        document.setNodeMetadata({QJsonObject{{"node_type","Node"},{"inline_fields",QJsonArray{"shown"}},{"input_fields",QJsonArray{"handle"}},
            {"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",type}}}},
            {"properties",QJsonArray{QJsonObject{{"name","shown"},{"type",type}},QJsonObject{{"name","handle"},{"type",type}},QJsonObject{{"name","hidden"},{"type",type}}}}}});
        QVERIFY(document.load(QJsonDocument::fromJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"c","type":"Node"}],"edges":[]}})").object()));
        const auto baseline=document.snapshot();
        const auto connect=[&](const QString& target,const QString& handle) {
            return document.applyCommand({{"op","addEdge"},{"edge",QJsonObject{{"source","a"},{"sourceHandle","out"},{"target",target},{"targetHandle",handle}}}});
        };
        QVERIFY(connect("b","hidden"));
        QCOMPARE(document.node("b")["ui_properties"].toObject()["exposed_inputs"].toArray(),QJsonArray{"hidden"});
        QCOMPARE(document.undoStack()->count(),1);
        document.undo(); QCOMPARE(document.snapshot(),baseline);
        // Metadata handles and inline fields draw their own handle, so they stay out of the list.
        QVERIFY(connect("b","shown")); QVERIFY(connect("c","handle"));
        QVERIFY(!document.node("b")["ui_properties"].toObject().contains("exposed_inputs"));
        QVERIFY(!document.node("c")["ui_properties"].toObject().contains("exposed_inputs"));
        // The batch path exposes the input too.
        QVERIFY(document.applyCommand({{"op","batch"},{"commands",QJsonArray{QJsonObject{{"op","addEdge"},{"edge",QJsonObject{{"source","a"},{"sourceHandle","out"},{"target","c"},{"targetHandle","hidden"}}}}}}}));
        QCOMPARE(document.node("c")["ui_properties"].toObject()["exposed_inputs"].toArray(),QJsonArray{"hidden"});
    }
    void groupCommandsPreserveWebFieldsAndHistory() {
        WorkflowDocument d;
        // Protocol shape used by graphNodeToReactFlowNode and GroupNode:
        // data.headline, data.comment, ui_properties geometry, parent_id.
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[
            {"id":"outer","type":"nodetool.workflows.base_node.Group","data":{"headline":"Outer","future":7},"ui_properties":{"position":{"x":100,"y":200},"width":500,"height":400}},
            {"id":"inner","type":"nodetool.workflows.base_node.Group","parent_id":"outer","ui_properties":{"position":{"x":20,"y":30}}},
            {"id":"a","type":"Node","parent_id":"inner","data":{"future":true},"ui_properties":{"position":{"x":5,"y":6,"future":9},"width":80,"height":60}},
            {"id":"comment","type":"nodetool.workflows.base_node.Comment","data":{"comment":{"root":{"type":"root","children":[],"version":1}},"comment_color":"red","future":42},"ui_properties":{"position":{"x":300,"y":400}}}
        ],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"comment","targetHandle":"in","future":11}],"links":[{"id":"l","source":"a","target":"comment","future":12}]}})"));
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "groupNodes"}, {"ids", QJsonArray{"inner", "a", "comment"}}, {"id", "new-group"}, {"title", "Together"}}));
        QCOMPARE(d.undoStack()->count(), 1);
        QCOMPARE(d.nodes()[0].toObject()["id"].toString(), "new-group");
        QCOMPARE(d.node("a")["parent_id"].toString(), "inner");
        QCOMPARE(d.node("inner")["parent_id"].toString(), "new-group");
        QCOMPARE(d.node("new-group")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",100},{"y",180}}));
        QCOMPARE(d.node("inner")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",20},{"y",50}}));
        QCOMPARE(d.graph()["edges"], before["graph"].toObject()["edges"]);
        QCOMPARE(d.graph()["links"], before["graph"].toObject()["links"]);
        const auto grouped = d.snapshot(); d.undo(); QCOMPARE(d.snapshot(), before); d.redo(); QCOMPARE(d.snapshot(), grouped);
        QVERIFY(d.applyCommand({{"op","renameNode"},{"id","new-group"},{"title","Renamed"}}));
        QCOMPARE(d.node("new-group")["data"].toObject()["headline"].toString(), "Renamed");
        QVERIFY(d.applyCommand({{"op","renameNode"},{"id","a"},{"title","A"}}));
        QCOMPARE(d.node("a")["ui_properties"].toObject()["title"].toString(), "A");
        QVERIFY(d.applyCommand({{"op","setComment"},{"id","comment"},{"value","**Markdown**"}}));
        QCOMPARE(d.node("comment")["data"].toObject()["future"].toInt(), 42);
        QCOMPARE(d.node("comment")["data"].toObject()["comment_color"].toString(), "red");
        d.undo(); QVERIFY(d.node("comment")["data"].toObject()["comment"].isObject());
        const QJsonObject lexical{{"root",QJsonObject{{"type","root"},{"children",QJsonArray{}},{"future",19}}}};
        QVERIFY(d.applyCommand({{"op","setComment"},{"id","comment"},{"value",lexical}}));
        QCOMPARE(d.node("comment")["data"].toObject()["comment"].toObject(), lexical);
        const auto valid = d.snapshot(); const auto count = d.undoStack()->count();
        QVERIFY(!d.applyCommand({{"op","setComment"},{"id","a"},{"value","bad"}}));
        QVERIFY(!d.applyCommand({{"op","setComment"},{"id","comment"},{"value",QJsonObject{{"invalid",true}}}}));
        QVERIFY(!d.applyCommand({{"op","ungroupNodes"},{"ids",QJsonArray{"a"}}}));
        QVERIFY(!d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"a"}},{"id","a"}}));
        QVERIFY(!d.applyCommand({{"op","setNodeField"},{"id","new-group"},{"field","parent_id"},{"value","a"}}));
        QCOMPARE(d.snapshot(), valid); QCOMPARE(d.undoStack()->count(), count);
    }
    void ungroupDetachAndAbsoluteMove() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[
            {"id":"outer","type":"nodetool.workflows.base_node.Group","ui_properties":{"position":{"x":100,"y":200}}},
            {"id":"inner","type":"nodetool.workflows.base_node.Group","parent_id":"outer","ui_properties":{"position":{"x":20,"y":30}}},
            {"id":"a","type":"Node","parent_id":"inner","ui_properties":{"position":{"x":5,"y":6,"future":9}}},
            {"id":"b","type":"Node","parent_id":"outer","ui_properties":{"position":{"x":50,"y":60}}}
        ],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"in","future":11}],"links":[{"id":"frame-link","source":"outer","target":"b"}]}})"));
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op","moveNodes"},{"space","absolute"},{"positions",QJsonObject{{"outer",QJsonObject{{"x",200},{"y",300}}},{"a",QJsonObject{{"x",250},{"y",360}}}}}}));
        QCOMPARE(d.node("a")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",30},{"y",30},{"future",9}}));
        d.undo(); QCOMPARE(d.snapshot(), before);
        QVERIFY(d.applyCommand({{"op","ungroupNodes"},{"ids",QJsonArray{"inner"}}}));
        QCOMPARE(d.node("a")["parent_id"].toString(), "outer");
        QCOMPARE(d.node("a")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",25},{"y",36},{"future",9}}));
        QCOMPARE(d.edges().size(), 1); d.undo(); QCOMPARE(d.snapshot(), before);
        QVERIFY(d.applyCommand({{"op","ungroupNodes"},{"ids",QJsonArray{"outer","inner"}}}));
        QVERIFY(!d.node("a").contains("parent_id"));
        QCOMPARE(d.node("a")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",125},{"y",236},{"future",9}}));
        QCOMPARE(d.edges().size(), 1); QVERIFY(d.graph()["links"].toArray().isEmpty());
        d.undo(); QCOMPARE(d.snapshot(), before);
        QVERIFY(d.applyCommand({{"op","detachNodes"},{"ids",QJsonArray{"a"}}}));
        QVERIFY(!d.node("a").contains("parent_id")); QVERIFY(!d.node("inner").isEmpty());
        QCOMPARE(d.node("a")["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x",125},{"y",236},{"future",9}}));
        d.undo(); QCOMPARE(d.snapshot(), before);
        const auto copied = d.copy({"a"});
        QCOMPARE(copied["nodes"].toArray()[0].toObject()["ui_properties"].toObject()["position"].toObject()["x"].toDouble(),125.0);
        const auto pasted = d.applyCommand({{"op","paste"},{"fragment",copied},{"offset",QJsonObject{{"x",10},{"y",20}}}});
        QVERIFY(pasted); const auto pastedId = pasted.idMap["a"].toString();
        QCOMPARE(d.node(pastedId)["ui_properties"].toObject()["position"].toObject()["x"].toDouble(),135.0);
        d.undo(); d.redo(); QVERIFY(!d.node(pastedId).isEmpty());
    }
    void groupCommandsRejectWithoutDataLoss() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","ui_properties":{"position":"future-geometry"}},{"id":"b","type":"Node"}],"edges":[]}})"));
        const auto before = d.snapshot();
        QVERIFY(!d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"a"}}}));
        QVERIFY(!d.applyCommand({{"op","moveNodes"},{"positions",QJsonObject{{"a",QJsonObject{{"x",1},{"y",2}}}}}}));
        QVERIFY(!d.applyCommand({{"op","batch"},{"commands",QJsonArray{
            QJsonObject{{"op","groupNodes"},{"ids",QJsonArray{"b"}},{"id","frame"}},
            QJsonObject{{"op","ungroupNodes"},{"ids",QJsonArray{"a"}}}
        }}}));
        QCOMPARE(d.snapshot(),before); QCOMPARE(d.undoStack()->count(),0);
    }
    void groupMeasuredBoundsAndDefaults() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","ui_properties":{"position":{"x":10,"y":20}}},{"id":"b","type":"Node","ui_properties":{"position":{"x":500,"y":200},"width":120,"height":90,"future":42}}],"edges":[]}})"));
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"a"}},{"id","default-frame"}}));
        const auto defaultUi = d.node("default-frame")["ui_properties"].toObject();
        QCOMPARE(defaultUi["width"].toDouble(),360.0); QCOMPARE(defaultUi["height"].toDouble(),200.0);
        QVERIFY(!d.node("a")["ui_properties"].toObject().contains("width"));
        d.undo(); QCOMPARE(d.snapshot(),before);
        QVERIFY(d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"a","b"}},{"id","measured-frame"},
            {"sizes",QJsonObject{{"a",QJsonObject{{"width",480},{"height",600}}},{"b",QJsonObject{{"width",320},{"height",240}}}}}}));
        const auto measuredUi = d.node("measured-frame")["ui_properties"].toObject();
        QCOMPARE(measuredUi["width"].toDouble(),890.0); QCOMPARE(measuredUi["height"].toDouble(),690.0);
        QCOMPARE(d.node("b")["ui_properties"].toObject()["width"].toInt(),120);
        QCOMPARE(d.node("b")["ui_properties"].toObject()["height"].toInt(),90);
        QCOMPARE(d.node("b")["ui_properties"].toObject()["future"].toInt(),42);
        d.undo(); QCOMPARE(d.snapshot(),before);
        for (const auto& invalid : QJsonArray{
            QJsonObject{{"a",QJsonObject{{"width",0},{"height",100}}}},
            QJsonObject{{"a",QJsonObject{{"width",100},{"height",-1}}}},
            QJsonObject{{"a",QJsonObject{{"width","100"},{"height",100}}}},
            QJsonObject{{"missing",QJsonObject{{"width",100},{"height",100}}}},
            QJsonObject{{"a",QJsonObject{{"width",100}}}}, QJsonArray{}
        }) {
            QVERIFY(!d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"a"}},{"sizes",invalid}}));
            QCOMPARE(d.snapshot(),before);
        }
        QVERIFY(d.applyCommand({{"op","groupNodes"},{"ids",QJsonArray{"b"}},{"id","authored-frame"}}));
        QCOMPARE(d.node("authored-frame")["ui_properties"].toObject()["width"].toDouble(),200.0);
        QCOMPARE(d.node("authored-frame")["ui_properties"].toObject()["height"].toDouble(),200.0);
    }
    void largeBatchMovement() {
        constexpr int size = 12000;
        QJsonArray nodes; QJsonObject positions;
        for (int i = 0; i < size; ++i) {
            const auto id = QString::number(i);
            QJsonObject node{{"id",id},{"type","Node"},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",1},{"y",2},{"future",7}}}}}};
            if (i > 0) { node.insert("parent_id",QString::number(i-1)); }
            nodes.append(node); positions.insert(id,QJsonObject{{"x",i*3.0},{"y",i*4.0}});
        }
        WorkflowDocument d; QVERIFY(d.load({{"graph",QJsonObject{{"nodes",nodes},{"edges",QJsonArray{}}}}}));
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op","moveNodes"},{"space","absolute"},{"positions",positions}}));
        QCOMPARE(d.undoStack()->count(),1);
        const auto moved = d.nodes();
        for (int i = 0; i < size; ++i) {
            const auto position = moved[i].toObject()["ui_properties"].toObject()["position"].toObject();
            QCOMPARE(position["x"].toDouble(),i == 0 ? 0.0 : 3.0);
            QCOMPARE(position["y"].toDouble(),i == 0 ? 0.0 : 4.0);
            QCOMPARE(position["future"].toInt(),7);
        }
        const auto after = d.snapshot(); d.undo(); QCOMPARE(d.snapshot(),before); d.redo(); QCOMPARE(d.snapshot(),after);
    }
    void deepGroupHierarchy() {
        QJsonArray nodes; QJsonArray ids;
        constexpr int size = 12000;
        for (int i = 0; i < size; ++i) {
            QJsonObject node{{"id",QString::number(i)},{"type","nodetool.workflows.base_node.Group"},{"ui_properties",QJsonObject{{"position",QJsonObject{{"x",1},{"y",2}}}}}};
            if (i > 0) { node.insert("parent_id",QString::number(i-1)); }
            nodes.append(node); ids.append(QString::number(i));
        }
        WorkflowDocument d; QVERIFY(d.load({{"graph",QJsonObject{{"nodes",nodes},{"edges",QJsonArray{}}}}}));
        QVERIFY(!d.isReadOnly());
        const auto before = d.snapshot();
        const auto copied = d.copy({QString::number(size-1)});
        QCOMPARE(copied["nodes"].toArray()[0].toObject()["ui_properties"].toObject()["position"].toObject()["x"].toInt(),size);
        QVERIFY(d.applyCommand({{"op","groupNodes"},{"ids",ids},{"id","wrapper"}}));
        QCOMPARE(d.node("0")["parent_id"].toString(),"wrapper");
        QCOMPARE(d.node(QString::number(size-1))["parent_id"].toString(),QString::number(size-2));
        d.undo(); QCOMPARE(d.snapshot(),before);
        QVERIFY(d.applyCommand({{"op","ungroupNodes"},{"ids",ids}})); QVERIFY(d.nodes().isEmpty());
        d.undo(); QCOMPARE(d.snapshot(),before);
    }
    void reconnectPreservesIdentityMetadataAndReplacementOrder() {
        WorkflowDocument document;
        const auto original=QJsonDocument::fromJson(R"({"future":42,"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"c","type":"Node"},{"id":"target","type":"Node"}],"edges":[
          {"id":"occupant","source":"b","sourceHandle":"out","target":"target","targetHandle":"other","future":{"keep":"occupant"}},
          {"id":"0123456789abcdef0123456789abcdef","source":"a","sourceHandle":"out","target":"target","targetHandle":"input","edge_type":"data","label":"Keep label","style":{"stroke":"red"},"future":{"keep":[1,2]}},
          {"id":"untouched","source":"c","sourceHandle":"out","target":"target","targetHandle":"third","future":99}],"links":[{"id":"lineage","source":"a","target":"target","future":true}]}})").object();
        const QJsonObject type{{"type","int"}};
        document.setNodeMetadata({QJsonObject{{"node_type","Node"},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",type}}}},{"properties",QJsonArray{QJsonObject{{"name","input"},{"type",type}},QJsonObject{{"name","other"},{"type",type}},QJsonObject{{"name","third"},{"type",type}}}}}});
        QVERIFY(document.load(original));
        const QString id="0123456789abcdef0123456789abcdef";
        const QJsonObject connection{{"source","c"},{"sourceHandle","out"},{"target","target"},{"targetHandle","other"}};
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id",id},{"connection",connection}}));
        QCOMPARE(document.undoStack()->count(),1);QCOMPARE(document.edges().size(),2);
        auto expected=original["graph"].toObject()["edges"].toArray()[1].toObject();
        for(auto it=connection.cbegin();it!=connection.cend();++it){expected[it.key()]=it.value();}
        QCOMPARE(document.edges()[0].toObject(),expected);QCOMPARE(document.edges()[1].toObject(),original["graph"].toObject()["edges"].toArray()[2].toObject());
        QCOMPARE(document.graph()["links"],original["graph"].toObject()["links"]);QCOMPARE(document.snapshot()["future"].toInt(),42);
        const auto after=document.snapshot();document.undo();QCOMPARE(document.snapshot(),original);document.redo();QCOMPARE(document.snapshot(),after);
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id",id},{"connection",connection}}));QCOMPARE(document.snapshot(),after);QCOMPARE(document.undoStack()->count(),1);
        document.setNodeMetadata({});
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id",id},{"connection",connection}}));QCOMPARE(document.undoStack()->count(),1);
    }
    void reconnectCollectRetainsContributorsAndAnyReplaces() {
        const QJsonObject integer{{"type","int"}};
        const QJsonObject list{{"type","list"},{"type_args",QJsonArray{integer}}};
        const QJsonObject anyList{{"type","list"},{"type_args",QJsonArray{QJsonObject{{"type","any"}}}}};
        const QJsonArray metadata{QJsonObject{{"node_type","Node"},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",integer}}}},{"properties",QJsonArray{QJsonObject{{"name","input"},{"type",integer}},QJsonObject{{"name","collect"},{"type",list}},QJsonObject{{"name","any"},{"type",anyList}}}}}};
        WorkflowDocument document;document.setNodeMetadata(metadata);
        QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"t","type":"Node"}],"edges":[{"id":"moving","source":"a","sourceHandle":"out","target":"t","targetHandle":"input","future":42},{"id":"collect","source":"b","sourceHandle":"out","target":"t","targetHandle":"collect"},{"id":"any","source":"b","sourceHandle":"out","target":"t","targetHandle":"any"}]}})"));
        const auto before=document.snapshot();
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","a"},{"sourceHandle","out"},{"target","t"},{"targetHandle","collect"}}}}));
        QCOMPARE(document.edges().size(),3);QCOMPARE(document.edges()[0].toObject()["future"].toInt(),42);QCOMPARE(document.edges()[1].toObject()["id"].toString(),"collect");
        const auto valid=document.snapshot();
        QVERIFY(!document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","b"},{"sourceHandle","out"},{"target","t"},{"targetHandle","collect"}}}}));
        QCOMPARE(document.snapshot(),valid);QCOMPARE(document.undoStack()->count(),1);
        document.undo();QCOMPARE(document.snapshot(),before);
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","a"},{"sourceHandle","out"},{"target","t"},{"targetHandle","any"}}}}));
        QCOMPARE(document.edges().size(),2);QCOMPARE(document.edges()[0].toObject()["targetHandle"].toString(),"any");QCOMPARE(document.edges()[1].toObject()["id"].toString(),"collect");
        document.undo();QCOMPARE(document.snapshot(),before);
    }
    // NodeStore.addEdge: a new wire replaces the one in a single-value input in
    // the same undo step, and a list input of one concrete type collects both.
    void addEdgeReplacesSingleInputAndCollectsLists() {
        const QJsonObject integer{{"type","int"}};
        const QJsonObject list{{"type","list"},{"type_args",QJsonArray{integer}}};
        const QJsonObject anyList{{"type","list"},{"type_args",QJsonArray{QJsonObject{{"type","any"}}}}};
        const QJsonArray metadata{QJsonObject{{"node_type","Node"},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",integer}}}},{"properties",QJsonArray{QJsonObject{{"name","input"},{"type",integer}},QJsonObject{{"name","collect"},{"type",list}},QJsonObject{{"name","any"},{"type",anyList}}}}}};
        WorkflowDocument document;document.setNodeMetadata(metadata);
        QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"t","type":"Node"}],"edges":[{"id":"single","source":"a","sourceHandle":"out","target":"t","targetHandle":"input"},{"id":"collect","source":"a","sourceHandle":"out","target":"t","targetHandle":"collect"},{"id":"any","source":"a","sourceHandle":"out","target":"t","targetHandle":"any"}]}})"));
        const auto before=document.snapshot();
        QVERIFY(document.applyCommand({{"op","addEdge"},{"edge",QJsonObject{{"id","newer"},{"source","b"},{"sourceHandle","out"},{"target","t"},{"targetHandle","input"}}}}));
        QCOMPARE(edgesInto(document,"input"),QStringList{"newer"});
        QCOMPARE(document.undoStack()->count(),1);
        document.undo();QCOMPARE(document.snapshot(),before);
        QVERIFY(document.applyCommand({{"op","addEdge"},{"edge",QJsonObject{{"id","second"},{"source","b"},{"sourceHandle","out"},{"target","t"},{"targetHandle","collect"}}}}));
        QCOMPARE(edgesInto(document,"collect"),(QStringList{"collect","second"}));
        QVERIFY(document.applyCommand({{"op","batch"},{"commands",QJsonArray{QJsonObject{{"op","addEdge"},{"edge",QJsonObject{{"id","batched"},{"source","b"},{"sourceHandle","out"},{"target","t"},{"targetHandle","any"}}}}}}}));
        QCOMPARE(edgesInto(document,"any"),QStringList{"batched"});
        QVERIFY(!document.applyCommand({{"op","addEdge"},{"edge",QJsonObject{{"id","again"},{"source","b"},{"sourceHandle","out"},{"target","t"},{"targetHandle","any"}}}}));
    }
    void reconnectValidationExcludesRemovedEdgesAndIsAtomic() {
        const QJsonObject integer{{"type","int"}};
        const QJsonArray metadata{QJsonObject{{"node_type","Node"},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",integer}},QJsonObject{{"name","wrong"},{"type",QJsonObject{{"type","str"}}}}}},{"properties",QJsonArray{QJsonObject{{"name","input"},{"type",integer}}}}}};
        WorkflowDocument document;document.setNodeMetadata(metadata);
        QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"c","type":"Node"}],"edges":[{"id":"moving","source":"a","sourceHandle":"out","target":"b","targetHandle":"input","future":42},{"id":"tail","source":"b","sourceHandle":"out","target":"c","targetHandle":"input"}]}})"));
        const auto before=document.snapshot();
        // Reversing this edge is legal once the old direction has been removed.
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","b"},{"sourceHandle","out"},{"target","a"},{"targetHandle","input"}}}}));
        document.undo();QCOMPARE(document.snapshot(),before);
        const auto count=document.undoStack()->count();
        for(const auto& connection:QJsonArray{
            QJsonObject{{"source","c"},{"sourceHandle","out"},{"target","b"},{"targetHandle","input"}},
            QJsonObject{{"source","a"},{"sourceHandle","wrong"},{"target","b"},{"targetHandle","input"}},
            QJsonObject{{"source","missing"},{"sourceHandle","out"},{"target","b"},{"targetHandle","input"}},
            QJsonObject{{"source","a"},{"sourceHandle","out"},{"target","a"},{"targetHandle","input"}},
            QJsonObject{{"source","a"},{"sourceHandle","out"},{"target","b"},{"targetHandle","missing"}},
            QJsonObject{{"source","a"},{"sourceHandle",42},{"target","b"},{"targetHandle","input"}}}){
            QVERIFY(!document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",connection}}));QCOMPARE(document.snapshot(),before);QCOMPARE(document.undoStack()->count(),count);
        }
        QVERIFY(!document.applyCommand({{"op","reconnectEdge"},{"id","missing"},{"connection",QJsonObject{}}}));
        QVERIFY(!document.applyCommand({{"op","batch"},{"commands",QJsonArray{QJsonObject{{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","b"},{"sourceHandle","out"},{"target","a"},{"targetHandle","input"}}}},QJsonObject{{"op","removeEdge"},{"id","missing"}}}}}));QCOMPARE(document.snapshot(),before);
    }
    void reconnectAgentControlReplacesTargetOccupant() {
        WorkflowDocument document;
        QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"agent","type":"nodetool.agents.Agent"},{"id":"other","type":"nodetool.agents.Agent"},{"id":"one","type":"Node"},{"id":"two","type":"Node"}],"edges":[{"id":"moving","source":"agent","sourceHandle":"__control__","target":"one","targetHandle":"__control__","edge_type":"control","future":42},{"id":"occupant","source":"other","sourceHandle":"__control__","target":"two","targetHandle":"__control__","edge_type":"control","future":43}]}})"));
        const auto before=document.snapshot();
        QVERIFY(document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","agent"},{"sourceHandle","__control__"},{"target","two"},{"targetHandle","__control__"}}}}));
        QCOMPARE(document.edges().size(),1);QCOMPARE(document.edges()[0].toObject()["id"].toString(),"moving");QCOMPARE(document.edges()[0].toObject()["future"].toInt(),42);QCOMPARE(document.edges()[0].toObject()["edge_type"].toString(),"control");
        document.undo();QCOMPARE(document.snapshot(),before);
        QVERIFY(!document.applyCommand({{"op","reconnectEdge"},{"id","moving"},{"connection",QJsonObject{{"source","one"},{"sourceHandle","__control__"},{"target","two"},{"targetHandle","__control__"}}}}));QCOMPARE(document.snapshot(),before);
    }
    void rerouteInsertionPreservesMetadataValuesAndUndo() {
        const QJsonObject any{{"type","any"}};
        const QJsonArray catalog{
            QJsonObject{{"node_type","Node"},{"properties",QJsonArray{QJsonObject{{"name","in"},{"type",any}}}},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",any}}}}},
            QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{QJsonObject{{"name","input_value"},{"type",any},{"default",QJsonArray{}}}}},{"outputs",QJsonArray{QJsonObject{{"name","output"},{"type",any}}}}}};
        WorkflowDocument document;document.setNodeMetadata(catalog);
        QVERIFY(document.loadJson(R"({"futureWorkflow":42,"graph":{"futureGraph":true,"nodes":[{"id":"a","type":"Node","data":{"false":false,"zero":0,"null":null,"list":[false,0,null,{"future":7}]}},{"id":"b","type":"Node"},{"id":"c","type":"Node"},{"id":"d","type":"Node"}],"edges":[
            {"id":"before","source":"c","sourceHandle":"out","target":"d","targetHandle":"in","future":1},
            {"id":"0123456789abcdef0123456789abcdef","source":"a","sourceHandle":"out","target":"b","targetHandle":"in","edge_type":"data","label":"keep","style":{"color":"red"},"future":{"flags":[false,0,null]}},
            {"id":"after","source":"c","sourceHandle":"out","target":"b","targetHandle":"in","future":2}],"links":[{"id":"lineage","source":"a","target":"b","future":3}]}})"));
        const auto before=document.snapshot();const QString oldId="0123456789abcdef0123456789abcdef";
        const auto result=document.applyCommand({{"op","insertReroute"},{"id",oldId},{"position",QJsonObject{{"x",125.5},{"y",-42}}}});
        QVERIFY2(result.ok,qPrintable(result.error));QCOMPARE(result.idMap.size(),2);
        const auto reroute=result.idMap["reroute"].toString(),upstream=result.idMap["upstreamEdge"].toString();QCOMPARE(reroute.size(),32);QCOMPARE(upstream.size(),32);
        QCOMPARE(document.nodes().size(),5);QCOMPARE(document.node(reroute)["type"].toString(),"nodetool.control.Reroute");QVERIFY(!document.node(reroute).contains("parent_id"));
        QCOMPARE(document.node(reroute)["data"].toObject()["input_value"].toArray(),QJsonArray{});
        QCOMPARE(document.node(reroute)["ui_properties"].toObject()["position"].toObject(),(QJsonObject{{"x",125.5},{"y",-42}}));
        QCOMPARE(document.edges().size(),4);QCOMPARE(document.edges()[0],before["graph"].toObject()["edges"].toArray()[0]);QCOMPARE(document.edges()[3],before["graph"].toObject()["edges"].toArray()[2]);
        QCOMPARE(document.edges()[1].toObject(),(QJsonObject{{"id",upstream},{"source","a"},{"sourceHandle","out"},{"target",reroute},{"targetHandle","input_value"},{"edge_type","data"}}));
        auto downstream=before["graph"].toObject()["edges"].toArray()[1].toObject();downstream["source"]=reroute;downstream["sourceHandle"]="output";QCOMPARE(document.edges()[2].toObject(),downstream);
        QCOMPARE(document.graph()["links"],before["graph"].toObject()["links"]);QCOMPARE(document.node("a"),before["graph"].toObject()["nodes"].toArray()[0].toObject());QCOMPARE(document.undoStack()->count(),1);
        const auto after=document.snapshot();document.undo();QCOMPARE(document.snapshot(),before);document.redo();QCOMPARE(document.snapshot(),after);
        WorkflowDocument restored;restored.setNodeMetadata(catalog);QVERIFY(restored.loadJson(QJsonDocument(after).toJson()));QCOMPARE(restored.snapshot(),after);
        const auto copied=restored.duplicate({reroute});QVERIFY(copied);QCOMPARE(copied.idMap.size(),1);restored.undo();QCOMPARE(restored.snapshot(),after);
        QVERIFY(restored.applyCommand({{"op","reconnectEdge"},{"id",oldId},{"connection",QJsonObject{{"source",reroute},{"sourceHandle","output"},{"target","d"},{"targetHandle","in"}}}}));restored.undo();QCOMPARE(restored.snapshot(),after);
        QVERIFY(restored.applyCommand({{"op","removeNodes"},{"ids",QJsonArray{reroute}}}));QCOMPARE(restored.edges().size(),2);QVERIFY(restored.node(reroute).isEmpty());restored.undo();QCOMPARE(restored.snapshot(),after);
    }
    void rerouteInsertionRejectsInvalidRequestsAtomically() {
        const QJsonObject any{{"type","any"}};
        const QJsonObject normal{{"node_type","Node"},{"properties",QJsonArray{QJsonObject{{"name","in"},{"type",any}}}},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",any}}}}};
        const QJsonObject reroute{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{QJsonObject{{"name","input_value"},{"type",any}}}},{"outputs",QJsonArray{QJsonObject{{"name","output"},{"type",any}}}}};
        WorkflowDocument document;document.setNodeMetadata({normal,reroute});
        QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"}],"edges":[{"id":"edge","source":"a","sourceHandle":"out","target":"b","targetHandle":"in","future":42}],"links":[{"id":"link","source":"a","target":"b"}]}})"));
        const auto before=document.snapshot();const QJsonObject position{{"x",100},{"y",100}};
        for(const auto& invalid:QJsonArray{QJsonObject{},QJsonObject{{"x",0}},QJsonObject{{"x","100"},{"y",0}},QJsonObject{{"x",QJsonValue::Null},{"y",0}},QJsonObject{{"x",std::numeric_limits<double>::infinity()},{"y",0}},QJsonObject{{"x",0},{"y",std::numeric_limits<double>::quiet_NaN()}},QJsonArray{}}){
            QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",invalid}}));QCOMPARE(document.snapshot(),before);QCOMPARE(document.undoStack()->count(),0);
        }
        QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","link"},{"position",position}}));QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","missing"},{"position",position}}));
        for(const auto& metadata:QList<QJsonArray>{QJsonArray{},QJsonArray{normal},QJsonArray{reroute}}){document.setNodeMetadata(metadata);QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",position}}));QCOMPARE(document.snapshot(),before);}
        for (const auto& declaration : QJsonArray{
            QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{}},{"outputs",reroute["outputs"]}},
            QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",reroute["properties"]},{"outputs",QJsonArray{}}},
            QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{QJsonObject{{"name","input_value"},{"type",QJsonObject{{"type","str"}}}}}},{"outputs",reroute["outputs"]}}}) {
            document.setNodeMetadata({normal,declaration});
            QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",position}}));QCOMPARE(document.snapshot(),before);
        }
        document.setNodeMetadata({normal,reroute});
        auto invalid=before;auto graph=invalid["graph"].toObject();auto edges=graph["edges"].toArray();auto edge=edges[0].toObject();edge["sourceHandle"]="missing";edges[0]=edge;graph["edges"]=edges;invalid["graph"]=graph;QVERIFY(document.load(invalid));
        QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",position}}));QCOMPARE(document.snapshot(),invalid);
        edge["sourceHandle"]="__control__";edge["targetHandle"]="__control__";edge["edge_type"]="control";edges[0]=edge;graph["edges"]=edges;invalid["graph"]=graph;QVERIFY(document.load(invalid));
        QVERIFY(!document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",position}}));QCOMPARE(document.snapshot(),invalid);QCOMPARE(document.undoStack()->count(),0);
        QVERIFY(document.load(before));
        QVERIFY(!document.applyCommand({{"op","batch"},{"commands",QJsonArray{QJsonObject{{"op","insertReroute"},{"id","edge"},{"position",position}},QJsonObject{{"op","removeNodes"},{"ids",QJsonArray{"missing"}}}}}}));QCOMPARE(document.snapshot(),before);QCOMPARE(document.undoStack()->count(),0);
    }
    void rerouteDefaultsKeepExactJsonTypes() {
        const QJsonObject any{{"type","any"}};
        for (const auto& value : QJsonArray{false,0,QJsonValue::Null,QJsonArray{false,0,QJsonValue::Null}}) {
            WorkflowDocument document;
            document.setNodeMetadata({
                QJsonObject{{"node_type","Node"},{"properties",QJsonArray{QJsonObject{{"name","in"},{"type",any}}}},{"outputs",QJsonArray{QJsonObject{{"name","out"},{"type",any}}}}},
                QJsonObject{{"node_type","nodetool.control.Reroute"},{"properties",QJsonArray{QJsonObject{{"name","input_value"},{"type",any},{"default",value}}}},{"outputs",QJsonArray{QJsonObject{{"name","output"},{"type",any}}}}}});
            QVERIFY(document.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"}],"edges":[{"id":"edge","source":"a","sourceHandle":"out","target":"b","targetHandle":"in"}]}})"));
            const auto inserted=document.applyCommand({{"op","insertReroute"},{"id","edge"},{"position",QJsonObject{{"x",0},{"y",0}}}});QVERIFY(inserted);
            const auto id=inserted.idMap["reroute"].toString();QCOMPARE(document.node(id)["data"].toObject()["input_value"],value);
            const auto snapshot=document.snapshot();WorkflowDocument restored;QVERIFY(restored.loadJson(QJsonDocument(snapshot).toJson()));QCOMPARE(restored.snapshot(),snapshot);
        }
    }
    void dynamicPortsAtomic() {
        WorkflowDocument d;
        QVERIFY(d.load(fixture()));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "unknown.Provider"}, {"supports_dynamic_inputs", true}, {"supports_dynamic_outputs", true}, {"properties", QJsonArray{QJsonObject{{"name", "reserved"}}}}}});
        const auto original = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicOutput"}, {"id", "a"}, {"name", "out"}, {"newName", "result"}}));
        QCOMPARE(d.edges()[0].toObject()["sourceHandle"].toString(), "result");
        QCOMPARE(d.edges()[0].toObject()["futureEdge"].toInt(), 42);
        QCOMPARE(d.undoStack()->count(), 1);
        d.undo(); QCOMPARE(d.snapshot(), original); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeDynamicOutput"}, {"id", "a"}, {"name", "result"}}));
        QVERIFY(d.edges().isEmpty());
        QCOMPARE(d.graph()["links"], original["graph"].toObject()["links"]);
        d.undo(); QCOMPARE(d.edges().size(), 1);
        QVERIFY(d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", "count"}, {"type", QJsonObject{{"type", "int"}}}}));
        QCOMPARE(d.node("a")["dynamic_properties"].toObject()["count"].toInt(), 0);
        QVERIFY(d.applyCommand({{"op", "renameDynamicInput"}, {"id", "a"}, {"name", "count"}, {"newName", "total"}}));
        QCOMPARE(d.node("a")["dynamic_inputs"].toObject()["total"].toObject()["type"].toObject()["type"].toString(), "int");
        QVERIFY(d.applyCommand({{"op", "removeDynamicInput"}, {"id", "a"}, {"name", "total"}}));
        QVERIFY(!d.node("a")["dynamic_properties"].toObject().contains("total"));
        d.undo();
        const auto beforeInvalid = d.snapshot(); const auto count = d.undoStack()->count();
        for (const auto& name : {QString("reserved"), QString("total"), QString("__control__"), QString(" bad ")}) {
            QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", name}}));
        }
        QVERIFY(!d.applyCommand({{"op", "addDynamicOutput"}, {"id", "a"}, {"name", "bad"}, {"type", QJsonObject{{"type", 7}}}}));
        QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "b"}, {"name", "bad"}}));
        QCOMPARE(d.snapshot(), beforeInvalid); QCOMPARE(d.undoStack()->count(), count);
        WorkflowDocument restored; QVERIFY(restored.loadJson(QJsonDocument(d.snapshot()).toJson())); QCOMPARE(restored.snapshot(), d.snapshot());
    }
    void dynamicOutputCorrelationAndUnsupportedContainers() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","dynamic_outputs":{"out":{"type":"str","future":9}},"dynamic_output_correlation":{"out":{"mode":"single","future":42}}}],"edges":[]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_outputs", true}, {"supports_dynamic_inputs", true}}});
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicOutput"}, {"id", "a"}, {"name", "out"}, {"newName", "result"}}));
        QCOMPARE(d.node("a")["dynamic_outputs"].toObject()["result"].toObject()["future"].toInt(), 9);
        QCOMPARE(d.node("a")["dynamic_output_correlation"].toObject()["result"].toObject()["future"].toInt(), 42);
        d.undo(); QCOMPARE(d.snapshot(), before);
        QVERIFY(d.applyCommand({{"op", "removeDynamicOutput"}, {"id", "a"}, {"name", "out"}}));
        QVERIFY(d.node("a")["dynamic_output_correlation"].toObject().isEmpty());
        auto malformed = before; auto graph = malformed["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto node = nodes[0].toObject();
        node["dynamic_properties"] = QJsonArray{1}; nodes[0] = node; graph["nodes"] = nodes; malformed["graph"] = graph;
        QVERIFY(d.load(malformed));
        QVERIFY(!d.applyCommand({{"op", "addDynamicInput"}, {"id", "a"}, {"name", "new"}}));
        QCOMPARE(d.snapshot(), malformed); QCOMPARE(d.undoStack()->count(), 0);
    }
    void linkedDynamicInput() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node","dynamic_properties":{"slot":"value"},"dynamic_inputs":{"slot":{"type":{"type":"str"},"future":42}}}],"edges":[{"id":"e","source":"a","sourceHandle":"out","target":"b","targetHandle":"slot"}]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"supports_dynamic_inputs", true}}});
        const auto before = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "renameDynamicInput"}, {"id", "b"}, {"name", "slot"}, {"newName", "renamed"}}));
        QCOMPARE(d.edges()[0].toObject()["targetHandle"].toString(), "renamed");
        QCOMPARE(d.node("b")["dynamic_inputs"].toObject()["renamed"].toObject()["future"].toInt(), 42);
        d.undo(); QCOMPARE(d.snapshot(), before); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeDynamicInput"}, {"id", "b"}, {"name", "renamed"}})); QVERIFY(d.edges().isEmpty());
        d.undo(); QCOMPARE(d.edges().size(), 1);
    }
    void detachedGeometry() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"g","type":"Group","ui_properties":{"position":{"x":1000,"y":500}}},{"id":"a","type":"Node","parent_id":"g","ui_properties":{"position":{"x":10,"y":20}}}],"edges":[]}})"));
        const auto result = d.duplicate({"a"}); QVERIFY(result);
        const auto position = d.node(result.idMap["a"].toString())["ui_properties"].toObject()["position"].toObject();
        QCOMPARE(position["x"].toDouble(), 1042.0); QCOMPARE(position["y"].toDouble(), 552.0);
    }
    void nestedGeometry() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"outer","type":"Group","ui_properties":{"position":{"x":1000,"y":500}}},{"id":"inner","type":"Group","parent_id":"outer","ui_properties":{"position":{"x":100,"y":50}}},{"id":"a","type":"Node","parent_id":"inner","ui_properties":{"position":{"x":10,"y":20}}}],"edges":[]}})"));
        const auto result = d.duplicate({"inner"}); QVERIFY(result);
        const auto inner = d.node(result.idMap["inner"].toString());
        const auto position = inner["ui_properties"].toObject()["position"].toObject();
        QCOMPARE(position["x"].toDouble(), 1132.0); QCOMPARE(position["y"].toDouble(), 582.0);
        const auto child = d.node(result.idMap["a"].toString());
        QCOMPARE(child["parent_id"], result.idMap["inner"]);
        QCOMPARE(child["ui_properties"].toObject()["position"], d.node("a")["ui_properties"].toObject()["position"]);
        d.undo();
        const auto all = d.duplicate({"outer"}); QVERIFY(all);
        QCOMPARE(d.node(all.idMap["inner"].toString())["parent_id"], all.idMap["outer"]);
    }
    void malformedDynamicOutput() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        QVERIFY(!d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "dynamic_outputs"}, {"value", QJsonObject{{"out", 42}}}}));
        auto source = fixture(); auto graph = source["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto n = nodes[0].toObject();
        n["dynamic_outputs"] = QJsonObject{{"out", 42}}; nodes[0] = n; graph["nodes"] = nodes; source["graph"] = graph;
        QVERIFY(d.load(source)); QVERIFY(d.isReadOnly()); QCOMPARE(d.snapshot(), source);
    }
    void connectionValidation() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node"},{"id":"b","type":"Node"},{"id":"loop","type":"nodetool.control.Loop"}],"edges":[]}})"));
        const QJsonArray inputs{QJsonObject{{"name", "in"}, {"type", QJsonObject{{"type", "any"}}}}, QJsonObject{{"name", "next"}, {"type", QJsonObject{{"type", "any"}}}}};
        const QJsonArray outputs{QJsonObject{{"name", "out"}, {"type", QJsonObject{{"type", "any"}}}}};
        const auto connect = [&](const QString& source, const QString& target, const QString& handle) {
            return d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", source}, {"target", target}, {"sourceHandle", "out"}, {"targetHandle", handle}}}});
        };
        QVERIFY(!connect("a", "b", "in"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}, {"properties", inputs}, {"outputs", outputs}}, QJsonObject{{"node_type", "nodetool.control.Loop"}, {"properties", inputs}, {"outputs", outputs}}});
        QVERIFY(!connect("a", "b", "")); QVERIFY(!connect("a", "b", "missing"));
        QVERIFY(connect("a", "b", "in"));
        const auto before = d.snapshot();
        QVERIFY(!connect("b", "a", "in")); QCOMPARE(d.snapshot(), before);
        QVERIFY(connect("loop", "a", "in")); QVERIFY(connect("b", "loop", "next"));
        d.undo(); d.redo();
        QCOMPARE(d.edges().size(), 3);
    }
    void typedConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Source"},{"id":"b","type":"Target"}],"edges":[]}})"));
        const auto type = [](const char* name) { return QJsonObject{{"type", name}}; };
        const auto connect = [&](QJsonObject source, QJsonObject target) {
            d.setNodeMetadata(QJsonArray{
                QJsonObject{{"node_type", "Source"}, {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", source}}}}},
                QJsonObject{{"node_type", "Target"}, {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", target}}}}}});
            return d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "in"}}}});
        };
        QVERIFY(!connect(type("str"), type("int")));
        QVERIFY(!connect(type("int"), type("float")));
        QVERIFY(connect(type("str"), QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("str")}}}));
        d.undo();
        QVERIFY(!connect(QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("str")}}},
                         QJsonObject{{"type", "list"}, {"type_args", QJsonArray{type("int")}}}));
        QVERIFY(connect(QJsonObject{{"type", "union"}, {"type_args", QJsonArray{type("str"), type("int")}}}, type("int")));
        d.undo();
        QVERIFY(connect(type("any"), type("image")));
    }
    void modelDefaultsMatchWebEmptiness() {
        const QJsonObject empty{{"null", QJsonValue::Null}, {"false", false}, {"zero", 0}, {"string", ""},
            {"sentinel", QJsonObject{{"provider", "empty"}}}, {"provider", QJsonObject{{"provider", ""}}},
            {"id", QJsonObject{{"id", ""}}}};
        const QJsonObject occupied{{"true", true}, {"number", 7}, {"text", "saved"}, {"object", QJsonObject{}},
            {"partial", QJsonObject{{"id", "saved"}}}, {"array", QJsonArray{}}};
        auto data = empty;
        QJsonObject values{{"missing", "default"}};
        for (auto it = occupied.cbegin(); it != occupied.cend(); ++it) { data.insert(it.key(), it.value()); }
        for (auto it = data.cbegin(); it != data.cend(); ++it) { values.insert(it.key(), "default"); }
        WorkflowDocument document;
        QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{
            {"id", "a"}, {"type", "Node"}, {"data", data}}}}, {"edges", QJsonArray{}}}}}));
        document.applyPropertyDefaults({{"a", values}});
        const auto updated = document.node("a")["data"].toObject();
        QCOMPARE(updated["missing"].toString(), "default");
        for (auto it = empty.cbegin(); it != empty.cend(); ++it) { QCOMPARE(updated[it.key()].toString(), "default"); }
        for (auto it = occupied.cbegin(); it != occupied.cend(); ++it) { QCOMPARE(updated[it.key()], it.value()); }
        QCOMPARE(document.undoStack()->count(), 0);
    }
    void modelDefaultsRetainHistoryAndLaterClears() {
        WorkflowDocument document;
        QVERIFY(document.loadJson(R"({"id":"workflow","graph":{"nodes":[{"id":"a","type":"Node","data":{"model":{"provider":"empty"},"existing":{"id":"chosen","provider":"user"},"future":42}},{"id":"b","type":"Node"}],"edges":[]}})"));
        QVERIFY(document.applyCommand({{"op", "renameNode"}, {"id", "a"}, {"title", "Before defaults"}}));
        QVERIFY(document.applyCommand({{"op", "moveNodes"}, {"positions", QJsonObject{{"a", QJsonObject{{"x", 2}, {"y", 3}}}}}}));
        const QJsonObject model{{"id", "default-model"}, {"provider", "fixture"}};
        const QHash<QString, QJsonObject> defaults{{"a", QJsonObject{{"model", model}, {"existing", model}}},
            {"missing", QJsonObject{{"model", model}}}};
        const auto count = document.undoStack()->count();
        QSignalSpy replaced(&document, &WorkflowDocument::replaced);
        document.applyPropertyDefaults(defaults);
        QCOMPARE(document.undoStack()->count(), count);
        QVERIFY(!document.undoStack()->isClean());
        QCOMPARE(replaced.count(), 0);
        QCOMPARE(document.node("a")["data"].toObject()["model"].toObject(), model);
        QCOMPARE(document.node("a")["data"].toObject()["existing"].toObject()["id"].toString(), "chosen");
        QCOMPARE(document.node("a")["data"].toObject()["future"].toInt(), 42);
        document.undo(); document.undo();
        QCOMPARE(document.node("a")["data"].toObject()["model"].toObject(), model);
        document.redo(); document.redo();
        const QJsonObject type{{"type", "language_model"}, {"optional", true}};
        document.setNodeMetadata({QJsonObject{{"node_type", "Node"}, {"properties", QJsonArray{
            QJsonObject{{"name", "model"}, {"type", type}}}}}});
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "model"}, {"value", QJsonValue::Null}}));
        QVERIFY(document.node("a")["data"].toObject()["model"].isNull());
        document.undo();
        QCOMPARE(document.node("a")["data"].toObject()["model"].toObject(), model);
        document.redo();
        QVERIFY(document.node("a")["data"].toObject()["model"].isNull());
    }
    void pastedCycleChecksIncludePreservedPaths() {
        const QJsonObject type{{"type", "str"}};
        const auto edge = [](const QString& id, const QString& source, const QString& target) {
            return QJsonObject{{"id", id}, {"source", source}, {"target", target}, {"sourceHandle", "out"}, {"targetHandle", "in"}};
        };
        QJsonArray nodes;
        for (const auto& id : {"a", "b", "c", "d", "e"}) { nodes.append(QJsonObject{{"id", id}, {"type", "Node"}}); }
        const QJsonArray preserved{edge("ab", "a", "b"), edge("ba", "b", "a"), edge("bc", "b", "c"), edge("cd", "c", "d")};
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "Node"},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", type}}}},
            {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", type}}}}}});
        QVERIFY(document.load({{"graph", QJsonObject{{"nodes", nodes}, {"edges", preserved}}}}));
        const auto before = document.snapshot();
        auto fragment = document.graph();
        auto edges = preserved; edges.append(edge("ce", "c", "e")); fragment["edges"] = edges;
        QVERIFY(document.applyCommand({{"op", "paste"}, {"fragment", fragment}}));
        document.undo(); QCOMPARE(document.snapshot(), before);
        edges = preserved; edges.append(edge("da", "d", "a")); fragment["edges"] = edges;
        const auto rejected = document.applyCommand({{"op", "paste"}, {"fragment", fragment}});
        QVERIFY(!rejected); QCOMPARE(rejected.error, "Connection creates a cycle");
        QCOMPARE(document.snapshot(), before); QCOMPARE(document.undoStack()->index(), 0);
        edges = preserved; edges.append(edge("duplicate", "a", "b")); fragment["edges"] = edges;
        const auto duplicate = document.applyCommand({{"op", "paste"}, {"fragment", fragment}});
        QVERIFY(!duplicate); QCOMPARE(duplicate.error, "Duplicate pasted connection");
        QCOMPARE(document.snapshot(), before);
    }
    void pastedLoopFeedbackAndSelfConnections() {
        WorkflowDocument document;
        const QJsonObject type{{"type", "str"}};
        QJsonArray catalog;
        for (const auto& name : {"Node", "nodetool.control.Loop"}) {
            catalog.append(QJsonObject{{"node_type", name},
                {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", type}}}},
                {"properties", QJsonArray{QJsonObject{{"name", "next"}, {"type", type}}}}});
        }
        document.setNodeMetadata(catalog);
        const QJsonArray nodes{QJsonObject{{"id", "a"}, {"type", "Node"}}, QJsonObject{{"id", "loop"}, {"type", "nodetool.control.Loop"}}};
        QJsonObject forward{{"source", "a"}, {"target", "loop"}, {"sourceHandle", "out"}, {"targetHandle", "next"}};
        const QJsonObject reverse{{"source", "loop"}, {"target", "a"}, {"sourceHandle", "out"}, {"targetHandle", "next"}};
        QJsonObject fragment{{"nodes", nodes}, {"edges", QJsonArray{forward, reverse}}};
        QVERIFY(document.applyCommand({{"op", "paste"}, {"fragment", fragment}}));
        document.undo();
        forward["source"] = "loop";
        fragment["edges"] = QJsonArray{forward};
        const auto before = document.snapshot();
        const auto result = document.applyCommand({{"op", "paste"}, {"fragment", fragment}});
        QVERIFY(!result); QCOMPARE(result.error, "Self connections are unsupported");
        QCOMPARE(document.snapshot(), before);
    }
    void pasteScaling_data() {
        QTest::addColumn<int>("size");
        QTest::addColumn<bool>("preserved");
        for (const int size : {250, 1000, 4000}) {
            QTest::newRow(qPrintable(QString("external-%1").arg(size))) << size << false;
            QTest::newRow(qPrintable(QString("preserved-%1").arg(size))) << size << true;
        }
    }
    void pasteScaling() {
        QFETCH(int, size);
        QFETCH(bool, preserved);
        QJsonArray nodes, edges;
        for (int i = 0; i < size; ++i) {
            nodes.append(QJsonObject{{"id", QString::number(i)}, {"type", "Node"}});
            if (i > 0) {
                edges.append(QJsonObject{{"id", QString("edge-%1").arg(i)},
                    {"source", QString::number(i - 1)}, {"target", QString::number(i)},
                    {"sourceHandle", "out"}, {"targetHandle", "in"}, {"future", 42}});
            }
        }
        const QJsonObject fragment{{"nodes", nodes}, {"edges", edges}};
        WorkflowDocument document;
        const QJsonObject type{{"type", "str"}};
        document.setNodeMetadata({QJsonObject{{"node_type", "Node"},
            {"outputs", QJsonArray{QJsonObject{{"name", "out"}, {"type", type}}}},
            {"properties", QJsonArray{QJsonObject{{"name", "in"}, {"type", type}}}}}});
        if (preserved) { QVERIFY(document.load({{"graph", fragment}})); }
        const auto before = document.snapshot();
        QElapsedTimer timer;
        timer.start();
        const auto result = document.applyCommand({{"op", "paste"}, {"fragment", fragment}});
        const double elapsed = timer.nsecsElapsed() / 1000000.0;
        QVERIFY2(result, qPrintable(result.error));
        qInfo().nospace() << "paste N=" << size << " E=" << edges.size()
            << " preserved=" << preserved << " elapsed_ms=" << elapsed;
        QCOMPARE(result.idMap.size(), size);
        QCOMPARE(document.undoStack()->count(), 1);
        QCOMPARE(document.nodes().size(), preserved ? size * 2 : size);
        const auto after = document.snapshot();
        const auto pastedEdges = document.edges();
        QSet<QString> ids;
        for (const auto &entry : pastedEdges) {
            const auto edge = entry.toObject();
            QVERIFY(!ids.contains(edge["id"].toString()));
            ids.insert(edge["id"].toString());
            QCOMPARE(edge["future"].toInt(), 42);
        }
        const qsizetype offset = preserved ? edges.size() : 0;
        for (qsizetype i = 0; i < edges.size(); ++i) {
            const auto original = edges.at(i).toObject();
            const auto pasted = pastedEdges.at(offset + i).toObject();
            QCOMPARE(pasted["source"], result.idMap[original["source"].toString()]);
            QCOMPARE(pasted["target"], result.idMap[original["target"].toString()]);
        }
        document.undo(); QCOMPARE(document.snapshot(), before);
        document.redo(); QCOMPARE(document.snapshot(), after);
    }
    void externalPasteValidation() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        const auto copied = d.copy({"a", "b"});
        QVERIFY(d.applyCommand({{"op", "paste"}, {"fragment", copied}}));
        d.undo();
        auto changed = copied;
        auto nodes = changed["nodes"].toArray();
        auto source = nodes[0].toObject(); source["type"] = "external.Unknown"; nodes[0] = source;
        changed["nodes"] = nodes;
        const auto before = d.snapshot();
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", changed}}));
        QCOMPARE(d.snapshot(), before);
        QCOMPARE(d.undoStack()->index(), 0);
    }
    void controlConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"nodetool.agents.Agent"},{"id":"b","type":"Unknown"},{"id":"c","type":"nodetool.agents.Other"}],"edges":[]}})"));
        const auto edge = [](const char* source, const char* target) {
            return QJsonObject{{"source", source}, {"target", target}, {"sourceHandle", "__control__"}, {"targetHandle", "__control__"}, {"edge_type", "control"}};
        };
        QVERIFY(d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "b")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("b", "c")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "a")}}));
        QVERIFY(d.applyCommand({{"op", "addEdge"}, {"edge", edge("c", "a")}}));
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge("a", "c")}}));
        auto malformed = edge("a", "c"); malformed["targetHandle"] = "in";
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", malformed}}));
        malformed = edge("a", "c"); malformed.remove("edge_type");
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", malformed}}));
        const auto original = d.snapshot(); d.undo(); d.redo(); QCOMPARE(d.snapshot(), original);
    }
    void dynamicAndPastedConnections() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[{"id":"a","type":"Node","dynamic_outputs":{"out":{"type":"str"}}},{"id":"b","type":"Node","dynamic_inputs":{"in":{"type":{"type":"int"}}}}],"edges":[]}})"));
        d.setNodeMetadata(QJsonArray{QJsonObject{{"node_type", "Node"}}});
        const QJsonObject edge{{"source", "a"}, {"target", "b"}, {"sourceHandle", "out"}, {"targetHandle", "in"}};
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", edge}}));
        QVERIFY(d.applyCommand({{"op", "setNodeField"}, {"id", "b"}, {"field", "dynamic_inputs"},
                                {"value", QJsonObject{{"in", QJsonObject{{"type", "str"}}}}}}));
        auto fragment = d.graph(); fragment["edges"] = QJsonArray{edge};
        QVERIFY(d.applyCommand({{"op", "paste"}, {"fragment", fragment}}));
        d.undo();
        auto bad = fragment;
        auto badEdges = bad["edges"].toArray();
        auto missing = edge; missing["targetHandle"] = "missing"; badEdges.append(missing); bad["edges"] = badEdges;
        const auto before = d.snapshot(); const auto count = d.undoStack()->count();
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        QCOMPARE(d.snapshot(), before); QCOMPARE(d.undoStack()->count(), count);
        badEdges = QJsonArray{edge, edge}; bad["edges"] = badEdges;
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        auto nodes = fragment["nodes"].toArray();
        for (qsizetype i = 0; i < nodes.size(); ++i) {
            auto n = nodes[i].toObject();
            n["dynamic_inputs"] = QJsonObject{{"in", QJsonObject{{"type", "str"}}}};
            n["dynamic_outputs"] = QJsonObject{{"out", QJsonObject{{"type", "str"}}}};
            nodes[i] = n;
        }
        bad["nodes"] = nodes;
        auto reverse = edge; reverse["source"] = "b"; reverse["target"] = "a";
        bad["edges"] = QJsonArray{edge, reverse};
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        bad["edges"] = QJsonArray{reverse, edge};
        QVERIFY(!d.applyCommand({{"op", "paste"}, {"fragment", bad}}));
        QCOMPARE(d.snapshot(), before);
    }
    void metadataFreePropertyRejected() {
        WorkflowDocument document;
        QVERIFY(document.load(fixture()));
        const auto before = document.snapshot();
        QSignalSpy spy(&document, &WorkflowDocument::changed);
        const auto result = document.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "new"}});
        QVERIFY(!result);
        QVERIFY(!result.error.isEmpty());
        QCOMPARE(document.snapshot(), before);
        QCOMPARE(document.undoStack()->count(), 0);
        QCOMPARE(spy.count(), 0);
    }
    void roundtrip() {
        WorkflowDocument document;
        document.setNodeMetadata({QJsonObject{{"node_type", "unknown.Provider"},
            {"properties", QJsonArray{QJsonObject{{"name", "prompt"}, {"type", QJsonObject{{"type", "str"}}}}}}}});
        const auto source = fixture();
        QVERIFY(document.load(source));
        QCOMPARE(document.snapshot(), source);
        QVERIFY(!document.isReadOnly());
        QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "new"}}));
        auto expected = source; auto graph = expected["graph"].toObject(); auto nodes = graph["nodes"].toArray(); auto node = nodes[0].toObject(); auto data = node["data"].toObject(); data["prompt"] = "new"; node["data"] = data; nodes[0] = node; graph["nodes"] = nodes; expected["graph"] = graph;
        QCOMPARE(document.snapshot(), expected);
        document.undo(); QCOMPARE(document.snapshot(), source);
        document.redo(); QCOMPARE(document.snapshot(), expected);
    }
    void atomicBatch() {
        WorkflowDocument d;
        d.setNodeMetadata({QJsonObject{{"node_type", "unknown.Provider"},
            {"properties", QJsonArray{QJsonObject{{"name", "prompt"}, {"type", QJsonObject{{"type", "str"}}}}}}}});
        QVERIFY(d.load(fixture())); const auto before = d.snapshot(); QSignalSpy spy(&d, &WorkflowDocument::changed);
        QJsonArray commands{QJsonObject{{"op", "setProperty"}, {"id", "a"}, {"name", "prompt"}, {"value", "changed"}}, QJsonObject{{"op", "removeEdge"}, {"id", "missing"}}};
        QVERIFY(!d.applyCommand({{"op", "batch"}, {"commands", commands}}));
        QCOMPARE(d.snapshot(), before); QCOMPARE(d.undoStack()->count(), 0); QCOMPARE(spy.count(), 0);
        commands[1] = QJsonObject{{"op", "removeEdge"}, {"id", "e"}};
        QVERIFY(d.applyCommand({{"op", "batch"}, {"commands", commands}}));
        QCOMPARE(d.undoStack()->count(), 1); QCOMPARE(spy.count(), 1); QCOMPARE(d.edges().size(), 0);
        d.undo(); QCOMPARE(d.snapshot(), before); d.redo(); QCOMPARE(d.edges().size(), 0);
    }
    void pasteAndDelete() {
        WorkflowDocument d; QVERIFY(d.load(fixture())); const auto original = d.snapshot();
        const auto result = d.duplicate({"a", "b"}); QVERIFY(result); QCOMPARE(result.idMap.size(), 2);
        QCOMPARE(d.nodes().size(), 4); QCOMPARE(d.edges().size(), 2);
        const auto e = d.edges()[1].toObject(); QCOMPARE(e["source"], result.idMap["a"]); QCOMPARE(e["sourceHandle"].toString(), QString("out"));
        QCOMPARE(d.graph()["links"].toArray().size(), 2);
        QCOMPARE(d.node(result.idMap["a"].toString())["dynamic_inputs"], d.node("a")["dynamic_inputs"]);
        QVERIFY(result.idMap["a"].toString().size() == 32);
        d.undo(); QCOMPARE(d.snapshot(), original); d.redo();
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"a"}}}));
        QCOMPARE(d.nodes().size(), 3); QCOMPARE(d.edges().size(), 1); QCOMPARE(d.graph()["links"].toArray().size(), 1);
        d.undo(); QCOMPARE(d.nodes().size(), 4);
    }
    void invalidAndReadOnly() {
        WorkflowDocument d; QVERIFY(d.load(fixture())); const auto before = d.snapshot();
        QVERIFY(!d.applyCommand({{"op", "addEdge"}, {"edge", QJsonObject{{"source", "a"}, {"sourceHandle", "out"}, {"target", "missing"}, {"targetHandle", "in"}}}}));
        QVERIFY(!d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "id"}, {"value", "replacement"}}));
        QVERIFY(!d.loadJson("not JSON")); QCOMPARE(d.snapshot(), before);
        auto broken = before; auto graph = broken["graph"].toObject(); graph["links"] = "future encoding"; broken["graph"] = graph;
        QVERIFY(d.load(broken)); QVERIFY(d.isReadOnly()); QCOMPARE(d.snapshot(), broken);
        QVERIFY(!d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"a"}}})); QCOMPARE(d.snapshot(), broken);
    }
    void largeGraph() {
        QJsonArray nodes, edges;
        for (int i = 0; i < 1000; ++i) {
            nodes.append(QJsonObject{{"id", QString::number(i)}, {"type", "test.Node"}});
        }
        for (int i = 0; i < 2000; ++i) {
            edges.append(QJsonObject{{"id", QString("edge%1").arg(i)}, {"source", QString::number(i % 999)}, {"target", QString::number((i % 999) + 1)}, {"sourceHandle", QString("out%1").arg(i)}, {"targetHandle", QString("in%1").arg(i)}});
        }
        WorkflowDocument d;
        const QJsonObject source{{"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
        QVERIFY(d.load(source));
        QCOMPARE(d.snapshot(), source);
        const auto result = d.duplicate({"0", "1", "2"}); QVERIFY(result);
        QCOMPARE(d.nodes().size(), 1003);
        d.undo(); QCOMPARE(d.snapshot(), source);
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"1"}}}));
        d.undo(); QCOMPARE(d.snapshot(), source);
    }
    void groupDisableAffectsRunnableDescendantsAtomically() {
        WorkflowDocument d;
        QVERIFY(d.loadJson(R"({"graph":{"nodes":[
            {"id":"group","type":"nodetool.workflows.base_node.Group","data":{"headline":"Group","future":7}},
            {"id":"nested","type":"nodetool.workflows.Group","parent_id":"group","future":8},
            {"id":"comment","type":"nodetool.workflows.base_node.Comment","parent_id":"nested","data":{"comment":"Keep"}},
            {"id":"a","type":"Node","parent_id":"nested","ui_properties":{"position":{"x":3,"y":4},"future":9}},
            {"id":"b","type":"Node","parent_id":"group","ui_properties":{"bypassed":true}},
            {"id":"unrelated","type":"Node"}
        ],"edges":[]}})"));
        const auto before=d.snapshot();
        QVERIFY(d.applyCommand({{"op","setDisabled"},{"ids",QJsonArray{"group","nested","a","comment"}},{"disabled",true}}));
        QCOMPARE(d.undoStack()->count(),1);
        QVERIFY(d.node("a")["ui_properties"].toObject()["bypassed"].toBool());
        QVERIFY(d.node("b")["ui_properties"].toObject()["bypassed"].toBool());
        QCOMPARE(d.node("a")["ui_properties"].toObject()["future"].toInt(),9);
        const auto originalNodes=before["graph"].toObject()["nodes"].toArray();
        for(int i : {0,1,2,5}){QCOMPARE(d.node(originalNodes[i].toObject()["id"].toString()),originalNodes[i].toObject());}
        const auto disabled=d.snapshot(); d.undo(); QCOMPARE(d.snapshot(),before); d.redo(); QCOMPARE(d.snapshot(),disabled);
        QVERIFY(d.applyCommand({{"op","setDisabled"},{"ids",QJsonArray{"group"}},{"disabled",false}}));
        QVERIFY(!d.node("a")["ui_properties"].toObject()["bypassed"].toBool()); QVERIFY(!d.node("b")["ui_properties"].toObject()["bypassed"].toBool());
        d.undo(); QCOMPARE(d.snapshot(),disabled);
        QVERIFY(d.applyCommand({{"op","setDisabled"},{"ids",QJsonArray{"comment"}},{"disabled",true}})); QCOMPARE(d.snapshot(),disabled);
        QVERIFY(!d.applyCommand({{"op","setDisabled"},{"ids",QJsonArray{"group","missing"}},{"disabled",true}})); QCOMPARE(d.snapshot(),disabled);
    }
    void groupsAndDisabled() {
        WorkflowDocument d; QVERIFY(d.load(fixture()));
        QVERIFY(d.applyCommand({{"op", "addNode"}, {"node", QJsonObject{{"id", "group"}, {"type", "nodetool.workflows.Group"}, {"data", QJsonObject{{"comment", "keep"}}}}}}));
        QVERIFY(d.applyCommand({{"op", "setNodeField"}, {"id", "a"}, {"field", "parent_id"}, {"value", "group"}}));
        const auto grouped = d.snapshot();
        QVERIFY(d.applyCommand({{"op", "setDisabled"}, {"ids", QJsonArray{"a", "b"}}, {"disabled", false}}));
        QVERIFY(!d.node("a")["ui_properties"].toObject()["bypassed"].toBool()); d.undo(); QCOMPARE(d.snapshot(), grouped);
        const auto result = d.duplicate({"group"}); QVERIFY(result); QCOMPARE(result.idMap.size(), 2);
        QCOMPARE(d.node(result.idMap["a"].toString())["parent_id"], result.idMap["group"]);
        d.undo(); QCOMPARE(d.snapshot(), grouped);
        QVERIFY(d.applyCommand({{"op", "removeNodes"}, {"ids", QJsonArray{"group"}}})); QCOMPARE(d.nodes().size(), 1); QCOMPARE(d.edges().size(), 0); d.undo(); QCOMPARE(d.snapshot(), grouped);
    }
};
QTEST_GUILESS_MAIN(WorkflowDocumentTest)
#include "WorkflowDocumentTest.moc"
