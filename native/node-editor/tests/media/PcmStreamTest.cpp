#include "media/PcmStream.h"
#include <QtTest>
#include <QBuffer>
#include <QAudioDevice>
#include "run/RunOutputModel.h"
using namespace nodetool::node_editor;
class PcmStreamTest : public QObject {
 Q_OBJECT
private slots:
 void scopesAndStop() {
  RunOutputModel model; model.beginRun("first");
  auto player = qobject_cast<PcmStream *>(model.pcm()); QVERIFY(player);
  const auto event = [](QString job) { return QJsonObject{{"job_id", job}, {"job_seq", 1}, {"type", "output_update"}, {"node_id", "n"}, {"value", QJsonObject{{"type", "chunk"}, {"content_type", "audio"}, {"content", "AAAAAA=="}}}}; };
  model.ingest("first", event("first")); QCOMPARE(model.entries().last().toMap()["renderer"].toString(), "pcm");
  player->startOnDevice(QAudioDevice{}); QCOMPARE(player->state(), "No audio output device available"); QVERIFY(!player->playing());
  player->stop(); QVERIFY(!player->playing()); QCOMPARE(player->state(), "Stopped");
  model.beginRun("second"); QVERIFY(!player->playing()); QCOMPARE(player->state(), "Ready");
  model.ingest("first", event("first")); QCOMPARE(player->state(), "Ready");
  model.reset(); model.ingest("second", event("second")); QVERIFY(model.entries().isEmpty()); QVERIFY(!player->playing());
 }
 void boundary() {
  PcmBuffer b; b.reset("run");
  QJsonObject chunk{{"content", "AID/fw=="}};
  QVERIFY(b.append("run", chunk));
  QCOMPARE(b.sampleRate, 22000); QCOMPARE(b.channels, 1);
  auto bytes = b.pending(); float first = 0; memcpy(&first, bytes.data(), 4); QCOMPARE(first, -1.0f);
  QBuffer sink; sink.open(QIODevice::WriteOnly);
  QCOMPARE(b.drain(sink, 0), 0); QCOMPARE(b.pending().size(), 8);
  QCOMPARE(b.drain(sink, 4), 4); QCOMPARE(b.pending().size(), 4);
  QCOMPARE(sink.data().size(), 4);
  QVERIFY(!b.append("old", chunk));
  QVERIFY(!b.append("run", {{"content", "AA=="}}));
  QVERIFY(!b.append("run", {{"content", "!!!"}}));
  b.reset("next"); QVERIFY(b.pending().isEmpty()); QVERIFY(!b.append("run", chunk));
  chunk["content_metadata"] = QJsonObject{{"sample_rate", 48000}, {"channels", 2}};
  QVERIFY(b.append("next", chunk)); QCOMPARE(b.sampleRate, 48000); QCOMPARE(b.channels, 2);
  QVERIFY(!b.append("next", {{"content", "AAA="}}));
  b.reset("float"); QVERIFY(b.append("float", {{"content", "AACAPw=="}, {"content_metadata", QJsonObject{{"encoding", "f32le"}}}}));
  memcpy(&first, b.pending().data(), 4); QCOMPARE(first, 1.0f);
  QVERIFY(!b.append("float", {{"content", "AAAA"}, {"content_metadata", QJsonObject{{"encoding", "f32le"}}}}));
  b.reset("rates");
  QVERIFY(!b.append("rates", {{"content", "AAAAAA=="}, {"content_metadata", QJsonObject{{"sample_rate", 0}}}}));
  QVERIFY(!b.append("rates", {{"content", "AAAAAA=="}, {"content_metadata", QJsonObject{{"channels", 1.5}}}}));
  b.reset("fill");
  QJsonObject full{{"content", QString::fromLatin1(QByteArray(PcmBuffer::MaxBytes / 2, '\0').toBase64())}};
  QVERIFY(b.append("fill", full)); QCOMPARE(b.pending().size(), PcmBuffer::MaxBytes);
  QVERIFY(!b.append("fill", {{"content", "AAAAAA=="}})); QCOMPARE(b.pending().size(), PcmBuffer::MaxBytes);
  b.consume(PcmBuffer::MaxBytes); QVERIFY(b.pending().isEmpty()); b.rewind(); QCOMPARE(b.pending().size(), PcmBuffer::MaxBytes);
  b.reset("bound"); chunk = {{"content", QString::fromLatin1(QByteArray(PcmBuffer::MaxBytes, '\0').toBase64())}};
  QVERIFY(!b.append("bound", chunk)); QVERIFY(b.pending().isEmpty()); QVERIFY(!b.notice.isEmpty());
 }
};
QTEST_GUILESS_MAIN(PcmStreamTest)
#include "PcmStreamTest.moc"
