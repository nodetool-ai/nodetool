#include "EditorScene.h"
#include "NodeLayout.h"
#include "WorkflowGraphModel.h"
#include "CardBodyPainter.h"
#include "CardBodies.h"
#include "document/ConnectionTypes.h"
#include <QClipboard>
#include <QGuiApplication>
#include <QHash>
#include <QGraphicsSceneMouseEvent>
#include <QGraphicsSceneContextMenuEvent>
#include <QGraphicsView>
#include <QKeyEvent>
#include <QFocusEvent>
#include <QFontMetricsF>
#include <QJsonDocument>
#include <QPainter>
#include <QConicalGradient>
#include <QEasingCurve>
#include <QTextDocument>
#include <QAbstractTextDocumentLayout>
#include <QScopeGuard>
#include <QTextCursor>
#include <QPainterPath>
#include <QSvgRenderer>
#include <QtNodes/internal/AbstractConnectionPainter.hpp>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/AbstractNodePainter.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionState.hpp>
#include <QtNodes/ConnectionIdUtils>
#include <QtNodes/internal/StyleCollection.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <algorithm>
#include <cmath>
#include <QPainterPathStroker>
#include <memory>
using namespace QtNodes;
namespace nodetool {
namespace {
namespace nm = node_metrics;

// BaseNode's focused badge sits this far above the card's top edge.
constexpr double focusBadgeOffset = 20;

// NodeErrors.tsx: a failed card offers Report at its bottom left, across from
// the status label.
QRectF reportErrorRect(const WorkflowGraphModel &model, QtNodes::NodeId id, const NodeLayout &layout) {
  if (layout.collapsed) { return {}; }
  const auto status = model.runtimeState(id)["status"].toString();
  if (status != QStringLiteral("error") && status != QStringLiteral("failed")) { return {}; }
  const auto inset = double(nm::borderWidth + nm::padding);
  const auto bottom = 2.0 + (layout.subgraph ? nm::handleRowStep : 0);
  return {inset, layout.size.height() - bottom - nm::rowHeight, 56, double(nm::rowHeight)};
}

// BaseNode's .loading::before: a 3px conic ring 4px outside the card with the
// xl radius, its stops evenly spaced and closed on the first color.
void paintRunningRing(QPainter *painter, const QRectF &box, const QVector<QColor> &colors, double cssAngle) {
  if (colors.isEmpty()) { return; }
  constexpr double offset = 4, ring = 3, outerRadius = 12;
  const auto outer = box.adjusted(-offset, -offset, offset, offset);
  QPainterPath path;
  path.addRoundedRect(outer, outerRadius, outerRadius);
  path.addRoundedRect(outer.adjusted(ring, ring, -ring, -ring), outerRadius - ring, outerRadius - ring);
  path.setFillRule(Qt::OddEvenFill);
  // CSS turns clockwise from 12 o'clock and Qt counterclockwise from 3 o'clock,
  // so the start angle is mirrored and each stop sits at 1 - position.
  QConicalGradient gradient(outer.center(), 90 - cssAngle);
  const auto count = colors.size();
  for (qsizetype i = 0; i <= count; ++i) { gradient.setColorAt(1 - double(i) / count, colors[i % count]); }
  painter->save();
  painter->setPen(Qt::NoPen);
  painter->setBrush(gradient);
  painter->drawPath(path);
  painter->restore();
}

class NodeGeometry final : public AbstractNodeGeometry {
public:
  explicit NodeGeometry(WorkflowGraphModel &model) : AbstractNodeGeometry(model), model_(model) {}
  QRectF boundingRect(NodeId id) const override {
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
  QSize size(NodeId id) const override { return model_.layout(id).size; }
  void recomputeSize(NodeId) const override {}
  QPointF portPosition(NodeId id, PortType type, PortIndex index) const override {
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
  PortIndex checkPortHit(NodeId id, PortType side, QPointF point) const override {
    if (side == PortType::None) { return InvalidPortIndex; }
    const auto ports = model_.ports(id, side);
    for (int i = 0; i < ports.size(); ++i) {
      if (model_.portVisible(id, side, i) && QLineF(portPosition(id, side, i), point).length() < 2 * StyleCollection::nodeStyle().ConnectionPointDiameter) {
        return i;
      }
    }
    return InvalidPortIndex;
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

// A square icon centered in a row control, as the web's 14 px action icons.
QRectF iconSquare(const QRectF &rect) {
  const auto side = std::min({rect.width(), rect.height(), 14.0});
  return QRectF(rect.center() - QPointF(side / 2, side / 2), QSizeF(side, side));
}

// DynamicSlotTypePicker's compact Chip: the slot type color as text, a half
// opacity border and a 12 percent fill.
void paintTypeChip(QPainter *painter, const CanvasTheme &theme, const NodeRow &row) {
  painter->save();
  const auto accent = typeColor(row.typeChip.startsWith("list[") ? row.typeChip.mid(5, row.typeChip.size() - 6) : row.typeChip);
  auto border = accent; border.setAlphaF(0.5);
  auto fill = accent; fill.setAlphaF(0.12);
  painter->setPen(QPen(border, 1));
  painter->setBrush(fill);
  painter->drawRoundedRect(row.typeChipRect.adjusted(0.5, 0.5, -0.5, -0.5), nm::chipHeight / 2.0, nm::chipHeight / 2.0);
  QFont mono(theme.monoFamily);
  mono.setPixelSize(nm::fontValue);
  painter->setFont(mono);
  painter->setPen(accent);
  painter->drawText(row.typeChipRect, Qt::AlignCenter, row.typeChip);
  painter->restore();
}

void paintResizeHandle(QPainter *painter, const QSize &size, const QColor &color) {
  painter->save();
  painter->setPen(QPen(color, 1.5, Qt::SolidLine, Qt::RoundCap));
  const auto corner = QPointF(size.width() - 6, size.height() - 6);
  painter->drawLine(corner + QPointF(-8, 0), corner + QPointF(0, -8));
  painter->drawLine(corner + QPointF(-4, 0), corner + QPointF(0, -4));
  painter->restore();
}

// nodes.states.css `.bypassed .base-node`: repeating-linear-gradient(45deg, transparent 0 5px,
// action-hover 5px 10px). The palette's hover tint is 2% white on dark and 4% ink on light.
void paintBypassStripes(QPainter *painter, const QRectF &box, const CanvasTheme &theme) {
  painter->save();
  QPainterPath clip;
  clip.addRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);
  painter->setClipPath(clip, Qt::IntersectClip);
  auto tint = theme.textPrimary;
  tint.setAlphaF(theme.node.lightness() < 128 ? 0.02 : 0.04);
  painter->setPen(Qt::NoPen);
  painter->setBrush(tint);
  const double band = 5 * std::sqrt(2.0), pitch = 2 * band;
  for (double c = -box.height() + std::fmod(box.height(), pitch) - pitch; c < box.width(); c += pitch) {
    painter->drawPolygon(QPolygonF{{c + band, 0}, {c + 2 * band, 0}, {c + 2 * band + box.height(), box.height()}, {c + band + box.height(), box.height()}});
  }
  painter->restore();
}

// NodeHeader.tsx: the compact outlined warning MuiChip labelled Disabled. The theme's
// MuiChip override fills it with the tone at 12 percent and edges it at 50 percent.
void paintDisabledBadge(QPainter *painter, const QRectF &chip, const CanvasTheme &theme, const QFont &font, const QString &label) {
  painter->save();
  painter->setFont(font);
  auto fill = theme.warning, border = theme.warning;
  fill.setAlphaF(0.12);
  border.setAlphaF(0.5);
  painter->setPen(QPen(border, nm::borderWidth));
  painter->setBrush(fill);
  painter->drawRoundedRect(chip.adjusted(0.5, 0.5, -0.5, -0.5), chip.height() / 2, chip.height() / 2);
  painter->setPen(theme.warning);
  painter->drawText(chip, Qt::AlignCenter, label);
  painter->restore();
}

// The CSS saturate() filter matrix on premultiplied pixels. The filter is linear in
// the color channels, so premultiplied values need no unpremultiply.
void saturate(QImage &image, double amount) {
  const double rr = 0.213 + 0.787 * amount, rg = 0.715 - 0.715 * amount, rb = 0.072 - 0.072 * amount;
  const double gr = 0.213 - 0.213 * amount, gg = 0.715 + 0.285 * amount, gb = rb;
  const double br = gr, bg = rg, bb = 0.072 + 0.928 * amount;
  for (int y = 0; y < image.height(); ++y) {
    auto *line = reinterpret_cast<QRgb *>(image.scanLine(y));
    for (int x = 0; x < image.width(); ++x) {
      const double r = qRed(line[x]), g = qGreen(line[x]), b = qBlue(line[x]);
      line[x] = qRgba(int(std::clamp(rr * r + rg * g + rb * b, 0.0, 255.0) + 0.5), int(std::clamp(gr * r + gg * g + gb * b, 0.0, 255.0) + 0.5),
                      int(std::clamp(br * r + bg * g + bb * b, 0.0, 255.0) + 0.5), qAlpha(line[x]));
    }
  }
}

QColor mixColors(const QColor &first, const QColor &second, double firstShare) {
  QColor mixed;
  mixed.setRgbF(first.redF() * firstShare + second.redF() * (1 - firstShare), first.greenF() * firstShare + second.greenF() * (1 - firstShare),
                first.blueF() * firstShare + second.blueF() * (1 - firstShare));
  return mixed;
}

// Above every card, selected cards (z 1) included.
constexpr double kDraftWireZ = 1e6;

// A collect handle (list[T] with a concrete T) is a ring: PropertyField.tsx isCollectType.
bool collectPort(const QJsonValue &port) {
  // value() copies. operator[] on the temporary object would return a dangling reference.
  const auto type = port.toObject().value("type");
  if (!type.isObject()) { return false; }
  const auto declared = type.toObject();
  const auto args = declared.value("type_args").toArray();
  return declared.value("type") == "list" && args.size() == 1 && args[0].toObject().value("type") != "any";
}

QColor withOpacity(QColor color, double opacity);

class NodePainter final : public AbstractNodePainter {
public:
  explicit NodePainter(EditorScene &scene) : scene_(scene) {}
  // The zoom the card is shown at. A bypassed card paints into an image first, whose
  // own scale is the pixel density, so that pass carries the view zoom here.
  double zoomOf(const QPainter *painter) const { return desaturating_ ? zoomOverride_ : std::abs(painter->worldTransform().m11()); }
  // nodes.states.css .react-flow__node.bypassed: opacity 0.8 and filter saturate(0.2) over
  // the whole node, handles included. Qt has no color filter, so the card is painted into
  // an image at the view's pixel density, desaturated, and drawn at 0.8.
  void paintDesaturated(QPainter *painter, NodeGraphicsObject &item, double zoom) const {
    const auto bounds = item.boundingRect();
    const double scale = std::max(0.01, std::abs(painter->worldTransform().m11()) * painter->device()->devicePixelRatio());
    QImage image(QSize(int(std::ceil(bounds.width() * scale)), int(std::ceil(bounds.height() * scale))), QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    {
      QPainter inner(&image);
      inner.scale(scale, scale);
      inner.translate(-bounds.topLeft());
      desaturating_ = true;
      zoomOverride_ = zoom;
      paint(&inner, item);
      desaturating_ = false;
    }
    saturate(image, disabledSaturation);
    painter->save();
    painter->setOpacity(painter->opacity() * nm::disabledOpacity);
    painter->drawImage(QRectF(bounds.topLeft(), QSizeF(image.width() / scale, image.height() / scale)), image);
    painter->restore();
  }
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
      // GroupNode.tsx draws a group a card is over at 0.8 opacity, edged in 60 percent primary.
      const bool dropTarget = group && scene_.dropGroup() == item.nodeId();
      auto hoverEdge = theme.primary;
      hoverEdge.setAlphaF(0.6);
      if (dropTarget) { painter->setOpacity(painter->opacity() * 0.8); }
      painter->setPen(group || item.isSelected() ? QPen(item.isSelected() ? theme.primary : dropTarget ? hoverEdge : border, group ? 1 / zoom : 1) : QPen(Qt::NoPen));
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
    const double zoom = zoomOf(painter);
    if (disabled && !desaturating_) { paintDesaturated(painter, item, zoom); return; }
    const bool zoomedOut = zoom <= zoomedOutThreshold;
    const bool grouped = model.depth(item.nodeId()) > 0;
    // BaseNode.tsx isLoading: the card takes the group tint only while it is not loading.
    const bool loading = !disabled && model.runningShown(item.nodeId());
    painter->save();
    painter->setRenderHint(QPainter::Antialiasing);
    painter->setRenderHint(QPainter::TextAntialiasing);
    const QRectF box(QPointF(0, 0), layout.size);
    if (zoomedOut && item.isSelected()) {
      // nodes.zoomed.css: a 4 px ring in the node color over a 0 2px 8px shadow, around the card.
      auto shade = QColor(0, 0, 0);
      for (int layer = 4; layer >= 1; --layer) {
        shade.setAlphaF(0.4 / 8);
        const double spread = 4 + 2 * layer - 2;
        painter->setPen(Qt::NoPen);
        painter->setBrush(shade);
        painter->drawRoundedRect(box.adjusted(-spread, 2 - spread, spread, 2 + spread), nm::radius + spread, nm::radius + spread);
      }
      QPainterPath ring;
      ring.addRoundedRect(box.adjusted(-4, -4, 4, 4), nm::radius + 4, nm::radius + 4);
      ring.addRoundedRect(box, nm::radius, nm::radius);
      ring.setFillRule(Qt::OddEvenFill);
      painter->setBrush(layout.subgraph ? theme.subgraphAccent : layout.accent);
      painter->drawPath(ring);
    }
    // The zoomed-out node body is drawn at 0.85 and keeps no shadow of its own.
    if (zoomedOut) { painter->setOpacity(painter->opacity() * zoomedOutBodyOpacity); }
    const bool previewCard = layout.body == CardBody::Preview;
    const bool outputCard = layout.body == CardBody::Output;
    // selectionStyles.ts: Preview and Output cards carry SHADOW.sm in every state, other cards when selected.
    if ((item.isSelected() || previewCard || outputCard) && !zoomedOut) {
      // SHADOW.sm: 0 1px 3px, stacked outlines in place of a blur.
      for (int spread = 3; spread >= 1; --spread) {
        auto shade = theme.selectionShadow;
        shade.setAlphaF(shade.alphaF() / 3.0);
        painter->setPen(Qt::NoPen);
        painter->setBrush(shade);
        painter->drawRoundedRect(box.adjusted(-spread, 1 - spread, spread, 1 + spread), nm::radius + spread, nm::radius + spread);
      }
    }
    auto borderColor = theme.divider;
    // selectionStyles.ts: a grouped card's hairline is the group header over 18 percent primary.
    if (grouped) { borderColor = mixColors(theme.groupHeader, theme.primary, 0.82); }
    // DynamicSchemaNodeShell keeps its provider edge inside a group too.
    if (layout.edge.isValid()) { borderColor = layout.edge; }
    if (layout.subgraph) {
        borderColor = theme.subgraphAccent;
        borderColor.setAlpha(64);
    }
    // A selected Preview card is edged in grey 100 and an Output card in info.main over white.
    const auto selectedEdge = previewCard ? theme.previewSelected : outputCard ? theme.outputSelected : layout.accent;
    // selectionStyles.ts: the keyboard-focused card is edged dashed in warning.
    const bool focused = !model.focusedNode().isEmpty() && model.focusedNode() == model.resourceId(item.nodeId());
    painter->setPen(QPen(focused ? theme.warning : item.isSelected() ? (layout.subgraph ? theme.subgraphAccent : selectedEdge) : borderColor, layout.subgraph && item.isSelected() ? 2 * nm::borderWidth : nm::borderWidth, disabled || focused ? Qt::DashLine : Qt::SolidLine));
    painter->setBrush(grouped && !loading ? theme.groupFill : theme.node);
    painter->drawRoundedRect(box.adjusted(0.5, 0.5, -0.5, -0.5), nm::radius - 0.5, nm::radius - 0.5);
    if (disabled) { paintBypassStripes(painter, box, theme); }
    if (focused) {
      // BaseNode's "Focused" badge, centered 20 px above the card.
      const auto font = canvasFont(theme, nm::fontValue, QFont::DemiBold);
      const auto text = QObject::tr("Focused");
      const auto width = QFontMetricsF(font).horizontalAdvance(text) + 2 * nm::padding;
      const QRectF badge(box.center().x() - width / 2, -focusBadgeOffset, width, focusBadgeOffset - 4);
      painter->save();
      painter->setPen(Qt::NoPen);
      painter->setBrush(theme.warning);
      painter->drawRoundedRect(badge, 4, 4);
      painter->setPen(theme.canvas);
      painter->setFont(font);
      painter->drawText(badge, Qt::AlignCenter, text);
      painter->restore();
    }

    const auto inset = double(nm::borderWidth + nm::padding);
    auto iconColor = theme.textSecondary;
    iconColor.setAlphaF(0.65);
    const QRectF iconBox(inset + 2, inset + 4, nm::iconSize, nm::iconSize);
    // nodes.zoomed.css hides the icon and sets the title to grey 200 at full opacity.
    if (zoomedOut) {
    } else if (layout.subgraph) {
        paintIcon(painter, layout.icon, iconBox, theme.subgraphAccent);
    } else {
        paintCardIcon(painter, layout.typeIcon, layout.icon, iconBox, iconColor);
    }
    const QRectF headerBox(inset, inset, layout.size.width() - 2 * inset, nm::headerHeight);
    const auto chipFont = canvasFont(theme, nm::fontValue, QFont::Normal);
    const auto chipLabel = QObject::tr("Disabled");
    const auto chip = disabledChipRect(headerBox, QFontMetricsF(chipFont).horizontalAdvance(chipLabel));
    painter->setPen(zoomedOut ? theme.zoomedTitle : theme.textPrimary);
    painter->setFont(canvasFont(theme, nm::fontTitle, QFont::Normal));
    // The chip keeps its 6 px left margin (nodes.states.css .bypass-badge).
    const QRectF title(inset + nm::titleOffset, inset, layout.size.width() - 2 * inset - nm::titleOffset - (disabled ? chip.width() + disabledChipMargin : 0), nm::headerHeight);
    {
      // nodes.states.css: a bypassed title is drawn at 0.8 inside the card's own 0.8.
      const auto cardOpacity = painter->opacity();
      if (disabled && !zoomedOut) { painter->setOpacity(cardOpacity * nm::disabledOpacity); }
      painter->drawText(title, Qt::AlignLeft | Qt::AlignVCenter,
                        painter->fontMetrics().elidedText(layout.title, Qt::ElideRight, int(title.width())));
      painter->setOpacity(cardOpacity);
    }

    if (disabled) { paintDisabledBadge(painter, chip, theme, chipFont, chipLabel); }
    CardBodyPaintState bodyState;
    bodyState.hasResult = model.hasRuntimeOutput(item.nodeId()) && !layout.sourceTab;
    bodyState.running = model.runtimeState(item.nodeId())["status"] == QStringLiteral("running");
    bodyState.hovered = item.nodeState().hovered();
    if (scene_.sliderDraftNode() == item.nodeId()) {
        bodyState.draftProperty = scene_.sliderDraftProperty();
        bodyState.draftValue = scene_.sliderDraftValue();
    }
    if (scene_.cropDraftNode() == item.nodeId()) {
        bodyState.cropDraft = scene_.cropDraft();
    }
    for (const auto &row : layout.rows) {
        if (!paintCardBodyRow(painter, theme, layout, row, bodyState)) {
            // nodes.zoomed.css hides property rows and their labels at overview zoom.
            if (!zoomedOut) { paintRow(painter, layout, row, inset); }
        }
        if (!row.renameLabelRect.isEmpty() && !zoomedOut) {
            if (row.kind == NodeRowKind::Handle) {
                painter->setPen(theme.textSecondary);
                painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
                painter->drawText(row.renameLabelRect, Qt::AlignLeft | Qt::AlignVCenter, row.label);
            }
            if (!model.readOnly()) { paintIcon(painter, "edit", iconSquare(row.renameButtonRect), theme.textSecondary); }
            if (!row.typeChipRect.isEmpty()) { paintTypeChip(painter, theme, row); }
            if (!row.removeButtonRect.isEmpty()) { paintIcon(painter, "close", iconSquare(row.removeButtonRect), theme.textSecondary); }
        }
    }
    if (layout.addOutput) {
        painter->setPen(theme.textSecondary);
        painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
        painter->drawText(layout.outputFormRect(), Qt::AlignLeft | Qt::AlignVCenter, QObject::tr("+ Add output"));
    }
    if (layout.subgraph) {
        const auto footer = layout.footerRect();
        if (item.property("footerHovered").toBool()) {
            painter->fillRect(footer.adjusted(1, 1, -1, -1), theme.field);
        }
        painter->setPen(theme.divider);
        painter->drawLine(footer.topLeft(), footer.topRight());
        painter->setPen(theme.textSecondary);
        painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
        paintIcon(painter, "accountTree", QRectF(inset, footer.y() + 7, 14, 14), theme.textSecondary);
        painter->drawText(footer.adjusted(inset + 18, 0, -32, 0), Qt::AlignLeft | Qt::AlignVCenter, QObject::tr("Open subgraph"));
        painter->drawText(footer.adjusted(inset, 0, -32, 0), Qt::AlignRight | Qt::AlignVCenter, layout.childCount);
    }
    paintHandles(painter, model, item.nodeId(), layout);
    auto runtime = model.runtimeState(item.nodeId());
    // A collapsed strip keeps its status ring and drops the result body.
    if (layout.collapsed && !runtime.isEmpty()) { runtime = QJsonObject{{"status", runtime["status"]}}; }
    if (!runtime.isEmpty()) {
      // A constant or a content card shows its own value, not the run result.
      const auto output = model.hasRuntimeOutput(item.nodeId()) ? model.canvasResultRect(item.nodeId()) : QRectF();
      const auto image = model.runtimePreview(item.nodeId());
      if (!output.isEmpty() && !image.isNull()) {
        auto target = QRectF(QPointF(), image.size().scaled(output.size().toSize(), Qt::KeepAspectRatio));
        target.moveCenter(output.center());
        painter->drawImage(target, image);
      } else if (!output.isEmpty()) {
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
      const bool running = !disabled && model.runningShown(item.nodeId());
      auto color = status == "error" || status == "failed" ? QColor("#ff5555") : theme.primary;
      if (running) {
        color.setAlphaF(0.6 + 0.4 * std::sin(scene_.animationPhase() * 6.283185));
        paintRunningRing(painter, box, layout.runningColors, scene_.runningAngle());
      }
      painter->setPen(color);
      painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      // The web card shows no status text. Errors and a lost connection keep a label.
      QString label;
      if (status == "error" || status == "failed") {
          label = status;
      }
      if (!model.runtimeConnected() && running) {
          label = QObject::tr("Disconnected");
      }
      const auto total = runtime["total"].toDouble();
      if (layout.progressBand) {
          const auto fraction = std::clamp(runtime["progress"].toDouble() / total, 0.0, 1.0);
          const QRectF track(nm::progressBarInset, box.height() - nm::progressBarTop,
                             box.width() - 2 * nm::progressBarInset, nm::progressBarHeight);
          painter->setPen(Qt::NoPen);
          painter->setBrush(theme.field);
          painter->drawRoundedRect(track, track.height() / 2, track.height() / 2);
          painter->setBrush(theme.progress);
          painter->drawRoundedRect(QRectF(track.topLeft(), QSizeF(track.width() * fraction, track.height())), track.height() / 2, track.height() / 2);
          QFont mono(theme.monoFamily);
          mono.setPixelSize(nm::fontValue);
          painter->setFont(mono);
          painter->setPen(theme.textSecondary);
          const QRectF count(nm::progressBarInset, box.height() - nm::progressLabelTop,
                             track.width(), nm::progressLabelTop - nm::progressBarTop);
          painter->drawText(count, Qt::AlignLeft | Qt::AlignVCenter,
                            QStringLiteral("%1 / %2").arg(runtime["progress"].toDouble()).arg(total));
          painter->setPen(color);
          painter->setFont(canvasFont(theme, nm::fontValue, QFont::Normal));
      }
        const auto bottomInset = layout.subgraph ? nm::handleRowStep : 0;
        if (layout.subgraph && status == "running" && total > 0) {
            const auto fraction = std::clamp(runtime["progress"].toDouble() / total, 0.0, 1.0);
            const QRectF track(inset, box.height() - bottomInset - nm::rowHeight - nm::padding,
                               box.width() - 2 * inset, nm::micro);
            painter->fillRect(track, theme.field);
            painter->fillRect(QRectF(track.topLeft(), QSizeF(track.width() * fraction, track.height())), theme.subgraphAccent);
            label = QString("%1 / %2").arg(runtime["progress"].toDouble()).arg(total);
        }
        painter->drawText(box.adjusted(inset, 0, -inset, -2 - bottomInset), Qt::AlignRight | Qt::AlignBottom, label);
        if (const auto report = reportErrorRect(model, item.nodeId(), layout); !report.isEmpty()) {
            auto font = canvasFont(theme, nm::fontValue, QFont::Medium);
            font.setUnderline(true);
            painter->setFont(font);
            painter->drawText(report, Qt::AlignLeft | Qt::AlignBottom, QObject::tr("Report"));
        }
    }
    if (!model.readOnly() && !layout.collapsed) { paintResizeHandle(painter, layout.size, theme.textSecondary); }
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
    if (!row.bare) {
      painter->setPen(theme.textSecondary);
      painter->setFont(canvasFont(theme, nm::fontLabel, QFont::Normal));
      const auto labelWidth = row.renameLabelRect.isEmpty() ? width : row.renameLabelRect.width();
      painter->drawText(QRectF(inset, row.y, labelWidth, nm::rowHeight), Qt::AlignLeft | Qt::AlignVCenter,
                        painter->fontMetrics().elidedText(row.label, Qt::ElideRight, int(labelWidth)));
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
    const auto &hover = scene_.hoveredHandle();
    // nodes.zoomed.css gives every handle opacity 0 at overview zoom.
    if (zoomOf(painter) <= zoomedOutThreshold) { return; }
    const auto dot = [&](double x, double y, const QColor &color, PortType side, int index) {
      const auto ports = model.ports(id, side);
      const bool collect = side == PortType::In && index < ports.size() && collectPort(ports[index]);
      // A type-colored dot in a ring of the node's own background. The hovered
      // handle scales to 1.3 at opacity 0.9 about its center, as the web does.
      const bool hovered = hover.node == id && hover.type == side && hover.index == PortIndex(index);
      const auto connectable = scene_.handleConnectable(id, side, PortIndex(index));
      auto fill = color;
      painter->save();
      if (connectable > 0) {
        // The web glow: a 4 px halo at 40% of the handle color.
        painter->setPen(Qt::NoPen);
        painter->setBrush(withOpacity(color, 0.4));
        painter->drawEllipse(QPointF(x, y), nm::handleDiameter / 2 * handleConnectableScale + 2, nm::handleDiameter / 2 * handleConnectableScale + 2);
        painter->translate(x, y);
        painter->scale(handleConnectableScale, handleConnectableScale);
        painter->translate(-x, -y);
      } else if (connectable < 0) {
        painter->translate(x, y);
        painter->scale(handleBlockedScaleX, handleBlockedScaleY);
        painter->translate(-x, -y);
        painter->setOpacity(painter->opacity() * handleBlockedOpacity);
        const auto gray = qGray(color.rgb());
        fill = QColor(gray, gray, gray, color.alpha());
      } else if (hovered) {
        painter->translate(x, y);
        painter->scale(handleHoverScale, handleHoverScale);
        painter->translate(-x, -y);
        painter->setOpacity(painter->opacity() * handleHoverOpacity);
      }
      painter->setPen(QPen(theme.node, nm::handleRing));
      painter->setBrush(fill);
      const auto r = nm::handleDiameter / 2 - nm::handleRing / 2;
      painter->drawEllipse(QPointF(x, y), r, r);
      if (collect) {
        // .collect-handle: a card-colored core, radial-gradient(bg 0 2px, transparent 2.5px).
        QRadialGradient core(QPointF(x, y), handleCollectFeather);
        core.setColorAt(0, theme.node);
        core.setColorAt(handleCollectCore / handleCollectFeather, theme.node);
        core.setColorAt(1, withOpacity(theme.node, 0));
        painter->setPen(Qt::NoPen);
        painter->setBrush(core);
        painter->drawEllipse(QPointF(x, y), handleCollectFeather, handleCollectFeather);
      }
      painter->restore();
    };
    // The control handle sits at the top center of a card and the bottom center of a controller.
    const auto handleAt = [&](PortType type, int index, double x, double y) {
      const auto ports = model.ports(id, type);
      if (index < ports.size() && ports[index].toObject()["name"] == "__control__") {
        return QPointF(layout.size.width() / 2.0, type == PortType::In ? 0.0 : double(layout.size.height()));
      }
      return QPointF(x, y);
    };
    for (int i = 0; i < layout.inputY.size(); ++i) {
      if (!model.portVisible(id, PortType::In, i)) { continue; }
      const auto at = handleAt(PortType::In, i, 0, layout.inputY[i]);
      dot(at.x(), at.y(), typeColor(model.isReroute(id) ? model.rerouteHandleType(id) : model.portData<NodeDataType>(id, PortType::In, PortIndex(i), PortRole::DataType).id), PortType::In, i);
    }
    for (int i = 0; i < layout.outputY.size(); ++i) {
      if (!model.portVisible(id, PortType::Out, i)) { continue; }
      const auto at = handleAt(PortType::Out, i, layout.size.width(), layout.outputY[i]);
      dot(at.x(), at.y(), typeColor(model.isReroute(id) ? model.rerouteHandleType(id) : model.portData<NodeDataType>(id, PortType::Out, PortIndex(i), PortRole::DataType).id), PortType::Out, i);
    }
  }
  EditorScene &scene_;
  mutable bool desaturating_ = false;
  mutable double zoomOverride_ = 1;
};

QColor withOpacity(QColor color, double opacity) {
  color.setAlphaF(opacity);
  return color;
}

// The web's edge hover filter, saturate(1.3) brightness(1.15), applied to the
// wire color (styles/handle_edge_tooltip.css).
QColor hoverTint(const QColor &color) {
  constexpr double saturate = 1.3;
  constexpr double brightness = 1.15;
  const double red = color.redF();
  const double green = color.greenF();
  const double blue = color.blueF();
  const auto channel = [&](double r, double g, double b) {
    return std::clamp((r * red + g * green + b * blue) * brightness, 0.0, 1.0);
  };
  QColor tinted;
  tinted.setRgbF(channel(0.213 + 0.787 * saturate, 0.715 - 0.715 * saturate, 0.072 - 0.072 * saturate),
                 channel(0.213 - 0.213 * saturate, 0.715 + 0.285 * saturate, 0.072 - 0.072 * saturate),
                 channel(0.213 - 0.213 * saturate, 0.715 - 0.715 * saturate, 0.072 + 0.928 * saturate),
                 color.alphaF());
  return tinted;
}

class WirePainter final : public AbstractConnectionPainter {
public:
  WirePainter(EditorScene &scene, WorkflowGraphModel &model) : scene_(scene), model_(model) {}
  void paint(QPainter *painter, ConnectionGraphicsObject const &wire) const override {
    if (!model_.wireVisible(wire.connectionId())) { return; }
    painter->setRenderHint(QPainter::Antialiasing);
    painter->setBrush(Qt::NoBrush);
    const auto id = wire.connectionId();
    const bool control = !wire.connectionState().requiresPort() && model_.isControlWire(id);
    const auto path = control ? controlWireCurve(wire.endPoint(PortType::Out), wire.endPoint(PortType::In)) : curve(wire);
    if (control) {
      // ControlEdge.tsx: amber, dashed 8 4, 2 wide at 0.7 opacity and 3 wide at full opacity when selected.
      // Hover widens it to 3 and lifts it to full opacity (handle_edge_tooltip.css .control-edge:hover).
      const bool selected = wire.isSelected();
      const bool raised = selected || wire.connectionState().hovered();
      const double width = raised ? nm::controlWireSelectedWidth : nm::controlWireWidth;
      if (selected) {
        // A selected control wire casts a 0 0 3px glow at 50 percent of its amber.
        painter->setPen(QPen(withOpacity(scene_.theme().controlWire, 0.25), width + 4, Qt::SolidLine, Qt::RoundCap));
        painter->drawPath(path);
      }
      QPen pen(scene_.theme().controlWire, width, Qt::CustomDashLine, Qt::FlatCap);
      pen.setDashPattern({nm::controlWireDashOn / width, nm::controlWireDashOff / width});
      painter->setOpacity(painter->opacity() * (raised ? 1.0 : nm::controlWireOpacity));
      painter->setPen(pen);
      painter->drawPath(path);
      return;
    }
    if (wire.connectionState().requiresPort()) {
      // The web connection line: a 6 px glow at 0.15, a 2.5 px stroke dashed
      // 8 4 for control wires, and a 6 px dot at the pointer
      // (components/node_editor/ConnectionLine.tsx:25-87).
      const auto source = id.outNodeId != InvalidNodeId;
      const auto type = source ? portColor(id.outNodeId, PortType::Out, id.outPortIndex) : portColor(id.inNodeId, PortType::In, id.inPortIndex);
      const auto ports = source ? model_.ports(id.outNodeId, PortType::Out) : model_.ports(id.inNodeId, PortType::In);
      const auto index = int(source ? id.outPortIndex : id.inPortIndex);
      const auto declared = index < ports.size() ? ports[index].toObject()["type"] : QJsonValue{};
      const bool control = (declared.isObject() ? declared.toObject()["type"].toString() : declared.toString()) == "control";
      painter->setPen(QPen(withOpacity(type, connectingGlowOpacity), connectingGlowWidth, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
      QPen stroke(type, connectingWireWidth, control ? Qt::CustomDashLine : Qt::SolidLine, Qt::RoundCap);
      if (control) { stroke.setDashPattern({8 / connectingWireWidth, 4 / connectingWireWidth}); }
      painter->setPen(stroke);
      painter->drawPath(path);
      const auto pointer = wire.endPoint(source ? PortType::In : PortType::Out);
      painter->setPen(QPen(withOpacity(type, 0.4), 1.5));
      painter->setBrush(withOpacity(type, 0.9));
      painter->drawEllipse(pointer, connectingDotRadius, connectingDotRadius);
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
    const bool hovered = wire.connectionState().hovered();
    // A streaming output draws its own edge style (handle_edge_tooltip.css .streaming-edge).
    const bool streaming = model_.metadata(id.outNodeId)["is_streaming_output"].toBool();
    const bool flowing = model_.runtimeWireFlowing(id) && model_.runtimeConnected();
    const bool messageSent = model_.runtimeEdgeState(id)["status"] == "message_sent";
    const bool zoomedOut = std::abs(painter->worldTransform().m11()) <= zoomedOutThreshold;
    // CustomEdge draws the selected glow and the hover filter applies for every edge,
    // bypassed ones included.
    if (selected) {
      painter->setPen(QPen(withOpacity(source, nm::wireGlowOpacity), nm::wireGlowWidth, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
    }
    // The web's edge hover: 4 wide at full opacity with a brighter, more saturated stroke.
    if (hovered) {
      painter->setPen(QPen(withOpacity(Qt::white, nm::wireHoverGlowOpacity), nm::wireHoverWidth + nm::wireHoverGlowSpread, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
    }
    const bool connecting = scene_.draftEnd().node != InvalidNodeId;
    // The most specific rule wins: selected and hover are 1, then a streaming edge's 0.8,
    // then a flowing edge's 1, then the static 0.5. A bypassed edge's element opacity is 0.5.
    const double strokeOpacity = (selected || hovered) ? 1.0 : streaming ? streamingWireOpacity : flowing ? 1.0 : nm::wireOpacity;
    const auto opacity = connecting ? wireConnectingOpacity : strokeOpacity * (disabled ? nm::disabledWireOpacity : 1.0);
    const auto sourceStroke = hovered ? hoverTint(source) : source;
    const auto targetStroke = hovered ? hoverTint(target) : target;
    QBrush stroke(withOpacity(sourceStroke, opacity));
    if (source != target) {
      QLinearGradient gradient(path.pointAtPercent(0), path.pointAtPercent(1));
      gradient.setColorAt(0, withOpacity(sourceStroke, opacity));
      gradient.setColorAt(1, withOpacity(targetStroke, opacity));
      stroke = gradient;
    }
    // Hover wins, then a streaming edge (4 wide while selected or flowing, otherwise 3),
    // then the overview width, then a selected edge's 2.
    const auto width = hovered ? nm::wireHoverWidth
        : streaming ? (selected || flowing ? nm::wireStreamingWidth : streamingWireWidth)
        : zoomedOut ? zoomedWireWidth
        : selected ? nm::wireSelectedWidth : nm::wireWidth;
    // Dashes are in user units, not stroke widths. A status of message_sent sets 14 10 inline.
    // Otherwise a flowing edge in reduced motion is 4 2, a streaming edge 30 3 (8 when
    // selected) and a bypassed edge 5 5.
    QVector<qreal> dash;
    if (flowing && messageSent) { dash = {flowDashOn, flowDashOff}; }
    else if (flowing && !scene_.animationActive() && !streaming) { dash = {flowReducedDashOn, flowReducedDashOff}; }
    else if (streaming) { dash = selected ? QVector<qreal>{streamingSelectedDash, streamingSelectedDash} : QVector<qreal>{streamingDashOn, streamingDashOff}; }
    else if (flowing) { dash = {flowDashOn, flowDashOff}; }
    else if (disabled) { dash = {bypassedDash, bypassedDash}; }
    // A flowing edge has round caps and scrolls 120 px a second (edgeFlow, MOTION.spin).
    QPen pen(stroke, width, Qt::SolidLine, flowing ? Qt::RoundCap : Qt::FlatCap);
    if (!dash.isEmpty()) {
      pen.setStyle(Qt::CustomDashLine);
      QVector<qreal> pattern;
      for (const auto length : dash) { pattern.append(length / width); }
      pen.setDashPattern(pattern);
      if (flowing && scene_.animationActive()) { pen.setDashOffset(-flowSpeed * scene_.animationPhase() / width); }
    }
    painter->setPen(pen);
    painter->drawPath(path);
    // The web's CustomEdge shows the stream count of an edge that carried more
    // than one item, in a pill on the wire.
    const auto counter = model_.runtimeEdgeState(id)["counter"].toInt();
    if (counter > 1) {
      const auto &theme = scene_.theme();
      const QFont font = canvasFont(theme, nm::fontValue, QFont::DemiBold);
      const auto text = QString::number(counter);
      const QFontMetricsF metrics(font);
      const QSizeF size(metrics.horizontalAdvance(text) + 2 * nm::wireBadgePaddingX, metrics.height() + 2 * nm::wireBadgePaddingY);
      const QRectF pill(path.pointAtPercent(0.5) - QPointF(size.width() / 2, size.height() / 2), size);
      painter->setPen(selected ? QPen(theme.divider, nm::borderWidth) : QPen(Qt::NoPen));
      painter->setBrush(theme.canvas);
      painter->drawRoundedRect(pill, size.height() / 2, size.height() / 2);
      painter->setPen(theme.textPrimary);
      painter->setFont(font);
      painter->drawText(pill, Qt::AlignCenter, text);
    }
  }
  QPainterPath getPainterStroke(ConnectionGraphicsObject const &wire) const override {
    if (!model_.wireVisible(wire.connectionId())) { return {}; }
    QPainterPathStroker stroker;
    stroker.setWidth(nm::wireHitWidth);
    const bool control = !wire.connectionState().requiresPort() && model_.isControlWire(wire.connectionId());
    return stroker.createStroke(control ? controlWireCurve(wire.endPoint(PortType::Out), wire.endPoint(PortType::In)) : curve(wire));
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

double runningRingAngle(qint64 elapsedMs) {
  static const QEasingCurve ease = [] {
    QEasingCurve curve(QEasingCurve::BezierSpline);
    curve.addCubicBezierSegment(QPointF(0.42, 0), QPointF(0.58, 1), QPointF(1, 1));
    return curve;
  }();
  constexpr qint64 period = 2000;
  return 90 + 360 * ease.valueForProgress(double(elapsedMs % period) / period);
}

double groupLabelScale(double zoom) {
  const auto z = std::clamp(zoom, 0.08, 8.0);
  return z < 1 ? 1 / z : std::pow(1 / z, 0.8);
}

QRectF disabledChipRect(const QRectF &header, double textWidth) {
  const double width = textWidth + 2 * disabledChipPadding + 2 * nm::borderWidth, height = disabledChipHeight;
  return QRectF(header.right() - width, header.center().y() - height / 2, width, height);
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

QPainterPath controlWireCurve(const QPointF &bottom, const QPointF &top) {
  // getBezierPath from a bottom handle to a top handle with the default curvature of 0.25. A
  // reverse wire stops growing so that it stays inside QtNodes' connection bounds.
  const auto distance = top.y() - bottom.y();
  const auto offset = distance >= 0 ? 0.5 * distance : std::min(6.25 * std::sqrt(-distance), nm::wireBoundsMargin / 0.75);
  QPainterPath path(bottom);
  path.cubicTo(bottom + QPointF(0, offset), top - QPointF(0, offset), top);
  return path;
}

EditorScene::EditorScene(WorkflowGraphModel &model, QObject *parent)
    : BasicGraphicsScene(model, parent), model_(model) {
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
  connect(&model_, &WorkflowGraphModel::projectionAboutToChange, this, &EditorScene::resetDraftConnection);
  // Runs after a reset rebuilds every item and after an incremental projection
  // adds items, so new and reparented frames get their hierarchy order.
  connect(&model_, &WorkflowGraphModel::projectionChanged, this, [this] {
    gesture_ = Gesture::None;
    gesturePositions_.clear();
    for (const auto view : views()) { view->viewport()->unsetCursor(); }
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
  setNodeGeometry(std::make_unique<NodeGeometry>(model));
  setNodePainter(std::make_unique<NodePainter>(*this));
  setConnectionPainter(std::make_unique<WirePainter>(*this, model));
  // A wire's highlight follows its end nodes, which do not repaint it themselves.
  connect(this, &QGraphicsScene::selectionChanged, this, [this] {
    for (auto item : items()) {
      if (qgraphicsitem_cast<ConnectionGraphicsObject *>(item)) { item->update(); }
    }
  });
  // A selection fades every node and wire off the selected branch. Selection
  // changes apply at once. Graph edits apply once after the projection settles.
  connect(this, &QGraphicsScene::selectionChanged, this, &EditorScene::updateBranchDimming);
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
  connect(&model_, &AbstractGraphModel::connectionCreated, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::connectionDeleted, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::nodeCreated, this, scheduleDimming);
  connect(&model_, &AbstractGraphModel::modelReset, this, scheduleDimming);
}

EditorScene::~EditorScene() {
  disconnect(this, nullptr, this, nullptr);
  disconnect(&model_, nullptr, this, nullptr);
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
  const bool active = !selected.isEmpty() && !draftFeedback_;
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

EditorScene::HandleHover EditorScene::draftEnd() const {
    const auto draft = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem());
    if (!draft || !draft->connectionState().requiresPort()) { return {}; }
    const auto id = draft->connectionId();
    if (id.outNodeId != InvalidNodeId) { return {id.outNodeId, PortType::Out, id.outPortIndex}; }
    return {id.inNodeId, PortType::In, id.inPortIndex};
}

int EditorScene::handleConnectable(NodeId node, PortType side, PortIndex index) const {
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
    const bool compatible = end.type == PortType::Out
            ? node_editor::connectionTypesCompatible(fixed, other)
            : node_editor::connectionTypesCompatible(other, fixed);
    return compatible ? 1 : -1;
}

void EditorScene::updateHandleHover(const QPointF &scenePosition) {
  HandleHover next;
  for (auto *item : items(scenePosition, Qt::IntersectsItemShape, Qt::DescendingOrder)) {
    auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
    if (!node) { continue; }
    const auto local = node->mapFromScene(scenePosition);
    for (const auto side : {PortType::In, PortType::Out}) {
      const auto index = nodeGeometry().checkPortHit(node->nodeId(), side, local);
      if (index == InvalidPortIndex) { continue; }
      if (QLineF(nodeGeometry().portPosition(node->nodeId(), side, index), local).length() > nm::handleDiameter / 2 + nm::handleRing / 2) { continue; }
      next = {node->nodeId(), side, index};
    }
    break;
  }
  if (next == handleHover_) { return; }
  const auto previous = handleHover_;
  handleHover_ = next;
  for (const auto id : {previous.node, next.node}) {
    if (const auto item = id == InvalidNodeId ? nullptr : nodeGraphicsObject(id)) { item->update(); }
  }
}

// handle_edge_tooltip.css: a handle shows the cell cursor (a plus sign, Qt's cross), and
// the cursor is hidden over a handle while a wire is connecting. A Graphics View resets
// its viewport cursor from the item under the pointer, so the cursor is set on the card
// item that owns the hovered handle.
void EditorScene::refreshHandleCursor(bool drafting) {
  if (gesture_ != Gesture::None) { return; }
  const auto owner = handleHover_.node;
  // A Graphics View keeps its viewport cursor while a button is down, which a wire drag is.
  for (const auto view : views()) {
    if (drafting && owner != InvalidNodeId) { view->viewport()->setCursor(Qt::BlankCursor); blankCursor_ = true; }
    else if (blankCursor_) { view->viewport()->unsetCursor(); }
  }
  if (!(drafting && owner != InvalidNodeId)) { blankCursor_ = false; }
  if (cursorNode_ != InvalidNodeId && cursorNode_ != owner) {
    if (auto *previous = nodeGraphicsObject(cursorNode_)) { previous->unsetCursor(); }
    cursorNode_ = InvalidNodeId;
  }
  if (owner == InvalidNodeId) { return; }
  if (auto *item = nodeGraphicsObject(owner)) {
    item->setCursor(Qt::CrossCursor);
    cursorNode_ = owner;
  }
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
    for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
      auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
      if (!node) { continue; }
      const auto local = node->mapFromScene(event->scenePos());
      for (const auto side : {PortType::In, PortType::Out}) {
        const auto hit = nodeGeometry().checkPortHit(node->nodeId(), side, local);
        if (hit == InvalidPortIndex || QLineF(nodeGeometry().portPosition(node->nodeId(), side, hit), local).length() > nm::handleDiameter / 2 + nm::handleRing / 2) { continue; }
        emit handleContextMenuRequested(node->nodeId(), side, hit, event->scenePos());
        event->accept();
        return;
      }
      break;
    }
    for (auto *item:items(event->scenePos(),Qt::IntersectsItemShape,Qt::DescendingOrder)) {
      // A card covering a wire owns the pointer, just as the web node layer does.
      if (qgraphicsitem_cast<NodeGraphicsObject *>(item)) { break; }
      auto *wire=qgraphicsitem_cast<ConnectionGraphicsObject *>(item);
      if (!wire || wire->connectionState().requiresPort()) { continue; }
      const auto edge=model_.edge(wire->connectionId());
      const auto data=edge["data"].toObject();
      if (edge["type"]=="lineage" || edge["edge_type"]=="lineage" || data["edge_type"]=="lineage" || edge["id"].toString().isEmpty()) { break; }
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
    for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
      auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
      if (!node || model_.isGroup(node->nodeId())) { continue; }
      const auto id = node->nodeId();
      for (const auto &row : model_.layout(id).rows) {
          if (!row.renameLabelRect.isEmpty() && row.renameLabelRect.contains(node->mapFromScene(event->scenePos()))) {
              cancelGesture();
              emit dynamicPortFormRequested(model_.resourceId(id), false, row.propertyName, node->mapRectToScene(row.renameLabelRect));
              event->accept();
              return;
          }
      }
      // A double-click on a comment edits its text in place.
      if (model_.isComment(id) && QRectF(node->scenePos(), model_.layout(id).size).contains(event->scenePos())) {
        cancelGesture();
        clearSelection();
        node->setSelected(true);
        emit nodeSelected(id);
        emit titleEditRequested(id);
        event->accept();
        return;
      }
      if (!model_.isComment(id) && !model_.isReroute(id) && node->mapFromScene(event->scenePos()).y() < nm::contentTop) {
        cancelGesture();
        if (!node->isSelected() || selectedItems().size() != 1) {
          clearSelection();
          node->setSelected(true);
        }
        emit nodeSelected(id);
        emit headerDoubleClicked(id);
        event->accept();
        return;
      }
      break;
    }
    // A double-click on the empty pane opens the node menu at the pointer
    // (web hooks/handlers/usePaneEvents.ts handleDoubleClick).
    bool pane = true;
    for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
      // A note below a card is the card's child item, so it is not the pane either.
      bool onCard = qgraphicsitem_cast<ConnectionGraphicsObject *>(item) != nullptr;
      for (auto *ancestor = item; ancestor && !onCard; ancestor = ancestor->parentItem()) {
        onCard = qgraphicsitem_cast<NodeGraphicsObject *>(ancestor) != nullptr;
      }
      if (onCard) {
        pane = false;
        break;
      }
    }
    if (pane) {
      cancelGesture();
      emit paneDoubleClicked(event->scenePos());
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
  if (draftFeedback_) {
    draftFeedback_ = false;
    updateBranchDimming();
    repaintCards();
  }
}
bool EditorScene::beginReconnect(ConnectionId connection, PortType side) {
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
  draft->setZValue(kDraftWireZ);
  draft->setEndPoint(side, draft->mapFromScene(point));
  return true;
}

void EditorScene::mousePressEvent(QGraphicsSceneMouseEvent *event) {
    footerPress_ = InvalidNodeId;
    outputFormPress_ = false;
    if (event->button() == Qt::LeftButton) {
        for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
            auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
            if (!node) { continue; }
            const auto &layout = model_.layout(node->nodeId());
            if (layout.addOutput && !model_.readOnly() && layout.outputFormRect().contains(node->mapFromScene(event->scenePos()))) {
                footerPress_ = node->nodeId();
                outputFormPress_ = true;
                event->accept();
                return;
            }
            if (layout.subgraph && layout.footerRect().adjusted(0, 0, -16, 0).contains(node->mapFromScene(event->scenePos()))) {
                footerPress_ = node->nodeId();
                event->accept();
                return;
            }
            break;
        }
    }
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
    // A button in the last row, such as a document select's open button, takes the press
    // before the corner resize zone that overlaps it.
    const auto local = node->mapFromScene(point);
    const bool overButton = std::any_of(layout.rows.cbegin(), layout.rows.cend(), [&local](const NodeRow &row) {
      return row.kind == NodeRowKind::Action && !row.rect.isEmpty() && row.rect.contains(local);
    });
    if (handle.contains(point) && !layout.collapsed && !overButton) {
      target = id;
      edges = Qt::RightEdge | Qt::BottomEdge;
      break;
    }
    if (bounds.contains(point) && pressCardControl(id, node->mapFromScene(point))) {
        inlinePress_ = true;
        event->accept();
        restoreGroupOrder();
        return;
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
    if (node->isSelected() && !layout.collapsed) {
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
    beginNodeDrag(event);
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
  if (!model_.isGroup(target) && !model_.isComment(target) && edges != (Qt::RightEdge | Qt::BottomEdge)) { minimumSize_.setWidth(std::max(200, minimumSize_.width())); }
  gestureSelected_.clear();
  gesturePositions_.clear();
  for (const auto id : model_.allNodeIds()) {
    gesturePositions_[id] = model_.nodeData(id, NodeRole::Position).toPointF();
    if (auto selected = nodeGraphicsObject(id); selected && selected->isSelected()) { gestureSelected_.append(id); }
  }
  event->accept();
  restoreGroupOrder();
}

bool EditorScene::pressCardControl(NodeId id, const QPointF &local) {
    // A copy: selecting and every control action can rebuild this card's layout.
    const auto layout = model_.layout(id);
    const auto resource = model_.resourceId(id);
    if (const auto report = reportErrorRect(model_, id, layout); !report.isEmpty() && report.contains(local)) {
        emit errorReportRequested(resource);
        return true;
    }
    for (const auto &row : layout.rows) {
        if (!row.renameButtonRect.isEmpty() && row.renameButtonRect.contains(local)) {
            if (auto *item = nodeGraphicsObject(id)) {
                emit dynamicPortFormRequested(resource, false, row.propertyName, item->mapRectToScene(row.renameLabelRect));
            }
            return true;
        }
        if (!row.typeChipRect.isEmpty() && row.typeChipRect.contains(local)) {
            if (auto *item = nodeGraphicsObject(id)) {
                emit dynamicTypeMenuRequested(resource, row.propertyName, item->mapRectToScene(row.typeChipRect));
            }
            return true;
        }
        // The X removes the value, the declaration and the wires in one step.
        if (!row.removeButtonRect.isEmpty() && row.removeButtonRect.contains(local)) {
            if (model_.commit) { model_.commit({{"op", "removeDynamicInput"}, {"id", resource}, {"name", row.propertyName}}); }
            return true;
        }
        if (!row.rect.contains(local)) { continue; }
        const auto select = [this, id] {
            auto *item = nodeGraphicsObject(id);
            if (item && (!item->isSelected() || selectedItems().size() != 1)) {
                clearSelection();
                item->setSelected(true);
            }
            emit nodeSelected(id);
        };
        if (row.kind == NodeRowKind::Segmented) {
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
        if (row.kind == NodeRowKind::Action) {
            if (row.action == QStringLiteral("addOutput")) {
                if (layout.body == CardBody::Content) { emit outputFormRequested(resource); }
                else if (auto *item = nodeGraphicsObject(id)) {
                    emit dynamicPortFormRequested(resource, true, {}, item->mapRectToScene(row.rect));
                }
                return true;
            }
            // Constant String's header buttons name their property in `value`.
            if (row.action == QStringLiteral("copyValue")) {
                select();
                QGuiApplication::clipboard()->setText(model_.nodeSnapshot(id)["data"].toObject()[row.value].toString());
                return true;
            }
            if (row.action == QStringLiteral("openDocument")) {
                select();
                const auto reference = model_.nodeSnapshot(id)["data"].toObject()[row.propertyName].toObject();
                if (!reference["id"].toString().isEmpty()) { emit documentOpenRequested(row.value, reference["id"].toString()); }
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
                if (auto *item = nodeGraphicsObject(id)) {
                    emit dynamicPortFormRequested(resource, false, {}, item->mapRectToScene(row.rect));
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
                for (const auto &entry : model_.metadata(id)["properties"].toArray()) { taken.insert(entry.toObject()["name"].toString()); }
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
                model_.commit({{"op", "batch"}, {"commands", QJsonArray{
                    model_.propertyCommand(id, QStringLiteral("width"), row.number),
                    model_.propertyCommand(id, QStringLiteral("height"), row.number)}}});
            } else if (row.action == QStringLiteral("runNode")) {
                // RunModelButton runs this node on its own, as Run node does.
                if (auto *item = nodeGraphicsObject(id)) {
                    if (!item->isSelected() || selectedItems().size() != 1) { clearSelection(); item->setSelected(true); }
                }
                emit nodeSelected(id);
                emit nodeRunRequested(model_.resourceId(id));
            } else if (row.action == QStringLiteral("insertVariable")) {
                const auto prompt = node["data"].toObject()["prompt"].toString();
                model_.commit(model_.propertyCommand(id, QStringLiteral("prompt"), prompt + QStringLiteral("{{ %1 }}").arg(row.value)));
            } else if (row.action == QStringLiteral("addColumn")) {
                model_.commit(model_.addDataframeColumnCommand(id, row.propertyName));
            } else if (row.action == QStringLiteral("toggleProperty")) {
                model_.commit(model_.propertyCommand(id, row.propertyName, !row.checked));
            } else if (row.action == QStringLiteral("resetCrop")) {
                // CropBody's Reset selects the whole image, or 512 square before one arrives.
                QSizeF bounds(512, 512);
                for (const auto &crop : layout.rows) {
                    if (crop.kind == NodeRowKind::Crop) { bounds = QSizeF(crop.minimum, crop.maximum); }
                }
                model_.commit({{"op", "batch"}, {"commands", QJsonArray{
                    model_.propertyCommand(id, QStringLiteral("left"), 0), model_.propertyCommand(id, QStringLiteral("top"), 0),
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
                model_.commit({{"op", "batch"}, {"commands", QJsonArray{
                    model_.propertyCommand(id, QStringLiteral("angle"), 0),
                    model_.propertyCommand(id, QStringLiteral("flip_horizontal"), false),
                    model_.propertyCommand(id, QStringLiteral("flip_vertical"), false)}}});
            }
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
        if (row.kind == NodeRowKind::Slider) {
            select();
            if (row.checked) { return true; }
            sliderNode_ = id;
            sliderProperty_ = row.propertyName;
            sliderOrigin_ = row.number;
            sliderValue_ = sliderValueAt(row, local.x());
            if (auto *item = nodeGraphicsObject(id)) { item->update(); }
            if (sliderValue_ != sliderOrigin_) { emit sliderDraftChanged(id, sliderProperty_, sliderValue_); }
            return true;
        }
    }
    return false;
}
void EditorScene::moveSlider(const QPointF &scenePosition) {
    auto *item = nodeGraphicsObject(sliderNode_);
    if (!item) { finishSlider(false); return; }
    for (const auto &row : model_.layout(sliderNode_).rows) {
        if (row.kind == NodeRowKind::Slider && row.propertyName == sliderProperty_) {
            const auto value = sliderValueAt(row, item->mapFromScene(scenePosition).x());
            if (value == sliderValue_) { return; }
            sliderValue_ = value;
            item->update();
            emit sliderDraftChanged(sliderNode_, sliderProperty_, value);
            return;
        }
    }
}
void EditorScene::moveCrop(const QPointF &scenePosition) {
    auto *item = nodeGraphicsObject(cropNode_);
    if (!item) { finishCrop(false); return; }
    for (const auto &row : model_.layout(cropNode_).rows) {
        if (row.kind != NodeRowKind::Crop || row.rect.isEmpty()) { continue; }
        const auto local = item->mapFromScene(scenePosition);
        // Card pixels to image pixels, as renderedScale.
        const QPointF delta((local.x() - cropPointer_.x()) * row.minimum / row.rect.width(),
                            (local.y() - cropPointer_.y()) * row.maximum / row.rect.height());
        const auto value = cropDragged(cropHandle_, cropStart_, delta, QSizeF(row.minimum, row.maximum), row.step);
        if (value == cropValue_) { return; }
        cropValue_ = value;
        item->update();
        return;
    }
}
void EditorScene::finishCrop(bool commit) {
    const auto id = cropNode_;
    const auto value = cropValue_;
    cropNode_ = InvalidNodeId;
    cropHandle_.clear();
    if (auto *item = nodeGraphicsObject(id)) { item->update(); }
    // One drag writes the four edges together, so a single undo step reverts it.
    if (commit && model_.nodeExists(id) && value != cropStart_ && model_.commit) {
        model_.commit({{"op", "batch"}, {"commands", QJsonArray{
            model_.propertyCommand(id, QStringLiteral("left"), value.left()),
            model_.propertyCommand(id, QStringLiteral("top"), value.top()),
            model_.propertyCommand(id, QStringLiteral("right"), value.right()),
            model_.propertyCommand(id, QStringLiteral("bottom"), value.bottom())}}});
    }
}
void EditorScene::finishSlider(bool commit) {
    const auto id = sliderNode_;
    const auto name = sliderProperty_;
    const auto value = sliderValue_;
    sliderNode_ = InvalidNodeId;
    sliderProperty_.clear();
    if (auto *item = nodeGraphicsObject(id)) { item->update(); }
    // One drag commits one value, so a single undo step reverts it.
    if (commit && model_.nodeExists(id) && value != sliderOrigin_ && model_.commit) {
        model_.commit(model_.propertyCommand(id, name, value));
    }
}
void EditorScene::mouseMoveEvent(QGraphicsSceneMouseEvent *event) {
    // The connectable styling covers every card, so a drag start repaints them.
    const bool drafting = draftEnd().node != InvalidNodeId;
    // A dragged wire draws above every card (QtNodes gives a connection z -1).
    if (drafting) {
        if (auto draft = qgraphicsitem_cast<ConnectionGraphicsObject *>(mouseGrabberItem())) { draft->setZValue(kDraftWireZ); }
    }
    // The base class' hover handling resets a card's cursor, so the handle cursor is set last.
    const auto cursorGuard = qScopeGuard([this, drafting] { refreshHandleCursor(drafting); });
    if (drafting != draftFeedback_) {
        draftFeedback_ = drafting;
        updateBranchDimming();
        repaintCards();
    }
    if (sliderNode_ != InvalidNodeId) {
        moveSlider(event->scenePos());
        event->accept();
        return;
    }
    if (cropNode_ != InvalidNodeId) {
        moveCrop(event->scenePos());
        event->accept();
        return;
    }
    updateHandleHover(event->scenePos());
    if (auto *old = nodeGraphicsObject(footerHover_)) {
        old->setProperty("footerHovered", false);
        old->setToolTip({});
        old->update();
    }
    footerHover_ = InvalidNodeId;
    for (auto *item : items(event->scenePos(), Qt::IntersectsItemShape, Qt::DescendingOrder)) {
        auto *node = qgraphicsitem_cast<NodeGraphicsObject *>(item);
        if (!node) { continue; }
        const auto &layout = model_.layout(node->nodeId());
        const bool hovered = layout.subgraph && layout.footerRect().contains(node->mapFromScene(event->scenePos()));
        footerHover_ = hovered ? node->nodeId() : InvalidNodeId;
        node->setProperty("footerHovered", hovered);
        node->setToolTip(hovered ? tr("Open the subgraph in its own tab") : QString{});
        node->update();
        break;
    }
    if (footerPress_ != InvalidNodeId) {
        event->accept();
        return;
    }
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
    trackNodeDrag(event);
  }
  restoreGroupOrder();
}

void EditorScene::mouseReleaseEvent(QGraphicsSceneMouseEvent *event) {
    refreshHandleCursor(false);
    // The paint after this release runs without the draft, so the cards return to normal.
    if (draftFeedback_) {
        draftFeedback_ = false;
        updateBranchDimming();
        repaintCards();
    }
    if (sliderNode_ != InvalidNodeId && event->button() == Qt::LeftButton) {
        moveSlider(event->scenePos());
        finishSlider(true);
        inlinePress_ = false;
        event->accept();
        return;
    }
    if (cropNode_ != InvalidNodeId && event->button() == Qt::LeftButton) {
        moveCrop(event->scenePos());
        finishCrop(true);
        inlinePress_ = false;
        event->accept();
        return;
    }
    if (footerPress_ != InvalidNodeId) {
        const auto id = footerPress_;
        footerPress_ = InvalidNodeId;
        auto *item = nodeGraphicsObject(id);
        const auto rect = outputFormPress_ ? model_.layout(id).outputFormRect() : model_.layout(id).footerRect();
        if (event->button() == Qt::LeftButton && item && rect.contains(item->mapFromScene(event->scenePos()))) {
            if (outputFormPress_) { emit outputFormRequested(model_.resourceId(id)); }
            else { emit childOpenRequested(model_.resourceId(id)); }
        }
        outputFormPress_ = false;
        event->accept();
        return;
    }
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
    bool refused = false;
    if (body && !ownHandle) {
      for (const auto side : {PortType::In, PortType::Out}) {
        const auto hit = nodeGeometry().checkPortHit(body->nodeId(), side, body->mapFromScene(event->scenePos()));
        if (hit != InvalidPortIndex && QLineF(nodeGeometry().portPosition(body->nodeId(), side, hit), body->mapFromScene(event->scenePos())).length() <= nm::handleDiameter / 2 + nm::handleRing / 2) {
          otherHandle = true;
          ConnectionId candidate{InvalidNodeId, 0, InvalidNodeId, 0};
          if (side == PortType::In) { candidate = ConnectionId{node, index, body->nodeId(), hit}; }
          else { candidate = ConnectionId{body->nodeId(), hit, node, index}; }
          refused = side == port || !model_.connectionPossible(candidate);
        }
      }
    }
    if (body && otherHandle && refused) {
      resetDraftConnection();
      emit connectionRefused();
      event->accept();
      restoreGroupOrder();
      return;
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
  else {
    BasicGraphicsScene::mouseReleaseEvent(event);
    endNodeDrag();
  }
  gesturePositions_.clear();
  restoreGroupOrder();
}

double EditorScene::commentContentHeight(const QString &markdown, double cardWidth) const {
  QTextDocument text;
  text.setDefaultFont(canvasFont(theme_, 15, QFont::Normal));
  text.setMarkdown(markdown);
  text.setTextWidth(std::max(1.0, cardWidth - 40));
  return text.size().height() + 32 + 2;
}

void EditorScene::beginNodeDrag(const QGraphicsSceneMouseEvent *event) {
  dragNode_ = InvalidNodeId;
  dragMoved_ = false;
  dragDetach_ = false;
  outcome_ = {};
  if (event->button() != Qt::LeftButton || model_.readOnly()) { return; }
  const auto *grabbed = qgraphicsitem_cast<NodeGraphicsObject *>(mouseGrabberItem());
  if (!grabbed || model_.isGroup(grabbed->nodeId()) || model_.isReroute(grabbed->nodeId())) { return; }
  dragNode_ = grabbed->nodeId();
  dragStart_ = event->screenPos();
  wiggle_.reset();
  dragClock_.start();
}

// onNodeDrag in useDragHandlers.ts: Alt or a shake takes a grouped card out of
// its group, and the group the card overlaps is the one it joins on release.
void EditorScene::trackNodeDrag(const QGraphicsSceneMouseEvent *event) {
  if (dragNode_ == InvalidNodeId || !(event->buttons() & Qt::LeftButton) || !model_.nodeExists(dragNode_)) { return; }
  const auto *item = nodeGraphicsObject(dragNode_);
  if (!item) { return; }
  if (!dragMoved_) {
    if ((event->screenPos() - dragStart_).manhattanLength() < 4) { return; }
    dragMoved_ = true;
    emit nodeDragChanged(true);
  }
  wiggle_.add(event->screenPos(), dragClock_.elapsed());
  const bool grouped = !model_.nodeSnapshot(dragNode_)["parent_id"].toString().isEmpty();
  if (grouped && ((event->modifiers() & Qt::AltModifier) || wiggle_.wiggling())) { dragDetach_ = true; }
  const QRectF card(item->scenePos(), model_.layout(dragNode_).size);
  auto target = InvalidNodeId;
  double smallest = 0;
  for (const auto id : model_.allNodeIds()) {
    if (!model_.isGroup(id)) { continue; }
    const auto *group = nodeGraphicsObject(id);
    if (!group) { continue; }
    const QRectF frame(group->scenePos(), model_.layout(id).size);
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
  for (const auto id : {previous, target}) {
    if (auto *group = nodeGraphicsObject(id)) { group->update(); }
  }
}

void EditorScene::endNodeDrag() {
  if (dragMoved_) {
    outcome_ = {dropGroup_, dragDetach_};
    emit nodeDragChanged(false);
  }
  const auto group = dropGroup_;
  dragNode_ = InvalidNodeId;
  dropGroup_ = InvalidNodeId;
  dragMoved_ = false;
  dragDetach_ = false;
  if (auto *item = nodeGraphicsObject(group)) { item->update(); }
}

EditorScene::DragOutcome EditorScene::takeDragOutcome() {
  const auto result = outcome_;
  outcome_ = {};
  return result;
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
    if (event->key() == Qt::Key_Escape && sliderNode_ != InvalidNodeId) {
        finishSlider(false);
        event->accept();
        return;
    }
    if (event->key() == Qt::Key_Escape && cropNode_ != InvalidNodeId) {
        finishCrop(false);
        event->accept();
        return;
    }
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
    active = active || model_.runningShown(id);
    for (const auto &edge : model_.allConnectionIds(id)) { active = active || model_.runtimeWireFlowing(edge); }
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
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000 screen
  // pixels right and down, in the palette's c_editor_axis_color.
  const auto axisLength = axisMarkerLength / std::max(std::abs(zoom), 1e-6);
  const QLineF axes[] = {{0, 0, axisLength, 0}, {0, 0, 0, axisLength}};
  painter->setPen(QPen(axisMarkerColor(theme_.canvas.lightnessF() < .5), 0));
  painter->drawLines(axes, 2);
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
    painter->setOpacity(painter->opacity() * item->opacity());
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
      if (!model_.portVisible(node->nodeId(), PortType::Out, i) || model_.ports(node->nodeId(), PortType::Out)[i].toObject()["name"] == "__control__") { continue; }
      painter->setPen(typeColor(model_.portData<NodeDataType>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::DataType).id));
      painter->drawText(QRectF(origin.x() + layout.size.width() + 10, origin.y() + layout.outputY[i] - nm::rowHeight / 2, 200, nm::rowHeight),
                        Qt::AlignLeft | Qt::AlignVCenter,
                        model_.portData<QString>(node->nodeId(), PortType::Out, PortIndex(i), PortRole::Caption));
    }
  }
}
} // namespace nodetool
