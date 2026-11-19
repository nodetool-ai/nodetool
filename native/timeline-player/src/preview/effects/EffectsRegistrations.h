#pragma once
#include "preview/StandardHooks.h"

namespace nt::effects {
// Registers the effect hooks: the clip, track, group and adjustment
// decorators, the adjustment backdrop stage, the matte and denoise second
// sources, the generated-matte, clip-effect and shape-mask stages, the image
// matte stage and a handler for every blend mode. Needs a QGuiApplication:
// without one it registers nothing. UI thread only.
[[nodiscard]] HookRegistrations registerEffectHooks();
// The effect hooks the registries do not hold. The decorators cannot be
// inspected and are not listed. UI thread only.
QStringList missingEffectHooks();
}
