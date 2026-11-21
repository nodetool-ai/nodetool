#include "WirePainter.h"
#include "graph/NodeLayout.h"
#include <QImage>
#include <QPainter>
#include <QPainterPathStroker>
#include <QSGGeometry>
#include <QVarLengthArray>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <vector>

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

namespace {
constexpr std::size_t kMaxWireVertices = 64000;

struct CubicBezier {
  QPointF p0, c1, c2, p3;
};

CubicBezier wireBezier(const WirePaintState &state) {
  if (state.control && !state.draft) {
    const double distance = state.in.y() - state.out.y();
    const double offset =
        distance >= 0 ? 0.5 * distance : std::min(6.25 * std::sqrt(-distance), nm::wireBoundsMargin / 0.75);
    return {state.out, state.out + QPointF(0, offset), state.in - QPointF(0, offset), state.in};
  }
  const double distance = state.in.x() - state.out.x();
  const double offset =
      distance >= 0 ? 0.5 * distance : std::min(0.25 * 25 * std::sqrt(-distance), nm::wireMaxReverseOffset);
  return {state.out, state.out + QPointF(offset, 0), state.in - QPointF(offset, 0), state.in};
}

double pointToSegmentDistSq(QPointF p, QPointF a, QPointF b) {
  const QPointF ab = b - a;
  const double lenSq = QPointF::dotProduct(ab, ab);
  if (lenSq <= 1e-12) {
    const QPointF d = p - a;
    return QPointF::dotProduct(d, d);
  }
  const double cross = ab.x() * (p.y() - a.y()) - ab.y() * (p.x() - a.x());
  return (cross * cross) / lenSq;
}

void flattenCubic(const CubicBezier &c, double flatnessSq, int depth, std::vector<QPointF> &out) {
  if (depth >= 7 ||
      (pointToSegmentDistSq(c.c1, c.p0, c.p3) <= flatnessSq &&
       pointToSegmentDistSq(c.c2, c.p0, c.p3) <= flatnessSq &&
       QPointF::dotProduct(c.c1 - c.p0, c.p3 - c.p0) >= -flatnessSq &&
       QPointF::dotProduct(c.c2 - c.p3, c.p0 - c.p3) >= -flatnessSq)) {
    if (out.empty() || QPointF::dotProduct(c.p3 - out.back(), c.p3 - out.back()) > 1e-8) {
      out.push_back(c.p3);
    }
    return;
  }
  const QPointF p01 = (c.p0 + c.c1) * 0.5;
  const QPointF p12 = (c.c1 + c.c2) * 0.5;
  const QPointF p23 = (c.c2 + c.p3) * 0.5;
  const QPointF p012 = (p01 + p12) * 0.5;
  const QPointF p123 = (p12 + p23) * 0.5;
  const QPointF mid = (p012 + p123) * 0.5;
  flattenCubic({c.p0, p01, p012, mid}, flatnessSq, depth + 1, out);
  flattenCubic({mid, p123, p23, c.p3}, flatnessSq, depth + 1, out);
}

QPointF normalized(QPointF v) {
  const double len = std::hypot(v.x(), v.y());
  return len > 1e-9 ? QPointF(v.x() / len, v.y() / len) : QPointF(1, 0);
}

struct WireMesh {
  std::vector<QSGGeometry::ColoredPoint2D> vertices;
  std::vector<quint16> indices;

  bool hasRoom(std::size_t extraVertices) const { return vertices.size() + extraVertices <= kMaxWireVertices; }

  quint16 addVertex(QPointF pos, const QColor &color, double alphaScale) {
    const double a = std::clamp(color.alphaF() * alphaScale, 0.0, 1.0);
    const auto byte = [](double v) -> unsigned char {
      return static_cast<unsigned char>(std::clamp(std::lround(v * 255.0), 0l, 255l));
    };
    QSGGeometry::ColoredPoint2D v;
    v.set(float(pos.x()), float(pos.y()), byte(color.redF() * a), byte(color.greenF() * a), byte(color.blueF() * a),
          byte(a));
    const auto idx = static_cast<quint16>(vertices.size());
    vertices.push_back(v);
    return idx;
  }

  void addTri(quint16 a, quint16 b, quint16 c) {
    indices.push_back(a);
    indices.push_back(b);
    indices.push_back(c);
  }

  void addQuad(quint16 a, quint16 b, quint16 c, quint16 d) {
    addTri(a, b, c);
    addTri(a, c, d);
  }

  template <typename ColorAt>
  void appendRoundCap(QPointF center, QPointF dir, QPointF normal, double innerHalf, double outerHalf,
                      double coverage, const ColorAt &colorAt) {
    constexpr int kSteps = 5;
    if (!hasRoom(1 + 2 * (kSteps + 1))) { return; }
    const QColor col = colorAt(center);
    const quint16 centerIdx = addVertex(center, col, coverage);
    quint16 prevInner = 0, prevOuter = 0;
    constexpr double kPi = 3.14159265358979323846;
    for (int s = 0; s <= kSteps; ++s) {
      const double angle = kPi * double(s) / double(kSteps);
      const QPointF radial = normal * (-std::cos(angle)) + dir * std::sin(angle);
      const quint16 curInner = addVertex(center + radial * innerHalf, col, coverage);
      const quint16 curOuter = addVertex(center + radial * outerHalf, col, 0.0);
      if (s > 0) {
        if (innerHalf > 1e-6) { addTri(centerIdx, prevInner, curInner); }
        addQuad(prevInner, prevOuter, curOuter, curInner);
      }
      prevInner = curInner;
      prevOuter = curOuter;
    }
  }

  template <typename ColorAt>
  void appendRibbon(const std::vector<QPointF> &pts, double width, double feather, const ColorAt &colorAt,
                    bool roundCap) {
    const std::size_t n = pts.size();
    if (n < 2) { return; }
    const double f = std::max(feather, 1e-4);
    const double coverage = std::min(1.0, width / f);
    const double innerHalf = std::abs(width - f) * 0.5;
    const double outerHalf = (width + f) * 0.5;
    const std::size_t needed = n * 4 + (roundCap ? 0 : 8);
    if (!hasRoom(needed)) { return; }

    const auto tangent = [&](std::size_t i) -> std::pair<QPointF, double> {
      if (i == 0) {
        const QPointF t = normalized(pts[1] - pts[0]);
        return {QPointF(-t.y(), t.x()), 1.0};
      }
      if (i + 1 == n) {
        const QPointF t = normalized(pts[n - 1] - pts[n - 2]);
        return {QPointF(-t.y(), t.x()), 1.0};
      }
      const QPointF t0 = normalized(pts[i] - pts[i - 1]);
      const QPointF t1 = normalized(pts[i + 1] - pts[i]);
      const QPointF sum = t0 + t1;
      const QPointF n1(-t1.y(), t1.x());
      if (QPointF::dotProduct(sum, sum) < 1e-6) { return {n1, 1.0}; }
      const QPointF bis = normalized(sum);
      const QPointF norm(-bis.y(), bis.x());
      const double denom = std::max(0.5, QPointF::dotProduct(norm, n1));
      return {norm, std::min(2.0, 1.0 / denom)};
    };

    const auto emitRow = [&](QPointF p, QPointF norm, double miter, double alphaMul) {
      const QColor col = colorAt(p);
      const double ih = innerHalf * miter;
      const double oh = outerHalf * miter;
      const quint16 base = addVertex(p - norm * oh, col, 0.0);
      addVertex(p - norm * ih, col, alphaMul);
      addVertex(p + norm * ih, col, alphaMul);
      addVertex(p + norm * oh, col, 0.0);
      return base;
    };

    const auto connectRows = [&](quint16 a, quint16 b) {
      addQuad(a + 0, b + 0, b + 1, a + 1);
      addQuad(a + 1, b + 1, b + 2, a + 2);
      addQuad(a + 2, b + 2, b + 3, a + 3);
    };

    const QPointF startDir = normalized(pts[1] - pts[0]);
    const QPointF endDir = normalized(pts[n - 1] - pts[n - 2]);
    const auto [startNorm, startMiter] = tangent(0);
    const auto [endNorm, endMiter] = tangent(n - 1);

    quint16 prevRow = 0;
    if (!roundCap) {
      prevRow = emitRow(pts.front() - startDir * (f * 0.5), startNorm, 1.0, 0.0);
    }
    for (std::size_t i = 0; i < n; ++i) {
      const auto [norm, miter] = tangent(i);
      const quint16 curRow = emitRow(pts[i], norm, miter, coverage);
      if (i > 0 || !roundCap) { connectRows(prevRow, curRow); }
      prevRow = curRow;
    }
    if (!roundCap) {
      const quint16 capRow = emitRow(pts.back() + endDir * (f * 0.5), endNorm, 1.0, 0.0);
      connectRows(prevRow, capRow);
    } else {
      appendRoundCap(pts.front(), -startDir, -startNorm, innerHalf, outerHalf, coverage, colorAt);
      appendRoundCap(pts.back(), endDir, endNorm, innerHalf, outerHalf, coverage, colorAt);
    }
  }

  template <typename ColorAt>
  void appendDashedRibbon(const std::vector<QPointF> &pts, const std::vector<double> &cumLen, double width,
                          double feather, const QVector<qreal> &dash, double dashOffset, const ColorAt &colorAt,
                          bool roundCap) {
    if (pts.size() < 2 || dash.size() < 2) { return; }
    const double totalLen = cumLen.back();
    if (totalLen <= 1e-6) { return; }
    const double on = dash[0];
    const double off = dash[1];
    const double period = on + off;
    if (period <= 1e-6) { return; }
    // When an entire dash cycle is smaller than ~1.5 device pixels, draw a
    // blended solid stroke to avoid subpixel aliasing and vertex explosion.
    if (period < feather * 1.5) {
      const double duty = on / period;
      appendRibbon(pts, width, feather, [&](QPointF p) {
        QColor c = colorAt(p);
        c.setAlphaF(c.alphaF() * duty);
        return c;
      }, roundCap);
      return;
    }
    double phase = std::fmod(dashOffset, period);
    if (phase < 0) { phase += period; }
    // A dash occurs where ((s + phase) mod period) < on, so start at -phase.
    double cursor = -phase;
    std::size_t seg = 0;
    std::vector<QPointF> sub;
    sub.reserve(16);
    const auto pointAt = [&](double dist) {
      while (seg + 1 < cumLen.size() && cumLen[seg + 1] < dist) { ++seg; }
      if (seg + 1 >= pts.size()) { return pts.back(); }
      const double d0 = cumLen[seg];
      const double d1 = cumLen[seg + 1];
      const double span = d1 - d0;
      const double t = span > 1e-9 ? std::clamp((dist - d0) / span, 0.0, 1.0) : 0.0;
      return pts[seg] + (pts[seg + 1] - pts[seg]) * t;
    };
    while (cursor < totalLen) {
      const double a = std::max(0.0, cursor);
      const double b = std::min(totalLen, cursor + on);
      if (b - a > 1e-4) {
        sub.clear();
        const QPointF pStart = pointAt(a);
        sub.push_back(pStart);
        std::size_t k = seg;
        while (k + 1 < cumLen.size() && cumLen[k + 1] < b) {
          if (cumLen[k + 1] > a + 1e-4) { sub.push_back(pts[k + 1]); }
          ++k;
        }
        const QPointF pEnd = pointAt(b);
        if (QPointF::dotProduct(pEnd - sub.back(), pEnd - sub.back()) > 1e-8) { sub.push_back(pEnd); }
        appendRibbon(sub, width, feather, colorAt, roundCap);
        if (!hasRoom(24)) { break; }
      }
      cursor += period;
    }
  }

  void appendDisc(QPointF center, double radius, double feather, const QColor &color) {
    constexpr int kSteps = 20;
    const double f = std::max(feather, 1e-4);
    const double innerR = std::max(0.0, radius - f * 0.5);
    const double outerR = radius + f * 0.5;
    if (!hasRoom(1 + 2 * kSteps)) { return; }
    const quint16 centerIdx = addVertex(center, color, 1.0);
    const quint16 firstInner = static_cast<quint16>(vertices.size());
    constexpr double kTwoPi = 6.28318530717958647692;
    for (int s = 0; s < kSteps; ++s) {
      const double angle = kTwoPi * double(s) / double(kSteps);
      const QPointF dir(std::cos(angle), std::sin(angle));
      addVertex(center + dir * innerR, color, 1.0);
      addVertex(center + dir * outerR, color, 0.0);
    }
    for (int s = 0; s < kSteps; ++s) {
      const int next = (s + 1) % kSteps;
      const quint16 i0 = firstInner + s * 2;
      const quint16 o0 = i0 + 1;
      const quint16 i1 = firstInner + next * 2;
      const quint16 o1 = i1 + 1;
      if (innerR > 1e-6) { addTri(centerIdx, i0, i1); }
      addQuad(i0, o0, o1, i1);
    }
  }

  void appendRing(QPointF center, double radius, double width, double feather, const QColor &color) {
    constexpr int kSteps = 20;
    const double f = std::max(feather, 1e-4);
    const double coverage = std::min(1.0, width / f);
    const double ih = std::abs(width - f) * 0.5;
    const double oh = (width + f) * 0.5;
    if (!hasRoom(4 * kSteps)) { return; }
    const quint16 base = static_cast<quint16>(vertices.size());
    constexpr double kTwoPi = 6.28318530717958647692;
    for (int s = 0; s < kSteps; ++s) {
      const double angle = kTwoPi * double(s) / double(kSteps);
      const QPointF dir(std::cos(angle), std::sin(angle));
      addVertex(center + dir * std::max(0.0, radius - oh), color, 0.0);
      addVertex(center + dir * std::max(0.0, radius - ih), color, coverage);
      addVertex(center + dir * (radius + ih), color, coverage);
      addVertex(center + dir * (radius + oh), color, 0.0);
    }
    for (int s = 0; s < kSteps; ++s) {
      const int next = (s + 1) % kSteps;
      const quint16 a = base + s * 4;
      const quint16 b = base + next * 4;
      addQuad(a + 0, b + 0, b + 1, a + 1);
      addQuad(a + 1, b + 1, b + 2, a + 2);
      addQuad(a + 2, b + 2, b + 3, a + 3);
    }
  }
};
} // namespace

void WirePainter::buildGeometry(QSGGeometry &geometry, const CanvasTheme &theme, const WirePaintState &state,
                                double feather) {
  if (!state.visible) {
    geometry.allocate(0, 0);
    return;
  }
  const double f = std::max(feather, 1e-4);
  const double flatness = std::clamp(0.25 * f, 0.1, 2.0);
  const CubicBezier bezier = wireBezier(state);
  std::vector<QPointF> pts;
  pts.reserve(48);
  pts.push_back(bezier.p0);
  flattenCubic(bezier, flatness * flatness, 0, pts);

  WireMesh mesh;
  mesh.vertices.reserve(pts.size() * 4 + 32);
  mesh.indices.reserve(pts.size() * 18 + 96);

  std::vector<double> cumLen;
  const auto ensureCumLen = [&] {
    if (!cumLen.empty()) { return; }
    cumLen.reserve(pts.size());
    cumLen.push_back(0.0);
    for (std::size_t i = 1; i < pts.size(); ++i) {
      const QPointF d = pts[i] - pts[i - 1];
      cumLen.push_back(cumLen.back() + std::hypot(d.x(), d.y()));
    }
  };

  if (state.control && !state.draft) {
    const bool selected = state.selected;
    const bool raised = selected || state.hovered;
    const double width = raised ? nm::controlWireSelectedWidth : nm::controlWireWidth;
    if (selected) {
      const QColor glow = withOpacity(theme.controlWire, 0.25);
      mesh.appendRibbon(pts, width + 4, f, [&](QPointF) { return glow; }, true);
    }
    const QColor core = withOpacity(theme.controlWire, raised ? 1.0 : nm::controlWireOpacity);
    ensureCumLen();
    mesh.appendDashedRibbon(pts, cumLen, width, f, {nm::controlWireDashOn, nm::controlWireDashOff}, 0.0,
                            [&](QPointF) { return core; }, false);
  } else if (state.draft) {
    const auto &type = state.sourceColor;
    const QColor glow = withOpacity(type, connectingGlowOpacity);
    mesh.appendRibbon(pts, connectingGlowWidth, f, [&](QPointF) { return glow; }, true);
    if (state.control) {
      ensureCumLen();
      mesh.appendDashedRibbon(pts, cumLen, connectingWireWidth, f, {8, 4}, 0.0, [&](QPointF) { return type; }, true);
    } else {
      mesh.appendRibbon(pts, connectingWireWidth, f, [&](QPointF) { return type; }, true);
    }
    const QPointF pointer = state.draftFromOutput ? state.in : state.out;
    mesh.appendDisc(pointer, connectingDotRadius, f, withOpacity(type, 0.9));
    mesh.appendRing(pointer, connectingDotRadius, 1.5, f, withOpacity(type, 0.4));
  } else {
    const bool disabled = state.bypassed;
    const auto &source = state.sourceColor;
    const auto &target = state.targetColor;
    const bool selected = state.selected || state.endpointSelected;
    const bool hovered = state.hovered;
    const bool streaming = state.streaming;
    const bool flowing = state.flowing;
    const bool messageSent = state.messageSent;
    const bool zoomedOut = state.zoom <= zoomedOutThreshold;
    if (selected) {
      const QColor glow = withOpacity(source, nm::wireGlowOpacity);
      mesh.appendRibbon(pts, nm::wireGlowWidth, f, [&](QPointF) { return glow; }, true);
    }
    if (hovered) {
      const QColor glow = withOpacity(Qt::white, nm::wireHoverGlowOpacity);
      mesh.appendRibbon(pts, nm::wireHoverWidth + nm::wireHoverGlowSpread, f, [&](QPointF) { return glow; }, true);
    }
    const bool connecting = state.connecting;
    const double strokeOpacity = (selected || hovered) ? 1.0
                                 : streaming           ? streamingWireOpacity
                                 : flowing             ? 1.0
                                                       : nm::wireOpacity;
    const double opacity =
        connecting ? wireConnectingOpacity : strokeOpacity * (disabled ? nm::disabledWireOpacity : 1.0);
    const QColor sourceStroke = withOpacity(hovered ? hoverTint(source) : source, opacity);
    const QColor targetStroke = withOpacity(hovered ? hoverTint(target) : target, opacity);
    const bool hasGradient = source != target;
    const QPointF axis = bezier.p3 - bezier.p0;
    const double axisLenSq = QPointF::dotProduct(axis, axis);
    const auto colorAt = [&](QPointF p) -> QColor {
      if (!hasGradient || axisLenSq <= 1e-9) { return sourceStroke; }
      const double t = std::clamp(QPointF::dotProduct(p - bezier.p0, axis) / axisLenSq, 0.0, 1.0);
      return QColor::fromRgbF(sourceStroke.redF() + (targetStroke.redF() - sourceStroke.redF()) * t,
                              sourceStroke.greenF() + (targetStroke.greenF() - sourceStroke.greenF()) * t,
                              sourceStroke.blueF() + (targetStroke.blueF() - sourceStroke.blueF()) * t,
                              sourceStroke.alphaF() + (targetStroke.alphaF() - sourceStroke.alphaF()) * t);
    };
    const double width = hovered     ? nm::wireHoverWidth
                         : streaming ? (selected || flowing ? nm::wireStreamingWidth : streamingWireWidth)
                         : zoomedOut ? zoomedWireWidth
                         : selected  ? nm::wireSelectedWidth
                                     : nm::wireWidth;
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
    if (!dash.isEmpty()) {
      ensureCumLen();
      const double offset = (flowing && state.animationActive) ? -flowSpeed * state.animationPhase : 0.0;
      mesh.appendDashedRibbon(pts, cumLen, width, f, dash, offset, colorAt, flowing);
    } else {
      mesh.appendRibbon(pts, width, f, colorAt, flowing);
    }
  }

  geometry.allocate(int(mesh.vertices.size()), int(mesh.indices.size()));
  if (!mesh.vertices.empty()) {
    std::copy(mesh.vertices.begin(), mesh.vertices.end(), geometry.vertexDataAsColoredPoint2D());
  }
  if (!mesh.indices.empty()) {
    std::copy(mesh.indices.begin(), mesh.indices.end(), geometry.indexDataAsUShort());
  }
}
} // namespace nodetool::canvas
