#pragma once

#include "model/TimelineTypes.h"

#include <QByteArray>
#include <QJsonObject>
#include <QString>

#include <optional>

namespace nt {

struct ParseResult {
    std::optional<Timeline> timeline;
    QString error;
    bool unsupportedColorSpaceVersion = false;
    QString unsupportedColorSpaceVersionText;
};

// Parses a supported timeline sequence document. Unknown fields stay in raw.
// Relative `mediaPath` values resolve against `baseDir`.
ParseResult parseTimelineJson(const QByteArray& json, const QString& baseDir = QString());
// The same, from a parsed object: no text step.
ParseResult parseTimeline(const QJsonObject& root, const QString& baseDir = QString());
// Reads a sequence document, or a project folder's timeline file
// (`Timelines/<name>.timeline.json`, see timelineFileSequence).
ParseResult loadTimelineFile(const QString& path);

// A project folder's timeline file wraps the document in an envelope:
// {"format":"nodetool.timeline","version":1,"id","fps","width","height",
//  "duration_ms","document":{...}}, with no name (the file name is the name).
// packages/project-services/src/timeline-file.ts writes and checks it.
inline constexpr int kTimelineFileVersion = 1;
bool isTimelineFile(const QJsonObject& root);
// The sequence the file holds: the document's fields beside id, name, fps,
// width, height and durationMs.
QJsonObject timelineFileSequence(const QJsonObject& file, const QString& name);
// `file` with its body replaced from `sequence`. Other top-level keys stay.
QJsonObject timelineFileWithSequence(const QJsonObject& file, const QJsonObject& sequence);

}  // namespace nt
