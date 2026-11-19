#include "server/ServerTimelineProbe.h"

#include "preview/FfmpegSource.h"

namespace nt::server {
namespace {

QString probeRejection(const std::string& path) {
    const MediaFacts facts = probeMedia(path);
    if (facts.usable()) {
        return {};
    }
    return QString::fromStdString(!facts.opened ? facts.error : facts.rejection);
}

}  // namespace

ServerOpenResult openProbedServerTimeline(const ServerOpenOptions& options) {
    return openServerTimeline(options, probeRejection);
}

ServerOpenResult resolveProbedTimelineDocumentMedia(const ServerOpenOptions& options, const QJsonObject& raw) {
    return resolveTimelineDocumentMedia(options, raw, probeRejection);
}

}  // namespace nt::server
