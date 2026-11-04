#include "VideoFrameView.h"
#include <QPainter>
#include <QVideoFrame>
#include <qqml.h>
#include <mutex>
namespace nodetool::node_editor {
VideoFrameView::VideoFrameView(QQuickItem *parent) : QQuickPaintedItem(parent) {
  connect(&sink_, &QVideoSink::videoFrameChanged, this, [this] {
    frame_ = sink_.videoFrame().toImage();
    update();
    emit frameChanged();
  });
}
void VideoFrameView::clearFrame() {
  sink_.setVideoFrame({});
  if (!frame_.isNull()) { frame_ = {}; update(); emit frameChanged(); }
}
void VideoFrameView::paint(QPainter *painter) {
  if (frame_.isNull()) { return; }
  auto size = QSizeF(frame_.size());
  size.scale(boundingRect().size(), Qt::KeepAspectRatio);
  const QRectF target(QPointF((width() - size.width()) / 2, (height() - size.height()) / 2), size);
  painter->setRenderHint(QPainter::SmoothPixmapTransform);
  painter->drawImage(target, frame_);
}
void registerMediaTypes() {
  static std::once_flag registered;
  std::call_once(registered, [] { qmlRegisterType<VideoFrameView>("NodeTool.NodeEditor.Media", 1, 0, "VideoFrameView"); });
}
}
