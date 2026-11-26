// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#pragma once

#include <QJsonObject>

namespace nt::midi {

// Document edit `modal.setPreset`: loads one of the factory modal synth presets
// onto a MIDI track (`{ trackId, preset }`).
QJsonObject setModalPresetEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `modal.setParams`: patches any subset of modal synth parameters
// onto a MIDI track's modal instrument (`{ trackId, ... }`).
QJsonObject setModalParamsEdit(QJsonObject doc, const QJsonObject& payload);

// Registers `modal.setPreset` and `modal.setParams` in `nt::app::registerEdit`.
void registerModalEdits();

}  // namespace nt::midi
