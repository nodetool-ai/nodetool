#pragma once

#include "model/TimelineTypes.h"

#include <QByteArray>
#include <QString>

#include <optional>

namespace nt {

struct ParseResult {
    std::optional<Timeline> timeline;
    QString error;
};

// Parses a timeline sequence document. Unknown fields are ignored, the way Zod
// strips them. Relative `mediaPath` values resolve against `baseDir`.
ParseResult parseTimelineJson(const QByteArray& json, const QString& baseDir = QString());
ParseResult loadTimelineFile(const QString& path);

}  // namespace nt
