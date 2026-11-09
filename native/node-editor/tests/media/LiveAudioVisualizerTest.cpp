#include "media/LiveAudioVisualizer.h"
#include "media/PcmStream.h"
#include "ui/EditorWindow.h"
#include <QtTest>
#include <QQuickWidget>
#include <QDockWidget>
#include <QQuickWindow>
#include <QJsonArray>
#include <QDir>
#include <QPainter>
#include <cmath>
#include <cstring>
#include <numbers>
using namespace nodetool::node_editor;
namespace {
struct Record {
 QAudioFormat format;
 qsizetype capacity = 0;
 qsizetype limit = 100000;
 bool error = false;
 QByteArray accepted;
};
class Sink final : public PcmSink {
public:
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 explicit Sink(std::shared_ptr<Record> record) : record_(std::move(record)) {}
 QAudioFormat preferredFormat() const override { return record_->format; }
 bool supports(const QAudioFormat &format) const override { return format == record_->format; }
 bool start(const QAudioFormat &) override { return true; }
 qsizetype capacityBytes() const override { return record_->capacity; }
 qint64 write(QByteArrayView bytes) override {
  if (record_->error) { return -1; }
  const auto size = std::min({bytes.size(), record_->capacity, record_->limit});
  record_->accepted.append(bytes.data(), size); record_->capacity -= size; return size;
 }
 bool drained() const override { return false; }
 bool failed() const override { return false; }
 void stop() override {}
private:
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 std::shared_ptr<Record> record_;
};
// native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
std::shared_ptr<Record> attach(PcmStream &stream, QAudioFormat::SampleFormat format = QAudioFormat::Float, int channels = 1) {
 // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
 auto record = std::make_shared<Record>(); record->format.setSampleRate(24000); record->format.setChannelCount(channels); record->format.setSampleFormat(format);
 stream.setSinkFactory([record] { return std::make_unique<Sink>(record); }); return record;
}
QJsonObject tone(int bin = 32, int channels = 1, bool opposed = false) {
 QByteArray bytes(2048 * channels * 4, Qt::Uninitialized);
 for (int i = 0; i < 2048; ++i) {
  const auto value = static_cast<float>(0.5 * std::sin(2 * std::numbers::pi * bin * i / 1024));
  for (int channel = 0; channel < channels; ++channel) { const auto sample = opposed && channel == 1 ? -value : value; std::memcpy(bytes.data() + (i * channels + channel) * 4, &sample, 4); }
 }
 return {{"content", QString::fromLatin1(bytes.toBase64())}, {"content_metadata", QJsonObject{{"encoding", "f32le"}, {"sample_rate", 24000}, {"channels", channels}}}};
}
QQuickItem *visibleItem(QQuickItem *root, const QString &name) {
 if (root->isVisible() && root->objectName() == name) { return root; }
 for (auto child : root->childItems()) { if (auto found = visibleItem(child, name)) { return found; } }
 return nullptr;
}
QImage framebuffer(QQuickWidget &widget, QQuickItem &item) {
 const auto image = widget.grabFramebuffer();
 const auto rect = item.mapRectToScene(item.boundingRect());
 const auto ratio = image.devicePixelRatio();
 return image.copy(QRectF(rect.x() * ratio, rect.y() * ratio, rect.width() * ratio, rect.height() * ratio).toAlignedRect());
}
int differentPixels(const QImage &first, const QImage &second) {
 if (first.size() != second.size() || first.isNull()) { return 0; }
 int count = 0;
 for (int y = 0; y < first.height(); ++y) { for (int x = 0; x < first.width(); ++x) { if (first.pixel(x, y) != second.pixel(x, y)) { ++count; } } }
 return count;
}

}
class LiveAudioVisualizerTest : public QObject {
 Q_OBJECT
private slots:
 void analysisToneAndSilence() {
  AudioVisualAnalysis analysis; QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Float);
  auto bytes = QByteArray::fromBase64(tone()["content"].toString().toLatin1());
  analysis.accept(bytes, format); const auto frame = analysis.analyze();
  QCOMPARE(frame.sequence, quint64(2048)); QCOMPARE(frame.sampleRate, 24000);
  const auto maximum = std::max_element(frame.spectrum.begin(), frame.spectrum.end());
  QCOMPARE(frame.spectrum[32], *maximum); QVERIFY(frame.spectrum[32] > frame.spectrum[128] + 0.1f);
  QVERIFY(*std::max_element(frame.waveform.begin(), frame.waveform.end()) > 0.49f);
  const auto generation = frame.generation; analysis.clear(); const auto empty = analysis.analyze();
  QCOMPARE(empty.generation, generation + 1); QCOMPARE(empty.sequence, quint64(0));
  QVERIFY(std::all_of(empty.spectrum.begin(), empty.spectrum.end(), [](auto value) { return value == 0; }));
  QVERIFY(std::all_of(empty.waveform.begin(), empty.waveform.end(), [](auto value) { return value == 0; }));
 }
 void acceptedFramesOnlyAndGeneration() {
  PcmQueue queue; PcmStream stream(nullptr, &queue); auto record = attach(stream);
  stream.reset("scope"); stream.addVisualObserver(true); QVERIFY(stream.append("scope", tone())); stream.start();
  stream.refreshVisualFrame(); QCOMPARE(stream.visualFrame().sequence, quint64(0));
  record->capacity = 3; stream.pump(); stream.refreshVisualFrame(); QCOMPARE(stream.visualFrame().sequence, quint64(0));
  record->capacity = 1; stream.pump(); stream.refreshVisualFrame(); QCOMPARE(stream.visualFrame().sequence, quint64(1));
  record->capacity = 4092; stream.pump(); stream.refreshVisualFrame(); QCOMPARE(stream.visualFrame().sequence, quint64(1024));
  stream.pump(); stream.refreshVisualFrame(); QCOMPARE(stream.visualFrame().sequence, quint64(1024));
  const auto generation = stream.visualFrame().generation; stream.stop(); QCOMPARE(stream.visualFrame().generation, generation + 1); QCOMPARE(stream.visualFrame().sequence, quint64(0));
  stream.reset("next"); QCOMPARE(stream.visualFrame().generation, generation + 2);
  stream.removeVisualObserver(true);
 }
 void queuedAndErrorsStaySilent() {
  PcmQueue queue; PcmStream first(nullptr, &queue), second(nullptr, &queue); auto a = attach(first), b = attach(second);
  first.reset("a"); second.reset("b"); first.append("a", tone()); second.append("b", tone()); first.start(); second.start();
  b->capacity = 100000; second.pump(); second.refreshVisualFrame(); QCOMPARE(second.visualFrame().sequence, quint64(0)); QVERIFY(second.queued());
  first.stop(); second.refreshVisualFrame(); QVERIFY(second.visualFrame().sequence > 0);
  b->error = true; second.append("b", tone()); second.pump(); QCOMPARE(second.visualFrame().sequence, quint64(0));
 }
 void staleSilencePreservesPartialAcceptedFrame() {
  AudioVisualAnalysis analysis; QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Float);
  float value = 0.5f; const QByteArray bytes(reinterpret_cast<const char *>(&value), sizeof(value));
  analysis.accept(QByteArrayView(bytes).first(3), format); QCOMPARE(analysis.sequence(), quint64(0));
  analysis.silence(); analysis.accept(QByteArrayView(bytes).sliced(3), format); QCOMPARE(analysis.sequence(), quint64(1));
  const QByteArray silence(512 * 4, char(0)); analysis.accept(silence, format);
  const auto before = analysis.analyze(); QCOMPARE(before.waveform.back(), value);
  analysis.clear(); analysis.accept(QByteArrayView(bytes).sliced(3), format); QCOMPARE(analysis.sequence(), quint64(0));
 }
 void outputFormatsAndMonoMix_data() {
  QTest::addColumn<int>("format"); QTest::addColumn<int>("channels"); QTest::addColumn<bool>("opposed");
  QTest::newRow("float") << int(QAudioFormat::Float) << 1 << false;
  QTest::newRow("pcm16") << int(QAudioFormat::Int16) << 1 << false;
  QTest::newRow("pcm32") << int(QAudioFormat::Int32) << 1 << false;
  QTest::newRow("uint8") << int(QAudioFormat::UInt8) << 1 << false;
  QTest::newRow("opposite-stereo") << int(QAudioFormat::Float) << 2 << true;
 }
 void outputFormatsAndMonoMix() {
  QFETCH(int, format); QFETCH(int, channels); QFETCH(bool, opposed);
  PcmQueue queue; PcmStream stream(nullptr, &queue); auto record = attach(stream, static_cast<QAudioFormat::SampleFormat>(format), channels);
  stream.reset("s"); stream.append("s", tone(32, channels, opposed)); record->capacity = 100000; stream.start(); stream.refreshVisualFrame();
  const auto frame = stream.visualFrame(); QVERIFY(frame.sequence >= 1024);
  const auto peak = *std::max_element(frame.waveform.begin(), frame.waveform.end());
  if (opposed) { QCOMPARE(peak, 0.0f); } else { QVERIFY(peak > 0.48f); }
 }
 void sharedCadenceAndStaleSilence() {
  PcmQueue queue; PcmStream stream(nullptr, &queue); auto record = attach(stream); stream.reset("s"); stream.addVisualObserver(true); stream.addVisualObserver(true);
  QSignalSpy frames(&stream, &PcmStream::visualFrameChanged); stream.append("s", tone()); record->capacity = 100000; stream.start();
  QTRY_VERIFY_WITH_TIMEOUT(stream.visualFrame().sequence > 0, 150); const auto count = frames.count();
  QTest::qWait(80); QVERIFY(frames.count() - count <= 3);
  QTRY_COMPARE_WITH_TIMEOUT(stream.visualFrame().sequence, quint64(0), 400);
  stream.removeVisualObserver(true); stream.removeVisualObserver(true); const auto stoppedCount = frames.count(); QTest::qWait(80); QCOMPARE(frames.count(), stoppedCount);
 }
 void reducedMotionAcquiresOneValidSignal() {
  PcmQueue queue; PcmStream stream(nullptr, &queue); auto record = attach(stream);
  stream.reset("s"); stream.addVisualObserver(false); QSignalSpy frames(&stream, &PcmStream::visualFrameChanged);
  stream.start(); record->capacity = 100000; stream.append("s", tone());
  QVERIFY(stream.visualFrame().sequence > 0); const auto sequence = stream.visualFrame().sequence; const auto count = frames.count();
  for (int i = 0; i < 10; ++i) { record->capacity = 100000; stream.append("s", tone(64)); }
  QCOMPARE(stream.visualFrame().sequence, sequence); QTest::qWait(80); QCOMPARE(frames.count(), count);
  QTRY_COMPARE_WITH_TIMEOUT(stream.visualFrame().sequence, quint64(0), 400);
  record->capacity = 100000; stream.append("s", tone(64)); QVERIFY(stream.visualFrame().sequence > 0);
  stream.stop(); QCOMPARE(stream.visualFrame().sequence, quint64(0)); stream.removeVisualObserver(false);
 }
 void actualAudioOutputCanvasAndRunCapture_data() {
  QTest::addColumn<bool>("dark"); QTest::addColumn<QSize>("size");
  QTest::newRow("dark-wide") << true << QSize(1280, 720);
  QTest::newRow("light-narrow") << false << QSize(960, 1000);
 }
 void actualAudioOutputCanvasAndRunCapture() {
  QFETCH(bool, dark); QFETCH(QSize, size);
  const QString node = "22222222222222222222222222222222";
  nodetool::EditorWindow window; window.resize(size); window.setDarkTheme(dark);
  window.setCatalog(QJsonArray{QJsonObject{{"node_type", "nodetool.audio.realtime.AudioOutput"}, {"title", "Audio output"}, {"outputs", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", "audio"}}}}}}}});
  QVERIFY(window.document()->load(QJsonObject{{"name", "Live audio visual fixture"}, {"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", node}, {"type", "nodetool.audio.realtime.AudioOutput"}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}}}}, {"edges", QJsonArray{}}}}}));
  // native-rules #1: std::shared_ptr without a comment explaining why unique ownership is impossible
  auto record = std::make_shared<Record>(); record->format.setSampleRate(24000); record->format.setChannelCount(1); record->format.setSampleFormat(QAudioFormat::Float); record->capacity = 100000;
  window.runOutput()->setPcmSinkFactory([record] { return std::make_unique<Sink>(record); });
  window.show(); window.activateWindow(); window.action("Output");
  if (auto dock = window.findChild<QDockWidget *>("run-output-dock")) { dock->setMinimumHeight(240); }
  window.fit();
  window.runOutput()->beginRun("visual");
  auto inject = [&](int bin) {
   auto chunk = tone(bin); chunk["type"] = "chunk"; chunk["content_type"] = "audio";
   record->capacity = 100000;
   window.runOutput()->ingest("visual", {{"job_id", "visual"}, {"type", "output_update"}, {"node_id", node}, {"output_name", "value"}, {"value", chunk}});
  };
  inject(32); window.fit();
  QQuickWidget *canvas = nullptr, *panel = nullptr;
  QTRY_VERIFY_WITH_TIMEOUT(([&] {
   for (auto widget : window.findChildren<QQuickWidget *>()) {
    if (widget->objectName() == "canvas-media-" + node && widget->isVisible()) { canvas = widget; }
    if (widget->source().fileName() == "RunOutput.qml" && widget->isVisible()) { panel = widget; }
   }
   return canvas && panel;
  })(), 3000);
  QTRY_COMPARE(canvas->status(), QQuickWidget::Ready); QTRY_COMPARE(panel->status(), QQuickWidget::Ready);
  QTRY_VERIFY(visibleItem(canvas->rootObject(), "pcm-visualizer")); QTRY_VERIFY(visibleItem(panel->rootObject(), "pcm-visualizer"));
  auto canvasVisual = qobject_cast<LiveAudioVisualizer *>(visibleItem(canvas->rootObject(), "pcm-visualizer"));
  auto panelVisual = qobject_cast<LiveAudioVisualizer *>(visibleItem(panel->rootObject(), "pcm-visualizer")); QVERIFY(canvasVisual); QVERIFY(panelVisual);
  auto controller = qobject_cast<PcmStream *>(window.runOutput()->pcmFor(node, "value")); QVERIFY(controller);
  QCOMPARE(canvasVisual->controller(), controller); QCOMPARE(panelVisual->controller(), controller);
  QVERIFY(canvasVisual->height() > 0); QVERIFY(canvasVisual->width() > 0);
  QVERIFY(visibleItem(canvas->rootObject(), "pcm-start-stop")); QVERIFY(visibleItem(panel->rootObject(), "pcm-start-stop"));
  inject(32); QTRY_VERIFY_WITH_TIMEOUT(controller->visualFrame().sequence > 0, 300);
  QTest::qWait(50);
  inject(32); QTest::qWait(40);
  const auto first = framebuffer(*canvas, *canvasVisual), firstPanel = framebuffer(*panel, *panelVisual);
  QVERIFY(!first.isNull()); QVERIFY(!firstPanel.isNull());
  inject(96); QTest::qWait(40);
  const auto second = framebuffer(*canvas, *canvasVisual), secondPanel = framebuffer(*panel, *panelVisual);
  QVERIFY(differentPixels(first, second) > 20); QVERIFY(differentPixels(firstPanel, secondPanel) > 20);
  const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
  if (!directory.isEmpty()) { QVERIFY(QDir().mkpath(directory)); QVERIFY(window.grab().save(QDir(directory).filePath(QString("live-audio-%1.png").arg(QString::fromLatin1(QTest::currentDataTag()))))); }
  auto stop = visibleItem(canvas->rootObject(), "pcm-start-stop"); QVERIFY(stop);
  const auto position = stop->mapToScene(QPointF(stop->width()/2, stop->height()/2)).toPoint();
  QTest::mouseClick(canvas, Qt::LeftButton, Qt::NoModifier, position); QTRY_VERIFY(!controller->playing());
  QCOMPARE(controller->visualFrame().sequence, quint64(0));
  QTest::qWait(40);
  const auto stopped = framebuffer(*canvas, *canvasVisual), stoppedPanel = framebuffer(*panel, *panelVisual);
  QVERIFY(differentPixels(second, stopped) > 20); QVERIFY(differentPixels(secondPanel, stoppedPanel) > 20);
 }
 void sustainedAnalysisBound() {
  AudioVisualAnalysis analysis; QAudioFormat format; format.setSampleRate(24000); format.setChannelCount(1); format.setSampleFormat(QAudioFormat::Float);
  const auto bytes = QByteArray::fromBase64(tone()["content"].toString().toLatin1());
  QElapsedTimer timer; timer.start();
  for (int i = 0; i < 1000; ++i) { analysis.accept(bytes, format); const auto frame = analysis.analyze(); QCOMPARE(frame.sequence, quint64(i + 1) * 2048); }
  qInfo() << "1000 analysis frames and 2048000 accepted mono frames, elapsed ms:" << timer.elapsed() << "fixed analysis bytes:" << sizeof(analysis);
 }
 void boundedStorageAndPaint() {
  static_assert(sizeof(AudioVisualAnalysis) < 64 * 1024); static_assert(sizeof(AudioVisualFrame) < 8 * 1024);
  PcmQueue queue; PcmStream stream(nullptr, &queue); auto record = attach(stream); stream.reset("s");
  LiveAudioVisualizer visual; visual.setWidth(320); visual.setHeight(64); visual.setController(&stream);
  stream.append("s", tone()); record->capacity = 100000; stream.start(); stream.refreshVisualFrame();
  visual.setController(nullptr); visual.setController(&stream);
  QImage image(320, 64, QImage::Format_ARGB32_Premultiplied); image.fill(Qt::transparent); QPainter painter(&image); visual.paint(&painter); painter.end();
  int pixels = 0; for (int y = 0; y < image.height(); ++y) { for (int x = 0; x < image.width(); ++x) { if (qAlpha(image.pixel(x,y))) { ++pixels; } } } QVERIFY(pixels > 100);
 }
};
QTEST_MAIN(LiveAudioVisualizerTest)
#include "LiveAudioVisualizerTest.moc"
