#include "VideoFrameItem.h"
#include <QPainter>
#include <QVideoFrame>
namespace nodetool::media_player {
VideoFrameItem::VideoFrameItem(QQuickItem *parent) : QQuickPaintedItem(parent) {
  connect(&sink_, &QVideoSink::videoFrameChanged, this, [this](const QVideoFrame &frame) {
    frame_ = frame.toImage();
    update();
    emit frameChanged();
  });
}
void VideoFrameItem::clearFrame() {
  if (frame_.isNull()) { return; }
  frame_ = {};
  update();
  emit frameChanged();
}
void VideoFrameItem::paint(QPainter *painter) {
  if (frame_.isNull()) { return; }
  auto size = QSizeF(frame_.size());
  size.scale(boundingRect().size(), Qt::KeepAspectRatio);
  const QRectF target(QPointF((width() - size.width()) / 2, (height() - size.height()) / 2), size);
  painter->setRenderHint(QPainter::SmoothPixmapTransform);
  painter->drawImage(target, frame_);
}
}
