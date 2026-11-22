#pragma once

// Document edits for track instruments (`setTrackInstrument`).
// Thread affinity: pure JSON transform functions, callable from any thread.

#include <QJsonObject>

namespace nt::audio::vst {

QJsonObject setTrackInstrument(QJsonObject doc, const QJsonObject& payload);
QJsonObject setTrackInstrumentState(QJsonObject doc, const QJsonObject& payload);
void registerVstEdits();

}  // namespace nt::audio::vst
