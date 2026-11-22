#include "audio/vst/VstAudioStages.h"
#include "audio/vst/VstEdits.h"

namespace {
const bool registered = [] {
    nt::audio::vst::registerVstEdits();
    nt::audio::vst::registerVstAudioStages();
    return true;
}();
}  // namespace
