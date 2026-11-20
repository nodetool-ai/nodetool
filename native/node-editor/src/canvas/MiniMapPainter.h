#pragma once

#include "canvas/CanvasStyle.h"
#include <QHash>
#include <QPainter>
#include <QPainterPath>
#include <QPair>
#include <QStringList>
#include <QVector>
#include <algorithm>

namespace nodetool {
// The web node categories of utils/ColorUtils.ts getNodeTypeCategory, in the
// order the mini-map legend lists them (MiniMapNavigator.tsx legendItems).
inline const QStringList &miniMapCategories() {
  static const QStringList categories{"input", "constant", "processing", "group", "comment", "output"};
  return categories;
}
// getNodeTypeCategory: the checks run in this order, so a type that mentions
// both "group" and "output" is a group.
inline QString miniMapCategory(const QString &type) {
  if (type.isEmpty()) { return "processing"; }
  if (type.startsWith("nodetool.input.")) { return "input"; }
  if (type.startsWith("nodetool.constant.")) { return "constant"; }
  if (type.contains(".Group") || type.contains("group")) { return "group"; }
  if (type.contains(".Comment") || type.contains("comment")) { return "comment"; }
  if (type.contains("output") || type.contains("Output")) { return "output"; }
  return "processing";
}
// getNodeCategoryColor, light and dark.
inline QColor miniMapCategoryColor(const QString &category, bool dark) {
  static const QHash<QString, QPair<QString, QString>> colors{
      {"input", {"#3b82f6", "#60a5fa"}}, {"constant", {"#8b5cf6", "#a78bfa"}}, {"processing", {"#64748b", "#94a3b8"}},
      {"group", {"#6366f1", "#818cf8"}}, {"comment", {"#22c55e", "#4ade80"}}, {"output", {"#f59e0b", "#fbbf24"}}};
  const auto pair = colors.value(category, colors.value("processing"));
  return QColor(dark ? pair.second : pair.first);
}

// UI thread only. One card as the mini-map draws it.
struct MiniMapNode {
  QRectF rect;
  bool selected = false;
  bool group = false;
  bool comment = false;
  QString type;
};

// UI thread only. Where the scene sits in the mini-map: the cards and the view
// with 5 percent around them.
struct MiniMapGeometry {
  QRectF world;
  double scale = 1;
  QPointF offset;
  QRectF map(const QRectF &rect) const { return {rect.topLeft() * scale + offset, rect.size() * scale}; }
  QPointF toScene(QPointF point) const { return (point - offset) / scale; }
};

inline MiniMapGeometry miniMapGeometry(QSizeF size, const QRectF &bounds, const QRectF &viewport) {
  MiniMapGeometry geometry;
  geometry.world = bounds.united(viewport);
  auto &world = geometry.world;
  world.adjust(-world.width() * .05, -world.height() * .05, world.width() * .05, world.height() * .05);
  geometry.scale = std::min(size.width() / std::max(1., world.width()), size.height() / std::max(1., world.height()));
  geometry.offset = QPointF(size.width() / 2., size.height() / 2.) - world.center() * geometry.scale;
  return geometry;
}

// UI thread only. Paints the mini-map of the widget and of the Quick item.
inline void paintMiniMap(QPainter &painter, QSizeF size, const CanvasTheme &theme, const QVector<MiniMapNode> &nodes,
                         const QRectF &viewport, bool byType, const MiniMapGeometry &geometry) {
  painter.setRenderHint(QPainter::Antialiasing);
  const QRectF rect(QPointF(), size);
  const bool dark = theme.canvas.lightnessF() < .5;
  const QColor paper = dark ? QColor("#0a0b0d") : QColor("#27272a");
  const QColor border = dark ? QColor(255, 255, 255, 51) : QColor(0, 0, 0, 26);
  painter.setPen(border);
  painter.setBrush(paper);
  painter.drawRoundedRect(rect.adjusted(.5, .5, -.5, -.5), 8, 8);
  for (const auto &node : nodes) {
    painter.setPen(QPen(node.selected ? theme.primary : QColor(dark ? "#5c606a" : "#cdcdd3"), 2));
    // createMinimapNodeColorFn: the selection is always primary. The default mode
    // colors only groups and notes apart, and "Color by type" colors every category.
    const QColor fill = node.selected ? theme.primary
                        : byType      ? miniMapCategoryColor(miniMapCategory(node.type), dark)
                        : node.group  ? QColor(dark ? "#6366f1" : "#818cf8")
                        : node.comment ? QColor("#22c55e")
                                       : QColor(dark ? "#94a3b8" : "#64748b");
    painter.setBrush(fill);
    painter.drawRoundedRect(geometry.map(node.rect), 8 * geometry.scale, 8 * geometry.scale);
  }
  QPainterPath mask;
  mask.addRect(rect);
  mask.addRect(geometry.map(viewport));
  auto maskColor = dark ? QColor(Qt::black) : QColor(Qt::white);
  maskColor.setAlphaF(.6);
  painter.fillPath(mask, maskColor);
  painter.setPen(theme.primary);
  painter.setBrush(Qt::NoBrush);
  painter.drawRect(geometry.map(viewport));
}

} // namespace nodetool
