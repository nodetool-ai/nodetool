#pragma once

// New music project (docs/MUSIC-MODE.md section 15 Entry, UI-1, MD9): the
// settings the dialog asks for and the document fields the new sequence gets.
// The sequence carries the `music` object, the tempo with the optional key,
// and four audio tracks with the roles drums, bass, keyboard and guitar, each
// named after its role.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include "music/MusicPlan.h"

#include <QJsonObject>
#include <QString>
#include <QVariantMap>

#include <array>
#include <functional>
#include <optional>

namespace nt::music {

struct MusicProjectSettings {
    double bpm = 120;
    int beatsPerBar = 4;
    int beatUnit = 4;
    std::optional<MusicKey> key;
};

// The signatures a music project offers, in the dialog's order (MF6).
inline constexpr std::array<std::array<int, 2>, 4> kMusicSignatures{{{2, 4}, {3, 4}, {4, 4}, {6, 8}}};

// Settings from the dialog's map: {bpm, beatsPerBar, beatUnit, keyTonic, keyMode}.
// An empty keyTonic means no key.
[[nodiscard]] MusicProjectSettings musicProjectSettings(const QVariantMap& values);
// Why these settings cannot make a music project, or empty: the tempo rules
// of MD9, then a key the model does not accept.
[[nodiscard]] QString musicProjectRefusal(const MusicProjectSettings& settings);
// The document fields of the new sequence: tracks, clips, markers, tempo and
// music. `newId` makes each track id. Call only for settings with no refusal.
[[nodiscard]] QJsonObject musicProjectDocument(const MusicProjectSettings& settings, const std::function<QString()>& newId);

// The `music.setTrackRole` edit (MD4, UI-3): payload {trackId, role}. Sets the
// audio track's `musicRole`, or removes it for an empty role. Returns the
// document unchanged, which refuses the edit, for an unknown track, a track
// that is not audio, or a role that is not one of kMusicRoles.
[[nodiscard]] QJsonObject setTrackRole(QJsonObject document, const QJsonObject& payload);

// The `music.setKey` edit (MD2): payload {tonic, mode}. Sets `tempo.key`, or
// removes it for an empty tonic. It changes no timing field, so the tempo
// lock of MD6 does not refuse it. Returns the document unchanged for a
// sequence with no tempo object, a tonic outside kMusicKeyTonics, a mode other
// than "major" or "minor", or the key the tempo already holds.
[[nodiscard]] QJsonObject setTempoKey(QJsonObject document, const QJsonObject& payload);

} // namespace nt::music
