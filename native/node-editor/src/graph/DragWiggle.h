#pragma once
#include <QPointF>
#include <QVector>
#include <cmath>

namespace nodetool {
// Shake detection for a node drag, ported from addWiggleMovement in
// web/src/utils/MousePosition.ts. A shake pulls the dragged nodes out of their
// group. Times are milliseconds from any steady clock.
class DragWiggle {
public:
    static constexpr qint64 timeWindowMs = 2000;
    static constexpr double distanceThreshold = 2;
    static constexpr int directionChangesRequired = 2;
    static constexpr int minimumMovements = 2;

    void reset() {
        points_.clear();
        wiggling_ = false;
    }
    bool wiggling() const { return wiggling_; }

    void add(const QPointF &position, qint64 timeMs) {
        // onNodeDrag and onSelectionDrag can both report the same move.
        if (!points_.isEmpty() && points_.last().position == position && timeMs - points_.last().time < 10) {
            return;
        }
        points_.append({position, timeMs});
        points_.removeIf([timeMs](const Point &point) { return timeMs - point.time > timeWindowMs; });
        if (points_.size() < minimumMovements) {
            wiggling_ = false;
            return;
        }
        int changes = 0;
        for (qsizetype i = 2; i < points_.size(); ++i) {
            const auto first = points_[i - 1].position - points_[i - 2].position;
            const auto second = points_[i].position - points_[i - 1].position;
            const auto firstLength = std::hypot(first.x(), first.y());
            const auto secondLength = std::hypot(second.x(), second.y());
            if (firstLength <= distanceThreshold || secondLength <= distanceThreshold) {
                continue;
            }
            const auto cosine = (first.x() * second.x() + first.y() * second.y()) / (firstLength * secondLength);
            // More than 90 degrees, with the web's tolerance.
            if (cosine < -0.3) {
                ++changes;
            }
        }
        wiggling_ = changes >= directionChangesRequired;
    }

private:
    struct Point {
        QPointF position;
        qint64 time = 0;
    };
    QVector<Point> points_;
    bool wiggling_ = false;
};
} // namespace nodetool
