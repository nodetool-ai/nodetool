#include "EditorScene.h"
#include "NodeLayout.h"
#include "WorkflowGraphModel.h"
#include <QHash>
#include <QGraphicsSceneMouseEvent>
#include <QGraphicsSceneContextMenuEvent>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QFocusEvent>
#include <QJsonDocument>
#include <QPainter>
#include <QTextDocument>
#include <QAbstractTextDocumentLayout>
#include <QTextCursor>
#include <QPainterPath>
#include <QSvgRenderer>
#include <QtNodes/internal/AbstractConnectionPainter.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/AbstractNodePainter.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtNodes/ConnectionIdUtils>
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
    return QRectF(QPointF(0, 0), size(id)).adjusted(-margin, model_.isGroup(id) ? -40 : -margin, margin, margin);
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

void paintResizeHandle(QPainter *painter, const QSize &size, const QColor &color) {
  painter->save();
  painter->setPen(QPen(color, 1.5, Qt::SolidLine, Qt::RoundCap));
  const auto corner = QPointF(size.width() - 6, size.height() - 6);
  painter->drawLine(corner + QPointF(-8, 0), corner + QPointF(0, -8));
  painter->drawLine(corner + QPointF(-4, 0), corner + QPointF(0, -4));
  painter->restore();
}

class NodePainter final : public AbstractNodePainter {
public:
  explicit NodePainter(EditorScene &scene) : scene_(scene) {}
  void paint(QPainter *painter, NodeGraphicsObject &item) const override {
    const auto &theme = scene_.theme();
    const auto &model = static_cast<const WorkflowGraphModel &>(item.graphModel());
    const auto &layout = model.layout(item.nodeId());
    if (model.isReroute(item.nodeId())) {
      painter->save();painter->setRenderHint(QPainter::Antialiasing);
      const QRectF box(QPointF(),layout.size);
      if (item.isSelected()) {
        auto glow=theme.primary;glow.setAlphaF(0.25);
        painter->setPen(QPen(glow,6));painter->setBrush(Qt::NoBrush);
        painter->drawRoundedRect(box.adjusted(-1,-1,1,1),nm::rerouteHeight/2,nm::rerouteHeight/2);
      }
      auto background=theme.reroutePaper;background.setAlphaF(0.8);
      painter->setBrush(background);
      painter->setPen(QPen(item.isSelected() ? theme.primary : theme.rerouteBorder,nm::borderWidth));
      painter->drawRoundedRect(box.adjusted(0.5,0.5,-0.5,-0.5),nm::rerouteHeight/2,nm::rerouteHeight/2);
      paintHandles(painter,model,item.nodeId(),layout);
      painter->restore();return;
    }
    if (model.isGroup(item.nodeId()) || model.isComment(item.nodeId())) {
      painter->save();
      painter->setRenderHint(QPainter::Antialiasing);
      const bool group = model.isGroup(item.nodeId());
      auto color = layout.accent;
      if (!color.isValid()) { color = group ? QColor("#9ca3af") : theme.canvas; }
      color.setAlphaF(1);
      auto fill = color;
      fill.setAlphaF(group ? 0.35 : 0.5);
      auto border = color;
      border.setAlphaF(item.isSelected() ? 1 : 0.5);
      painter->setBrush(fill);
      const auto zoom = std::clamp(std::abs(painter->worldTransform().m11()), 0.08, 8.0);
      painter->setPen(group || item.isSelected() ? QPen(item.isSelected() ? theme.primary : border, group ? 1 / zoom : 1) : QPen(Qt::NoPen));
      painter->drawRoundedRect(QRectF(QPointF(), layout.size), 4, 4);
      if (group) {
        // The foreground paints the zoom-compensated label outside this item's
        // exposed rectangle, which QtNodes clips before calling the painter.
      } else {
        QTextDocument text;
        text.setDefaultFont(canvasFont(theme, 15, QFont::Normal));
        const auto value = model.comment(item.nodeId());
        if (value.isString()) { text.setMarkdown(value.toString()); }
        else {
          // Lexical stores formatting on leaf text and block kind on parents.
          struct Frame { QJsonObject node; bool closing; };
          QVector<Frame> pending{{value.toObject()["root"].toObject(), false}};
          QString html;
          while (!pending.isEmpty()) {
            const auto frame = pending.takeLast();
            const auto node = frame.node;
            const auto type = node["type"].toString();
            auto tag = type == "paragraph" ? QString("p") : type == "quote" ? QString("blockquote") : type == "listitem" ? QString("li") : type == "list" ? node["tag"].toString("ul") : type == "heading" ? node["tag"].toString("h2") : QString{};
            if (tag != "p" && tag != "blockquote" && tag != "li" && tag != "ul" && tag != "ol" && tag != "h1" && tag != "h2" && tag != "h3" && tag != "h4" && tag != "h5" && tag != "h6") { tag.clear(); }
            if (frame.closing) { if (!tag.isEmpty()) { html += "</" + tag + ">"; } continue; }
            if (!tag.isEmpty()) { html += "<" + tag + ">"; pending.append({node, true}); }
            if (type == "linebreak") { html += "<br>"; }
            auto leaf = node["text"].toString().toHtmlEscaped();
            const auto format = node["format"].toInt();
            if (format & 1) { leaf = "<b>" + leaf + "</b>"; }
            if (format & 2) { leaf = "<i>" + leaf + "</i>"; }
            if (format & 8) { leaf = "<u>" + leaf + "</u>"; }
            if (format & 4) { leaf = "<s>" + leaf + "</s>"; }
            if (format & 16) { leaf = "<code>" + leaf + "</code>"; }
            html += leaf;
            const auto children = node["children"].toArray();
            for (auto i = children.size(); i > 0; --i) { pending.append({children[i - 1].toObject(), false}); }
          }
          text.setHtml(html);
        }
        const auto ink = layout.accent.isValid() ? ((0.299 * color.red() + 0.587 * color.green() + 0.114 * color.blue()) > 127.5 ? QColor(Qt::black) : QColor(Qt::white)) : theme.textPrimary;
        text.setDefaultStyleSheet("body { color: " + ink.name() + "; }");
        text.setTextWidth(std::max(1, layout.size.width() - 40));
        painter->translate(8, 16);
        painter->setClipRect(QRectF(0, 0, layout.size.width() - 40, layout.size.height() - 32));
        QAbstractTextDocumentLayout::PaintContext context;
        context.palette.setColor(QPalette::Text, ink);
        text.documentLayout()->draw(painter, context);
      }
      painter->restore();
      if (!model.readOnly()) { paintResizeHandle(painter, layout.size, theme.textSecondary); }
      return;
    }
    const bool disabled = model.bypassed(item.nodeId());
    painter->save();
    if (disabled) { painter->setOpacity(painter->opacity() * nm::disabledOpacity); }
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
    painter->setPen(QPen(item.isSelected() ? layout.accent : theme.divider, nm::borderWidth, disabled ? Qt::DashLine : Qt::SolidLine));
    painter->setBrush(theme.node);
    painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);

    const auto inset = double(nm::borderWidth + nm::padding);
    auto iconColor = theme.textSecondary;
    iconColor.setAlphaF(0.65);
    paintIcon(painter, layout.icon, QRectF(inset + 2, inset + 4, 16, 16), iconColor);
    painter->setPen(theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontTitle, QFont::Normal));
    const QRectF title(inset + nm::titleOffset, inset, layout.size.width() - 2 * inset - nm::titleOffset - (disabled ? nm::disabledBadgeWidth : 0), nm::headerHeight);
    painter->drawText(title, Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(title.width())));

    if (disabled) {
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      painter->drawText(QRectF(box.width() - inset - nm::disabledBadgeWidth, inset, nm::disabledBadgeWidth, nm::headerHeight), Qt::AlignRight | Qt::AlignVCenter, QStringLiteral("Disabled"));
    }
    for (const auto &row : layout.rows) { paintRow(painter, layout, row, inset); }
    paintHandles(painter, model, item.nodeId(), layout);
    const auto runtime = model.runtimeState(item.nodeId());
    if (!runtime.isEmpty()) {
      const auto playback = model.canvasPlaybackRect(item.nodeId());
      const auto output = playback.isEmpty()
          ? QRectF(inset, box.height() - nm::previewHeight - nm::rowHeight, box.width() - 2 * inset, nm::previewHeight - nm::padding)
          : playback;
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
      const bool running = !disabled && (status == "running" || status == "loading" || status == "queued");
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
    if (!model.readOnly()) { paintResizeHandle(painter, layout.size, theme.textSecondary); }
    painter->restore();
  }

private:
  void paintRow(QPainter *painter, const NodeLayout &layout, const NodeRow &row, double inset) const {
    const auto &theme = scene_.theme();
    const auto width = layout.size.width() - 2 * inset;
    if (row.conditionalUnavailable) {
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      const auto top = row.y + nm::rowHeight;
      painter->drawText(QRectF(inset, top, width, nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter,
          painter->fontMetrics().elidedText(QObject::tr("Unavailable for the selected settings"), Qt::ElideRight, int(width)));
    }
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
      dot(0, layout.inputY[i], typeColor(model.isReroute(id) ? model.rerouteHandleType(id) : model.portData<NodeDataType>(id, PortType::In, PortIndex(i), PortRole::DataType).id));
    }
    for (int i = 0; i < layout.outputY.size(); ++i) {
      dot(layout.size.width(), layout.outputY[i], typeColor(model.isReroute(id) ? model.rerouteHandleType(id) : model.portData<NodeDataType>(id, PortType::Out, PortIndex(i), PortRole::DataType).id));
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
    const bool disabled = model_.bypassed(id.outNodeId) || model_.bypassed(id.inNodeId);
    const auto source = model_.wirePortColor(id, PortType::Out);
    const auto target = model_.wirePortColor(id, PortType::In);
    const auto nodeSelected = [&](NodeId node) {
      const auto object = scene_.nodeGraphicsObject(node);
      return object && object->isSelected();
    };
    const bool selected = wire.isSelected() || nodeSelected(id.outNodeId) || nodeSelected(id.inNodeId);
    if (selected && !disabled) {
      painter->setPen(QPen(withOpacity(source, nm::wireGlowOpacity), nm::wireGlowWidth, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
    }
    const auto opacity = (selected ? 1.0 : nm::wireOpacity) * (disabled ? nm::disabledWireOpacity : 1.0);
    QBrush stroke(withOpacity(source, opacity));
    if (source != target) {
      QLinearGradient gradient(path.pointAtPercent(0), path.pointAtPercent(1));
      gradient.setColorAt(0, withOpacity(source, opacity));
      gradient.setColorAt(1, withOpacity(target, opacity));
      stroke = gradient;
    }
    const auto width = wire.connectionState().hovered() ? nm::wireHoverWidth : selected ? nm::wireSelectedWidth : nm::wireWidth;
    painter->setPen(QPen(stroke, width, disabled ? Qt::DashLine : Qt::SolidLine, Qt::RoundCap));
    painter->drawPath(path);
    const auto active = model_.runtimeState(id.inNodeId)["status"].toString();
    const auto edgeStatus = model_.runtimeEdgeState(id)["status"].toString();
    if (!disabled && (active == "running" || edgeStatus == "running" || edgeStatus == "active") && model_.runtimeConnected()) {
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

double groupLabelScale(double zoom) {
  const auto z = std::clamp(zoom, 0.08, 8.0);
  return z < 1 ? 1 / z : std::pow(1 / z, 0.8);
}

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
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, &EditorScene::resetDraftConnection);
  connect(&model_, &WorkflowGraphModel::modelReset, this, [this] {
    gesture_ = Gesture::None;
    gesturePositions_.clear();
    for (const auto view : views()) { view->viewport()->unsetCursor(); }
    for (const auto id : model_.allNodeIds()) {
      if (auto item = nodeGraphicsObject(id)) { item->setZValue(model_.isGroup(id) ? -1000000 + model_.depth(id) : 0); }
    }
  });
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

double EditorScene::eventZoom(const QGraphicsSceneMouseEvent *event) const {
  for (const auto view : views()) {
    if (!event->widget() || view->viewport() == event->widget()) {
      return std::clamp(std::abs(view->transform().m11()), 0.08, 8.0);
    }
  }
  return 1;
}

QRectF EditorScene::groupLabelRect(NodeId id, double zoom) {
  const auto item = nodeGraphicsObject(id);
  if (!item || !model_.isGroup(id)) { return {}; }
  const auto scale = groupLabelScale(zoom);
  const auto &layout = model_.layout(id);
  return QRectF(item->scenePos() + QPointF(0, -5 / zoom - 32 * scale),
                QSizeF(std::max(24.0 * scale, double(layout.size.width())), 32 * scale));
}

void EditorScene::restoreGroupOrder() {
  for (const auto id : model_.allNodeIds()) {
    if (model_.isGroup(id)) {
      if (auto item = nodeGraphicsObject(id)) { item->setZValue(-1000000 + model_.depth(id)); }
    }
  }
}

void EditorScene::contextMenuEvent(QGraphicsSceneContextMenuEvent *event) {
  if (!model_.readOnly()) {
    for (auto *item:items(event->scenePos(),Qt::IntersectsItemShape,Qt::DescendingOrder)) {
      // A card covering a wire owns the pointer, just as the web node layer does.
      if (qgraphicsitem_cast<NodeGraphicsObject *>(item)) { break; }
      auto *wire=qgraphicsitem_cast<ConnectionGraphicsObject *>(item);
      if (!wire || wire->connectionState().requiresPort()) { continue; }
      const auto edge=model_.edge(wire->connectionId());
      const auto data=edge["data"].toObject();
      if (edge["sourceHandle"]=="__control__" || edge["targetHandle"]=="__control__" || edge["type"]=="control" || edge["edge_type"]=="control" || data["edge_type"]=="control" || edge["type"]=="lineage" || edge["edge_type"]=="lineage" || data["edge_type"]=="lineage" || edge["id"].toString().isEmpty()) { break; }
      emit dataEdgeContextMenuRequested(edge["id"].toString(),event->scenePos(),event->screenPos());
      event->accept();return;
    }
  }
  for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
    for (auto *parent = item; parent; parent = parent->parentItem()) {
      if (auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(parent)) {
        emit canvasContextMenuRequested(model_.resourceId(node->nodeId()), event->screenPos()); event->accept(); return;
      }
    }
  }
  emit canvasContextMenuRequested({}, event->screenPos()); event->accept();
}
void EditorScene::mouseDoubleClickEvent(QGraphicsSceneMouseEvent *event) {
  if (!model_.readOnly() && event->button() == Qt::LeftButton) {
    for (auto *item:items(event->scenePos(),Qt::IntersectsItemShape,Qt::DescendingOrder)) {
      auto *node=qgraphicsitem_cast<NodeGraphicsObject *>(item);
      if (!node) { continue; }
      if (!model_.isReroute(node->nodeId())) { break; }
      if (!QRectF(node->scenePos(),model_.layout(node->nodeId()).size).contains(event->scenePos())) { break; }
      cancelGesture();clearSelection();node->setSelected(true);emit nodeSelected(node->nodeId());
      emit titleEditRequested(node->nodeId());event->accept();return;
    }

    NodeId target = InvalidNodeId;
    for (const auto id : model_.allNodeIds()) {
      if (model_.isGroup(id) && groupLabelRect(id, eventZoom(event)).contains(event->scenePos()) &&
          (target == InvalidNodeId || model_.depth(id) > model_.depth(target))) target = id;
    }
    if (target != InvalidNodeId) {
      cancelGesture();
      clearSelection();
      if (auto *item = nodeGraphicsObject(target)) item->setSelected(true);
      emit nodeSelected(target);
      emit titleEditRequested(target);
      event->accept();
      return;
    }
  }
  BasicGraphicsScene::mouseDoubleClickEvent(event);
}

void EditorScene::resetDraftConnection() {
  BasicGraphicsScene::resetDraftConnection();
  if (auto wire = qobject_cast<ConnectionGraphicsObject *>(reconnectWire_.data())) { wire->show(); }
  reconnectWire_.clear();
  reconnectEdge_ = {};
  reconnectSide_ = PortType::None;
  wireReconnect_ = false;
}
bool EditorScene::beginReconnect(ConnectionId connection, PortType side) {
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
  auto wire = connectionGraphicsObject(connection);
  if (original.isEmpty() || !wire) { return false; }
  resetDraftConnection();
  reconnectEdge_ = original;
  reconnectSide_ = side;
  reconnectWire_ = wire;
  wireReconnect_ = true;
  wire->hide();
  const auto node = side == PortType::In ? connection.inNodeId : connection.outNodeId;
  const auto port = side == PortType::In ? connection.inPortIndex : connection.outPortIndex;
  auto item = nodeGraphicsObject(node);
  const auto point = item->mapToScene(nodeGeometry().portPosition(node, side, port));
  const auto &draft = makeDraftConnection(makeIncompleteConnectionId(connection, side));
  draft->setEndPoint(side, draft->mapFromScene(point));
  return true;
}

void EditorScene::mousePressEvent(QGraphicsSceneMouseEvent *event) {
  inlinePress_ = false;
  resetDraftConnection();
  restoreGroupOrder();
  if (model_.readOnly() || event->button() != Qt::LeftButton) {
    BasicGraphicsScene::mousePressEvent(event);
    restoreGroupOrder();
    return;
  }
  const auto zoom = eventZoom(event);
  const auto point = event->scenePos();
  // A selected wire exposes both endpoints, including an output shared by many wires.
  for (auto item : selectedItems()) {
    auto wire = qgraphicsitem_cast<ConnectionGraphicsObject *>(item);
    if (!wire) { continue; }
    const auto connection = wire->connectionId();
    for (const auto side : {PortType::In, PortType::Out}) {
      const auto id = side == PortType::In ? connection.inNodeId : connection.outNodeId;
      const auto port = side == PortType::In ? connection.inPortIndex : connection.outPortIndex;
      auto node = nodeGraphicsObject(id);
      if (node && QLineF(point, node->mapToScene(nodeGeometry().portPosition(id, side, port))).length() <= nm::handleDiameter / 2 + nm::handleRing / 2 && beginReconnect(connection, side)) {
        event->accept();
        return;
      }
    }
  }
  NodeId target = InvalidNodeId;
  Qt::Edges edges;
  bool label = false;
  // QtNodes temporarily raises hovered groups. Hit order follows hierarchy,
  // including when hover events arrive between restoring z and a mouse press.
  QVector<NodeGraphicsObject *> candidates;
  for (auto item : items(Qt::DescendingOrder)) {
    if (auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item)) { candidates.append(node); }
  }
  std::stable_sort(candidates.begin(), candidates.end(), [this](const auto a, const auto b) {
    const auto ag = model_.isGroup(a->nodeId()), bg = model_.isGroup(b->nodeId());
    if (ag != bg) { return !ag; }
    return ag && model_.depth(a->nodeId()) > model_.depth(b->nodeId());
  });
  for (const auto node : candidates) {
    const auto id = node->nodeId();
    const auto &layout = model_.layout(id);
    const QRectF bounds(node->scenePos(), layout.size);
    // A selected card's port sits on its resize edge. Let QtNodes start the
    // wire before considering edge/corner resizing or inline controls.
    for (const auto port : {PortType::In, PortType::Out}) {
      const auto index = nodeGeometry().checkPortHit(id, port, node->mapFromScene(point));
      if (index == InvalidPortIndex || QLineF(nodeGeometry().portPosition(id, port, index), node->mapFromScene(point)).length() > nm::handleDiameter / 2 + nm::handleRing / 2) { continue; }
      const auto connected = model_.connections(id, port, index);
      if (port == PortType::In && !connected.empty() && beginReconnect(*connected.begin(), port)) {
        event->accept();
        return;
      }
      BasicGraphicsScene::mousePressEvent(event);
      restoreGroupOrder();
      return;
    }
    if (model_.isReroute(id)) {
      if (bounds.contains(point)) { BasicGraphicsScene::mousePressEvent(event);return; }
      continue;
    }
    const auto handle = QRectF(bounds.bottomRight() - QPointF(25, 25), QSizeF(25, 25));
    if (handle.contains(point)) {
      target = id;
      edges = Qt::RightEdge | Qt::BottomEdge;
      break;
    }
    for (const auto &row : layout.rows) {
      if (row.propertyName.isEmpty()) { continue; }
      const auto rect = model_.inlineFieldRect(id, row.propertyName).translated(node->scenePos());
      if (!rect.contains(point) || model_.inlineDescriptor(id, row.propertyName).isEmpty()) { continue; }
      const auto name = row.propertyName;
      if (!node->isSelected() || selectedItems().size() != 1) { clearSelection(); node->setSelected(true); }
      inlinePress_ = true;
      emit nodeSelected(id);
      emit inlineEditRequested(id, name);
      event->accept();
      return;
    }
    if (node->isSelected()) {
      const auto hit = 5 / zoom;
      if (bounds.adjusted(-hit, -hit, hit, hit).contains(point)) {
        if (std::abs(point.x() - bounds.left()) <= hit) { edges |= Qt::LeftEdge; }
        if (std::abs(point.x() - bounds.right()) <= hit) { edges |= Qt::RightEdge; }
        if (std::abs(point.y() - bounds.top()) <= hit) { edges |= Qt::TopEdge; }
        if (std::abs(point.y() - bounds.bottom()) <= hit) { edges |= Qt::BottomEdge; }
        if (edges != Qt::Edges{}) { target = id; break; }
      }
    }
    if (model_.isGroup(id) && groupLabelRect(id, zoom).contains(point)) {
      target = id;
      label = true;
      break;
    }
    // Do not resize a frame behind another card's body.
    if (bounds.contains(point)) { break; }
  }
  if (target == InvalidNodeId) {
    BasicGraphicsScene::mousePressEvent(event);
    restoreGroupOrder();
    return;
  }
  auto item = nodeGraphicsObject(target);
  if (!item->isSelected() && !(event->modifiers() & Qt::ControlModifier)) { clearSelection(); }
  item->setSelected(true);
  emit nodeSelected(target);
  gesture_ = label ? Gesture::Label : Gesture::Resize;
  gestureNode_ = target;
  if (event->widget()) {
    const auto cursor = label ? Qt::ClosedHandCursor : edges == (Qt::LeftEdge | Qt::TopEdge) || edges == (Qt::RightEdge | Qt::BottomEdge) ? Qt::SizeFDiagCursor : edges == (Qt::RightEdge | Qt::TopEdge) || edges == (Qt::LeftEdge | Qt::BottomEdge) ? Qt::SizeBDiagCursor : edges & (Qt::LeftEdge | Qt::RightEdge) ? Qt::SizeHorCursor : Qt::SizeVerCursor;
    event->widget()->setCursor(cursor);
  }
  gestureOrigin_ = point;
  gestureBounds_ = QRectF(item->scenePos(), model_.layout(target).size);
  gestureUi_ = model_.uiProperties(target);
  resizeEdges_ = edges;
  minimumSize_ = model_.layout(target).minimumSize;
  // Web edge controls use a 200px minimum; its corner control permits 150px.
  if (!model_.isGroup(target) && !model_.isComment(target) && edges != (Qt::RightEdge | Qt::BottomEdge)) { minimumSize_.setWidth(200); }
  gestureSelected_.clear();
  gesturePositions_.clear();
  for (const auto id : model_.allNodeIds()) {
    gesturePositions_[id] = model_.nodeData(id, NodeRole::Position).toPointF();
    if (auto selected = nodeGraphicsObject(id); selected && selected->isSelected()) { gestureSelected_.append(id); }
  }
  event->accept();
  restoreGroupOrder();
}

void EditorScene::mouseMoveEvent(QGraphicsSceneMouseEvent *event) {
  QHash<NodeId, QPointF> before;
  for (const auto id : model_.allNodeIds()) { before[id] = model_.nodeData(id, NodeRole::Position).toPointF(); }
  if (gesture_ == Gesture::Label) {
    const auto delta = event->scenePos() - gestureOrigin_;
    for (const auto id : gestureSelected_) {
      model_.setNodeData(id, NodeRole::Position, gesturePositions_.value(id) + delta);
    }
    model_.moveDescendants(before);
    event->accept();
  } else if (gesture_ == Gesture::Resize) {
    const auto delta = event->scenePos() - gestureOrigin_;
    auto bounds = gestureBounds_;
    const auto maximumWidth = model_.isGroup(gestureNode_) ? 10000000.0 : 800.0;
    if (resizeEdges_ & Qt::RightEdge) { bounds.setRight(bounds.left() + std::clamp(gestureBounds_.width() + delta.x(), double(minimumSize_.width()), maximumWidth)); }
    if (resizeEdges_ & Qt::BottomEdge) { bounds.setBottom(bounds.top() + std::max(double(minimumSize_.height()), gestureBounds_.height() + delta.y())); }
    if (resizeEdges_ & Qt::LeftEdge) { bounds.setLeft(bounds.right() - std::clamp(gestureBounds_.width() - delta.x(), double(minimumSize_.width()), maximumWidth)); }
    if (resizeEdges_ & Qt::TopEdge) { bounds.setTop(bounds.bottom() - std::max(double(minimumSize_.height()), gestureBounds_.height() - delta.y())); }
    if (auto item = nodeGraphicsObject(gestureNode_)) { item->setGeometryChanged(); }
    model_.setNodeData(gestureNode_, NodeRole::Size, bounds.size().toSize());
    model_.setNodeData(gestureNode_, NodeRole::Position, bounds.topLeft());
    // Changing a frame's bounds does not move its children on the canvas.
    event->accept();
  } else {
    BasicGraphicsScene::mouseMoveEvent(event);
    model_.moveDescendants(before);
  }
  restoreGroupOrder();
}

void EditorScene::mouseReleaseEvent(QGraphicsSceneMouseEvent *event) {
  if (!reconnectEdge_.isEmpty() && event->button() == Qt::LeftButton) {
    const auto id = reconnectingEdgeId();
    auto connection = reconnectEdge_;
    bool hit = false;
    for (auto item : items(event->scenePos())) {
      auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
      if (!node) { continue; }
      const auto port = nodeGeometry().checkPortHit(node->nodeId(), reconnectSide_, node->mapFromScene(event->scenePos()));
      if (port == InvalidPortIndex || QLineF(nodeGeometry().portPosition(node->nodeId(), reconnectSide_, port), node->mapFromScene(event->scenePos())).length() > nm::handleDiameter / 2 + nm::handleRing / 2) { continue; }
      const auto source = reconnectSide_ == PortType::Out;
      connection[source ? "source" : "target"] = model_.resourceId(node->nodeId());
      connection[source ? "sourceHandle" : "targetHandle"] = model_.ports(node->nodeId(), reconnectSide_)[int(port)].toObject()["name"];
      hit = true;
      break;
    }
    const bool valid = hit && model_.validateConnection && model_.validateConnection(connection);
    resetDraftConnection();
    event->accept();
    if (valid) { emit reconnectRequested(id, connection); }
    else { emit reconnectDiscarded(id); }
    return;
  }
  auto draft = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem());
  if (!model_.readOnly() && !wireReconnect_ && event->button() == Qt::LeftButton && draft && draft->connectionState().requiresPort()) {
    const auto connection = draft->connectionId();
    const auto port = connection.outNodeId == InvalidNodeId ? PortType::In : PortType::Out;
    const auto node = port == PortType::Out ? connection.outNodeId : connection.inNodeId;
    const auto index = port == PortType::Out ? connection.outPortIndex : connection.inPortIndex;
    const auto origin = nodeGraphicsObject(node);
    const bool ownHandle = origin && nodeGeometry().checkPortHit(node, port, origin->mapFromScene(event->scenePos())) == index;
    NodeGraphicsObject *body = nullptr;
    for (auto item : items(event->scenePos())) {
      const auto target = qgraphicsitem_cast<NodeGraphicsObject *>(item);
      if (target && !model_.isGroup(target->nodeId())) { body = target; break; }
    }
    bool otherHandle = false;
    if (body && !ownHandle) {
      for (const auto side : {PortType::In, PortType::Out}) {
        const auto hit = nodeGeometry().checkPortHit(body->nodeId(), side, body->mapFromScene(event->scenePos()));
        if (hit != InvalidPortIndex && QLineF(nodeGeometry().portPosition(body->nodeId(), side, hit), body->mapFromScene(event->scenePos())).length() <= nm::handleDiameter / 2 + nm::handleRing / 2) { otherHandle = true; }
      }
    }
    if (body && !ownHandle && !otherHandle) {
      const auto target = body->nodeId();
      resetDraftConnection();
      emit wireBodyDropped(node, port, index, target, event->scenePos());
      event->accept();
      restoreGroupOrder();
      return;
    }
    if (!body || ownHandle) {
      resetDraftConnection();
      emit looseWireDropped(node, port, index, event->scenePos());
      event->accept();
      restoreGroupOrder();
      return;
    }
  }
  if (inlinePress_) {
    inlinePress_ = false;
    event->accept();
    restoreGroupOrder();
    return;
  }
  const auto gesture = gesture_;
  if (gesture != Gesture::None && event->widget()) { event->widget()->unsetCursor(); }
  const auto id = gestureNode_;
  gesture_ = Gesture::None;
  if (gesture == Gesture::Resize && model_.nodeExists(id)) {
    const auto size = model_.nodeData(id, NodeRole::Size).toSize();
    const auto position = model_.nodeData(id, NodeRole::Position).toPointF();
    if (size != gestureBounds_.size().toSize() || position != gestureBounds_.topLeft()) {
      auto ui = gestureUi_;
      ui["width"] = size.width();
      ui["height"] = size.height();
      QJsonArray commands{QJsonObject{{"op", "setNodeField"}, {"id", model_.resourceId(id)}, {"field", "ui_properties"}, {"value", ui}}};
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
    event->accept();
  } else if (gesture == Gesture::Label) { event->accept(); }
  else { BasicGraphicsScene::mouseReleaseEvent(event); }
  gesturePositions_.clear();
  restoreGroupOrder();
}

void EditorScene::cancelGesture() {
  for (const auto view : views()) { view->viewport()->unsetCursor(); }
  if (gestureNode_ != InvalidNodeId && model_.nodeExists(gestureNode_)) {
    if (auto item = nodeGraphicsObject(gestureNode_)) { item->setGeometryChanged(); }
    model_.setNodeData(gestureNode_, NodeRole::Size, gestureBounds_.size().toSize());
  }
  for (auto it = gesturePositions_.cbegin(); it != gesturePositions_.cend(); ++it) {
    model_.setNodeData(it.key(), NodeRole::Position, it.value());
  }
  gesture_ = Gesture::None;
  gestureNode_ = InvalidNodeId;
  gesturePositions_.clear();
}
void EditorScene::keyPressEvent(QKeyEvent *event) {
  if (event->key() == Qt::Key_Escape && gesture_ != Gesture::None) {
    cancelGesture();
    event->accept();
    return;
  }
  BasicGraphicsScene::keyPressEvent(event);
}
void EditorScene::focusOutEvent(QFocusEvent *event) {
  if (gesture_ != Gesture::None) { cancelGesture(); }
  BasicGraphicsScene::focusOutEvent(event);
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
  const auto zoom = std::clamp(std::abs(painter->worldTransform().m11()), 0.08, 8.0);
  const auto labelScale = groupLabelScale(zoom);
  for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id)) { continue; }
    const auto item = nodeGraphicsObject(id);
    if (!item) { continue; }
    const auto &layout = model_.layout(id);
    painter->save();
    painter->translate(item->scenePos() + QPointF(0, -5 / zoom));
    painter->scale(labelScale, labelScale);
    painter->setFont(canvasFont(theme_, 15, QFont::Medium));
    painter->setPen(layout.accent.isValid() ? layout.accent : QColor("#9ca3af"));
    const auto width = std::max(24.0, layout.size.width() / labelScale);
    painter->drawText(QRectF(0, -32, width, 32), Qt::AlignLeft | Qt::AlignVCenter,
                      painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(width)));
    painter->restore();
  }
  for (auto item : items()) {
    // A selected node names its handle-only inputs and its outputs outside the card.
    auto node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
    if (!node || !node->isSelected() || model_.isReroute(node->nodeId())) { continue; }
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
