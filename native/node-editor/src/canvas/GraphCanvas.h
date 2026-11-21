#pragma once

#include "canvas/CanvasLayers.h"
#include "canvas/CanvasViewport.h"
#include "canvas/EditorCanvasScene.h"
#include <QElapsedTimer>
#include <QQuickItem>
#include <QSet>
#include <QTimer>
#include <array>
#include <functional>
#include <memory>
#include <map>


namespace nodetool {
class CanvasSelection;
class WorkflowGraphModel;
} // namespace nodetool

namespace nodetool::canvas {
class CardOverlay;

// UI thread only. Its visual children, back to front, are the grid, the content
// layer that carries the pan and zoom transform (cards, wires, lineage links,
// the draft wire and the foreground), and the overlay layer in viewport
// coordinates (the rubber band). It owns the scene, the viewport, the
// selection, the layers and the settle timer as members; the scene owns the
// CanvasInteraction. It borrows the model, which outlives it.
//
// Card and wire textures exist only near the viewport. The raster pass runs in
// updatePolish and budgeted event-loop slices, prioritizing visible device
// tiles within the frame budget. A zoom gesture scales the existing textures;
// the pass paints them at the new scale when the gesture ends or after the
// settle pause. GraphCanvas.cpp describes the scheduler's states above
// rebuildRasterWork.
class GraphCanvas final : public QQuickItem {
  Q_OBJECT
public:
  explicit GraphCanvas(WorkflowGraphModel &model, QQuickItem *parent = nullptr);
  ~GraphCanvas() override;

  EditorCanvasScene &scene() const { return *scene_; }
  const CanvasViewport &viewport() const { return viewport_; }
  CanvasSelection &selection() const { return *selection_; }
  QQuickItem &contentLayer() { return content_; }
  void focusCanvas(Qt::FocusReason reason);
  void setCardOverlayVisible(CardOverlay &overlay, bool visible);
  std::function<void(QWheelEvent &)> viewportWheel;
  std::function<bool(PointerAction, QMouseEvent &)> viewportPointer;
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
  void cancelPointerGrab();
  bool moveGrabbedCard(QMouseEvent &event);
  // Notes that the host widget received an explicit MouseMove so the first
  // HoverEnter it produces updates canvas hover, unlike synthetic window-show enters.
  void notePointerMove() { pointerMoved_ = true; }
  // The widget shell can host focused overlays outside this Quick window.
  void setOverlayFocusCheck(std::function<bool()> check) { overlayHasFocus_ = std::move(check); }

  // Drains queued tiles immediately, retaining the offscreen cache limit.
  void flushRaster();
  // Ends an active zoom gesture immediately (e.g., pinch end or animated zoom landing)
  // so exact-scale rasters begin without waiting for the debounce pause.
  void finishZoomGesture();
  // Whether polish still has queued raster work, or the view or an item
  // moved and the settled rasters have not caught up yet.
  bool rasterPending() const {
    return rasterQueued_ || rasterTimer_.isActive() || rasterWorkDirty_ || draftRasterDirty_ ||
           nextRasterJob_ < rasterJobs_.size() || still_.isActive();
  }
  // QGraphicsScene::render of a scene area at a zoom: background, items and
  // foreground painted directly, without textures.
  void renderScene(QPainter &painter, const QRectF &sceneArea, double zoom) const;
  struct RasterStats {
    int cards = 0;
    int wires = 0;
    int foreground = 0;
    // Jobs whose tile intersected the view when it was painted.
    int visible = 0;
    int passes = 0;
    qint64 nanoseconds = 0;
    qint64 slowestPass = 0;
    qsizetype peakBytes = 0;
  };
  RasterStats rasterStats() const { return stats_; }
  void resetRasterStats() { stats_ = {}; }
  qsizetype cachedRasterBytes() const { return cachedRasterBytes_; }
  qsizetype offscreenRasterBytes() const { return offscreenRasterBytes_; }
  static constexpr qsizetype rasterCacheBudget = 64 * 1024 * 1024;
  int gridRasters() const { return grid_.rasterCount(); }
  // Exact device scale after settling, or a √2 bucket during a zoom gesture.
  double rasterScale() const;
  bool zoomSettling() const { return settle_.isActive(); }

  // UI thread only. Drives deterministic raster passes and cache pressure in the canvas tests.
  class RasterTestHooks {
  public:
    explicit RasterTestHooks(GraphCanvas &canvas) : canvas_(canvas) {}
    void setCacheBudget(qsizetype bytes) { canvas_.rasterCacheBudget_ = bytes; }
    void setTimeBudget(qint64 ns) { canvas_.rasterTimeBudgetNs_ = ns; }
    void endZoom() {
      canvas_.settle_.stop();
      canvas_.lastZoom_.invalidate();
      canvas_.zoomGestureStart_.invalidate();
    }
    void polish() { canvas_.updatePolish(); }

  private:
    GraphCanvas &canvas_;
  };

signals:
  void viewportMoved();
  void rubberBandChanged(bool active);
  void pointerCursorChanged(const QCursor &cursor);

protected:
  void geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) override;
  void updatePolish() override;
  QSGNode *updatePaintNode(QSGNode *old, UpdatePaintNodeData *) override;
  void itemChange(ItemChange change, const ItemChangeData &value) override;
  void mousePressEvent(QMouseEvent *event) override;
  void mouseUngrabEvent() override;
  void mouseMoveEvent(QMouseEvent *event) override;
  void mouseReleaseEvent(QMouseEvent *event) override;
  void mouseDoubleClickEvent(QMouseEvent *event) override;
  void hoverEnterEvent(QHoverEvent *event) override;
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
  void updatePointerCursor();
  QList<CanvasItem *> orderedItems(const QRectF &area) const;
  double itemOpacity(const CanvasItem &item) const;
  bool viewportCovered(const QRectF &visible) const;
  void updateRasterCoverage(const QRectF &visible);
  void viewChanged(bool zoomed);
  void rasterPass(bool flush);
  bool rasterDraft(const QRectF &visible, double scale, double zoom, bool settled, double dpr);
  void scheduleRaster();
  void scheduleRasterNow();
  void invalidateRasterWork();
  void invalidateDraftRaster();
  bool syncForeground(const QRectF &area, double zoom);
  void sortRasterJobs();
  bool directSoftwareWires() const;
  bool rebuildRasterWork(const QRectF &visible, double scale, double zoom, bool settled);
  // The fractional device offset of the current scroll.
  QPointF viewPhase() const;
  // A released tile image of the size, or a null image.
  QImage spareImage(QSize size);
  void keepSpare(const QImage &image);
  void startMotion();
  void settleMotion();
  void settleZoom();

  WorkflowGraphModel &model_;
  CanvasViewport viewport_;
  GridItem grid_;
  QQuickItem content_;
  QQuickItem foreground_;
  void updateCardOverlayRendering();
  QSet<CardOverlay *> visibleCardOverlays_;
  QList<QPointer<CanvasImageItem>> individualSoftwareItems_;
  bool individualSoftwareRendering_ = false;
  QQuickItem overlay_;
  RubberBandItem band_;
  QTimer settle_;
  QElapsedTimer lastZoom_;
  QElapsedTimer zoomGestureStart_;
  // Drives budgeted raster slices across event-loop turns without waiting on
  // QQuickWidget display sync between non-publishing staged or prefetch tiles.
  QTimer rasterTimer_;
  QElapsedTimer rasterBurst_;
  bool rasterWorkZoomedOut_ = false;
  // Runs from the last pan or item move. While it runs, items keep the
  // sub-pixel phase of their rasters. Its timeout restores exact phases.
  QTimer still_;
  QElapsedTimer lastMotion_;
  // The destructor releases foreground, selection and scene items while content_ is alive.
  std::unique_ptr<EditorCanvasScene> scene_;
  std::unique_ptr<CanvasSelection> selection_;
  std::map<ForegroundItem::Part::Key, std::unique_ptr<ForegroundItem>> foregroundParts_;
  struct TileRef {
    QPointer<CanvasImageItem> owner;
    QPoint key;
    QRectF sceneRect;
    bool staged = false;
  };
  struct RasterJob {
    TileRef tile;
    CanvasImageItem::RasterGeometry geometry;
    enum Kind { Card, Wire, Foreground, Other } kind;
    int priority;
    qsizetype age;
    double distance;
    bool group = false;
  };
  QSet<quint64> near_;
  QList<RasterJob> rasterJobs_;
  qsizetype nextRasterJob_ = 0;
  bool rasterJobsNeedSort_ = false;
  // Device bounds of each planned replacement. A pan replans while an
  // item is waiting to publish. The jobs hold guarded references to owners.
  QHash<quintptr, QRect> staging_;
  QList<QRectF> deferredTiles_;
  // Tile images replaced by repaints. An image is reused once it is detached,
  // that is, once the scene graph no longer shows it.
  QList<QImage> spareImages_;
  // Scene rectangles and sizes of the tiles in the planned view. A pan moves
  // the ones it leaves into the offscreen budget.
  QList<std::pair<QRectF, qsizetype>> plannedVisibleTiles_;
  QRectF plannedVisible_;
  bool rasterWorkDirty_ = true;
  bool draftRasterDirty_ = false;
  bool plannedWithoutPainting_ = false;
  // When the last pass that only planned ran.
  QElapsedTimer planOnly_;
  bool rasterWorkSettled_ = false;
  double rasterWorkScale_ = 0;
  QPointF devicePhase_;
  QRectF rasterCoverage_;
  QRectF prefetchArea_;
  QRectF retentionArea_;
  quint64 indexedRevision_ = 0;
  qsizetype cachedRasterBytes_ = 0;
  qsizetype offscreenRasterBytes_ = 0;
  qsizetype rasterCacheBudget_ = rasterCacheBudget;
  // Leave a share of the frame for input and scene graph sync. GraphCanvas.cpp
  // derives the budget for blank visible areas from it.
  qint64 rasterTimeBudgetNs_ = 1'400'000;
  // Running averages of the raster cost per painted pixel for each job kind,
  // which predict whether the next job fits the pass.
  std::array<double, 4> nsPerPixel_{};
  bool motion_ = false;
  std::function<bool()> overlayHasFocus_;
  std::optional<QPointF> cursorPoint_;
  std::optional<Qt::CursorShape> interactionCursor_;
  Qt::CursorShape pointerCursor_ = Qt::ArrowCursor;
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
  bool pointerMoved_ = false;
  Qt::MouseButtons buttonsDown_ = Qt::NoButton;
  bool rasterQueued_ = false;
  RasterStats stats_;
};

} // namespace nodetool::canvas
