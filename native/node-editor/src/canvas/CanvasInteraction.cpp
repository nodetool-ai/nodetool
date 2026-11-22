#include "CanvasInteraction.h"
#include "CanvasStyle.h"
#include "document/ConnectionTypes.h"
#include "graph/SynthModules.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/CanvasSurface.h"
#include <utility>
#include <qtnodes/ConnectionIdUtils.hpp>
#include <QClipboard>
#include <QFontMetricsF>
#include <QGuiApplication>
#include <QPainter>
#include <QScopeGuard>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
using namespace QtNodes;
namespace nm = node_metrics;

CanvasInteraction::CanvasInteraction(WorkflowGraphModel &model, CanvasInteractionHost &host, const CanvasTheme &theme)
    : model_(model), host_(host), theme_(theme) {
  dropHintTimer_.setSingleShot(true);
  dropHintTimer_.setInterval(dropHintDelayMs);
  // A coarse timer can fire before dropHintVisible() holds, and the Quick
  // canvas paints its foreground only when asked.
  dropHintTimer_.setTimerType(Qt::PreciseTimer);
  connect(&dropHintTimer_, &QTimer::timeout, this, [this] { host_.repaintCanvas(); });
}

bool CanvasInteraction::pointerEvent(PointerAction action, const CanvasPointerEvent &event) {
  switch (action) {
  case PointerAction::Press:
    return press(event);
  case PointerAction::Move:
    return move(event);
  case PointerAction::Release: {
    const bool accepted = release(event);
    if (!event.buttons) {
      updatePointerHover(event.scenePosition);
      refreshHandleCursor(draftEnd().node != InvalidNodeId);
    }
    return accepted;
  }
  case PointerAction::DoubleClick:
    return doubleClick(event);
  }
  return false;
}

bool CanvasInteraction::viewportPointerEvent(PointerAction action, const CanvasPointerEvent &event,
                                             QPoint viewportPosition, CanvasViewportHost &host, bool onViewport) {
  auto &surface = host.viewportSurface();
  if (action == PointerAction::Press && onViewport) {
    host.cancelCatalogPlacement();
    if (event.button == Qt::LeftButton &&
        !(event.modifiers & (Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier))) {
      host.clearLineageSelection();
    }
    const auto mouseNavigation = host.usesMouseNavigation();
    surface.setHandDrag(mouseNavigation);
    if (mouseNavigation && event.button == Qt::LeftButton && !surface.hasItemAt(viewportPosition)) {
      host.disableFit();
      host.cancelViewAnimation();
    }
    if (event.button == Qt::MiddleButton) {
      if (surface.lineageAt(viewportPosition)) { return false; }
      middleEdge_.clear();
      if (const auto edge = surface.edgeAt(viewportPosition); edge && !host.readOnly()) {
        middleEdge_ = model_.edge(*edge)["id"].toString();
        middlePress_ = viewportPosition;
      }
      panning_ = true;
      host.disableFit();
      host.cancelViewAnimation();
      panPosition_ = viewportPosition;
      return true;
    }
    ++viewportEpoch_;
    viewportGesture_ = true;
    viewportCommands_ = {};
    viewportPositions_.clear();
    for (const auto id : model_.allNodeIds()) {
      viewportPositions_.insert(model_.resourceId(id), model_.nodeData(id, NodeRole::Position).toPointF());
    }
  }
  if (action == PointerAction::Move && panning_) {
    const auto delta = viewportPosition - panPosition_;
    panPosition_ = viewportPosition;
    surface.panBy(delta);
    return true;
  }
  if (action == PointerAction::Release) {
    if (panning_) {
      panning_ = false;
      const auto edge = std::exchange(middleEdge_, {});
      if (!edge.isEmpty() && event.button == Qt::MiddleButton &&
          (viewportPosition - middlePress_).manhattanLength() < host.dragDistance()) {
        host.apply({{"op", "removeEdge"}, {"id", edge}});
      }
      return true;
    }
    if (onViewport) { host.scheduleViewportRelease(viewportEpoch_); }
  }
  return false;
}

void CanvasInteraction::finishViewportRelease(quint64 epoch, CanvasViewportHost &host) {
  if (!viewportGesture_ || epoch != viewportEpoch_) { return; }
  QJsonObject positions;
  for (auto id : model_.allNodeIds()) {
    auto p = model_.nodeData(id, QtNodes::NodeRole::Position).toPointF();
    const auto resource = model_.resourceId(id);
    if (viewportPositions_.contains(resource) && p != viewportPositions_.value(resource)) {
      positions[model_.resourceId(id)] = QJsonObject{{"x", p.x()}, {"y", p.y()}};
    }
  }
  const auto outcome = takeDragOutcome();
  if (!positions.isEmpty()) {
    host.disableFit();
    // The drag's group changes and its new positions are one undo step.
    for (const auto &command : host.dragGroupCommands(positions, outcome.group, outcome.detach)) {
      viewportCommands_.append(command);
    }
    viewportCommands_.append(QJsonObject{{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}});
  }
  viewportGesture_ = false;
  viewportPositions_.clear();
  bool detachOnly = !viewportCommands_.isEmpty();
  for (auto v : viewportCommands_) {
    if (v.toObject()["op"] != "removeEdge") { detachOnly = false; }
  }
  if (detachOnly) {
    viewportCommands_ = {};
    host.refresh();
  }
  if (!viewportCommands_.isEmpty()) {
    // host.apply() resets the gesture state, so the commands are taken first.
    const auto commands = std::exchange(viewportCommands_, {});
    if (host.apply({{"op", "batch"}, {"commands", commands}})) { host.previewCardEdit(commands); }
  }
}

void CanvasInteraction::invalidateViewportGesture() {
  ++viewportEpoch_;
  viewportGesture_ = false;
  viewportCommands_ = {};
  viewportPositions_.clear();
}

bool CanvasInteraction::bufferViewportCommand(const QJsonObject &command) {
  if (!viewportGesture_) { return false; }
  viewportCommands_.append(command);
  return true;
}

bool CanvasInteraction::viewportKeyPress(int key, Qt::KeyboardModifiers keyModifiers, std::optional<QPointF> pointer,
                                         CanvasViewportHost &host) {
  if (host.canvasKeysBlocked()) { return false; }
  if (keyModifiers == Qt::NoModifier &&
      (key == Qt::Key_Left || key == Qt::Key_Right || key == Qt::Key_Up || key == Qt::Key_Down)) {
    const auto selected = host.selectedIds();
    if (!selected.isEmpty()) {
      const QSet<QString> ids(selected.cbegin(), selected.cend());
      const QPointF delta(key == Qt::Key_Left    ? -10
                          : key == Qt::Key_Right ? 10
                                                 : 0,
                          key == Qt::Key_Up     ? -10
                          : key == Qt::Key_Down ? 10
                                                : 0);
      QJsonObject positions;
      for (const auto id : model_.allNodeIds()) {
        const auto resource = model_.resourceId(id);
        if (!ids.contains(resource)) { continue; }
        const auto position = model_.nodeData(id, QtNodes::NodeRole::Position).toPointF() + delta;
        positions.insert(resource, QJsonObject{{"x", position.x()}, {"y", position.y()}});
      }
      if (host.apply({{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}})) { host.disableFit(); }
      return true;
    }
  }
  // HandleTooltip.tsx: with a node focused, Tab and Shift+Tab walk its handles,
  // and Enter or Space on a handle opens the keyboard connection picker.
  const auto modifiers = keyModifiers & ~Qt::KeypadModifier;
  if (!model_.focusedNode().isEmpty() && (key == Qt::Key_Tab || key == Qt::Key_Backtab) &&
      !(modifiers & (Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier))) {
    model_.focusNextHandle(key == Qt::Key_Backtab || (modifiers & Qt::ShiftModifier));
    return true;
  }
  if (model_.focusedHandle().side != QtNodes::PortType::None && modifiers == Qt::NoModifier) {
    if (key == Qt::Key_Return || key == Qt::Key_Enter || key == Qt::Key_Space) {
      host.openFocusedHandlePicker();
      return true;
    }
    if (key == Qt::Key_Escape) {
      model_.setFocusedHandle(QtNodes::PortType::None, {});
      return true;
    }
  }
  if (key == Qt::Key_Escape) {
    if (host.runActive()) { host.action("Stop"); }
    invalidateViewportGesture();
    resetDraftConnection();
    host.refresh();
    return true;
  }
  auto command = host.shortcutCommand(key, keyModifiers);
  // Enter is free for the canvas until navigation has focused a node.
  if (command == "Select focused node" && model_.focusedNode().isEmpty()) { command.clear(); }
  if (command == "Add node" && !host.readOnly()) {
    // Space opens the node menu where the pointer is (web useNodeEditorShortcuts.ts).
    if (pointer) { host.armCatalogPlacement(*pointer); }
  }
  if (!command.isEmpty()) {
    host.action(command);
    return true;
  }
  return false;
}

void CanvasInteraction::viewportWheel(QPoint pixels, QPoint angle, Qt::ScrollPhase phase,
                                      Qt::KeyboardModifiers modifiers, CanvasViewportHost &host) {
  // A physical wheel reports no scroll phase and no pixel delta.
  const bool physicalWheel = phase == Qt::NoScrollPhase && pixels.isNull();
  if (host.usesMouseNavigation() || physicalWheel || modifiers.testAnyFlags(Qt::ControlModifier | Qt::MetaModifier)) {
    // Ignore macOS momentum coasting on zoom gestures so zoom stops when fingers
    // lift instead of overshooting and delaying sharp font rasterization.
    if (phase == Qt::ScrollMomentum) { return; }
    if (angle.y() != 0) { host.zoomUnderCursor(angle.y() > 0 ? 1.15 : 1.0 / 1.15); }
  } else {
    host.panBy(pixels.isNull() ? angle / 2 : pixels);
  }
}

bool CanvasInteraction::viewportDrop(CanvasDropKind kind, const QByteArray &bytes, Qt::DropActions actions, bool drop,
                                     QPointF scenePosition, CanvasViewportHost &host) {
  if (host.readOnly() || !(actions & Qt::CopyAction)) { return false; }
  const auto text = QString::fromUtf8(bytes);
  if (kind == CanvasDropKind::NodeType) {
    if (bytes.isEmpty() || bytes.size() > 4096 || text.toUtf8() != bytes || !host.knownNodeType(text)) { return false; }
    return !drop || host.addNodeAt(text, scenePosition);
  }
  // ExamplesPanel.tsx pastes a copy of the graph with its first node at the drop point.
  if (text.isEmpty() || text.size() > 4096) { return false; }
  return !drop || host.pasteExample(text, scenePosition);
}

void CanvasInteraction::projectionChanged() {
  gesture_ = Gesture::None;
  gesturePositions_.clear();
  host_.setViewportCursor(std::nullopt, true);
}

CanvasInteraction::HandleHover CanvasInteraction::draftEnd() const {
  const auto draft = host_.draftWire();
  if (!draft) { return {}; }
  const auto id = *draft;
  if (id.outNodeId != InvalidNodeId) { return {id.outNodeId, PortType::Out, id.outPortIndex}; }
  return {id.inNodeId, PortType::In, id.inPortIndex};
}

int CanvasInteraction::handleConnectable(NodeId node, PortType side, PortIndex index) const {
  const auto end = draftEnd();
  if (end.node == InvalidNodeId) { return 0; }
  const auto typeOf = [](const QJsonValue &port) {
    const QJsonValue value = port.toObject()["type"];
    return value.isObject() ? value.toObject() : QJsonObject{{"type", value.toString()}};
  };
  const auto fixedPorts = model_.ports(end.node, end.type);
  const auto fixed = end.index < PortIndex(fixedPorts.size()) ? typeOf(fixedPorts[int(end.index)]) : QJsonObject{};
  // Control wires reach every control handle.
  if (fixed["type"] == "control") { return 1; }
  if (side == end.type) {
    // A drag from an output keeps its own handle lit. Every other handle on the
    // dragged side, and every input during a drag from an input, fades.
    return side == PortType::Out && node == end.node && index == end.index ? 1 : -1;
  }
  if (node == end.node) { return -1; }
  const auto ports = model_.ports(node, side);
  if (index >= PortIndex(ports.size())) { return -1; }
  const auto other = typeOf(ports[int(index)]);
  const bool compatible = end.type == PortType::Out ? node_editor::connectionTypesCompatible(fixed, other)
                                                    : node_editor::connectionTypesCompatible(other, fixed);
  return compatible ? 1 : -1;
}

void CanvasInteraction::updateHandleHover(const QPointF &scenePosition, const std::optional<CanvasNodeHit> &node) {
  HandleHover next;
  if (node) {
    const auto local = (scenePosition - node->origin);
    for (const auto side : {PortType::In, PortType::Out}) {
      const auto index = host_.portAt(node->id, side, local);
      if (index == InvalidPortIndex) { continue; }
      if (QLineF(host_.portPosition(node->id, side, index), local).length() >
          nm::handleDiameter / 2 + nm::handleRing / 2) {
        continue;
      }
      next = {node->id, side, index};
    }
  }
  if (next == handleHover_) { return; }
  const auto previous = handleHover_;
  handleHover_ = next;
  // The port names of the hovered node are drawn in the foreground.
  if (previous.node != next.node) { host_.invalidateForeground(); }
  for (const auto id : {previous.node, next.node}) { host_.repaintNode(id); }
}

// handle_edge_tooltip.css: a handle shows the cell cursor (a plus sign, Qt's cross), and
// the cursor is hidden over a handle while a wire is connecting. A Graphics View resets
// its viewport cursor from the item under the pointer, so the cursor is set on the card
// item that owns the hovered handle.
void CanvasInteraction::refreshHandleCursor(bool drafting) {
  if (gesture_ != Gesture::None) { return; }
  const auto owner = handleHover_.node;
  const bool blank = drafting && owner != InvalidNodeId;
  if (blank) {
    host_.setViewportCursor(Qt::BlankCursor, true);
  } else if (blankCursor_) {
    host_.setViewportCursor(std::nullopt, true);
  }
  blankCursor_ = blank;
  if (cursorNode_ != InvalidNodeId && cursorNode_ != owner) {
    host_.setNodeCursor(cursorNode_, std::nullopt);
    cursorNode_ = InvalidNodeId;
  }
  if (owner == InvalidNodeId) { return; }
  host_.setNodeCursor(owner, Qt::CrossCursor);
  cursorNode_ = owner;
}

QRectF CanvasInteraction::groupLabelRect(NodeId id, double zoom) const {
  const auto item = host_.node(id);
  if (!item || !model_.isGroup(id)) { return {}; }
  const auto scale = groupLabelScale(zoom);
  const auto &layout = model_.layout(id);
  // GroupNode.tsx sizes the label to its text, bounded by the group width, and
  // the rest of the header strip neither selects nor drags the group.
  const auto text = QFontMetricsF(canvasFont(theme_, 15, QFont::Medium)).horizontalAdvance(layout.title) * scale;
  const auto width = std::min(text, double(layout.size.width()));
  return QRectF(item->origin + QPointF(0, -5 / zoom - 32 * scale), QSizeF(std::max(24.0 * scale, width), 32 * scale));
}

bool CanvasInteraction::groupTakesPointer(NodeId id) const {
  if (!altHeld_ || !model_.isGroup(id)) { return false; }
  // Only a direct child counts, as GroupNode.tsx hasSelectedChild reads parentId.
  const auto resource = model_.resourceId(id);
  for (const auto node : host_.selectedNodes()) {
    if (model_.nodeSnapshot(node)["parent_id"].toString() == resource) { return true; }
  }
  return false;
}

double CanvasInteraction::groupOpacity(NodeId id) const {
  if (!model_.isGroup(id)) { return 1; }
  return groupTakesPointer(id) ? 0.5 : dropGroup_ == id ? 0.8 : 1;
}

bool CanvasInteraction::passesThroughGroup(NodeId id, const QPointF &scenePosition) {
  if (!model_.isGroup(id) || groupTakesPointer(id)) { return false; }
  const auto item = host_.node(id);
  return item && QRectF(item->origin, model_.layout(id).size).contains(scenePosition);
}

void CanvasInteraction::repaintGroups() {
  host_.refreshGroupPointer();
  for (const auto id : model_.allNodeIds()) {
    if (model_.isGroup(id)) { host_.repaintNode(id); }
  }
  host_.repaintCanvas();
}

void CanvasInteraction::setAltHeld(bool held) {
  if (altHeld_ == held) { return; }
  altHeld_ = held;
  repaintGroups();
}

void CanvasInteraction::selectionChanged() {
  if (altHeld_) { repaintGroups(); }
  if (const auto area = host_.rubberBandArea()) { keepEnclosedGroups(*area); }
}

void CanvasInteraction::keepEnclosedGroups(const QRectF &sceneArea) {
  for (const auto id : host_.selectedNodes()) {
    if (!model_.isGroup(id)) { continue; }
    const auto node = host_.node(id);
    if (node && !sceneArea.contains(QRectF(node->origin, model_.layout(id).size))) { host_.selectNode(id, false); }
  }
}

bool CanvasInteraction::dropHintVisible() const {
  return dropGroup_ != InvalidNodeId && dropClock_.isValid() && dropClock_.elapsed() >= dropHintDelayMs;
}

void CanvasInteraction::contextMenu(const CanvasPointerEvent &event) {
  if (!model_.readOnly()) {
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto node = host_.node(hit.node);
      if (!node) { continue; }
      const auto local = (event.scenePosition - node->origin);
      for (const auto side : {PortType::In, PortType::Out}) {
        const auto hit = host_.portAt(node->id, side, local);
        if (hit == InvalidPortIndex || QLineF(host_.portPosition(node->id, side, hit), local).length() >
                                           nm::handleDiameter / 2 + nm::handleRing / 2) {
          continue;
        }
        emit handleContextMenuRequested(node->id, side, hit, event.scenePosition);
        return;
      }
      break;
    }
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      // A card covering a wire owns the pointer.
      if (hit.node != InvalidNodeId) { break; }
      if (!hit.wire || hit.draft) { continue; }
      const auto edge = model_.edge(*hit.wire);
      const auto data = edge["data"].toObject();
      if (edge["type"] == "lineage" || edge["edge_type"] == "lineage" || data["edge_type"] == "lineage" ||
          edge["id"].toString().isEmpty()) {
        break;
      }
      emit dataEdgeContextMenuRequested(edge["id"].toString(), event.scenePosition, event.screenPosition);
      return;
    }
  }
  for (const auto &hit : host_.hitsAt(event.scenePosition)) {
    const auto id = hit.node != InvalidNodeId ? hit.node : hit.decorationOwner;
    if (id == InvalidNodeId || passesThroughGroup(id, event.scenePosition)) { continue; }
    emit canvasContextMenuRequested(model_.resourceId(id), event.screenPosition);
    return;
  }
  emit canvasContextMenuRequested({}, event.screenPosition);
}
bool CanvasInteraction::doubleClick(const CanvasPointerEvent &event) {
  setAltHeld(event.modifiers.testFlag(Qt::AltModifier));
  host_.refreshGroupPointer();
  if (!model_.readOnly() && event.button == Qt::LeftButton && resetKnob(event.scenePosition)) { return true; }
  if (!model_.readOnly() && event.button == Qt::LeftButton) {
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto node = host_.node(hit.node);
      if (!node) { continue; }
      if (!model_.isReroute(node->id)) { break; }
      if (!QRectF(node->origin, model_.layout(node->id).size).contains(event.scenePosition)) { break; }
      cancelGesture();
      host_.clearSelection();
      host_.selectNode(node->id, true);
      emit nodeSelected(node->id);
      emit titleEditRequested(node->id);
      return true;
    }

    NodeId target = InvalidNodeId;
    for (const auto id : model_.allNodeIds()) {
      if (model_.isGroup(id) && groupLabelRect(id, event.zoom).contains(event.scenePosition) &&
          (target == InvalidNodeId || model_.depth(id) > model_.depth(target)))
        target = id;
    }
    if (target != InvalidNodeId) {
      cancelGesture();
      host_.clearSelection();
      host_.selectNode(target, true);
      emit nodeSelected(target);
      emit titleEditRequested(target);
      return true;
    }
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto node = host_.node(hit.node);
      if (!node || model_.isGroup(node->id)) { continue; }
      const auto id = node->id;
      for (const auto &row : model_.layout(id).rows) {
        if (!row.renameLabelRect.isEmpty() && row.renameLabelRect.contains((event.scenePosition - node->origin))) {
          cancelGesture();
          emit dynamicPortFormRequested(model_.resourceId(id), false, row.propertyName,
                                        row.renameLabelRect.translated(node->origin));
          return true;
        }
      }
      // A double-click on a comment edits its text in place.
      if (model_.isComment(id) && QRectF(node->origin, model_.layout(id).size).contains(event.scenePosition)) {
        cancelGesture();
        host_.clearSelection();
        host_.selectNode(node->id, true);
        emit nodeSelected(id);
        emit titleEditRequested(id);
        return true;
      }
      if (!model_.isComment(id) && !model_.isReroute(id) && (event.scenePosition - node->origin).y() < nm::contentTop) {
        cancelGesture();
        if (!node->selected || host_.selectionCount() != 1) {
          host_.clearSelection();
          host_.selectNode(node->id, true);
        }
        emit nodeSelected(id);
        emit headerDoubleClicked(id);
        return true;
      }
      break;
    }
    // A double-click on the empty pane opens the node menu at the pointer
    // (web hooks/handlers/usePaneEvents.ts handleDoubleClick).
    bool pane = true;
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto id = hit.node != InvalidNodeId ? hit.node : hit.decorationOwner;
      if (hit.wire || (id != InvalidNodeId && !passesThroughGroup(id, event.scenePosition))) {
        pane = false;
        break;
      }
    }
    if (pane) {
      cancelGesture();
      emit paneDoubleClicked(event.scenePosition);
      return true;
    }
  }
  host_.basePointerEvent(PointerAction::DoubleClick, event);
  return false;
}

void CanvasInteraction::resetDraftConnection() {
  host_.clearDraft();
  if (reconnectWire_) { host_.setWireVisible(*reconnectWire_, true); }
  reconnectWire_.reset();
  reconnectEdge_ = {};
  reconnectSide_ = PortType::None;
  if (draftFeedback_) {
    draftFeedback_ = false;
    host_.draftFeedbackChanged();
  }
}
bool CanvasInteraction::beginReconnect(ConnectionId connection, PortType side) {
  if (!model_.wireVisible(connection)) { return false; }
  const auto endpoints = model_.edge(connection);
  QJsonObject original;
  for (const auto &value : model_.edgeSnapshot()) {
    const auto edge = value.toObject();
    if (edge["source"] == endpoints["source"] && edge["target"] == endpoints["target"] &&
        edge["sourceHandle"] == endpoints["sourceHandle"] && edge["targetHandle"] == endpoints["targetHandle"]) {
      original = edge;
      break;
    }
  }
  const auto node = getNodeId(side, connection);
  const auto item = host_.node(node);
  if (original.isEmpty() || !item || !host_.hasWire(connection)) { return false; }
  resetDraftConnection();
  reconnectEdge_ = original;
  reconnectSide_ = side;
  reconnectWire_ = connection;
  host_.setWireVisible(connection, false);
  const auto port = getPortIndex(side, connection);
  const auto point = item->origin + host_.portPosition(node, side, port);
  host_.startDraft(makeIncompleteConnectionId(connection, side), side, point);
  return true;
}

bool CanvasInteraction::press(const CanvasPointerEvent &event) {
  setAltHeld(event.modifiers.testFlag(Qt::AltModifier));
  host_.refreshGroupPointer();
  footerPress_ = InvalidNodeId;
  outputFormPress_ = false;
  headerActionPress_ = false;
  if (event.button == Qt::LeftButton) {
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto node = host_.node(hit.node);
      if (!node) { continue; }
      const auto &layout = model_.layout(node->id);
      if (layout.addOutput && !model_.readOnly() &&
          layout.outputFormRect().contains((event.scenePosition - node->origin))) {
        footerPress_ = node->id;
        outputFormPress_ = true;
        return true;
      }
      if (layout.subgraph &&
          layout.footerRect().adjusted(0, 0, -16, 0).contains((event.scenePosition - node->origin))) {
        footerPress_ = node->id;
        return true;
      }
      if (!layout.headerAction.isEmpty() && !layout.collapsed && !model_.readOnly() &&
          layout.headerActionRect().contains((event.scenePosition - node->origin))) {
        footerPress_ = node->id;
        headerActionPress_ = true;
        return true;
      }
      break;
    }
  }
  inlinePress_ = false;
  resetDraftConnection();
  host_.restoreGroupOrder();
  if (model_.readOnly() || event.button != Qt::LeftButton) {
    host_.basePointerEvent(PointerAction::Press, event);
    host_.restoreGroupOrder();
    return false;
  }
  const auto zoom = event.zoom;
  const auto point = event.scenePosition;
  // A selected wire exposes both endpoints, including an output shared by many wires.
  for (const auto &connection : host_.selectedWires()) {
    for (const auto side : {PortType::In, PortType::Out}) {
      const auto id = side == PortType::In ? connection.inNodeId : connection.outNodeId;
      const auto port = side == PortType::In ? connection.inPortIndex : connection.outPortIndex;
      auto node = host_.node(id);
      if (node &&
          QLineF(point, (node->origin + host_.portPosition(id, side, port))).length() <=
              nm::handleDiameter / 2 + nm::handleRing / 2 &&
          beginReconnect(connection, side)) {
        return true;
      }
    }
  }
  NodeId target = InvalidNodeId;
  Qt::Edges edges;
  bool label = false;
  // QtNodes temporarily raises hovered groups. Hit order follows hierarchy,
  // including when hover events arrive between restoring z and a mouse press.
  auto candidates = host_.nodesFrontToBack();
  std::stable_sort(candidates.begin(), candidates.end(), [this](const auto &a, const auto &b) {
    const auto ag = model_.isGroup(a.id), bg = model_.isGroup(b.id);
    if (ag != bg) { return !ag; }
    return ag && model_.depth(a.id) > model_.depth(b.id);
  });
  for (const auto &node : candidates) {
    const auto id = node.id;
    const auto &layout = model_.layout(id);
    const QRectF bounds(node.origin, layout.size);
    // A selected card's port sits on its resize edge. Let QtNodes start the
    // wire before considering edge/corner resizing or inline controls.
    for (const auto port : {PortType::In, PortType::Out}) {
      const auto index = host_.portAt(id, port, (point - node.origin));
      if (index == InvalidPortIndex || QLineF(host_.portPosition(id, port, index), (point - node.origin)).length() >
                                           nm::handleDiameter / 2 + nm::handleRing / 2) {
        continue;
      }
      const auto connected = model_.connections(id, port, index);
      if (port == PortType::In && !connected.empty() && beginReconnect(*connected.begin(), port)) { return true; }
      host_.basePointerEvent(PointerAction::Press, event);
      host_.restoreGroupOrder();
      return false;
    }
    if (model_.isReroute(id)) {
      if (bounds.contains(point)) {
        host_.basePointerEvent(PointerAction::Press, event);
        return false;
      }
      continue;
    }
    const auto handle = QRectF(bounds.bottomRight() - QPointF(25, 25), QSizeF(25, 25));
    // A button in the last row, such as a document select's open button, takes the press
    // before the corner resize zone that overlaps it.
    const auto local = (point - node.origin);
    const bool overButton = std::any_of(layout.rows.cbegin(), layout.rows.cend(), [&local](const NodeRow &row) {
      return row.kind == NodeRowKind::Action && !row.rect.isEmpty() && row.rect.contains(local);
    });
    if (handle.contains(point) && !layout.collapsed && !overButton) {
      target = id;
      edges = Qt::RightEdge | Qt::BottomEdge;
      break;
    }
    if (bounds.contains(point) && pressCardControl(id, (point - node.origin))) {
      inlinePress_ = true;
      host_.restoreGroupOrder();
      return true;
    }
    for (const auto &row : layout.rows) {
      if (row.propertyName.isEmpty()) { continue; }
      const auto rect = model_.inlineFieldRect(id, row.propertyName).translated(node.origin);
      if (!rect.contains(point) || model_.inlineDescriptor(id, row.propertyName).isEmpty()) { continue; }
      const auto name = row.propertyName;
      if (!node.selected || host_.selectionCount() != 1) {
        host_.clearSelection();
        host_.selectNode(id, true);
      }
      inlinePress_ = true;
      emit nodeSelected(id);
      emit inlineEditRequested(id, name);
      return true;
    }
    if (node.selected && !layout.collapsed) {
      const auto hit = 5 / zoom;
      if (bounds.adjusted(-hit, -hit, hit, hit).contains(point)) {
        if (std::abs(point.x() - bounds.left()) <= hit) { edges |= Qt::LeftEdge; }
        if (std::abs(point.x() - bounds.right()) <= hit) { edges |= Qt::RightEdge; }
        if (std::abs(point.y() - bounds.top()) <= hit) { edges |= Qt::TopEdge; }
        if (std::abs(point.y() - bounds.bottom()) <= hit) { edges |= Qt::BottomEdge; }
        if (edges != Qt::Edges{}) {
          target = id;
          break;
        }
      }
    }
    if (model_.isGroup(id) && groupLabelRect(id, zoom).contains(point)) {
      target = id;
      label = true;
      break;
    }
    // A group body lets the press through to an outer group or the pane.
    if (passesThroughGroup(id, point)) { continue; }
    // Do not resize a frame behind another card's body.
    if (bounds.contains(point)) { break; }
  }
  if (target == InvalidNodeId) {
    host_.basePointerEvent(PointerAction::Press, event);
    beginNodeDrag(event);
    host_.restoreGroupOrder();
    return false;
  }
  auto item = host_.node(target);
  // ReactFlowWrapper.tsx selectGroupFromLabel: Shift, Ctrl or Cmd adds the group
  // to the selection, or takes a selected group out of it.
  const bool additive = event.modifiers & (Qt::ShiftModifier | Qt::ControlModifier | Qt::MetaModifier);
  if (label && additive && item->selected) {
    host_.selectNode(item->id, false);
    host_.restoreGroupOrder();
    return true;
  }
  if (!item->selected && !additive) { host_.clearSelection(); }
  host_.selectNode(item->id, true);
  emit nodeSelected(target);
  labelAdditive_ = additive;
  gesture_ = label ? Gesture::Label : Gesture::Resize;
  gestureNode_ = target;
  const auto cursor =
      label                                                                                ? Qt::ClosedHandCursor
      : edges == (Qt::LeftEdge | Qt::TopEdge) || edges == (Qt::RightEdge | Qt::BottomEdge) ? Qt::SizeFDiagCursor
      : edges == (Qt::RightEdge | Qt::TopEdge) || edges == (Qt::LeftEdge | Qt::BottomEdge) ? Qt::SizeBDiagCursor
      : edges & (Qt::LeftEdge | Qt::RightEdge)                                             ? Qt::SizeHorCursor
                                                                                           : Qt::SizeVerCursor;
  host_.setViewportCursor(cursor, false);
  gestureOrigin_ = point;
  gestureBounds_ = QRectF(item->origin, model_.layout(target).size);
  gestureUi_ = model_.uiProperties(target);
  resizeEdges_ = edges;
  minimumSize_ = model_.layout(target).minimumSize;
  // Web edge controls use a 200px minimum; its corner control permits 150px.
  if (!model_.isGroup(target) && !model_.isComment(target) && edges != (Qt::RightEdge | Qt::BottomEdge)) {
    minimumSize_.setWidth(std::max(200, minimumSize_.width()));
  }
  gestureSelected_.clear();
  gesturePositions_.clear();
  for (const auto id : model_.allNodeIds()) {
    gesturePositions_[id] = model_.nodeData(id, NodeRole::Position).toPointF();
    if (auto selected = host_.node(id); selected && selected->selected) { gestureSelected_.append(id); }
  }
  host_.restoreGroupOrder();
  return true;
}

bool CanvasInteraction::pressCardControl(NodeId id, const QPointF &local) {
  // A copy: selecting and every control action can rebuild this card's layout.
  const auto layout = model_.layout(id);
  const auto resource = model_.resourceId(id);
  if (const auto report = reportErrorRect(model_.runtimeState(id), layout);
      !report.isEmpty() && report.contains(local)) {
    emit errorReportRequested(resource);
    return true;
  }
  for (const auto &row : layout.rows) {
    if (!row.renameButtonRect.isEmpty() && row.renameButtonRect.contains(local)) {
      if (auto item = host_.node(id)) {
        emit dynamicPortFormRequested(resource, false, row.propertyName, row.renameLabelRect.translated(item->origin));
      }
      return true;
    }
    if (!row.typeChipRect.isEmpty() && row.typeChipRect.contains(local)) {
      if (auto item = host_.node(id)) {
        emit dynamicTypeMenuRequested(resource, row.propertyName, row.typeChipRect.translated(item->origin));
      }
      return true;
    }
    // The X removes the value, the declaration and the wires in one step.
    if (!row.removeButtonRect.isEmpty() && row.removeButtonRect.contains(local)) {
      if (model_.commit) {
        model_.commit({{"op", "removeDynamicInput"}, {"id", resource}, {"name", row.propertyName}});
      }
      return true;
    }
    if (!row.rect.contains(local)) { continue; }
    const auto select = [this, id] {
      auto item = host_.node(id);
      if (item && (!item->selected || host_.selectionCount() != 1)) {
        host_.clearSelection();
        host_.selectNode(item->id, true);
      }
      emit nodeSelected(id);
    };
    if (row.kind == NodeRowKind::Segmented && row.action == QStringLiteral("toggleBool")) {
      // A synth faceplate's on/off toggle flips its boolean.
      select();
      if (!row.checked && model_.commit) {
        model_.commit(model_.propertyCommand(id, row.propertyName, row.selected < 0));
      }
      return true;
    }
    if (row.kind == NodeRowKind::Segmented || row.kind == NodeRowKind::Waveform) {
      select();
      for (int i = 0; i < row.parts.size() && i < row.optionValues.size(); ++i) {
        if (!row.parts[i].contains(local) || i == row.selected) { continue; }
        // Both actions rebuild this card's layout, so `row` is not read afterwards.
        const auto value = row.optionValues[i];
        // A preview tab is view state and never enters the document.
        if (row.action == QStringLiteral("previewTab")) {
          model_.setPreviewTab(id, value.toString());
        } else if (!row.checked && model_.commit) {
          model_.commit(model_.propertyCommand(id, row.propertyName, QJsonValue::fromVariant(value)));
        }
        break;
      }
      return true;
    }
    if (row.kind == NodeRowKind::Lock) {
      select();
      model_.setDimensionsLinked(id, !row.checked);
      return true;
    }
    if (row.kind == NodeRowKind::ListItem && row.parts.size() > 1 && local.y() < row.parts[1].bottom()) {
      select();
      model_.toggleListItem(id, row.selected);
      return true;
    }
    if (row.kind == NodeRowKind::Action) {
      if (row.action == QStringLiteral("addOutput")) {
        if (layout.body == CardBody::Content) {
          emit outputFormRequested(resource);
        } else if (auto item = host_.node(id)) {
          emit dynamicPortFormRequested(resource, true, {}, row.rect.translated(item->origin));
        }
        return true;
      }
      // Constant String's header buttons name their property in `value`.
      if (row.action == QStringLiteral("copyValue")) {
        select();
        QGuiApplication::clipboard()->setText(model_.nodeSnapshot(id)["data"].toObject()[row.value].toString());
        return true;
      }
      // A List Generator row copies its whole item, as its CopyButton.
      if (row.action == QStringLiteral("copyListItem")) {
        select();
        QGuiApplication::clipboard()->setText(row.value);
        return true;
      }
      if (row.action == QStringLiteral("openDocument")) {
        select();
        const auto reference = model_.nodeSnapshot(id)["data"].toObject()[row.propertyName].toObject();
        if (!reference["id"].toString().isEmpty()) {
          emit documentOpenRequested(row.value, reference["id"].toString());
        }
        return true;
      }
      if (row.action == QStringLiteral("connectProvider")) {
        select();
        emit providerConnectRequested(row.value);
        return true;
      }
      if (row.action == QStringLiteral("expandEditor")) {
        select();
        emit inlineExpandRequested(id, row.value);
        return true;
      }
      if (row.action == QStringLiteral("addInput")) {
        if (auto item = host_.node(id)) {
          emit dynamicPortFormRequested(resource, false, {}, row.rect.translated(item->origin));
        }
        return true;
      }
      select();
      if (!model_.commit) { return true; }
      const auto node = model_.nodeSnapshot(id);
      if (row.action == QStringLiteral("addContentInput")) {
        const auto values = node["dynamic_properties"].toObject();
        const auto declarations = node["dynamic_inputs"].toObject();
        QSet<QString> taken;
        for (auto it = values.begin(); it != values.end(); ++it) { taken.insert(it.key()); }
        for (auto it = declarations.begin(); it != declarations.end(); ++it) { taken.insert(it.key()); }
        for (const auto &entry : model_.metadata(id)["properties"].toArray()) {
          taken.insert(entry.toObject()["name"].toString());
        }
        int index = 1;
        while (taken.contains(QStringLiteral("input_%1").arg(index))) { ++index; }
        model_.commit({{"op", "addDynamicInput"}, {"id", resource}, {"name", QStringLiteral("input_%1").arg(index)}});
      } else if (row.action == QStringLiteral("addVariable")) {
        // useDynamicProperty names a new variable var_1, var_2, and so on.
        const auto existing = node["dynamic_properties"].toObject();
        int index = 1;
        while (existing.contains(QStringLiteral("var_%1").arg(index))) { ++index; }
        model_.commit({{"op", "addDynamicInput"}, {"id", resource}, {"name", QStringLiteral("var_%1").arg(index)}});
      } else if (row.action == QStringLiteral("resizePreset")) {
        model_.commit({{"op", "batch"},
                       {"commands", QJsonArray{model_.propertyCommand(id, QStringLiteral("width"), row.number),
                                               model_.propertyCommand(id, QStringLiteral("height"), row.number)}}});
      } else if (row.action == QStringLiteral("compareMode")) {
        // ImageComparer's toggle switches the divider direction and keeps its position.
        for (const auto &compare : layout.rows) {
          if (compare.kind != NodeRowKind::Compare) { continue; }
          model_.setPreviewTab(id, compareTab({!compare.checked, compare.number}));
        }
      } else if (row.action == QStringLiteral("compositorLayout")) {
        emit headerActionRequested(model_.resourceId(id), row.action);
      } else if (row.action.startsWith(QStringLiteral("compositor"))) {
        model_.compositorAction(id, row.action, int(row.number));
      } else if (row.action.startsWith(QStringLiteral("painter"))) {
        model_.painterAction(id, row.action, row.value);
      } else if (row.action == QStringLiteral("runNode")) {
        // RunModelButton runs this node on its own, as Run node does.
        if (auto item = host_.node(id)) {
          if (!item->selected || host_.selectionCount() != 1) {
            host_.clearSelection();
            host_.selectNode(item->id, true);
          }
        }
        emit nodeSelected(id);
        emit nodeRunRequested(model_.resourceId(id));
      } else if (row.action == QStringLiteral("insertVariable")) {
        const auto prompt = node["data"].toObject()["prompt"].toString();
        model_.commit(
            model_.propertyCommand(id, QStringLiteral("prompt"), prompt + QStringLiteral("{{ %1 }}").arg(row.value)));
      } else if (row.action == QStringLiteral("addColumn")) {
        model_.commit(model_.addDataframeColumnCommand(id, row.propertyName));
      } else if (row.action == QStringLiteral("toggleProperty")) {
        model_.commit(model_.propertyCommand(id, row.propertyName, !row.checked));
      } else if (row.action == QStringLiteral("previousFrame") || row.action == QStringLiteral("nextFrame")) {
        // ExtractVideoFrameBody's step buttons move the extracted time one frame.
        const auto time = node["data"].toObject()[QStringLiteral("time")].toDouble();
        model_.commit(model_.propertyCommand(
            id, QStringLiteral("time"), steppedVideoTime(time, row.action == QStringLiteral("nextFrame") ? 1 : -1)));
      } else if (row.action == QStringLiteral("removeCollectionItem")) {
        auto items = node["data"].toObject()[QStringLiteral("items")].toArray();
        if (row.selected >= 0 && row.selected < items.size()) {
          items.removeAt(row.selected);
          model_.commit(model_.propertyCommand(id, QStringLiteral("items"), items));
        }
      } else if (row.action == QStringLiteral("clearCollection")) {
        model_.commit(model_.propertyCommand(id, QStringLiteral("items"), QJsonArray{}));
      } else if (row.action == QStringLiteral("resetCrop")) {
        // CropBody's Reset selects the whole image, or 512 square before one arrives.
        QSizeF bounds(512, 512);
        for (const auto &crop : layout.rows) {
          if (crop.kind == NodeRowKind::Crop) { bounds = QSizeF(crop.minimum, crop.maximum); }
        }
        model_.commit(
            {{"op", "batch"},
             {"commands", QJsonArray{model_.propertyCommand(id, QStringLiteral("left"), 0),
                                     model_.propertyCommand(id, QStringLiteral("top"), 0),
                                     model_.propertyCommand(id, QStringLiteral("right"), bounds.width()),
                                     model_.propertyCommand(id, QStringLiteral("bottom"), bounds.height())}}});
      } else if (row.action == QStringLiteral("resetSliders")) {
        // The Curves and Levels Reset writes every default in one step.
        QJsonArray commands;
        for (int i = 0; i < row.options.size() && i < row.optionValues.size(); ++i) {
          commands.append(model_.propertyCommand(id, row.options[i], QJsonValue::fromVariant(row.optionValues[i])));
        }
        if (row.options.isEmpty()) {
          for (const auto &slider : layout.rows) {
            if (slider.kind == NodeRowKind::Slider && slider.tracksDefault) {
              commands.append(model_.propertyCommand(id, slider.propertyName, slider.defaultNumber));
            }
          }
        }
        model_.commit({{"op", "batch"}, {"commands", commands}});
      } else if (row.action == QStringLiteral("resetTransform")) {
        // RotateAndFlipBody's Reset writes the angle and both flips together.
        model_.commit({{"op", "batch"},
                       {"commands", QJsonArray{model_.propertyCommand(id, QStringLiteral("angle"), 0),
                                               model_.propertyCommand(id, QStringLiteral("flip_horizontal"), false),
                                               model_.propertyCommand(id, QStringLiteral("flip_vertical"), false)}}});
      }
      return true;
    }
    if (row.kind == NodeRowKind::Compare) {
      if (!row.rect.contains(local)) { continue; }
      // The mode toggle sits over the images and takes its own press.
      bool onButton = false;
      for (const auto &other : layout.rows) {
        onButton = onButton || (other.kind == NodeRowKind::Action && other.rect.contains(local));
      }
      if (onButton) { continue; }
      select();
      compareNode_ = id;
      const auto position = row.checked ? (local.y() - row.rect.top()) / row.rect.height()
                                        : (local.x() - row.rect.left()) / row.rect.width();
      model_.setPreviewTab(id, compareTab({row.checked, std::clamp(position, 0.0, 1.0)}));
      return true;
    }
    if (row.kind == NodeRowKind::Paint) {
      if (!row.rect.contains(local) || model_.readOnly() || row.minimum <= 0 || row.maximum <= 0) { continue; }
      select();
      paintNode_ = id;
      paintStroke_ = QImage(QSize(int(row.minimum), int(row.maximum)), QImage::Format_ARGB32_Premultiplied);
      paintStroke_.fill(Qt::transparent);
      // A press paints a dot, as drawStrokeTo from the same point.
      paintLast_ = QPointF((local.x() - row.rect.x()) * row.minimum / row.rect.width(),
                           (local.y() - row.rect.y()) * row.maximum / row.rect.height());
      QPainter stroke(&paintStroke_);
      stroke.setRenderHint(QPainter::Antialiasing);
      stroke.setPen(QPen(QColor(row.value), row.step, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
      stroke.drawPoint(paintLast_);
      host_.repaintNode(id);
      return true;
    }
    if (row.kind == NodeRowKind::Crop) {
      // Outside the crop and its handles the image passes the press to the card.
      const auto handle = cropHandleAt(row, cropEdges(row), local);
      if (handle.isEmpty() || model_.readOnly()) { continue; }
      select();
      cropNode_ = id;
      cropHandle_ = handle;
      cropStart_ = cropEdges(row);
      cropValue_ = cropStart_;
      cropPointer_ = local;
      return true;
    }
    if (row.kind == NodeRowKind::Knob) {
      if (!knobFace(row).contains(local)) { continue; }
      select();
      if (row.checked) { return true; }
      sliderNode_ = id;
      sliderProperty_ = row.propertyName;
      sliderOrigin_ = row.number;
      sliderValue_ = row.number;
      knobDrag_ = true;
      knobStartY_ = local.y();
      return true;
    }
    if (row.kind == NodeRowKind::Slider) {
      select();
      if (row.checked) { return true; }
      sliderNode_ = id;
      sliderProperty_ = row.propertyName;
      sliderOrigin_ = row.number;
      sliderValue_ = sliderValueAt(row, local.x());
      host_.repaintNode(id);
      if (sliderValue_ != sliderOrigin_) { emit sliderDraftChanged(id, sliderProperty_, sliderValue_); }
      return true;
    }
  }
  return false;
}
bool CanvasInteraction::resetKnob(const QPointF &scenePosition) {
  // SynthKnob's double-click puts the knob back to its default in one step.
  for (const auto &hit : host_.hitsAt(scenePosition)) {
    const auto node = host_.node(hit.node);
    if (!node) { continue; }
    const auto id = node->id;
    const auto local = (scenePosition - node->origin);
    for (const auto &row : model_.layout(id).rows) {
      if (row.kind != NodeRowKind::Knob || row.checked || !knobFace(row).contains(local)) { continue; }
      if (row.number != row.defaultNumber && model_.commit) {
        model_.commit(model_.propertyCommand(id, row.propertyName, row.defaultNumber));
      }
      return true;
    }
    return false;
  }
  return false;
}
void CanvasInteraction::moveSlider(const QPointF &scenePosition) {
  auto item = host_.node(sliderNode_);
  if (!item) {
    finishSlider(false);
    return;
  }
  for (const auto &row : model_.layout(sliderNode_).rows) {
    if (knobDrag_ && row.kind == NodeRowKind::Knob && row.propertyName == sliderProperty_) {
      const auto value = knobDragValue(row, sliderOrigin_, knobStartY_, (scenePosition - item->origin).y(), knobFine_);
      if (value == sliderValue_) { return; }
      sliderValue_ = value;
      host_.repaintNode(item->id);
      emit sliderDraftChanged(sliderNode_, sliderProperty_, value);
      return;
    }
    if (!knobDrag_ && row.kind == NodeRowKind::Slider && row.propertyName == sliderProperty_) {
      const auto value = sliderValueAt(row, (scenePosition - item->origin).x());
      if (value == sliderValue_) { return; }
      sliderValue_ = value;
      host_.repaintNode(item->id);
      emit sliderDraftChanged(sliderNode_, sliderProperty_, value);
      return;
    }
  }
}
void CanvasInteraction::moveCrop(const QPointF &scenePosition) {
  auto item = host_.node(cropNode_);
  if (!item) {
    finishCrop(false);
    return;
  }
  for (const auto &row : model_.layout(cropNode_).rows) {
    if (row.kind != NodeRowKind::Crop || row.rect.isEmpty()) { continue; }
    const auto local = (scenePosition - item->origin);
    // Card pixels to image pixels, as renderedScale.
    const QPointF delta((local.x() - cropPointer_.x()) * row.minimum / row.rect.width(),
                        (local.y() - cropPointer_.y()) * row.maximum / row.rect.height());
    const auto value = cropDragged(cropHandle_, cropStart_, delta, QSizeF(row.minimum, row.maximum), row.step);
    if (value == cropValue_) { return; }
    cropValue_ = value;
    host_.repaintNode(item->id);
    return;
  }
}
void CanvasInteraction::updateBrushCursor(const QPointF &scenePosition, const std::optional<CanvasNodeHit> &node) {
  auto next = InvalidNodeId;
  QPointF point;
  if (node) {
    const auto local = (scenePosition - node->origin);
    for (const auto &row : model_.layout(node->id).rows) {
      if (row.kind == NodeRowKind::Paint && row.rect.contains(local)) {
        next = node->id;
        point = local;
      }
    }
  }
  if (next == brushNode_ && point == brushPoint_) { return; }
  const auto previous = std::exchange(brushNode_, next);
  brushPoint_ = point;
  host_.repaintNode(previous);
  if (previous != next) { host_.repaintNode(next); }
}
void CanvasInteraction::moveCompare(const QPointF &scenePosition) {
  auto item = host_.node(compareNode_);
  if (!item) {
    compareNode_ = InvalidNodeId;
    return;
  }
  for (const auto &row : model_.layout(compareNode_).rows) {
    if (row.kind != NodeRowKind::Compare || row.rect.isEmpty()) { continue; }
    const auto local = (scenePosition - item->origin);
    const auto position = row.checked ? (local.y() - row.rect.top()) / row.rect.height()
                                      : (local.x() - row.rect.left()) / row.rect.width();
    model_.setPreviewTab(compareNode_, compareTab({row.checked, std::clamp(position, 0.0, 1.0)}));
    return;
  }
}
void CanvasInteraction::movePaint(const QPointF &scenePosition) {
  auto item = host_.node(paintNode_);
  if (!item) {
    finishPaint(false);
    return;
  }
  for (const auto &row : model_.layout(paintNode_).rows) {
    if (row.kind != NodeRowKind::Paint || row.rect.isEmpty()) { continue; }
    const auto local = (scenePosition - item->origin);
    const QPointF point((local.x() - row.rect.x()) * row.minimum / row.rect.width(),
                        (local.y() - row.rect.y()) * row.maximum / row.rect.height());
    brushNode_ = paintNode_;
    brushPoint_ = local;
    if (point == paintLast_) {
      host_.repaintNode(item->id);
      return;
    }
    QPainter stroke(&paintStroke_);
    stroke.setRenderHint(QPainter::Antialiasing);
    stroke.setPen(QPen(QColor(row.value), row.step, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    stroke.drawLine(paintLast_, point);
    paintLast_ = point;
    host_.repaintNode(item->id);
    return;
  }
}
void CanvasInteraction::finishPaint(bool commit) {
  const auto id = paintNode_;
  const auto stroke = std::exchange(paintStroke_, QImage());
  paintNode_ = InvalidNodeId;
  host_.repaintNode(id);
  // finishStroke lays the whole stroke at once, so one undo step reverts it.
  if (commit && model_.nodeExists(id)) { model_.finishPaintStroke(id, stroke); }
}
void CanvasInteraction::finishCrop(bool commit) {
  const auto id = cropNode_;
  const auto value = cropValue_;
  cropNode_ = InvalidNodeId;
  cropHandle_.clear();
  host_.repaintNode(id);
  // One drag writes the four edges together, so a single undo step reverts it.
  if (commit && model_.nodeExists(id) && value != cropStart_ && model_.commit) {
    model_.commit({{"op", "batch"},
                   {"commands", QJsonArray{model_.propertyCommand(id, QStringLiteral("left"), value.left()),
                                           model_.propertyCommand(id, QStringLiteral("top"), value.top()),
                                           model_.propertyCommand(id, QStringLiteral("right"), value.right()),
                                           model_.propertyCommand(id, QStringLiteral("bottom"), value.bottom())}}});
  }
}
void CanvasInteraction::finishSlider(bool commit) {
  const auto id = sliderNode_;
  const auto name = sliderProperty_;
  const auto value = sliderValue_;
  sliderNode_ = InvalidNodeId;
  sliderProperty_.clear();
  knobDrag_ = false;
  host_.repaintNode(id);
  // One drag commits one value, so a single undo step reverts it.
  if (commit && model_.nodeExists(id) && value != sliderOrigin_ && isCardControl(name)) {
    model_.setCardControl(id, name, value);
  } else if (commit && model_.nodeExists(id) && value != sliderOrigin_ && model_.commit) {
    model_.commit(model_.propertyCommand(id, name, value));
  }
}
bool CanvasInteraction::move(const CanvasPointerEvent &event) {
  setAltHeld(event.modifiers.testFlag(Qt::AltModifier));
  // The connectable styling covers every card, so a drag start repaints them.
  const bool drafting = draftEnd().node != InvalidNodeId;
  // A dragged wire draws above every card (QtNodes gives a connection z -1).
  // The base class' hover handling resets a card's cursor, so the handle cursor is set last.
  const auto cursorGuard = qScopeGuard([this, drafting] { refreshHandleCursor(drafting); });
  if (drafting != draftFeedback_) {
    draftFeedback_ = drafting;
    host_.draftFeedbackChanged();
  }
  if (sliderNode_ != InvalidNodeId) {
    knobFine_ = event.modifiers.testFlag(Qt::ShiftModifier);
    moveSlider(event.scenePosition);
    return true;
  }
  if (cropNode_ != InvalidNodeId) {
    moveCrop(event.scenePosition);
    return true;
  }
  if (paintNode_ != InvalidNodeId) {
    movePaint(event.scenePosition);
    return true;
  }
  if (compareNode_ != InvalidNodeId) {
    moveCompare(event.scenePosition);
    return true;
  }
  updatePointerHover(event.scenePosition);
  if (footerPress_ != InvalidNodeId) { return true; }
  QHash<NodeId, QPointF> before;
  const bool rememberDrag = dragNode_ != InvalidNodeId && !viewportGesture_ && dragPositions_.isEmpty();
  if (rememberDrag || !model_.groupIds().isEmpty()) { before = model_.nodePositions(); }
  if (rememberDrag) { dragPositions_ = before; }
  if (gesture_ == Gesture::Label) {
    const auto delta = event.scenePosition - gestureOrigin_;
    for (const auto id : gestureSelected_) {
      model_.setNodeData(id, NodeRole::Position, gesturePositions_.value(id) + delta);
    }
    model_.moveDescendants(before);
  } else if (gesture_ == Gesture::Resize) {
    const auto delta = event.scenePosition - gestureOrigin_;
    auto bounds = gestureBounds_;
    const auto maximumWidth = model_.isGroup(gestureNode_) ? 10000000.0 : 800.0;
    if (resizeEdges_ & Qt::RightEdge) {
      bounds.setRight(bounds.left() +
                      std::clamp(gestureBounds_.width() + delta.x(), double(minimumSize_.width()), maximumWidth));
    }
    if (resizeEdges_ & Qt::BottomEdge) {
      bounds.setBottom(bounds.top() + std::max(double(minimumSize_.height()), gestureBounds_.height() + delta.y()));
    }
    if (resizeEdges_ & Qt::LeftEdge) {
      bounds.setLeft(bounds.right() -
                     std::clamp(gestureBounds_.width() - delta.x(), double(minimumSize_.width()), maximumWidth));
    }
    if (resizeEdges_ & Qt::TopEdge) {
      bounds.setTop(bounds.bottom() - std::max(double(minimumSize_.height()), gestureBounds_.height() - delta.y()));
    }
    host_.prepareNodeGeometry(gestureNode_);
    model_.setNodeData(gestureNode_, NodeRole::Size, bounds.size().toSize());
    model_.setNodeData(gestureNode_, NodeRole::Position, bounds.topLeft());
    // Changing a frame's bounds does not move its children on the canvas.
  } else {
    if (drafting) {
      host_.moveDraft(event);
    } else {
      host_.basePointerEvent(PointerAction::Move, event);
    }
    model_.moveDescendants(before);
    trackNodeDrag(event);
  }
  host_.restoreGroupOrder();
  return drafting || gesture_ != Gesture::None;
}

void CanvasInteraction::updatePointerHover(QPointF scenePosition) {
  const auto node = host_.nodeAtPoint(scenePosition);
  updateHandleHover(scenePosition, node);
  updateBrushCursor(scenePosition, node);
  host_.setButtonHover(footerHover_, false, false, {});
  footerHover_ = InvalidNodeId;
  if (node) {
    const auto &layout = model_.layout(node->id);
    const bool hovered = layout.subgraph && layout.footerRect().contains((scenePosition - node->origin));
    const bool actionHovered = !layout.headerAction.isEmpty() && !layout.collapsed && !model_.readOnly() &&
                               layout.headerActionRect().contains((scenePosition - node->origin));
    footerHover_ = hovered || actionHovered ? node->id : InvalidNodeId;
    host_.setButtonHover(node->id, hovered, actionHovered,
                         hovered
                             ? QCoreApplication::translate("nodetool::EditorScene", "Open the subgraph in its own tab")
                         : actionHovered ? QCoreApplication::translate("nodetool::EditorScene", "Load workflow")
                                         : QString{});
  }
}

bool CanvasInteraction::release(const CanvasPointerEvent &event) {
  // The paint after this release runs without the draft, so the cards return to normal.
  if (draftFeedback_) {
    draftFeedback_ = false;
    host_.draftFeedbackChanged();
  }
  if (sliderNode_ != InvalidNodeId && event.button == Qt::LeftButton) {
    knobFine_ = event.modifiers.testFlag(Qt::ShiftModifier);
    moveSlider(event.scenePosition);
    finishSlider(true);
    inlinePress_ = false;
    return true;
  }
  if (cropNode_ != InvalidNodeId && event.button == Qt::LeftButton) {
    moveCrop(event.scenePosition);
    finishCrop(true);
    inlinePress_ = false;
    return true;
  }
  if (compareNode_ != InvalidNodeId && event.button == Qt::LeftButton) {
    moveCompare(event.scenePosition);
    compareNode_ = InvalidNodeId;
    inlinePress_ = false;
    return true;
  }
  if (paintNode_ != InvalidNodeId && event.button == Qt::LeftButton) {
    movePaint(event.scenePosition);
    finishPaint(true);
    inlinePress_ = false;
    return true;
  }
  if (footerPress_ != InvalidNodeId) {
    const auto id = footerPress_;
    footerPress_ = InvalidNodeId;
    auto item = host_.node(id);
    const auto &pressed = model_.layout(id);
    const auto rect = outputFormPress_     ? pressed.outputFormRect()
                      : headerActionPress_ ? pressed.headerActionRect()
                                           : pressed.footerRect();
    const auto action = pressed.headerAction;
    if (event.button == Qt::LeftButton && item && rect.contains((event.scenePosition - item->origin))) {
      if (outputFormPress_) {
        emit outputFormRequested(model_.resourceId(id));
      } else if (headerActionPress_) {
        emit headerActionRequested(model_.resourceId(id), action);
      } else {
        emit childOpenRequested(model_.resourceId(id));
      }
    }
    outputFormPress_ = false;
    headerActionPress_ = false;
    return true;
  }
  if (!reconnectEdge_.isEmpty() && event.button == Qt::LeftButton) {
    const auto id = reconnectingEdgeId();
    auto connection = reconnectEdge_;
    bool foundPort = false;
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto node = host_.node(hit.node);
      if (!node) { continue; }
      const auto port = host_.portAt(node->id, reconnectSide_, (event.scenePosition - node->origin));
      if (port == InvalidPortIndex ||
          QLineF(host_.portPosition(node->id, reconnectSide_, port), (event.scenePosition - node->origin)).length() >
              nm::handleDiameter / 2 + nm::handleRing / 2) {
        continue;
      }
      const auto source = reconnectSide_ == PortType::Out;
      connection[source ? "source" : "target"] = model_.resourceId(node->id);
      connection[source ? "sourceHandle" : "targetHandle"] =
          model_.ports(node->id, reconnectSide_)[int(port)].toObject()["name"];
      foundPort = true;
      break;
    }
    const bool valid = foundPort && model_.validateConnection && model_.validateConnection(connection);
    resetDraftConnection();
    if (valid) {
      emit reconnectRequested(id, connection);
    } else {
      emit reconnectDiscarded(id);
    }
    return true;
  }
  const auto draft = host_.draftWire();
  if (!model_.readOnly() && event.button == Qt::LeftButton && draft) {
    const auto connection = *draft;
    const auto port = connection.outNodeId == InvalidNodeId ? PortType::In : PortType::Out;
    const auto node = port == PortType::Out ? connection.outNodeId : connection.inNodeId;
    const auto index = port == PortType::Out ? connection.outPortIndex : connection.inPortIndex;
    const auto origin = host_.node(node);
    const bool ownHandle = origin && host_.portAt(node, port, (event.scenePosition - origin->origin)) == index;
    std::optional<CanvasNodeHit> body;
    for (const auto &hit : host_.hitsAt(event.scenePosition)) {
      const auto target = host_.node(hit.node);
      if (target && !model_.isGroup(target->id)) {
        body = target;
        break;
      }
    }
    bool otherHandle = false;
    bool refused = false;
    if (body && !ownHandle) {
      for (const auto side : {PortType::In, PortType::Out}) {
        const auto hit = host_.portAt(body->id, side, (event.scenePosition - body->origin));
        if (hit != InvalidPortIndex &&
            QLineF(host_.portPosition(body->id, side, hit), (event.scenePosition - body->origin)).length() <=
                nm::handleDiameter / 2 + nm::handleRing / 2) {
          otherHandle = true;
          ConnectionId candidate{InvalidNodeId, 0, InvalidNodeId, 0};
          if (side == PortType::In) {
            candidate = ConnectionId{node, index, body->id, hit};
          } else {
            candidate = ConnectionId{body->id, hit, node, index};
          }
          refused = side == port || !model_.connectionPossible(candidate);
        }
      }
    }
    if (body && otherHandle && refused) {
      resetDraftConnection();
      emit connectionRefused();
      host_.restoreGroupOrder();
      return true;
    }
    if (body && !ownHandle && !otherHandle) {
      const auto target = body->id;
      resetDraftConnection();
      emit wireBodyDropped(node, port, index, target, event.scenePosition);
      host_.restoreGroupOrder();
      return true;
    }
    if (!body || ownHandle) {
      resetDraftConnection();
      emit looseWireDropped(node, port, index, event.scenePosition);
      host_.restoreGroupOrder();
      return true;
    }
  }
  if (inlinePress_) {
    inlinePress_ = false;
    host_.restoreGroupOrder();
    return true;
  }
  const auto gesture = gesture_;
  if (gesture != Gesture::None) { host_.setViewportCursor(std::nullopt, false); }
  const auto id = gestureNode_;
  gesture_ = Gesture::None;
  if (gesture == Gesture::Resize && model_.nodeExists(id)) {
    const auto size = model_.nodeData(id, NodeRole::Size).toSize();
    const auto position = model_.nodeData(id, NodeRole::Position).toPointF();
    if (size != gestureBounds_.size().toSize() || position != gestureBounds_.topLeft()) {
      auto ui = gestureUi_;
      ui["width"] = size.width();
      ui["height"] = size.height();
      model_.markHandSized(id, ui);
      QJsonArray commands{QJsonObject{
          {"op", "setNodeField"}, {"id", model_.resourceId(id)}, {"field", "ui_properties"}, {"value", ui}}};
      if (position != gestureBounds_.topLeft()) {
        QJsonObject positions{{model_.resourceId(id), QJsonObject{{"x", position.x()}, {"y", position.y()}}}};
        for (const auto child : model_.descendants(id)) {
          const auto p = gesturePositions_.value(child);
          positions[model_.resourceId(child)] = QJsonObject{{"x", p.x()}, {"y", p.y()}};
        }
        commands.append(QJsonObject{{"op", "moveNodes"}, {"positions", positions}, {"space", "absolute"}});
      }
      if (model_.commit && !model_.commit({{"op", "batch"}, {"commands", commands}})) { cancelGesture(); }
    }
  } else if (gesture == Gesture::Label) {
    // A plain click on a label, without a drag, selects the group alone, as
    // React Flow's node click does after a press that kept a wider selection.
    if (!labelAdditive_ && event.scenePosition == gestureOrigin_ && model_.nodeExists(id)) {
      if (auto item = host_.node(id)) {
        host_.clearSelection();
        host_.selectNode(item->id, true);
        emit nodeSelected(id);
      }
    }
  } else {
    if (draft) {
      host_.finishDraft(event);
    } else {
      host_.basePointerEvent(PointerAction::Release, event);
    }
    endNodeDrag();
  }
  gesturePositions_.clear();
  host_.restoreGroupOrder();
  return draft.has_value() || gesture != Gesture::None;
}

void CanvasInteraction::beginNodeDrag(const CanvasPointerEvent &event) {
  dragNode_ = InvalidNodeId;
  dragPositions_.clear();
  dragMoved_ = false;
  dragDetach_ = false;
  outcome_ = {};
  if (event.button != Qt::LeftButton || model_.readOnly()) { return; }
  const auto grabbed = host_.grabbedNode();
  if (grabbed == InvalidNodeId || model_.isGroup(grabbed) || model_.isReroute(grabbed)) { return; }
  dragNode_ = grabbed;
  dragStart_ = event.screenPosition;
  wiggle_.reset();
  dragClock_.start();
}

// onNodeDrag in useDragHandlers.ts: Alt or a shake takes a grouped card out of
// its group, and the group the card overlaps is the one it joins on release.
void CanvasInteraction::trackNodeDrag(const CanvasPointerEvent &event) {
  if (dragNode_ == InvalidNodeId || !(event.buttons & Qt::LeftButton) || !model_.nodeExists(dragNode_)) { return; }
  const auto item = host_.node(dragNode_);
  if (!item) { return; }
  if (!dragMoved_) {
    if ((event.screenPosition - dragStart_).manhattanLength() < 4) { return; }
    dragMoved_ = true;
    emit nodeDragChanged(true);
  }
  wiggle_.add(event.screenPosition, dragClock_.elapsed());
  const bool grouped = !model_.nodeSnapshot(dragNode_)["parent_id"].toString().isEmpty();
  if (grouped && ((event.modifiers & Qt::AltModifier) || wiggle_.wiggling())) { dragDetach_ = true; }
  const QRectF card(item->origin, model_.layout(dragNode_).size);
  auto target = InvalidNodeId;
  double smallest = 0;
  for (const auto id : model_.groupIds()) {
    const auto group = host_.node(id);
    if (!group) { continue; }
    const QRectF frame(group->origin, model_.layout(id).size);
    const auto overlap = frame.intersected(card);
    if (overlap.width() <= 0 || overlap.height() <= 0) { continue; }
    const auto area = frame.width() * frame.height();
    if (target == InvalidNodeId || area < smallest) {
      target = id;
      smallest = area;
    }
  }
  if (target == dropGroup_) { return; }
  const auto previous = dropGroup_;
  dropGroup_ = target;
  if (target == InvalidNodeId) {
    dropClock_.invalidate();
    dropHintTimer_.stop();
  } else {
    dropClock_.start();
    dropHintTimer_.start();
  }
  host_.repaintCanvas();
  for (const auto id : {previous, target}) { host_.repaintNode(id); }
}

void CanvasInteraction::endNodeDrag() {
  if (dragMoved_) {
    outcome_ = {dropGroup_, dragDetach_};
    emit nodeDragChanged(false);
  }
  const auto group = dropGroup_;
  dragNode_ = InvalidNodeId;
  dragPositions_.clear();
  dropGroup_ = InvalidNodeId;
  dropClock_.invalidate();
  dropHintTimer_.stop();
  host_.repaintCanvas();
  dragMoved_ = false;
  dragDetach_ = false;
  host_.repaintNode(group);
}

CanvasInteraction::DragOutcome CanvasInteraction::takeDragOutcome() {
  const auto result = outcome_;
  outcome_ = {};
  return result;
}

void CanvasInteraction::cancelGesture() {
  host_.setViewportCursor(std::nullopt, true);
  if (gestureNode_ != InvalidNodeId && model_.nodeExists(gestureNode_)) {
    host_.prepareNodeGeometry(gestureNode_);
    model_.setNodeData(gestureNode_, NodeRole::Size, gestureBounds_.size().toSize());
  }
  for (auto it = gesturePositions_.cbegin(); it != gesturePositions_.cend(); ++it) {
    model_.setNodeData(it.key(), NodeRole::Position, it.value());
  }
  gesture_ = Gesture::None;
  gestureNode_ = InvalidNodeId;
  gesturePositions_.clear();
}
bool CanvasInteraction::keyPress(int key) {
  if (key == Qt::Key_Escape && sliderNode_ != InvalidNodeId) {
    finishSlider(false);
    return true;
  }
  if (key == Qt::Key_Escape && cropNode_ != InvalidNodeId) {
    finishCrop(false);
    return true;
  }
  if (key == Qt::Key_Escape && paintNode_ != InvalidNodeId) {
    finishPaint(false);
    return true;
  }
  if (key == Qt::Key_Escape && gesture_ != Gesture::None) {
    cancelGesture();
    return true;
  }
  if (key == Qt::Key_Alt) { setAltHeld(true); }
  return false;
}
void CanvasInteraction::keyRelease(int key) {
  if (key == Qt::Key_Alt) { setAltHeld(false); }
}
void CanvasInteraction::leavePointer() {
  const auto oldHandle = std::exchange(handleHover_, {});
  if (oldHandle.node != InvalidNodeId) {
    host_.invalidateForeground();
    host_.repaintNode(oldHandle.node);
  }
  refreshHandleCursor(false);
  host_.setButtonHover(std::exchange(footerHover_, InvalidNodeId), false, false, {});
  host_.repaintNode(std::exchange(brushNode_, InvalidNodeId));
}

void CanvasInteraction::cancelPointerGesture() {
  focusOut();
  for (const auto id : model_.allNodeIds()) {
    const auto position = viewportPositions_.constFind(model_.resourceId(id));
    if (position != viewportPositions_.cend()) {
      if (model_.nodeData(id, NodeRole::Position).toPointF() != *position) {
        model_.setNodeData(id, NodeRole::Position, *position);
      }
    } else if (const auto drag = dragPositions_.constFind(id); drag != dragPositions_.cend() &&
               model_.nodeData(id, NodeRole::Position).toPointF() != *drag) {
      model_.setNodeData(id, NodeRole::Position, *drag);
    }
  }
  discardPointerGesture();
}

void CanvasInteraction::modelReset() {
  // The model already holds the new projection. Discard the gesture
  // without restoring its saved positions or sizes.
  gesture_ = Gesture::None;
  gestureNode_ = InvalidNodeId;
  gesturePositions_.clear();
  host_.setViewportCursor(std::nullopt, true);
  setAltHeld(false);
  discardPointerGesture();
}

void CanvasInteraction::discardPointerGesture() {
  invalidateViewportGesture();
  panning_ = false;
  middleEdge_.clear();
  resetDraftConnection();
  if (sliderNode_ != InvalidNodeId) { finishSlider(false); }
  if (cropNode_ != InvalidNodeId) { finishCrop(false); }
  if (paintNode_ != InvalidNodeId) { finishPaint(false); }
  host_.repaintNode(std::exchange(compareNode_, InvalidNodeId));
  inlinePress_ = outputFormPress_ = headerActionPress_ = false;
  footerPress_ = InvalidNodeId;
  endNodeDrag();
  outcome_ = {};
  leavePointer();
  host_.restoreGroupOrder();
}

void CanvasInteraction::focusOut() {
  setAltHeld(false);
  if (gesture_ != Gesture::None) { cancelGesture(); }
}

} // namespace nodetool::canvas
