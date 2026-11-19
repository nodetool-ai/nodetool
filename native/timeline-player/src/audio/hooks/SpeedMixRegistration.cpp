#include "audio/hooks/MixerHooks.h"
#include "preview/PlaybackHooks.h"
#include "scene/TimeRemap.h"

namespace nt::speed {
audio::MixPlanStageToken registerTimeRemapAudio() {
    return audio::registerVoiceExpander("timeRemap",
        [](const Clip& clip, const audio::VoicePlan&) -> std::optional<std::vector<audio::VoiceSegment>> {
            if (!clip.timeRemap || clip.timeRemap->keyframes.empty()) {
                return std::nullopt;
            }
            const auto segments = timeRemapAudioSegments(clip);
            std::vector<audio::VoiceSegment> voices;
            voices.reserve(segments.size());
            for (const auto& segment : segments) {
                voices.push_back({segment.timelineStartMs, segment.timelineEndMs - segment.timelineStartMs,
                                  segment.sourceStartMs, segment.rate, segment.reverse});
            }
            return voices;
        });
}
}
