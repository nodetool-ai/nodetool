#include "preview/PlaybackHooks.h"

namespace {
// Install playback hooks for hosts that link the startup registrar.
const bool registered = [] {
    nt::registerPlaybackHooks().keepForProcess();
    return true;
}();
}
