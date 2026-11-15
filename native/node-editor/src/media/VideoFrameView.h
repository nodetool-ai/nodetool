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
// A still image scaled to cover the item and cropped to it, as an img with
// object-fit: cover. The compositor's layer rows show each layer's image in
// one (LayerRow.tsx). UI thread only. QML owns it.
class ImageThumbnail : public QQuickPaintedItem {
  Q_OBJECT
  // A QImage. QVariant, so a QImage inside a model entry's map reaches it intact.
  Q_PROPERTY(QVariant image READ imageValue WRITE setImageValue NOTIFY imageChanged)
  Q_PROPERTY(bool hasImage READ hasImage NOTIFY imageChanged)
public:
  explicit ImageThumbnail(QQuickItem *parent = nullptr);
  QImage image() const { return image_; }
  void setImage(const QImage &image);
  QVariant imageValue() const { return image_; }
  void setImageValue(const QVariant &image) { setImage(image.value<QImage>()); }
  bool hasImage() const { return !image_.isNull(); }
  void paint(QPainter *painter) override;
signals:
  void imageChanged();
private:
  QImage image_;
};
void registerMediaTypes();
}
