#pragma once

#include "preview/layers/SceneHooks.h"

namespace nt::reframe {
SceneHookToken registerCropDecorator();
bool hasCropDecorator();
}

namespace nt::automation {
SceneHookToken registerPictureAutomation();
bool hasPictureAutomation();
}
