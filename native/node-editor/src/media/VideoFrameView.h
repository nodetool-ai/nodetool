#pragma once
#include <QQuickPaintedItem>
#include <QImage>
#include <QVideoSink>
namespace nodetool::node_editor {
class VideoFrameView : public QQuickPaintedItem {
  Q_OBJECT
  Q_PROPERTY(QVideoSink *videoSink READ videoSink CONSTANT)
  Q_PROPERTY(bool hasFrame READ hasFrame NOTIFY frameChanged)
public:
  explicit VideoFrameView(QQuickItem *parent = nullptr);
  QVideoSink *videoSink() { return &sink_; }
  bool hasFrame() const { return !frame_.isNull(); }
  Q_INVOKABLE void clearFrame();
  void paint(QPainter *painter) override;
signals:
  void frameChanged();
private:
  QVideoSink sink_;
  QImage frame_;
};
void registerMediaTypes();
}
