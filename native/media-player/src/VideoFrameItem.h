#pragma once
#include <QImage>
#include <QQuickPaintedItem>
#include <QVideoSink>
#include <qqmlintegration.h>
namespace nodetool::media_player {
// Paints the frames of a QVideoSink. QtMultimedia's VideoOutput stays black in
// a QQuickWidget, which hosts the node editor's panels, so the player draws its
// frames itself, as the node editor's VideoFrameView does. UI thread only.
class VideoFrameItem : public QQuickPaintedItem {
  Q_OBJECT
  QML_ELEMENT
  Q_PROPERTY(QVideoSink *videoSink READ videoSink CONSTANT)
  Q_PROPERTY(bool hasFrame READ hasFrame NOTIFY frameChanged)
public:
  explicit VideoFrameItem(QQuickItem *parent = nullptr);
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
}
