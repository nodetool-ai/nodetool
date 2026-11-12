#pragma once
#include <QAudioDecoder>
#include <QColor>
#include <QQuickPaintedItem>
#include <QUrl>
#include <QPointer>
#include <QVariantList>
#include <QTimer>
#include <mutex>
#include <thread>
#include <optional>
#include <memory>
#include <vector>
namespace nodetool::node_editor {
struct WaveformEnvelope {
  std::vector<float> peaks;
  qint64 bucketMilliseconds = 20;
};
// UI thread only. PCM envelope computation owns its file and buffers on a worker thread.
class AudioWaveform : public QQuickPaintedItem {
  Q_OBJECT
  Q_PROPERTY(QUrl source READ source WRITE setSource NOTIFY sourceChanged)
  Q_PROPERTY(QVariantList peaks READ peaks NOTIFY peaksChanged)
  Q_PROPERTY(AudioWaveform *dataSource READ dataSource WRITE setDataSource NOTIFY dataSourceChanged)
  Q_PROPERTY(qreal viewportStart MEMBER viewportStart_ NOTIFY appearanceChanged)
  Q_PROPERTY(qreal viewportEnd MEMBER viewportEnd_ NOTIFY appearanceChanged)
  Q_PROPERTY(QColor waveColor MEMBER waveColor_ NOTIFY appearanceChanged)
  Q_PROPERTY(QColor progressColor MEMBER progressColor_ NOTIFY appearanceChanged)
  Q_PROPERTY(qreal progress MEMBER progress_ NOTIFY appearanceChanged)
  Q_PROPERTY(bool loading READ loading NOTIFY loadingChanged)
public:
  explicit AudioWaveform(QQuickItem *parent = nullptr);
  ~AudioWaveform() override;
  QUrl source() const { return source_; }
  void setSource(const QUrl &source);
  QVariantList peaks() const;
  AudioWaveform *dataSource() const { return dataSource_; }
  void setDataSource(AudioWaveform *source);
  bool loading() const { return bool(task_) || (decoder_ && decoder_->isDecoding()); }
  void paint(QPainter *painter) override;
signals:
  void sourceChanged();
  void dataSourceChanged();
  void peaksChanged();
  void appearanceChanged();
  void loadingChanged();
private:
  void consume();
  void startDecoder();
  struct EnvelopeTask {
    std::mutex mutex;
    std::optional<WaveformEnvelope> result;
    bool done = false;
  };
  // UI and worker share the task until the worker joins. mutex guards its result.
  std::shared_ptr<EnvelopeTask> task_;
  std::jthread worker_;
  QTimer envelopeTimer_;
  const std::vector<float> &envelope() const;
  QPointer<AudioWaveform> dataSource_;
  QMetaObject::Connection peaksConnection_;
  QMetaObject::Connection destroyedConnection_;
  qreal viewportStart_ = 0;
  qreal viewportEnd_ = 1;
  // One decoder for each source, owned here without a Qt parent. On macOS a
  // reused decoder can run its queued track setup after stop() released the
  // asset, and AVFoundation then aborts. Destroying the decoder drops that work.
  std::unique_ptr<QAudioDecoder> decoder_;
  QUrl source_;
  std::vector<float> peaks_;
  qint64 bucketMilliseconds_ = 20;
  QColor waveColor_;
  QColor progressColor_;
  qreal progress_ = 0;
};
}
