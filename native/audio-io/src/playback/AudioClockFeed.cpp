#include "playback/AudioClockFeed.h"

#include <algorithm>

namespace nt::playback {

AudioReading audibleTimeline(const CallbackState& cb, const DeviceInfo& device, std::int64_t nowNs) {
    const double rate = device.sampleRate;
    // D21 step 2: interpolate from the buffer pair, never past the end of the
    // last published buffer, then subtract the output latency.
    const double elapsed = static_cast<double>(std::max<std::int64_t>(0, nowNs - cb.hostTimeNs)) * 1e-9 * rate;
    const double rendered = static_cast<double>(cb.framesAtStart) +
                            std::min(elapsed, static_cast<double>(cb.bufferFrames));
    const double audible = rendered - device.outputLatencySec * rate;

    AudioReading r;
    r.audibleFrames = audible;
    // The newest anchor whose first frame is audible.
    int k = cb.anchorCount - 1;
    while (k > 0 && audible < static_cast<double>(cb.anchors[k].frame)) --k;
    // A newer seek (or play start) that is not audible yet holds the playhead
    // at its target. Newer continuations (rate changes) are not heard yet.
    for (int j = cb.anchorCount - 1; j > k; --j) {
        if (cb.anchors[j].seek) {
            r.timelineMs = cb.anchors[j].timelineMs;
            r.held = true;
            return r;
        }
    }
    const AudioAnchor& a = cb.anchors[k];
    const double from = static_cast<double>(a.frame);
    if (audible < from || !a.playing) {
        r.timelineMs = a.timelineMs;
        r.held = audible < from;
        return r;
    }
    r.timelineMs = a.timelineMs + (audible - from) / rate * 1000.0 * a.rate;
    return r;
}

}  // namespace nt::playback
