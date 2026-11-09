#include "media/PcmStream.h"
#include <QtTest>
#include <QBuffer>
#include <QAudioDevice>
#include <QtEndian>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPersistentModelIndex>
#include "run/RunOutputModel.h"
using namespace nodetool::node_editor;
struct SinkRecord {
 QAudioFormat supported;
 QAudioFormat configured;
 QByteArray bytes;
 qint64 writeLimit = 1000000;
 qsizetype capacity = 1000000;
 qsizetype buffered = 0;
 bool trackBuffered = false;
 qsizetype largestWrite = 0;
 bool drain = true;
 bool error = false;
 int starts = 0;
 int stops = 0;
};
class RecordingSink final : public PcmSink {
public:
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 explicit RecordingSink(std::shared_ptr<SinkRecord> record) : record(std::move(record)) {}
 QAudioFormat preferredFormat() const override { return record->supported; }
 bool supports(const QAudioFormat &format) const override { return format == record->supported; }
 bool start(const QAudioFormat &format) override { record->configured = format; ++record->starts; return true; }
 qsizetype capacityBytes() const override { return std::max<qsizetype>(0, record->capacity - record->buffered); }
 qsizetype bufferedBytes() const override { return record->buffered; }
 qint64 write(QByteArrayView bytes) override {
  if (record->writeLimit < 0) { return -1; }
  const auto size = std::min<qsizetype>(bytes.size(), record->writeLimit);
  record->bytes.append(bytes.data(), size); record->largestWrite = std::max(record->largestWrite, bytes.size()); if (record->trackBuffered) { record->buffered += size; } return size;
 }
 bool drained() const override { return record->drain && record->buffered == 0; }
 bool failed() const override { return record->error; }
 void stop() override { ++record->stops; record->buffered = 0; }
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 std::shared_ptr<SinkRecord> record;
};
// native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
static std::shared_ptr<SinkRecord> attach(PcmStream &player, int rate = 24000, int channels = 1, QAudioFormat::SampleFormat format = QAudioFormat::Float) {
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(rate); record->supported.setChannelCount(channels); record->supported.setSampleFormat(format);
 player.setSinkFactory([record] { return std::make_unique<RecordingSink>(record); }); return record;
}
static QJsonObject samples(int frames, bool done = false, int rate = 24000, int channels = 1) {
 QByteArray data(frames * channels * 2, '\0');
 for (int i = 0; i < frames * channels; ++i) { qToLittleEndian<qint16>(static_cast<qint16>((i % 100) * 100), data.data() + i * 2); }
 return {{"content", QString::fromLatin1(data.toBase64())}, {"done", done}, {"content_metadata", QJsonObject{{"encoding", "pcm16le"}, {"sample_rate", rate}, {"channels", channels}}}};
}

class PcmStreamTest : public QObject {
 Q_OBJECT
private slots:
 void mixedPreviewBytePressureKeepsPcmControls() {
  PcmQueue queue; RunOutputModel model(nullptr, &queue);
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false;
  model.setPcmSinkFactory([record] { return std::make_unique<RecordingSink>(record); }); model.beginRun("mixed");
  auto chunk = samples(1024); chunk["type"] = "chunk"; chunk["content_type"] = "audio";
  const QJsonObject preview{{"type", "image"}, {"data", QString(1536 * 1024, QLatin1Char('A'))}};
  for (const auto &node : {"a", "b", "c"}) { model.ingest("mixed", {{"job_id", "mixed"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "chunk"}, {"value", QJsonArray{chunk, preview}}}); }
  qsizetype bytes = 0; int controls = 0;
  for (const auto &value : model.entries()) {
   const auto entry = value.toMap(); bytes += entry["text"].toString().size() + QJsonDocument::fromVariant(entry["media"]).toJson(QJsonDocument::Compact).size();
   if (entry["pcmController"].value<QObject *>()) { ++controls; }
  }
  QCOMPARE(controls, 3); QVERIFY(bytes <= 4 * 1024 * 1024); QCOMPARE(record->starts, 1);
  for (const auto &node : {"a", "b", "c"}) { auto player = qobject_cast<PcmStream *>(model.pcmFor(node, "chunk")); QVERIFY(player); QVERIFY(player->playing()); }
 }
 void historyEvictionKeepsAudibleAndQueuedControls_data() {
  QTest::addColumn<int>("logSize");
  QTest::newRow("entry-bound") << 0;
  QTest::newRow("byte-bound") << 65536;
 }
 void historyEvictionKeepsAudibleAndQueuedControls() {
  QFETCH(int, logSize);
  PcmQueue queue; RunOutputModel model(nullptr, &queue);
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false;
  model.setPcmSinkFactory([record] { return std::make_unique<RecordingSink>(record); });
  model.setLiveNodes({"a", "b"}); model.beginRun("history");
  auto value = samples(1024); value["type"] = "chunk"; value["content_type"] = "audio";
  for (const auto &node : {"a", "b"}) { model.ingest("history", {{"job_id", "history"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "chunk"}, {"value", value}}); }
  auto first = qobject_cast<PcmStream *>(model.pcmFor("a", "chunk")), second = qobject_cast<PcmStream *>(model.pcmFor("b", "chunk"));
  QVERIFY(first); QVERIFY(second); QVERIFY(first->playing() && !first->queued()); QVERIFY(second->queued()); QVERIFY(!record->bytes.isEmpty());
  auto rows = model.richEntries(); QPersistentModelIndex firstRow(rows->index(0, 0)), secondRow(rows->index(1, 0)); QVERIFY(firstRow.isValid()); QVERIFY(secondRow.isValid());
  for (int i = 0; i < 600; ++i) { model.ingest("history", {{"job_id", "history"}, {"type", "log_update"}, {"content", QString("Log %1 ").arg(i) + QString(logSize, QLatin1Char('x'))}}); }
  QVERIFY(model.entries().size() <= 500);
  qsizetype bytes = 0;
  for (const auto &value : model.entries()) { const auto entry = value.toMap(); bytes += entry["text"].toString().size() + QJsonDocument::fromVariant(entry["media"]).toJson(QJsonDocument::Compact).size(); }
  QVERIFY(bytes <= 4 * 1024 * 1024);
  bool firstRepresented = false, secondRepresented = false;
  for (const auto &value : model.entries()) {
   const auto controller = value.toMap()["pcmController"].value<QObject *>();
   firstRepresented = firstRepresented || controller == first; secondRepresented = secondRepresented || controller == second;
  }
  QVERIFY2(firstRepresented && secondRepresented, "Bounded history must retain controls for active and queued PCM");
  QVERIFY(firstRow.isValid()); QVERIFY(secondRow.isValid());
  QCOMPARE(rows->data(firstRow, Qt::UserRole + 4).toMap()["pcmController"].value<QObject *>(), static_cast<QObject *>(first));
  QCOMPARE(rows->data(secondRow, Qt::UserRole + 4).toMap()["pcmController"].value<QObject *>(), static_cast<QObject *>(second));
  QVERIFY(first->playing() && !first->queued()); QVERIFY(second->queued()); QCOMPARE(record->starts, 1);
 }
 void elevenLabsPcmAliasAndCompressedRejection() {
  PcmBuffer buffer; buffer.reset("provider");
  auto chunk = samples(8, true, 44100); auto metadata = chunk["content_metadata"].toObject(); metadata["encoding"] = "pcm"; metadata["format"] = "pcm_44100"; chunk["content_metadata"] = metadata;
  QVERIFY(buffer.append("provider", chunk)); QCOMPARE(buffer.sampleRate, 44100); QCOMPARE(buffer.pending().size(), 8 * 4);
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("compressed");
  QVERIFY(!player.append("compressed", {{"content", "SUQzBAAAAA=="}, {"content_metadata", QJsonObject{{"encoding", "mp3"}, {"format", "mp3_44100_128"}, {"sample_rate", 44100}, {"channels", 1}}}}));
  QCOMPARE(player.state(), "Unsupported PCM encoding"); QVERIFY(!player.playing());
 }
 void cancellationClearsScopedPcmAndRejectsLateFrames() {
  PcmQueue queue; RunOutputModel model(nullptr, &queue);
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false;
  model.setPcmSinkFactory([record] { return std::make_unique<RecordingSink>(record); }); model.beginRun("run");
  auto value = samples(1024); value["type"] = "chunk"; value["content_type"] = "audio";
  auto event = [value](QString node) { return QJsonObject{{"job_id", "run"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "chunk"}, {"value", value}}; };
  model.ingest("run", event("a")); model.ingest("run", event("b"));
  QPointer<PcmStream> first = qobject_cast<PcmStream *>(model.pcmFor("a", "chunk"));
  QVERIFY(first); QCOMPARE(record->starts, 1);
  model.ingest("run", {{"job_id", "run"}, {"type", "job_update"}, {"status", "cancelled"}});
  QVERIFY(!model.pcmFor("a", "chunk")); QVERIFY(!model.pcmFor("b", "chunk"));
  if (first) { QCOMPARE(first->queuedFrames(), 0); QVERIFY(!first->playing()); }
  QCOMPARE(record->starts, 1);
  for (const auto &entry : model.entries()) { QVERIFY(!entry.toMap()["pcmController"].value<QObject *>()); }
  model.ingest("run", event("a")); QVERIFY(!model.pcmFor("a", "chunk")); QCOMPARE(record->starts, 1);
 }
 void replayResumePreservesUnsentConvertedBytes() {
  for (const auto capacity : {qsizetype(0), qsizetype(13)}) {
   PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("replay"); auto record = attach(player);
   record->capacity = capacity; record->trackBuffered = true; record->drain = false;
   QVERIFY(player.append("replay", samples(1024, true))); player.start();
   const auto accepted = record->bytes; QCOMPARE(accepted.size(), capacity);
   player.stop(); QCOMPARE(player.queuedFrames(), 1024 - capacity / 4);
   record->bytes.clear(); record->capacity = 1000000; player.start();
   for (int i = 0; i < 20; ++i) { player.pump(); }
   const auto completedFrames = capacity / 4;
   QCOMPARE(record->bytes.size(), (1024 - completedFrames) * 4);
   for (int i = 0; i < 1024 - completedFrames; ++i) {
    float actual = 0; memcpy(&actual, record->bytes.constData() + i * 4, 4);
    QCOMPARE(actual, static_cast<float>(((i + completedFrames) % 100) * 100) / 32768.0f);
   }
  }
 }
 void highRateReplayFillsTenMillisecondConsumption() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("fast"); auto record = attach(player, 192000);
  record->trackBuffered = true; record->capacity = 19200 * 4;
  QVERIFY(player.append("fast", samples(192000, true, 192000))); player.start();
  const qsizetype tenMs = 1920 * 4;
  QVERIFY2(record->buffered >= tenMs, "One pump must supply at least a 10ms consumption interval at 192kHz");
  for (int i = 0; i < 10; ++i) {
   record->buffered -= tenMs; player.pump();
   QVERIFY(record->buffered >= tenMs); QVERIFY(record->buffered <= record->capacity);
  }
 }
 void nonPcmReplacementReleasesQueue() {
  for (const auto replacement : {QJsonValue("replacement text"), QJsonValue(QJsonArray{}), QJsonValue(QJsonObject{{"type", "audio"}, {"uri", "asset://completed"}})}) {
   PcmQueue queue; RunOutputModel model(nullptr, &queue);
   // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
   auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false;
   model.setPcmSinkFactory([record] { return std::make_unique<RecordingSink>(record); }); model.beginRun("run");
   auto value = samples(1024); value["type"] = "chunk"; value["content_type"] = "audio";
   for (const auto &node : {"a", "b"}) { model.ingest("run", {{"job_id", "run"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "chunk"}, {"value", value}}); }
   auto first = qobject_cast<PcmStream *>(model.pcmFor("a", "chunk")); auto second = qobject_cast<PcmStream *>(model.pcmFor("b", "chunk"));
   QVERIFY(first); QVERIFY(second); QVERIFY(second->queued());
   model.ingest("run", {{"job_id", "run"}, {"type", "output_update"}, {"node_id", "a"}, {"output_name", "chunk"}, {"value", replacement}, {"disposition", "replace"}});
   QVERIFY(!first->playing()); QVERIFY(queue.active(second)); QCOMPARE(record->starts, 2);
  }
 }
 void explicitLiveResumeDiscardsStalePending() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("live", true); auto record = attach(player);
  QVERIFY(player.append("live", samples(1024))); player.autoplay(); QVERIFY(!record->bytes.isEmpty());
  player.stop(); record->bytes.clear(); QVERIFY(player.append("live", samples(2400)));
  player.start(); QVERIFY(record->bytes.isEmpty()); QCOMPARE(player.queuedFrames(), 0);
  QVERIFY(player.append("live", samples(1024))); QVERIFY(!record->bytes.isEmpty());
 }
 void converterCarriesInterpolationAcrossBlocks() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("run"); auto record = attach(player, 48000, 2, QAudioFormat::Int16); record->drain = false;
  QVERIFY(player.append("run", samples(1024))); player.autoplay(); QVERIFY(!record->bytes.isEmpty());
  QVERIFY(player.append("run", samples(1024, true))); for (int i = 0; i < 4; ++i) { player.pump(); }
  QCOMPARE(record->bytes.size(), 2048 * 2 * 2 * 2);
  QCOMPARE(qFromLittleEndian<qint16>(record->bytes.constData() + 2046 * 4), qint16(2300));
  QCOMPARE(qFromLittleEndian<qint16>(record->bytes.constData() + 2047 * 4), qint16(1150));
  QCOMPARE(qFromLittleEndian<qint16>(record->bytes.constData() + 2048 * 4), qint16(0));
 }
 void liveLeadIncludesHardwareAndConvertedFrames() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("live", true);
  auto record = attach(player, 48000, 2, QAudioFormat::Int16);
  record->trackBuffered = true; record->capacity = 48000 * 2 * 2 / 10; record->writeLimit = 101;
  QVERIFY(player.append("live", samples(2400))); player.autoplay();
  for (int i = 0; i < 200; ++i) {
   QVERIFY(player.append("live", samples(512)));
   player.pump(); QVERIFY(player.queuedFrames() <= 2400);
   QVERIFY(record->buffered <= record->capacity);
   // Simulate playback accepting only whole output frames from hardware.
   if (i % 5 == 0) { record->buffered = std::max<qsizetype>(0, record->buffered - 480 * 4); }
  }
  QVERIFY(player.droppedFrames() > 0); QVERIFY(record->largestWrite <= record->capacity);
 }
 void invalidInputIsAtomic() {
  PcmBuffer buffer; buffer.reset("run"); QVERIFY(buffer.append("run", samples(8)));
  const auto before = QByteArray(buffer.pending().data(), buffer.pending().size());
  QByteArray nan(4, Qt::Uninitialized); qToLittleEndian<quint32>(0x7fc00000U, nan.data());
  QVERIFY(!buffer.append("run", {{"content", QString::fromLatin1(nan.toBase64())}, {"content_metadata", QJsonObject{{"encoding", "f32le"}}}}));
  QCOMPARE(QByteArray(buffer.pending().data(), buffer.pending().size()), before);
  QVERIFY(!buffer.append("run", samples(8, false, 48000)));
  QCOMPARE(buffer.sampleRate, 24000); QCOMPARE(QByteArray(buffer.pending().data(), buffer.pending().size()), before);
  QVERIFY(!buffer.append("run", {{"content", "AAAAAA=="}, {"content_metadata", QJsonObject{{"sample_rate", "invalid"}}}}));
  QCOMPARE(QByteArray(buffer.pending().data(), buffer.pending().size()), before);
  QVERIFY(!buffer.append("run", {{"content", QString(PcmBuffer::MaxBytes * 4 / 3 + 8, QLatin1Char('A'))}}));
  QCOMPARE(QByteArray(buffer.pending().data(), buffer.pending().size()), before);
 }
 void replacementPreservesStopAndClearsReplay() {
  PcmQueue queue; RunOutputModel model(nullptr, &queue);
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto record = std::make_shared<SinkRecord>(); record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false;
  model.setPcmSinkFactory([record] { return std::make_unique<RecordingSink>(record); }); model.beginRun("run");
  auto event = [](QJsonObject value, QString disposition) { value["type"] = "chunk"; value["content_type"] = "audio"; return QJsonObject{{"job_id", "run"}, {"type", "output_update"}, {"node_id", "n"}, {"output_name", "chunk"}, {"value", value}, {"disposition", disposition}}; };
  model.ingest("run", event(samples(1024), "append"));
  auto player = qobject_cast<PcmStream *>(model.pcmFor("n", "chunk")); QVERIFY(player); QCOMPARE(record->starts, 1);
  player->stop(); record->bytes.clear();
  model.ingest("run", event(samples(4, true), "replace"));
  QCOMPARE(model.pcmFor("n", "chunk"), static_cast<QObject *>(player)); QVERIFY(!player->playing()); QCOMPARE(record->starts, 1);
  player->start(); for (int i = 0; i < 4; ++i) { player->pump(); }
  QCOMPARE(record->bytes.size(), 4 * 4); QCOMPARE(record->starts, 2);
  model.beginRun("next"); model.selectRun("run"); QVERIFY(!model.pcmFor("n", "chunk")); QVERIFY(!player->playing());
 }
 void underrunReprimesWithoutReleasingSlot() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("live", true); auto record = attach(player);
  QVERIFY(player.append("live", samples(1024))); player.autoplay(); player.pump();
  QVERIFY(queue.active(&player)); QCOMPARE(player.state(), "Waiting for audio");
  QVERIFY(player.append("live", samples(100))); QCOMPARE(player.state(), "Buffering audio"); QVERIFY(queue.active(&player));
  QVERIFY(player.append("live", samples(1024))); QVERIFY(record->bytes.size() > 1024 * 4);
 }
 void liveRingRemainsBounded() {
  PcmBuffer buffer; buffer.reset("live", true);
  for (int i = 0; i < 2048; ++i) {
   QVERIFY(buffer.append("live", samples(1024)));
   QVERIFY(buffer.queuedFrames() <= 2400);
  }
  QVERIFY(buffer.droppedFrames() > 0);
  buffer.consume(buffer.pending().size()); QVERIFY(buffer.append("live", samples(1024)));
 }
 void converterAndPartialWrites() {
  PcmQueue queue; PcmStream player(nullptr, &queue); player.reset("run");
  auto record = attach(player, 48000, 2, QAudioFormat::Int16); record->writeLimit = 7; record->drain = false;
  player.start(); QCOMPARE(record->starts, 0);
  QVERIFY(player.append("run", samples(3, false)));
  QCOMPARE(record->starts, 0);
  QVERIFY(player.append("run", samples(3, true)));
  for (int i = 0; i < 30; ++i) { player.pump(); }
  QCOMPARE(record->configured.sampleRate(), 48000); QCOMPARE(record->configured.channelCount(), 2);
  QCOMPARE(record->bytes.size(), 6 * 2 * 2 * 2);
  for (int i = 0; i < record->bytes.size(); i += 4) { QCOMPARE(record->bytes.mid(i, 2), record->bytes.mid(i + 2, 2)); }
  QVERIFY(player.playing()); record->drain = true; player.pump(); QVERIFY(!player.playing()); QCOMPARE(player.state(), "Ended");
 }
 void fifoStopRestartAndErrors() {
  PcmQueue queue; PcmStream first(nullptr, &queue), second(nullptr, &queue);
  first.reset("a"); second.reset("b"); auto a = attach(first), b = attach(second);
  a->drain = false; b->drain = false;
  QVERIFY(first.append("a", samples(1024))); QVERIFY(second.append("b", samples(1024)));
  first.autoplay(); second.autoplay(); QVERIFY(first.playing()); QVERIFY(second.queued()); QCOMPARE(second.queuePosition(), 1);
  QCOMPARE(a->starts, 1); QCOMPARE(b->starts, 0);
  first.restart(); QCOMPARE(b->starts, 1); QVERIFY(!first.playing());
  QTRY_VERIFY(first.queued()); QCOMPARE(first.queuePosition(), 1);
  second.stop(); QVERIFY(!first.queued()); QCOMPARE(a->starts, 2);
  a->error = true; first.pump(); QVERIFY(!first.playing()); QCOMPARE(first.state(), "Audio output failed");
  first.autoplay(); QVERIFY(!first.playing());
 }
 void completionPromotesAndResetCancelsDelayedRestart() {
  PcmQueue queue; PcmStream first(nullptr, &queue), second(nullptr, &queue);
  first.reset("a"); second.reset("b"); auto a = attach(first), b = attach(second); a->drain = false; b->drain = false;
  QVERIFY(first.append("a", samples(1024, true))); QVERIFY(second.append("b", samples(1024)));
  first.autoplay(); second.autoplay(); QCOMPARE(b->starts, 0);
  for (int i = 0; i < 4; ++i) { first.pump(); } QCOMPARE(b->starts, 0);
  a->drain = true; first.pump(); QCOMPARE(b->starts, 1);
  first.restart(); first.reset("replacement"); QTest::qWait(70); QVERIFY(!first.playing()); QVERIFY(second.playing());
 }
 void sharedQueueAcrossModelsAndDestruction() {
  PcmQueue queue;
  auto first = std::make_unique<RunOutputModel>(nullptr, &queue); RunOutputModel second(nullptr, &queue);
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto a = std::make_shared<SinkRecord>(), b = std::make_shared<SinkRecord>();
  for (const auto &record : {a, b}) { record->supported.setSampleRate(24000); record->supported.setChannelCount(1); record->supported.setSampleFormat(QAudioFormat::Float); record->drain = false; }
  first->setPcmSinkFactory([a] { return std::make_unique<RecordingSink>(a); }); second.setPcmSinkFactory([b] { return std::make_unique<RecordingSink>(b); });
  first->beginRun("a"); second.beginRun("b");
  auto emitAudio = [](RunOutputModel &model, const QString &job) { auto value = samples(1024); value["type"] = "chunk"; value["content_type"] = "audio"; model.ingest(job, {{"job_id", job}, {"type", "output_update"}, {"node_id", "speaker"}, {"output_name", "chunk"}, {"value", value}}); };
  emitAudio(*first, "a"); emitAudio(second, "b"); QCOMPARE(a->starts, 1); QCOMPARE(b->starts, 0);
  first.reset(); QCOMPARE(b->starts, 1); QCOMPARE(a->stops, 1);
  auto player = qobject_cast<PcmStream *>(second.pcmFor("speaker", "chunk")); QVERIFY(player);
  player->stop(); emitAudio(second, "b"); QVERIFY(!player->playing());
  second.reset(); QVERIFY(!second.pcmFor("speaker", "chunk"));
 }
 void actualPcm16leAndTerminator() {
  PcmBuffer buffer; buffer.reset("run");
  QVERIFY(buffer.append("run", {{"content", "AID/fw=="}, {"content_metadata", QJsonObject{{"encoding", "pcm16le"}}}}));
  QVERIFY(buffer.append("run", {{"content", ""}, {"done", true}}));
 }
 void outputStreamsHaveDistinctControllers() {
  RunOutputModel model; model.beginRun("run");
  for (const auto &node : {"a", "b"}) {
   model.ingest("run", {{"job_id", "run"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "audio"},
    {"value", QJsonObject{{"type", "chunk"}, {"content_type", "audio"}, {"content", "AAAAAA=="}}}});
  }
  const auto entries = model.entries(); QCOMPARE(entries.size(), 2);
  const auto a = entries[0].toMap()["pcmController"].value<QObject *>();
  const auto b = entries[1].toMap()["pcmController"].value<QObject *>();
  QVERIFY(a); QVERIFY(b); QVERIFY(a != b);
 }
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
