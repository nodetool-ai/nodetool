#pragma once
#include <QPointF>
#include <QString>
#include <QVector>
#include <cmath>
#include <limits>

namespace nodetool::node_editor {

// Keyboard node navigation (web stores/NodeFocusStore.ts). Pure functions.
struct FocusCandidate {
  QString id;
  QPointF position;
};
enum class FocusDirection { Next, Previous, Up, Down, Left, Right };

// The node focus moves to from `current`, in document order for Next and
// Previous (wrapping) and by nearest position for a direction, where the
// cross axis counts half. Returns `current` when nothing lies that way.
inline QString nextFocus(const QVector<FocusCandidate> &nodes, const QString &current, FocusDirection direction) {
  if (nodes.isEmpty()) { return current; }
  qsizetype index = -1;
  for (qsizetype i = 0; i < nodes.size(); ++i) {
    if (nodes[i].id == current) { index = i; }
  }
  if (direction == FocusDirection::Next) { return nodes[index < nodes.size() - 1 ? index + 1 : 0].id; }
  if (direction == FocusDirection::Previous) { return nodes[index > 0 ? index - 1 : nodes.size() - 1].id; }
  if (index < 0) { return nodes.first().id; }
  const auto origin = nodes[index].position;
  QString best = current;
  double bestScore = std::numeric_limits<double>::infinity();
  for (const auto &node : nodes) {
    if (node.id == current) { continue; }
    const auto dx = node.position.x() - origin.x();
    const auto dy = node.position.y() - origin.y();
    const bool vertical = direction == FocusDirection::Up || direction == FocusDirection::Down;
    const bool ahead = direction == FocusDirection::Up ? dy < 0 : direction == FocusDirection::Down ? dy > 0
                     : direction == FocusDirection::Left ? dx < 0 : dx > 0;
    if (!ahead) { continue; }
    const auto score = vertical ? std::abs(dy) + std::abs(dx) * 0.5 : std::abs(dx) + std::abs(dy) * 0.5;
    if (score < bestScore) { bestScore = score; best = node.id; }
  }
  return best;
}

}  // namespace nodetool::node_editor
