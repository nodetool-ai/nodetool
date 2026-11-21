#pragma once

// Musical time in 48 kHz frames (docs/MUSIC-MODE.md MD8, MT-4). The port of
// packages/timeline/src/music/frames.ts, held to it by the music oracle
// (music-oracle.test.ts). A bar or beat line is computed from its number each
// time, never by adding bar lengths. BPM counts quarter notes in every
// signature, so a 6/8 beat is an eighth note.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include <cstdint>
#include <string>
#include <string_view>

namespace nt::music {

inline constexpr std::int64_t kSampleRate = 48000;

// The tempo fields frame math reads. The defaults are DEFAULT_TEMPO in
// packages/timeline/src/midi/tempo.ts.
struct MusicTempo {
    double bpm = 120;
    double offsetMs = 0;
    double beatsPerBar = 4;
    double beatUnit = 4;
};

enum class GridDivision { Bar, Beat };

// JavaScript's Math.round: the nearest integer, a tie toward +infinity.
[[nodiscard]] double jsRound(double value);
// JavaScript's String(number) for the values the messages print.
[[nodiscard]] std::string jsNumberText(double value);

// Throws std::invalid_argument with the TypeScript message for a tempo the
// frame math cannot read.
void assertMusicTempo(const MusicTempo& tempo);

// round((offsetMs / 1000 + (bar - 1) * beatsPerBar * (4 / beatUnit) * 60 / bpm) * 48000)
[[nodiscard]] std::int64_t barStartFrame(std::int64_t bar, const MusicTempo& tempo);
// Beat `beat` counted from 1 at offsetMs across bars.
[[nodiscard]] std::int64_t beatStartFrame(std::int64_t beat, const MusicTempo& tempo);
[[nodiscard]] std::int64_t beatLengthFrames(const MusicTempo& tempo);
// A frame as stored milliseconds: frame / 48.
[[nodiscard]] double frameToMs(std::int64_t frame);
[[nodiscard]] std::int64_t msToFrame(double ms);

[[nodiscard]] std::int64_t gridLineAtOrBefore(std::int64_t frame, const MusicTempo& tempo, GridDivision division);
[[nodiscard]] std::int64_t gridLineAtOrAfter(std::int64_t frame, const MusicTempo& tempo, GridDivision division);
// The nearest line, a tie to the earlier one. Lines before frame 0 are skipped.
[[nodiscard]] std::int64_t snapFrameToGrid(std::int64_t frame, const MusicTempo& tempo, GridDivision division);

} // namespace nt::music
