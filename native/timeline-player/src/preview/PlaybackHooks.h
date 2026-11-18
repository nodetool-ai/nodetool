#pragma once

#include "audio/Mixer.h"
#include "preview/StandardHooks.h"
#include "preview/layers/SceneHooks.h"

namespace nt {
[[nodiscard]] HookRegistrations registerPlaybackHooks();
QStringList missingPlaybackHooks();

namespace reframe {
SceneHookToken registerCropDecorator();
bool hasCropDecorator();
}
namespace speed {
audio::MixPlanStageToken registerTimeRemapAudio();
}
namespace automation {
SceneHookToken registerPictureAutomation();
bool hasPictureAutomation();
audio::MixPlanStageToken registerMixerAutomation();
}
}
