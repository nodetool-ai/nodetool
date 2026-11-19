#include "canvas/NodeGeometry.h"
#include "canvas/NodePainter.h"
#include "canvas/PaintStates.h"
#include "canvas/WirePainter.h"
#include "EditorScene.h"
#include "NodeLayout.h"
#include "WorkflowGraphModel.h"
#include "CardBodyPainter.h"
#include <QHash>
#include <QGraphicsSceneMouseEvent>
#include <QGraphicsSceneContextMenuEvent>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QFocusEvent>
#include <QScopeGuard>
#include <QScopedValueRollback>
#include <QFontMetricsF>
#include <QPainter>
#include <QTextDocument>
#include <QPainterPath>
#include <QtNodes/internal/AbstractConnectionPainter.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/AbstractNodePainter.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtNodes/internal/NodeConnectionInteraction.hpp>
#include <QtNodes/internal/locateNode.hpp>
#include <QtNodes/ConnectionIdUtils>
#include <QtNodes/internal/StyleCollection.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
#include <cmath>
#include <memory>
using namespace QtNodes;
namespace nodetool {
namespace {
namespace nm = node_metrics;

// Above every card, selected cards (z 1) included.
constexpr double kDraftWireZ = 1e6;

// UI thread only. Projects QtNodes item state into the shared card painter.
class QtNodesCardPainter final : public AbstractNodePainter {
public:
  explicit QtNodesCardPainter(EditorScene &scene) : scene_(scene) {}

  void paint(QPainter *painter, NodeGraphicsObject &item) const override {
    const auto &model = static_cast<const WorkflowGraphModel &>(item.graphModel());
    const canvas::CardItemState card{
        .id = item.nodeId(),
        .bounds = item.boundingRect(),
        .zoom = std::abs(painter->worldTransform().m11()),
        .selected = item.isSelected(),
        .hovered = item.nodeState().hovered(),
        .headerActionHovered = item.property("headerActionHovered").toBool(),
        .footerHovered = item.property("footerHovered").toBool(),
    };
    canvas::NodePainter::paint(painter, canvas::cardPaintState(scene_, model, card));
  }

private:
  EditorScene &scene_;
};

// UI thread only. Projects QtNodes connection state into the shared wire painter.
class QtNodesWirePainter final : public AbstractConnectionPainter {
public:
  QtNodesWirePainter(EditorScene &scene, WorkflowGraphModel &model) : scene_(scene), model_(model) {}

  void paint(QPainter *painter, const ConnectionGraphicsObject &wire) const override {
    auto state = geometry(wire);
    if (!state.visible) { return; }
    const auto nodeSelected = [this](NodeId node) {
      const auto *item = scene_.nodeGraphicsObject(node);
      return item && item->isSelected();
    };
    canvas::fillWirePaintState(state, scene_, model_, wire.connectionId(), wire.isSelected(),
                               wire.connectionState().hovered(), std::abs(painter->worldTransform().m11()),
                               nodeSelected);
    canvas::WirePainter::paint(painter, scene_.theme(), state);
  }

  QPainterPath getPainterStroke(const ConnectionGraphicsObject &wire) const override {
    return canvas::WirePainter::hitStroke(geometry(wire));
  }

private:
  canvas::WirePaintState geometry(const ConnectionGraphicsObject &wire) const {
    return canvas::wireGeometry(model_, wire.connectionId(), wire.endPoint(PortType::Out), wire.endPoint(PortType::In),
                                wire.connectionState().requiresPort());
  }

  EditorScene &scene_;
  WorkflowGraphModel &model_;
};
} // namespace

EditorScene::EditorScene(WorkflowGraphModel &model, QObject *parent)
    : BasicGraphicsScene(model, parent), model_(model), interaction_(model, *this, theme_) {
  connect(&interaction_, &canvas::CanvasInteraction::nodeSelected, this, &EditorScene::nodeSelected);
  connect(&interaction_, &canvas::CanvasInteraction::nodeDragChanged, this, &EditorScene::nodeDragChanged);
  connect(&interaction_, &canvas::CanvasInteraction::headerDoubleClicked, this, &EditorScene::headerDoubleClicked);
  connect(&interaction_, &canvas::CanvasInteraction::outputFormRequested, this, &EditorScene::outputFormRequested);
  connect(&interaction_, &canvas::CanvasInteraction::dynamicPortFormRequested, this, &EditorScene::dynamicPortFormRequested);
  connect(&interaction_, &canvas::CanvasInteraction::dynamicTypeMenuRequested, this, &EditorScene::dynamicTypeMenuRequested);
  connect(&interaction_, &canvas::CanvasInteraction::childOpenRequested, this, &EditorScene::childOpenRequested);
  connect(&interaction_, &canvas::CanvasInteraction::headerActionRequested, this, &EditorScene::headerActionRequested);
  connect(&interaction_, &canvas::CanvasInteraction::canvasContextMenuRequested, this, &EditorScene::canvasContextMenuRequested);
  connect(&interaction_, &canvas::CanvasInteraction::paneDoubleClicked, this, &EditorScene::paneDoubleClicked);
  connect(&interaction_, &canvas::CanvasInteraction::dataEdgeContextMenuRequested, this, &EditorScene::dataEdgeContextMenuRequested);
  connect(&interaction_, &canvas::CanvasInteraction::reconnectRequested, this, &EditorScene::reconnectRequested);
  connect(&interaction_, &canvas::CanvasInteraction::reconnectDiscarded, this, &EditorScene::reconnectDiscarded);
  connect(&interaction_, &canvas::CanvasInteraction::titleEditRequested, this, &EditorScene::titleEditRequested);
  connect(&interaction_, &canvas::CanvasInteraction::inlineEditRequested, this, &EditorScene::inlineEditRequested);
  connect(&interaction_, &canvas::CanvasInteraction::documentOpenRequested, this, &EditorScene::documentOpenRequested);
  connect(&interaction_, &canvas::CanvasInteraction::providerConnectRequested, this, &EditorScene::providerConnectRequested);
  connect(&interaction_, &canvas::CanvasInteraction::errorReportRequested, this, &EditorScene::errorReportRequested);
  connect(&interaction_, &canvas::CanvasInteraction::nodeRunRequested, this, &EditorScene::nodeRunRequested);
  connect(&interaction_, &canvas::CanvasInteraction::inlineExpandRequested, this, &EditorScene::inlineExpandRequested);
  connect(&interaction_, &canvas::CanvasInteraction::sliderDraftChanged, this, &EditorScene::sliderDraftChanged);
  connect(&interaction_, &canvas::CanvasInteraction::looseWireDropped, this, &EditorScene::looseWireDropped);
  connect(&interaction_, &canvas::CanvasInteraction::handleContextMenuRequested, this, &EditorScene::handleContextMenuRequested);
  connect(&interaction_, &canvas::CanvasInteraction::connectionRefused, this, &EditorScene::connectionRefused);
  connect(&interaction_, &canvas::CanvasInteraction::wireBodyDropped, this, &EditorScene::wireBodyDropped);
  animation_.setInterval(16);
  clock_.start();
  connect(&animation_, &QTimer::timeout, this, [this] {
    phase_ = std::fmod(clock_.elapsed() / 1000.0, 1.0);
    for (auto id : model_.allNodeIds()) {
      bool activeEdge = false;
      for (const auto &edge : model_.allConnectionIds(id)) { activeEdge = activeEdge || model_.runtimeWireFlowing(edge); }
      if (!model_.runningShown(id) && !activeEdge) { continue; }
      if (auto node = nodeGraphicsObject(id)) { node->update(); }
      for (const auto &edge : model_.allConnectionIds(id)) {
        if (auto wire = connectionGraphicsObject(edge)) { wire->update(); }
      }
    }
  });
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &EditorScene::refreshRuntime);
  connect(&model_, &WorkflowGraphModel::runtimeNodeChanged, this, &EditorScene::refreshRuntimeNode);
  connect(&model_, &WorkflowGraphModel::runtimeEdgeChanged, this, &EditorScene::refreshRuntimeEdge);
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, &EditorScene::resetDraftConnection);
  // Runs after a reset rebuilds every item and after an incremental projection
  // adds items, so new and reparented frames get their hierarchy order.
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] {
    interaction_.projectionChanged();
    for (const auto id : model_.allNodeIds()) {
      if (auto item = nodeGraphicsObject(id)) { item->setZValue(model_.isGroup(id) ? -1000000 + model_.depth(id) : 0); }
    }
    auto ids = model_.allNodeIds();
    QVector<NodeId> ordered(ids.begin(), ids.end());
    std::sort(ordered.begin(), ordered.end(), [this](NodeId a, NodeId b) {
      const auto *left = nodeGraphicsObject(a);
      const auto *right = nodeGraphicsObject(b);
      if (left && right && left->zValue() != right->zValue()) { return left->zValue() < right->zValue(); }
      return model_.stackingOrder(a) < model_.stackingOrder(b);
    });
    // Move from the back so moving one item cannot undo an earlier pair's order.
    for (qsizetype i = ordered.size() - 1; i > 0; --i) {
      auto *before = nodeGraphicsObject(ordered[i - 1]);
      auto *after = nodeGraphicsObject(ordered[i]);
      if (before && after && before->zValue() == after->zValue()) { before->stackBefore(after); }
    }
    for (auto *item : items()) {
      if (auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) {
        const auto visible = model_.wireVisible(wire->connectionId());
        if (!visible) { wire->setSelected(false); }
        wire->setVisible(visible);
      }
    }
  });
  setNodeGeometry(std::make_unique<canvas::NodeGeometry>(model));
  setNodePainter(std::make_unique<QtNodesCardPainter>(*this));
  setConnectionPainter(std::make_unique<QtNodesWirePainter>(*this, model));
  // A wire's highlight follows its end nodes, which do not repaint it themselves.
  connect(this, &QGraphicsScene::selectionChanged, this, [this] {
    for (auto item : items()) {
      if (qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) { item->update(); }
    }
  });
  // A selection fades every node and wire off the selected branch. Selection
  // changes apply at once. Graph edits apply once after the projection settles.
  connect(this, &QGraphicsScene::selectionChanged, this, &EditorScene::updateBranchDimming);
  connect(this, &QGraphicsScene::selectionChanged, &interaction_, &canvas::CanvasInteraction::selectionChanged);
  const auto scheduleDimming = [this] {
    if (branchDimmingPending_) { return; }
    branchDimmingPending_ = true;
    QTimer::singleShot(0, this, [this] {
      branchDimmingPending_ = false;
      updateBranchDimming();
    });
  };
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, scheduleDimming);
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, scheduleDimming);
  // The untaken branch of an If or Switch follows edge reports, not node states.
  connect(&model_, &WorkflowGraphModel::runtimeEdgeChanged, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::connectionCreated, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::connectionDeleted, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::nodeCreated, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::modelReset, this, scheduleDimming);
}

EditorScene::~EditorScene() {
  setFocusItem(nullptr);
  disconnect(this, nullptr, this, nullptr);
  disconnect(&model_, nullptr, this, nullptr);
}

void EditorScene::clearFocusFrom(const QGraphicsItem &item) {
  // Focus-out can update a cached item. Deliver it while Qt still owns the
  // item's cache so teardown cannot recreate it after freeing it.
  if (const auto *focused = focusItem(); focused && (focused == &item || item.isAncestorOf(focused))) {
    setFocusItem(nullptr);
  }
}

void EditorScene::onNodeDeleted(NodeId id) {
  if (const auto *card = nodeGraphicsObject(id)) { clearFocusFrom(*card); }
  BasicGraphicsScene::onNodeDeleted(id);
}

void EditorScene::onConnectionDeleted(ConnectionId id) {
  if (const auto *wire = connectionGraphicsObject(id)) { clearFocusFrom(*wire); }
  BasicGraphicsScene::onConnectionDeleted(id);
}

void EditorScene::onModelReset() {
  setFocusItem(nullptr);
  BasicGraphicsScene::onModelReset();
}

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

bool EditorScene::branchDimmed(NodeId id) const { return dimmedNodes_.contains(id); }

void EditorScene::updateBranchDimming() {
  // This runs from selectionChanged, which QGraphicsItem also emits while the
  // scene deletes an item from QtNodes' own maps. It therefore walks the scene's
  // item list and never looks an item up in those maps.
  QSet<NodeId> selected;
  for (auto item : selectedItems()) {
    if (const auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item)) { selected.insert(node->nodeId()); }
  }
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
  for (auto item : items()) {
    if (const auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item)) {
      const bool off = active && !branch.contains(node->nodeId());
      if (off) { dimmed.insert(node->nodeId()); }
      const auto opacity = off ? branchDimmedOpacity : untaken.nodeIds.contains(model_.resourceId(node->nodeId())) ? nm::notRunOpacity : 1.0;
      if (node->opacity() != opacity) {
        node->setOpacity(opacity);
        changed = true;
      }
    } else if (const auto wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) {
      // A wire stays related only while both of its ends are on the branch. A
      // wire being dragged has no end yet and is never faded.
      const auto id = wire->connectionId();
      const bool off = active && !wire->connectionState().requiresPort()
          && !(branch.contains(id.outNodeId) && branch.contains(id.inNodeId));
      const auto opacity = off ? branchDimmedOpacity
          : !wire->connectionState().requiresPort() && untaken.edgeIds.contains(model_.edge(id)["id"].toString()) ? nm::notRunOpacity : 1.0;
      if (wire->opacity() != opacity) {
        wire->setOpacity(opacity);
        changed = true;
      }
    }
  }
  dimmedNodes_ = dimmed;
  if (changed) {
    update();
    emit branchDimmingChanged();
  }
}

// Cards paint through a device cache, so each card and wire is invalidated.
void EditorScene::repaintCards() {
    for (auto item : items()) {
        if (qgraphicsitem_cast<NodeGraphicsObject *>(item) || qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) { item->update(); }
    }
}

void EditorScene::refreshGroupPointer() {
  for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id)) { continue; }
    auto *item = nodeGraphicsObject(id);
    // An Alt-drag keeps its grab even if Alt or child selection goes away.
    if (!item || item == mouseGrabberItem()) { continue; }
    item->setAcceptedMouseButtons(groupTakesPointer(id) ? Qt::AllButtons : Qt::NoButton);
  }
}

void EditorScene::restoreGroupOrder() {
  for (const auto id : model_.allNodeIds()) {
    if (model_.isGroup(id)) {
      if (auto item = nodeGraphicsObject(id)) { item->setZValue(-1000000 + model_.depth(id)); }
    }
  }
}

QGraphicsView *EditorScene::eventView(const QWidget *viewport) const {
  for (auto *view : views()) {
    if (!viewport || view == viewport || view->viewport() == viewport) { return view; }
  }
  return nullptr;
}

void EditorScene::dispatchPointer(canvas::PointerAction action, QGraphicsSceneMouseEvent &event) {
  const QScopedValueRollback dispatch(pointerEvent_, &event);
  const auto *view = eventView(event.widget());
  const auto zoom = view ? std::clamp(std::abs(view->transform().m11()), 0.08, 8.0) : 1.0;
  if (interaction_.pointerEvent(action, {event.scenePos(), event.screenPos(), event.button(),
                                        event.buttons(), event.modifiers(), zoom})) {
    event.accept();
  }
}

void EditorScene::mousePressEvent(QGraphicsSceneMouseEvent *event) {
  dispatchPointer(canvas::PointerAction::Press, *event);
}

void EditorScene::mouseMoveEvent(QGraphicsSceneMouseEvent *event) {
  dispatchPointer(canvas::PointerAction::Move, *event);
}

void EditorScene::mouseReleaseEvent(QGraphicsSceneMouseEvent *event) {
  dispatchPointer(canvas::PointerAction::Release, *event);
}

void EditorScene::mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) {
  dispatchPointer(canvas::PointerAction::DoubleClick, *event);
}

void EditorScene::contextMenuEvent(QGraphicsSceneContextMenuEvent *event) {
  interaction_.contextMenu({.scenePosition = event->scenePos(), .screenPosition = event->screenPos(),
                            .modifiers = event->modifiers()});
  event->accept();
}

void EditorScene::keyPressEvent(QKeyEvent *event) {
  if (interaction_.keyPress(event->key())) { event->accept(); }
  else { BasicGraphicsScene::keyPressEvent(event); }
}

void EditorScene::keyReleaseEvent(QKeyEvent *event) {
  interaction_.keyRelease(event->key());
  BasicGraphicsScene::keyReleaseEvent(event);
}

void EditorScene::focusOutEvent(QFocusEvent *event) {
  interaction_.focusOut();
  BasicGraphicsScene::focusOutEvent(event);
}

void EditorScene::basePointerEvent(canvas::PointerAction action, const canvas::CanvasPointerEvent &) {
  using canvas::PointerAction;
  auto &event = *pointerEvent_;
  auto *viewport = event.widget();
  if (action == PointerAction::Move || action == PointerAction::Release) {
    if (auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem())) {
      // A settled wire still uses Qt's click selection. QtNodes expects the
      // view itself when it handles move and release on that wire.
      if (auto *view = eventView(viewport)) {
        event.setWidget(view);
      } else {
        if (action == PointerAction::Release) { wire->ungrabMouse(); }
        event.accept();
        return;
      }
    }
  }
  const auto restoreWidget = qScopeGuard([&event, viewport] { event.setWidget(viewport); });
  switch (action) {
    case PointerAction::Press: BasicGraphicsScene::mousePressEvent(pointerEvent_); break;
    case PointerAction::Move: BasicGraphicsScene::mouseMoveEvent(pointerEvent_); break;
    case PointerAction::Release: BasicGraphicsScene::mouseReleaseEvent(pointerEvent_); break;
    case PointerAction::DoubleClick: BasicGraphicsScene::mouseDoubleClickEvent(pointerEvent_); break;
  }
}

QList<canvas::CanvasHit> EditorScene::hitsAt(QPointF scenePosition) const {
  QList<canvas::CanvasHit> hits;
  for (const auto *item : items(scenePosition, Qt::IntersectsItemShape, Qt::DescendingOrder)) {
    canvas::CanvasHit hit;
    if (const auto *card = qgraphicsitem_cast<const NodeGraphicsObject *>(item)) {
      hit.node = card->nodeId();
    } else {
      if (const auto *wire = qgraphicsitem_cast<const ConnectionGraphicsObject *>(item)) {
        hit.wire = wire->connectionId();
        hit.draft = wire->connectionState().requiresPort();
      }
      for (auto *parent = item->parentItem(); parent; parent = parent->parentItem()) {
        if (const auto *owner = qgraphicsitem_cast<NodeGraphicsObject *>(parent)) {
          hit.decorationOwner = owner->nodeId();
          break;
        }
      }
    }
    hits.append(hit);
  }
  return hits;
}

QList<canvas::CanvasNodeHit> EditorScene::nodesFrontToBack() const {
  QList<canvas::CanvasNodeHit> nodes;
  for (const auto *item : items(Qt::DescendingOrder)) {
    if (const auto *card = qgraphicsitem_cast<const NodeGraphicsObject *>(item)) {
      nodes.append(canvas::CanvasNodeHit{card->nodeId(), card->scenePos(), card->isSelected()});
    }
  }
  return nodes;
}

std::optional<canvas::CanvasNodeHit> EditorScene::node(NodeId id) {
  if (const auto *card = nodeGraphicsObject(id)) {
    return canvas::CanvasNodeHit{id, card->scenePos(), card->isSelected()};
  }
  return std::nullopt;
}

QList<NodeId> EditorScene::selectedNodes() const {
  QList<NodeId> nodes;
  for (const auto *item : selectedItems()) {
    if (const auto *card = qgraphicsitem_cast<const NodeGraphicsObject *>(item)) { nodes.append(card->nodeId()); }
  }
  return nodes;
}

QList<ConnectionId> EditorScene::selectedWires() const {
  QList<ConnectionId> wires;
  for (const auto *item : selectedItems()) {
    if (const auto *wire = qgraphicsitem_cast<const ConnectionGraphicsObject *>(item)) { wires.append(wire->connectionId()); }
  }
  return wires;
}

qsizetype EditorScene::selectionCount() const {
  return selectedItems().size();
}

std::optional<QRectF> EditorScene::rubberBandArea() const {
  for (const auto *view : views()) {
    if (!view->rubberBandRect().isNull()) {
      return view->mapToScene(view->rubberBandRect()).boundingRect();
    }
  }
  return std::nullopt;
}

void EditorScene::selectNode(NodeId id, bool selected) {
  if (auto *card = nodeGraphicsObject(id)) { card->setSelected(selected); }
}

PortIndex EditorScene::portAt(NodeId id, PortType side, QPointF local) {
  return nodeGeometry().checkPortHit(id, side, local);
}

QPointF EditorScene::portPosition(NodeId id, PortType side, PortIndex index) {
  return nodeGeometry().portPosition(id, side, index);
}

NodeId EditorScene::grabbedNode() const {
  const auto *card = qgraphicsitem_cast<NodeGraphicsObject *>(mouseGrabberItem());
  return card ? card->nodeId() : InvalidNodeId;
}

std::optional<ConnectionId> EditorScene::draftWire() const {
  const auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem());
  if (wire && wire->connectionState().requiresPort()) { return wire->connectionId(); }
  return std::nullopt;
}

void EditorScene::startDraft(ConnectionId id, PortType side, QPointF scenePosition) {
  const auto &wire = makeDraftConnection(id);
  wire->setZValue(kDraftWireZ);
  wire->setEndPoint(side, wire->mapFromScene(scenePosition));
}

// Draft move and release are adapted from QtNodes ConnectionGraphicsObject.cpp
// at 829b18457d4e95ac17f4fdb01c6201125681729d, copyright 2022 Dmitry Pinaev,
// BSD-3-Clause. The scene resolves the sending view through its viewport.
void EditorScene::moveDraft(const canvas::CanvasPointerEvent &event) {
  auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem());
  if (!wire || !wire->connectionState().requiresPort()) { return; }
  wire->setZValue(kDraftWireZ);
  auto &state = wire->connectionState();
  const auto *view = eventView(pointerEvent_->widget());
  if (auto *card = locateNodeAt(event.scenePosition, *this, view ? view->transform() : QTransform{})) {
    card->reactToConnection(wire);
    state.setLastHoveredNode(card->nodeId());
  } else {
    state.resetLastHoveredNode();
  }
  // move() notifies the scene of the bounds change and keeps the fixed end
  // on its port. The draft's loose end is positioned by the pointer.
  wire->move();
  wire->setEndPoint(state.requiredPort(), wire->mapFromScene(event.scenePosition));
  wire->update();
}

void EditorScene::finishDraft(const canvas::CanvasPointerEvent &event) {
  auto *wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem());
  if (!wire || !wire->connectionState().requiresPort()) { return; }
  wire->ungrabMouse();
  const auto *view = eventView(pointerEvent_->widget());
  auto *card = locateNodeAt(event.scenePosition, *this, view ? view->transform() : QTransform{});
  if (card && NodeConnectionInteraction(*card, *wire, *this).tryConnect()) { return; }
  clearDraft();
}

bool EditorScene::hasWire(ConnectionId id) {
  return connectionGraphicsObject(id) != nullptr;
}

void EditorScene::setWireVisible(ConnectionId id, bool visible) {
  if (auto *wire = connectionGraphicsObject(id)) { wire->setVisible(visible); }
}

void EditorScene::prepareNodeGeometry(NodeId id) {
  if (auto *card = nodeGraphicsObject(id)) { card->setGeometryChanged(); }
}

void EditorScene::repaintNode(NodeId id) {
  if (auto *card = nodeGraphicsObject(id)) { card->update(); }
}

void EditorScene::draftFeedbackChanged() {
  updateBranchDimming();
  repaintCards();
}

void EditorScene::setNodeCursor(NodeId id, std::optional<Qt::CursorShape> cursor) {
  if (auto *card = nodeGraphicsObject(id)) {
    if (cursor) { card->setCursor(*cursor); }
    else { card->unsetCursor(); }
  }
}

void EditorScene::setViewportCursor(std::optional<Qt::CursorShape> cursor, bool allViewports) {
  const auto apply = [cursor](QWidget &viewport) {
    if (cursor) { viewport.setCursor(*cursor); }
    else { viewport.unsetCursor(); }
  };
  if (allViewports) {
    for (auto *view : views()) { apply(*view->viewport()); }
  } else if (pointerEvent_ && pointerEvent_->widget()) {
    apply(*pointerEvent_->widget());
  }
}

void EditorScene::setButtonHover(NodeId id, bool footer, bool action, const QString &tooltip) {
  if (auto *card = nodeGraphicsObject(id)) {
    card->setProperty("footerHovered", footer);
    card->setProperty("headerActionHovered", action);
    card->setToolTip(tooltip);
    card->update();
  }
}

double EditorScene::commentContentHeight(const QString &markdown, double cardWidth) const {
  QTextDocument text;
  text.setDefaultFont(canvasFont(theme_, 15, QFont::Normal));
  text.setMarkdown(markdown);
  text.setTextWidth(std::max(1.0, cardWidth - 40));
  return text.size().height() + 32 + 2;
}

void EditorScene::setReducedMotion(bool reduced) {
  reducedMotion_ = reduced;
  refreshRuntime();
}
void EditorScene::refreshRuntime() {
  for (auto id : model_.allNodeIds()) {
    if (auto node = nodeGraphicsObject(id)) { node->update(); }
    for (const auto &edge : model_.allConnectionIds(id)) {
      if (auto wire = connectionGraphicsObject(edge)) { wire->update(); }
    }
  }
  updateAnimation(runtimeActive());
}
bool EditorScene::runtimeActive() const {
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
void EditorScene::updateAnimation(bool changedItemActive) {
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
void EditorScene::refreshRuntimeNode(NodeId id) {
  if (auto node = nodeGraphicsObject(id)) { node->update(); }
  bool active = model_.runningShown(id);
  for (const auto &edge : model_.allConnectionIds(id)) {
    if (auto wire = connectionGraphicsObject(edge)) { wire->update(); }
    active = active || model_.runtimeWireFlowing(edge);
  }
  updateAnimation(active);
}
void EditorScene::refreshRuntimeEdge(ConnectionId id) {
  if (auto wire = connectionGraphicsObject(id)) { wire->update(); }
  updateAnimation(model_.runtimeWireFlowing(id));
}

void EditorScene::setTheme(const CanvasTheme &theme) {
  theme_ = theme;
  for (auto item : items()) { item->update(); }
  update();
}

void EditorScene::drawBackground(QPainter *painter, const QRectF &rect) {
  painter->fillRect(rect, theme_.canvas);
  // A cross pattern tied to the scene, as React Flow's Background draws it.
  const auto zoom = painter->worldTransform().m11();
  auto gap = nm::gridGap;
  while (gap * zoom < 12) { gap *= 2; }
  QVector<QLineF> crosses;
  const auto half = nm::gridCross / 2;
  for (auto x = std::floor(rect.left() / gap) * gap; x <= rect.right(); x += gap) {
    for (auto y = std::floor(rect.top() / gap) * gap; y <= rect.bottom(); y += gap) {
      crosses.append({x - half, y, x + half, y});
      crosses.append({x, y - half, x, y + half});
    }
  }
  painter->setRenderHint(QPainter::Antialiasing, false);
  painter->setPen(QPen(theme_.grid, 0));
  painter->drawLines(crosses);
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000 screen
  // pixels right and down, in the palette's c_editor_axis_color.
  const auto axisLength = axisMarkerLength / std::max(std::abs(zoom), 1e-6);
  const QLineF axes[] = {{0, 0, axisLength, 0}, {0, 0, 0, axisLength}};
  painter->setPen(QPen(axisMarkerColor(theme_.canvas.lightnessF() < .5), 0));
  painter->drawLines(axes, 2);
}

// GroupNode.tsx .help-text: a box centered over the group, its bottom edge
// 32 px above the frame, scaled with the canvas like the rest of the group.
void EditorScene::paintDropHint(QPainter *painter, const QRectF &frame) const {
  const auto heading = tr("REMOVE NODES FROM GROUP");
  const QStringList lines{tr("Drag out while holding Alt (Option ⌥ on Mac)"), tr("Shake rapidly, then drag out")};
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
  painter->save();
  painter->setPen(QPen(theme_.divider, 1));
  painter->setBrush(theme_.node);
  painter->drawRoundedRect(rect, 4, 4);
  painter->setPen(theme_.textPrimary);
  painter->setFont(bold);
  auto y = rect.top() + 12;
  painter->drawText(QRectF(rect.left() + 16, y, content.width(), boldMetrics.height()), Qt::AlignLeft | Qt::AlignVCenter, heading);
  y += boldMetrics.height();
  painter->setFont(body);
  for (const auto &line : lines) {
    const double marker = 4;
    painter->fillRect(QRectF(rect.left() + 16 + indent - 12, y + lineHeight / 2 - marker / 2, marker, marker), theme_.textPrimary);
    painter->drawText(QRectF(rect.left() + 16 + indent, y, content.width() - indent, lineHeight), Qt::AlignLeft | Qt::AlignVCenter, line);
    y += lineHeight;
  }
  painter->restore();
}

void EditorScene::drawForeground(QPainter *painter, const QRectF &) {
  painter->setRenderHint(QPainter::Antialiasing);
  painter->setRenderHint(QPainter::TextAntialiasing);
  const auto zoom = std::clamp(std::abs(painter->worldTransform().m11()), 0.08, 8.0);
  const auto labelScale = groupLabelScale(zoom);
  for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id)) { continue; }
    const auto item = nodeGraphicsObject(id);
    if (!item) { continue; }
    const auto &layout = model_.layout(id);
    painter->save();
    // The label is part of the group, so it fades with it.
    painter->setOpacity(painter->opacity() * item->opacity() * groupOpacity(id));
    painter->translate(item->scenePos() + QPointF(0, -5 / zoom));
    painter->scale(labelScale, labelScale);
    painter->setFont(canvasFont(theme_, 15, QFont::Medium));
    painter->setPen(layout.accent.isValid() ? layout.accent : QColor("#9ca3af"));
    const auto width = std::max(24.0, layout.size.width() / labelScale);
    painter->drawText(QRectF(0, -32, width, 32), Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(width)));
    painter->restore();
  }
  if (dropHintVisible()) {
    if (const auto *group = nodeGraphicsObject(dropGroup())) { paintDropHint(painter, QRectF(group->scenePos(), model_.layout(dropGroup()).size)); }
  }
  for (auto item : items()) {
    // A selected node names its handle-only inputs and its outputs outside the card.
    // So does a node while the pointer rests on one of its handles, which the web
    // names in a tooltip (HandleTooltip.tsx); UX study 21 found bare dots unreadable.
    auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
    if (!node || model_.isReroute(node->nodeId())) { continue; }
    if (!node->isSelected() && hoveredHandle().node != node->nodeId()) { continue; }
    const auto &layout = model_.layout(node->nodeId());
    painter->setFont(canvasFont(theme_, nm::fontValue, QFont::DemiBold));
    const auto origin = node->scenePos();
    for (const auto &row : layout.rows) {
      if (row.kind != NodeRowKind::Handle) { continue; }
      painter->setPen(typeColor(row.typeName));
      painter->drawText(QRectF(origin.x() - 210, origin.y() + row.y - nm::rowHeight / 2, 200, nm::rowHeight),
                        Qt::AlignRight | Qt::AlignVCenter, row.label);
    }
    for (int i = 0; i < layout.outputY.size(); ++i) {
      if (!model_.portVisible(node->nodeId(), PortType::Out, i) || model_.ports(node->nodeId(), PortType::Out)[i].toObject()["name"] == "__control__") { continue; }
      painter->setPen(typeColor(model_.portData<NodeDataType>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::DataType).id));
      painter->drawText(QRectF(origin.x() + layout.size.width() + 10, origin.y() + layout.outputY[i] - nm::rowHeight / 2, 200, nm::rowHeight),
                        Qt::AlignLeft | Qt::AlignVCenter,
                        model_.portData<QString>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::Caption));
    }
  }
}
} // namespace nodetool
