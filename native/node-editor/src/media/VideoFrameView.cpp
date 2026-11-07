#include "VideoFrameView.h"
#include "AudioWaveform.h"
#include "LiveAudioVisualizer.h"
#include "MediaGalleryModel.h"
#include <QPainter>
#include <QQuickRenderControl>
#include <QQuickWindow>
#include <QQmlEngine>
#include <QVideoFrame>
#include <qqml.h>
#include <mutex>
namespace nodetool::node_editor {
class MediaViewerHost : public QObject {
  Q_OBJECT
public:
  using QObject::QObject;
  Q_INVOKABLE QWindow *windowFor(QQuickWindow *window) const {
    if (!window) { return nullptr; }
    auto native = QQuickRenderControl::renderWindowFor(window);
    if (!native) { native = window; }
    QQmlEngine::setObjectOwnership(native, QQmlEngine::CppOwnership);
    return native;
  }
};
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
  std::call_once(registered, [] { qmlRegisterType<MediaViewerHost>("NodeTool.NodeEditor.Media", 1, 0, "MediaViewerHost"); qmlRegisterType<MediaGalleryModel>("NodeTool.NodeEditor.Media", 1, 0, "MediaGalleryModel"); qmlRegisterType<LiveAudioVisualizer>("NodeTool.NodeEditor.Media", 1, 0, "LiveAudioVisualizer"); qmlRegisterType<AudioWaveform>("NodeTool.NodeEditor.Media", 1, 0, "AudioWaveform"); qmlRegisterType<VideoFrameView>("NodeTool.NodeEditor.Media", 1, 0, "VideoFrameView"); });
}
}

#include "VideoFrameView.moc"
