// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/bass/dsp/BassPatches.{h,cpp} and
// packages/timeline/src/midi/{presets.ts,fablesynthPresets.gen.ts}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "midi/BassSynth.h"

#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <string_view>
#include <vector>

namespace nt::midi {

struct BassPreset {
    std::string_view id;
    std::string_view name;
    std::string_view category;
    BassSynthParams params;
};

// Curated analog bass presets (16 presets: acid 303, sub, classic analog, pluck, sync lead-bass).
// Matching presets preserve the web BL-1 preset IDs. Immutable once constructed.
[[nodiscard]] const std::vector<BassPreset>& factoryBassPresets();

// Finds a curated preset by ID (e.g. "bl1-acid"), or nullptr if unknown.
[[nodiscard]] const BassPreset* findBassPreset(std::string_view id) noexcept;

// Ordered list of all curated preset IDs (for AssistantCommandTable choices & QML).
[[nodiscard]] QStringList bassPresetIds();

// Serializes analog bass parameters to the canonical timeline `track.instrument` JSON object
// (`type: "bass"`), keeping web-compatible field names plus analog-bass fields.
[[nodiscard]] QJsonObject bassParamsToJson(const BassSynthParams& params, const QString& presetId = {});

// Parses a timeline `track.instrument` JSON object into `BassSynthParams`.
// Supports preset ID inheritance, top-level web BL-1 fields, and `fableParams` overrides.
[[nodiscard]] BassSynthParams bassParamsFromJson(const QJsonObject& instrument);

}  // namespace nt::midi
