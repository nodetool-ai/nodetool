#include "../../src/run/RunOutputModel.h"
#include <QTest>
#include <QJsonArray>
using namespace nodetool::node_editor;
class RunOutputModelTests : public QObject {
 Q_OBJECT
private slots:
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
  QCOMPARE(media.size(),3);
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
  QCOMPARE(m.entries().last().toMap()["media"].toList().size(),16);
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
