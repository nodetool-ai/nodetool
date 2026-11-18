#include "preview/PlaybackHooks.h"

namespace {
// Bind before Qt runs the effects registrars, so their decorators see a
// reframed layer's source rectangle.
const bool registered = [] {
    nt::registerPlaybackHooks().keepForProcess();
    return true;
}();
}
