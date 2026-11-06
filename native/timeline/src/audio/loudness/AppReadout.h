#pragma once

// The one readout the timeline window shows: the audio engine of the open timeline writes to it (AppAudio sets
// `AudioEngine::Options::loudness`), and the loudness meter in the Audio panel reads it. Preview engines for
// generated candidates do not write to it.

#include "audio/loudness/LiveLoudness.h"

namespace nt::audio {

LoudnessReadout& appLoudnessReadout();

}  // namespace nt::audio
