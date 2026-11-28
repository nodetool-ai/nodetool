#include "music/MusicTime.h"

#include <array>
#include <charconv>
#include <cmath>
#include <stdexcept>

namespace nt::music {
namespace {
constexpr double kFramesPerMs = static_cast<double>(kSampleRate) / 1000.0;

std::int64_t lineFrame(std::int64_t n, const MusicTempo& tempo, GridDivision division) {
    return division == GridDivision::Bar ? barStartFrame(n, tempo) : beatStartFrame(n, tempo);
}

double lineSeconds(const MusicTempo& tempo, GridDivision division) {
    const double beat = (4 / tempo.beatUnit) * 60 / tempo.bpm;
    return division == GridDivision::Bar ? beat * tempo.beatsPerBar : beat;
}
} // namespace

double jsRound(double value) {
    if (!std::isfinite(value)) {
        return value;
    }
    const double floor = std::floor(value);
    return value - floor >= 0.5 ? floor + 1 : floor;
}

std::string jsNumberText(double value) {
    if (std::isnan(value)) {
        return "NaN";
    }
    if (std::isinf(value)) {
        return value < 0 ? "-Infinity" : "Infinity";
    }
    if (value == 0) {
        return "0";
    }
    if (std::floor(value) == value && std::abs(value) < 1e21) {
        return std::to_string(static_cast<long long>(value));
    }
    std::array<char, 64> buffer{};
    const auto converted = std::to_chars(buffer.data(), buffer.data() + buffer.size(), value);
    return {buffer.data(), converted.ptr};
}

void assertMusicTempo(const MusicTempo& tempo) {
    if (!std::isfinite(tempo.bpm) || tempo.bpm <= 0) {
        throw std::invalid_argument("bpm must be a positive number; got " + jsNumberText(tempo.bpm) + ".");
    }
    if (!std::isfinite(tempo.beatsPerBar) || tempo.beatsPerBar <= 0) {
        throw std::invalid_argument("beatsPerBar must be a positive number; got " + jsNumberText(tempo.beatsPerBar) +
                                    ".");
    }
    if (!std::isfinite(tempo.beatUnit) || tempo.beatUnit <= 0) {
        throw std::invalid_argument("beatUnit must be a positive number; got " + jsNumberText(tempo.beatUnit) + ".");
    }
    if (!std::isfinite(tempo.offsetMs)) {
        throw std::invalid_argument("offsetMs must be a finite number; got " + jsNumberText(tempo.offsetMs) + ".");
    }
}

std::int64_t barStartFrame(std::int64_t bar, const MusicTempo& tempo) {
    assertMusicTempo(tempo);
    // The same operations in the same order as frames.ts, so the doubles agree.
    const double seconds =
        tempo.offsetMs / 1000 + static_cast<double>(bar - 1) * tempo.beatsPerBar * (4 / tempo.beatUnit) * 60 / tempo.bpm;
    return static_cast<std::int64_t>(jsRound(seconds * static_cast<double>(kSampleRate)));
}

std::int64_t beatStartFrame(std::int64_t beat, const MusicTempo& tempo) {
    assertMusicTempo(tempo);
    const double seconds = tempo.offsetMs / 1000 + static_cast<double>(beat - 1) * (4 / tempo.beatUnit) * 60 / tempo.bpm;
    return static_cast<std::int64_t>(jsRound(seconds * static_cast<double>(kSampleRate)));
}

std::int64_t beatLengthFrames(const MusicTempo& tempo) {
    assertMusicTempo(tempo);
    return static_cast<std::int64_t>(jsRound((4 / tempo.beatUnit) * 60 / tempo.bpm * static_cast<double>(kSampleRate)));
}

double frameToMs(std::int64_t frame) { return static_cast<double>(frame) / kFramesPerMs; }

std::int64_t msToFrame(double ms) { return static_cast<std::int64_t>(jsRound(ms * kFramesPerMs)); }

std::int64_t gridLineAtOrBefore(std::int64_t frame, const MusicTempo& tempo, GridDivision division) {
    assertMusicTempo(tempo);
    auto n = static_cast<std::int64_t>(std::floor(
                 (static_cast<double>(frame) / static_cast<double>(kSampleRate) - tempo.offsetMs / 1000) /
                 lineSeconds(tempo, division))) +
             1;
    while (lineFrame(n, tempo, division) > frame) {
        --n;
    }
    while (lineFrame(n + 1, tempo, division) <= frame) {
        ++n;
    }
    return n;
}

std::int64_t gridLineAtOrAfter(std::int64_t frame, const MusicTempo& tempo, GridDivision division) {
    const auto n = gridLineAtOrBefore(frame, tempo, division);
    return lineFrame(n, tempo, division) == frame ? n : n + 1;
}

std::int64_t snapFrameToGrid(std::int64_t frame, const MusicTempo& tempo, GridDivision division) {
    const auto n = gridLineAtOrBefore(frame, tempo, division);
    const auto before = lineFrame(n, tempo, division);
    const auto after = lineFrame(n + 1, tempo, division);
    if (before < 0) {
        return after;
    }
    return frame - before <= after - frame ? before : after;
}

} // namespace nt::music
