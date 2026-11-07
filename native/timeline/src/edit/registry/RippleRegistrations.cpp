#include "app/EditRegistry.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/groups/GroupOps.h"
#include "edit/registry/TargetingEditAdapter.h"
#include "edit/targeting/TrackTargeting.h"
#include <algorithm>

namespace {
QJsonArray jsonIds(const nt::edit::IdSet& ids) {
    QJsonArray result;
    for (const auto& id : ids) {
        result.append(id);
    }
    return result;
}
bool targetsGroup(const QString& action, const QJsonObject& raw, const QJsonObject& payload) {
    // Gap edits target a track. Trims use the primary clip, deletes use the selection.
    if (action == u"closeGapAt") {
        return false;
    }
    const auto selected = action == u"rippleDeleteSelected" ? nt::edit::structure::selectedIds(payload)
                                                          : QStringList{payload.value("clipId").toString()};
    const nt::edit::IdSet targets(selected.begin(), selected.end());
    const auto clips = raw.value("clips").toArray();
    return std::any_of(clips.begin(), clips.end(), [&](const auto& value) {
        const auto clip = value.toObject();
        return targets.contains(nt::edit::clipId(clip)) && nt::edit::isGroupClip(clip);
    });
}
QJsonObject applyRippleEdit(const QString& action, QJsonObject raw, QJsonObject payload) {
    const auto& state = nt::targeting::TrackTargeting::current().state();
    if (!payload.contains("untargetedTrackIds")) {
        payload.insert("untargetedTrackIds", jsonIds(state.untargetedTrackIds));
    }
    if (!payload.contains("syncLockOffTrackIds")) {
        payload.insert("syncLockOffTrackIds", jsonIds(state.syncLockOffTrackIds));
    }
    if (targetsGroup(action, raw, payload)) {
        return nt::edit::groups::applyGroupEdit(action, std::move(raw), payload);
    }
    return nt::edit::registry::applyTargetingEdit(action, std::move(raw), payload);
}
const bool registered = [] {
    for (const auto& name : QStringList{"rippleTrimClipStart", "rippleTrimClipEnd", "rippleDeleteSelected"}) {
        nt::app::overrideEdit(name, [name](QJsonObject raw, const QJsonObject& payload) {
            return applyRippleEdit(name, std::move(raw), payload);
        });
    }
    nt::app::registerEdit("closeGapAt", [](QJsonObject raw, const QJsonObject& payload) {
        return applyRippleEdit("closeGapAt", std::move(raw), payload);
    });
    return true;
}();
} // namespace
