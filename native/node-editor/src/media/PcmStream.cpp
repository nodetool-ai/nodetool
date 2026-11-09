#include "PcmStream.h"
#include <QAudioSink>
#include <QCoreApplication>
#include <QMediaDevices>
#include <QtEndian>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <numbers>

namespace nodetool::node_editor {
namespace {
class DeviceSink final : public PcmSink {
public:
 explicit DeviceSink(QAudioDevice device) : m_device(std::move(device)) {}
 QAudioFormat preferredFormat() const override { return m_device.preferredFormat(); }
 bool supports(const QAudioFormat &format) const override { return !m_device.isNull() && m_device.isFormatSupported(format); }
 bool start(const QAudioFormat &format) override {
  m_sink = std::make_unique<QAudioSink>(m_device, format);
  m_sink->setBufferSize(format.bytesForDuration(100000));
  m_io = m_sink->start();
  return m_io && m_sink->error() == QAudio::NoError;
 }
 qsizetype capacityBytes() const override { return m_sink ? m_sink->bytesFree() : 0; }
 qsizetype bufferedBytes() const override { return m_sink ? std::max<qsizetype>(0, m_sink->bufferSize() - m_sink->bytesFree()) : 0; }
 qint64 write(QByteArrayView bytes) override { return m_io ? m_io->write(bytes.data(), bytes.size()) : -1; }
 bool drained() const override { return m_sink && m_sink->state() == QAudio::IdleState; }
 bool failed() const override { return !m_sink || m_sink->error() != QAudio::NoError; }
 void stop() override { if (m_sink) { m_sink->stop(); } m_io = nullptr; m_sink.reset(); }
private:
 QAudioDevice m_device;
 std::unique_ptr<QAudioSink> m_sink;
 QPointer<QIODevice> m_io;
};
}
void AudioVisualAnalysis::clear() { partialSize_ = 0; silence(); }
void AudioVisualAnalysis::silence() {
 samples_.fill(0); smoothing_.fill(0); cursor_ = 0;
 sequence_ = 0; sampleRate_ = 0; ++generation_;
}
void AudioVisualAnalysis::accept(QByteArrayView bytes, const QAudioFormat &format) {
 const auto frameBytes = format.bytesPerFrame();
 if (frameBytes <= 0 || frameBytes > static_cast<qsizetype>(partial_.size())) { return; }
 sampleRate_ = format.sampleRate();
 while (!bytes.isEmpty()) {
  const auto count = std::min(frameBytes - partialSize_, bytes.size());
  std::memcpy(partial_.data() + partialSize_, bytes.data(), static_cast<std::size_t>(count));
  partialSize_ += count; bytes = bytes.sliced(count);
  if (partialSize_ != frameBytes) { continue; }
  float mono = 0;
  for (int channel = 0; channel < format.channelCount(); ++channel) {
   const auto data = partial_.data() + channel * format.bytesPerSample();
   switch (format.sampleFormat()) {
    case QAudioFormat::Float: { float value; std::memcpy(&value, data, sizeof(value)); mono += value; break; }
    case QAudioFormat::Int16: { qint16 value; std::memcpy(&value, data, sizeof(value)); mono += value / 32768.0f; break; }
    case QAudioFormat::Int32: { qint32 value; std::memcpy(&value, data, sizeof(value)); mono += static_cast<float>(value / 2147483648.0); break; }
    case QAudioFormat::UInt8: mono += (static_cast<unsigned char>(*data) - 127.5f) / 127.5f; break;
    default: break;
   }
  }
  samples_[cursor_] = std::clamp(mono / format.channelCount(), -1.0f, 1.0f);
  cursor_ = (cursor_ + 1) % samples_.size(); ++sequence_; partialSize_ = 0;
 }
}
AudioVisualFrame AudioVisualAnalysis::analyze() {
 AudioVisualFrame frame; frame.sequence = sequence_; frame.generation = generation_; frame.sampleRate = sampleRate_;
 if (!sequence_) { return frame; }
 for (std::size_t i = 0; i < samples_.size(); ++i) {
  const auto value = samples_[(cursor_ + i) % samples_.size()];
  if (i < frame.waveform.size()) { frame.waveform[i] = value; }
  const auto phase = 2 * std::numbers::pi_v<float> * static_cast<float>(i) / 1024;
  const auto window = 0.42f - 0.5f * std::cos(phase) + 0.08f * std::cos(2 * phase);
  fft_[i] = {value * window, 0};
 }
 for (std::size_t i = 1, j = 0; i < fft_.size(); ++i) {
  auto bit = fft_.size() >> 1;
  for (; j & bit; bit >>= 1) { j ^= bit; }
  j ^= bit; if (i < j) { std::swap(fft_[i], fft_[j]); }
 }
 for (std::size_t length = 2; length <= fft_.size(); length <<= 1) {
  const auto angle = -2 * std::numbers::pi_v<float> / static_cast<float>(length);
  const std::complex<float> rotation(std::cos(angle), std::sin(angle));
  for (std::size_t i = 0; i < fft_.size(); i += length) {
   std::complex<float> factor(1, 0);
   for (std::size_t j = 0; j < length / 2; ++j) {
    const auto first = fft_[i+j], second = fft_[i+j+length/2] * factor;
    fft_[i+j] = first + second; fft_[i+j+length/2] = first - second; factor *= rotation;
   }
  }
 }
 for (std::size_t i = 0; i < frame.spectrum.size(); ++i) {
  // Normalize by FFT length before smoothing linear magnitudes, as Web Audio does.
  smoothing_[i] = 0.7f * smoothing_[i] + 0.3f * std::abs(fft_[i]) / 1024;
  const auto db = 20 * std::log10(std::max(smoothing_[i], 1e-10f));
  frame.spectrum[i] = std::clamp((db + 100) / 70, 0.0f, 1.0f);
 }
 return frame;
}
void PcmBuffer::reset(QString scope, bool live) {
 m_scope = std::move(scope); m_bytes.clear(); m_cursor = 0; sampleRate = live ? 24000 : 22000; channels = 1;
 notice.clear(); m_configured = false; m_ended = false; m_live = live; m_droppedFrames = 0;
}
void PcmBuffer::setLeadMilliseconds(int value) { m_leadMs = std::clamp(value, 20, 1000); }
void PcmBuffer::trimPendingFrames(qsizetype frames) {
 if (!m_live) { return; }
 const auto drop = std::max<qsizetype>(0, queuedFrames() - std::max<qsizetype>(0, frames));
 if (drop) { m_cursor += drop * channels * 4; m_droppedFrames += drop; }
 if (m_cursor) { m_bytes.remove(0, m_cursor); m_cursor = 0; }
}
void PcmBuffer::discardPending() {
 if (m_live) { m_droppedFrames += queuedFrames(); m_bytes.clear(); m_cursor = 0; }
}
bool PcmBuffer::append(const QString &scope, const QJsonObject &chunk) {
 if (scope.isEmpty() || scope != m_scope || m_ended) { return false; }
 auto reject = [this](QString message) { notice = std::move(message); return false; };
 const auto contentValue = chunk["content"];
 if (!contentValue.isString()) { return reject("Malformed PCM content"); }
 const auto content = contentValue.toString();
 if (content.isEmpty() && chunk["done"].toBool()) { m_ended = true; return true; }
 if (chunk.contains("content_metadata") && !chunk["content_metadata"].isObject()) { return reject("Malformed PCM metadata"); }
 const auto meta = chunk["content_metadata"].toObject();
 if ((meta.contains("sample_rate") && !meta["sample_rate"].isDouble()) ||
     (meta.contains("channels") && !meta["channels"].isDouble()) ||
     (meta.contains("encoding") && !meta["encoding"].isString())) { return reject("Malformed PCM format"); }
 const auto rate = meta["sample_rate"].toDouble(sampleRate), count = meta["channels"].toDouble(channels);
 if (!std::isfinite(rate) || !std::isfinite(count) || rate < 8000 || rate > 192000 || std::floor(rate) != rate || count < 1 || count > 8 || std::floor(count) != count) { return reject("Invalid PCM sample rate or channels"); }
 if (m_configured && (rate != sampleRate || count != channels)) { return reject("PCM format changed. Restart the stream with a replacement output"); }
 const auto encoding = meta["encoding"].toString();
 if (!encoding.isEmpty() && encoding != "pcm" && encoding != "pcm16" && encoding != "pcm16le" && encoding != "f32le") { return reject("Unsupported PCM encoding"); }
 // Check encoded length before decoding or allocating a converted block.
 if (content.size() > (MaxBytes * 4 / 3 + 4)) { return reject("PCM chunk exceeds the playback limit"); }
 const auto decoded = QByteArray::fromBase64Encoding(content.toLatin1(), QByteArray::AbortOnBase64DecodingErrors);
 const int width = encoding == "f32le" ? 4 : 2;
 if (!decoded || decoded.decoded.isEmpty() || decoded.decoded.size() % (width * static_cast<int>(count))) { return reject("Malformed PCM chunk or incomplete audio frame"); }
 const auto &bytes = decoded.decoded;
 const auto size = bytes.size() / width * 4;
 if (size > MaxBytes || (!m_live && m_bytes.size() + size > MaxBytes)) { return reject("PCM replay buffer full. Additional audio refused"); }
 QByteArray output(size, Qt::Uninitialized);
 for (qsizetype i = 0; i < bytes.size() / width; ++i) {
  float value = 0;
  if (width == 2) { value = qFromLittleEndian<qint16>(bytes.constData() + i * width) / 32768.0f; }
  else { const auto bits = qFromLittleEndian<quint32>(bytes.constData() + i * width); std::memcpy(&value, &bits, 4); }
  if (!std::isfinite(value)) { return reject("Invalid non-finite PCM sample"); }
  value = std::clamp(value, -1.0f, 1.0f);
  std::memcpy(output.data() + i * 4, &value, 4);
 }
 sampleRate = static_cast<int>(rate); channels = static_cast<int>(count); m_configured = true;
 if (m_live) {
  if (m_cursor) { m_bytes.remove(0, m_cursor); m_cursor = 0; }
  const qsizetype frameBytes = channels * 4;
  const qsizetype limit = static_cast<qsizetype>(sampleRate) * m_leadMs / 1000 * frameBytes;
  const auto excess = std::max<qsizetype>(0, m_bytes.size() + output.size() - limit);
  const auto oldDrop = std::min(excess, m_bytes.size());
  m_bytes.remove(0, oldDrop); output.remove(0, excess - oldDrop);
  m_droppedFrames += excess / frameBytes;
 }
 m_bytes.append(output); m_ended = chunk["done"].toBool(); notice.clear(); return true;
}
QByteArrayView PcmBuffer::pending() const { return QByteArrayView(m_bytes).sliced(m_cursor); }
void PcmBuffer::consume(qsizetype size) {
 m_cursor += std::clamp<qsizetype>(size, 0, m_bytes.size() - m_cursor);
 if (m_live && m_cursor == m_bytes.size()) { m_bytes.clear(); m_cursor = 0; }
}
qint64 PcmBuffer::drain(QIODevice &device, qsizetype available) {
 const auto data = pending(); const auto size = std::min(data.size(), std::max<qsizetype>(0, available));
 if (!size) { return 0; }
 const auto written = device.write(data.data(), size);
 if (written > 0) { consume(written); }
 return written;
}
PcmQueue *PcmQueue::applicationQueue() {
 // native-rules #14: static mutable queue pointer
 static QPointer<PcmQueue> queue;
 if (!queue) { queue = new PcmQueue(QCoreApplication::instance()); }
 return queue;
}
bool PcmQueue::active(const PcmStream *stream) const { return m_active == stream; }
int PcmQueue::position(const PcmStream *stream) const {
 for (qsizetype i = 0; i < m_waiting.size(); ++i) { if (m_waiting[i] == stream) { return static_cast<int>(i + 1); } }
 return 0;
}
void PcmQueue::enqueue(PcmStream *stream) {
 if (active(stream)) { return; }
 m_waiting.removeIf([stream](const auto &entry) { return !entry || entry == stream; });
 m_waiting.append(stream); promote(); emit changed();
}
void PcmQueue::promote() {
 if (m_suspended || m_promoting || m_active) { return; }
 m_promoting = true;
 while (!m_active && !m_waiting.isEmpty()) {
  const auto next = m_waiting.takeFirst();
  if (next) { m_active = next; next->activate(); }
 }
 m_promoting = false;
}
void PcmQueue::remove(PcmStream *stream) {
 m_waiting.removeIf([stream](const auto &entry) { return !entry || entry == stream; });
 if (active(stream)) { m_active.clear(); }
 promote(); emit changed();
}
void PcmQueue::stopStreams(const QList<PcmStream *> &streams) {
 const auto suspended = m_suspended; m_suspended = true;
 QList<QPointer<PcmStream>> guarded;
 for (auto *stream : streams) { guarded.append(stream); }
 for (const auto &stream : guarded) { if (stream) { stream->stop(); } }
 m_suspended = suspended; promote(); emit changed();
}
void PcmQueue::stopAll() {
 QList<PcmStream *> streams;
 if (m_active) { streams.append(m_active); }
 for (const auto &entry : m_waiting) { if (entry) { streams.append(entry); } }
 stopStreams(streams);
}
PcmStream::PcmStream(QObject *parent, PcmQueue *queue) : QObject(parent), m_queue(queue ? queue : PcmQueue::applicationQueue()) {
 m_visualExpiryTimer.setSingleShot(true); m_visualExpiryTimer.setTimerType(Qt::PreciseTimer);
 connect(&m_visualExpiryTimer, &QTimer::timeout, this, &PcmStream::refreshVisualFrame);
 m_visualTimer.setInterval(33);
 connect(&m_visualTimer, &QTimer::timeout, this, &PcmStream::refreshVisualFrame);
 m_factory = [] { return std::make_unique<DeviceSink>(QMediaDevices::defaultAudioOutput()); };
 m_timer.setInterval(10); connect(&m_timer, &QTimer::timeout, this, &PcmStream::pump);
 m_restartTimer.setSingleShot(true); m_restartTimer.setInterval(50);
 connect(&m_restartTimer, &QTimer::timeout, this, &PcmStream::start);
 connect(m_queue, &PcmQueue::changed, this, &PcmStream::changed);
}
PcmStream::~PcmStream() { halt(); if (m_queue) { m_queue->remove(this); } }
void PcmStream::clearVisual() {
 m_visualTimer.stop(); m_visualExpiryTimer.stop(); m_visualAnalysis.clear(); m_visualFrame = m_visualAnalysis.analyze();
 m_lastVisualWrite.invalidate(); m_staticVisualPending = m_visualObservers > m_animatedVisualObservers;
 emit visualFrameChanged();
}
void PcmStream::updateVisualTimer() {
 const bool active = m_queue && m_queue->active(this) && m_wantsPlay;
 if (active && m_animatedVisualObservers > 0) { m_visualTimer.start(); }
 else { m_visualTimer.stop(); }
 if (!active || m_visualObservers == m_animatedVisualObservers) { m_visualExpiryTimer.stop(); }
 else if (m_lastVisualWrite.isValid() && m_visualAnalysis.sequence()) {
  const auto remaining = m_buffer.leadMilliseconds() + m_lastVisualBlockMs + 1 - m_lastVisualWrite.elapsed();
  m_visualExpiryTimer.start(static_cast<int>(std::max<qint64>(1, remaining)));
 }
}
void PcmStream::addVisualObserver(bool animated) {
 ++m_visualObservers; if (animated) { ++m_animatedVisualObservers; }
 else { m_staticVisualPending = true; }
 updateVisualTimer();
 if (!animated && m_visualAnalysis.sequence()) { refreshVisualFrame(); }
}
void PcmStream::removeVisualObserver(bool animated) {
 m_visualObservers = std::max(0, m_visualObservers - 1);
 if (animated) { m_animatedVisualObservers = std::max(0, m_animatedVisualObservers - 1); }
 m_staticVisualPending = m_staticVisualPending && m_visualObservers > m_animatedVisualObservers;
 updateVisualTimer();
}
void PcmStream::refreshVisualFrame() {
 const bool active = m_queue && m_queue->active(this) && m_wantsPlay;
 if (!active) { return; }
 if (m_lastVisualWrite.isValid() && m_lastVisualWrite.elapsed() > m_buffer.leadMilliseconds() + m_lastVisualBlockMs) {
  if (m_visualAnalysis.sequence()) {
   m_visualAnalysis.silence(); m_visualFrame = m_visualAnalysis.analyze();
   m_staticVisualPending = m_visualObservers > m_animatedVisualObservers; emit visualFrameChanged();
  }
  return;
 }
 if (!m_visualAnalysis.sequence()) { return; }
 if (m_visualFrame.sequence == m_visualAnalysis.sequence()) { m_staticVisualPending = false; return; }
 m_visualFrame = m_visualAnalysis.analyze(); m_staticVisualPending = false; emit visualFrameChanged();
}
QString PcmStream::state() const {
 if (queued()) { return QString("Queued: %1").arg(queuePosition()); }
 return m_buffer.notice.isEmpty() ? m_state : m_buffer.notice;
}
void PcmStream::halt(bool preserveConversion) {
 m_timer.stop(); if (m_sink) { m_sink->stop(); } m_sink.reset(); m_open = false; m_primed = false;
 if (!preserveConversion) { m_converted.clear(); m_written = 0; m_input.clear(); m_phase = 0; }
 else {
  // Hardware reset discards any accepted prefix of an incomplete output frame.
  // Replay that prefix so the reopened device starts on a complete frame.
  const auto frameBytes = m_outputFormat.bytesPerFrame();
  if (frameBytes > 0) { m_written -= m_written % frameBytes; }
  m_primed = m_written < m_converted.size() || !m_input.empty();
 }
 m_level = 0;
}
void PcmStream::reset(QString scope, bool live) {
 stop(); halt(); m_buffer.reset(std::move(scope), live); m_explicitStop = false; m_autoplayRequested = false;
 m_state = "Ready"; emit changed();
}
void PcmStream::replace(QString scope, bool live) {
 const auto suppressed = m_explicitStop;
 reset(std::move(scope), live);
 m_explicitStop = suppressed;
}
bool PcmStream::append(const QString &scope, const QJsonObject &chunk) {
 const auto accepted = m_buffer.append(scope, chunk);
 if (!accepted && !m_buffer.notice.isEmpty()) { fail(m_buffer.notice); }
 if (accepted) { trimLiveLead(); }
 if (accepted && m_queue && m_queue->active(this)) { pump(); }
 emit changed(); return accepted;
}
void PcmStream::finish() { m_buffer.finish(); if (m_queue && m_queue->active(this)) { pump(); } emit changed(); }
void PcmStream::setSinkFactory(SinkFactory factory) {
 const auto suppressed = m_explicitStop;
 stop(); m_factory = std::move(factory); m_explicitStop = suppressed;
}
void PcmStream::startOnDevice(const QAudioDevice &device) {
 if (device.isNull()) { fail("No audio output device available"); return; }
 setSinkFactory([device] { return std::make_unique<DeviceSink>(device); }); start();
}
void PcmStream::autoplay() {
 if (m_autoplayRequested || m_explicitStop || !m_buffer.configured()) { return; }
 m_autoplayRequested = true; start();
}
void PcmStream::start() {
 m_restartTimer.stop();
 if (m_explicitStop && m_buffer.live()) { m_buffer.discardPending(); }
 m_explicitStop = false; m_wantsPlay = true; m_buffer.notice.clear();
 m_queue->enqueue(this); emit changed();
}
void PcmStream::stop() {
 m_restartTimer.stop(); clearVisual(); m_wantsPlay = false; m_explicitStop = true; halt(!m_buffer.live());
 if (m_queue) { m_queue->remove(this); }
 m_state = "Stopped"; m_buffer.notice.clear(); emit changed();
}
void PcmStream::restart() {
 stop(); halt(); m_buffer.rewind(); m_restartTimer.start();
}
void PcmStream::fail(QString message) {
 stop(); m_state = std::move(message); emit changed();
}
void PcmStream::activate() {
 if (!m_wantsPlay) { m_queue->remove(this); return; }
 m_state = "Waiting for audio"; m_timer.start(); updateVisualTimer(); pump(); emit changed();
}
bool PcmStream::configure() {
 if (!m_buffer.configured()) { return false; }
 m_sink = m_factory();
 if (!m_sink) { fail("No audio output device available"); return false; }
 QAudioFormat format; format.setSampleRate(m_buffer.sampleRate); format.setChannelCount(m_buffer.channels); format.setSampleFormat(QAudioFormat::Float);
 if (!m_sink->supports(format)) { format = m_sink->preferredFormat(); }
 const bool channelsSupported = format.channelCount() == m_buffer.channels || (m_buffer.channels == 1 && format.channelCount() == 2) || (m_buffer.channels == 2 && format.channelCount() == 1);
 if (!format.isValid() || format.sampleRate() < 8000 || format.sampleRate() > 192000 || !channelsSupported ||
     (format.sampleFormat() != QAudioFormat::Float && format.sampleFormat() != QAudioFormat::Int16 && format.sampleFormat() != QAudioFormat::Int32 && format.sampleFormat() != QAudioFormat::UInt8) || !m_sink->supports(format)) {
  fail("Audio device does not support this PCM format"); return false;
 }
 if (m_written < m_converted.size() && m_outputFormat != format) {
  fail("Audio device format changed. Restart to replay retained audio"); return false;
 }
 m_outputFormat = format;
 if (!m_sink->start(format)) { fail("Audio output could not start"); return false; }
 m_open = true; return true;
}
void PcmStream::convert() {
 // Carry one interpolation frame and fractional position across source blocks.
 const auto frameBytes = m_buffer.channels * 4;
 const auto pending = m_buffer.pending();
 const auto bytes = std::min<qsizetype>(pending.size(), 1024 * frameBytes);
 if (bytes) {
  const auto oldSize = m_input.size(); m_input.resize(oldSize + static_cast<std::size_t>(bytes / 4));
  std::memcpy(m_input.data() + oldSize, pending.data(), static_cast<std::size_t>(bytes)); m_buffer.consume(bytes);
 }
 const auto frames = m_input.size() / static_cast<std::size_t>(m_buffer.channels);
 const bool final = m_buffer.ended() && m_buffer.pending().isEmpty();
 const double step = static_cast<double>(m_buffer.sampleRate) / m_outputFormat.sampleRate();
 m_converted.clear(); m_written = 0; m_level = 0;
 const auto outChannels = m_outputFormat.channelCount();
 while (m_phase < static_cast<double>(frames) && (final || m_phase + 1 < static_cast<double>(frames))) {
  const auto first = static_cast<std::size_t>(m_phase), next = std::min(first + 1, frames - 1);
  const auto fraction = static_cast<float>(m_phase - static_cast<double>(first));
  auto sample = [&](int channel) {
   const auto index = first * static_cast<std::size_t>(m_buffer.channels) + static_cast<std::size_t>(channel);
   const auto second = next * static_cast<std::size_t>(m_buffer.channels) + static_cast<std::size_t>(channel);
   return m_input[index] + fraction * (m_input[second] - m_input[index]);
  };
  for (int channel = 0; channel < outChannels; ++channel) {
   float value = m_buffer.channels == 1 ? sample(0) : outChannels == 1 ? (sample(0) + sample(1)) / 2 : sample(channel);
   value = std::clamp(value, -1.0f, 1.0f); m_level = std::max(m_level, static_cast<double>(std::abs(value)));
   switch (m_outputFormat.sampleFormat()) {
    case QAudioFormat::Float: m_converted.append(reinterpret_cast<const char *>(&value), 4); break;
    case QAudioFormat::Int16: { const auto integer = static_cast<qint16>(std::clamp(std::lround(value * 32768.0), -32768L, 32767L)); m_converted.append(reinterpret_cast<const char *>(&integer), 2); break; }
    case QAudioFormat::Int32: { const auto integer = static_cast<qint32>(std::clamp(std::llround(value * 2147483648.0), -2147483648LL, 2147483647LL)); m_converted.append(reinterpret_cast<const char *>(&integer), 4); break; }
    case QAudioFormat::UInt8: { const auto integer = static_cast<quint8>(std::clamp(std::lround((value + 1) * 127.5), 0L, 255L)); m_converted.append(static_cast<char>(integer)); break; }
    default: break;
   }
  }
  m_phase += step;
 }
 const auto consumed = std::min(static_cast<std::size_t>(m_phase), frames);
 m_input.erase(m_input.begin(), m_input.begin() + static_cast<std::ptrdiff_t>(consumed * static_cast<std::size_t>(m_buffer.channels)));
 m_phase -= static_cast<double>(consumed);
}
qsizetype PcmStream::outstandingFrames() const {
 const auto inputFrames = static_cast<double>(m_input.size()) / m_buffer.channels;
 qsizetype frames = static_cast<qsizetype>(std::ceil(std::max(0.0, inputFrames - m_phase)));
 if (m_outputFormat.isValid()) {
  const auto outputFrameBytes = m_outputFormat.bytesPerFrame();
  const auto hardwareBytes = m_open && m_sink ? std::max<qsizetype>(0, m_sink->bufferedBytes()) : 0;
  const auto convertedBytes = m_converted.size() - m_written;
  const auto outputFrames = (hardwareBytes + convertedBytes + outputFrameBytes - 1) / outputFrameBytes;
  frames += static_cast<qsizetype>(std::ceil(static_cast<double>(outputFrames) * m_buffer.sampleRate / m_outputFormat.sampleRate()));
 }
 return frames;
}
qint64 PcmStream::queuedFrames() const { return m_buffer.queuedFrames() + outstandingFrames(); }
void PcmStream::trimLiveLead() {
 if (m_buffer.live()) { m_buffer.trimPendingFrames(m_buffer.leadFrames() - outstandingFrames()); }
}
void PcmStream::pump() {
 if (!m_queue || !m_queue->active(this) || !m_wantsPlay) { return; }
 if (!m_buffer.configured()) {
  if (m_buffer.ended()) { clearVisual(); halt(); m_wantsPlay = false; m_state = "Ended"; m_queue->remove(this); emit changed(); }
  else { m_state = "Waiting for audio"; }
  return;
 }
 if (!m_primed && !m_buffer.ended() && m_buffer.queuedFrames() < m_buffer.primeFrames()) { m_state = m_buffer.queuedFrames() ? "Buffering audio" : "Waiting for audio"; return; }
 m_primed = true;
 if (!m_open && !configure()) { return; }
 if (m_sink->failed()) { fail("Audio output failed"); return; }
 // Fill available device lead, rather than limiting throughput to one source
 // block per timer interval. Bound work even for devices that short-write.
 bool acceptedVisualFrames = false;
 qsizetype budget = m_outputFormat.bytesForDuration(100000);
 for (int iteration = 0; iteration < 64 && budget > 0; ++iteration) {
  const auto available = std::max<qsizetype>(0, m_sink->capacityBytes());
  if (!available) { break; }
  if (m_written == m_converted.size()) { convert(); }
  const auto bytes = std::min({m_converted.size() - m_written, available, budget});
  if (!bytes) { break; }
  const auto written = m_sink->write(QByteArrayView(m_converted).sliced(m_written, bytes));
  if (written < 0 || written > bytes) { fail("Audio output write failed"); return; }
  if (!written) { break; }
  acceptedVisualFrames = true;
  m_visualAnalysis.accept(QByteArrayView(m_converted).sliced(m_written, written), m_outputFormat);
  m_lastVisualWrite.restart();
  m_lastVisualBlockMs = static_cast<int>(m_outputFormat.durationForBytes(written) / 1000);
  m_written += written; budget -= written;
 }
 const bool empty = m_buffer.pending().isEmpty() && m_input.empty() && m_written == m_converted.size();
 const bool starved = m_buffer.pending().isEmpty() && m_input.size() <= static_cast<std::size_t>(m_buffer.channels) && m_written == m_converted.size();
 if (empty && m_buffer.ended() && m_sink->drained()) {
  clearVisual(); halt(); m_wantsPlay = false; m_state = "Ended"; m_queue->remove(this); emit changed(); return;
 }
 if (starved && m_sink->drained()) { m_primed = false; }
 m_state = starved ? "Waiting for audio" : "Playing";
 if (acceptedVisualFrames && m_visualObservers > m_animatedVisualObservers) {
  m_visualExpiryTimer.start(m_buffer.leadMilliseconds() + m_lastVisualBlockMs + 1);
 }
 if (m_staticVisualPending && m_visualAnalysis.sequence()) { refreshVisualFrame(); }
 emit changed();
}
}
