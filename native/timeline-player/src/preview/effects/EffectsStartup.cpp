// The startup registrar of the effect hooks, built as the object library
// nodetool_timeline_effects_registrar. Its object links into every executable
// that links that library, so the hooks cannot be dropped with an unused
// archive member. It registers them for the process lifetime.
#include "preview/effects/EffectsRegistrations.h"
#include <QCoreApplication>

namespace {
void registerEffectsAtStartup() { nt::effects::registerEffectHooks().keepForProcess(); }
Q_COREAPP_STARTUP_FUNCTION(registerEffectsAtStartup)
} // namespace
