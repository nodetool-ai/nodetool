#pragma once

#include <QJsonObject>
#include <QString>
#include <QStringList>

namespace nt::midi {

// Built-in MIDI instrument types, in menu order.
[[nodiscard]] QStringList builtinInstrumentTypes();

// Returns the default `track.instrument` object for a built-in type and an optional preset id,
// or an empty object when the type or preset is unknown.
[[nodiscard]] QJsonObject builtinInstrument(const QString& type, const QString& preset = {});

// Edit `instrument.setBuiltin` {trackId, type, preset?}: replaces a MIDI track's instrument with a
// built-in one. Unknown types, locked tracks and non-MIDI tracks leave the document unchanged.
QJsonObject setBuiltinInstrumentEdit(QJsonObject doc, const QJsonObject& payload);

// Registers `instrument.setBuiltin` in `nt::app::registerEdit`.
void registerInstrumentEdits();

}  // namespace nt::midi
