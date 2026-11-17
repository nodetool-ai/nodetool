#pragma once

#include <QPoint>
#include <QRect>
#include <QSize>
#include <QVariantMap>
#include <algorithm>
#include <cmath>
#include <optional>

// The position of a canvas overlay the user can drag, such as the queue.
// It stores the distance from the nearest horizontal and vertical edge of the
// canvas, so an overlay dropped at the right edge stays there when the window
// widens, and one docked at the bottom grows upward when it expands. This is
// the model of web/src/utils/dockedPanelPosition.ts.
//
// Value types and free functions only: no ownership, usable from any thread.
namespace nodetool::node_editor::docked_overlay {

// Gap kept between an overlay and the canvas edges.
inline constexpr int margin = 16;

struct Position {
  bool right = false;   // anchored to the right edge instead of the left
  bool bottom = false;  // anchored to the bottom edge instead of the top
  int x = margin;       // distance from the anchored horizontal edge
  int y = margin;       // distance from the anchored vertical edge
  friend bool operator==(const Position &, const Position &) = default;
};

// The top-left corner of the canvas.
inline constexpr Position defaultPosition{};

namespace detail {
// An overlay larger than the area pins to the leading edge so its header stays reachable.
inline int clampAxis(int value, int min, int max) { return std::max(min, std::min(value, std::max(min, max))); }
}  // namespace detail

// The overlay's top-left inside area, at least `margin` from every edge.
inline QPoint place(const Position &position, const QRect &area, const QSize &size) {
  const int left = area.left(), top = area.top();
  const int right = area.left() + area.width(), bottom = area.top() + area.height();
  const int x = position.right ? right - position.x - size.width() : left + position.x;
  const int y = position.bottom ? bottom - position.y - size.height() : top + position.y;
  return {detail::clampAxis(x, left + margin, right - margin - size.width()),
          detail::clampAxis(y, top + margin, bottom - margin - size.height())};
}

// The position for an overlay whose top-left is at point. Each axis anchors to
// the edge nearer the overlay's centre.
inline Position dockAt(const QPoint &point, const QRect &area, const QSize &size) {
  const auto placed = place({false, false, point.x() - area.left(), point.y() - area.top()}, area, size);
  const int right = area.left() + area.width(), bottom = area.top() + area.height();
  Position result;
  result.right = 2 * placed.x() + size.width() > area.left() + right;
  result.bottom = 2 * placed.y() + size.height() > area.top() + bottom;
  result.x = result.right ? right - placed.x() - size.width() : placed.x() - area.left();
  result.y = result.bottom ? bottom - placed.y() - size.height() : placed.y() - area.top();
  return result;
}

// The stored form, matching the web's JSON: {anchorX, anchorY, x, y}.
inline QVariantMap toVariant(const Position &position) {
  return {{"anchorX", position.right ? "right" : "left"},
          {"anchorY", position.bottom ? "bottom" : "top"},
          {"x", position.x},
          {"y", position.y}};
}

// A stored position, or nothing when the value is missing or malformed.
inline std::optional<Position> fromVariant(const QVariant &value) {
  const auto map = value.toMap();
  const auto anchorX = map.value("anchorX").toString(), anchorY = map.value("anchorY").toString();
  bool xOk = false, yOk = false;
  const double x = map.value("x").toDouble(&xOk), y = map.value("y").toDouble(&yOk);
  if ((anchorX != "left" && anchorX != "right") || (anchorY != "top" && anchorY != "bottom") || !xOk || !yOk ||
      !std::isfinite(x) || !std::isfinite(y)) {
    return std::nullopt;
  }
  // Any distance past the screen clamps on placement, so a large one only needs to fit an int.
  const auto distance = [](double value) { return int(std::lround(std::clamp(value, 0.0, 1e6))); };
  return Position{anchorX == "right", anchorY == "bottom", distance(x), distance(y)};
}

}  // namespace nodetool::node_editor::docked_overlay
