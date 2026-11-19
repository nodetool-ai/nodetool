#pragma once

#include "ui/CanvasSurface.h"
#include <QPointer>
#include <memory>

class QQuickWidget;
class QQmlEngine;

namespace nodetool {
class WorkflowGraphModel;
namespace canvas {
class CanvasScene;
class GraphCanvas;
} // namespace canvas

// UI thread only. CanvasSurface over the Quick canvas: one QQuickWidget that
// hosts a GraphCanvas and its Quick overlays, so it is
// both hostWidget() and viewportWidget(). The Qt parent (the shell) owns the
// QQuickWidget. This object owns the GraphCanvas through
// std::unique_ptr and destroys it before the widgets; the model outlives it.
class QuickCanvas final : public CanvasSurface {
  Q_OBJECT
public:
  QuickCanvas(WorkflowGraphModel &model, QWidget &parent, QQmlEngine *engine = nullptr);
  ~QuickCanvas() override;

  // Quick is the default. The legacy test switch lasts until Q6.
  static bool selected();
  canvas::GraphCanvas &graphCanvas() const { return *canvas_; }
  canvas::CanvasScene &canvasScene() const;
  QQuickWidget &quickWidget() const;

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

  EditorSceneApi &scene() const override;
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

protected:
  bool eventFilter(QObject *object, QEvent *event) override;

private:
  canvas::GraphCanvas &graph() const;
  WorkflowGraphModel &model_;
  QPointer<QWidget> host_;
  QPointer<QQuickWidget> widget_;
  std::unique_ptr<canvas::GraphCanvas> canvas_;
};

} // namespace nodetool
