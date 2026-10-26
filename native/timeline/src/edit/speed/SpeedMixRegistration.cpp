#include "TimeRemap.h"
#include "audio/hooks/MixerHooks.h"
namespace {
const auto registered = nt::audio::registerVoiceExpander("timeRemap",
    [](const nt::Clip& clip, const nt::audio::VoicePlan&) -> std::optional<std::vector<nt::audio::VoiceSegment>> {
        if (!clip.timeRemap || clip.timeRemap->keyframes.empty()) { return std::nullopt; }
        const auto segments = nt::speed::timeRemapAudioSegments(clip);
        std::vector<nt::audio::VoiceSegment> voices;
        voices.reserve(segments.size());
        for (const auto& segment : segments) {
            voices.push_back({segment.timelineStartMs, segment.timelineEndMs - segment.timelineStartMs,
                segment.sourceStartMs, segment.rate, segment.reverse});
        }
        return voices;
    });
}
