// Document edits for the native WT-1 wavetable synth.
#pragma once

#include <QJsonObject>

namespace nt::midi {

// Document edit `wavetable.setPreset`: loads one of the curated WT-1 presets
// onto a MIDI track (`{ trackId, preset }`).
QJsonObject setWavetablePresetEdit(QJsonObject doc, const QJsonObject& payload);

// Document edit `wavetable.setParams`: patches any subset of WT-1 parameters
// onto a MIDI track's wavetable instrument (`{ trackId, ... }`).
QJsonObject setWavetableParamsEdit(QJsonObject doc, const QJsonObject& payload);

// Registers `wavetable.setPreset` and `wavetable.setParams` in `nt::app::registerEdit`.
void registerWavetableEdits();

}  // namespace nt::midi
