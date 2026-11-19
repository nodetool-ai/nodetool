#include "canvas/NodeGeometry.h"

#include "canvas/CanvasStyle.h"
#include "graph/NodeLayout.h"
#include "graph/WorkflowGraphModel.h"
#include <QtNodes/internal/StyleCollection.hpp>
#include <QLineF>

namespace nodetool::canvas {
using namespace QtNodes;
namespace nm = node_metrics;

NodeGeometry::NodeGeometry(WorkflowGraphModel &model) : AbstractNodeGeometry(model), model_(model) {}

QRectF NodeGeometry::boundingRect(NodeId id) const {
  if (const auto &cached = model_.layout(id).bounds) { return *cached; }
  const auto margin = nm::handleDiameter / 2 + 2;
  const bool focused = !model_.focusedNode().isEmpty() && model_.focusedNode() == model_.resourceId(id);
  auto bounds = QRectF(QPointF(0, 0), size(id)).adjusted(-margin, model_.isGroup(id) ? -40 : focused ? -focusBadgeOffset - 1 : -margin, margin, margin);
  for (const auto side : {PortType::In, PortType::Out}) {
    const auto ports = model_.ports(id, side);
    for (int i = 0; i < ports.size(); ++i) {
      if (!model_.portVisible(id, side, i)) { continue; }
      const auto point = portPosition(id, side, i);
      bounds = bounds.united(QRectF(point - QPointF(margin, margin), QSizeF(2 * margin, 2 * margin)));
    }
  }
  model_.layout(id).bounds = bounds;
  return bounds;
}

QSize NodeGeometry::size(NodeId id) const { return model_.layout(id).size; }

QPointF NodeGeometry::portPosition(NodeId id, PortType type, PortIndex index) const {
  const auto &layout = model_.layout(id);
  // The control handle sits at the top center of a card and the bottom center for the controller.
  if (!model_.isGroup(id) && !model_.isComment(id) && type != PortType::None) {
    const auto ports = model_.ports(id, type);
    if (index < unsigned(ports.size()) && ports[index].toObject()["name"] == "__control__") {
      return {layout.size.width() / 2.0, type == PortType::In ? 0.0 : double(layout.size.height())};
    }
  }
  const auto &rows = type == PortType::In ? layout.inputY : layout.outputY;
  const auto y = index < unsigned(rows.size()) ? rows[index] : double(nm::contentTop);
  return {type == PortType::In ? 0.0 : double(layout.size.width()), y};
}

PortIndex NodeGeometry::checkPortHit(NodeId id, PortType side, QPointF point) const {
  if (side == PortType::None) { return InvalidPortIndex; }
  const auto radius = 2 * StyleCollection::nodeStyle().ConnectionPointDiameter;
  const auto card = size(id);
  // Ordinary ports lie on a side edge. Only a control port can hit elsewhere.
  const double edgeX = side == PortType::In ? 0.0 : card.width();
  const QPointF control(card.width() / 2.0, side == PortType::In ? 0.0 : card.height());
  if (qAbs(point.x() - edgeX) >= radius && QLineF(point, control).length() >= radius) { return InvalidPortIndex; }
  const auto ports = model_.ports(id, side);
  for (int i = 0; i < ports.size(); ++i) {
    if (QLineF(portPosition(id, side, i), point).length() < radius && model_.portVisible(id, side, i)) {
      return i;
    }
  }
  return InvalidPortIndex;
}

QPointF NodeGeometry::portTextPosition(NodeId id, PortType type, PortIndex index) const {
  return portPosition(id, type, index);
}

QPointF NodeGeometry::captionPosition(NodeId) const {
  return {double(nm::borderWidth + nm::padding + nm::titleOffset), double(nm::borderWidth + nm::padding)};
}

QRectF NodeGeometry::captionRect(NodeId id) const {
  return {captionPosition(id), QSizeF(size(id).width() - 2 * nm::padding - nm::titleOffset, nm::headerHeight)};
}

} // namespace nodetool::canvas
