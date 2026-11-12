#pragma once
#include <QAudioDecoder>
#include <QColor>
#include <QQuickPaintedItem>
#include <QUrl>
#include <QPointer>
#include <QVariantList>
#include <memory>
#include <vector>
namespace nodetool::node_editor {
// UI thread only.
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
  QUrl source() const { return source_; }
  void setSource(const QUrl &source);
  QVariantList peaks() const;
  AudioWaveform *dataSource() const { return dataSource_; }
  void setDataSource(AudioWaveform *source);
  bool loading() const { return decoder_ && decoder_->isDecoding(); }
  void paint(QPainter *painter) override;
signals:
  void sourceChanged();
  void dataSourceChanged();
  void peaksChanged();
  void appearanceChanged();
  void loadingChanged();
private:
  void consume();
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
