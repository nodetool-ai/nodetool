#pragma once
#include "audio/Mixer.h"
#include <optional>

namespace nt::audio {
struct VoiceSegment {
    double startMs = 0;
    double durationMs = 0;
    double inPointMs = 0;
    double sourceRate = 1;
    bool silent = false;
};
// Control-thread factories. Empty optional leaves a voice unchanged. An empty
// segment list removes it. Render-time envelopes must not allocate or lock.
using VoiceExpander = std::function<std::optional<std::vector<VoiceSegment>>(const Clip&, const VoicePlan&)>;
using GainEnvelopeFactory = std::function<std::shared_ptr<const ParameterSource>(const Clip&, const VoicePlan&)>;
// Expand after clip inserts (priority 0), before their automation (100).
MixPlanStageToken registerVoiceExpander(std::string name, VoiceExpander expander, int priority = 50);
MixPlanStageToken registerGainEnvelope(std::string name, GainEnvelopeFactory factory, int priority = 200);
}
