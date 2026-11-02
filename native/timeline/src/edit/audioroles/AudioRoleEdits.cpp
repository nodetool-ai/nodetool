#include "AudioRoleJson.h"

#include "app/EditRegistry.h"
#include "audio/automation/Automation.h"

#include <QPair>
#include <QSet>
#include <QUuid>

#include <algorithm>
#include <cmath>
#include <optional>

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
        list.append(QJsonObject{{"trackId", e.trackId}, {"fromMs", e.fromMs}, {"toMs", e.toMs}, {"points", e.points},
                                {"baseDb", e.baseDb}});
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

constexpr double kSamePointMs = 0.5;   // the web editor's SAME_POINT_MS
constexpr int kMaxLanePoints = 10000;  // MAX_AUTOMATION_POINTS_PER_LANE in the protocol schema
constexpr int kMaxLanes = 256;         // MAX_AUTOMATION_LANES_PER_TRACK
constexpr double kEdgeMs = 1.0;

bool isVolumeLane(const QJsonObject& lane) {
    const auto target = lane.value("target").toObject();
    return target.value("kind").toString() == u"mixer" && target.value("param").toString() == u"volumeDb";
}

// The lane's points with those in [fromMs, toMs) replaced by the entry's, which RoleAnalysis keeps inside
// [fromMs, toMs - 1 ms]. A lane is a line between its points and holds its first and last value beyond them, so a
// dip that touches the start or the end of the range needs a flat point just outside it, or it would reach the
// clips before and after. Such a point is only added where no other point is, because there the neighbour's own
// point already says what the level is. A range with nothing to duck must still not let a dip next to it run
// through it, so then it gets flat points at its ends. Empty optional: the result would be more points than the
// web editor's schema accepts.
std::optional<QJsonArray> replaceRange(const QJsonArray& old, const QJsonObject& entry) {
    const double from = entry.value("fromMs").toDouble();
    const double to = entry.value("toMs").toDouble();
    const double base = entry.value("baseDb").toDouble();
    const auto differs = [base](double value) { return std::abs(value - base) > 1e-9; };
    QList<QPair<double, QJsonObject>> kept;
    for (const auto& v : old) {
        const auto p = v.toObject();
        const double t = p.value("timeMs").toDouble();
        if (t >= from && t < to) continue;
        kept.append({t, p});
    }
    std::stable_sort(kept.begin(), kept.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    QList<QPair<double, double>> add;
    for (const auto& v : entry.value("points").toArray()) {
        const auto p = v.toObject();
        const double t = p.value("timeMs").toDouble();
        if (std::isfinite(t) && std::isfinite(p.value("value").toDouble()) && t >= 0) add.append({t, p.value("value").toDouble()});
    }
    QList<QPair<double, double>> soft;  // added only into a free slot
    if (add.isEmpty()) {
        double before = base, after = base;
        for (const auto& k : kept) {
            if (k.first < from) before = k.second.value("value").toDouble();
            else { after = k.second.value("value").toDouble(); break; }
        }
        if (!kept.isEmpty() && (differs(before) || differs(after))) {
            add.append({from, base});
            if (to - kSamePointMs > from) add.append({std::max(from, to - kEdgeMs), base});
        }
    } else {
        // Beside a neighbour's point the lane already holds the level, so an anchor goes in only where the line to the
        // next point would otherwise cross the clips next to this one, and it holds what that neighbour's level is.
        const QJsonObject* before = nullptr;
        const QJsonObject* after = nullptr;
        for (const auto& k : kept) {
            if (k.first < from) before = &k.second;
            else { after = &k.second; break; }
        }
        const auto valueOf = [](const QJsonObject* p) { return p->value("value").toDouble(); };
        if (differs(add.first().second) && from >= kEdgeMs && (!before || std::abs(valueOf(before) - add.first().second) > 1e-9)) {
            soft.append({from - kEdgeMs, before ? valueOf(before) : base});
        }
        if (differs(add.last().second) && (!after || std::abs(valueOf(after) - add.last().second) > 1e-9)) {
            soft.append({to, after ? valueOf(after) : base});
        }
    }
    const auto near = [&kept](double t) {
        return std::any_of(kept.begin(), kept.end(), [t](const auto& k) { return std::abs(k.first - t) < kSamePointMs; });
    };
    for (const auto& added : add) {
        const double t = added.first;
        kept.removeIf([t](const auto& k) { return std::abs(k.first - t) < kSamePointMs; });
        kept.append({t, QJsonObject{{"timeMs", t}, {"value", added.second}}});
    }
    for (const auto& added : soft) {
        if (!near(added.first)) kept.append({added.first, QJsonObject{{"timeMs", added.first}, {"value", added.second}}});
    }
    if (kept.size() > kMaxLanePoints) return std::nullopt;
    std::stable_sort(kept.begin(), kept.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    QJsonArray out;
    for (const auto& k : kept) out.append(k.second);
    return out;
}

// {entries: [{trackId, fromMs, toMs, points}]}. A lane that is switched off is left alone: its points would not be heard.
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
            if (lane >= 0 && !lanes[lane].toObject().value("enabled").toBool(true)) break;
            if (lane < 0 && lanes.size() >= kMaxLanes) break;
            auto laneObject = lane >= 0 ? lanes[lane].toObject()
                : QJsonObject{{"id", QUuid::createUuid().toString(QUuid::Id128)},
                              {"target", QJsonObject{{"kind", "mixer"}, {"param", "volumeDb"}}},
                              {"points", QJsonArray{}}};
            const auto points = replaceRange(laneObject.value("points").toArray(), entry);
            if (!points || *points == laneObject.value("points").toArray()) break;
            if (points->isEmpty()) {
                if (lane >= 0) lanes.removeAt(lane);
            } else {
                laneObject.insert("points", *points);
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
