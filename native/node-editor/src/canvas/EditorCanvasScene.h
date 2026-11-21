#pragma once

#include <tuple>

#include "canvas/CanvasInteraction.h"
#include "canvas/CanvasScene.h"
#include "canvas/CanvasStyle.h"
#include "canvas/EditorSceneApi.h"
#include <QElapsedTimer>
#include <QSet>
#include <QTimer>
#include <functional>
#include <optional>

class QKeyEvent;

namespace nodetool {
class CanvasIconCache;
class WorkflowGraphModel;
}

namespace nodetool::canvas {
struct CardItemState;

// UI thread only. The editor's scene on the Quick canvas, as EditorScene is on
// QtNodes: it projects cards and wires into the shared painters, dims the
// branch around the selection, animates runs and hosts CanvasInteraction. Its
// view (GraphCanvas) owns it and outlives it; the model outlives both.
class EditorCanvasScene final : public CanvasScene, public EditorSceneApi, private CanvasInteractionHost {
  Q_OBJECT
public:
  EditorCanvasScene(WorkflowGraphModel &model, QQuickItem &layer, QObject *parent = nullptr);
  ~EditorCanvasScene() override;

  QObject &sceneObject() override { return selectionGate(); }
  CanvasInteraction &interaction() override { return interaction_; }
  const CanvasInteraction &interaction() const override { return interaction_; }
  QtNodes::AbstractGraphModel &graphModel() override { return CanvasScene::graphModel(); }
  const QtNodes::AbstractGraphModel &graphModel() const override { return CanvasScene::graphModel(); }
  QtNodes::AbstractNodeGeometry &nodeGeometry() override { return CanvasScene::nodeGeometry(); }
  const QtNodes::AbstractNodeGeometry &nodeGeometry() const override { return CanvasScene::nodeGeometry(); }
  const CanvasTheme &theme() const override { return theme_; }
  void setTheme(const CanvasTheme &theme) override;
  void setReducedMotion(bool reduced) override;
  double animationPhase() const override { return phase_; }
  double runningAngle() const override { return animation_.isActive() ? runningRingAngle(clock_.elapsed()) : 90; }
  bool animationActive() const override { return animation_.isActive(); }
  bool branchDimmed(QtNodes::NodeId id) const override { return dimmedNodes_.contains(id); }
  double commentContentHeight(const QString &markdown, double cardWidth) const override;
  void clearSelection() override { CanvasScene::clearSelection(); }
  void resetDraftConnection() override { interaction_.resetDraftConnection(); }

  void paintNode(QPainter &painter, const NodeItem &item, double zoom) const override;
  void paintConnection(QPainter &painter, const ConnectionItem &item, double zoom) const override;
  std::optional<WirePaintState> connectionPaintState(const ConnectionItem &item, double zoom) const override;
  const CanvasTheme *canvasTheme() const override { return &theme_; }
  QPainterPath connectionStroke(const ConnectionItem &item) const override;
  QPainterPath connectionPath(const ConnectionItem &item) const override;
  bool connectionPaintsOffPath(const ConnectionItem &item) const override;
  // Group labels, the drop hint and the port
  // names of selected and hovered cards, in scene coordinates.
  void paintForeground(QPainter &painter, const QRectF &sceneArea, double zoom) const;
  // Draws the canvas color, cross grid and axes.
  void paintBackground(QPainter &painter, const QRectF &sceneArea, double zoom) const;
  struct ForegroundPart {
    enum Kind { GroupLabel, DropHint, InputLabel, OutputLabel };
    using Key = std::tuple<Kind, QtNodes::NodeId, int>;
    Key key;
    QRectF rect;
    QPointF origin;
    QString label;
    QColor color;
    double labelScale = 1;
    double opacity = 1;
    QRectF bounds;
    bool operator==(const ForegroundPart &) const = default;
  };
  QList<ForegroundPart> foregroundParts(const QRectF &area, double zoom) const;
  void paintForegroundPart(QPainter &painter, const ForegroundPart &part) const;

  // Input from the view. pointer() returns whether the scene took the event:
  // the interaction consumed it or an item grabbed it.
  bool pointer(PointerAction action, const CanvasPointerEvent &event, CanvasMouseEvent &mouse);
  void contextMenu(const CanvasPointerEvent &event) { interaction_.contextMenu(event); }
  bool keyPress(QKeyEvent &event);
  void keyRelease(QKeyEvent &event);
  void focusOut();

  // View state the host reads: the rubber band and the view's cursor.
  void setRubberBandArea(std::optional<QRectF> area) { rubberBand_ = area; }
  std::function<void(std::optional<Qt::CursorShape>)> viewCursor;
  // The tooltip QtNodes set on a card item, for the view's tooltip event.
  QString toolTip(QtNodes::NodeId id) const { return toolTips_.value(id); }

signals:
  void branchDimmingChanged();
  // The foreground changed and the view should paint it again.
  void foregroundChanged();
  void themeChanged();

private:
  QList<CanvasHit> hitsAt(QPointF scenePosition) const override;
  QList<CanvasNodeHit> nodesFrontToBack() const override;
  std::optional<CanvasNodeHit> node(QtNodes::NodeId id) override;
  std::optional<CanvasNodeHit> nodeAtPoint(QPointF scenePosition) override;
  QList<QtNodes::NodeId> selectedNodes() const override { return CanvasScene::selectedNodes(); }
  QList<QtNodes::ConnectionId> selectedWires() const override { return CanvasScene::selectedConnections(); }
  qsizetype selectionCount() const override { return CanvasScene::selectionCount(); }
  std::optional<QRectF> rubberBandArea() const override { return rubberBand_; }
  void selectNode(QtNodes::NodeId id, bool selected) override;
  QtNodes::PortIndex portAt(QtNodes::NodeId id, QtNodes::PortType side, QPointF local) override;
  QPointF portPosition(QtNodes::NodeId id, QtNodes::PortType side, QtNodes::PortIndex index) override;
  void basePointerEvent(PointerAction action, const CanvasPointerEvent &event) override;
  QtNodes::NodeId grabbedNode() const override;
  std::optional<QtNodes::ConnectionId> draftWire() const override;
  void startDraft(QtNodes::ConnectionId id, QtNodes::PortType side, QPointF scenePosition) override;
  void moveDraft(const CanvasPointerEvent &event) override;
  void finishDraft(const CanvasPointerEvent &event) override;
  void clearDraft() override { CanvasScene::resetDraftConnection(); }
  bool hasWire(QtNodes::ConnectionId id) override { return connectionItem(id) != nullptr; }
  void setWireVisible(QtNodes::ConnectionId id, bool visible) override;
  void prepareNodeGeometry(QtNodes::NodeId id) override { repaintNode(id); }
  void repaintNode(QtNodes::NodeId id) override;
  void repaintCanvas() override { emit foregroundChanged(); }
  void invalidateForeground() override { emit foregroundChanged(); }
  void draftFeedbackChanged() override;
  void restoreGroupOrder() override;
  void refreshGroupPointer() override;
  void setNodeCursor(QtNodes::NodeId id, std::optional<Qt::CursorShape> cursor) override;
  void setViewportCursor(std::optional<Qt::CursorShape> cursor, bool allViewports) override;
  void setButtonHover(QtNodes::NodeId id, bool footer, bool action, const QString &tooltip) override;

  void projectionChanged();
  // Card z from the hierarchy and the document order, and wire visibility.
  void applyStacking();
  void updateBranchDimming();
  void scheduleDimming();
  void flushDimming();
  // Repaints the parts of running cards and flowing wires that follow the
  // animation clock.
  void animate();
  CardItemState cardItem(const NodeItem &item, double zoom) const;
  void repaintCards();
  void refreshRuntime();
  void refreshRuntimeNode(QtNodes::NodeId id);
  void refreshRuntimeEdge(QtNodes::ConnectionId id);
  bool runtimeActive() const;
  void updateAnimation(bool changedItemActive);
  void paintDropHint(QPainter &painter, const QRectF &frame) const;

  WorkflowGraphModel &model_;
  CanvasTheme theme_;
  QTimer animation_;
  QElapsedTimer clock_;
  double phase_ = 0;
  bool reducedMotion_ = false;
  CanvasInteraction interaction_;
  // Borrowed only for the synchronous dispatch from pointer().
  CanvasMouseEvent *mouse_ = nullptr;
  std::optional<QRectF> rubberBand_;
  bool branchDimmingPending_ = false;
  QSet<QtNodes::NodeId> dimmedNodes_;
  QHash<QtNodes::NodeId, QString> toolTips_;
  std::unique_ptr<CanvasIconCache> iconCache_;
};

} // namespace nodetool::canvas
