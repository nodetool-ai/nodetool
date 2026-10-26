#include "app/EditRegistry.h"
#include "TargetingEdits.h"
#include <QJsonArray>

namespace {
using namespace nt::edit;
using nt::targeting::TargetingState;
IdSet ids(const QJsonValue& value) {
    IdSet result;
    for (const auto& id : value.toArray()) { result.insert(id.toString()); }
    return result;
}
EditDoc document(const QJsonObject& raw) {
    EditDoc doc;
    for (const auto& c : raw.value("clips").toArray()) { doc.clips.push_back(c.toObject()); }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto t = value.toObject();
        doc.tracks.push_back({t.value("id").toString(), t.value("type").toString(), t.value("locked").toBool()});
    }
    for (const auto& value : raw.value("mediaTracks").toArray()) {
        doc.clipsWithMediaTracks.insert(value.toObject().value("clipId").toString());
    }
    return doc;
}
TargetingState targeting(const QJsonObject& payload) {
    auto state = nt::targeting::TrackTargeting::current().state();
    if (payload.contains("untargetedTrackIds")) { state.untargetedTrackIds = ids(payload.value("untargetedTrackIds")); }
    if (payload.contains("syncLockOffTrackIds")) { state.syncLockOffTrackIds = ids(payload.value("syncLockOffTrackIds")); }
    return state;
}
QJsonObject apply(const QString& action, QJsonObject raw, const QJsonObject& p) {
    const auto doc = document(raw);
    const auto state = targeting(p);
    const auto id = p.value("clipId").toString();
    auto selected = ids(p.value("selectedIds"));
    if (selected.empty() && p.contains("clipId")) { selected.insert(id); }
    const bool linked = p.value("linked").toBool(true);
    const double delta = p.value("deltaMs").toDouble();
    ClipList clips;
    if (action == u"rippleTrimClipStart") {
        clips = nt::targeting::rippleTrimClipStart(doc, state, id, delta, linked);
    } else if (action == u"rippleTrimClipEnd") {
        const auto value = p.value("maxSourceDurationMs");
        const auto maximum = value.isDouble() ? std::optional<double>(value.toDouble()) : std::nullopt;
        clips = nt::targeting::rippleTrimClipEnd(doc, state, id, delta, maximum, linked);
    } else if (action == u"rippleDeleteSelected") {
        clips = nt::targeting::rippleDeleteSelected(doc, state, selected);
    } else if (action == u"resolveDropAction") {
        clips = nt::targeting::resolveDropAction(doc, state, selected, p.value("mode").toString());
    } else if (action == u"closeGapAt") {
        clips = nt::targeting::closeGapAt(doc, state, p.value("trackId").toString(), p.value("timeMs").toDouble());
    } else if (action == u"removeRange") {
        const auto beforeMedia = raw.value("mediaTracks").toArray();
        auto result = nt::targeting::removeRange(doc, beforeMedia, state, p.value("startMs").toDouble(),
                                               p.value("endMs").toDouble(), p.value("ripple").toBool());
        clips = std::move(result.clips);
        if (result.mediaTracks != beforeMedia) { raw.insert("mediaTracks", result.mediaTracks); }
    }
    if (clips == doc.clips) { return raw; }
    QJsonArray after;
    for (const auto& c : clips) { after.append(c); }
    raw.insert("clips", after);
    return raw;
}
const bool registered = [] {
    for (const auto& action : QStringList{"rippleTrimClipStart", "rippleTrimClipEnd", "rippleDeleteSelected", "resolveDropAction"}) {
        nt::app::overrideEdit(action, [action](QJsonObject raw, const QJsonObject& p) { return apply(action, std::move(raw), p); });
    }
    for (const auto& action : QStringList{"removeRange", "closeGapAt"}) {
        nt::app::registerEdit(action, [action](QJsonObject raw, const QJsonObject& p) { return apply(action, std::move(raw), p); });
    }
    return true;
}();
}
