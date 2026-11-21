#include "WirePainter.h"
#include "graph/NodeLayout.h"
#include <QImage>
#include <QPainter>
#include <QPainterPathStroker>
#include <QVarLengthArray>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>

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

void flattenCubic(const QPointF &p0, const QPointF &p1, const QPointF &p2, const QPointF &p3, double tolSq,
                  QVarLengthArray<QPointF, 64> &out, int depth = 0) {
  const double dx = p3.x() - p0.x();
  const double dy = p3.y() - p0.y();
  const double d2 = std::abs((p1.x() - p3.x()) * dy - (p1.y() - p3.y()) * dx);
  const double d3 = std::abs((p2.x() - p3.x()) * dy - (p2.y() - p3.y()) * dx);
  const double lenSq = dx * dx + dy * dy;
  if (depth >= 8 || ((d2 + d3) * (d2 + d3) <= tolSq * lenSq)) {
    out.append(p3);
    return;
  }
  const QPointF p01 = (p0 + p1) * 0.5;
  const QPointF p12 = (p1 + p2) * 0.5;
  const QPointF p23 = (p2 + p3) * 0.5;
  const QPointF p012 = (p01 + p12) * 0.5;
  const QPointF p123 = (p12 + p23) * 0.5;
  const QPointF mid = (p012 + p123) * 0.5;
  flattenCubic(p0, p01, p012, mid, tolSq, out, depth + 1);
  flattenCubic(mid, p123, p23, p3, tolSq, out, depth + 1);
}

inline void blendPremul(uint32_t *px, uint32_t r, uint32_t g, uint32_t b, uint32_t a, bool opaqueDest) {
  if (a == 0) { return; }
  const uint32_t inv = 255 - a;
  const uint32_t dst = *px;
  const uint32_t sr = (r * a + 127) / 255;
  const uint32_t sg = (g * a + 127) / 255;
  const uint32_t sb = (b * a + 127) / 255;
  const uint32_t outA = opaqueDest ? 255u : (a + (((dst >> 24) * inv + 127) / 255));
  const uint32_t outR = sr + ((((dst >> 16) & 255u) * inv + 127) / 255);
  const uint32_t outG = sg + ((((dst >> 8) & 255u) * inv + 127) / 255);
  const uint32_t outB = sb + (((dst & 255u) * inv + 127) / 255);
  *px = (outA << 24) | (outR << 16) | (outG << 8) | outB;
}

struct DirectTarget {
  QImage *image = nullptr;
  QTransform devTransform;
  QRect clip;
  bool opaqueDest = false;
};

// Validates that painter targets a detached ARGB32_Premultiplied / RGB32 QImage
// with a uniform scale+translate transform and a single rectangular clip.
std::optional<DirectTarget> resolveDirectTarget(QPainter *painter, const QRect *precomputedClip) {
  auto *img = dynamic_cast<QImage *>(painter->device());
  if (!img || !img->isDetached() || painter->compositionMode() != QPainter::CompositionMode_SourceOver) {
    return std::nullopt;
  }
  const auto fmt = img->format();
  if (fmt != QImage::Format_ARGB32_Premultiplied && fmt != QImage::Format_RGB32) { return std::nullopt; }
  const QTransform devXf = painter->deviceTransform();
  if (devXf.type() > QTransform::TxScale || !qFuzzyCompare(devXf.m11(), devXf.m22()) || !(devXf.m11() > 0)) {
    return std::nullopt;
  }
  QRect clip;
  if (precomputedClip) {
    clip = precomputedClip->intersected(img->rect());
  } else if (!painter->hasClipping()) {
    clip = img->rect();
  } else {
    if (painter->clipRegion().rectCount() > 1) { return std::nullopt; }
    const QRectF devRect = devXf.mapRect(painter->clipBoundingRect());
    const int left = int(std::floor(devRect.left() + 0.5));
    const int top = int(std::floor(devRect.top() + 0.5));
    const int right = int(std::floor(devRect.right() + 0.5));
    const int bottom = int(std::floor(devRect.bottom() + 0.5));
    clip = QRect(left, top, right - left, bottom - top).intersected(img->rect());
  }
  return DirectTarget{img, devXf, clip, fmt == QImage::Format_RGB32};
}

// Fast anti-aliased solid-curve stroker directly onto ARGB32_Premultiplied /
// RGB32 QImage buffers. Avoids Qt's QRasterPaintEngine translucent-stroke
// slowdown on dense semi-transparent wires while partitioning interior vertices
// with bisecting miter planes so adjacent segments never double-blend or gap.
void paintSolidWireDirect(const DirectTarget &target, const QPointF &out, const QPointF &in, double sceneWidth,
                          const QColor &c0, const QColor &c1, double opacity, bool roundCap) {
  if (target.clip.isEmpty()) { return; }
  const float alphaF = float(std::clamp(opacity, 0.0, 1.0));
  if (alphaF <= 0.0f) { return; }

  const QRect &clip = target.clip;
  const QTransform &devXf = target.devTransform;
  const double distance = in.x() - out.x();
  const double offset =
      distance >= 0 ? 0.5 * distance : std::min(0.25 * 25 * std::sqrt(-distance), nm::wireMaxReverseOffset);
  const QPointF p0 = devXf.map(out);
  const QPointF p1 = devXf.map(out + QPointF(offset, 0));
  const QPointF p2 = devXf.map(in - QPointF(offset, 0));
  const QPointF p3 = devXf.map(in);

  const float devWidth = float(sceneWidth * devXf.m11());
  const float halfW = devWidth * 0.5f;
  const float pad = halfW + 1.5f;
  const double minBx = std::min({p0.x(), p1.x(), p2.x(), p3.x()}) - pad;
  const double maxBx = std::max({p0.x(), p1.x(), p2.x(), p3.x()}) + pad;
  const double minBy = std::min({p0.y(), p1.y(), p2.y(), p3.y()}) - pad;
  const double maxBy = std::max({p0.y(), p1.y(), p2.y(), p3.y()}) + pad;
  if (maxBx < clip.left() || minBx > clip.right() + 1 || maxBy < clip.top() || minBy > clip.bottom() + 1) { return; }

  QVarLengthArray<QPointF, 64> poly;
  poly.append(p0);
  flattenCubic(p0, p1, p2, p3, 0.25 * 0.25, poly);

  qsizetype m = 1;
  for (qsizetype i = 1; i < poly.size(); ++i) {
    const double dx = poly[i].x() - poly[m - 1].x();
    const double dy = poly[i].y() - poly[m - 1].y();
    if (dx * dx + dy * dy > 1e-6) { poly[m++] = poly[i]; }
  }
  poly.resize(m);
  if (m < 2) { return; }

  QVarLengthArray<QPointF, 64> tangents(m - 1);
  for (qsizetype i = 0; i + 1 < m; ++i) {
    const double dx = poly[i + 1].x() - poly[i].x();
    const double dy = poly[i + 1].y() - poly[i].y();
    const double len = std::hypot(dx, dy);
    tangents[i] = QPointF(dx / len, dy / len);
  }

  const bool hasGrad = c0 != c1;
  const bool opaqueDest = target.opaqueDest;
  const float ox = float(p0.x()), oy = float(p0.y());
  const float gx = float(p3.x() - p0.x()), gy = float(p3.y() - p0.y());
  const float gradLenSq = gx * gx + gy * gy;
  const float invGradLenSq = gradLenSq > 1e-6f ? (1.0f / gradLenSq) : 0.0f;

  const uint32_t ur0 = uint32_t(c0.red()), ug0 = uint32_t(c0.green()), ub0 = uint32_t(c0.blue());
  const float r0 = float(ur0), g0 = float(ug0), b0 = float(ub0);
  const float dr = float(c1.red()) - r0, dg = float(c1.green()) - g0, db = float(c1.blue()) - b0;

  uint8_t *baseBits = target.image->bits();
  const qsizetype stride = target.image->bytesPerLine();

  for (qsizetype i = 0; i + 1 < m; ++i) {
    const float ax = float(poly[i].x()), ay = float(poly[i].y());
    const float bx = float(poly[i + 1].x()), by = float(poly[i + 1].y());
    const int minY = std::max(clip.top(), int(std::floor(std::min(ay, by) - pad)));
    const int maxY = std::min(clip.bottom(), int(std::ceil(std::max(ay, by) + pad)));
    const int minX = std::max(clip.left(), int(std::floor(std::min(ax, bx) - pad)));
    const int maxX = std::min(clip.right(), int(std::ceil(std::max(ax, bx) + pad)));
    if (minX > maxX || minY > maxY) { continue; }

    const float tx = float(tangents[i].x()), ty = float(tangents[i].y());
    const float nx = -ty, ny = tx;
    const bool isFirst = i == 0;
    const bool isLast = i + 2 == m;

    float s0x = tx, s0y = ty;
    if (!isFirst) {
      const double sx = tangents[i - 1].x() + tx;
      const double sy = tangents[i - 1].y() + ty;
      const double sl = std::hypot(sx, sy);
      if (sl > 1e-6) {
        s0x = float(sx / sl);
        s0y = float(sy / sl);
      }
    }
    float s1x = tx, s1y = ty;
    if (!isLast) {
      const double sx = tx + tangents[i + 1].x();
      const double sy = ty + tangents[i + 1].y();
      const double sl = std::hypot(sx, sy);
      if (sl > 1e-6) {
        s1x = float(sx / sl);
        s1y = float(sy / sl);
      }
    }

    const bool verticalish = std::abs(nx) > 0.15f;
    const float invAbsNx = verticalish ? (1.0f / std::abs(nx)) : 0.0f;

    for (int y = minY; y <= maxY; ++y) {
      const float py = y + 0.5f;
      const float ry = py - ay;
      int lx = minX, rx = maxX;
      if (verticalish) {
        const float cx = ax - ry * ny / nx;
        const float span = pad * invAbsNx;
        lx = std::max(lx, int(std::floor(cx - span)));
        rx = std::min(rx, int(std::ceil(cx + span)));
      }
      if (lx > rx) { continue; }
      auto *row = reinterpret_cast<uint32_t *>(baseBits + qsizetype(y) * stride);
      const float rx0 = (lx + 0.5f) - ax;
      float perp = rx0 * nx + ry * ny;
      float d0 = rx0 * s0x + ry * s0y;
      float d1 = ((lx + 0.5f) - bx) * s1x + (py - by) * s1y;
      for (int x = lx; x <= rx; ++x, perp += nx, d0 += s0x, d1 += s1x) {
        float cov;
        if (roundCap) {
          if (!isFirst && d0 < 0.0f) { continue; }
          if (!isLast && d1 >= 0.0f) { continue; }
          const float dist = (isFirst && d0 < 0.0f)   ? std::hypot(d0, perp)
                             : (isLast && d1 > 0.0f)  ? std::hypot(d1, perp)
                                                      : std::abs(perp);
          cov = halfW + 0.5f - dist;
          if (cov <= 0.0f) { continue; }
          if (cov > 1.0f) { cov = 1.0f; }
        } else {
          float capCov = 1.0f;
          if (isFirst) {
            if (d0 <= -0.5f) { continue; }
            if (d0 < 0.5f) { capCov = d0 + 0.5f; }
          } else if (d0 < 0.0f) {
            continue;
          }
          if (isLast) {
            if (d1 >= 0.5f) { continue; }
            if (d1 > -0.5f) { capCov = std::min(capCov, 0.5f - d1); }
          } else if (d1 >= 0.0f) {
            continue;
          }
          float perpCov = halfW + 0.5f - std::abs(perp);
          if (perpCov <= 0.0f) { continue; }
          if (perpCov > 1.0f) { perpCov = 1.0f; }
          cov = perpCov * capCov;
        }
        const uint32_t a = uint32_t(cov * alphaF * 255.0f + 0.5f);
        if (!hasGrad) {
          blendPremul(row + x, ur0, ug0, ub0, a, opaqueDest);
        } else {
          const float u = std::clamp(((x + 0.5f - ox) * gx + (py - oy) * gy) * invGradLenSq, 0.0f, 1.0f);
          blendPremul(row + x, uint32_t(r0 + dr * u + 0.5f), uint32_t(g0 + dg * u + 0.5f),
                      uint32_t(b0 + db * u + 0.5f), a, opaqueDest);
        }
      }
    }
  }
}

void paintCounterBadge(QPainter *painter, const CanvasTheme &theme, const QPainterPath &path, int counter,
                       bool selected) {
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
} // namespace

void WirePainter::paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state) {
  paint(painter, theme, state, nullptr);
}

void WirePainter::paint(QPainter *painter, const CanvasTheme &theme, const WirePaintState &state,
                        const QRect *deviceClip) {
  if (!state.visible) { return; }
  const bool isStandard = !state.draft && !state.control;
  const bool disabled = state.bypassed;
  const bool streaming = state.streaming;
  const bool flowing = state.flowing;
  const bool selected = state.selected || state.endpointSelected;
  const bool hovered = state.hovered;
  if (isStandard && !disabled && !streaming && !flowing) {
    if (const auto target = resolveDirectTarget(painter, deviceClip)) {
      const auto &source = state.sourceColor;
      const auto &targetColor = state.targetColor;
      const bool zoomedOut = state.zoom <= zoomedOutThreshold;
      const double strokeOpacity = (selected || hovered) ? 1.0 : nm::wireOpacity;
      const double opacity = state.connecting ? wireConnectingOpacity : strokeOpacity;
      const auto sourceStroke = hovered ? hoverTint(source) : source;
      const auto targetStroke = hovered ? hoverTint(targetColor) : targetColor;
      const double width = hovered     ? nm::wireHoverWidth
                           : zoomedOut ? zoomedWireWidth
                           : selected  ? nm::wireSelectedWidth
                                       : nm::wireWidth;
      const double painterOpacity = painter->opacity();
      if (selected) {
        paintSolidWireDirect(*target, state.out, state.in, nm::wireGlowWidth, source, source,
                             nm::wireGlowOpacity * painterOpacity, true);
      }
      if (hovered) {
        paintSolidWireDirect(*target, state.out, state.in, nm::wireHoverWidth + nm::wireHoverGlowSpread, Qt::white,
                             Qt::white, nm::wireHoverGlowOpacity * painterOpacity, true);
      }
      paintSolidWireDirect(*target, state.out, state.in, width, sourceStroke, targetStroke, opacity * painterOpacity,
                           false);
      if (state.counter > 1) {
        painter->setRenderHint(QPainter::Antialiasing);
        paintCounterBadge(painter, theme, wirePath(state), state.counter, selected);
      }
      return;
    }
  }
  painter->setRenderHint(QPainter::Antialiasing);
  painter->setBrush(Qt::NoBrush);
  const auto path = wirePath(state);
  if (state.control && !state.draft) {
    // ControlEdge.tsx: amber, dashed 8 4, 2 wide at 0.7 opacity and 3 wide at full opacity when selected.
    // Hover widens it to 3 and lifts it to full opacity (handle_edge_tooltip.css .control-edge:hover).
    const bool selectedControl = state.selected;
    const bool raised = selectedControl || state.hovered;
    const double width = raised ? nm::controlWireSelectedWidth : nm::controlWireWidth;
    if (selectedControl) {
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
  const auto &source = state.sourceColor;
  const auto &target = state.targetColor;
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
    QLinearGradient gradient(state.out, state.in);
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
  if (state.counter > 1) { paintCounterBadge(painter, theme, path, state.counter, selected); }
}

QPainterPath WirePainter::path(const WirePaintState &state) { return state.visible ? wirePath(state) : QPainterPath{}; }

QPainterPath WirePainter::hitStroke(const WirePaintState &state) {
  if (!state.visible) { return {}; }
  QPainterPathStroker stroker;
  stroker.setWidth(nm::wireHitWidth);
  return stroker.createStroke(wirePath(state));
}
} // namespace nodetool::canvas
