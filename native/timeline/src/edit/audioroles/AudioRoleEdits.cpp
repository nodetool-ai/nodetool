#include "AudioRoleJson.h"

#include "app/EditRegistry.h"
#include "audio/automation/Automation.h"

#include <QPair>
#include <QSet>
#include <QUuid>

#include <algorithm>
#include <cmath>

namespace nt::audioroles {

QString roleLabel(const QString& role) {
    if (role == u"dialogue") return QStringLiteral("Dialogue");
    if (role == u"music") return QStringLiteral("Music");
    if (role == u"sfx") return QStringLiteral("SFX");
    if (role == u"ambience") return QStringLiteral("Ambience");
    return {};
}
bool isRole(const QString& role) { return roles().contains(role); }
QString effectiveRole(const QJsonObject& clip) {
    const auto role = clip.value("audioRole").toString();
    if (isRole(role)) return role;
    const auto kind = clip.value("bindingKind").toString();
    if (kind == u"text-to-audio") return QStringLiteral("dialogue");
    if (kind == u"text-to-music") return QStringLiteral("music");
    return {};
}
double defaultTargetLufs(const QString& role) {
    if (role == u"music") return -25;
    if (role == u"sfx") return -21;
    if (role == u"ambience") return -30;
    return -23;
}
bool soundingType(const QString& mediaType) { return mediaType == u"audio" || mediaType == u"video"; }

QJsonObject duckPayload(const QList<DuckEntry>& entries) {
    QJsonArray list;
    for (const auto& e : entries) {
        list.append(QJsonObject{{"trackId", e.trackId}, {"fromMs", e.fromMs}, {"toMs", e.toMs}, {"baseDb", e.baseDb},
                                {"points", e.points}});
    }
    return {{"entries", list}};
}

namespace {

QSet<QString> lockedTrackIds(const QJsonObject& raw) {
    QSet<QString> locked;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        if (track.value("locked").toBool()) locked.insert(track.value("id").toString());
    }
    return locked;
}

QSet<QString> idSet(const QJsonValue& value) {
    QSet<QString> ids;
    for (const auto& id : value.toArray()) ids.insert(id.toString());
    return ids;
}

bool editable(const QJsonObject& clip, const QSet<QString>& lockedTracks) {
    return soundingType(clip.value("mediaType").toString()) && !clip.value("locked").toBool() &&
           !lockedTracks.contains(clip.value("trackId").toString());
}

// {selectedIds, role}. An empty role clears the field.
QJsonObject setClipsAudioRole(QJsonObject raw, const QJsonObject& payload) {
    const auto role = payload.value("role").toString();
    if (!role.isEmpty() && !isRole(role)) return raw;
    const auto selected = idSet(payload.value("selectedIds"));
    const auto locked = lockedTrackIds(raw);
    auto clips = raw.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (!selected.contains(clip.value("id").toString()) || !editable(clip, locked)) continue;
        if (role.isEmpty()) {
            if (!clip.contains("audioRole")) continue;
            clip.remove("audioRole");
        } else {
            if (clip.value("audioRole").toString() == role) continue;
            clip.insert("audioRole", role);
        }
        clips[i] = clip;
    }
    raw.insert("clips", clips);
    return raw;
}

// {volumes: {clipId: db}}: the clip gain of several clips in one edit.
QJsonObject setClipsVolumeDb(QJsonObject raw, const QJsonObject& payload) {
    const auto volumes = payload.value("volumes").toObject();
    const auto locked = lockedTrackIds(raw);
    auto clips = raw.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        const auto found = volumes.constFind(clip.value("id").toString());
        if (found == volumes.constEnd() || !found->isDouble() || !std::isfinite(found->toDouble()) ||
            !editable(clip, locked)) {
            continue;
        }
        const double next = std::clamp(found->toDouble(), -120.0, 24.0);
        if (clip.value("volumeDb").toDouble() == next && clip.contains("volumeDb")) continue;
        if (next == 0.0 && !clip.contains("volumeDb")) continue;
        clip.insert("volumeDb", next);
        clips[i] = clip;
    }
    raw.insert("clips", clips);
    return raw;
}

constexpr double kSamePointMs = 0.5;  // the web editor's SAME_POINT_MS
constexpr double kAnchorMs = 1.0;

bool isVolumeLane(const QJsonObject& lane) {
    const auto target = lane.value("target").toObject();
    return target.value("kind").toString() == u"mixer" && target.value("param").toString() == u"volumeDb";
}

// Replaces the points of the track's volume lane inside [fromMs, toMs] with the
// entry's. Dips never leak into the neighbours: a flat anchor at the base level
// is added one millisecond outside a dip that touches the edge of the range.
QJsonArray replaceRange(const QJsonArray& old, const QJsonObject& entry) {
    const double from = entry.value("fromMs").toDouble();
    const double to = entry.value("toMs").toDouble();
    const double base = entry.value("baseDb").toDouble();
    QList<QPair<double, QJsonObject>> kept;
    for (const auto& v : old) {
        const auto p = v.toObject();
        const double t = p.value("timeMs").toDouble();
        if (t >= from && t <= to) continue;
        kept.append({t, p});
    }
    QList<QPair<double, double>> add;
    for (const auto& v : entry.value("points").toArray()) {
        const auto p = v.toObject();
        add.append({p.value("timeMs").toDouble(), p.value("value").toDouble()});
    }
    if (!add.isEmpty()) {
        if (std::abs(add.first().second - base) > 1e-9) {
            add.prepend({std::max(0.0, add.first().first - kAnchorMs), base});
        }
        if (std::abs(add.last().second - base) > 1e-9) add.append({add.last().first + kAnchorMs, base});
    }
    for (const auto& added : add) {
        const double t = added.first;
        kept.removeIf([t](const auto& k) { return std::abs(k.first - t) < kSamePointMs; });
        kept.append({t, QJsonObject{{"timeMs", t}, {"value", added.second}}});
    }
    std::stable_sort(kept.begin(), kept.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    QJsonArray out;
    for (const auto& k : kept) out.append(k.second);
    return out;
}

// {entries: [{trackId, fromMs, toMs, baseDb, points}]}
QJsonObject applyDucking(QJsonObject raw, const QJsonObject& payload) {
    auto tracks = raw.value("tracks").toArray();
    bool changed = false;
    for (const auto& value : payload.value("entries").toArray()) {
        const auto entry = value.toObject();
        const auto id = entry.value("trackId").toString();
        for (qsizetype t = 0; t < tracks.size(); ++t) {
            auto track = tracks[t].toObject();
            const auto type = track.value("type").toString();
            if (track.value("id").toString() != id || track.value("locked").toBool() ||
                (type != u"audio" && type != u"midi")) {
                continue;
            }
            auto lanes = track.value("automation").toArray();
            qsizetype lane = -1;
            for (qsizetype i = 0; i < lanes.size(); ++i) {
                if (isVolumeLane(lanes[i].toObject())) { lane = i; break; }
            }
            auto laneObject = lane >= 0 ? lanes[lane].toObject()
                : QJsonObject{{"id", QUuid::createUuid().toString(QUuid::Id128)},
                              {"target", QJsonObject{{"kind", "mixer"}, {"param", "volumeDb"}}},
                              {"points", QJsonArray{}}};
            const auto points = replaceRange(laneObject.value("points").toArray(), entry);
            if (points == laneObject.value("points").toArray()) break;
            if (points.isEmpty()) {
                if (lane >= 0) lanes.removeAt(lane);
            } else {
                laneObject.insert("points", points);
                if (lane >= 0) lanes[lane] = laneObject; else lanes.append(laneObject);
            }
            if (lanes.isEmpty()) track.remove("automation"); else track.insert("automation", lanes);
            tracks[t] = track;
            changed = true;
            break;
        }
    }
    if (changed) raw.insert("tracks", tracks);
    return raw;
}

[[maybe_unused]] const bool registeredRole = nt::app::registerEdit("setClipsAudioRole", setClipsAudioRole);
[[maybe_unused]] const bool registeredVolumes = nt::app::registerEdit("setClipsVolumeDb", setClipsVolumeDb);
[[maybe_unused]] const bool registeredDucking = nt::app::registerEdit("applyDucking", applyDucking);

}  // namespace
}  // namespace nt::audioroles
