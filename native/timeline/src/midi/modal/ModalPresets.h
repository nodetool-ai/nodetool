// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#pragma once

#include "midi/modal/ModalSynth.h"

#include <QJsonObject>
#include <QString>
#include <QStringList>

#include <string_view>
#include <vector>

namespace nt::midi {

struct ModalPreset {
    std::string_view id;
    std::string_view name;
    std::string_view category;
    ModalSynthParams params;
};

// Factory modal percussion/mallet presets (14 presets covering marimba, vibes, bells,
// kalimba, steel drum, tom/membrane, djembe, plucked string, crystal glass, wood block,
// and open/closed waveguide tubes). Immutable once constructed.
[[nodiscard]] const std::vector<ModalPreset>& factoryModalPresets();

// Finds a factory preset by stable ID (e.g. "modal-marimba"), or nullptr if unknown.
[[nodiscard]] const ModalPreset* findModalPreset(std::string_view id) noexcept;

// Ordered list of all factory preset IDs (for AssistantCommandTable choices & QML).
[[nodiscard]] QStringList modalPresetIds();

// Serializes modal synth parameters to the canonical timeline `track.instrument` JSON object
// (`type: "modal"`).
[[nodiscard]] QJsonObject modalParamsToJson(const ModalSynthParams& params, const QString& presetId = {});

// Parses a timeline `track.instrument` JSON object into `ModalSynthParams`,
// supporting preset ID inheritance and per-parameter overrides.
[[nodiscard]] ModalSynthParams modalParamsFromJson(const QJsonObject& instrument);

}  // namespace nt::midi
