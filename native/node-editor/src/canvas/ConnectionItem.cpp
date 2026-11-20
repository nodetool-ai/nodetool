// Adapted from QtNodes src/ConnectionGraphicsObject.cpp at commit
// 829b18457d4e95ac17f4fdb01c6201125681729d.
// Copyright (c) 2022, Dmitry Pinaev. All rights reserved.
// BSD-3-Clause, see licenses/QtNodes-BSD-3-Clause.txt.
// Changed: see ConnectionItem.h.
#include "canvas/ConnectionItem.h"

#include "canvas/CanvasScene.h"
#include "graph/NodeLayout.h"
#include "canvas/NodeItem.h"
#include <qtnodes/AbstractGraphModel.hpp>
#include <qtnodes/ConnectionIdUtils.hpp>
#include <qtnodes/AbstractNodeGeometry.hpp>
#include <QPainter>
#include <QQuickWindow>
#include <QSGGeometryNode>
#include <QSGRendererInterface>
#include <QSGVertexColorMaterial>
#include <algorithm>
#include <cmath>
#include <memory>
#include <stdexcept>

namespace nodetool::canvas {
using namespace QtNodes;

ConnectionItem::ConnectionItem(CanvasScene &scene, const ConnectionId &id)
    : CanvasItem(scene, Kind::Connection, &scene.layer()), id_(id), state_(*this) {
  setAcceptsCanvasHover(true);
  // The raster pass shows the item once it is near the view.
  setVisible(false);
  // Below the cards, as QtNodes gives a connection z -1. Later items stack
  // above earlier ones of the same z, as in QGraphicsScene.
  setStackZ(-1);
  initializePosition();
}

ConnectionItem::~ConnectionItem() = default;

void ConnectionItem::initializePosition() {
  // QtNodes moves a draft item onto the attached port and keeps its ends
  // relative to it. This item stays at the scene origin, so both ends start
  // on the attached port.
  if (state_.requiredPort() != PortType::None) {
    const PortType attachedPort = oppositePort(state_.requiredPort());
    const PortIndex portIndex = getPortIndex(attachedPort, id_);
    const NodeId nodeId = getNodeId(attachedPort, id_);
    auto *scene = canvasScene();
    if (auto *node = scene ? scene->nodeItem(nodeId) : nullptr) {
      const auto position = node->scenePosition() + scene->nodeGeometry().portPosition(nodeId, attachedPort, portIndex);
      out_ = position;
      in_ = position;
    }
  }
  move();
  reindex();
}

QRectF ConnectionItem::boundingRect() const {
  const auto points = pointsC1C2();
  // `normalized()` fixes inverted rects.
  const QRectF basicRect = QRectF(out_, in_).normalized();
  const QRectF c1c2Rect = QRectF(points.first, points.second).normalized();
  QRectF commonRect = basicRect.united(c1c2Rect);
  auto *scene = canvasScene();
  const double diam = scene ? node_metrics::wireBoundsMargin : 0;
  const QPointF cornerOffset(diam, diam);
  // Expand rect by port circle diameter.
  commonRect.setTopLeft(commonRect.topLeft() - cornerOffset);
  commonRect.setBottomRight(commonRect.bottomRight() + 2 * cornerOffset);
  return commonRect;
}

QPainterPath ConnectionItem::hitPath() const {
  auto *scene = canvasScene();
  if (!scene) { return {}; }
  // Every change of the wire's paint state marks it dirty, which moves its revision.
  const bool draft = state_.requiresPort();
  if (!hit_.valid || hit_.out != out_ || hit_.in != in_ || hit_.revision != rasterRevision() || hit_.draft != draft) {
    hit_ = {out_, in_, rasterRevision(), draft, true, scene->connectionStroke(*this)};
  }
  return hit_.path;
}

bool ConnectionItem::hitTest(const QPointF &scenePoint) const {
  return boundingRect().contains(scenePoint) && hitPath().contains(scenePoint);
}

const QPointF &ConnectionItem::endPoint(PortType portType) const {
  Q_ASSERT(portType != PortType::None);
  return portType == PortType::Out ? out_ : in_;
}

void ConnectionItem::setEndPoint(PortType portType, const QPointF &point) {
  auto &end = portType == PortType::In ? in_ : out_;
  if (end == point) { return; }
  end = point;
  geometryMoved();
}

void ConnectionItem::move(NodeId moved) {
  auto *scene = canvasScene();
  if (!scene) { return; }
  const auto oldIn = in_;
  const auto oldOut = out_;
  const auto moveEnd = [&](PortType portType) {
    const NodeId nodeId = getNodeId(portType, id_);
    if (nodeId == InvalidNodeId || (moved != InvalidNodeId && nodeId != moved)) { return; }
    if (auto *node = scene->nodeItem(nodeId)) {
      const auto scenePos = node->scenePosition() + scene->nodeGeometry().portPosition(nodeId, portType, getPortIndex(portType, id_));
      (portType == PortType::Out ? out_ : in_) = scenePos;
    }
  };
  moveEnd(PortType::Out);
  moveEnd(PortType::In);
  if (in_ != oldIn || out_ != oldOut) { geometryMoved(); }
}

void ConnectionItem::geometryMoved() {
  reindex();
  markDirty();
}

std::pair<QPointF, QPointF> ConnectionItem::pointsC1C2() const {
  // pointsC1C2Horizontal. The editor's scene is always horizontal.
  const double defaultOffset = 200;
  const double xDistance = in_.x() - out_.x();
  double horizontalOffset = qMin(defaultOffset, std::abs(xDistance));
  double verticalOffset = 0;
  double ratioX = 0.5;
  if (xDistance <= 0) {
    const double yDistance = in_.y() - out_.y() + 20;
    const double vector = yDistance < 0 ? -1.0 : 1.0;
    verticalOffset = qMin(defaultOffset, std::abs(yDistance)) * vector;
    ratioX = 1.0;
  }
  horizontalOffset *= ratioX;
  const QPointF c1(out_.x() + horizontalOffset, out_.y() + verticalOffset);
  const QPointF c2(in_.x() - horizontalOffset, in_.y() - verticalOffset);
  return std::make_pair(c1, c2);
}

bool ConnectionItem::isSelected() const {
  auto *scene = canvasScene();
  return scene && scene->isSelected(*this);
}

void ConnectionItem::paintRaster(QPainter &painter, double zoom) const {
  if (auto *scene = canvasScene()) { scene->paintConnection(painter, *this, zoom); }
}

bool ConnectionItem::mayPaint(const QRectF &area) const {
  auto *scene = canvasScene();
  if (!scene || scene->connectionPaintsOffPath(*this)) { return true; }
  const bool draft = state_.requiresPort();
  if (!path_.valid || path_.out != out_ || path_.in != in_ || path_.revision != rasterRevision() || path_.draft != draft) {
    path_ = {out_, in_, rasterRevision(), draft, true, {}};
    for (const auto &polygon : scene->connectionPath(*this).toSubpathPolygons()) {
      for (qsizetype i = 1; i < polygon.size(); ++i) { path_.segments.append(QRectF(polygon[i - 1], polygon[i]).normalized()); }
    }
  }
  // Strokes, glows and the draft's end dot reach at most 7 from the centre
  // line, and flattening the curve moves it by less than a unit.
  const auto reach = area.adjusted(-8, -8, 8, 8);
  return std::ranges::any_of(path_.segments, [&](const QRectF &segment) {
    return segment.left() <= reach.right() && reach.left() <= segment.right() && segment.top() <= reach.bottom() &&
           reach.top() <= segment.bottom();
  });
}

void ConnectionItem::setStackZ(double z) { setZ(z + indexKey() * 1e-9); }

void ConnectionItem::mousePress(CanvasMouseEvent &event) {
  // QGraphicsItem::mousePressEvent with ItemIsSelectable and ItemIsMovable.
  auto *scene = canvasScene();
  if (!scene || state_.requiresPort()) { return; }
  if (event.button == Qt::LeftButton && !event.modifiers.testFlag(Qt::ControlModifier) && !isSelected()) {
    CanvasScene::SelectionBatch batch(*scene);
    scene->clearSelection();
    scene->setSelected(*this, true);
  }
}

void ConnectionItem::mouseMove(CanvasMouseEvent &event) {
  auto *scene = canvasScene();
  if (!scene) { return; }
  if (auto *node = scene->nodeAt(event.scenePos)) {
    node->reactToConnection(this);
    state_.setLastHoveredNode(node->nodeId());
  } else {
    state_.resetLastHoveredNode();
  }
  if (const auto requiredPort = state_.requiredPort(); requiredPort != PortType::None) {
    setEndPoint(requiredPort, event.scenePos);
  }
  event.accept();
}

void ConnectionItem::mouseRelease(CanvasMouseEvent &event) {
  // QGraphicsItem::mouseReleaseEvent. A settled wire uses Qt's click selection.
  auto *scene = canvasScene();
  if (!scene) { return; }
  if (event.button == Qt::LeftButton && event.scenePos == event.buttonDownScenePos) {
    if (event.modifiers.testFlag(Qt::ControlModifier)) {
      scene->setSelected(*this, !isSelected());
    } else {
      CanvasScene::SelectionBatch batch(*scene);
      scene->clearSelection();
      scene->setSelected(*this, true);
    }
  }
  event.accept();
}

void ConnectionItem::hoverEnter(const CanvasMouseEvent &event) {
  state_.setHovered(true);
  markDirty();
  if (auto *scene = canvasScene()) { emit scene->connectionHovered(id_, event.screenPos); }
}

void ConnectionItem::hoverLeave(const CanvasMouseEvent &) {
  state_.setHovered(false);
  markDirty();
  if (auto *scene = canvasScene()) { emit scene->connectionHoverLeft(id_); }
}

namespace {
// Render thread only. Owned by the scene graph. Embeds its geometry and vertex
// color material so every vector wire shares one material and batches into one
// GPU draw call.
class WireVectorNode final : public QSGGeometryNode {
public:
  struct Key {
    QPointF out, in;
    QRgb sourceColor = 0, targetColor = 0, controlColor = 0;
    double animationPhase = 0;
    double feather = 0;
    bool visible = false, control = false, draft = false, draftFromOutput = false;
    bool selected = false, endpointSelected = false, hovered = false, bypassed = false;
    bool streaming = false, flowing = false, messageSent = false, connecting = false;
    bool animationActive = false, zoomedOut = false;
    bool operator==(const Key &) const = default;
  };

  WireVectorNode() : geometry_(QSGGeometry::defaultAttributes_ColoredPoint2D(), 0, 0, QSGGeometry::UnsignedShortType) {
    geometry_.setDrawingMode(QSGGeometry::DrawTriangles);
    setGeometry(&geometry_);
    setMaterial(&material_);
  }

  void sync(const CanvasTheme &theme, const WirePaintState &state, double feather) {
    const Key next{
        state.out, state.in, state.sourceColor.rgba(), state.targetColor.rgba(), theme.controlWire.rgba(),
        state.animationPhase, feather, state.visible, state.control, state.draft, state.draftFromOutput,
        state.selected, state.endpointSelected, state.hovered, state.bypassed, state.streaming, state.flowing,
        state.messageSent, state.connecting, state.animationActive, state.zoom <= zoomedOutThreshold};
    if (valid_ && key_ == next) { return; }
    key_ = next;
    valid_ = true;
    WirePainter::buildGeometry(geometry_, theme, state, feather);
    markDirty(DirtyGeometry);
  }

private:
  QSGGeometry geometry_;
  QSGVertexColorMaterial material_;
  Key key_{};
  bool valid_ = false;
};
} // namespace

bool ConnectionItem::isVectorPainted() const {
  auto *view = window();
  auto *scene = canvasScene();
  return view && view->rendererInterface()->graphicsApi() != QSGRendererInterface::Software &&
         scene && scene->supportsVectorConnections() && !scene->connectionPaintsOffPath(*this);
}

QSGNode *ConnectionItem::updatePaintNode(QSGNode *old, UpdatePaintNodeData *data) {
  if (!isVectorPainted()) {
    if (old && old->type() == QSGNode::GeometryNodeType) {
      std::unique_ptr<QSGNode> previous(old);
      old = nullptr;
    }
    return CanvasImageItem::updatePaintNode(old, data);
  }
  auto *view = window();
  auto *scene = canvasScene();
  const auto *theme = scene ? scene->vectorTheme() : nullptr;
  const auto state = scene ? scene->connectionPaintState(*this, scene->zoom()) : std::nullopt;
  if (!view || !theme || !state || !state->visible) {
    std::unique_ptr<QSGNode> previous(old);
    return nullptr;
  }
  if (old && old->type() != QSGNode::GeometryNodeType) {
    std::unique_ptr<QSGNode> previous(old);
    old = nullptr;
  }
  auto node = old ? std::unique_ptr<WireVectorNode>(static_cast<WireVectorNode *>(old))
                  : std::make_unique<WireVectorNode>();
  const double zoom = std::max(scene->zoom(), 1e-4);
  const double dpr = std::max(view->effectiveDevicePixelRatio(), 1.0);
  node->sync(*theme, *state, 1.0 / (zoom * dpr));
  return node.release();
}

void ConnectionItem::itemChange(ItemChange change, const ItemChangeData &value) {
  CanvasItem::itemChange(change, value);
  if (change == ItemSceneChange && value.window && isVectorPainted()) { update(); }
}

} // namespace nodetool::canvas
