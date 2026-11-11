#include "ui/BenchMedia.h"

#include "preview/PreviewCompositor.h"

namespace nt::ui {

bool frameDrewMedia(const FrameStat& st, int minLayers) {
    return st.mediaLayers >= minLayers && st.missingMediaLayers == 0 && st.frameError >= 0 && st.frameError <= 1;
}

bool benchMediaReady(const std::vector<FrameStat>& stats, int minLayers) {
    // The same rule as the count: a decoder that shows the keyframe before
    // its in-point while it catches up (hardware decode at the start) has a
    // picture but not the frame, and the bench would measure that catch-up.
    return !stats.empty() && frameDrewMedia(stats.back(), minLayers);
}

}  // namespace nt::ui
