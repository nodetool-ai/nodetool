#include "EditorScene.h"
#include "NodeLayout.h"
#include "WorkflowGraphModel.h"
#include <QHash>
#include <QJsonDocument>
#include <QPainter>
#include <QPainterPath>
#include <QSvgRenderer>
#include <QtNodes/internal/AbstractConnectionPainter.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/AbstractNodePainter.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <cmath>
#include <QPainterPathStroker>
#include <memory>
using namespace QtNodes;
namespace nodetool {
namespace {
namespace nm = node_metrics;

class NodeGeometry final : public AbstractNodeGeometry {
public:
  explicit NodeGeometry(WorkflowGraphModel &model) : AbstractNodeGeometry(model), model_(model) {}
  QRectF boundingRect(NodeId id) const override {
    const auto margin = nm::handleDiameter / 2 + 2;
    return QRectF(QPointF(0, 0), size(id)).adjusted(-margin, -margin, margin, margin);
  }
  QSize size(NodeId id) const override { return model_.layout(id).size; }
  void recomputeSize(NodeId) const override {}
  QPointF portPosition(NodeId id, PortType type, PortIndex index) const override {
    const auto &layout = model_.layout(id);
    const auto &rows = type == PortType::In ? layout.inputY : layout.outputY;
    const auto y = index < unsigned(rows.size()) ? rows[index] : double(nm::contentTop);
    return {type == PortType::In ? 0.0 : double(layout.size.width()), y};
  }
  QPointF portTextPosition(NodeId id, PortType type, PortIndex index) const override {
    return portPosition(id, type, index);
  }
  QPointF captionPosition(NodeId) const override {
    return {double(nm::borderWidth + nm::padding + nm::titleOffset), double(nm::borderWidth + nm::padding)};
  }
  QRectF captionRect(NodeId id) const override {
    return {captionPosition(id), QSizeF(size(id).width() - 2 * nm::padding - nm::titleOffset, nm::headerHeight)};
  }
  QPointF widgetPosition(NodeId) const override { return {}; }
  QRect resizeHandleRect(NodeId) const override { return {}; }

private:
  WorkflowGraphModel &model_;
};

// The web bundles Inter at 200, 300, 400, and 600, so its CSS weight of 500
// renders with the 400 face. Canvas text uses the face the web displays.
QFont canvasFont(const CanvasTheme &theme, int pixels, QFont::Weight weight) {
  QFont font(theme.sansFamily);
  font.setPixelSize(pixels);
  font.setWeight(weight);
  font.setHintingPreference(QFont::PreferNoHinting);
  return font;
}

void paintIcon(QPainter *painter, const QString &name, const QRectF &rect, QColor color) {
  const auto path = iconPath(name);
  if (path.isEmpty()) { return; }
  const auto svg = QStringLiteral("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"%1\" fill-opacity=\"%2\" d=\"%3\"/></svg>")
                       .arg(color.name()).arg(color.alphaF()).arg(path);
  QSvgRenderer(svg.toUtf8()).render(painter, rect);
}

class NodePainter final : public AbstractNodePainter {
public:
  explicit NodePainter(EditorScene &scene) : scene_(scene) {}
  void paint(QPainter *painter, NodeGraphicsObject &item) const override {
    const auto &theme = scene_.theme();
    const auto &model = static_cast<const WorkflowGraphModel &>(item.graphModel());
    const auto &layout = model.layout(item.nodeId());
    painter->setRenderHint(QPainter::Antialiasing);
    painter->setRenderHint(QPainter::TextAntialiasing);
    const QRectF box(QPointF(0, 0), layout.size);
    if (item.isSelected()) {
      // SHADOW.sm: 0 1px 3px, stacked outlines in place of a blur.
      for (int spread = 3; spread >= 1; --spread) {
        auto shade = theme.selectionShadow;
        shade.setAlphaF(shade.alphaF() / 3.0);
        painter->setPen(Qt::NoPen);
        painter->setBrush(shade);
        painter->drawRoundedRect(box.adjusted(-spread, 1 - spread, spread, 1 + spread), nm::radius + spread, nm::radius + spread);
      }
    }
    painter->setPen(QPen(item.isSelected() ? layout.accent : theme.divider, nm::borderWidth));
    painter->setBrush(theme.node);
    painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);

    const auto inset = double(nm::borderWidth + nm::padding);
    auto iconColor = theme.textSecondary;
    iconColor.setAlphaF(0.65);
    paintIcon(painter, layout.icon, QRectF(inset + 2, inset + 4, 16, 16), iconColor);
    painter->setPen(theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontTitle, QFont::Normal));
    const QRectF title(inset + nm::titleOffset, inset, layout.size.width() - 2 * inset - nm::titleOffset, nm::headerHeight);
    painter->drawText(title, Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(title.width())));

    for (const auto &row : layout.rows) { paintRow(painter, layout, row, inset); }
    paintHandles(painter, model, item.nodeId(), layout);
    const auto runtime = model.runtimeState(item.nodeId());
    if (!runtime.isEmpty()) {
      const QRectF output(inset, box.height() - nm::previewHeight - nm::rowHeight, box.width() - 2 * inset, nm::previewHeight - nm::padding);
      const auto image = model.runtimePreview(item.nodeId());
      if (!image.isNull()) {
        auto target = QRectF(QPointF(), image.size().scaled(output.size().toSize(), Qt::KeepAspectRatio));
        target.moveCenter(output.center());
        painter->drawImage(target, image);
      } else {
        auto outputText = runtime["error"].toString();
        if (outputText.isEmpty()) { outputText = runtime["text"].toString(); }
        if (outputText.isEmpty() && runtime["result"].isObject()) {
          outputText = QString::fromUtf8(QJsonDocument(runtime["result"].toObject()).toJson(QJsonDocument::Compact));
        }
        painter->save();
        painter->setClipRect(output);
        painter->setPen(theme.textSecondary);
        painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
        painter->drawText(output, Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap, outputText.left(4096));
        painter->restore();
      }
      const auto status = runtime["status"].toString();
      const bool running = status == "running" || status == "loading" || status == "queued";
      auto color = status == "error" || status == "failed" ? QColor("#ff5555") : theme.primary;
      if (running) {
        color.setAlphaF(0.6 + 0.4 * std::sin(scene_.animationPhase() * 6.283185));
        painter->setBrush(Qt::NoBrush);
        painter->setPen(QPen(color, 2));
        painter->drawRoundedRect(box.adjusted(1, 1, -1, -1), nm::radius, nm::radius);
      }
      painter->setPen(color);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      auto label = status;
      const auto total = runtime["total"].toDouble();
      if (total > 0) { label += QString(" %1%").arg(int(100 * std::clamp(runtime["progress"].toDouble() / total, 0.0, 1.0))); }
      if (!model.runtimeConnected() && running) { label += " · Disconnected"; }
      painter->drawText(box.adjusted(inset, 0, -inset, -2), Qt::AlignRight | Qt::AlignBottom, label);
    }
  }

private:
  void paintRow(QPainter *painter, const NodeLayout &layout, const NodeRow &row, double inset) const {
    const auto &theme = scene_.theme();
    const auto width = layout.size.width() - 2 * inset;
    if (row.kind == NodeRowKind::Handle) { return; }
    if (row.kind == NodeRowKind::Preview) {
      const QRectF panel(inset, row.y, width, row.height);
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.field);
      painter->drawRoundedRect(panel, nm::fieldRadius, nm::fieldRadius);
      painter->save();
      QPainterPath clip;
      clip.addRoundedRect(panel, nm::fieldRadius, nm::fieldRadius);
      painter->setClipPath(clip, Qt::IntersectClip);
      for (int y = 0; y * 16 < panel.height(); ++y) {
        for (int x = y % 2; x * 16 < panel.width(); x += 2) {
          painter->fillRect(QRectF(panel.x() + x * 16, panel.y() + y * 16, 16, 16), theme.checker);
        }
      }
      painter->restore();
      auto ink = theme.textSecondary;
      ink.setAlphaF(0.65);
      paintIcon(painter, layout.icon, QRectF(panel.center().x() - 9, panel.y() + 20, 18, 18), ink);
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
      painter->drawText(QRectF(panel.x(), panel.y() + 42, panel.width(), 20), Qt::AlignCenter, row.value);
      return;
    }
    if (!row.bare) {
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
      painter->drawText(QRectF(inset, row.y, width, nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter,
                        painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(width)));
    }
    if (row.kind == NodeRowKind::Number) {
      painter->setPen(theme.textPrimary);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      painter->drawText(QRectF(inset, row.y, width, nm::rowHeight), Qt::AlignRight | Qt::AlignVCenter, row.value);
    } else if (row.kind == NodeRowKind::Toggle) {
      const QRectF track(inset + width - 28, row.y + 2, 28, 14);
      painter->setPen(Qt::NoPen);
      painter->setBrush(row.checked ? theme.primary : theme.divider);
      painter->drawRoundedRect(track, 7, 7);
      painter->setBrush(row.checked ? QColor(Qt::white) : theme.textSecondary);
      painter->drawEllipse(QPointF(track.x() + (row.checked ? 21 : 7), track.center().y()), 5, 5);
    } else if (row.kind == NodeRowKind::Field || row.kind == NodeRowKind::Multiline) {
      const QRectF field(inset, row.fieldY, width, row.height);
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.field);
      painter->drawRoundedRect(field, nm::fieldRadius, nm::fieldRadius);
      painter->setPen(row.placeholder ? theme.textSecondary : theme.textPrimary);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      const auto text = field.adjusted(8, row.kind == NodeRowKind::Multiline ? 6 : 0, row.choice ? -24 : -8, row.kind == NodeRowKind::Multiline ? -6 : 0);
      if (row.kind == NodeRowKind::Multiline) {
        painter->drawText(text, Qt::AlignLeft | Qt::AlignTop | Qt::TextWordWrap, row.value);
      } else {
        painter->drawText(text, Qt::AlignLeft | Qt::AlignVCenter,
                          painter->fontMetrics().elidedText(row.value, Qt::ElideRight, int(text.width())));
      }
      if (row.choice) {
        QPainterPath chevron;
        const auto c = QPointF(field.right() - 12, field.center().y());
        chevron.moveTo(c + QPointF(-3, -1.5));
        chevron.lineTo(c + QPointF(0, 1.5));
        chevron.lineTo(c + QPointF(3, -1.5));
        painter->setBrush(Qt::NoBrush);
        painter->setPen(QPen(theme.textSecondary, 1.2));
        painter->drawPath(chevron);
      }
    }
  }
  void paintHandles(QPainter *painter, const WorkflowGraphModel &model, NodeId id, const NodeLayout &layout) const {
    const auto &theme = scene_.theme();
    const auto dot = [&](double x, double y, const QColor &color) {
      // A type-colored dot in a ring of the node's own background.
      painter->setPen(QPen(theme.node, nm::handleRing));
      painter->setBrush(color);
      const auto r = nm::handleDiameter / 2 - nm::handleRing / 2;
      painter->drawEllipse(QPointF(x, y), r, r);
    };
    for (int i = 0; i < layout.inputY.size(); ++i) {
      dot(0, layout.inputY[i], typeColor(model.portData<NodeDataType>(id, PortType::In, PortIndex(i), PortRole::DataType).id));
    }
    for (int i = 0; i < layout.outputY.size(); ++i) {
      dot(layout.size.width(), layout.outputY[i], typeColor(model.portData<NodeDataType>(id, PortType::Out, PortIndex(i), PortRole::DataType).id));
    }
  }
  EditorScene &scene_;
};

QColor withOpacity(QColor color, double opacity) {
  color.setAlphaF(opacity);
  return color;
}

class WirePainter final : public AbstractConnectionPainter {
public:
  WirePainter(EditorScene &scene, WorkflowGraphModel &model) : scene_(scene), model_(model) {}
  void paint(QPainter *painter, ConnectionGraphicsObject const &wire) const override {
    painter->setRenderHint(QPainter::Antialiasing);
    painter->setBrush(Qt::NoBrush);
    const auto path = curve(wire);
    const auto id = wire.connectionId();
    if (wire.connectionState().requiresPort()) {
      const auto source = id.outNodeId != InvalidNodeId;
      const auto type = source ? portColor(id.outNodeId, PortType::Out, id.outPortIndex) : portColor(id.inNodeId, PortType::In, id.inPortIndex);
      painter->setPen(QPen(type, nm::wireWidth, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
      return;
    }
    const auto source = portColor(id.outNodeId, PortType::Out, id.outPortIndex);
    const auto target = portColor(id.inNodeId, PortType::In, id.inPortIndex);
    const auto nodeSelected = [&](NodeId node) {
      const auto object = scene_.nodeGraphicsObject(node);
      return object && object->isSelected();
    };
    const bool selected = wire.isSelected() || nodeSelected(id.outNodeId) || nodeSelected(id.inNodeId);
    if (selected) {
      painter->setPen(QPen(withOpacity(source, nm::wireGlowOpacity), nm::wireGlowWidth, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
    }
    const auto opacity = selected ? 1.0 : nm::wireOpacity;
    QBrush stroke(withOpacity(source, opacity));
    if (source != target) {
      QLinearGradient gradient(path.pointAtPercent(0), path.pointAtPercent(1));
      gradient.setColorAt(0, withOpacity(source, opacity));
      gradient.setColorAt(1, withOpacity(target, opacity));
      stroke = gradient;
    }
    const auto width = wire.connectionState().hovered() ? nm::wireHoverWidth : selected ? nm::wireSelectedWidth : nm::wireWidth;
    painter->setPen(QPen(stroke, width, Qt::SolidLine, Qt::RoundCap));
    painter->drawPath(path);
    const auto active = model_.runtimeState(id.inNodeId)["status"].toString();
    const auto edgeStatus = model_.runtimeEdgeState(id)["status"].toString();
    if ((active == "running" || edgeStatus == "running" || edgeStatus == "active") && model_.runtimeConnected()) {
      painter->setPen(QPen(withOpacity(source, 0.9), nm::wireSelectedWidth, Qt::DashLine, Qt::RoundCap));
      auto pen = painter->pen();
      pen.setDashOffset(-scene_.animationPhase() * 12);
      painter->setPen(pen);
      painter->drawPath(path);
    }
  }
  QPainterPath getPainterStroke(ConnectionGraphicsObject const &wire) const override {
    QPainterPathStroker stroker;
    stroker.setWidth(nm::wireHitWidth);
    return stroker.createStroke(curve(wire));
  }

private:
  static QPainterPath curve(ConnectionGraphicsObject const &wire) {
    return wireCurve(wire.endPoint(PortType::Out), wire.endPoint(PortType::In));
  }
  QColor portColor(NodeId node, PortType type, PortIndex index) const {
    return typeColor(model_.portData<NodeDataType>(node, type, index, PortRole::DataType).id);
  }
  EditorScene &scene_;
  WorkflowGraphModel &model_;
};
} // namespace

QPainterPath wireCurve(const QPointF &out, const QPointF &in) {
  // React Flow's getBezierPath for a right-to-left connection. A long reverse
  // wire stops growing so that it stays inside QtNodes' connection bounds.
  const auto distance = in.x() - out.x();
  const auto offset = distance >= 0 ? 0.5 * distance : std::min(0.25 * 25 * std::sqrt(-distance), nm::wireMaxReverseOffset);
  QPainterPath path(out);
  path.cubicTo(out + QPointF(offset, 0), in - QPointF(offset, 0), in);
  return path;
}

EditorScene::EditorScene(WorkflowGraphModel &model, QObject *parent)
    : BasicGraphicsScene(model, parent), model_(model) {
  animation_.setInterval(33);
  connect(&animation_, &QTimer::timeout, this, [this] {
    phase_ = std::fmod(phase_ + 0.033, 1.0);
    for (auto id : model_.allNodeIds()) {
      const auto status = model_.runtimeState(id)["status"].toString();
      bool activeEdge = false;
      for (const auto &edge : model_.allConnectionIds(id)) {
        const auto state = model_.runtimeEdgeState(edge)["status"].toString();
        activeEdge = activeEdge || state == "active" || state == "running";
      }
      if (status != "running" && status != "loading" && status != "queued" && !activeEdge) { continue; }
      if (auto node = nodeGraphicsObject(id)) { node->update(); }
      for (const auto &edge : model_.allConnectionIds(id)) {
        if (auto wire = connectionGraphicsObject(edge)) { wire->update(); }
      }
    }
  });
  connect(&model_, &WorkflowGraphModel::runtimeChanged, this, &EditorScene::refreshRuntime);
  setNodeGeometry(std::make_unique<NodeGeometry>(model));
  setNodePainter(std::make_unique<NodePainter>(*this));
  setConnectionPainter(std::make_unique<WirePainter>(*this, model));
  // A wire's highlight follows its end nodes, which do not repaint it themselves.
  connect(this, &QGraphicsScene::selectionChanged, this, [this] {
    for (auto item : items()) {
      if (qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) { item->update(); }
    }
  });
}

void EditorScene::setReducedMotion(bool reduced) {
  reducedMotion_ = reduced;
  refreshRuntime();
}
void EditorScene::refreshRuntime() {
  bool active = false;
  for (auto id : model_.allNodeIds()) {
    const auto status = model_.runtimeState(id)["status"].toString();
    active = active || status == "running" || status == "loading" || status == "queued";
    for (const auto &edge : model_.allConnectionIds(id)) {
      const auto edgeStatus = model_.runtimeEdgeState(edge)["status"].toString();
      active = active || edgeStatus == "running" || edgeStatus == "active";
    }
    if (auto node = nodeGraphicsObject(id)) { node->update(); }
    for (const auto &edge : model_.allConnectionIds(id)) {
      if (auto wire = connectionGraphicsObject(edge)) { wire->update(); }
    }
  }
  if (active && !reducedMotion_ && model_.runtimeConnected()) { animation_.start(); }
  else { animation_.stop(); phase_ = 0; }
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
}

void EditorScene::drawForeground(QPainter *painter, const QRectF &) {
  painter->setRenderHint(QPainter::Antialiasing);
  painter->setRenderHint(QPainter::TextAntialiasing);
  for (auto item : items()) {
    // A selected node names its handle-only inputs and its outputs outside the card.
    auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
    if (!node || !node->isSelected()) { continue; }
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
      painter->setPen(typeColor(model_.portData<NodeDataType>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::DataType).id));
      painter->drawText(QRectF(origin.x() + layout.size.width() + 10, origin.y() + layout.outputY[i] - nm::rowHeight / 2, 200, nm::rowHeight),
                        Qt::AlignLeft | Qt::AlignVCenter,
                        model_.portData<QString>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::Caption));
    }
  }
}
} // namespace nodetool
