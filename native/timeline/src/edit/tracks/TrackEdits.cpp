#include "edit/tracks/TrackEdits.h"
#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSet>
#include <QUuid>
#include <QVector>
#include <algorithm>
#include <cmath>

namespace nt::tracks {
namespace {
QString freshId() {
    return QUuid::createUuid().toString(QUuid::Id128);
}
QJsonObject withDefaults(QJsonObject defaults, const QJsonObject& source) {
    for (auto it = source.begin(); it != source.end(); ++it) {
        defaults.insert(it.key(), it.value());
    }
    return defaults;
}
QJsonObject makeTrack(const QJsonObject& source) {
    return withDefaults({{"id", freshId()}, {"name", ""}, {"type", "video"}, {"index", 0},
                         {"visible", true}, {"locked", false}}, source);
}
QJsonArray renumber(const QJsonArray& tracks) {
    QJsonArray result;
    for (const auto& value : tracks) {
        auto track = value.toObject();
        track.insert("index", result.size());
        result.append(track);
    }
    return result;
}
QJsonArray insertAt(QJsonArray tracks, const QJsonObject& track, double index) {
    const auto at = static_cast<qsizetype>(std::clamp(std::trunc(index), 0.0, static_cast<double>(tracks.size())));
    tracks.insert(at, track);
    return renumber(tracks);
}
QJsonObject defaultInstrument() {
    // The fully expanded wt1-prime-lead preset from midi/presets.ts.
    return QJsonDocument::fromJson(R"({"type":"wavetable",
        "oscA":{"table":"prime","position":0.55,"semitones":0,"fine":0,"level":0.8,"unison":3,"detune":0.18},
        "oscB":{"table":"pulse","position":0.4,"semitones":-12,"fine":0,"level":0.5,"unison":1,"detune":0.2},
        "subLevel":0,"subOctave":-1,"noiseLevel":0,"filterType":"lp24","cutoffHz":3200,"resonance":0.4,
        "drive":0.15,"filterEnvAmount":1.2,"keyTrack":0.3,
        "ampEnv":{"attackMs":4,"decayMs":180,"sustain":0.75,"releaseMs":220},
        "modEnv":{"attackMs":2,"decayMs":320,"sustain":0,"releaseMs":200},"gainDb":-8})").object();
}
QJsonArray cloneClips(const QJsonArray& clips, const QString& trackId) {
    QHash<QString, QString> ids;
    QHash<QString, int> linkCounts;
    QJsonArray copies;
    for (const auto& value : clips) {
        auto clip = withDefaults({{"trackId", ""}, {"name", ""}, {"startMs", 0}, {"durationMs", 0},
            {"mediaType", "video"}, {"sourceType", "generated"}, {"status", "draft"},
            {"locked", false}, {"versions", QJsonArray{}}}, value.toObject());
        const auto id = freshId();
        ids.insert(clip.value("id").toString(), id);
        clip.insert("id", id);
        clip.insert("trackId", trackId);
        if (clip.contains("linkId")) {
            ++linkCounts[clip.value("linkId").toString()];
        }
        copies.append(clip);
    }
    QHash<QString, QString> links;
    QJsonArray result;
    for (const auto& value : copies) {
        auto clip = value.toObject();
        if (clip.contains("parentId")) {
            const auto parent = ids.constFind(clip.value("parentId").toString());
            if (parent == ids.cend()) {
                clip.remove("parentId");
            } else {
                clip.insert("parentId", *parent);
            }
        }
        const auto link = clip.value("linkId").toString();
        if (clip.contains("linkId") && linkCounts.value(link) >= 2) {
            if (!links.contains(link)) {
                links.insert(link, freshId());
            }
            clip.insert("linkId", links.value(link));
        } else {
            clip.remove("linkId");
        }
        result.append(clip);
    }
    return result;
}
// Propagate locked edit units backwards: links are bidirectional, while a
// group's descendants block the group but a locked parent does not block a child.
QSet<QString> blockedTargets(const QJsonArray& clips, const QJsonArray& tracks) {
    QSet<QString> lockedTracks;
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        if (track.value("locked").toBool()) {
            lockedTracks.insert(track.value("id").toString());
        }
    }
    QHash<QString, QJsonObject> byId;
    QHash<QString, QVector<QString>> byLink;
    QSet<QString> blocked;
    QVector<QString> pending;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        const auto id = clip.value("id").toString();
        byId.insert(id, clip);
        if (clip.contains("linkId")) {
            byLink[clip.value("linkId").toString()].append(id);
        }
        if (clip.value("locked").toBool() || lockedTracks.contains(clip.value("trackId").toString())) {
            blocked.insert(id);
            pending.append(id);
        }
    }
    QSet<QString> visitedLinks;
    const auto enqueue = [&](const QString& id) {
        if (!blocked.contains(id)) {
            blocked.insert(id);
            pending.append(id);
        }
    };
    while (!pending.empty()) {
        const auto clip = byId.value(pending.takeLast());
        if (clip.contains("linkId")) {
            const auto link = clip.value("linkId").toString();
            if (!visitedLinks.contains(link)) {
                visitedLinks.insert(link);
                for (const auto& id : byLink.value(link)) {
                    enqueue(id);
                }
            }
        }
        const auto parentId = clip.value("parentId").toString();
        if (clip.contains("parentId") && byId.value(parentId).value("mediaType") == "group") {
            enqueue(parentId);
        }
    }
    return blocked;
}
}

QJsonObject addTrack(QJsonObject doc, const QJsonObject& payload) {
    auto args = payload;
    args.insert("atIndex", doc.value("tracks").toArray().size());
    return insertTrack(std::move(doc), args);
}
QJsonObject insertTrack(QJsonObject doc, const QJsonObject& payload) {
    const auto tracks = doc.value("tracks").toArray();
    const auto type = payload.value("type").toString();
    const auto name = payload.value("name");
    auto track = makeTrack({{"type", type}, {"name", name.isUndefined() || name.isNull()
        ? QJsonValue(type + " " + QString::number(tracks.size() + 1)) : name}});
    if (type == "midi") {
        track.insert("instrument", defaultInstrument());
        if (!doc.contains("tempo")) {
            doc.insert("tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0},
                {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}});
        }
    }
    doc.insert("tracks", insertAt(tracks, track, payload.value("atIndex").toDouble()));
    return doc;
}
QJsonObject duplicateTrack(QJsonObject doc, const QJsonObject& payload) {
    const auto tracks = doc.value("tracks").toArray();
    const auto trackId = payload.value("trackId").toString();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        if (tracks[i].toObject().value("id") != trackId) {
            continue;
        }
        auto copy = makeTrack(tracks[i].toObject());
        copy.insert("id", freshId());
        copy.insert("name", copy.value("name").toString() + " copy");
        if (copy.value("effects").isArray()) {
            QJsonArray effects;
            for (const auto& value : copy.value("effects").toArray()) {
                auto effect = value.toObject();
                effect.insert("id", freshId());
                effects.append(effect);
            }
            copy.insert("effects", effects);
        }
        auto clips = doc.value("clips").toArray();
        QJsonArray source;
        for (const auto& value : clips) {
            if (value.toObject().value("trackId") == trackId) {
                source.append(value);
            }
        }
        for (const auto& value : cloneClips(source, copy.value("id").toString())) {
            clips.append(value);
        }
        doc.insert("tracks", insertAt(tracks, copy, static_cast<double>(i + 1)));
        doc.insert("clips", clips);
        return doc;
    }
    return doc;
}
QJsonObject removeTrack(QJsonObject doc, const QJsonObject& payload) {
    const auto trackId = payload.value("trackId").toString();
    const auto tracks = doc.value("tracks").toArray();
    QJsonArray remainingTracks;
    bool found = false;
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        if (track.value("id") == trackId) {
            if (track.value("locked").toBool()) {
                return doc;
            }
            found = true;
        } else {
            remainingTracks.append(track);
        }
    }
    if (!found) {
        return doc;
    }
    const auto clips = doc.value("clips").toArray();
    const auto blocked = blockedTargets(clips, tracks);
    QSet<QString> removed;
    QSet<QString> groups;
    QSet<QString> affectedLinks;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (clip.value("trackId") != trackId) {
            continue;
        }
        const auto id = clip.value("id").toString();
        if (blocked.contains(id)) {
            return doc;
        }
        removed.insert(id);
        if (clip.value("mediaType") == "group") {
            groups.insert(id);
        }
        if (clip.contains("linkId")) {
            affectedLinks.insert(clip.value("linkId").toString());
        }
    }
    QSet<QString> droppedMediaTracks;
    QJsonArray mediaTracks;
    for (const auto& value : doc.value("mediaTracks").toArray()) {
        const auto track = value.toObject();
        if (removed.contains(track.value("clipId").toString())) {
            droppedMediaTracks.insert(track.value("id").toString());
        } else {
            mediaTracks.append(track);
        }
    }
    QHash<QString, int> linkCounts;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        if (!removed.contains(clip.value("id").toString()) && clip.contains("linkId")) {
            ++linkCounts[clip.value("linkId").toString()];
        }
    }
    QJsonArray survivors;
    for (const auto& value : clips) {
        auto clip = value.toObject();
        if (removed.contains(clip.value("id").toString())) {
            continue;
        }
        if (groups.contains(clip.value("parentId").toString())) {
            clip.remove("parentId");
        }
        const auto link = clip.value("linkId").toString();
        if (affectedLinks.contains(link) && linkCounts.value(link) == 1) {
            clip.remove("linkId");
        }
        if (droppedMediaTracks.contains(clip.value("trackBinding").toObject().value("trackId").toString())) {
            clip.remove("trackBinding");
        }
        survivors.append(clip);
    }
    doc.insert("tracks", renumber(remainingTracks));
    doc.insert("clips", survivors);
    doc.insert("mediaTracks", mediaTracks);
    return doc;
}
QJsonObject reorderTracks(QJsonObject doc, const QJsonObject& payload) {
    const auto tracks = doc.value("tracks").toArray();
    QHash<QString, QJsonObject> byId;
    for (const auto& value : tracks) {
        const auto track = value.toObject();
        byId.insert(track.value("id").toString(), track);
    }
    QSet<QString> ordered;
    QJsonArray result;
    const auto ids = payload.value("orderedIds").toArray();
    for (qsizetype i = 0; i < ids.size(); ++i) {
        const auto id = ids[i].toString();
        ordered.insert(id);
        if (byId.contains(id)) {
            auto track = byId.value(id);
            track.insert("index", i);
            result.append(track);
        }
    }
    for (const auto& value : tracks) {
        auto track = value.toObject();
        if (!ordered.contains(track.value("id").toString())) {
            track.insert("index", result.size());
            result.append(track);
        }
    }
    doc.insert("tracks", result);
    return doc;
}
QJsonObject patchTrack(QJsonObject doc, const QJsonObject& payload, const QString& field) {
    auto tracks = doc.value("tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value("id") == payload.value("trackId")) {
            if (track.value(field) == payload.value(field)) {
                return doc;
            }
            track.insert(field, payload.value(field));
            tracks.replace(i, track);
        }
    }
    doc.insert("tracks", tracks);
    return doc;
}
}
