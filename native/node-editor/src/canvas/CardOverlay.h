#pragma once

#include <QQuickItem>
#include <QRegion>
#include <optional>

namespace nodetool::canvas {

// UI thread only. A card's overlay contents use viewport coordinates while
// inheriting the card's scene-graph stacking and opacity.
class CardOverlay final : public QQuickItem {
public:
  explicit CardOverlay(QQuickItem &card) : QQuickItem() {
    setTransformOrigin(TopLeft);
    setParentItem(&card);
  }
  void setInteractiveArea(const QRegion &area) {
    interactiveArea_ = area;
    // Quick skips the children of a clipped item when contains() rejects
    // the pointer. The visual clip stays the full viewport rectangle.
    setClip(true);
  }

  bool contains(const QPointF &point) const override {
    return interactiveArea_ ? interactiveArea_->contains(point.toPoint()) : QQuickItem::contains(point);
  }

  void alignToViewport(const QQuickItem &viewport) {
    auto *card = parentItem();
    if (!card) { return; }
    const auto origin = card->mapFromItem(&viewport, QPointF());
    const auto unit = card->mapFromItem(&viewport, QPointF(1, 0));
    setPosition(origin);
    setScale(unit.x() - origin.x());
    setSize(viewport.size());
  }

private:
  std::optional<QRegion> interactiveArea_;
};

} // namespace nodetool::canvas
