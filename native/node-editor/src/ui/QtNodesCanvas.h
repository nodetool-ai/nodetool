#pragma once

#include "ui/CanvasSurface.h"

#include "ui/QtNodesCanvasView.h"
namespace QtNodes { class NodeGraphicsObject; }

namespace nodetool {
class EditorScene;

// UI thread only. Adapts a scene and its view, both owned by their Qt hosts.
class QtNodesCanvas final : public CanvasSurface {
public:
  QtNodesCanvas(EditorScene &scene, QtNodesCanvasView &view);
  static QtNodesCanvasView &createView(EditorScene &scene, QWidget &parent);
  void detachScene();

  QPointF mapToScene(QPoint point) const override;
  QPoint mapFromScene(QPointF point) const override;
  QRect mapFromScene(QRectF rect) const override;
  QRectF visibleSceneRect() const override;
  QTransform viewportTransform() const override;
  double zoom() const override;
  QPointF center() const override;
  void centerOn(QPointF position) override;
  void setView(double zoom, QPointF center) override;
  void scaleBy(double factor, ZoomAnchor anchor) override;
  void ensureVisible(QRectF rect, int margin) override;
  void panBy(QPoint pixels) override;
  int horizontalOffset() const override;
  void setHorizontalOffset(int offset) override;

  bool hasNode(QtNodes::NodeId id) const override;
  QRectF nodeRect(QtNodes::NodeId id) const override;
  QRectF nodeBounds(QtNodes::NodeId id) const override;
  QRectF edgeBounds(const QtNodes::ConnectionId &id) const override;
  QPointF nodeOrigin(QtNodes::NodeId id) const override;
  QPointF mapFromNode(QtNodes::NodeId id, QPointF local) const override;
  QRectF mapRectFromNode(QtNodes::NodeId id, QRectF local) const override;
  QPointF mapToNode(QtNodes::NodeId id, QPointF scenePoint) const override;
  double nodeOpacity(QtNodes::NodeId id) const override;
  QList<QtNodes::NodeId> visibleNodes() const override;
  QtNodes::NodeId nodeAt(QPoint viewportPoint, bool includeDecorations = false) const override;
  bool hasItemAt(QPoint viewportPoint) const override;
  bool lineageAt(QPoint viewportPoint) const override;
  std::optional<QtNodes::ConnectionId> edgeAt(QPoint viewportPoint) const override;

  CanvasSelection &selection() const override;
  bool rubberBandActive() const override;
  void setHandDrag(bool enabled) override;
  void requestRepaint() override;
  void setCursor(const QCursor &cursor) override;
  void setFocus(Qt::FocusReason reason) override;
  QImage capture(canvas_capture::Mode mode) const override;
  QImage renderCard(QtNodes::NodeId id) const override;
  std::unique_ptr<CanvasNote> addNote(QtNodes::NodeId id, const QString &text, const QString &name,
                                      std::function<void()> edit, std::function<void()> remove) override;
  QWidget &hostWidget() const override;
  QWidget &viewportWidget() const override;

  // QtNodes-specific fixture and decoration access while painters move to
  // the canvas state structs.
  static QtNodes::NodeGraphicsObject *graphicsNode(EditorScene &scene, QtNodes::NodeId id);

private:
  EditorScene &scene_;
  QtNodesCanvasView &view_;
  std::unique_ptr<CanvasSelection> selection_;
};

}
