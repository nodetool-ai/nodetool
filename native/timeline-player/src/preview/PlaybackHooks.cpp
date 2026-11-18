#include "preview/PlaybackHooks.h"

namespace nt {
HookRegistrations registerPlaybackHooks() {
    HookRegistrations hooks;
    for (const auto token : {reframe::registerCropDecorator(), automation::registerPictureAutomation()}) {
        hooks.add([token] { unregisterSceneHook(token); });
    }
    for (const auto token : {speed::registerTimeRemapAudio(), automation::registerMixerAutomation()}) {
        hooks.add([token] { audio::unregisterMixPlanStage(token); });
    }
    return hooks;
}

QStringList missingPlaybackHooks() {
    QStringList missing;
    if (!reframe::hasCropDecorator()) {
        missing.append(QStringLiteral("decorator:crop"));
    }
    if (!automation::hasPictureAutomation()) {
        missing.append(QStringLiteral("scene:picture-automation"));
    }
    if (!audio::hasMixPlanStage("timeRemap")) {
        missing.append(QStringLiteral("mix:time-remap"));
    }
    if (!audio::hasMixPlanStage("automation")) {
        missing.append(QStringLiteral("mix:automation"));
    }
    return missing;
}
}
