#include "canvas/EditorCanvasScene.h"

#include "canvas/ConnectionItem.h"
#include "canvas/NodeConnectionInteraction.h"
#include "canvas/NodeGeometry.h"
#include "canvas/NodeItem.h"
#include "canvas/PaintStates.h"
#include "graph/NodeLayout.h"
#include "graph/TypeStyle.h"
#include "graph/WorkflowGraphModel.h"
#include <QCursor>
#include <qtnodes/ConnectionIdUtils.hpp>
#include <QFontMetricsF>
#include <QKeyEvent>
#include <QPainter>
#include <QScopedValueRollback>
#include <QTextDocument>
#include <algorithm>
#include <cmath>

namespace nodetool::canvas {
using namespace QtNodes;
namespace nm = node_metrics;
namespace {
QSet<NodeId> branchNodeIds(const QSet<NodeId> &selected, const QVector<QPair<NodeId, NodeId>> &edges) {
  if (selected.isEmpty()) { return {}; }
  QHash<NodeId, QVector<NodeId>> incoming;
  QHash<NodeId, QVector<NodeId>> outgoing;
  for (const auto &[source, target] : edges) {
    incoming[target].append(source);
    outgoing[source].append(target);
  }
  auto result = selected;
  for (const auto *adjacency : {&incoming, &outgoing}) {
    QVector<NodeId> queue(selected.cbegin(), selected.cend());
    QSet<NodeId> visited = selected;
    for (int i = 0; i < queue.size(); ++i) {
      for (const auto neighbor : adjacency->value(queue[i])) {
        if (visited.contains(neighbor)) { continue; }
        visited.insert(neighbor);
        result.insert(neighbor);
        queue.append(neighbor);
      }
    }
  }
  return result;
}

// Above every card, a hovered card (z 1) included.
constexpr double kDraftWireZ = 1e6;
constexpr double kGroupZ = -1000000;
} // namespace

EditorCanvasScene::EditorCanvasScene(WorkflowGraphModel &model, QQuickItem &layer, QObject *parent)
    : CanvasScene(model, layer, parent), model_(model), interaction_(model, *this, theme_) {
  animation_.setInterval(16);
  clock_.start();
  connect(&animation_, &QTimer::timeout, this, &EditorCanvasScene::animate);
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &EditorCanvasScene::refreshRuntime);
  connect(&model_, &WorkflowGraphModel::runtimeNodeChanged, this, &EditorCanvasScene::refreshRuntimeNode);
  connect(&model_, &WorkflowGraphModel::runtimeEdgeChanged, this, &EditorCanvasScene::refreshRuntimeEdge);
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, &EditorCanvasScene::resetDraftConnection);
  connect(&model_, &WorkflowGraphModel::modelReset, &interaction_, &CanvasInteraction::modelReset);
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, &EditorCanvasScene::projectionChanged);
  setNodeGeometry(std::make_unique<NodeGeometry>(model));
  // A scene made after the model projected takes the projection's stacking now.
  applyStacking();
  // A wire's highlight follows its end nodes, which do not repaint it themselves.
  connect(this, &CanvasScene::selectionChanged, this, [this] {
    for (auto *wire : connectionItems()) { wire->markDirty(); }
    emit foregroundChanged();
  });
  connect(this, &CanvasScene::selectionChanged, this, &EditorCanvasScene::updateBranchDimming);
  connect(this, &CanvasScene::selectionChanged, &interaction_, &CanvasInteraction::selectionChanged);
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, &EditorCanvasScene::scheduleDimming);
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &EditorCanvasScene::scheduleDimming);
  // The untaken branch of an If or Switch follows edge reports, not node states.
  connect(&model_, &WorkflowGraphModel::runtimeEdgeChanged, this, &EditorCanvasScene::scheduleDimming);
  connect(&model_, &AbstractGraphModel::connectionCreated, this, &EditorCanvasScene::scheduleDimming);
  connect(&model_, &AbstractGraphModel::connectionDeleted, this, &EditorCanvasScene::scheduleDimming);
  connect(&model_, &AbstractGraphModel::nodeCreated, this, &EditorCanvasScene::scheduleDimming);
  connect(&model_, &AbstractGraphModel::modelReset, this, &EditorCanvasScene::scheduleDimming);
  // The foreground names ports and draws group labels, which follow the cards.
  connect(&model_, &AbstractGraphModel::nodePositionUpdated, this, [this] { emit foregroundChanged(); });
  connect(&model_, &AbstractGraphModel::nodeUpdated, this, [this] { emit foregroundChanged(); });
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] { emit foregroundChanged(); });
}

EditorCanvasScene::~EditorCanvasScene() {
  disconnect(this, nullptr, this, nullptr);
  disconnect(&model_, nullptr, this, nullptr);
}

void EditorCanvasScene::animate() {
  phase_ = std::fmod(clock_.elapsed() / 1000.0, 1.0);
  for (auto id : model_.allNodeIds()) {
    // Only the ring and the status text of a running card follow the clock.
    if (auto *node = nodeItem(id); node && model_.runningShown(id)) {
      const auto region = NodePainter::animatedRegion(cardPaintState(*this, model_, cardItem(*node, zoom())));
      if (!region.isEmpty()) { node->markDirty(region); }
    }
    // A flowing wire scrolls its dashes along the whole path. Each wire is
    // listed under both ends, and the outgoing end repaints it.
    for (const auto &edge : model_.allConnectionIds(id)) {
      if (edge.outNodeId != id || !model_.runtimeWireFlowing(edge)) { continue; }
      if (auto *wire = connectionItem(edge)) { wire->markDirty(); }
    }
  }
}

CardItemState EditorCanvasScene::cardItem(const NodeItem &item, double zoom) const {
  return {
      .id = item.nodeId(),
      .bounds = item.boundingRect(),
      .zoom = zoom,
      .selected = item.isSelected(),
      .hovered = item.nodeState().hovered(),
      .headerActionHovered = item.headerActionHovered,
      .footerHovered = item.footerHovered,
  };
}

void EditorCanvasScene::scheduleDimming() {
  if (branchDimmingPending_) { return; }
  branchDimmingPending_ = true;
  QTimer::singleShot(0, this, &EditorCanvasScene::flushDimming);
}

void EditorCanvasScene::flushDimming() {
  branchDimmingPending_ = false;
  updateBranchDimming();
}

void EditorCanvasScene::projectionChanged() {
  interaction_.projectionChanged();
  applyStacking();
}

void EditorCanvasScene::applyStacking() {
  const auto &order = model_.stackingOrder();
  for (auto it = order.cbegin(); it != order.cend(); ++it) {
    const auto id = it.key();
    if (auto *item = nodeItem(id)) {
      item->setProjectedStack(it.value(), model_.isGroup(id) ? kGroupZ + model_.depth(id) : 0);
    }
  }
  for (auto *wire : connectionItems()) {
    const auto visible = model_.wireVisible(wire->connectionId());
    if (!visible) { setSelected(*wire, false); }
    wire->setShown(visible);
  }
}

void EditorCanvasScene::updateBranchDimming() {
  QSet<NodeId> selected;
  for (const auto id : CanvasScene::selectedNodes()) { selected.insert(id); }
  QVector<QPair<NodeId, NodeId>> edges;
  for (const auto id : model_.allNodeIds()) {
    for (const auto &wire : model_.allConnectionIds(id)) {
      // Every wire is listed under both of its nodes. Keep one copy.
      if (wire.outNodeId == id) { edges.append({wire.outNodeId, wire.inNodeId}); }
    }
  }
  const auto branch = branchNodeIds(selected, edges);
  // A handle press selects its card, which the web does not do. The fade waits
  // until the wire drag ends, so the connectable styling stays readable.
  const bool active = !selected.isEmpty() && !interaction_.draftFeedback();
  // The web's not-run fade applies to the untaken side of an If or Switch, and a
  // selection's branch fade wins over it.
  const auto untaken = model_.untakenBranch();
  bool changed = false;
  QSet<NodeId> dimmed;
  for (auto *node : nodeItems()) {
    const bool off = active && !branch.contains(node->nodeId());
    if (off) { dimmed.insert(node->nodeId()); }
    const auto opacity = off ? branchDimmedOpacity
                         : untaken.nodeIds.contains(model_.resourceId(node->nodeId())) ? nm::notRunOpacity
                                                                                       : 1.0;
    if (node->opacity() != opacity) {
      node->setOpacity(opacity);
      changed = true;
    }
  }
  for (auto *wire : connectionItems()) {
    // A wire stays related only while both of its ends are on the branch.
    const auto id = wire->connectionId();
    const bool off = active && !(branch.contains(id.outNodeId) && branch.contains(id.inNodeId));
    const auto opacity = off ? branchDimmedOpacity
                         : untaken.edgeIds.contains(model_.edge(id)["id"].toString()) ? nm::notRunOpacity
                                                                                     : 1.0;
    if (wire->opacity() != opacity) {
      wire->setOpacity(opacity);
      changed = true;
    }
  }
  dimmedNodes_ = dimmed;
  if (changed) {
    emit foregroundChanged();
    emit branchDimmingChanged();
  }
}

void EditorCanvasScene::repaintCards() {
  for (auto *node : nodeItems()) { node->markDirty(); }
  for (auto *wire : connectionItems()) { wire->markDirty(); }
}

void EditorCanvasScene::refreshGroupPointer() {
  for (const auto id : model_.groupIds()) {
    auto *item = nodeItem(id);
    // An Alt-drag keeps its grab even if Alt or child selection goes away.
    if (!item || item == mouseGrabber()) { continue; }
    item->setCanvasButtons(groupTakesPointer(id) ? Qt::AllButtons : Qt::NoButton);
  }
}

void EditorCanvasScene::restoreGroupOrder() {
  for (const auto id : model_.groupIds()) {
    if (auto *item = nodeItem(id)) { item->setStackZ(kGroupZ + model_.depth(id)); }
  }
}

bool EditorCanvasScene::pointer(PointerAction action, const CanvasPointerEvent &event, CanvasMouseEvent &mouse) {
  const QScopedValueRollback dispatch(mouse_, &mouse);
  if (interaction_.pointerEvent(action, event)) { mouse.accept(); }
  return mouse.accepted;
}

void EditorCanvasScene::basePointerEvent(PointerAction action, const CanvasPointerEvent &) {
  if (!mouse_) { return; }
  auto &event = *mouse_;
  switch (action) {
  case PointerAction::Press: deliverPress(event, false); break;
  case PointerAction::DoubleClick: deliverPress(event, true); break;
  case PointerAction::Move: deliverMove(event); break;
  case PointerAction::Release: deliverRelease(event); break;
  }
}

bool EditorCanvasScene::keyPress(QKeyEvent &event) {
  if (interaction_.keyPress(event.key())) { return true; }
  return deliverKey(event);
}

void EditorCanvasScene::keyRelease(QKeyEvent &event) { interaction_.keyRelease(event.key()); }

void EditorCanvasScene::focusOut() { interaction_.focusOut(); }

QList<CanvasHit> EditorCanvasScene::hitsAt(QPointF scenePosition) const {
  QList<CanvasHit> hits;
  for (const auto *item : itemsAt(scenePosition)) {
    CanvasHit hit;
    if (const auto *card = dynamic_cast<const NodeItem *>(item)) {
      hit.node = card->nodeId();
    } else {
      if (const auto *wire = dynamic_cast<const ConnectionItem *>(item)) {
        hit.wire = wire->connectionId();
        hit.draft = wire->connectionState().requiresPort();
      }
      for (auto *parent = item->parentItem(); parent; parent = parent->parentItem()) {
        if (const auto *owner = dynamic_cast<const NodeItem *>(parent)) {
          hit.decorationOwner = owner->nodeId();
          break;
        }
      }
    }
    hits.append(hit);
  }
  return hits;
}

QList<CanvasNodeHit> EditorCanvasScene::nodesFrontToBack() const {
  auto items = nodeItems();
  std::sort(items.begin(), items.end(), [](const NodeItem *a, const NodeItem *b) { return a->z() > b->z(); });
  QList<CanvasNodeHit> nodes;
  nodes.reserve(items.size());
  for (const auto *card : items) {
    if (card->effectivelyShown()) { nodes.append(CanvasNodeHit{card->nodeId(), card->scenePosition(), card->isSelected()}); }
  }
  return nodes;
}

std::optional<CanvasNodeHit> EditorCanvasScene::node(NodeId id) {
  if (const auto *card = nodeItem(id)) { return CanvasNodeHit{id, card->scenePosition(), card->isSelected()}; }
  return std::nullopt;
}

std::optional<CanvasNodeHit> EditorCanvasScene::nodeAtPoint(QPointF scenePosition) {
  if (const auto *card = nodeAt(scenePosition)) {
    return CanvasNodeHit{card->nodeId(), card->scenePosition(), card->isSelected()};
  }
  return std::nullopt;
}

void EditorCanvasScene::selectNode(NodeId id, bool selected) {
  if (auto *card = nodeItem(id)) { card->setSelected(selected); }
}

PortIndex EditorCanvasScene::portAt(NodeId id, PortType side, QPointF local) {
  return nodeGeometry().checkPortHit(id, side, local);
}

QPointF EditorCanvasScene::portPosition(NodeId id, PortType side, PortIndex index) {
  return nodeGeometry().portPosition(id, side, index);
}

NodeId EditorCanvasScene::grabbedNode() const {
  const auto *card = dynamic_cast<const NodeItem *>(mouseGrabber());
  return card ? card->nodeId() : InvalidNodeId;
}

std::optional<ConnectionId> EditorCanvasScene::draftWire() const {
  const auto *wire = dynamic_cast<const ConnectionItem *>(mouseGrabber());
  if (wire && wire->connectionState().requiresPort()) { return wire->connectionId(); }
  return std::nullopt;
}

void EditorCanvasScene::startDraft(ConnectionId id, PortType side, QPointF scenePosition) {
  auto &wire = makeDraftConnection(id);
  wire.setStackZ(kDraftWireZ);
  wire.setEndPoint(side, scenePosition);
}

// Draft move and release are adapted from QtNodes ConnectionGraphicsObject.cpp
// at 829b18457d4e95ac17f4fdb01c6201125681729d, copyright 2022 Dmitry Pinaev,
// BSD-3-Clause.
void EditorCanvasScene::moveDraft(const CanvasPointerEvent &event) {
  auto *wire = dynamic_cast<ConnectionItem *>(mouseGrabber());
  if (!wire || !wire->connectionState().requiresPort()) { return; }
  wire->setStackZ(kDraftWireZ);
  auto &state = wire->connectionState();
  if (auto *card = nodeAt(event.scenePosition)) {
    card->reactToConnection(wire);
    state.setLastHoveredNode(card->nodeId());
  } else {
    state.resetLastHoveredNode();
  }
  // move() keeps the fixed end on its port. The pointer positions the loose end.
  wire->move();
  wire->setEndPoint(state.requiredPort(), event.scenePosition);
}

void EditorCanvasScene::finishDraft(const CanvasPointerEvent &event) {
  auto *wire = dynamic_cast<ConnectionItem *>(mouseGrabber());
  if (!wire || !wire->connectionState().requiresPort()) { return; }
  ungrabMouse(*wire);
  auto *card = nodeAt(event.scenePosition);
  if (card && NodeConnectionInteraction(*card, *wire, *this).tryConnect()) { return; }
  clearDraft();
}

void EditorCanvasScene::setWireVisible(ConnectionId id, bool visible) {
  if (auto *wire = connectionItem(id)) { wire->setShown(visible); }
}

void EditorCanvasScene::repaintNode(NodeId id) {
  if (auto *card = nodeItem(id)) { card->markDirty(); }
}

void EditorCanvasScene::draftFeedbackChanged() {
  updateBranchDimming();
  repaintCards();
}

void EditorCanvasScene::setNodeCursor(NodeId id, std::optional<Qt::CursorShape> cursor) {
  if (auto *card = nodeItem(id)) { card->setPointerCursor(cursor); }
}

void EditorCanvasScene::setViewportCursor(std::optional<Qt::CursorShape> cursor, bool) {
  if (viewCursor) { viewCursor(cursor); }
}

void EditorCanvasScene::setButtonHover(NodeId id, bool footer, bool action, const QString &tooltip) {
  if (auto *card = nodeItem(id)) {
    if (tooltip.isEmpty()) {
      toolTips_.remove(id);
    } else {
      toolTips_.insert(id, tooltip);
    }
    // The interaction reports the hover on every move. Only a change paints.
    if (card->footerHovered == footer && card->headerActionHovered == action) { return; }
    card->footerHovered = footer;
    card->headerActionHovered = action;
    card->markDirty();
  }
}

void EditorCanvasScene::paintNode(QPainter &painter, const NodeItem &item, double zoom) const {
  NodePainter::paint(&painter, cardPaintState(*this, model_, cardItem(item, zoom)));
}

void EditorCanvasScene::paintConnection(QPainter &painter, const ConnectionItem &item, double zoom) const {
  const auto id = item.connectionId();
  auto state = wireGeometry(model_, id, item.endPoint(PortType::Out), item.endPoint(PortType::In),
                            item.connectionState().requiresPort());
  if (!state.visible) { return; }
  const auto nodeSelected = [this](NodeId node) {
    const auto *card = nodeItem(node);
    return card && card->isSelected();
  };
  fillWirePaintState(state, *this, model_, id, item.isSelected(), item.connectionState().hovered(), zoom, nodeSelected);
  WirePainter::paint(&painter, theme_, state);
}

QPainterPath EditorCanvasScene::connectionStroke(const ConnectionItem &item) const {
  return WirePainter::hitStroke(wireGeometry(model_, item.connectionId(), item.endPoint(PortType::Out),
                                             item.endPoint(PortType::In), item.connectionState().requiresPort()));
}

QPainterPath EditorCanvasScene::connectionPath(const ConnectionItem &item) const {
  return WirePainter::path(wireGeometry(model_, item.connectionId(), item.endPoint(PortType::Out),
                                        item.endPoint(PortType::In), item.connectionState().requiresPort()));
}

// The count pill at the middle of the wire can reach any tile it overlaps.
bool EditorCanvasScene::connectionPaintsOffPath(const ConnectionItem &item) const {
  return !item.connectionState().requiresPort() && model_.runtimeEdgeState(item.connectionId())["counter"].toInt() > 1;
}

double EditorCanvasScene::commentContentHeight(const QString &markdown, double cardWidth) const {
  QTextDocument text;
  text.setDefaultFont(canvasFont(theme_, 15, QFont::Normal));
  text.setMarkdown(markdown);
  text.setTextWidth(std::max(1.0, cardWidth - 40));
  return text.size().height() + 32 + 2;
}

void EditorCanvasScene::setReducedMotion(bool reduced) {
  reducedMotion_ = reduced;
  refreshRuntime();
}

void EditorCanvasScene::refreshRuntime() {
  repaintCards();
  updateAnimation(runtimeActive());
}

bool EditorCanvasScene::runtimeActive() const {
  for (auto id : model_.allNodeIds()) {
    if (model_.runningShown(id)) { return true; }
    for (const auto &edge : model_.allConnectionIds(id)) {
      if (model_.runtimeWireFlowing(edge)) { return true; }
    }
  }
  return false;
}

// A changed item that animates starts the timer without a scan. Otherwise only a
// running timer needs the scan, to stop once nothing animates.
void EditorCanvasScene::updateAnimation(bool changedItemActive) {
  if (reducedMotion_ || !model_.runtimeConnected()) {
    animation_.stop();
    phase_ = 0;
  } else if (changedItemActive) {
    if (!animation_.isActive()) { animation_.start(); }
  } else if (animation_.isActive() && !runtimeActive()) {
    animation_.stop();
    phase_ = 0;
  }
}

void EditorCanvasScene::refreshRuntimeNode(NodeId id) {
  if (auto *node = nodeItem(id)) { node->markDirty(); }
  bool active = model_.runningShown(id);
  for (const auto &edge : model_.allConnectionIds(id)) {
    if (auto *wire = connectionItem(edge)) { wire->markDirty(); }
    active = active || model_.runtimeWireFlowing(edge);
  }
  updateAnimation(active);
}

void EditorCanvasScene::refreshRuntimeEdge(ConnectionId id) {
  if (auto *wire = connectionItem(id)) { wire->markDirty(); }
  updateAnimation(model_.runtimeWireFlowing(id));
}

void EditorCanvasScene::setTheme(const CanvasTheme &theme) {
  theme_ = theme;
  repaintCards();
  emit themeChanged();
  emit foregroundChanged();
}

void EditorCanvasScene::paintBackground(QPainter &painter, const QRectF &rect, double zoom) const {
  paintGrid(painter, rect, rect, zoom, theme_.canvas, theme_.grid, axisMarkerColor(theme_.canvas.lightnessF() < .5));
}

// GroupNode.tsx .help-text: a box centered over the group, its bottom edge
// 32 px above the frame, scaled with the canvas like the rest of the group.
void EditorCanvasScene::paintDropHint(QPainter &painter, const QRectF &frame) const {
  const auto heading = QCoreApplication::translate("nodetool::EditorScene", "REMOVE NODES FROM GROUP");
  const QStringList lines{QCoreApplication::translate("nodetool::EditorScene", "Drag out while holding Alt (Option ⌥ on Mac)"),
                          QCoreApplication::translate("nodetool::EditorScene", "Shake rapidly, then drag out")};
  const auto bold = canvasFont(theme_, 13, QFont::DemiBold);
  const auto body = canvasFont(theme_, 13, QFont::Normal);
  const QFontMetricsF boldMetrics(bold), bodyMetrics(body);
  // The list indents its items 8 + 16 px, with a square marker in that space.
  const double indent = 24;
  double width = boldMetrics.horizontalAdvance(heading);
  for (const auto &line : lines) { width = std::max(width, indent + bodyMetrics.horizontalAdvance(line)); }
  const double lineHeight = bodyMetrics.height();
  const QSizeF content(width, boldMetrics.height() + lineHeight * lines.size());
  const QSizeF box(content.width() + 32, content.height() + 24);
  const QRectF rect(frame.center().x() - box.width() / 2, frame.top() - 32 - box.height(), box.width(), box.height());
  painter.save();
  painter.setPen(QPen(theme_.divider, 1));
  painter.setBrush(theme_.node);
  painter.drawRoundedRect(rect, 4, 4);
  painter.setPen(theme_.textPrimary);
  painter.setFont(bold);
  auto y = rect.top() + 12;
  painter.drawText(QRectF(rect.left() + 16, y, content.width(), boldMetrics.height()), Qt::AlignLeft | Qt::AlignVCenter, heading);
  y += boldMetrics.height();
  painter.setFont(body);
  for (const auto &line : lines) {
    const double marker = 4;
    painter.fillRect(QRectF(rect.left() + 16 + indent - 12, y + lineHeight / 2 - marker / 2, marker, marker), theme_.textPrimary);
    painter.drawText(QRectF(rect.left() + 16 + indent, y, content.width() - indent, lineHeight), Qt::AlignLeft | Qt::AlignVCenter, line);
    y += lineHeight;
  }
  painter.restore();
}

QList<EditorCanvasScene::ForegroundPart> EditorCanvasScene::foregroundParts(const QRectF &area, double viewZoom) const {
  const auto zoom = std::clamp(std::abs(viewZoom), 0.08, 8.0);
  const auto labelScale = groupLabelScale(zoom);
  QList<ForegroundPart> parts;
  const auto add = [&](ForegroundPart part, const QRectF &bounds) {
    part.bounds = bounds.translated(-part.origin).adjusted(-2, -2, 2, 2);
    if (bounds.intersects(area)) { parts.append(std::move(part)); }
  };
  for (const auto id : model_.groupIds()) {
    const auto *item = nodeItem(id);
    if (!item) { continue; }
    const auto &layout = model_.layout(id);
    const auto origin = item->scenePosition() + QPointF(0, -5 / zoom);
    const auto width = std::max(24.0, layout.size.width() / labelScale);
    const QRectF rect(0, -32, width, 32);
    add({{ForegroundPart::GroupLabel, id, 0}, rect, origin, layout.title,
         layout.accent.isValid() ? layout.accent : QColor("#9ca3af"), labelScale, item->opacity() * groupOpacity(id)},
        QRectF(origin + rect.topLeft() * labelScale, rect.size() * labelScale));
  }
  if (dropHintVisible()) {
    if (const auto *group = nodeItem(dropGroup())) {
      const QRectF frame(QPointF(), model_.layout(dropGroup()).size);
      const auto origin = group->scenePosition();
      add({{ForegroundPart::DropHint, dropGroup(), 0}, frame, origin, {}, {}},
          QRectF(origin + QPointF(frame.center().x() - 400, -300), QSizeF(800, 300)));
    }
  }
  auto named = CanvasScene::selectedNodes();
  if (hoveredHandle().node != InvalidNodeId && !named.contains(hoveredHandle().node)) { named.append(hoveredHandle().node); }
  for (const auto id : named) {
    const auto *node = nodeItem(id);
    if (!node || model_.isReroute(id)) { continue; }
    const auto &layout = model_.layout(id);
    const auto origin = node->scenePosition();
    for (int i = 0; i < layout.rows.size(); ++i) {
      const auto &row = layout.rows[i];
      if (row.kind != NodeRowKind::Handle) { continue; }
      const QRectF rect(-210, row.y - nm::rowHeight / 2, 200, nm::rowHeight);
      add({{ForegroundPart::InputLabel, id, i}, rect, origin, row.label, typeColor(row.typeName)}, rect.translated(origin));
    }
    const auto outputs = model_.ports(id, PortType::Out);
    for (int i = 0; i < layout.outputY.size(); ++i) {
      if (!model_.portVisible(id, PortType::Out, i) || outputs[i].toObject()["name"] == "__control__") { continue; }
      const QRectF rect(layout.size.width() + 10, layout.outputY[i] - nm::rowHeight / 2, 200, nm::rowHeight);
      add({{ForegroundPart::OutputLabel, id, i}, rect, origin,
           model_.portData<QString>(id, PortType::Out, PortIndex(i), PortRole::Caption),
           typeColor(model_.portData<QString>(id, PortType::Out, PortIndex(i), PortRole::DataType))}, rect.translated(origin));
    }
  }
  std::sort(parts.begin(), parts.end(), [](const auto &a, const auto &b) { return a.key < b.key; });
  return parts;
}

void EditorCanvasScene::paintForegroundPart(QPainter &painter, const ForegroundPart &part) const {
  painter.save();
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::TextAntialiasing);
  const auto kind = std::get<0>(part.key);
  if (kind == ForegroundPart::GroupLabel) {
    painter.setOpacity(painter.opacity() * part.opacity);
    painter.scale(part.labelScale, part.labelScale);
    painter.setFont(canvasFont(theme_, 15, QFont::Medium));
    painter.setPen(part.color);
    painter.drawText(part.rect, Qt::AlignLeft | Qt::AlignVCenter,
                     painter.fontMetrics().elidedText(part.label, Qt::ElideRight, int(part.rect.width())));
  } else if (kind == ForegroundPart::DropHint) {
    paintDropHint(painter, part.rect);
  } else {
    painter.setFont(canvasFont(theme_, nm::fontValue, QFont::DemiBold));
    painter.setPen(part.color);
    const auto alignment = kind == ForegroundPart::InputLabel ? Qt::AlignRight : Qt::AlignLeft;
    painter.drawText(part.rect, alignment | Qt::AlignVCenter, part.label);
  }
  painter.restore();
}

void EditorCanvasScene::paintForeground(QPainter &painter, const QRectF &area, double zoom) const {
  for (const auto &part : foregroundParts(area, zoom)) {
    painter.save();
    painter.translate(part.origin);
    paintForegroundPart(painter, part);
    painter.restore();
  }
}

} // namespace nodetool::canvas
