// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit ae9fca7 (juce/source/drum/dsp/{OneShotSamples.gen.*,DrumKits,KitLevels.gen.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include <array>
#include <cstdint>
#include <span>

namespace nt::midi {

inline constexpr int kDrumPadCount = 16;

enum class DrumKitId : std::uint8_t {
    Classic808 = 0,
    Uzu = 1,
};

struct EmbeddedDrumSample {
    const char* name = "";
    int sampleRate = 44100;
    std::span<const std::int16_t> data;
};

struct StockPadPreset {
    const char* name = "";
    int sampleIndex = 0;       // index into stockDrumSamples()
    float level = 0.8f;        // 0..1 pad mix level (KitLevels.gen.h)
    float sampleLevel = 0.9f;  // 0..1 sample layer gain (DrumKits.cpp)
    float tuneSemitones = 0.0f;
    float decaySec = 0.5f;
    int chokeGroup = 0;        // 0 = none, 1 = hi-hat choke
};

struct StockDrumKit {
    DrumKitId id = DrumKitId::Classic808;
    const char* name = "";
    float masterVolume = 0.8f;
    std::array<StockPadPreset, kDrumPadCount> pads{};
};

// Read-only embedded stock samples (14 TR-808 + 16 UZU = 30 one-shots at 44.1 kHz).
[[nodiscard]] std::span<const EmbeddedDrumSample> stockDrumSamples() noexcept;

// Read-only preset metadata for the two shipped kits (808 CLASSIC and UZU).
[[nodiscard]] const StockDrumKit& stockDrumKit(DrumKitId kit) noexcept;

}  // namespace nt::midi
