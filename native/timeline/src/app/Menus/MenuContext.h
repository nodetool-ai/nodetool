// Reads the context every menu passes to its predicates. A menu item works with the
// editor's objects when one is open, and on the clips the context names, else on the
// selection. ClipGestureController::runAction resolves targets the same way.
#pragma once
#include "edit/ClipGestureController.h"
#include "edit/EditActions.h"
#include "edit/clipboard/RawDocument.h"
#include "playback/PlaybackClock.h"

#include <QVariantMap>
#include <algorithm>

namespace nt::app::menu {
inline ClipGestureController* gestures(const QVariantMap& context) {
    return qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
}
inline QStringList clipTargets(const QVariantMap& context) {
    if (context.contains("clipIds")) { return context.value("clipIds").toStringList(); }
    auto* g = gestures(context);
    return g ? g->selection() : QStringList{};
}
// The raw clips the context targets, in document order.
inline QList<QJsonObject> targetClips(const QVariantMap& context) {
    QList<QJsonObject> out;
    auto* g = gestures(context);
    if (!g || !g->timeline()) { return out; }
    const auto ids = clipTargets(context);
    for (const auto& value : g->timeline()->clipsJson()) {
        const auto clip = value.toObject();
        if (ids.contains(clip.value("id").toString())) { out.append(clip); }
    }
    return out;
}
inline bool anyTarget(const QVariantMap& context, const std::function<bool(const QJsonObject&)>& test) {
    const auto clips = targetClips(context);
    return std::any_of(clips.begin(), clips.end(), test);
}
inline bool hasEditor(const QVariantMap& context) {
    auto* g = gestures(context);
    return g && g->timeline();
}
// markClip marks the selection, else the clip at the playhead on an unlocked track.
inline bool canMarkClip(const QVariantMap& context) {
    auto* g = gestures(context);
    if (!g || !g->timeline() || !g->clock()) { return false; }
    if (!g->selection().isEmpty()) { return true; }
    const auto doc = g->editDoc();
    const auto locked = nt::edit::lockedTrackIds(doc);
    const double at = g->clock()->currentTimeMs();
    return std::any_of(doc.clips.begin(), doc.clips.end(), [&](const QJsonObject& clip) {
        return !nt::edit::isGroupClip(clip) && !locked.contains(nt::edit::clipTrackId(clip)) &&
            nt::edit::clipStartMs(clip) <= at && at < nt::edit::clipEndMs(clip);
    });
}
}  // namespace nt::app::menu
