#include "../../src/run/RunOutputModel.h"
#include <QTest>
#include <QJsonArray>
#include <QSignalSpy>
using namespace nodetool::node_editor;
class RunOutputModelTests : public QObject {
 Q_OBJECT
private slots:
 void toolCallDispatch() {
   RunOutputModel model; model.beginRun("tool");
   model.ingest("tool", {{"job_id", "tool"}, {"type", "output_update"}, {"node_id", "node"},
     {"value", QJsonObject{{"type", "chunk"}, {"content_type", "tool_call"}, {"content", "search(query)"},
       {"done", true}, {"content_metadata", QJsonObject{{"tool_name", "search"}, {"args", QJsonObject{{"query", "native"}}}}}}}});
   QCOMPARE(model.entries().last().toMap()["renderer"].toString(), QString("tool_call"));
 }

 void dataframePreviewLimits() {
   RunOutputModel model; model.beginRun("table");
   QJsonArray rows;
   for (int i = 0; i < 1100; ++i) { rows.append(QJsonObject{{"value", i}}); }
   const QJsonObject value{{"type", "dataframe"}, {"rows", rows}};
   model.ingest("table", {{"job_id", "table"}, {"type", "output_update"}, {"node_id", "node"}, {"value", value}});
   const auto entry = model.entries().last().toMap();
   QCOMPARE(entry["renderer"].toString(), QString("dataframe"));
   QCOMPARE(entry["tableRows"].toList().size(), 1000);
   QCOMPARE(entry["tableColumns"].toList(), QVariantList{QString("value")});
   QCOMPARE(value["rows"].toArray().size(), 1100);
   QVERIFY(entry["tableNotice"].toString().contains("1000 of 1100"));
 }

 void richDispatchPreservesUnknown() {
   RunOutputModel model; model.beginRun("rich");
   model.ingest("rich", {{"job_id", "rich"}, {"type", "output_update"}, {"node_id", "node"}, {"output_name", "value"},
     {"value", QJsonObject{{"type", "plotly_config"}, {"config", QJsonObject{{"data", QJsonArray{1, 2}}}}}}});
   QCOMPARE(model.entries().last().toMap()["renderer"].toString(), QString("plotly"));
   model.ingest("rich", {{"job_id", "rich"}, {"type", "output_update"}, {"node_id", "node"}, {"output_name", "value"},
     {"disposition", "replace"}, {"value", QJsonObject{{"type", "future"}, {"text", "keep me"}}}});
   QCOMPARE(model.entries().last().toMap()["renderer"].toString(), QString("generic"));
   QVERIFY(model.entries().last().toMap()["text"].toString().contains("keep me"));
 }

 void resetRejectsPreviousActiveRunEvents() {
  RunOutputModel model;
  model.beginRun("old-run");
  model.reset();
  model.ingest("old-run", {{"type", "output_update"}, {"job_id", "old-run"},
    {"job_seq", 1}, {"node_id", "node"}, {"output_name", "text"}, {"value", "stale"}});
  QVERIFY(model.runs().isEmpty());
  QVERIFY(model.entries().isEmpty());
  QVERIFY(model.selectedRunId().isEmpty());
  model.beginRun("new-run");
  QCOMPARE(model.selectedRunId(), QString("new-run"));
 }
 void isolationAndReplay() {
  RunOutputModel m;
  m.beginRun("a"); m.beginRun("b");
  QJsonObject output{{"type","output_update"},{"job_id","a"},{"job_seq",1},{"node_id","node"},{"node_name","Text"},{"output_name","text"},{"output_type","str"},{"metadata",QJsonObject{}},{"value","hello"}};
  m.ingest("a",output); m.ingest("a",output);
  QVERIFY(m.entries().isEmpty());
  m.selectRun("a"); QCOMPARE(m.entries().size(),1);
  QCOMPARE(m.entries()[0].toMap()["text"].toString(),"hello");
  output["job_seq"] = 2; output["value"] = " world"; m.ingest("a",output);
  QCOMPARE(m.entries()[0].toMap()["text"].toString(),"hello world");
  output["job_seq"] = 3; output["disposition"] = "replace"; output["value"] = "asset://preserved"; output["done"] = true; m.ingest("a",output);
  QCOMPARE(m.entries()[0].toMap()["text"].toString(),"asset://preserved");
  QVERIFY(m.entries()[0].toMap()["done"].toBool());
  m.ingest("b",output); m.selectRun("b"); QVERIFY(m.entries().isEmpty());
  m.ingest("unknown",output); QCOMPARE(m.runs().size(),2);
 }
 void terminalAndNodes() {
  RunOutputModel m; m.beginRun("a");
  m.ingest("a",{{"type","node_update"},{"job_id","a"},{"node_id","one"},{"node_name","One"},{"node_type","test"},{"status","running"}});
  m.ingest("a",{{"type","node_update"},{"job_id","a"},{"node_id","two"},{"node_name","Two"},{"node_type","test"},{"status","error"},{"error","Failure"}});
  m.ingest("a",{{"type","job_update"},{"job_id","a"},{"status","completed"}});
  m.ingest("a",{{"type","job_resumed"},{"job_id","a"},{"status","running"}});
  QCOMPARE(m.runs()[0].toMap()["status"].toString(),"completed");
  m.ingest("a",{{"type","log_update"},{"job_id","a"},{"node_id","one"},{"node_name","One"},{"content","late log"},{"severity","info"}});
  QCOMPARE(m.entries().size(),4);
  QCOMPARE(m.entries().last().toMap()["text"].toString(),"late log");
 }
 void typedMedia() {
  RunOutputModel m; m.beginRun("a");
  QJsonObject image{{"type","image"},{"asset_id","asset-one"}};
  QJsonObject video{{"content_type","video/mp4"},{"uri","https://example.com/video.mp4"}};
  QJsonObject audio{{"mime_type","audio/wav"},{"data","aGVsbG8="}};
  m.ingest("a",{{"type","output_update"},{"job_id","a"},{"node_id","n"},{"output_name","result"},{"value",QJsonArray{image,image,QJsonObject{{"nested",QJsonArray{video,audio}}},"asset://untyped"}}});
  auto media = m.entries()[0].toMap()["media"].toList();
  QCOMPARE(media.size(),4);
  QVERIFY(media[0].toMap()["itemKey"] != media[1].toMap()["itemKey"]);
  QCOMPARE(media[0].toMap()["locator"], media[1].toMap()["locator"]);
  QCOMPARE(media[0].toMap()["kind"].toString(),"image");
  QCOMPARE(media[0].toMap()["locator"].toMap()["asset_id"].toString(),"asset-one");
  QVERIFY(m.entries()[0].toMap()["text"].toString().contains("asset://untyped"));
  m.ingest("a",{{"type","output_update"},{"job_id","a"},{"node_id","n"},{"output_name","result"},{"disposition","replace"},{"value",QJsonObject{{"type","image"},{"uri",42}}}});
  QVERIFY(m.entries()[0].toMap()["media"].toList().isEmpty());
  QVERIFY(m.entries()[0].toMap()["text"].toString().contains("42"));
  const QJsonObject largeVideo{{"type","video"},{"uri",QString("data:video/mp4;base64,") + QString(700000,'a')}};
  m.ingest("a",{{"type","output_update"},{"job_id","a"},{"node_id","n"},{"output_name","result"},{"disposition","replace"},{"value",largeVideo}});
  const auto largeMedia = m.entries().last().toMap()["media"].toList();
  QCOMPARE(largeMedia.size(),1);
  QCOMPARE(largeMedia[0].toMap()["locator"].toMap()["uri"].toString(),largeVideo["uri"].toString());
  QJsonValue deep = image;
  for (int i=0;i<10;++i) { deep = QJsonObject{{"nested",deep}}; }
  m.ingest("a",{{"type","node_update"},{"job_id","a"},{"node_id","n"},{"status","completed"},{"result",QJsonObject{{"deep",deep}}}});
  QVERIFY(m.entries().last().toMap()["media"].toList().isEmpty());
  QJsonArray many;
  for (int i=0;i<30;++i) { many.append(QJsonObject{{"type","image"},{"asset_id",QString::number(i)}}); }
  m.ingest("a",{{"type","job_update"},{"job_id","a"},{"status","completed"},{"result",QJsonObject{{"images",many}}}});
  QCOMPARE(m.entries().last().toMap()["media"].toList().size(),30);
 }
 void collectionsKeepOccurrencesMixedTextAndStableRows() {
  RunOutputModel model; model.beginRun("stream");
  const QJsonObject image{{"type", "image"}, {"asset_id", "0123456789abcdef0123456789abcdef"}};
  const QJsonArray values{image, image, "Mixed caption", QJsonObject{{"nested", QJsonArray{image, 42}}, {"title", "Preserved title"}}};
  const auto original = values;
  const auto send = [&](const QJsonValue &value) { model.ingest("stream", {{"type", "output_update"}, {"job_id", "stream"}, {"node_id", "node"}, {"output_name", "value"}, {"value", value}}); };
  send(values);
  QCOMPARE(values, original);
  const auto first = model.entries().last().toMap();
  const auto items = first["items"].toList();
  QCOMPARE(items.size(), 6);
  QCOMPARE(items[2].toMap()["text"].toString(), QString("Mixed caption"));
  QVERIFY(first["text"].toString().contains("Preserved title"));
  QVERIFY(first["text"].toString().contains("42"));
  QVERIFY(items[0].toMap()["itemKey"] != items[1].toMap()["itemKey"]);
  QCOMPARE(model.collections()->rowCount(), 1);
  QSignalSpy reset(model.collections(), &QAbstractItemModel::modelReset);
  QSignalSpy changed(model.collections(), &QAbstractItemModel::dataChanged);
  model.ingest("stream", {{"type", "log_update"}, {"job_id", "stream"}, {"content", "unrelated"}});
  QCOMPARE(reset.size(), 0); QCOMPARE(changed.size(), 0);
  send(image);
  QCOMPARE(model.collections()->rowCount(), 1);
  QCOMPARE(reset.size(), 0); QCOMPARE(changed.size(), 1);
  const auto media = model.entries()[0].toMap()["media"].toList();
  QCOMPARE(media.size(), 4);
  QCOMPARE(media[0].toMap()["itemKey"], items[0].toMap()["itemKey"]);
  QVERIFY(media[0].toMap()["itemKey"] != media[3].toMap()["itemKey"]);
  send("Trailing stream caption");
  QVERIFY(model.entries()[0].toMap()["text"].toString().contains("Trailing stream caption"));
  QCOMPARE(model.entries()[0].toMap()["media"].toList().size(), 4);
 }
 void boundedPreviewDoesNotMutateInputOrHideLaterMixedText() {
  RunOutputModel model; model.beginRun("large");
  QJsonArray many;
  for (int i = 0; i < 10000; ++i) { many.append(QJsonObject{{"type", "image"}, {"asset_id", QString::number(i, 16).rightJustified(32, '0')}}); }
  const auto original = many;
  model.ingest("large", {{"type", "output_update"}, {"job_id", "large"}, {"node_id", "node"}, {"output_name", "value"}, {"value", many}});
  QCOMPARE(many, original);
  QCOMPARE(model.entries().last().toMap()["media"].toList().size(), 256);
  QVERIFY(!model.entries().last().toMap()["previewNotice"].toString().isEmpty());
  const QJsonObject image{{"type", "image"}, {"uri", QString("data:image/png;base64,") + QString(700000, 'a')}};
  model.ingest("large", {{"type", "output_update"}, {"job_id", "large"}, {"node_id", "node"}, {"output_name", "value"}, {"disposition", "replace"},
    {"value", QJsonArray{image, image, image, "Visible after oversized media"}}});
  const auto entry = model.entries().last().toMap();
  QCOMPARE(entry["media"].toList().size(), 2);
  QVERIFY(entry["text"].toString().contains("Visible after oversized media"));
  QVERIFY(!entry["previewNotice"].toString().isEmpty());
 }
 void boundedNestedRenderers() {
  RunOutputModel model; model.beginRun("nested");
  auto send = [&](QJsonValue value) {
   model.ingest("nested", {{"type", "output_update"}, {"job_id", "nested"}, {"node_id", "node"}, {"disposition", "replace"}, {"value", value}});
   return model.entries().last().toMap();
  };
  auto entry = send(QJsonObject{{"nested", QJsonObject{{"message", "**Hello**"}}}});
  QCOMPARE(entry["fields"].toList()[0].toMap()["output"].toMap()["renderer"].toString(), QString("object"));
  QJsonValue deep = "end";
  for (int i = 0; i < 100; ++i) { deep = QJsonObject{{"child", deep}}; }
  entry = send(deep);
  auto leaf = entry;
  int levels = 0;
  while (leaf["renderer"] == "object") {
    QVERIFY(++levels <= 8);
    leaf = leaf["fields"].toList()[0].toMap()["output"].toMap();
  }
  QCOMPARE(leaf["text"].toString(), QString("[Preview truncated]"));
  QJsonObject wide;
  for (int i = 0; i < 10000; ++i) { wide[QString::number(i)] = "value"; }
  entry = send(wide);
  QVERIFY(entry["fields"].toList().size() <= 256);
  QVERIFY(entry["objectNotice"].toString().contains("truncated"));
  entry = send(QJsonArray{QJsonObject{{"type", "chunk"}, {"content_type", "text"}, {"content", "Hello"}}, QJsonObject{{"type", "chunk"}, {"content_type", "tool_call"}, {"content", "search"}}});
  QCOMPARE(entry["renderer"].toString(), QString("sequence"));
  QCOMPARE(entry["children"].toList()[0].toMap()["text"].toString(), QString("Hello"));
 }
 void textChunksRenderContent() {
  RunOutputModel model; model.beginRun("chunks");
  const QJsonArray chunks{QJsonObject{{"type", "chunk"}, {"content_type", "text"}, {"content", "Hello "}},
    QJsonObject{{"type", "chunk"}, {"content_type", "text"}, {"content", "world"}}};
  model.ingest("chunks", {{"type", "output_update"}, {"job_id", "chunks"}, {"node_id", "node"}, {"value", chunks}});
  QCOMPARE(model.entries().last().toMap()["renderer"].toString(), QString("text"));
  QCOMPARE(model.entries().last().toMap()["text"].toString(), QString("Hello world"));
 }
 void clearActiveRun() {
  RunOutputModel m; m.beginRun("active");
  const QJsonObject log{{"type","log_update"},{"job_id","active"},{"job_seq",2},{"content","before clear"},{"severity","info"}};
  m.ingest("active",{{"type","job_update"},{"job_id","active"},{"job_seq",1},{"status","running"}});
  m.ingest("active",log);
  m.beginRun("complete");
  m.ingest("complete",{{"type","job_update"},{"job_id","complete"},{"status","completed"}});
  m.clear();
  QCOMPARE(m.runs().size(),1);
  QCOMPARE(m.selectedRunId(),"active");
  QCOMPARE(m.runs()[0].toMap()["status"].toString(),"running");
  QVERIFY(m.entries().isEmpty());
  m.ingest("active",log);
  QVERIFY(m.entries().isEmpty());
  m.ingest("active",{{"type","output_update"},{"job_id","active"},{"job_seq",3},{"node_id","node"},{"node_name","Text"},{"output_name","text"},{"output_type","str"},{"metadata",QJsonObject{}},{"value","after clear"}});
  QCOMPARE(m.entries().size(),1);
  QCOMPARE(m.entries()[0].toMap()["text"].toString(),"after clear");
  m.ingest("active",{{"type","job_update"},{"job_id","active"},{"job_seq",4},{"status","completed"}});
  QVERIFY(m.runs()[0].toMap()["terminal"].toBool());
  QCOMPARE(m.entries().size(),2);
  m.clear(); QVERIFY(m.runs().isEmpty()); QVERIFY(m.selectedRunId().isEmpty());
 }
 void capsAndClear() {
  RunOutputModel m; m.beginRun("a");
  for (int i=0;i<510;++i) {
   m.ingest("a",{{"type","log_update"},{"job_id","a"},{"content",QString(70000,'x')},{"severity","info"}});
  }
  QVERIFY(m.entries().size()<=500);
  qsizetype chars = 0;
  for (const auto &entry : m.entries()) { chars += entry.toMap()["text"].toString().size(); }
  QVERIFY(chars <= 4 * 1024 * 1024 + 100);
  QCOMPARE(m.entries().first().toMap()["kind"].toString(),"notice");
  QVERIFY(m.entries().last().toMap()["text"].toString().size()<66000);
  QVERIFY(m.runs()[0].toMap()["truncated"].toBool());
  for (int i=0;i<25;++i) { m.beginRun(QString::number(i)); }
  QCOMPARE(m.runs().size(),20);
  m.selectRun("a"); QCOMPARE(m.selectedRunId(),"24");
  for (int i=5;i<25;++i) {
   m.ingest(QString::number(i),{{"type","job_update"},{"job_id",QString::number(i)},{"status","completed"}});
  }
  m.clear(); QVERIFY(m.runs().isEmpty()); QVERIFY(m.entries().isEmpty()); QVERIFY(m.selectedRunId().isEmpty());
 }
};
QTEST_GUILESS_MAIN(RunOutputModelTests)
#include "RunOutputModelTests.moc"
