#include "run/PartialRunPlanner.h"
#include <QtTest>
#include <QJSEngine>
#include <QJsonDocument>
#include <QFile>
#include <QRandomGenerator>
#include <cmath>
using namespace nodetool::node_editor;
namespace {
QJsonObject node(const QString &id, const QString &type, QJsonObject data = {}) { return {{"id",id},{"type",type},{"data",data},{"future",true}}; }
QJsonObject edge(const QString &source, const QString &target, const QString &handle = "input") { return {{"id",source+target+handle},{"source",source},{"target",target},{"sourceHandle","out"},{"targetHandle",handle}}; }
QJsonObject workflow(const QJsonArray &nodes, const QJsonArray &edges) { return {{"id","workflow"},{"graph",QJsonObject{{"nodes",nodes},{"edges",edges},{"future",true}}}}; }
QJsonArray metadata() { return {QJsonObject{{"node_type","computed"},{"cache_ttl",60}},QJsonObject{{"node_type","target"}},QJsonObject{{"node_type","generator"},{"auto_save_asset",true},{"title","Generator"}}}; }
QJsonObject fixture() { return workflow({node("constant","nodetool.constant.Integer",{{"value",1}}),node("cached","computed"),node("target","target"),node("other","computed")},{edge("constant","cached"),edge("cached","target")}); }
QStringList ids(const QJsonObject &snapshot) { QStringList result; for (const auto &v : snapshot["graph"].toObject()["nodes"].toArray()) { result.append(v.toObject()["id"].toString()); } return result; }
QJsonObject find(const QJsonObject &snapshot, const QString &id) { for (const auto &v : snapshot["graph"].toObject()["nodes"].toArray()) { if (v.toObject()["id"] == id) { return v.toObject(); } } return {}; }
ExecutionGeneration generation(QString id, qint64 created, QJsonObject outputs, QString signature = {}) { return {id,"old-job",created,outputs,signature}; }
}
class PartialRunPlannerTest final : public QObject {
 Q_OBJECT
private slots:
 void groupsExpandRunnableDescendantsAndPreserveDocument() {
  auto outer=node("outer","nodetool.workflows.base_node.Group",{{"headline","Outer"}});
  outer["ui_properties"]=QJsonObject{{"position",QJsonObject{{"x",100},{"y",200}}}};
  auto inner=node("inner","nodetool.workflows.Group"); inner["parent_id"]="outer";
  auto comment=node("comment","nodetool.workflows.base_node.Comment",{{"comment",QJsonObject{{"root",QJsonObject{{"future",true}}}}}}); comment["parent_id"]="inner";
  auto a=node("a","target"); a["parent_id"]="inner"; a["ui_properties"]=QJsonObject{{"position",QJsonObject{{"x",10},{"y",20}}}};
  auto b=node("b","target"); b["parent_id"]="outer";
  auto disabled=node("disabled","target"); disabled["parent_id"]="inner"; disabled["ui_properties"]=QJsonObject{{"bypassed",true}};
  const auto snapshot=workflow({node("g","generator"),outer,inner,comment,a,b,disabled,node("unrelated","target")},{edge("g","a"),edge("a","b"),edge("comment","a","annotation")});
  ExecutionGenerations cache{{"g",{generation("cached",10,{{"out",42}})}}};
  const auto plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"outer","inner","a","comment"});
  QVERIFY2(plan.ok,qPrintable(plan.error)); QCOMPARE(plan.executed,(QStringList{"a","b"})); QCOMPARE(ids(plan.snapshot),(QStringList{"a","b"}));
  QCOMPARE(find(plan.snapshot,"a")["parent_id"].toString(),"inner"); QCOMPARE(find(plan.snapshot,"a")["ui_properties"],a["ui_properties"]);
  QCOMPARE(find(plan.snapshot,"a")["data"].toObject()["input"].toInt(),42); QCOMPARE(plan.reused,QStringList{"g"});
  QCOMPARE(plan.snapshot["graph"].toObject()["edges"].toArray(),QJsonArray{edge("a","b")});
  QCOMPARE(snapshot["graph"].toObject()["nodes"].toArray()[1].toObject(),outer);
  const auto child=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"a"}); QVERIFY(child.ok); QCOMPARE(child.executed,QStringList{"a"});
  const auto blocked=PartialRunPlanner(snapshot,metadata(),{},1000).plan({"outer"}); QVERIFY(!blocked.ok); QCOMPARE(blocked.blocked,QStringList{"g"});
  const auto explicitUpstream=PartialRunPlanner(snapshot,metadata(),{},1000).plan({"outer","g"}); QVERIFY(explicitUpstream.ok); QCOMPARE(explicitUpstream.executed,(QStringList{"g","a","b"}));
  QVERIFY(!PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"comment"}).ok);
  const auto withMissingComputed=workflow({node("g","generator"),node("computed","computed"),outer,inner,comment,a,b},{edge("g","computed"),edge("computed","a"),edge("a","b")});
  const auto grown=PartialRunPlanner(withMissingComputed,metadata(),cache,1000).plan({"outer"}); QVERIFY2(grown.ok,qPrintable(grown.error));
  QCOMPARE(grown.executed,(QStringList{"computed","a","b"})); QCOMPARE(grown.reused,QStringList{"g"});
  QCOMPARE(find(grown.snapshot,"computed")["data"].toObject()["input"].toInt(),42);
 }
 void groupHierarchyValidationAndDeepExpansion() {
  auto a=node("a","target"); a["parent_id"]="missing";
  QVERIFY(!PartialRunPlanner(workflow({a},{}),metadata(),{},1000).plan({"a"}).ok);
  auto g=node("g","nodetool.workflows.base_node.Group"); g["parent_id"]="g";
  QVERIFY(!PartialRunPlanner(workflow({g},{}),metadata(),{},1000).plan({"g"}).ok);
  g["parent_id"]="a"; a["parent_id"]="g";
  QVERIFY(!PartialRunPlanner(workflow({g,a},{}),metadata(),{},1000).plan({"g"}).ok);
  constexpr int count=12000; QJsonArray nodes;
  for(int i=0;i<count;++i){auto group=node(QString::number(i),"nodetool.workflows.base_node.Group");if(i>0){group["parent_id"]=QString::number(i-1);}nodes.append(group);}
  a["parent_id"]=QString::number(count-1); nodes.append(a);
  const auto plan=PartialRunPlanner(workflow(nodes,{}),metadata(),{},1000).plan({"0"}); QVERIFY2(plan.ok,qPrintable(plan.error)); QCOMPARE(plan.executed,QStringList{"a"}); QCOMPARE(ids(plan.snapshot),QStringList{"a"});
 }
 void mixedListContributorsUseLosslessConstantFeeders() {
  auto listMetadata=metadata(); listMetadata.append(QJsonObject{{"node_type","collector"},{"properties",QJsonArray{QJsonObject{{"name","input"},{"type",QJsonObject{{"type","list"},{"type_args",QJsonArray{QJsonObject{{"type","int"}}}}}}}}}});
  auto target=node("target","collector",{{"input",QJsonArray{999}}}); target["parent_id"]="group";
  auto snapshot=workflow({node("g","generator"),node("live","computed"),node("group","nodetool.workflows.base_node.Group"),target},{edge("g","target"),edge("live","target")});
  ExecutionGenerations cache{{"g",{generation("completed",10,{{"out",QJsonArray{1,2}}})}}};
  const auto before=snapshot;
  const auto plan=PartialRunPlanner(snapshot,listMetadata,cache,1000).plan({"target"}); QVERIFY2(plan.ok,qPrintable(plan.error));
  QCOMPARE(plan.executed,(QStringList{"live","target"})); QCOMPARE(plan.reused,QStringList{"g"}); QCOMPARE(snapshot,before);
  const auto planned=plan.snapshot["graph"].toObject(); const auto feeder=planned["nodes"].toArray()[0].toObject();
  QVERIFY(feeder["id"].toString().startsWith("cached:")); QCOMPARE(feeder["type"].toString(),"nodetool.input.ValueInput"); QCOMPARE(feeder["data"].toObject()["value"].toArray(),(QJsonArray{1,2}));
  QCOMPARE(find(plan.snapshot,"target")["data"].toObject()["input"].toArray(),QJsonArray{999});
  QCOMPARE(planned["edges"].toArray()[0].toObject()["source"],feeder["id"]); QCOMPARE(planned["edges"].toArray()[0].toObject()["sourceHandle"].toString(),"output");
  QCOMPARE(planned["edges"].toArray()[1].toObject(),edge("live","target"));
  QCOMPARE(plan.snapshot,PartialRunPlanner(snapshot,listMetadata,cache,1000).plan({"target"}).snapshot);
  const auto exportPath=qEnvironmentVariable("NODETOOL_PARTIAL_PLAN_EXPORT");
  if(!exportPath.isEmpty()){QFile file(exportPath);QVERIFY(file.open(QIODevice::WriteOnly));QVERIFY(file.write(QJsonDocument(plan.snapshot).toJson())>0);}
  auto collision=before; auto graph=collision["graph"].toObject(); auto nodes=graph["nodes"].toArray(); nodes.append(node(feeder["id"].toString(),"target")); graph["nodes"]=nodes; collision["graph"]=graph;
  QVERIFY(!PartialRunPlanner(collision,listMetadata,cache,1000).plan({"target"}).ok);
 }
 void signaturesMatchWebHashAndCanonicalNumbers() {
  QJSEngine engine;
  // Independent JavaScript oracle from web/src/utils/nodeHash.ts. This verifies
  // UTF-16 cyrb53 arithmetic and JSON number/string serialization across Qt/JS.
  const auto oracle=engine.evaluate(R"JS((function(value) {
    const hash = str => {
      let h1=0xdeadbeef,h2=0x41c6ce57;
      for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
      h1=Math.imul(h1^(h1>>>16),2246822507);h1^=Math.imul(h2^(h2>>>13),3266489909);
      h2=Math.imul(h2^(h2>>>16),2246822507);h2^=Math.imul(h1^(h1>>>13),3266489909);
      return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');
    };
    const canonical = value => {
      if(value===null || value===undefined)return 'null';
      if(typeof value==='number'||typeof value==='boolean')return String(value);
      if(typeof value==='string')return JSON.stringify(value);
      if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
      const id=value.asset_id ?? value.assetId ?? value.uri;
      if(typeof id==='string' && id!=='')return 'asset:'+id;
      return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    };
    return hash(['v1','nodetool.constant.Value',canonical({p:{value:value},d:{}}),'false',''].join('\u0000'));
  }))JS");
  QVERIFY(oracle.isCallable());
  QJsonArray values{QJsonValue::Null,true,0,1.25,1e-7,1e-6,1e20,1e21,-1.5e-7,1.2345678901234567,1000000000000000128.0,QJsonValue(qint64(9007199254740993LL)),QString::fromUtf8("text 🔮\n\""),QJsonArray{1,2,3},QJsonObject{{"uri","asset://id"},{"ignored",123}},QJsonObject{{"uri",""},{"data",4}}};
  QRandomGenerator random(47);
  for(int i=0;i<1000;++i){values.append((random.generateDouble()-0.5)*std::pow(10.0,int(random.bounded(600))-300));}
  for(const auto &value:values){
    const auto snapshot=workflow({node("c","nodetool.constant.Value",{{"value",value}})},{});
    const auto js=engine.evaluate(QStringLiteral("(")+QString::fromUtf8(QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact))+QStringLiteral(")[0]"));
    const auto expected=oracle.call({js}); QVERIFY(!expected.isError());
    const auto actual=PartialRunPlanner(snapshot,{}, {},1000).inputSignature("c");
    QVERIFY2(actual==expected.toString(),qPrintable(QString::fromUtf8(QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact))+" actual="+actual+" expected="+expected.toString()));
  }
 }
 void computedCacheValidityAndEdits() {
  const auto original=fixture(); const qint64 now=100000;
  PartialRunPlanner hasher(original,metadata(),{},now); const auto signature=hasher.inputSignature("cached");
  ExecutionGenerations cache{{"cached",{generation("cached-generation",now-1000,{{"out",9}},signature)}}};
  auto plan=PartialRunPlanner(original,metadata(),cache,now).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),QStringList{"target"}); QCOMPARE(find(plan.snapshot,"target")["data"].toObject()["input"].toInt(),9);
  QCOMPARE(original,fixture()); QCOMPARE(plan.reused,QStringList{"cached"});
  cache["cached"][0].createdAt=now-60000; plan=PartialRunPlanner(original,metadata(),cache,now).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"cached","target"}));
  cache["cached"][0].createdAt=now+1; plan=PartialRunPlanner(original,metadata(),cache,now).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"cached","target"}));
  cache["cached"][0].createdAt=now-1000; cache["cached"][0].inputSignature="mismatch"; QCOMPARE(ids(PartialRunPlanner(original,metadata(),cache,now).plan({"target"}).snapshot),(QStringList{"cached","target"}));
  cache["cached"][0].inputSignature=signature;
  auto edited=original; auto graph=edited["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto constant=nodes[0].toObject(); constant["data"]=QJsonObject{{"value",2}}; nodes[0]=constant; graph["nodes"]=nodes; edited["graph"]=graph;
  QCOMPARE(ids(PartialRunPlanner(edited,metadata(),cache,now).plan({"target"}).snapshot),(QStringList{"cached","target"}));
  constant["data"]=QJsonObject{{"value",1}}; constant["ui_properties"]=QJsonObject{{"title","Presentation only"},{"position",QJsonObject{{"x",500},{"y",200}}}}; nodes[0]=constant; graph["nodes"]=nodes; edited["graph"]=graph;
  QCOMPARE(PartialRunPlanner(edited,metadata(),{},now).inputSignature("cached"),signature);
  QCOMPARE(ids(PartialRunPlanner(original,metadata(),cache,now).plan({"cached","target"}).snapshot),(QStringList{"cached","target"}));
 }
 // web WorkflowRunner.ts buildRunJobData: a bypassed node and every incident edge leave the submitted
 // graph, and the boundary invents no pass-through edge. The upstream of a bypassed node is therefore
 // not pulled into the run and an uncached generative behind it cannot block the run.
 void bypassedNodesLeaveWithTheirIncidentEdges() {
  auto bypassed=node("bypassed","computed"); bypassed["ui_properties"]=QJsonObject{{"bypassed",true}};
  const auto snapshot=workflow({node("g","generator"),node("source","computed"),bypassed,node("target","target"),node("live","computed")},
                               {edge("g","bypassed"),edge("source","bypassed","other"),edge("bypassed","target"),edge("live","target","second")});
  const auto plan=PartialRunPlanner(snapshot,metadata(),{},1000).plan({"target"});
  QVERIFY2(plan.ok,qPrintable(plan.error)); QCOMPARE(plan.executed,(QStringList{"target","live"}));
  QVERIFY(plan.blocked.isEmpty());
  QCOMPARE(plan.snapshot["graph"].toObject()["edges"].toArray(),QJsonArray{edge("live","target","second")});
  QCOMPARE(ids(plan.snapshot),(QStringList{"target","live"}));
  const auto only=PartialRunPlanner(snapshot,metadata(),{},1000).plan({"bypassed"});
  QVERIFY(!only.ok); QVERIFY(only.error.contains("no enabled runnable nodes"));
  PartialRunPlanner hasher(snapshot,metadata(),{},1000);
  auto enabled=snapshot; auto graph=enabled["graph"].toObject(); auto nodes=graph["nodes"].toArray(); nodes[2]=node("bypassed","computed"); graph["nodes"]=nodes; enabled["graph"]=graph;
  QVERIFY2(PartialRunPlanner(enabled,metadata(),{},1000).inputSignature("target")!=hasher.inputSignature("target"),"toggling bypass changes every downstream signature");
 }
 void generativePinsMissingAndStale() {
  auto snapshot=workflow({node("g","generator",{{"prompt","old"}}),node("target","target")},{edge("g","target")});
  PartialRunPlanner hasher(snapshot,metadata(),{},1000); const auto signature=hasher.inputSignature("g");
  ExecutionGenerations cache{{"g",{generation("one",10,{{"out","first"}},signature),generation("two",20,{{"out","second"}},signature)}}};
  auto plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),QStringList{"target"}); QCOMPARE(find(plan.snapshot,"target")["data"].toObject()["input"].toString(),QString("second"));
  auto graph=snapshot["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto generator=nodes[0].toObject(); generator["ui_properties"]=QJsonObject{{"selected_generation","one"}}; nodes[0]=generator; graph["nodes"]=nodes; snapshot["graph"]=graph;
  plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(find(plan.snapshot,"target")["data"].toObject()["input"].toString(),QString("first"));
  generator["ui_properties"]=QJsonObject{{"selected_generation","missing"}}; nodes[0]=generator; graph["nodes"]=nodes; snapshot["graph"]=graph;
  plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target"}); QVERIFY(!plan.ok); QCOMPARE(plan.blocked,QStringList{"g"});
  generator["ui_properties"]=QJsonObject{}; generator["data"]=QJsonObject{{"prompt","edited"}}; nodes[0]=generator; graph["nodes"]=nodes; snapshot["graph"]=graph;
  plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(plan.stale,QStringList{"g"}); QCOMPARE(ids(plan.snapshot),QStringList{"target"});
  plan=PartialRunPlanner(snapshot,metadata(),{},1000).plan({"g","target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"g","target"}));
 }
 void replayAndDirtyIndependentBranches() {
  const auto snapshot=workflow({node("g","generator"),node("computed","computed"),node("target","target"),node("independent","target")},{edge("g","computed"),edge("computed","target")});
  ExecutionGenerations cache{{"g",{generation("one",10,{{"out",1}})}}};
  PartialRunPlanner hasher(snapshot,metadata(),cache,1000); cache["computed"]={generation("computed-one",20,{{"out",2}},hasher.inputSignature("computed"))};
  auto plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target","independent"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"target","independent"}));
  plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"g","target","independent"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"g","computed","target","independent"}));
  auto replay=snapshot; auto graph=replay["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto g=nodes[0].toObject(); g["ui_properties"]=QJsonObject{{"selected_generations",QJsonArray{"two","one","missing"}}}; nodes[0]=g; graph["nodes"]=nodes; replay["graph"]=graph;
  cache["g"].append(generation("two",30,{{"out",QJsonArray{3,4}}}));
  plan=PartialRunPlanner(replay,metadata(),cache,1000).plan({"computed"}); QVERIFY(plan.ok); QCOMPARE(plan.snapshot["graph"].toObject()["nodes"].toArray().size(),2);
  const auto synthetic=plan.snapshot["graph"].toObject()["nodes"].toArray().last().toObject(); QCOMPARE(synthetic["type"].toString(),QString("nodetool.control.ForEach")); QCOMPARE(synthetic["data"].toObject()["input_list"].toArray(),(QJsonArray{3,4,1}));
 }
 void mixedLiveAndCachedInputCannotLoseValues() {
  const auto snapshot=workflow({node("g","generator"),node("live","computed"),node("target","target")},{edge("g","target"),edge("live","target")});
  ExecutionGenerations cache{{"g",{generation("completed",10,{{"out","cached"}})}}};
  const auto plan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"target"});
  QVERIFY(!plan.ok); QVERIFY(plan.error.contains("same input"));
  const auto explicitPlan=PartialRunPlanner(snapshot,metadata(),cache,1000).plan({"g","live","target"}); QVERIFY(explicitPlan.ok);
 }
 void oversizedGenerationIsNeverTruncatedIntoAValue() {
  const auto original=fixture(); ExecutionGenerationStore store; store.submitted("job",original,metadata(),{"cached"});
  store.ingest("job",{{"type","generation_complete"},{"node_id","cached"},{"outputs",QJsonObject{{"out",QString(9*1024*1024,'x')}}}},1000);
  QVERIFY(store.generations("workflow").isEmpty());
  const auto plan=PartialRunPlanner(original,metadata(),store.generations("workflow"),1100).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"cached","target"}));
 }
 void authoritativeCompletionAndDispatchGraph() {
  const auto original=fixture(); ExecutionGenerationStore store;
  store.submitted("job",original,metadata(),{"constant","cached","target"});
  store.ingest("job",{{"type","output_update"},{"node_id","cached"},{"output_name","out"},{"value","preview"}},1000); QVERIFY(store.generations("workflow").isEmpty());
  store.ingest("job",{{"type","generation_complete"},{"node_id","unsubmitted"},{"outputs",QJsonObject{{"out",8}}}},1000); QVERIFY(store.generations("workflow").isEmpty());
  store.ingest("job",{{"type","node_update"},{"node_id","cached"},{"status","running"}},500);
  store.ingest("job",{{"type","generation_complete"},{"node_id","cached"},{"index",0},{"outputs",QJsonObject{{"out",7}}}},1000);
  auto cache=store.generations("workflow"); QCOMPARE(cache["cached"].size(),1); QCOMPARE(cache["cached"].first().id,QString("job")); QCOMPARE(cache["cached"].first().createdAt,qint64(500));
  const auto plan=PartialRunPlanner(original,metadata(),cache,1100).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),QStringList{"target"});
  auto edited=original; auto graph=edited["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto n=nodes[0].toObject(); n["data"]=QJsonObject{{"value",99}}; nodes[0]=n; graph["nodes"]=nodes; edited["graph"]=graph;
  QCOMPARE(ids(PartialRunPlanner(edited,metadata(),cache,1100).plan({"target"}).snapshot),(QStringList{"cached","target"}));
  store.ingest("job",{{"type","generation_complete"},{"node_id","cached"},{"index",0},{"outputs",QJsonObject{{"out",999}}}},1200); QCOMPARE(store.generations("workflow")["cached"].first().outputs["out"].toInt(),7);
  store.ingest("job",{{"type","job_update"},{"status","completed"}},1300);
  store.ingest("job",{{"type","generation_complete"},{"node_id","cached"},{"index",1},{"outputs",QJsonObject{{"out",999}}}},1400); QCOMPARE(store.generations("workflow")["cached"].size(),1);
  QVERIFY(store.generations("other-workflow").isEmpty()); store.clear(); QVERIFY(store.generations("workflow").isEmpty());
 }
 void completionStampUsesThisJobsUpstream() {
  const auto snapshot=workflow({node("g","generator"),node("computed","computed"),node("target","target")},{edge("g","computed"),edge("computed","target")});
  ExecutionGenerationStore store; store.submitted("old",snapshot,metadata(),{"g"}); store.ingest("old",{{"type","generation_complete"},{"node_id","g"},{"outputs",QJsonObject{{"out","old"}}}},10);
  auto pinned=snapshot; auto graph=pinned["graph"].toObject(); auto nodes=graph["nodes"].toArray(); auto g=nodes[0].toObject(); g["ui_properties"]=QJsonObject{{"selected_generation","old"}}; nodes[0]=g; graph["nodes"]=nodes; pinned["graph"]=graph;
  store.submitted("new",pinned,metadata(),{"g","computed"}); store.ingest("new",{{"type","generation_complete"},{"node_id","g"},{"outputs",QJsonObject{{"out","new"}}}},20); store.ingest("new",{{"type","generation_complete"},{"node_id","computed"},{"outputs",QJsonObject{{"out","derived new"}}}},30);
  auto plan=PartialRunPlanner(snapshot,metadata(),store.generations("workflow"),40).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),QStringList{"target"});
  plan=PartialRunPlanner(pinned,metadata(),store.generations("workflow"),40).plan({"target"}); QVERIFY(plan.ok); QCOMPARE(ids(plan.snapshot),(QStringList{"computed","target"})); QCOMPARE(find(plan.snapshot,"computed")["data"].toObject()["input"].toString(),QString("old"));
 }
};
QTEST_GUILESS_MAIN(PartialRunPlannerTest)
#include "PartialRunPlannerTest.moc"
