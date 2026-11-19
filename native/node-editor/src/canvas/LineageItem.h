#pragma once

#include "canvas/CanvasItem.h"
#include "graph/LineageLayer.h"
#include <QPainterPath>
#include <functional>

namespace nodetool::canvas {

// UI thread only. LineageLayer owns this item. The canvas content layer is its visual parent.
class LineageItem final : public CanvasItem {
public:
  LineageItem(CanvasScene &scene, QString id);
  void updateGeometry(QPainterPath path, QString label, const node_editor::LineageTheme &theme, bool selected);
  void setLinkSelected(bool selected);
  QPainterPath path() const { return path_; }
  QString label() const { return label_; }
  QString toolTip() const { return label_.isEmpty() ? QStringLiteral("Lineage link") : label_; }
  QRectF sceneBoundingRect() const override { return bounds_; }
  void paintRaster(QPainter &painter, double zoom) const override;
  bool hitTest(const QPointF &scenePoint) const override;

  std::function<void(const QString &id, bool additive)> selectionRequested;
  std::function<void(const QString &id)> deleteRequested;

  std::function<void(const QString &id, const QPoint &position)> contextMenuRequested;
  void openContextMenu(const QPoint &position);

  void mousePress(CanvasMouseEvent &event) override;
  void mouseMove(CanvasMouseEvent &event) override { event.accept(); }
  void mouseRelease(CanvasMouseEvent &event) override { event.accept(); }
  bool keyPress(QKeyEvent &event) override;

private:
  QString id_;
  QString label_;
  QPainterPath path_;
  QPainterPath shape_;
  QRectF bounds_;
  QRectF labelRect_;
  node_editor::LineageTheme theme_;
  bool selected_ = false;
};

} // namespace nodetool::canvas
