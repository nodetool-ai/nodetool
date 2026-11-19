#include "preview/FrameRing.h"

namespace nt {

int selectFrameIndex(const std::vector<double>& pts, double targetSec) {
    int index = -1;
    for (size_t i = 0; i < pts.size(); ++i) {
        if (!frameStartsBy(pts[i], targetSec)) break;
        index = static_cast<int>(i);
    }
    return index;
}

bool needsDecodeRestart(double positionSec, double targetSec) {
    return targetSec < positionSec - kTimestampEpsilonSec || targetSec - positionSec > kMaxSequentialGapSec;
}

int framesBehindTarget(const std::vector<double>& pts, double targetSec) {
    int drop = 0;
    while (drop + 1 < static_cast<int>(pts.size()) && frameStartsBy(pts[static_cast<size_t>(drop + 1)], targetSec)) {
        ++drop;
    }
    return drop;
}

bool wantsMoreFrames(int queued, double newestPtsSec, double targetSec) {
    if (queued >= kMaxFramesAhead) return false;
    if (queued == 0) return true;
    return newestPtsSec < targetSec + kMaxAheadSec;
}

}  // namespace nt
