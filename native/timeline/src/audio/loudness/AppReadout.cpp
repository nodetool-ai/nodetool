#include "audio/loudness/AppReadout.h"

namespace nt::audio {

LoudnessReadout& appLoudnessReadout() {
    static LoudnessReadout readout;
    return readout;
}

}  // namespace nt::audio
