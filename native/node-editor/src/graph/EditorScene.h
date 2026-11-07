#pragma once
#include <QColor>
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
#include "DragWiggle.h"

namespace nodetool {
class WorkflowGraphModel;

// Colors and font families the canvas receives from Qt Quick. The web's node
// background, canvas grid, and translucent controls are native-editor roles.
struct CanvasTheme {
  QColor canvas{"#08090a"};
  QColor grid{"#1f2126"};
  QColor node{"#0d0e10"};
  QColor reroutePaper{"#101113"};
  QColor rerouteBorder{"#808590"};
  QColor divider{0xff, 0xff, 0xff, 0x14};
  QColor field{0xff, 0xff, 0xff, 0x08};
  QColor textPrimary{"#f7f8f8"};
  QColor textSecondary{"#8a8f98"};
  QColor checker{0xff, 0xff, 0xff, 0x06};
    QColor subgraphAccent{"#7C3AED"};
  QColor primary{"#3d68a8"};
  // web palette secondary.main, the node progress bar.
  QColor progress{"#e879f9"};
  // web palette success.main and warning.main, the prompt variable chips.
  QColor success{"#50fa7b"};
  QColor warning{"#ffb86c"};
  // ControlEdge.tsx CONTROL_EDGE_COLOR, a fixed amber in both themes.
  QColor controlWire{"#f59e0b"};
  QColor selectionShadow{0, 0, 0, 77};
  QString sansFamily{"Inter"};
  QString monoFamily{"JetBrains Mono"};
};

// The curve of a wire. Painting, hit testing, and the bounds margin all use it.
double groupLabelScale(double zoom);
// The web's branch-dimmed opacity for a node or wire off the selected branch,
// styles/nodes.zoomed.css. Related items keep full opacity.
inline constexpr double branchDimmedOpacity = 0.2;
// web/src/components/node/CommentNode.tsx scale-to-fit floor for a card height.
inline constexpr int commentMinimumHeight = 40;
// The web's handle hover, styles/handle_edge_tooltip.css: scale 1.3, opacity 0.9.
inline constexpr double handleHoverScale = 1.3;
inline constexpr double handleHoverOpacity = 0.9;
// While a wire is dragged, compatible handles grow and the rest fade, shrink and
// lose their color, and settled wires dim (web styles/handle_edge_tooltip.css .is-connecting).
inline constexpr double handleConnectableScale = 1.2;
inline constexpr double handleBlockedOpacity = 0.15;
inline constexpr double handleBlockedScaleX = 0.4;
inline constexpr double handleBlockedScaleY = 0.6;
inline constexpr double wireConnectingOpacity = 0.15;
inline constexpr double connectingWireWidth = 2.5;
inline constexpr double connectingGlowWidth = 6;
inline constexpr double connectingGlowOpacity = 0.15;
inline constexpr double connectingDotRadius = 6;
// Selected nodes plus every node upstream and downstream of them, as the web's
// branchNodeIds in node/reactFlowGraphModel.ts. Each pair is source then target.
QSet<QtNodes::NodeId> branchNodeIds(const QSet<QtNodes::NodeId> &selected,
                                    const QVector<QPair<QtNodes::NodeId, QtNodes::NodeId>> &edges);
// The running ring's conic start angle in CSS degrees after elapsedMs: 90 to
// 450 over MOTION.pulse (2s ease-in-out), as runningGradientAnimation.
double runningRingAngle(qint64 elapsedMs);
QPainterPath wireCurve(const QPointF &out, const QPointF &in);
// React Flow's getBezierPath from the bottom of a controller to the top of the node it controls.
QPainterPath controlWireCurve(const QPointF &bottom, const QPointF &top);

// Installs the web editor's node card, typed wires, and canvas grid through the
// QtNodes geometry and painter extension points. QtNodes owns items and input.
class EditorScene final : public QtNodes::BasicGraphicsScene {
  Q_OBJECT
public:
  EditorScene(WorkflowGraphModel &model, QObject *parent = nullptr);
  // Detaches the dimming slots. The base class clears the selection while it
  // deletes its items, after this class is gone.
  ~EditorScene() override;
  const CanvasTheme &theme() const { return theme_; }
  void setTheme(const CanvasTheme &theme);
  void setReducedMotion(bool reduced);
  double animationPhase() const { return phase_; }
  // Reduced motion holds the ring at its first frame, as the web does.
  double runningAngle() const { return animation_.isActive() ? runningRingAngle(clock_.elapsed()) : 90; }
  bool animationActive() const { return animation_.isActive(); }
  QRectF groupLabelRect(QtNodes::NodeId id, double zoom);
  // The card height that fits a comment's Markdown at a card width: the text,
  // the 16 px above and below it, and 2 px of slack as CommentNode.tsx adds.
  double commentContentHeight(const QString &markdown, double cardWidth) const;
  QString reconnectingEdgeId() const { return reconnectEdge_.value("id").toString(); }
  void resetDraftConnection();
  // The slider under a drag on a card body, painted before it is committed.
  QtNodes::NodeId sliderDraftNode() const { return sliderNode_; }
  QString sliderDraftProperty() const { return sliderProperty_; }
  double sliderDraftValue() const { return sliderValue_; }
  // True while a node or wire is faded because a selection is active and the
  // item is not on the selected branch.
  bool branchDimmed(QtNodes::NodeId id) const;
  struct HandleHover {
    QtNodes::NodeId node = QtNodes::InvalidNodeId;
    QtNodes::PortType type = QtNodes::PortType::None;
    QtNodes::PortIndex index = QtNodes::InvalidPortIndex;
    bool operator==(const HandleHover &) const = default;
  };
  const HandleHover &hoveredHandle() const { return handleHover_; }
  // The fixed end of the wire being dragged, or an invalid node with no drag.
  HandleHover draftEnd() const;
  // 1 when a handle accepts the dragged wire, -1 when it does not, 0 with no drag
  // (web NodeOutput.tsx:105-122 and PropertyField.tsx:148-158 classConnectable).
  int handleConnectable(QtNodes::NodeId node, QtNodes::PortType side, QtNodes::PortIndex index) const;
  // The group the dragged card overlaps, drawn as hovered while the drag lasts.
  // Dropping the card on it moves the card into it, as useDragHandlers.ts does.
  QtNodes::NodeId dropGroup() const { return dropGroup_; }
  // True from the first movement of a card drag until the button is released.
  bool nodeDragActive() const { return dragMoved_; }
  // What the drag just released asks of the document: the group to join, and
  // whether Alt or a shake pulled the card out of its own group. Read once.
  struct DragOutcome {
    QtNodes::NodeId group = QtNodes::InvalidNodeId;
    bool detach = false;
  };
  DragOutcome takeDragOutcome();

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
    void childOpenRequested(const QString &id);
  void canvasContextMenuRequested(const QString &nodeId, const QPoint &screenPosition);
  void paneDoubleClicked(const QPointF &scenePosition);
  void dataEdgeContextMenuRequested(const QString &edgeId, const QPointF &scenePosition, const QPoint &screenPosition);
  void reconnectRequested(const QString &id, const QJsonObject &connection);
  void reconnectDiscarded(const QString &id);
  void titleEditRequested(QtNodes::NodeId id);
  void inlineEditRequested(QtNodes::NodeId id, const QString &name);
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
  void focusOutEvent(QFocusEvent *event) override;
  void mouseMoveEvent(QGraphicsSceneMouseEvent *event) override;
  void drawBackground(QPainter *painter, const QRectF &rect) override;
  void drawForeground(QPainter *painter, const QRectF &rect) override;

private:
  WorkflowGraphModel &model_;
  CanvasTheme theme_;
  QTimer animation_;
  QElapsedTimer clock_;
  double phase_ = 0;
  bool reducedMotion_ = false;
    bool outputFormPress_ = false;
    QtNodes::NodeId footerPress_ = QtNodes::InvalidNodeId;
    QtNodes::NodeId footerHover_ = QtNodes::InvalidNodeId;
  bool inlinePress_ = false;
  QtNodes::NodeId sliderNode_ = QtNodes::InvalidNodeId;
  QString sliderProperty_;
  double sliderValue_ = 0;
  double sliderOrigin_ = 0;
  // Mode switches, the dimension lock, add buttons and sliders on a card body.
  bool pressCardControl(QtNodes::NodeId id, const QPointF &local);
  void moveSlider(const QPointF &scenePosition);
  void finishSlider(bool commit);
  bool wireReconnect_ = false;
  QJsonObject reconnectEdge_;
  QtNodes::PortType reconnectSide_ = QtNodes::PortType::None;
  QPointer<QObject> reconnectWire_;
  HandleHover handleHover_;
  bool draftFeedback_ = false;
  void repaintCards();
  void updateHandleHover(const QPointF &scenePosition);
  void updateBranchDimming();
  bool branchDimmingPending_ = false;
  QSet<QtNodes::NodeId> dimmedNodes_;
  bool beginReconnect(QtNodes::ConnectionId connection, QtNodes::PortType side);
  void refreshRuntime();
  void restoreGroupOrder();
  void cancelGesture();
  enum class Gesture { None, Label, Resize };
  Gesture gesture_ = Gesture::None;
  QtNodes::NodeId gestureNode_ = QtNodes::InvalidNodeId;
  QPointF gestureOrigin_;
  QRectF gestureBounds_;
  QJsonObject gestureUi_;
  QHash<QtNodes::NodeId, QPointF> gesturePositions_;
  QVector<QtNodes::NodeId> gestureSelected_;
  Qt::Edges resizeEdges_;
  QSize minimumSize_;
  double eventZoom(const QGraphicsSceneMouseEvent *event) const;
  QtNodes::NodeId dragNode_ = QtNodes::InvalidNodeId;
  QtNodes::NodeId dropGroup_ = QtNodes::InvalidNodeId;
  QPointF dragStart_;
  bool dragMoved_ = false;
  bool dragDetach_ = false;
  DragWiggle wiggle_;
  QElapsedTimer dragClock_;
  DragOutcome outcome_;
  void beginNodeDrag(const QGraphicsSceneMouseEvent *event);
  void trackNodeDrag(const QGraphicsSceneMouseEvent *event);
  void endNodeDrag();
};
} // namespace nodetool
