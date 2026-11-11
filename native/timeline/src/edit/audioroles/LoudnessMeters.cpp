#include "LoudnessMeters.h"

#include "audio/loudness/AppReadout.h"

#include <limits>

QVariantMap LoudnessMeters::read() {
    const auto reading = nt::audio::appLoudnessReadout().read();
    if (reading.blocks != m_blocks) {
        m_blocks = reading.blocks;
        m_changed.restart();
    }
    const bool available = reading.blocks > 0;
    const bool active = available && m_changed.isValid() && m_changed.elapsed() < 400;
    constexpr double none = -std::numeric_limits<double>::infinity();
    return {{"available", available},
            {"active", active},
            {"momentary", active ? reading.momentary : none},
            {"shortTerm", active ? reading.shortTerm : none},
            {"integrated", reading.integrated},
            {"maxMomentary", reading.maxMomentary},
            {"maxShortTerm", reading.maxShortTerm},
            {"truePeakDb", reading.truePeakDb},
            {"loudnessRange", reading.loudnessRange}};
}

void LoudnessMeters::reset() { nt::audio::appLoudnessReadout().requestReset(); }
