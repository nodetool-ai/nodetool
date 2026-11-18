#pragma once

#include "canvas/CanvasLayers.h"
#include "canvas/CanvasViewport.h"
#include "canvas/EditorCanvasScene.h"
#include <QElapsedTimer>
#include <QQuickItem>
#include <QSet>
#include <QTimer>
#include <memory>

namespace nodetool {
class CanvasSelection;
class WorkflowGraphModel;
} // namespace nodetool

namespace nodetool::canvas {

// UI thread only. The Quick canvas view, in the role QGraphicsView has for
// the QtNodes canvas. Its visual children, back to front: the grid, the content
// layer that carries the pan and zoom transform (cards, wires, lineage links,
// the draft wire and the foreground), and the overlay layer in viewport
// coordinates (the rubber band). It owns the scene, the viewport, the
// selection, the layers and the settle timer as members; the scene owns the
// CanvasInteraction. It borrows the model, which outlives it.
//
// Card and wire textures exist only near the viewport. The raster pass runs in
// updatePolish: cards on screen that have no image or changed are painted at
// once, and stale or prefetched ones within a budget of a few milliseconds a
// frame. A zoom gesture scales the existing textures; the pass paints them at
// the new scale 100 ms after the last zoom step.
class GraphCanvas final : public QQuickItem {
  Q_OBJECT
public:
  explicit GraphCanvas(WorkflowGraphModel &model, QQuickItem *parent = nullptr);
  ~GraphCanvas() override;

  EditorCanvasScene &scene() const { return *scene_; }
  const CanvasViewport &viewport() const { return viewport_; }
  CanvasSelection &selection() const { return *selection_; }
  QQuickItem &contentLayer() { return content_; }
  QQuickItem &overlayLayer() { return overlay_; }

  void setView(double zoom, QPointF center);
  // QGraphicsView::scale with AnchorViewCenter, or AnchorUnderMouse when
  // underPointer is set; pointer is the cursor in viewport coordinates.
  void scaleBy(double factor, bool underPointer, QPointF pointer);
  void centerOn(QPointF scenePoint);
  void setScroll(int horizontal, int vertical);
  void ensureVisible(const QRectF &sceneRect, int margin);
  void setTheme(const CanvasTheme &theme);
  void setHandDrag(bool handDrag);
  bool handDrag() const { return handDrag_; }
  bool rubberBandActive() const { return !bandRect_.isNull(); }
  QRect rubberBandRect() const { return bandRect_; }
  // A double-click follows on the widget; the press Qt Quick emulates for it
  // is not one QGraphicsView receives.
  void expectDoubleClick() { skipPress_ = true; }
  void contextMenu(QPoint viewportPosition, QPoint screenPosition, Qt::KeyboardModifiers modifiers);
  // The host widget was shown or hidden. A show centers on the last center.
  void setViewShown(bool shown);

  // Paints everything near the view now, without a budget.
  void flushRaster();
  // QGraphicsScene::render of a scene area at a zoom: background, items and
  // foreground painted directly, without textures.
  void renderScene(QPainter &painter, const QRectF &sceneArea, double zoom) const;
  struct RasterStats {
    int cards = 0;
    int wires = 0;
    int other = 0;
    int passes = 0;
    qint64 nanoseconds = 0;
    qint64 slowestPass = 0;
  };
  RasterStats rasterStats() const { return stats_; }
  void resetRasterStats() { stats_ = {}; }
  int gridRasters() const { return grid_.rasterCount(); }
  // The raster scale for a zoom: zoom times the device pixel ratio in steps of √2.
  double rasterScale() const;

signals:
  void viewportMoved();
  void rubberBandChanged(bool active);

protected:
  void geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) override;
  void updatePolish() override;
  void mousePressEvent(QMouseEvent *event) override;
  void mouseMoveEvent(QMouseEvent *event) override;
  void mouseReleaseEvent(QMouseEvent *event) override;
  void mouseDoubleClickEvent(QMouseEvent *event) override;
  void hoverMoveEvent(QHoverEvent *event) override;
  void hoverLeaveEvent(QHoverEvent *event) override;
  void keyPressEvent(QKeyEvent *event) override;
  void keyReleaseEvent(QKeyEvent *event) override;
  void focusOutEvent(QFocusEvent *event) override;
  void wheelEvent(QWheelEvent *event) override;

private:
  CanvasPointerEvent pointerEvent(QPointF position, QPointF global, Qt::MouseButton button, Qt::MouseButtons buttons,
                                  Qt::KeyboardModifiers modifiers) const;
  void pointerMove(QPointF position, QPointF global, Qt::MouseButtons buttons, Qt::KeyboardModifiers modifiers);
  void updateRubberBand(QPoint position, Qt::MouseButtons buttons);
  void endRubberBand();
  void viewChanged(bool zoomed);
  void rasterPass(bool flush);
  void scheduleRaster();

  WorkflowGraphModel &model_;
  CanvasViewport viewport_;
  GridItem grid_;
  QQuickItem content_;
  ForegroundItem foreground_;
  QQuickItem overlay_;
  RubberBandItem band_;
  QTimer settle_;
  // Declared last, so it is destroyed first: its items' visual parent is content_.
  std::unique_ptr<EditorCanvasScene> scene_;
  std::unique_ptr<CanvasSelection> selection_;
  QSet<quint64> near_;
  QPoint pressPosition_;
  QPointF pressScene_;
  QPointF lastMoveScene_;
  QPoint lastPosition_;
  bool handDrag_ = false;
  bool handScrolling_ = false;
  int handMotions_ = 0;
  bool rubberBanding_ = false;
  Qt::ItemSelectionOperation bandOperation_ = Qt::ReplaceSelection;
  QRect bandRect_;
  bool pressAccepted_ = false;
  bool skipPress_ = false;
  bool viewShown_ = false;
  Qt::MouseButtons buttonsDown_ = Qt::NoButton;
  bool rasterQueued_ = false;
  RasterStats stats_;
};

} // namespace nodetool::canvas
