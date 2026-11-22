#pragma once

#include <QJsonArray>
#include <QJsonObject>

namespace nt::midi {

// The note cap of one clip (MIDI_MAX_NOTES_PER_CLIP in the protocol schema).
inline constexpr int MAX_NOTES_PER_CLIP = 4096;

// Limits of the controller lanes and expression curves (protocol schema).
inline constexpr int MAX_CONTROLLER_LANES_PER_CLIP = 32;
inline constexpr int MAX_CONTROLLER_POINTS_PER_LANE = 4096;
inline constexpr int MAX_EXPRESSION_POINTS = 256;

// The valid notes of `notes`, as the protocol `midiNote` schema reads them:
// pitch 0..127, velocity 1..127, startTick >= 0, durationTick > 0, all
// integers. A note with no id gets a new one. The optional fields are kept
// when valid: muted (bool), channel (0..15), releaseVelocity (0..127) and
// expression ({pitch, volume, pan, brightness} point arrays: tick 0..
// durationTick, non-decreasing, at most MAX_EXPRESSION_POINTS, value in the
// range of its kind). Returns false when a note or a field is invalid or
// there are more than MAX_NOTES_PER_CLIP.
[[nodiscard]] bool sanitizeNotes(const QJsonArray& notes, QJsonArray& out);

// The valid controller lanes of one clip. A lane is {id, kind, cc?, pitch?,
// channel?, interpolation?, points[{id, tick, value}]}; see the protocol
// `midiControllerLane` schema. A lane or point with no id gets a new one.
// Returns false on any invalid field, duplicate lane identity (kind, cc,
// pitch, channel), duplicate point id in a lane, decreasing ticks or a
// count over the limits.
[[nodiscard]] bool sanitizeControllers(const QJsonArray& lanes, QJsonArray& out);

// The `midi.setControllers` edit: {clipId, controllers}. Replaces the
// controller lanes of one unlocked midi clip. Any invalid input returns `raw`
// unchanged. An empty array removes the `controllers` field.
[[nodiscard]] QJsonObject setClipControllers(QJsonObject raw, const QJsonObject& payload);

// The `midi.setNotes` edit: {clipId, notes}. Replaces the notes of one
// unlocked midi clip. Any invalid input returns `raw` unchanged.
[[nodiscard]] QJsonObject setClipNotes(QJsonObject raw, const QJsonObject& payload);

}  // namespace nt::midi
