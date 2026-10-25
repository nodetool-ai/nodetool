#pragma once

// The unsupported-field part of the loader report (PLAN.md M5a exit 1).
//
// It reads the raw JSON of a sequence (the `timelineSequenceResponse` that
// `timeline.get` returns) and lists, per sequence, track and clip, each field
// with a value that the native model does not apply. A field set to its empty
// value (null, false, "", [] or {}) changes nothing and is not listed.
// Fields with no effect on picture or sound (generation metadata, ids,
// `versions`, ...) are not listed either.
//
// Each entry names what the field changes, so a check can scope itself:
//   plan   - the layer set, z order, opacity or placement (the FramePlan, D6)
//   pixels - only what a layer draws inside its placement
//   audio  - sound
//   unknown - not in the server schema; the server strips it on save (D4)

#include <QJsonObject>
#include <QString>

namespace nt::server {

// {"sequence":[{field,effect}], "tracks":[{id,fields:[...]}],
//  "clips":[{id,fields:[...]}], "fields":{"clip.animations":{effect,count},...}}
// Entities with no entry are left out of "tracks" and "clips".
QJsonObject auditTimelineFields(const QJsonObject& sequence);

}  // namespace nt::server
