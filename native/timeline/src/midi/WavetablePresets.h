// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/Presets.cpp and
// packages/timeline/src/midi/fablesynthPresets.gen.ts).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "midi/WavetableSynth.h"

#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <string_view>
#include <vector>

namespace nt::midi {

struct WavetablePreset {
    std::string_view id;
    std::string_view name;
    std::string_view category;
    WavetableSynthParams params;
};

// Curated factory presets mapped from FableSynth WT-1 using matching web preset IDs.
// Immutable once constructed.
[[nodiscard]] const std::vector<WavetablePreset>& factoryWavetablePresets();

// Finds a factory preset by its web ID (e.g. "wt1-acid-line"), or nullptr if unknown.
[[nodiscard]] const WavetablePreset* findWavetablePreset(std::string_view id) noexcept;

// Ordered list of all factory preset IDs (for AssistantCommandTable choices & QML).
[[nodiscard]] QStringList wavetablePresetIds();

// Serializes synth parameters into the canonical timeline `track.instrument` JSON object
// (`type: "wavetable"`), preserving web-compatible top-level fields and extended WT-1 fields.
[[nodiscard]] QJsonObject wavetableParamsToJson(const WavetableSynthParams& params, const QString& presetId = {});

// Parses a timeline `track.instrument` JSON object into `WavetableSynthParams`.
// Supports preset ID inheritance, top-level web fields, and `fableParams` overrides.
[[nodiscard]] WavetableSynthParams wavetableParamsFromJson(const QJsonObject& instrument);

}  // namespace nt::midi
