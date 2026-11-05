#include "AudioWaveform.h"
#include <QAudioBuffer>
#include <QPainter>
#include <algorithm>
#include <cmath>
namespace nodetool::node_editor {
AudioWaveform::AudioWaveform(QQuickItem *parent) : QQuickPaintedItem(parent) {
  connect(&decoder_, &QAudioDecoder::bufferReady, this, &AudioWaveform::consume);
  connect(&decoder_, &QAudioDecoder::isDecodingChanged, this, &AudioWaveform::loadingChanged);
  connect(this, &AudioWaveform::appearanceChanged, this, [this] { update(); });
}
void AudioWaveform::setSource(const QUrl &source) {
  if (source_ == source) { return; }
  decoder_.stop();
  source_ = source;
  peaks_.clear();
  bucketMilliseconds_ = 20;
  update();
  emit peaksChanged();
  emit sourceChanged();
  decoder_.setSource(source);
  if (!source.isEmpty()) { decoder_.start(); }
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
  const auto buffer = decoder_.read();
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
