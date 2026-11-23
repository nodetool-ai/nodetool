#include "preview/PlaybackHooks.h"
#include "audio/hooks/MixerHooks.h"

#include <algorithm>
#include <cmath>

namespace nt {
HookRegistrations registerPlaybackHooks() {
    HookRegistrations hooks;
    for (const auto token : {reframe::registerCropDecorator(), automation::registerPictureAutomation()}) {
        hooks.add([token] { unregisterSceneHook(token); });
    }
    for (const auto token : {speed::registerTimeRemapAudio(), automation::registerMixerAutomation()}) {
        hooks.add([token] { audio::unregisterMixPlanStage(token); });
    }
    const auto loops = audio::registerVoiceExpander("clipLoops", [](const Clip& clip, const audio::VoicePlan& voice)
        -> std::optional<std::vector<audio::VoiceSegment>> {
        const double period = clip.raw.value(u"loopLengthMs").toDouble();
        if (clip.mediaType != MediaType::Audio || !std::isfinite(period) || period <= 0 ||
            period >= clip.durationMs || clip.raw.value(u"timeRemap").isObject()) { return std::nullopt; }
        // Control-thread values become plan-owned voices. The audio thread only reads them.
        std::vector<audio::VoiceSegment> segments;
        for (double offset = 0; offset < clip.durationMs; offset += period) {
            segments.push_back({clip.startMs + offset, std::min(period, clip.durationMs - offset),
                clip.inPointMs, voice.sourceRate, false});
        }
        return segments;
    });
    hooks.add([loops] { audio::unregisterMixPlanStage(loops); });
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
    if (!audio::hasMixPlanStage("clipLoops")) {
        missing.append(QStringLiteral("mix:clip-loops"));
    }
    return missing;
}
}
