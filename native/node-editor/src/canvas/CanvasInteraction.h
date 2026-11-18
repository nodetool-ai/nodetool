#pragma once

#include "graph/DragWiggle.h"
#include <QtNodes/Definitions>
#include <QElapsedTimer>
#include <QHash>
#include <QImage>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QSize>
#include <QStringList>
#include <QTimer>
#include <optional>

namespace nodetool {
class CanvasSurface;
class WorkflowGraphModel;
struct CanvasTheme;
} // namespace nodetool

namespace nodetool::canvas {

enum class PointerAction { Press, Move, Release, DoubleClick };

struct CanvasPointerEvent {
  QPointF scenePosition;
  QPoint screenPosition;
  Qt::MouseButton button = Qt::NoButton;
  Qt::MouseButtons buttons = Qt::NoButton;
  Qt::KeyboardModifiers modifiers = Qt::NoModifier;
  double zoom = 1;
};

struct CanvasNodeHit {
  QtNodes::NodeId id;
  QPointF origin;
  bool selected;
};

struct CanvasHit {
  // Direct card hits and hits on decorations are kept distinct.
  QtNodes::NodeId node = QtNodes::InvalidNodeId;
  QtNodes::NodeId decorationOwner = QtNodes::InvalidNodeId;
  std::optional<QtNodes::ConnectionId> wire;
  bool draft = false;
};

// UI thread only. The host owns items, selection, and the base canvas gestures.
// Card items are positioned by translation in scene coordinates.
class CanvasInteractionHost {
public:
  virtual ~CanvasInteractionHost() = default;
  virtual QList<CanvasHit> hitsAt(QPointF scenePosition) const = 0;
  virtual QList<CanvasNodeHit> nodesFrontToBack() const = 0;
  virtual std::optional<CanvasNodeHit> node(QtNodes::NodeId id) = 0;
  virtual QList<QtNodes::NodeId> selectedNodes() const = 0;
  virtual QList<QtNodes::ConnectionId> selectedWires() const = 0;
  virtual qsizetype selectionCount() const = 0;
  virtual std::optional<QRectF> rubberBandArea() const = 0;
  virtual void clearSelection() = 0;
  virtual void selectNode(QtNodes::NodeId id, bool selected) = 0;
  virtual QtNodes::PortIndex portAt(QtNodes::NodeId id, QtNodes::PortType side, QPointF local) = 0;
  virtual QPointF portPosition(QtNodes::NodeId id, QtNodes::PortType side, QtNodes::PortIndex index) = 0;
  // Performs the host's selection, movement and rubber band behavior.
  virtual void basePointerEvent(PointerAction action, const CanvasPointerEvent &event) = 0;
  virtual QtNodes::NodeId grabbedNode() const = 0;
  virtual std::optional<QtNodes::ConnectionId> draftWire() const = 0;
  virtual void startDraft(QtNodes::ConnectionId incomplete, QtNodes::PortType looseSide, QPointF scenePosition) = 0;
  virtual void moveDraft(const CanvasPointerEvent &event) = 0;
  virtual void finishDraft(const CanvasPointerEvent &event) = 0;
  virtual void clearDraft() = 0;
  virtual bool hasWire(QtNodes::ConnectionId id) = 0;
  virtual void setWireVisible(QtNodes::ConnectionId id, bool visible) = 0;
  virtual void prepareNodeGeometry(QtNodes::NodeId id) = 0;
  virtual void repaintNode(QtNodes::NodeId id) = 0;
  virtual void repaintCanvas() = 0;
  virtual void invalidateForeground() = 0;
  virtual void draftFeedbackChanged() = 0;
  virtual void restoreGroupOrder() = 0;
  virtual void refreshGroupPointer() = 0;
  virtual void setNodeCursor(QtNodes::NodeId id, std::optional<Qt::CursorShape> cursor) = 0;
  virtual void setViewportCursor(std::optional<Qt::CursorShape> cursor, bool allViewports) = 0;
  virtual void setButtonHover(QtNodes::NodeId id, bool footer, bool action, const QString &tooltip) = 0;
};

// UI thread only. Provides document commands and viewport navigation for a tab.
class CanvasViewportHost {
public:
  virtual ~CanvasViewportHost() = default;
  virtual CanvasSurface &viewportSurface() const = 0;
  virtual bool usesMouseNavigation() const = 0;
  virtual int dragDistance() const = 0;
  virtual bool readOnly() const = 0;
  virtual void cancelCatalogPlacement() = 0;
  virtual void armCatalogPlacement(const QPointF &position) = 0;
  virtual void clearLineageSelection() = 0;
  virtual void disableFit() = 0;
  virtual void cancelViewAnimation() = 0;
  virtual void zoomUnderCursor(double factor) = 0;
  virtual void panBy(QPoint delta) = 0;
  virtual bool knownNodeType(const QString &type) const = 0;
  virtual bool addNodeAt(const QString &type, const QPointF &position, bool clearOverlap = false) = 0;
  virtual bool pasteExample(const QString &key, const QPointF &position) = 0;
  virtual bool apply(const QJsonObject &command) = 0;
  virtual void refresh() = 0;
  virtual void previewCardEdit(const QJsonArray &commands) = 0;
  virtual QStringList selectedIds() const = 0;
  virtual bool canvasKeysBlocked() const = 0;
  virtual bool runActive() const = 0;
  virtual void openFocusedHandlePicker() = 0;
  virtual QString shortcutCommand(int key, Qt::KeyboardModifiers modifiers) const = 0;
  virtual void action(const QString &name) = 0;
  virtual QJsonArray dragGroupCommands(const QJsonObject &positions, QtNodes::NodeId group, bool detach) = 0;
  virtual void scheduleViewportRelease(quint64 epoch) = 0;
  virtual void clearBaseUndo() = 0;
};

enum class CanvasDropKind { NodeType, Example };

// UI thread only. The model, host and theme outlive this interaction.
class CanvasInteraction final : public QObject {
  Q_OBJECT
public:
  CanvasInteraction(WorkflowGraphModel &model, CanvasInteractionHost &host, const CanvasTheme &theme);

  // True means the interaction consumed the event. Otherwise the original
  // event's acceptance is whatever the host's base handler left it at.
  bool pointerEvent(PointerAction action, const CanvasPointerEvent &event);
  bool viewportPointerEvent(PointerAction action, const CanvasPointerEvent &event, QPoint viewportPosition,
                            CanvasViewportHost &host, bool onViewport = true);
  bool viewportKeyPress(int key, Qt::KeyboardModifiers modifiers, std::optional<QPointF> pointer,
                        CanvasViewportHost &host);
  void viewportWheel(QPoint pixels, QPoint angle, Qt::ScrollPhase phase, Qt::KeyboardModifiers modifiers,
                     CanvasViewportHost &host);
  bool viewportDrop(CanvasDropKind kind, const QByteArray &bytes, Qt::DropActions actions, bool drop,
                    QPointF scenePosition, CanvasViewportHost &host);
  void finishViewportRelease(quint64 epoch, CanvasViewportHost &host);
  void invalidateViewportGesture();
  bool bufferViewportCommand(const QJsonObject &command);

  void contextMenu(const CanvasPointerEvent &event);
  bool keyPress(int key);
  void keyRelease(int key);
  void focusOut();
  void projectionChanged();
  void selectionChanged();
  bool draftFeedback() const { return draftFeedback_; }
  QRectF groupLabelRect(QtNodes::NodeId id, double zoom) const;
  QString reconnectingEdgeId() const { return reconnectEdge_.value("id").toString(); }
  void resetDraftConnection();
  // The slider under a drag on a card body, painted before it is committed.
  QtNodes::NodeId sliderDraftNode() const { return sliderNode_; }
  QString sliderDraftProperty() const { return sliderProperty_; }
  double sliderDraftValue() const { return sliderValue_; }
  // The crop under a drag on a Crop card, in image pixels, painted before it is committed.
  QtNodes::NodeId cropDraftNode() const { return cropNode_; }
  // The Painter card under the pointer and the card-local brush cursor center.
  QtNodes::NodeId brushCursorNode() const { return brushNode_; }
  QPointF brushCursor() const { return brushPoint_; }
  QRectF cropDraft() const { return cropValue_; }
  // The stroke under a drag on a Painter card, at full alpha in canvas pixels.
  QtNodes::NodeId paintDraftNode() const { return paintNode_; }
  const QImage &paintDraft() const { return paintStroke_; }
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
  // GroupNode.tsx: a group's body lets the pointer through to the canvas and
  // the cards inside, so a press there starts a box selection. Only the label,
  // the resize edges and the corner handle take it. While Alt is held, a group
  // that holds a selected card takes the pointer on its body too.
  bool groupTakesPointer(QtNodes::NodeId id) const;
  // The opacity GroupNode.tsx gives the whole group, label included: 0.5 while
  // it takes the pointer, 0.8 while a dragged card is over it, otherwise 1.
  double groupOpacity(QtNodes::NodeId id) const;
  // useSelectionEvents.ts selectGroupsWithinSelection: a box selects a group
  // only when it encloses the group's frame, while it selects cards it touches.
  void keepEnclosedGroups(const QRectF &sceneArea);
  // The "Remove nodes from group" hint GroupNode.tsx shows above the group a
  // dragged card is over, once the card has stayed there for a second.
  bool dropHintVisible() const;
  static constexpr int dropHintDelayMs = 1000;
  void setAltHeld(bool held);

signals:
  void nodeSelected(QtNodes::NodeId id);
  void nodeDragChanged(bool active);
  // A double-click on a card header, which collapses the card or, for a Code
  // node, renames it (NodeHeader.tsx handleTitleDoubleClick).
  void headerDoubleClicked(QtNodes::NodeId id);
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
  void looseWireDropped(QtNodes::NodeId node, QtNodes::PortType port, QtNodes::PortIndex index,
                        const QPointF &position);
  // A right-click on a handle opens its connection menu (web NodeOutput.tsx:66-84, PropertyField.tsx:165-180).
  void handleContextMenuRequested(QtNodes::NodeId node, QtNodes::PortType port, QtNodes::PortIndex index,
                                  const QPointF &position);
  // A wire released on a handle that rejects it (web useConnectionHandlers.ts:333-352).
  void connectionRefused();
  void wireBodyDropped(QtNodes::NodeId node, QtNodes::PortType port, QtNodes::PortIndex index, QtNodes::NodeId target,
                       const QPointF &position);

private:
  quint64 viewportEpoch_ = 0;
  bool viewportGesture_ = false;
  QHash<QString, QPointF> viewportPositions_;
  QJsonArray viewportCommands_;
  bool panning_ = false;
  QPoint panPosition_;
  QString middleEdge_;
  QPoint middlePress_;
  bool press(const CanvasPointerEvent &event);
  bool move(const CanvasPointerEvent &event);
  bool release(const CanvasPointerEvent &event);
  bool doubleClick(const CanvasPointerEvent &event);
  void repaintGroups();
  WorkflowGraphModel &model_;
  CanvasInteractionHost &host_;
  const CanvasTheme &theme_;
  bool outputFormPress_ = false;
  bool headerActionPress_ = false;
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
  // A drag of ImageComparer's divider. The position is view state, so no undo step.
  QtNodes::NodeId compareNode_ = QtNodes::InvalidNodeId;
  void moveCompare(const QPointF &scenePosition);
  // PainterBody's .brush-cursor: shown while the pointer is over a paint canvas.
  QtNodes::NodeId brushNode_ = QtNodes::InvalidNodeId;
  QPointF brushPoint_;
  void updateBrushCursor(const QPointF &scenePosition);
  void finishPaint(bool commit);
  // A synth knob drag: vertical, from the press's card-local y, a tenth as fast with Shift.
  bool knobDrag_ = false;
  double knobStartY_ = 0;
  bool knobFine_ = false;
  // Mode switches, the dimension lock, add buttons and sliders on a card body.
  bool pressCardControl(QtNodes::NodeId id, const QPointF &local);
  void moveSlider(const QPointF &scenePosition);
  // Resets the synth knob under a double-click. Returns false when there is none.
  bool resetKnob(const QPointF &scenePosition);
  void finishSlider(bool commit);
  QJsonObject reconnectEdge_;
  QtNodes::PortType reconnectSide_ = QtNodes::PortType::None;
  std::optional<QtNodes::ConnectionId> reconnectWire_;
  HandleHover handleHover_;
  bool draftFeedback_ = false;
  void updateHandleHover(const QPointF &scenePosition);
  void refreshHandleCursor(bool drafting);
  QtNodes::NodeId cursorNode_ = QtNodes::InvalidNodeId;
  bool blankCursor_ = false;
  bool beginReconnect(QtNodes::ConnectionId connection, QtNodes::PortType side);
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
  // True when scenePosition is on the body of a group that lets the pointer through.
  bool passesThroughGroup(QtNodes::NodeId id, const QPointF &scenePosition);
  // Groups that let the pointer through accept no mouse button, so the scene
  // leaves a press on their body unaccepted and the view starts a box selection.
  bool altHeld_ = false;
  bool labelAdditive_ = false;
  QElapsedTimer dropClock_;
  QTimer dropHintTimer_;
  QtNodes::NodeId dragNode_ = QtNodes::InvalidNodeId;
  QtNodes::NodeId dropGroup_ = QtNodes::InvalidNodeId;
  QPointF dragStart_;
  bool dragMoved_ = false;
  bool dragDetach_ = false;
  DragWiggle wiggle_;
  QElapsedTimer dragClock_;
  DragOutcome outcome_;
  void beginNodeDrag(const CanvasPointerEvent &event);
  void trackNodeDrag(const CanvasPointerEvent &event);
  void endNodeDrag();
};

} // namespace nodetool::canvas
