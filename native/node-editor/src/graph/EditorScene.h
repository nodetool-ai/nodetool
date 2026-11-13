#pragma once
#include <QImage>
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

// web AxisMarker.tsx: the origin lines run this many screen pixels, in
// c_editor_axis_color from paletteDark.ts or paletteLight.ts.
inline constexpr double axisMarkerLength = 80000;
inline QColor axisMarkerColor(bool dark) { return dark ? QColor("#17181B") : QColor("#E4E4E7"); }

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
  // A card inside a group: the edge, and the fill that replaces the card color.
  QColor groupHeader{"#2a2d33"};
  QColor groupFill{0x22, 0x22, 0x22, 0x8c};
  // The card title while zoomed out.
  QColor zoomedTitle{"#b4b7bd"};
  // The selected edge of a Preview and of an Output card.
  QColor previewSelected{"#d4d6db"};
  QColor outputSelected{"#4adbf1"};
  QColor selectionShadow{0, 0, 0, 77};
  // Media on cards: the web's c_scrim behind badges and asset actions with its
  // grey 100 ink, and the alpha surface behind an image.
  QColor mediaScrim{0, 0, 0, 153};
  QColor mediaScrimInk{"#d4d6db"};
  QColor alphaBase{"#1e1e1e"};
  QColor alphaChecker{"#2a2a2a"};
  QString sansFamily{"Inter"};
  QString monoFamily{"JetBrains Mono"};
};

// The curve of a wire. Painting, hit testing, and the bounds margin all use it.
double groupLabelScale(double zoom);
// nodes.states.css .bypassed: filter saturate(0.2) over the card.
inline constexpr double disabledSaturation = 0.2;
// The Disabled chip of a bypassed card header: NodeHeader.tsx's compact outlined
// MuiChip, 24 px high with 8 px of label padding and a 1 px border and a 6 px left
// margin (.bypass-badge). It sits at the right end of the header, centered on it.
inline constexpr double disabledChipHeight = 24;
inline constexpr double disabledChipPadding = 8;
inline constexpr double disabledChipMargin = 6;
QRectF disabledChipRect(const QRectF &header, double textWidth);
// The web's branch-dimmed opacity for a node or wire off the selected branch,
// styles/nodes.zoomed.css. Related items keep full opacity.
inline constexpr double branchDimmedOpacity = 0.2;
// web config/constants.ts ZOOMED_OUT: at or below this zoom the web hides handles and
// property rows, thickens wires and rings a selected card (nodes.zoomed.css).
inline constexpr double zoomedOutThreshold = 0.35;
inline constexpr double zoomedOutBodyOpacity = 0.85;
// Edge styles of handle_edge_tooltip.css and nodes.zoomed.css, in user units, not stroke widths.
// .streaming-edge is 3 wide at 0.8 opacity dashed 30 3 (8 when selected). A flowing edge is
// dashed 14 10 (4 2 under reduced motion) and scrolls 120 px a second. A bypassed edge is 5 5.
// Overview zoom draws an edge 6 wide.
inline constexpr double streamingWireOpacity = 0.8;
inline constexpr double streamingWireWidth = 3;
inline constexpr double zoomedWireWidth = 6;
inline constexpr double flowDashOn = 14;
inline constexpr double flowDashOff = 10;
inline constexpr double flowReducedDashOn = 4;
inline constexpr double flowReducedDashOff = 2;
inline constexpr double streamingDashOn = 30;
inline constexpr double streamingDashOff = 3;
inline constexpr double streamingSelectedDash = 8;
inline constexpr double bypassedDash = 5;
inline constexpr double flowSpeed = 120;
// web/src/components/node/CommentNode.tsx scale-to-fit floor for a card height.
inline constexpr int commentMinimumHeight = 40;
// The web's handle hover, styles/handle_edge_tooltip.css: scale 1.3, opacity 0.9.
inline constexpr double handleHoverScale = 1.3;
inline constexpr double handleHoverOpacity = 0.9;
// While a wire is dragged, compatible handles grow and the rest fade, shrink and
// lose their color, and settled wires dim (web styles/handle_edge_tooltip.css .is-connecting).
inline constexpr double handleConnectableScale = 1.2;
// vars.css --node-handle-core-radius and --node-handle-core-feather of a collect handle.
inline constexpr double handleCollectCore = 2;
inline constexpr double handleCollectFeather = 2.5;
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
  // The crop under a drag on a Crop card, in image pixels, painted before it is committed.
  QtNodes::NodeId cropDraftNode() const { return cropNode_; }
  QRectF cropDraft() const { return cropValue_; }
  // The stroke under a drag on a Painter card, at full alpha in canvas pixels.
  QtNodes::NodeId paintDraftNode() const { return paintNode_; }
  const QImage &paintDraft() const { return paintStroke_; }
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
    // The card's slot type chip asks for the type menu below sceneAnchor.
    void dynamicTypeMenuRequested(const QString &id, const QString &name, const QRectF &sceneAnchor);
    void childOpenRequested(const QString &id);
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
  // A drag of CropBody's rectangle or one of its handles.
  QtNodes::NodeId cropNode_ = QtNodes::InvalidNodeId;
  QString cropHandle_;
  QRectF cropStart_;
  QRectF cropValue_;
  QPointF cropPointer_;
  void moveCrop(const QPointF &scenePosition);
  void finishCrop(bool commit);
  // A brush or eraser stroke on PainterBody's canvas.
  QtNodes::NodeId paintNode_ = QtNodes::InvalidNodeId;
  QImage paintStroke_;
  QPointF paintLast_;
  void movePaint(const QPointF &scenePosition);
  void finishPaint(bool commit);
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
  void refreshHandleCursor(bool drafting);
  QtNodes::NodeId cursorNode_ = QtNodes::InvalidNodeId;
  bool blankCursor_ = false;
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
