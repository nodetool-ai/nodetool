#pragma once

#include "audio/Mixer.h"
#include "preview/StandardHooks.h"
#include "preview/ScenePlaybackHooks.h"

namespace nt {
[[nodiscard]] HookRegistrations registerPlaybackHooks();
QStringList missingPlaybackHooks();

namespace speed {
audio::MixPlanStageToken registerTimeRemapAudio();
}
namespace automation {
audio::MixPlanStageToken registerMixerAutomation();
}
}
