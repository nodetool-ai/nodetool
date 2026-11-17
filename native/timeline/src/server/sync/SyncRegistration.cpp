#include "DocumentApplier.h"
#include "TimelineMerge.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>

namespace {
QString mediaKey(const QJsonObject& raw) {
    // Same identity as TimelineModel's resolved-media table. JSON encoding
    // preserves boundaries even when a path contains a separator character.
    return QString::fromUtf8(QJsonDocument(QJsonArray{raw.value("mediaType"), raw.value("mediaPath"),
        raw.value("originalMediaPath"), raw.value("audioPath"), raw.value("currentAssetId")}).toJson(QJsonDocument::Compact));
}
const bool registered = [] {
    nt::server::sync::setMediaRegistrar([](QObject* timeline, const nt::Clip& media) {
        if (auto* model = qobject_cast<TimelineModel*>(timeline)) {
            model->registerMedia(media);
        }
    });
    nt::server::sync::setDocumentApplier([](QUndoStack* undo, const QJsonObject& raw, const nt::Timeline& server) {
        auto* model = undo ? qobject_cast<TimelineModel*>(undo->parent()) : nullptr;
        if (!model) {
            return false;
        }
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson(QJsonDocument::Compact));
        if (!parsed.timeline) {
            return false;
        }
        QHash<QString, const nt::Clip*> resolved;
        QHash<QString, const nt::Clip*> current;
        for (const auto& clip : server.clips) {
            resolved.insert(mediaKey(clip.raw), &clip);
        }
        for (const auto& clip : model->timeline().clips) {
            current.insert(QString::fromStdString(clip.id), &clip);
        }
        for (auto& clip : parsed.timeline->clips) {
            const auto* source = resolved.value(mediaKey(clip.raw), nullptr);
            if (!source) {
                const auto* previous = current.value(QString::fromStdString(clip.id), nullptr);
                if (previous && mediaKey(previous->raw) == mediaKey(clip.raw)) {
                    source = previous;
                }
            }
            if (source) {
                // ServerTimeline sets these paths beyond parsed JSON.
                clip.mediaPath = source->mediaPath;
                clip.originalMediaPath = source->originalMediaPath;
                clip.audioPath = source->audioPath;
                clip.generatedMattePath = source->generatedMattePath;
            }
        }
        // The delta from the draft to the adopted document rebases undo, so a
        // server write no longer costs the local history (B54).
        const auto draft = model->timeline().raw;
        model->adoptExternalTimeline(std::move(*parsed.timeline), [&draft, &raw](const QJsonObject& snapshot) {
            return nt::server::sync::rebaseHistoryDocument(snapshot, draft, raw);
        });
        return true;
    });
    return nt::app::registerEdit(QStringLiteral("acceptExternalUnit"), nt::server::sync::applyAcceptedUnit);
}();
} // namespace
