#include "assets/AssetDrop.h"
#include "assets/AssetClip.h"
#include "edit/EditActions.h"
#include <QJsonArray>
#include <QSet>
#include <algorithm>
#include <cmath>

namespace nt::assets {
QJsonObject settleLinkedAudio(QJsonObject raw, const QJsonObject& payload) {
    auto clips = raw.value("clips").toArray();
    const auto id = payload.value("audioClipId").toString();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (clip.value("id").toString() != id) { continue; }
        const auto outcome = payload.value("outcome").toString();
        if (outcome == "silent") {
            const auto link = clip.value("linkId");
            clips.removeAt(i);
            qsizetype survivor = -1;
            int count = 0;
            for (qsizetype j = 0; j < clips.size(); ++j) {
                if (!link.isUndefined() && clips[j].toObject().value("linkId") == link) { survivor = j; ++count; }
            }
            if (count == 1) {
                auto unlinked = clips[survivor].toObject();
                unlinked.remove("linkId");
                clips[survivor] = unlinked;
            }
        } else if (outcome == "audio") {
            const auto asset = payload.value("asset").toObject();
            clip.insert("currentAssetId", asset.value("id"));
            const auto duration = asset.value("duration");
            if (duration.isDouble()) { clip.insert("durationMs", std::floor(duration.toDouble() * 1000 + 0.5)); }
            clip.insert("status", "generated");
            clips[i] = clip;
        } else if (outcome == "failed") {
            clip.insert("status", "failed");
            clips[i] = clip;
        } else { return raw; }
        raw.insert("clips", clips);
        return raw;
    }
    return raw;
}

double snapAssetDropMs(const QJsonArray& clips, const QString& trackId, double atMs, double snapMs) {
    std::optional<double> nearestEnd;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (clip.value("trackId").toString() != trackId) { continue; }
        const double start = clip.value("startMs").toDouble();
        const double duration = clip.value("durationMs").toDouble();
        const double end = start + duration;
        if (atMs > start && atMs < end) { return atMs >= start + duration / 2 ? end : atMs; }
        if (end <= atMs && atMs - end <= snapMs && (!nearestEnd || end > *nearestEnd)) { nearestEnd = end; }
    }
    return nearestEnd.value_or(atMs);
}

namespace {
QJsonObject makeTrack(const QString& type, const QString& name, int index) {
    return {{"id", nt::edit::newId()}, {"name", name}, {"type", type}, {"index", index},
        {"visible", true}, {"locked", false}};
}
}

QJsonObject dropAsset(QJsonObject raw, const QJsonObject& payload) {
    const auto asset = payload.value("asset").toObject();
    const auto mediaType = assetMediaType(asset);
    if (mediaType.isEmpty() || asset.value("id").toString().isEmpty()) { return raw; }
    auto tracks = raw.value("tracks").toArray();
    auto clips = raw.value("clips").toArray();
    auto trackId = payload.value("trackId").toString();
    const bool newTrack = trackId.isEmpty();
    QJsonObject target;
    if (newTrack) {
        // TimelineStore.addTrack appends through insertTrackAt, which
        // renumbers the existing rows before the new track is placed.
        for (qsizetype i = 0; i < tracks.size(); ++i) {
            auto track = tracks[i].toObject();
            track.insert("index", static_cast<int>(i));
            tracks[i] = track;
        }
        const QString type = mediaType == "audio" ? "audio" : "video";
        target = makeTrack(type, type + ' ' + QString::number(tracks.size() + 1), tracks.size());
        trackId = target.value("id").toString();
        tracks.append(target);
    } else {
        for (const auto& value : tracks) {
            if (value.toObject().value("id").toString() == trackId) { target = value.toObject(); break; }
        }
    }
    if (target.isEmpty() || target.value("locked").toBool() ||
        !nt::edit::clipFitsTrack(mediaType, target.value("type").toString())) { return raw; }
    const auto mode = payload.value("mode").toString("overlap");
    if (mode != "overlap" && mode != "overwrite" && mode != "insert") { return raw; }
    double start = std::max(0.0, std::floor(payload.value("startMs").toDouble() + 0.5));
    if (!newTrack && mode != "overlap") {
        start = snapAssetDropMs(clips, trackId, start, payload.value("snapMs").toDouble());
    }
    auto video = assetToClip(asset, trackId, start);
    if (!video) { return raw; }
    if (mediaType == "video" && target.value("type").toString() == "video") {
        const auto linkId = nt::edit::newId();
        video->insert("linkId", linkId);
        const auto duration = video->value("durationMs").toDouble();
        QSet<QString> occupiedTracks;
        for (const auto& value : clips) {
            const auto clip = value.toObject();
            const double clipStart = clip.value("startMs").toDouble();
            if (clipStart < start + duration && clipStart + clip.value("durationMs").toDouble() > start) {
                occupiedTracks.insert(clip.value("trackId").toString());
            }
        }
        QString audioTrack;
        for (const auto& value : tracks) {
            const auto track = value.toObject();
            if (track.value("type").toString() != "audio") { continue; }
            const auto id = track.value("id").toString();
            if (!occupiedTracks.contains(id)) { audioTrack = id; break; }
        }
        if (audioTrack.isEmpty()) {
            const auto track = makeTrack("audio", "Audio", tracks.size());
            audioTrack = track.value("id").toString();
            tracks.append(track);
        }
        clips.append(*video);
        clips.append(QJsonObject{{"id", nt::edit::newId()}, {"trackId", audioTrack},
            {"name", asset.value("name").toString() + " (audio)"}, {"startMs", start},
            {"durationMs", duration}, {"mediaType", "audio"}, {"sourceType", "imported"},
            {"status", "generating"}, {"locked", false}, {"versions", QJsonArray{}}, {"linkId", linkId}});
    } else {
        clips.append(*video);
    }
    nt::edit::EditDoc doc;
    for (const auto& clip : clips) { doc.clips.push_back(clip.toObject()); }
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        doc.tracks.push_back({track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    for (const auto& value : raw.value("mediaTracks").toArray()) {
        doc.clipsWithMediaTracks.insert(value.toObject().value("clipId").toString());
    }
    QJsonArray resolved;
    try {
        for (const auto& clip : nt::edit::resolveDropAction(doc, {video->value("id").toString()}, mode)) {
            resolved.append(clip);
        }
    } catch (const nt::edit::OpError&) { return raw; }
    raw.insert("tracks", tracks);
    raw.insert("clips", resolved);
    return raw;
}
}
