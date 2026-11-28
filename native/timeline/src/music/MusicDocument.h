#pragma once

// Typed reads of the music document fields (docs/MUSIC-MODE.md section 5).
// The native model keeps every field in the raw JSON of the sequence, track,
// clip and take (DESIGN.md D4), so loading and saving lose nothing. These
// accessors read what music code needs: the key on the tempo (MD2), the
// sequence's music marker and prompt history (MD3), a track's role (MD4) and
// a take's generation record (MD5), which stays preserved JSON.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include "music/MusicPlan.h"

#include <QJsonObject>
#include <QStringList>

#include <optional>
#include <string>

namespace nt {
struct Track;
}

namespace nt::music {

// The twelve ACE-Step track names (MUSIC_ROLES in the protocol schema).
inline constexpr std::array<std::string_view, 12> kMusicRoles{
    "vocals", "backing_vocals", "drums", "bass", "guitar", "keyboard",
    "percussion", "strings", "synth", "fx", "brass", "woodwinds"};
// The key tonics the music model accepts (MUSIC_KEY_TONICS in the protocol schema).
inline constexpr std::array<std::string_view, 17> kMusicKeyTonics{"C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#",
                                                                  "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"};
// The tracks of a new music project, top to bottom (DEFAULT_MUSIC_TRACK_ROLES).
inline constexpr std::array<std::string_view, 4> kDefaultMusicTrackRoles{"drums", "bass", "keyboard", "guitar"};

[[nodiscard]] bool isMusicRole(std::string_view value);
// What the role picker and the track chip show (MUSIC_ROLE_LABELS).
[[nodiscard]] std::string_view musicRoleLabel(std::string_view role);

// `tempo.key` of a raw sequence. Absent, or a tonic or mode the schema does not list: nullopt.
[[nodiscard]] std::optional<MusicKey> tempoKey(const QJsonObject& rawSequence);
// The sequence carries the `music` object.
[[nodiscard]] bool isMusicSequence(const QJsonObject& rawSequence);
[[nodiscard]] QStringList promptHistory(const QJsonObject& rawSequence);
// `musicRole` of a raw track, or nullopt when absent or not one of kMusicRoles.
[[nodiscard]] std::optional<std::string> trackMusicRole(const QJsonObject& rawTrack);
[[nodiscard]] std::optional<std::string> trackMusicRole(const Track& track);
// `musicGeneration` of a raw take (a `versions` entry). Empty when absent.
[[nodiscard]] QJsonObject musicGeneration(const QJsonObject& rawVersion);

} // namespace nt::music
