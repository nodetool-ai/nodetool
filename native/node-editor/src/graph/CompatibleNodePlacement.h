#pragma once
#include <QRectF>
#include <QVector>
#include <algorithm>
#include <cmath>
namespace nodetool {
// Web nodePlacement.ts: keep 20 logical pixels clear, choose the nearest free
// vertical boundary, and choose below on a tie. Merge forbidden y intervals so
// a large graph needs one sort instead of testing every candidate against it.
inline double compatibleNodeY(const QRectF &desired,const QVector<QRectF> &obstacles) {
  constexpr double margin=20;
  QVector<std::pair<double,double>> intervals;
  for (const auto &other:obstacles) {
    const bool backdrop=other.left()<desired.left() && other.top()<desired.top()
        && other.right()>desired.right() && other.bottom()>desired.bottom();
    if (backdrop || desired.left()>=other.right()+margin || desired.right()+margin<=other.left()) { continue; }
    intervals.append({other.top()-desired.height()-margin,other.bottom()+margin});
  }
  std::sort(intervals.begin(),intervals.end());
  for (qsizetype i=0;i<intervals.size();) {
    auto [low,high]=intervals[i++];
    while (i<intervals.size() && intervals[i].first<high) { high=std::max(high,intervals[i++].second); }
    if (desired.y()>low && desired.y()<high) {
      return high-desired.y()<=desired.y()-low ? high:low;
    }
  }
  return desired.y();
}
}
