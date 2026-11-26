// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include <QJsonObject>

namespace nt::midi {

// Document edit `bass.setPreset`: loads one of the curated analog bass presets
// onto a MIDI track (`{ trackId, preset }`).
QJsonObject setBassPresetEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `bass.setParams`: patches any subset of analog bass parameters
// onto a MIDI track's bass instrument (`{ trackId, ... }`).
QJsonObject setBassParamsEdit(QJsonObject doc, const QJsonObject& payload);

// Registers `bass.setPreset` and `bass.setParams` in `nt::app::registerEdit`.
void registerBassEdits();

}  // namespace nt::midi
