#pragma once
#include "preview/StandardHooks.h"

namespace nt::render2d {
// Registers the text measurer, the text, shape and caption layer style and
// the raster sources of those kinds. Needs a QGuiApplication: a
// QCoreApplication process such as --dump-plan keeps the fallback
// measurement. UI thread only.
[[nodiscard]] HookRegistrations registerRender2dHooks();
// The render2d hooks the registries do not hold. The layer style decorator
// cannot be inspected and is not listed. UI thread only.
QStringList missingRender2dHooks();
}
