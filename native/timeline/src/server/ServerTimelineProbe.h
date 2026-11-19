#pragma once

#include "server/ServerTimeline.h"

namespace nt::server {

ServerOpenResult openProbedServerTimeline(const ServerOpenOptions& options);
ServerOpenResult resolveProbedTimelineDocumentMedia(const ServerOpenOptions& options, const QJsonObject& raw);

}  // namespace nt::server
