#pragma once
#include <QImage>
#include <QColor>
#include <QVariantMap>
#include <QPainterPath>
#include <QString>
#include <QTimer>
#include <QElapsedTimer>
#include <QHash>
#include <QPair>
#include <QSet>
#include <QVector>
#include <QPointer>
#include <QJsonObject>
#include <QtNodes/BasicGraphicsScene>
#include "canvas/CanvasInteraction.h"
#include "canvas/EditorSceneApi.h"
#include "canvas/CanvasStyle.h"

namespace nodetool {
class WorkflowGraphModel;

// Selected nodes plus every node upstream and downstream of them, as the web's
// branchNodeIds in node/reactFlowGraphModel.ts. Each pair is source then target.
QSet<QtNodes::NodeId> branchNodeIds(const QSet<QtNodes::NodeId> &selected,
                                    const QVector<QPair<QtNodes::NodeId, QtNodes::NodeId>> &edges);
// UI thread only. Adapts QtNodes item ownership, painting and input to the canvas.
class EditorScene final : public QtNodes::BasicGraphicsScene, public EditorSceneApi, private canvas::CanvasInteractionHost {
  Q_OBJECT
public:
  EditorScene(WorkflowGraphModel &model, QObject *parent = nullptr);
  // Detaches the dimming slots. The base class clears the selection while it
  // deletes its items, after this class is gone.
  ~EditorScene() override;
  QObject &sceneObject() override { return *this; }
  canvas::CanvasInteraction &interaction() override { return interaction_; }
  const canvas::CanvasInteraction &interaction() const override { return interaction_; }
  QtNodes::AbstractGraphModel &graphModel() override { return BasicGraphicsScene::graphModel(); }
  const QtNodes::AbstractGraphModel &graphModel() const override { return BasicGraphicsScene::graphModel(); }
  QtNodes::AbstractNodeGeometry &nodeGeometry() override { return BasicGraphicsScene::nodeGeometry(); }
  const QtNodes::AbstractNodeGeometry &nodeGeometry() const override { return BasicGraphicsScene::nodeGeometry(); }
  const CanvasTheme &theme() const override { return theme_; }
  void setTheme(const CanvasTheme &theme) override;
  void setReducedMotion(bool reduced) override;
  double animationPhase() const override { return phase_; }
  double runningAngle() const override { return animation_.isActive() ? runningRingAngle(clock_.elapsed()) : 90; }
  bool animationActive() const override { return animation_.isActive(); }
  double commentContentHeight(const QString &markdown, double cardWidth) const override;
  void clearSelection() override { QGraphicsScene::clearSelection(); }
  void resetDraftConnection() override { interaction_.resetDraftConnection(); }
  bool branchDimmed(QtNodes::NodeId id) const override;
signals:
    void nodeDragChanged(bool active);
    // A double-click on a card header, which collapses the card or, for a Code
    // node, renames it (NodeHeader.tsx handleTitleDoubleClick).
    void headerDoubleClicked(QtNodes::NodeId id);
    // Emitted after the dimmed set changes, so overlays that sit above the
    // canvas, such as media widgets, can follow the card opacity.
    void branchDimmingChanged();
    void outputFormRequested(const QString &id);
    void dynamicPortFormRequested(const QString &id, bool output, const QString &name, const QRectF &sceneAnchor);
    // The card's slot type chip asks for the type menu below sceneAnchor.
    void dynamicTypeMenuRequested(const QString &id, const QString &name, const QRectF &sceneAnchor);
    void childOpenRequested(const QString &id);
    // A card's header button, such as the ComfyUI runner's workflow loader.
    void headerActionRequested(const QString &id, const QString &action);
  void canvasContextMenuRequested(const QString &nodeId, const QPoint &screenPosition);
  void paneDoubleClicked(const QPointF &scenePosition);
  void dataEdgeContextMenuRequested(const QString &edgeId, const QPointF &scenePosition, const QPoint &screenPosition);
  void reconnectRequested(const QString &id, const QJsonObject &connection);
  void reconnectDiscarded(const QString &id);
  void titleEditRequested(QtNodes::NodeId id);
  void inlineEditRequested(QtNodes::NodeId id, const QString &name);
  // A document select's open button: the document kind and the chosen id.
  void documentOpenRequested(const QString &kind, const QString &id);
  // A card's Connect provider button, naming the missing secret.
  void providerConnectRequested(const QString &secretKey);
  // Report on a failed card, naming the node's resource id.
  void errorReportRequested(const QString &nodeId);
  // A card's Run button asks to run that node alone. The node is selected first.
  void nodeRunRequested(const QString &nodeId);
  // Opens the property's inline editor expanded, as Constant String's Open editor.
  void inlineExpandRequested(QtNodes::NodeId id, const QString &name);
  // A card slider drag moved to a value it has not committed yet.
  void sliderDraftChanged(QtNodes::NodeId id, const QString &name, double value);
  void looseWireDropped(QtNodes::NodeId node, QtNodes::PortType port,
                        QtNodes::PortIndex index, const QPointF &position);
  // A right-click on a handle opens its connection menu (web NodeOutput.tsx:66-84, PropertyField.tsx:165-180).
  void handleContextMenuRequested(QtNodes::NodeId node, QtNodes::PortType port,
                                  QtNodes::PortIndex index, const QPointF &position);
  // A wire released on a handle that rejects it (web useConnectionHandlers.ts:333-352).
  void connectionRefused();
  void wireBodyDropped(QtNodes::NodeId node, QtNodes::PortType port,
                       QtNodes::PortIndex index, QtNodes::NodeId target,
                       const QPointF &position);

protected:
  void contextMenuEvent(QGraphicsSceneContextMenuEvent *event) override;
  void mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) override;
  void mousePressEvent(QGraphicsSceneMouseEvent *event) override;
  void mouseReleaseEvent(QGraphicsSceneMouseEvent *event) override;
  void keyPressEvent(QKeyEvent *event) override;
  void keyReleaseEvent(QKeyEvent *event) override;
  void focusOutEvent(QFocusEvent *event) override;
  void mouseMoveEvent(QGraphicsSceneMouseEvent *event) override;
  void drawBackground(QPainter *painter, const QRectF &rect) override;
  void drawForeground(QPainter *painter, const QRectF &rect) override;

private:
  void onNodeDeleted(QtNodes::NodeId id) override;
  void onConnectionDeleted(QtNodes::ConnectionId id) override;
  void onModelReset() override;
  void clearFocusFrom(const QGraphicsItem &item);
  WorkflowGraphModel &model_;
  CanvasTheme theme_;
  QTimer animation_;
  QElapsedTimer clock_;
  double phase_ = 0;
  bool reducedMotion_ = false;
  canvas::CanvasInteraction interaction_;
  // Borrowed only for the synchronous dispatch to QGraphicsScene.
  QGraphicsSceneMouseEvent *pointerEvent_ = nullptr;
  void dispatchPointer(canvas::PointerAction action, QGraphicsSceneMouseEvent &event);
  QGraphicsView *eventView(const QWidget *viewport) const;
  QList<canvas::CanvasHit> hitsAt(QPointF scenePosition) const override;
  QList<canvas::CanvasNodeHit> nodesFrontToBack() const override;
  std::optional<canvas::CanvasNodeHit> node(QtNodes::NodeId id) override;
  QList<QtNodes::NodeId> selectedNodes() const override;
  QList<QtNodes::ConnectionId> selectedWires() const override;
  qsizetype selectionCount() const override;
  std::optional<QRectF> rubberBandArea() const override;
  void selectNode(QtNodes::NodeId id, bool selected) override;
  QtNodes::PortIndex portAt(QtNodes::NodeId id, QtNodes::PortType side, QPointF local) override;
  QPointF portPosition(QtNodes::NodeId id, QtNodes::PortType side, QtNodes::PortIndex index) override;
  void basePointerEvent(canvas::PointerAction action, const canvas::CanvasPointerEvent &event) override;
  QtNodes::NodeId grabbedNode() const override;
  std::optional<QtNodes::ConnectionId> draftWire() const override;
  void startDraft(QtNodes::ConnectionId id, QtNodes::PortType side, QPointF scenePosition) override;
  void moveDraft(const canvas::CanvasPointerEvent &event) override;
  void finishDraft(const canvas::CanvasPointerEvent &event) override;
  void clearDraft() override { BasicGraphicsScene::resetDraftConnection(); }
  bool hasWire(QtNodes::ConnectionId id) override;
  void setWireVisible(QtNodes::ConnectionId id, bool visible) override;
  void prepareNodeGeometry(QtNodes::NodeId id) override;
  void repaintNode(QtNodes::NodeId id) override;
  void repaintCanvas() override { update(); }
  void invalidateForeground() override { invalidate(sceneRect(), ForegroundLayer); }
  void draftFeedbackChanged() override;
  void restoreGroupOrder() override;
  void refreshGroupPointer() override;
  void setNodeCursor(QtNodes::NodeId id, std::optional<Qt::CursorShape> cursor) override;
  void setViewportCursor(std::optional<Qt::CursorShape> cursor, bool allViewports) override;
  void setButtonHover(QtNodes::NodeId id, bool footer, bool action, const QString &tooltip) override;
  void updateBranchDimming();
  bool branchDimmingPending_ = false;
  QSet<QtNodes::NodeId> dimmedNodes_;
  void repaintCards();
  void refreshRuntime();
  // A single node's or wire's run message repaints only that card and its wires,
  // so the other cards keep their cached pixmaps.
  void refreshRuntimeNode(QtNodes::NodeId id);
  void refreshRuntimeEdge(QtNodes::ConnectionId id);
  bool runtimeActive() const;
  void updateAnimation(bool changedItemActive);
  void paintDropHint(QPainter *painter, const QRectF &frame) const;
};
} // namespace nodetool
