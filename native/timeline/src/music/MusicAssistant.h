#pragma once

// The music operations as Assistant tools (docs/MUSIC-MODE.md section 15,
// GN-8): ui_timeline_music_generate, ui_timeline_music_regenerate and
// ui_timeline_music_add_instrument. Each takes a track, a bar range, a prompt
// and optional candidates, seed and model, runs the planner for that
// operation, and refuses with the planner's message when the operation does
// not fit the range. Otherwise it calls MusicJobs::submit, the submission the
// music panel uses, and returns the job id. Generation runs on the local
// acestep backend only, so no tool starts a paid request.
//
// AssistantCommands lists and dispatches these tools after it has checked
// the timeline id.
//
// Thread affinity: GUI thread only, as MusicJobs and TimelineModel are.

#include <QJsonObject>
#include <QString>
#include <QVariantList>

class TimelineModel;

namespace nt::music {
class MusicJobs;

namespace assistant {

// The three tool schemas, each with the `timeline_id` the dispatcher checks.
QVariantList tools();
bool handles(const QString& name);
// Runs one tool. `{ok: true, job_id, ...}` or `{ok: false, error, refusal?, valid_tools?}`.
QJsonObject run(const QString& name, const QJsonObject& args, TimelineModel& model, MusicJobs& jobs);

}  // namespace assistant
}  // namespace nt::music
