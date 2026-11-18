#include "WirePainter.h"
#include "graph/NodeLayout.h"
#include <QPainter>
#include <QPainterPathStroker>
#include <algorithm>

namespace nodetool::canvas {
namespace {
namespace nm = node_metrics;

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
                 channel(0.213 - 0.213 * saturate, 0.715 - 0.715 * saturate, 0.072 + 0.928 * saturate), color.alphaF());
  return tinted;
}

QPainterPath wirePath(const WirePaintState &state) {
  return state.control && !state.draft ? controlWireCurve(state.out, state.in) : wireCurve(state.out, state.in);
}
} // namespace

void WirePainter::paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state) {
  if (!state.visible) { return; }
  painter->setRenderHint(QPainter::Antialiasing);
  painter->setBrush(Qt::NoBrush);
  const auto path = wirePath(state);
  if (state.control && !state.draft) {
    // ControlEdge.tsx: amber, dashed 8 4, 2 wide at 0.7 opacity and 3 wide at full opacity when selected.
    // Hover widens it to 3 and lifts it to full opacity (handle_edge_tooltip.css .control-edge:hover).
    const bool selected = state.selected;
    const bool raised = selected || state.hovered;
    const double width = raised ? nm::controlWireSelectedWidth : nm::controlWireWidth;
    if (selected) {
      // A selected control wire casts a 0 0 3px glow at 50 percent of its amber.
      painter->setPen(QPen(withOpacity(theme.controlWire, 0.25), width + 4, Qt::SolidLine, Qt::RoundCap));
      painter->drawPath(path);
    }
    QPen pen(theme.controlWire, width, Qt::CustomDashLine, Qt::FlatCap);
    pen.setDashPattern({nm::controlWireDashOn / width, nm::controlWireDashOff / width});
    painter->setOpacity(painter->opacity() * (raised ? 1.0 : nm::controlWireOpacity));
    painter->setPen(pen);
    painter->drawPath(path);
    return;
  }
  if (state.draft) {
    // The web connection line: a 6 px glow at 0.15, a 2.5 px stroke dashed
    // 8 4 for control wires, and a 6 px dot at the pointer
    // (components/node_editor/ConnectionLine.tsx:25-87).
    const auto &type = state.sourceColor;
    const bool control = state.control;
    painter->setPen(QPen(withOpacity(type, connectingGlowOpacity), connectingGlowWidth, Qt::SolidLine, Qt::RoundCap));
    painter->drawPath(path);
    QPen stroke(type, connectingWireWidth, control ? Qt::CustomDashLine : Qt::SolidLine, Qt::RoundCap);
    if (control) { stroke.setDashPattern({8 / connectingWireWidth, 4 / connectingWireWidth}); }
    painter->setPen(stroke);
    painter->drawPath(path);
    const auto pointer = state.draftFromOutput ? state.in : state.out;
    painter->setPen(QPen(withOpacity(type, 0.4), 1.5));
    painter->setBrush(withOpacity(type, 0.9));
    painter->drawEllipse(pointer, connectingDotRadius, connectingDotRadius);
    return;
  }
  const bool disabled = state.bypassed;
  const auto &source = state.sourceColor;
  const auto &target = state.targetColor;
  const bool selected = state.selected || state.endpointSelected;
  const bool hovered = state.hovered;
  const bool streaming = state.streaming;
  const bool flowing = state.flowing;
  const bool messageSent = state.messageSent;
  const bool zoomedOut = state.zoom <= zoomedOutThreshold;
  // CustomEdge draws the selected glow and the hover filter applies for every edge,
  // bypassed ones included.
  if (selected) {
    painter->setPen(QPen(withOpacity(source, nm::wireGlowOpacity), nm::wireGlowWidth, Qt::SolidLine, Qt::RoundCap));
    painter->drawPath(path);
  }
  // The web's edge hover: 4 wide at full opacity with a brighter, more saturated stroke.
  if (hovered) {
    painter->setPen(QPen(withOpacity(Qt::white, nm::wireHoverGlowOpacity), nm::wireHoverWidth + nm::wireHoverGlowSpread,
                         Qt::SolidLine, Qt::RoundCap));
    painter->drawPath(path);
  }
  const bool connecting = state.connecting;
  // The most specific rule wins: selected and hover are 1, then a streaming edge's 0.8,
  // then a flowing edge's 1, then the static 0.5. A bypassed edge's element opacity is 0.5.
  const double strokeOpacity = (selected || hovered) ? 1.0
                               : streaming           ? streamingWireOpacity
                               : flowing             ? 1.0
                                                     : nm::wireOpacity;
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
  const auto width = hovered     ? nm::wireHoverWidth
                     : streaming ? (selected || flowing ? nm::wireStreamingWidth : streamingWireWidth)
                     : zoomedOut ? zoomedWireWidth
                     : selected  ? nm::wireSelectedWidth
                                 : nm::wireWidth;
  // Dashes are in user units, not stroke widths. A status of message_sent sets 14 10 inline.
  // Otherwise a flowing edge in reduced motion is 4 2, a streaming edge 30 3 (8 when
  // selected) and a bypassed edge 5 5.
  QVector<qreal> dash;
  if (flowing && messageSent) {
    dash = {flowDashOn, flowDashOff};
  } else if (flowing && !state.animationActive && !streaming) {
    dash = {flowReducedDashOn, flowReducedDashOff};
  } else if (streaming) {
    dash = selected ? QVector<qreal>{streamingSelectedDash, streamingSelectedDash}
                    : QVector<qreal>{streamingDashOn, streamingDashOff};
  } else if (flowing) {
    dash = {flowDashOn, flowDashOff};
  } else if (disabled) {
    dash = {bypassedDash, bypassedDash};
  }
  // A flowing edge has round caps and scrolls 120 px a second (edgeFlow, MOTION.spin).
  QPen pen(stroke, width, Qt::SolidLine, flowing ? Qt::RoundCap : Qt::FlatCap);
  if (!dash.isEmpty()) {
    pen.setStyle(Qt::CustomDashLine);
    QVector<qreal> pattern;
    for (const auto length : dash) { pattern.append(length / width); }
    pen.setDashPattern(pattern);
    if (flowing && state.animationActive) { pen.setDashOffset(-flowSpeed * state.animationPhase / width); }
  }
  painter->setPen(pen);
  painter->drawPath(path);
  // The web's CustomEdge shows the stream count of an edge that carried more
  // than one item, in a pill on the wire.
  const auto counter = state.counter;
  if (counter > 1) {
    const QFont font = canvasFont(theme, nm::fontValue, QFont::DemiBold);
    const auto text = QString::number(counter);
    const QFontMetricsF metrics(font);
    const QSizeF size(metrics.horizontalAdvance(text) + 2 * nm::wireBadgePaddingX,
                      metrics.height() + 2 * nm::wireBadgePaddingY);
    const QRectF pill(path.pointAtPercent(0.5) - QPointF(size.width() / 2, size.height() / 2), size);
    painter->setPen(selected ? QPen(theme.divider, nm::borderWidth) : QPen(Qt::NoPen));
    painter->setBrush(theme.canvas);
    painter->drawRoundedRect(pill, size.height() / 2, size.height() / 2);
    painter->setPen(theme.textPrimary);
    painter->setFont(font);
    painter->drawText(pill, Qt::AlignCenter, text);
  }
}

QPainterPath WirePainter::hitStroke(const WirePaintState &state) {
  if (!state.visible) { return {}; }
  QPainterPathStroker stroker;
  stroker.setWidth(nm::wireHitWidth);
  return stroker.createStroke(wirePath(state));
}
} // namespace nodetool::canvas
