#include "WirePainter.h"
#include "graph/NodeLayout.h"
#include <QPainter>
#include <QPainterPathStroker>
#include <QSGGeometry>
#include <algorithm>
#include <cmath>
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
