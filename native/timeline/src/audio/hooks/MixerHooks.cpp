#include "audio/hooks/MixerHooks.h"
#include <unordered_map>

namespace nt::audio {
namespace {
class CombinedEnvelope final : public ParameterSource {
public:
    CombinedEnvelope(std::shared_ptr<const ParameterSource> upstream, std::shared_ptr<const ParameterSource> envelope)
        : m_upstream(std::move(upstream)), m_envelope(std::move(envelope)) {}
    double valueAt(double timeMs, double base) const noexcept override {
        return m_envelope->valueAt(timeMs, m_upstream ? m_upstream->valueAt(timeMs, base) : base);
    }
private:
    std::shared_ptr<const ParameterSource> m_upstream;
    std::shared_ptr<const ParameterSource> m_envelope;
};
std::unordered_map<std::string, const Clip*> clipsById(const Timeline& timeline) {
    std::unordered_map<std::string, const Clip*> result;
    result.reserve(timeline.clips.size());
    for (const auto& clip : timeline.clips) { result.emplace(clip.id, &clip); }
    return result;
}
}
MixPlanStageToken registerVoiceExpander(std::string name, VoiceExpander expander, int priority) {
    return registerMixPlanStage(std::move(name), [expand = std::move(expander)](const Timeline& timeline, MixPlan& plan) {
        const auto clips = clipsById(timeline);
        std::vector<VoicePlan> expanded;
        expanded.reserve(plan.voices.size());
        for (auto& voice : plan.voices) {
            const auto found = clips.find(voice.clipId);
            const auto segments = found != clips.end() ? expand(*found->second, voice) : std::nullopt;
            if (!segments) {
                expanded.push_back(std::move(voice));
                continue;
            }
            std::size_t segmentIndex = 0;
            for (const auto& segment : *segments) {
                auto part = voice;
                if (segmentIndex != 0) { part.processors.clear(); }
                part.segmentId = voice.segmentId + "/" + std::to_string(segmentIndex++);
                part.fadeOffsetMs = voice.fadeOffsetMs + segment.startMs - voice.startMs;
                part.fadeDurationMs = voice.fadeDurationMs > 0 ? voice.fadeDurationMs : voice.durationMs;
                part.startMs = segment.startMs;
                part.durationMs = segment.durationMs;
                part.inPointMs = segment.inPointMs;
                part.sourceRate = segment.sourceRate;
                // Reverse segments remain silent until reverse PCM is supported.
                part.silent = segment.silent || segment.sourceRate <= 0;
                expanded.push_back(std::move(part));
            }
        }
        plan.voices = std::move(expanded);
    }, priority);
}
MixPlanStageToken registerGainEnvelope(std::string name, GainEnvelopeFactory factory, int priority) {
    return registerMixPlanStage(std::move(name), [make = std::move(factory)](const Timeline& timeline, MixPlan& plan) {
        const auto clips = clipsById(timeline);
        for (auto& voice : plan.voices) {
            const auto found = clips.find(voice.clipId);
            if (found == clips.end()) { continue; }
            if (auto envelope = make(*found->second, voice)) {
                voice.gainSource = std::make_shared<const CombinedEnvelope>(voice.gainSource, std::move(envelope));
            }
        }
    }, priority);
}
}
