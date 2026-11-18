#pragma once

#include "canvas/CanvasItem.h"
#include "graph/LineageLayer.h"
#include <QPainterPath>
#include <functional>

namespace nodetool::canvas {

// UI thread only. A graph.links lineage link on the Quick canvas: the same
// path, label and input as the QGraphicsObject link of LineageLayer. The layer
// owns the item through std::unique_ptr; its visual parent is the content
// layer. The callbacks belong to the layer, which owns the item, so they never
// outlive their target.
class LineageItem final : public CanvasItem {
public:
  LineageItem(CanvasScene &scene, QString id);
  void updateGeometry(QPainterPath path, QString label, const node_editor::LineageTheme &theme, bool selected);
  void setLinkSelected(bool selected);
  QPainterPath path() const { return path_; }
  QString label() const { return label_; }
  QString toolTip() const { return label_.isEmpty() ? QStringLiteral("Lineage link") : label_; }
  QRectF sceneBoundingRect() const override { return bounds_; }
  bool hitTest(const QPointF &scenePoint) const override;

  std::function<void(const QString &id, bool additive)> selectionRequested;
  std::function<void(const QString &id)> deleteRequested;

  void mousePress(CanvasMouseEvent &event) override;
  void mouseMove(CanvasMouseEvent &event) override { event.accept(); }
  void mouseRelease(CanvasMouseEvent &event) override { event.accept(); }
  bool keyPress(QKeyEvent &event) override;

private:
  void repaint();
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
