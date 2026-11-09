#include "audio/loudness/AppReadout.h"

namespace nt::audio {

LoudnessReadout& appLoudnessReadout() {
    // native-rules #14: function-local static LoudnessReadout shared by the UI and audio threads
    static LoudnessReadout readout;
    return readout;
}

}  // namespace nt::audio
