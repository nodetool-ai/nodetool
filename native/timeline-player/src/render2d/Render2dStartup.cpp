// The startup registrar of the render2d hooks, built as the object library
// nodetool_timeline_render2d_registrar. Its object links into every
// executable that links that library. It registers them for the process
// lifetime.
#include "render2d/Render2dRegistrations.h"
#include <QCoreApplication>

namespace {
void registerRender2dAtStartup() { nt::render2d::registerRender2dHooks().keepForProcess(); }
Q_COREAPP_STARTUP_FUNCTION(registerRender2dAtStartup)
} // namespace
