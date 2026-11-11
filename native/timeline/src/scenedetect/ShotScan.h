#pragma once

// Reads the frames of one media file for scene edit detection and returns the
// frame to frame differences (SceneDetect.h). Blocking, software decode only:
// call it off the GUI thread.
//
// Memory does not grow with the length of the media. The scan holds the
// decoder's own queue, at most two decoded frames of the source size, one
// reduced RGBA frame of at most 256 pixels wide, and two signatures. The
// result holds 4 bytes per requested frame.

#include <cstddef>
#include <functional>
#include <string>
#include <vector>

namespace nt::shots {

struct ScanRequest {
    std::string path;
    // The source time each analysed frame shows, in order. For a plain clip
    // these step by one frame period times the clip's speed. A time that goes
    // backwards or jumps forward by more than a second seeks.
    std::vector<double> sourceTimesMs;
};

struct ScanResult {
    // diffs[i] is the difference between the frames shown at sourceTimesMs[i - 1]
    // and sourceTimesMs[i]. It is 0 when both pick the same decoded frame.
    // diffs[0] is 0. On error or cancel it holds the frames done so far.
    std::vector<float> diffs;
    std::string error;  // empty when the scan finished
    bool cancelled = false;
};

// `progress` is called after each frame with the number of frames done. It
// returns false to cancel. The frame shown at a time is the last decoded frame
// starting at or before it, within 1 ms (the rule of DESIGN.md D17). A time
// before the first frame shows the first frame, and a time past the end shows
// the last.
ScanResult scanShots(const ScanRequest& request, const std::function<bool(std::size_t done)>& progress = {});

}  // namespace nt::shots
