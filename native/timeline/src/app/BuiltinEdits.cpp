#include "app/EditRegistry.h"
#include "edit/EditActions.h"
#include <QJsonArray>
#include <QUuid>
#include <algorithm>
#include <cmath>

namespace {
using namespace nt::edit;
QStringList ids(const QJsonObject& payload) {
    QStringList out;
    for (const auto& id : payload.value("selectedIds").toArray()) {
        out.append(id.toString());
    }
    if (out.isEmpty() && payload.contains("clipId")) {
        out.append(payload.value("clipId").toString());
    }
    return out;
}
EditDoc document(const QJsonObject& raw) {
    EditDoc doc;
    for (const auto& clip : raw.value("clips").toArray()) {
        doc.clips.push_back(clip.toObject());
    }
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        doc.tracks.push_back(
            {track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    for (const auto& value : raw.value("mediaTracks").toArray()) {
        doc.clipsWithMediaTracks.insert(value.toObject().value("clipId").toString());
    }
    return doc;
}
QJsonObject clipEdit(const QString& name, QJsonObject raw, const QJsonObject& p) {
    const auto doc = document(raw);
    const auto id = p.value("clipId").toString();
    const auto selected = ids(p);
    const IdSet selectedSet(selected.begin(), selected.end());
    const bool linked = p.value("linked").toBool(true);
    double delta = p.value("deltaMs").toDouble();
    const auto toTrack = p.value("toTrackId").toString();
    const auto edge = p.value("edge").toString();
    const auto duration = p.value("maxSourceDurationMs");
    const auto maximum = duration.isDouble() ? std::optional<double>(duration.toDouble()) : std::nullopt;
    auto clips = doc.clips;
    if (name == "splitClipAtTime") {
        clips = splitClipAtTime(doc, id, p.value("atMs").toDouble());
    } else if (name == "splitSelectedAtPlayhead") {
        clips = splitSelectedAtPlayhead(doc, p.value("timeMs").toDouble(), selected).clips;
    } else if (name == "deleteSelected") {
        clips = deleteSelected(doc, selectedSet);
    } else if (name == "rippleDeleteSelected") {
        clips = rippleDeleteSelected(doc, selectedSet);
    } else if (name == "moveClip") {
        clips = moveClip(doc, id, delta, toTrack, linked);
    } else if (name == "moveSelectedClips") {
        clips = moveSelectedClips(doc, id, selected, delta, toTrack, linked);
    } else if (name == "nudge") {
        if (p.contains("frames")) {
            const auto primary =
                std::find_if(clips.begin(), clips.end(), [&](const auto& c) { return clipId(c) == id; });
            if (primary == clips.end()) {
                return raw;
            }
            delta = frameStepMs(clipStartMs(*primary), p.value("frames").toDouble(), raw.value("fps").toDouble(30)) -
                    clipStartMs(*primary);
        }
        clips = moveSelectedClips(doc, id, selected, delta, {}, linked);
    } else if (name == "trimClipStart") {
        clips = trimClipStart(doc, id, delta, linked);
    } else if (name == "trimClipEnd") {
        clips = trimClipEnd(doc, id, delta, maximum, linked);
    } else if (name == "rippleTrimClipStart") {
        clips = rippleTrimClipStart(doc, id, delta, linked);
    } else if (name == "rippleTrimClipEnd") {
        clips = rippleTrimClipEnd(doc, id, delta, maximum, linked);
    } else if (name == "rollClipEdge") {
        clips = rollClipEdge(doc, id, edge, delta, maximum, linked);
    } else if (name == "resolveDropAction") {
        clips = resolveDropAction(doc, selectedSet, p.value("mode").toString());
    } else if (name == "rateStretchClip") {
        clips = rateStretchClip(doc, id, edge, p.value("durationMs").toDouble(), linked);
    } else if (name == "slideClip") {
        clips = slideClip(doc, id, delta, linked);
    } else if (name == "slipClip") {
        const auto primary = std::find_if(clips.begin(), clips.end(), [&](const auto& c) { return clipId(c) == id; });
        if (primary == clips.end()) {
            return raw;
        }
        const auto patches = planSlip(doc, *primary, p.value("sourceDeltaMs").toDouble(), maximum, linked);
        if (patches) {
            clips = applyPatches(clips, *patches);
        }
    }
    QJsonArray result;
    for (const auto& clip : clips) {
        result.append(clip);
    }
    raw.insert("clips", result);
    return raw;
}
const bool registered = [] {
    for (const auto& name : QStringList{
             "splitClipAtTime", "splitSelectedAtPlayhead", "deleteSelected", "rippleDeleteSelected", "moveClip",
             "moveSelectedClips", "nudge", "trimClipStart", "trimClipEnd", "rippleTrimClipStart", "rippleTrimClipEnd",
             "rollClipEdge", "resolveDropAction", "rateStretchClip", "slideClip", "slipClip"}) {
        nt::app::registerEdit(name, nt::app::BuiltinClipEdit{name, &clipEdit});
    }
    nt::app::registerEdit("addMarker", [](QJsonObject raw, const QJsonObject& payload) {
        auto markers = raw.value("markers").toArray();
        auto marker = payload;
        if (!marker.contains("id")) {
            marker.insert("id", QUuid::createUuid().toString(QUuid::Id128));
        }
        marker.insert("timeMs", std::max(0.0, std::round(payload.value("timeMs").toDouble())));
        markers.append(marker);
        raw.insert("markers", markers);
        return raw;
    });
    nt::app::registerEdit("deleteMarker", [](QJsonObject raw, const QJsonObject& payload) {
        QJsonArray after;
        for (const auto& marker : raw.value("markers").toArray()) {
            if (marker.toObject().value("id") != payload.value("id")) {
                after.append(marker);
            }
        }
        raw.insert("markers", after);
        return raw;
    });
    return true;
}();
} // namespace
