#include "CanvasStyle.h"
#include "graph/NodeLayout.h"
#include <QEasingCurve>
#include <QJsonObject>
#include <QPainter>
#include <algorithm>
#include <cmath>

namespace nodetool {
namespace nm = node_metrics;

// NodeErrors.tsx: a failed card offers Report at its bottom left, across from
// the status label.
QRectF reportErrorRect(const QJsonObject &runtime, const NodeLayout &layout) {
  if (layout.collapsed) { return {}; }
  const auto status = runtime["status"].toString();
  if (status != QStringLiteral("error") && status != QStringLiteral("failed")) { return {}; }
  const auto inset = double(nm::borderWidth + nm::padding);
  const auto bottom = 2.0 + (layout.subgraph ? nm::handleRowStep : 0);
  return {inset, layout.size.height() - bottom - nm::rowHeight, 56, double(nm::rowHeight)};
}

// The web bundles Inter at 200, 300, 400, and 600, so its CSS weight of 500
// renders with the 400 face. Canvas text uses the face the web displays.
QFont canvasFont(const CanvasTheme &theme, int pixels, QFont::Weight weight) {
  QFont font(theme.sansFamily);
  font.setPixelSize(pixels);
  font.setWeight(weight);
  font.setHintingPreference(QFont::PreferNoHinting);
  return font;
}

double gridGap(double zoom) {
  auto gap = nm::gridGap;
  while (gap * zoom < 12) { gap *= 2; }
  return gap;
}

void paintGrid(QPainter &painter, const QRectF &exposed, const QRectF &area, double zoom, const QColor &canvas,
               const QColor &grid, const QColor &axis) {
  painter.fillRect(area, canvas);
  // A cross pattern tied to the scene, as React Flow's Background draws it.
  const auto gap = gridGap(zoom);
  const auto half = nm::gridCross / 2;
  // Multiples of the gap are exact, so every start lies on QtNodes' lattice.
  const auto first = [&](double exposedStart, double areaStart) {
    return std::max(std::floor(exposedStart / gap), std::floor((areaStart - half) / gap)) * gap;
  };
  const auto lastX = std::min(exposed.right(), area.right() + half);
  const auto lastY = std::min(exposed.bottom(), area.bottom() + half);
  QVector<QLineF> crosses;
  for (auto x = first(exposed.left(), area.left()); x <= lastX; x += gap) {
    for (auto y = first(exposed.top(), area.top()); y <= lastY; y += gap) {
      crosses.append({x - half, y, x + half, y});
      crosses.append({x, y - half, x, y + half});
    }
  }
  painter.save();
  painter.setRenderHint(QPainter::Antialiasing, false);
  painter.setPen(QPen(grid, 0));
  painter.drawLines(crosses);
  // Origin axes (web AxisMarker.tsx): 1px lines from (0, 0) running 80000 screen
  // pixels right and down, in the palette's c_editor_axis_color.
  const auto axisLength = axisMarkerLength / std::max(std::abs(zoom), 1e-6);
  const QLineF axes[] = {{0, 0, axisLength, 0}, {0, 0, 0, axisLength}};
  painter.setPen(QPen(axis, 0));
  painter.drawLines(axes, 2);
  painter.restore();
}

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
  const auto offset =
      distance >= 0 ? 0.5 * distance : std::min(0.25 * 25 * std::sqrt(-distance), nm::wireMaxReverseOffset);
  QPainterPath path(out);
  path.cubicTo(out + QPointF(offset, 0), in - QPointF(offset, 0), in);
  return path;
}

QPainterPath controlWireCurve(const QPointF &bottom, const QPointF &top) {
  // getBezierPath from a bottom handle to a top handle with the default curvature of 0.25. A
  // reverse wire stops growing so that it stays inside QtNodes' connection bounds.
  const auto distance = top.y() - bottom.y();
  const auto offset =
      distance >= 0 ? 0.5 * distance : std::min(6.25 * std::sqrt(-distance), nm::wireBoundsMargin / 0.75);
  QPainterPath path(bottom);
  path.cubicTo(bottom + QPointF(0, offset), top - QPointF(0, offset), top);
  return path;
}

CanvasTheme CanvasTheme::fromRoles(const QVariantMap &roles) {
  const auto color = [&](const char *name) { return roles.value(name).value<QColor>(); };
  CanvasTheme theme;
  theme.canvas = color("canvas");
  theme.grid = color("grid");
  theme.node = color("node");
  theme.reroutePaper = color("reroutePaper");
  theme.rerouteBorder = color("rerouteBorder");
  theme.divider = color("divider");
  theme.field = color("field");
  theme.textPrimary = color("text");
  theme.textSecondary = color("secondary");
  theme.checker = color("checker");
  theme.subgraphAccent = color("subgraphAccent");
  theme.primary = color("primary");
  theme.progress = color("progress");
  theme.success = color("success");
  theme.warning = color("warning");
  theme.info = color("info");
  theme.controlWire = color("controlWire");
  theme.groupHeader = color("groupHeader");
  theme.groupFill = color("groupFill");
  theme.zoomedTitle = color("zoomedTitle");
  theme.previewSelected = color("previewSelected");
  theme.outputSelected = color("outputSelected");
  theme.selectionShadow = color("shadow");
  theme.mediaScrim = color("mediaScrim");
  theme.mediaScrimInk = color("mediaScrimInk");
  theme.alphaBase = color("alphaBase");
  theme.alphaChecker = color("alphaChecker");
  theme.sansFamily = roles.value("sans").toString();
  if (roles.contains("mono")) { theme.monoFamily = roles.value("mono").toString(); }
  return theme;
}

} // namespace nodetool
