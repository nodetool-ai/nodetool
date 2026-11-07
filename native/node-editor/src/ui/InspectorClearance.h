#pragma once
#include <algorithm>
#include <vector>

namespace node_editor {

// One node's box in canvas pixels, relative to the canvas left edge.
struct ScreenRect {
  double left = 0;
  double right = 0;
};

// Gap kept between the rightmost node and the inspector.
inline constexpr double inspectorClearancePx = 16;

// How far to pan the canvas left (a negative number, or 0) so no node sits
// under the inspector. This is the web's inspectorClearancePan in
// hooks/useClearInspectorOverlap.ts. The pan stops before the leftmost
// protected node would leave the canvas, so a node the user is working with is
// never pushed out of view to make room. It never changes the zoom.
inline double inspectorClearancePan(const std::vector<ScreenRect> &nodes,
                                    const std::vector<ScreenRect> &protectedNodes,
                                    double canvasWidth, double inspectorWidth) {
  if (nodes.empty() || inspectorWidth <= 0) { return 0; }
  const auto limit = canvasWidth - inspectorWidth - inspectorClearancePx;
  const auto inspectorLeft = canvasWidth - inspectorWidth;
  double hiddenRight = 0;
  bool hidden = false;
  for (const auto &rect : nodes) {
    if (rect.right > inspectorLeft) {
      hiddenRight = hidden ? std::max(hiddenRight, rect.right) : rect.right;
      hidden = true;
    }
  }
  if (!hidden) { return 0; }
  const auto wanted = hiddenRight - limit;
  const auto &keep = protectedNodes.empty() ? nodes : protectedNodes;
  double leftmost = keep.front().left;
  for (const auto &rect : keep) { leftmost = std::min(leftmost, rect.left); }
  const auto room = leftmost - inspectorClearancePx;
  const auto pan = std::min(wanted, std::max(room, 0.0));
  return pan > 0 ? -pan : 0;
}

} // namespace node_editor
