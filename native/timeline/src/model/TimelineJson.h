#pragma once

#include "model/TimelineTypes.h"

#include <QByteArray>
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
ParseResult loadTimelineFile(const QString& path);

}  // namespace nt
