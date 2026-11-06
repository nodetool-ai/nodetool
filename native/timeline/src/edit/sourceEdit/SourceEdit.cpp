#include "SourceEdit.h"
#include "assets/AssetClip.h"
#include "assets/AssetDrop.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/targeting/TargetingEdits.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nt::sourceedit {
namespace {
// sourceEdit.ts asks assetMediaType(content_type), without the filename hint.
QString sourceMediaType(const QJsonObject& asset) {
    return nt::assets::assetMediaType(QJsonObject{{"content_type", asset.value("content_type")}});
}
}
namespace {
std::vector<QJsonObject> orderedTracks(const QJsonObject& raw) {
    std::vector<QJsonObject> tracks;
    for (const auto& value : raw.value("tracks").toArray()) { tracks.push_back(value.toObject()); }
    std::stable_sort(tracks.begin(), tracks.end(), [](const auto& a, const auto& b) {
        return a.value("index").toDouble() < b.value("index").toDouble();
    });
    return tracks;
}
bool fits(const QJsonObject& track, bool video) {
    return video ? nt::edit::clipFitsTrack("video", track.value("type").toString()) : track.value("type") == "audio";
}
QString destinationError(const QJsonObject& raw, const QString& id, bool video) {
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("id").toString() != id) { continue; }
        if (track.value("locked").toBool()) {
            return track.value("name").toString(video ? "Video track" : "Audio track") + " is locked. Unlock it to place this clip here.";
        }
        return fits(track, video) ? QString{} : video ? "Drop video on a video track." : "Drop audio on an audio track.";
    }
    return "This track is no longer available. Choose another track.";
}
}
Destinations sourceDropDestinations(const QJsonObject& raw, const QString& droppedTrackId, bool video, bool audio) {
    Destinations result;
    if (!video && !audio) { result.error = "Choose video or audio to place this source."; return result; }
    if (droppedTrackId.isEmpty()) { result.newVideoTrack = video; result.newAudioTrack = audio; return result; }
    const auto tracks = orderedTracks(raw);
    const auto dropped = std::find_if(tracks.begin(), tracks.end(), [&](const auto& t) { return t.value("id") == droppedTrackId; });
    const bool droppedVideo = dropped != tracks.end() && fits(*dropped, true);
    const bool onVideo = video && (!audio || droppedVideo);
    result.error = destinationError(raw, droppedTrackId, onVideo);
    if (!result.error.isEmpty()) { return result; }
    (onVideo ? result.videoTrackId : result.audioTrackId) = droppedTrackId;
    if (!video || !audio) { return result; }
    size_t position = 0;
    for (auto it = tracks.begin(); it != dropped; ++it) { if (fits(*it, onVideo)) { ++position; } }
    std::vector<QJsonObject> other;
    for (const auto& track : tracks) { if (fits(track, !onVideo)) { other.push_back(track); } }
    QString paired;
    if (position < other.size()) { paired = other[position].value("id").toString(); }
    else {
        for (const auto& track : other) {
            if (!track.value("locked").toBool()) { paired = track.value("id").toString(); break; }
        }
    }
    if (paired.isEmpty()) { (onVideo ? result.newAudioTrack : result.newVideoTrack) = true; }
    else {
        result.error = destinationError(raw, paired, !onVideo);
        (onVideo ? result.audioTrackId : result.videoTrackId) = paired;
    }
    return result;
}
QJsonObject placementToJson(const Placement& p) {
    return {{"asset", p.asset}, {"inMs", p.inMs}, {"outMs", p.outMs}, {"videoTrackId", p.videoTrackId},
        {"audioTrackId", p.audioTrackId}, {"newVideoTrack", p.newVideoTrack}, {"newAudioTrack", p.newAudioTrack},
        {"startMs", p.startMs}, {"mode", p.mode}, {"snapMs", p.snapMs},
        {"videoClipId", p.videoClipId}, {"audioClipId", p.audioClipId}};
}
std::optional<Result> placeSource(const QJsonObject& raw, const nt::targeting::TargetingState& state,
                                  const Placement& p, QString* error) {
    if (error) { error->clear(); }
    const auto fail = [&](const QString& why) -> std::optional<Result> { if (error) { *error = why; } return std::nullopt; };
    const auto type = sourceMediaType(p.asset);
    const bool video = p.newVideoTrack || !p.videoTrackId.isEmpty();
    const bool audio = p.newAudioTrack || !p.audioTrackId.isEmpty();
    if (p.asset.value("id").toString().isEmpty() || (type != "video" && type != "audio" && type != "image") ||
        (!video && !audio) || (type == "audio" && video) || (type == "image" && audio)) {
        return fail("Choose a track that fits this source.");
    }
    if (!std::isfinite(p.inMs) || !std::isfinite(p.outMs) || !std::isfinite(p.startMs) || !std::isfinite(p.snapMs) ||
        (type != "image" && (p.inMs < 0 || p.outMs <= p.inMs))) { return fail("Mark a non-empty source range."); }
    if (p.mode != "append" && p.mode != "overlap" && p.mode != "insert" && p.mode != "overwrite") { return fail("Choose a placement mode."); }
    for (const bool picture : {true, false}) {
        const auto id = picture ? p.videoTrackId : p.audioTrackId;
        const bool create = picture ? p.newVideoTrack : p.newAudioTrack;
        if (create && !id.isEmpty()) { return fail("Choose an existing track or create a new track."); }
        if (!id.isEmpty()) {
            const auto why = destinationError(raw, id, picture);
            if (!why.isEmpty()) { return fail(why); }
        }
    }
    auto result = raw;
    auto tracks = raw.value("tracks").toArray();
    if (p.newVideoTrack || p.newAudioTrack) {
        for (qsizetype i = 0; i < tracks.size(); ++i) { auto t = tracks[i].toObject(); t.insert("index", int(i)); tracks[i] = t; }
    }
    const auto create = [&](const QString& kind) {
        const auto id = nt::edit::newId();
        tracks.append(QJsonObject{{"id", id}, {"name", kind == "audio" ? "Audio" : "Video"}, {"type", kind},
            {"index", int(tracks.size())}, {"visible", true}, {"locked", false}});
        return id;
    };
    const auto videoId = p.newVideoTrack ? create("video") : p.videoTrackId;
    const auto audioId = p.newAudioTrack ? create("audio") : p.audioTrackId;
    result.insert("tracks", tracks);
    auto doc = nt::edit::structure::editDocument(result);
    double start = std::max(0.0, p.startMs);
    const auto mode = p.mode == "append" ? QString("overlap") : p.mode;
    if (p.mode == "append") {
        start = 0;
        for (const auto& c : doc.clips) {
            if ((!videoId.isEmpty() && nt::edit::clipTrackId(c) == videoId) || (!audioId.isEmpty() && nt::edit::clipTrackId(c) == audioId)) { start = std::max(start, nt::edit::clipEndMs(c)); }
        }
    } else if ((mode == "insert" || mode == "overwrite") && p.snapMs > 0) {
        start = nt::assets::snapAssetDropMs(raw.value("clips").toArray(), video ? videoId : audioId, start, p.snapMs);
    }
    const auto link = video && audio ? nt::edit::newId() : QString{};
    nt::edit::IdSet ids;
    QString first;
    for (const bool picture : {true, false}) {
        if (picture ? !video : !audio) { continue; }
        QJsonObject clip;
        if (!picture && type == "video") {
            clip = {{"id", nt::edit::newId()}, {"trackId", audioId}, {"name", p.asset.value("name").toString() + " (audio)"},
                {"startMs", start}, {"mediaType", "audio"}, {"sourceType", "imported"}, {"status", "generating"},
                {"locked", false}, {"versions", QJsonArray{}}};
        } else {
            const auto base = nt::assets::assetToClip(p.asset, picture ? videoId : audioId, start);
            if (!base) { return fail("This source could not be placed."); }
            clip = *base;
        }
        if (type != "image") {
            clip.insert("inPointMs", p.inMs); clip.insert("outPointMs", p.outMs); clip.insert("durationMs", p.outMs - p.inMs);
        }
        if (picture && type == "video" && !audio) { clip.insert("muted", true); }
        if (!link.isEmpty()) { clip.insert("linkId", link); }
        if (const auto& fixed = picture ? p.videoClipId : p.audioClipId; !fixed.isEmpty()) { clip.insert("id", fixed); }
        const auto id = clip.value("id").toString();
        if (first.isEmpty()) { first = id; }
        ids.insert(id); doc.clips.push_back(clip);
    }
    const auto unresolved = doc.clips;
    try { doc.clips = nt::targeting::resolveDropAction(doc, state, ids, mode); }
    catch (const nt::edit::OpError&) { return fail("This source could not be placed here."); }
    const auto blocked = QStringLiteral("A locked or linked clip is in the way. Unlock it or choose another position.");
    // An edit that refuses returns its input. An insert that moved nothing while a clip could have moved was refused.
    if (mode == "insert" && doc.clips == unresolved) {
        nt::edit::IdSet placedTracks;
        for (const auto& c : doc.clips) {
            if (ids.contains(nt::edit::clipId(c))) { placedTracks.insert(nt::edit::clipTrackId(c)); }
        }
        const auto frozen = nt::targeting::rippleFrozenTrackIds(doc, state, placedTracks);
        const auto locked = nt::edit::lockedUserTargetIds(doc);
        for (const auto& c : doc.clips) {
            if (!ids.contains(nt::edit::clipId(c)) && nt::edit::clipStartMs(c) >= start &&
                !frozen.contains(nt::edit::clipTrackId(c)) && !locked.contains(nt::edit::clipId(c))) {
                return fail(blocked);
            }
        }
    }
    // The new clips must not lie over anything the edit could not move.
    if (mode != "overlap") {
        for (const auto& placed : doc.clips) {
            if (!ids.contains(nt::edit::clipId(placed))) { continue; }
            for (const auto& other : doc.clips) {
                if (!ids.contains(nt::edit::clipId(other)) && nt::edit::clipTrackId(other) == nt::edit::clipTrackId(placed) &&
                    nt::edit::clipStartMs(other) < nt::edit::clipEndMs(placed) && nt::edit::clipStartMs(placed) < nt::edit::clipEndMs(other)) {
                    return fail(blocked);
                }
            }
        }
    }
    return Result{nt::edit::structure::withClips(result, doc.clips), first};
}
Range sourceRangeFor(const QJsonObject& asset, const QJsonObject& range) {
    const auto duration = asset.value("duration");
    const double fullMs = duration.isDouble() ? std::floor(duration.toDouble() * 1000 + 0.5) : 0;
    const auto marks = range.value("assetId") == asset.value("id") ? range : QJsonObject{};
    const double limit = fullMs != 0 ? fullMs : std::numeric_limits<double>::infinity();
    const double inMs = std::min(limit, std::max(0.0, marks.value("inMs").toDouble()));
    const auto markedOut = marks.value("outMs");
    const double outMs = markedOut.isDouble() ? markedOut.toDouble() : fullMs > 0 ? fullMs : inMs;
    return {inMs, std::min(limit, std::max(inMs, outMs))};
}
QString sourceTargetTrackId(const QJsonObject& raw, const nt::targeting::TargetingState& state,
                            const QJsonObject& asset) {
    const auto type = sourceMediaType(asset);
    if (type.isEmpty()) { return {}; }
    const auto targeted = nt::targeting::targetedTrackIds(nt::edit::structure::editDocument(raw), state);
    std::vector<QJsonObject> tracks;
    for (const auto& value : raw.value("tracks").toArray()) { tracks.push_back(value.toObject()); }
    std::stable_sort(tracks.begin(), tracks.end(), [](const auto& a, const auto& b) {
        return a.value("index").toDouble() < b.value("index").toDouble();
    });
    for (const auto& track : tracks) {
        const auto id = track.value("id").toString();
        if (targeted.contains(id) && nt::edit::clipFitsTrack(type, track.value("type").toString())) { return id; }
    }
    return {};
}
std::optional<Result> performSourceEdit(const QString& kind, const QJsonObject& raw,
    const nt::targeting::TargetingState& state, const QJsonObject& marks, double playheadMs,
    const QJsonObject& asset) {
    if (asset.isEmpty()) { return std::nullopt; }
    auto [inMs, outMs] = sourceRangeFor(asset, marks);
    const auto type = sourceMediaType(asset);
    if (type.isEmpty() || (type != "image" && outMs <= inMs)) { return std::nullopt; }
    const auto trackId = sourceTargetTrackId(raw, state, asset);
    if (trackId.isEmpty()) { return std::nullopt; }
    if (type == "image" && outMs <= inMs) {
        const auto base = nt::assets::assetToClip(asset, trackId, 0);
        if (!base) { return std::nullopt; }
        inMs = 0;
        outMs = base->value("durationMs").toDouble();
    }
    auto doc = nt::edit::structure::editDocument(raw);
    double startMs = playheadMs;
    if (kind == "append") {
        startMs = 0;
        for (const auto& clip : doc.clips) {
            if (nt::edit::clipTrackId(clip) == trackId) { startMs = std::max(startMs, nt::edit::clipEndMs(clip)); }
        }
    }
    auto ranged = nt::assets::assetToClip(asset, trackId, startMs);
    if (!ranged) { return std::nullopt; }
    // addSourceRange branches on the adapter's media type, as the web does.
    if (ranged->value("mediaType") != "image") {
        ranged->insert("inPointMs", inMs);
        ranged->insert("outPointMs", outMs);
    }
    ranged->insert("durationMs", std::max(1.0, outMs - inMs));
    const auto id = ranged->value("id").toString();
    doc.clips.push_back(*ranged);
    if (kind == "insert" || kind == "overwrite") {
        doc.clips = nt::targeting::resolveDropAction(doc, state, {id}, kind);
    }
    return Result{nt::edit::structure::withClips(raw, doc.clips), id};
}
}
