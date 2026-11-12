#include "AudioWaveform.h"
#include <QAudioBuffer>
#include <QFile>
#include <QtEndian>
#include <optional>
#include <QPainter>
#include <algorithm>
#include <cmath>
namespace nodetool::node_editor {
namespace {
// Pool thread only. The file, read buffer and peaks belong to this call.
std::optional<WaveformEnvelope> pcmWavEnvelope(const QUrl &source, std::stop_token stopped) {
  if (!source.isLocalFile()) { return std::nullopt; }
  QFile file(source.toLocalFile());
  if (!file.open(QIODevice::ReadOnly)) { return std::nullopt; }
  // Match the resolver cache bound.
  if (file.size() > 128 * 1024 * 1024) { return std::nullopt; }
  const auto header = file.read(12);
  if (header.size() != 12 || header.first(4) != "RIFF" || header.sliced(8, 4) != "WAVE") { return std::nullopt; }
  quint16 channels = 0, blockAlign = 0;
  quint32 rate = 0;
  qint64 dataOffset = 0, dataBytes = 0;
  while (file.size() - file.pos() >= 8) {
    if (stopped.stop_requested()) { return std::nullopt; }
    const auto chunk = file.read(8);
    const auto length = qFromLittleEndian<quint32>(chunk.constData() + 4);
    const auto start = file.pos();
    const auto available = std::min<qint64>(length, file.size() - start);
    if (chunk.first(4) == "fmt ") {
      const auto format = file.read(std::min<qint64>(available, 16));
      if (format.size() < 16 || qFromLittleEndian<quint16>(format.constData()) != 1 || qFromLittleEndian<quint16>(format.constData() + 14) != 16) { return std::nullopt; }
      channels = qFromLittleEndian<quint16>(format.constData() + 2);
      rate = qFromLittleEndian<quint32>(format.constData() + 4);
      blockAlign = qFromLittleEndian<quint16>(format.constData() + 12);
    } else if (chunk.first(4) == "data") {
      dataOffset = start;
      dataBytes = available;
    }
    if (!file.seek(start + available + (length & 1))) { return std::nullopt; }
    if (dataOffset && rate && channels) { break; }
  }
  if (!dataOffset || !rate || !channels || blockAlign != channels * 2 || !file.seek(dataOffset)) { return std::nullopt; }
  WaveformEnvelope envelope;
  const auto frames = dataBytes / blockAlign;
  const auto durationMs = frames * 1000 / rate;
  while (durationMs / envelope.bucketMilliseconds >= 1024) { envelope.bucketMilliseconds *= 2; }
  envelope.peaks.resize(frames > 0 ? static_cast<size_t>((frames - 1) * 1000 / rate / envelope.bucketMilliseconds + 1) : 0, 0);
  qint64 frame = 0;
  while (frame < frames) {
    if (stopped.stop_requested()) { return std::nullopt; }
    const auto count = std::min<qint64>(frames - frame, std::max<qint64>(1, 65536 / blockAlign));
    const auto bytes = file.read(count * blockAlign);
    if (bytes.size() != count * blockAlign) { return std::nullopt; }
    for (qint64 i = 0; i < count; ++i) {
      const auto bucket = static_cast<size_t>((frame + i) * 1000 / rate / envelope.bucketMilliseconds);
      for (quint16 channel = 0; channel < channels; ++channel) {
        const auto sample = qFromLittleEndian<qint16>(bytes.constData() + i * blockAlign + channel * 2);
        envelope.peaks[bucket] = std::max(envelope.peaks[bucket], std::abs(static_cast<float>(sample) / 32768));
      }
    }
    frame += count;
  }
  return envelope;
}
} // namespace

AudioWaveform::AudioWaveform(QQuickItem *parent) : QQuickPaintedItem(parent) {
  connect(this, &AudioWaveform::appearanceChanged, this, [this] { update(); });
  envelopeTimer_.setInterval(10);
  connect(&envelopeTimer_, &QTimer::timeout, this, [guard = QPointer(this)] {
    if (!guard || !guard->task_) { return; }
    std::optional<WaveformEnvelope> result;
    {
      std::lock_guard lock(guard->task_->mutex);
      if (!guard->task_->done) { return; }
      result = std::move(guard->task_->result);
    }
    guard->worker_ = std::jthread{};
    guard->task_.reset();
    guard->envelopeTimer_.stop();
    if (result) {
      guard->peaks_ = std::move(result->peaks);
      guard->bucketMilliseconds_ = result->bucketMilliseconds;
      guard->update();
      emit guard->peaksChanged();
    } else { guard->startDecoder(); }
    emit guard->loadingChanged();
  });
}
AudioWaveform::~AudioWaveform() {
  worker_ = std::jthread{};
}
void AudioWaveform::startDecoder() {
  decoder_ = std::make_unique<QAudioDecoder>();
  connect(decoder_.get(), &QAudioDecoder::bufferReady, this, &AudioWaveform::consume);
  connect(decoder_.get(), &QAudioDecoder::isDecodingChanged, this, &AudioWaveform::loadingChanged);
  decoder_->setSource(source_);
  decoder_->start();
}
void AudioWaveform::setSource(const QUrl &source) {
  if (source_ == source) { return; }
  worker_ = std::jthread{};
  envelopeTimer_.stop();
  task_.reset();
  decoder_.reset();
  source_ = source;
  peaks_.clear();
  bucketMilliseconds_ = 20;
  update();
  emit peaksChanged();
  emit sourceChanged();
  if (source.isLocalFile()) {
    task_ = std::make_shared<EnvelopeTask>();
    worker_ = std::jthread([source, task = task_](std::stop_token stopped) {
      auto result = pcmWavEnvelope(source, stopped);
      std::lock_guard lock(task->mutex);
      task->result = std::move(result);
      task->done = true;
    });
    envelopeTimer_.start();
  } else if (!source.isEmpty()) { startDecoder(); }
  emit loadingChanged();
}
const std::vector<float> &AudioWaveform::envelope() const {
  return dataSource_ ? dataSource_->peaks_ : peaks_;
}
void AudioWaveform::setDataSource(AudioWaveform *source) {
  // A display may share a decoder's envelope, but cannot form a reference cycle.
  if (source == this || (source && source->dataSource()) || dataSource_ == source) { return; }
  disconnect(peaksConnection_);
  disconnect(destroyedConnection_);
  dataSource_ = source;
  if (source) {
    peaksConnection_ = connect(source, &AudioWaveform::peaksChanged, this, [this] { update(); emit peaksChanged(); });
    destroyedConnection_ = connect(source, &QObject::destroyed, this, [this] { update(); emit peaksChanged(); emit dataSourceChanged(); });
  }
  update();
  emit peaksChanged();
  emit dataSourceChanged();
}
QVariantList AudioWaveform::peaks() const {
  QVariantList result;
  result.reserve(static_cast<qsizetype>(envelope().size()));
  for (const auto peak : envelope()) { result.append(peak); }
  return result;
}
void AudioWaveform::consume() {
  if (!decoder_) { return; }
  const auto buffer = decoder_->read();
  if (!buffer.isValid()) { return; }
  const auto format = buffer.format();
  const auto *bytes = buffer.constData<char>();
  const auto channels = format.channelCount();
  const auto sampleBytes = format.bytesPerSample();
  for (int frame = 0; frame < buffer.frameCount(); ++frame) {
    const auto milliseconds = buffer.startTime() / 1000 + qint64(frame) * 1000 / format.sampleRate();
    auto bucket = milliseconds / bucketMilliseconds_;
    // Keep memory bounded even when decoding long recordings. Each coarser
    // bucket retains the largest real sample amplitude in its interval.
    while (bucket >= 1024) {
      std::vector<float> coarser((peaks_.size() + 1) / 2, 0);
      for (size_t i = 0; i < peaks_.size(); ++i) { coarser[i / 2] = std::max(coarser[i / 2], peaks_[i]); }
      peaks_ = std::move(coarser);
      bucketMilliseconds_ *= 2;
      bucket = milliseconds / bucketMilliseconds_;
    }
    if (bucket < 0) { continue; }
    if (static_cast<size_t>(bucket) >= peaks_.size()) { peaks_.resize(static_cast<size_t>(bucket) + 1, 0); }
    for (int channel = 0; channel < channels; ++channel) {
      const auto sample = format.normalizedSampleValue(bytes + (qint64(frame) * channels + channel) * sampleBytes);
      peaks_[static_cast<size_t>(bucket)] = std::max(peaks_[static_cast<size_t>(bucket)], std::abs(sample));
    }
  }
  update();
  emit peaksChanged();
}
void AudioWaveform::paint(QPainter *painter) {
  const auto &peaks = envelope();
  if (peaks.empty() || width() <= 0 || height() <= 0) { return; }
  const auto start = std::clamp(viewportStart_, qreal(0), qreal(1));
  const auto end = std::clamp(viewportEnd_, start, qreal(1));
  if (end <= start) { return; }
  const auto columns = std::max(1, static_cast<int>(width()));
  for (int x = 0; x < columns; ++x) {
    const auto fraction = start + qreal(x) / columns * (end - start);
    const auto first = std::min(peaks.size() - 1, static_cast<size_t>(fraction * peaks.size()));
    const auto last = std::min(peaks.size(), std::max(first + 1, static_cast<size_t>((start + qreal(x + 1) / columns * (end - start)) * peaks.size())));
    const auto peak = *std::max_element(peaks.begin() + first, peaks.begin() + last);
    painter->setPen(fraction < progress_ ? progressColor_ : waveColor_);
    const auto amplitude = std::clamp(qreal(peak), qreal(0), qreal(1)) * height() / 2;
    painter->drawLine(QPointF(x, height() / 2 - amplitude), QPointF(x, height() / 2 + amplitude));
  }
}
}
