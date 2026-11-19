#include "preview/StandardHooks.h"
#include "preview/PlaybackHooks.h"
#include "preview/effects/EffectsRegistrations.h"
#include "render2d/Render2dRegistrations.h"

namespace nt {

HookRegistrations registerStandardHooks() {
    HookRegistrations registrations;
    if (!missingPlaybackHooks().isEmpty()) {
        registrations.append(registerPlaybackHooks());
    }
    if (!effects::missingEffectHooks().isEmpty()) {
        registrations.append(effects::registerEffectHooks());
    }
    if (!render2d::missingRender2dHooks().isEmpty()) {
        registrations.append(render2d::registerRender2dHooks());
    }
    return registrations;
}

QStringList missingStandardHooks() {
    return effects::missingEffectHooks() + render2d::missingRender2dHooks() + missingPlaybackHooks();
}
}
