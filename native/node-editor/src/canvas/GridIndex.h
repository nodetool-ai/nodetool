#pragma once

#include <QHash>
#include <QList>
#include <QRectF>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nodetool::canvas {

// UI thread only. A uniform grid over scene coordinates. Each key is listed in
// every cell its bounds touch, so a point or rectangle query reads only the
// cells it covers. Bounds larger than kMaxCells cells go to a short list that
// every query checks, so one huge group frame cannot fill thousands of cells.
class GridIndex {
public:
  using Key = quint64;
  static constexpr double kCellSize = 512;
  static constexpr qsizetype kMaxCells = 1024;

  void insert(const Key &key, const QRectF &bounds) {
    remove(key);
    if (!valid(bounds)) { return; }
    bounds_.insert(key, bounds);
    const auto range = cells(bounds);
    if (range.count() > kMaxCells) {
      oversize_.insert(key);
      return;
    }
    for (int x = range.left; x <= range.right; ++x) {
      for (int y = range.top; y <= range.bottom; ++y) { cells_[cellKey(x, y)].append(key); }
    }
  }

  void remove(const Key &key) {
    const auto found = bounds_.constFind(key);
    if (found == bounds_.cend()) { return; }
    const auto bounds = *found;
    bounds_.erase(found);
    if (oversize_.remove(key)) { return; }
    const auto range = cells(bounds);
    for (int x = range.left; x <= range.right; ++x) {
      for (int y = range.top; y <= range.bottom; ++y) {
        const auto cell = cells_.find(cellKey(x, y));
        if (cell == cells_.end()) { continue; }
        cell->removeOne(key);
        if (cell->isEmpty()) { cells_.erase(cell); }
      }
    }
  }

  void clear() {
    bounds_.clear();
    cells_.clear();
    oversize_.clear();
  }

  bool contains(const Key &key) const { return bounds_.contains(key); }
  QRectF bounds(const Key &key) const { return bounds_.value(key); }
  qsizetype size() const { return bounds_.size(); }

  // Keys whose bounds intersect area. The order is unspecified.
  QList<Key> query(const QRectF &area) const {
    QList<Key> result;
    if (!valid(area) && area.width() != 0 && area.height() != 0) { return result; }
    QSet<Key> seen;
    const auto range = cells(area);
    const auto consider = [&](const Key &key) {
      if (seen.contains(key)) { return; }
      seen.insert(key);
      if (intersects(bounds_.value(key), area)) { result.append(key); }
    };
    if (range.count() > kMaxCells) {
      for (auto it = bounds_.cbegin(); it != bounds_.cend(); ++it) { consider(it.key()); }
      return result;
    }
    for (int x = range.left; x <= range.right; ++x) {
      for (int y = range.top; y <= range.bottom; ++y) {
        const auto cell = cells_.constFind(cellKey(x, y));
        if (cell == cells_.cend()) { continue; }
        for (const auto &key : *cell) { consider(key); }
      }
    }
    for (const auto &key : oversize_) { consider(key); }
    return result;
  }

  QList<Key> query(const QPointF &point) const { return query(QRectF(point, QSizeF(0, 0))); }

private:
  struct Range {
    int left = 0, top = 0, right = -1, bottom = -1;
    qsizetype count() const { return qsizetype(right - left + 1) * qsizetype(bottom - top + 1); }
  };
  static bool valid(const QRectF &rect) {
    return std::isfinite(rect.left()) && std::isfinite(rect.top()) && std::isfinite(rect.right()) &&
           std::isfinite(rect.bottom()) && rect.width() >= 0 && rect.height() >= 0;
  }
  // Closed intersection, so that a point on an edge and zero-size areas count.
  static bool intersects(const QRectF &a, const QRectF &b) {
    return a.left() <= b.right() && b.left() <= a.right() && a.top() <= b.bottom() && b.top() <= a.bottom();
  }
  static int cell(double value) {
    const auto index = std::floor(value / kCellSize);
    constexpr double limit = std::numeric_limits<int>::max() / 4;
    return int(std::clamp(index, -limit, limit));
  }
  static Range cells(const QRectF &rect) {
    return {cell(rect.left()), cell(rect.top()), cell(rect.right()), cell(rect.bottom())};
  }
  static quint64 cellKey(int x, int y) { return (quint64(quint32(x)) << 32) | quint32(y); }

  QHash<Key, QRectF> bounds_;
  QHash<quint64, QList<Key>> cells_;
  QSet<Key> oversize_;
};

} // namespace nodetool::canvas
