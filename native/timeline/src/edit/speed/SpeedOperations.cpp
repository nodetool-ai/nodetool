#include "SpeedOperations.h"
#include "edit/EditActions.h"
#include <QHash>
#include <QJsonArray>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::speed {
namespace {
using namespace nt::edit;
EditDoc editDoc(const QJsonObject& raw) {
    EditDoc doc;
    for (const auto& c : raw.value("clips").toArray()) {
        doc.clips.push_back(c.toObject());
    }
    for (const auto& t : raw.value("tracks").toArray()) {
        const auto track = t.toObject();
        doc.tracks.push_back(
            {track.value("id").toString(), track.value("type").toString(), track.value("locked").toBool()});
    }
    return doc;
}
struct HelperDoc {
    EditDoc document;
    QString emptyLink;
};
HelperDoc forHelpers(const EditDoc& doc) {
    HelperDoc result{doc, {}};
    const bool hasEmptyLink = std::any_of(doc.clips.begin(), doc.clips.end(), [](const auto& c) {
        return c.value("linkId").isString() && c.value("linkId").toString().isEmpty();
    });
    if (!hasEmptyLink) {
        return result;
    }
    // ClipOps uses an empty QString for "no link". Give a defined empty link
    // a distinct internal name, then restore it before writing the document.
    IdSet usedLinks;
    for (const auto& c : doc.clips) {
        usedLinks.insert(clipLinkId(c));
    }
    result.emptyLink = "__nt_speed_empty_link__";
    while (usedLinks.count(result.emptyLink)) {
        result.emptyLink += '_';
    }
    for (auto& c : result.document.clips) {
        if (c.value("linkId").isString() && c.value("linkId").toString().isEmpty()) {
            c.insert("linkId", result.emptyLink);
        }
    }
    return result;
}
QJsonObject withClips(QJsonObject raw, const ClipList& clips) {
    QJsonArray result;
    for (const auto& c : clips) {
        result.append(c);
    }
    raw.insert("clips", result);
    return raw;
}
bool remapped(const QJsonObject& clip) {
    return !clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty();
}
double numberOr(const QJsonObject& object, const QString& key, double fallback) {
    return object.value(key).isDouble() ? object.value(key).toDouble() : fallback;
}
ClipList retime(const ClipList& base, const ClipList& members, const IdSet& ids, double speed) {
    struct Planned {
        QJsonObject clip;
        double rate;
        double target;
    };
    std::vector<Planned> planned;
    double overflow = 0;
    // One index of track starts avoids rescanning a long timeline for each selected clip.
    QHash<QString, std::vector<double>> starts;
    for (const auto& c : base) {
        if (!ids.count(clipId(c))) {
            starts[clipTrackId(c)].push_back(clipStartMs(c));
        }
    }
    for (auto it = starts.begin(); it != starts.end(); ++it) {
        std::sort(it->begin(), it->end());
    }
    for (const auto& m : members) {
        auto probe = m;
        probe.insert("speedMultiplier", speed);
        const double rate = sourceRate(probe);
        const double target = clipDurationMs(m) * sourceRate(m) / rate;
        double nextStart = std::numeric_limits<double>::infinity();
        const auto track = starts.constFind(clipTrackId(m));
        if (track != starts.cend()) {
            const auto next = std::upper_bound(track->begin(), track->end(), clipStartMs(m));
            if (next != track->end()) {
                nextStart = *next;
            }
        }
        const double allowed = std::max(clipDurationMs(m), nextStart - clipStartMs(m));
        overflow = std::max(overflow, target - allowed);
        planned.push_back({m, rate, target});
    }
    QHash<QString, QJsonObject> next;
    for (const auto& p : planned) {
        auto clip = p.clip;
        const double duration = std::max(1.0, p.target - overflow);
        clip.insert("speedMultiplier", speed);
        clip.insert("durationMs", duration);
        if (overflow > 0 && clip.contains("outPointMs")) {
            clip.insert("outPointMs", numberOr(clip, "inPointMs", 0) + duration * p.rate);
        }
        if (clip.value("caption").isObject()) {
            clip.insert("caption", retimeCaption(clip.value("caption").toObject(), 0, sourceRate(p.clip) / p.rate));
        }
        next.insert(clipId(clip), clip);
    }
    auto result = base;
    for (auto& c : result) {
        const auto found = next.constFind(clipId(c));
        if (found != next.cend()) {
            c = *found;
        }
    }
    return result;
}
IdSet idSet(const QJsonArray& array) {
    IdSet ids;
    for (const auto& id : array) {
        ids.insert(id.toString());
    }
    return ids;
}
} // namespace
QJsonObject retimeClipSpeed(QJsonObject raw, const QJsonObject& payload) {
    const double speed = payload.value("speedMultiplier").toDouble();
    if (!std::isfinite(speed) || speed <= 0) {
        return raw;
    }
    const auto doc = editDoc(raw);
    const auto ids = idSet(payload.value("clipIds").toArray());
    ClipList members;
    for (const auto& c : doc.clips) {
        if (!ids.count(clipId(c))) {
            continue;
        }
        if (isGroupClip(c) || remapped(c)) {
            return raw;
        }
        members.push_back(c);
    }
    return withClips(raw, retime(doc.clips, members, ids, speed));
}
QJsonObject setClipSpeed(QJsonObject raw, const QJsonObject& payload) {
    const double speed = payload.value("speedMultiplier").toDouble();
    if (!std::isfinite(speed) || speed <= 0) {
        return raw;
    }
    const auto doc = editDoc(raw);
    const auto helpers = forHelpers(doc);
    const auto id = payload.value("clipId").toString();
    const auto primary =
        std::find_if(doc.clips.begin(), doc.clips.end(), [&](const auto& c) { return clipId(c) == id; });
    const bool linked = payload.value("linked").toBool(raw.value("linkedSelection").toBool(true));
    if (primary == doc.clips.end() || isGroupClip(*primary) ||
        !editableUserTargets(helpers.document, {id}, linked, false).count(id)) {
        return raw;
    }
    ClipList members;
    IdSet ids;
    for (const auto& c : doc.clips) {
        if (clipId(c) == id || (linked && primary->contains("linkId") && c.contains("linkId") &&
                                c.value("linkId") == primary->value("linkId"))) {
            if (remapped(c)) {
                return raw;
            }
            members.push_back(c);
            ids.insert(clipId(c));
        }
    }
    auto base = doc.clips;
    if (payload.value("ripple").toBool()) {
        double growth = -std::numeric_limits<double>::infinity();
        double from = -std::numeric_limits<double>::infinity();
        IdSet editedTracks;
        for (const auto& m : members) {
            auto probe = m;
            probe.insert("speedMultiplier", speed);
            growth = std::max(growth, clipDurationMs(m) * sourceRate(m) / sourceRate(probe) - clipDurationMs(m));
            from = std::max(from, clipEndMs(m));
            editedTracks.insert(clipTrackId(m));
        }
        RippleOptions options;
        options.lockedTrackIds = lockedTrackIds(helpers.document);
        const auto off =
            idSet(payload.value("syncLockOffTrackIds").isArray() ? payload.value("syncLockOffTrackIds").toArray()
                                                                 : raw.value("syncLockOffTrackIds").toArray());
        for (const auto& track : off) {
            if (!editedTracks.count(track)) {
                options.lockedTrackIds.insert(track);
            }
        }
        options.lockedClipIds = lockedUserTargetIds(helpers.document);
        const auto shifted = planShift(helpers.document.clips, from, growth, ids, options);
        if (!shifted) {
            return raw;
        }
        base = *shifted;
        if (!helpers.emptyLink.isEmpty()) {
            for (auto& c : base) {
                if (clipLinkId(c) == helpers.emptyLink) {
                    c.insert("linkId", "");
                }
            }
        }
    }
    return withClips(raw, retime(base, members, ids, speed));
}
QJsonObject setClipsSpeed(QJsonObject raw, const QJsonObject& payload) {
    const auto ids = idSet(payload.value("clipIds").toArray());
    auto ordered = editDoc(raw).clips;
    std::erase_if(ordered, [&](const auto& c) { return !ids.count(clipId(c)); });
    std::stable_sort(ordered.begin(), ordered.end(),
                     [](const auto& a, const auto& b) { return clipStartMs(a) > clipStartMs(b); });
    for (const auto& c : ordered) {
        auto single = payload;
        single.insert("clipId", clipId(c));
        raw = setClipSpeed(raw, single);
    }
    return raw;
}
QJsonObject setClipTimeRemap(QJsonObject raw, const QJsonObject& payload) {
    const auto doc = editDoc(raw);
    const auto id = payload.value("clipId").toString();
    auto clips = doc.clips;
    const auto found = std::find_if(clips.begin(), clips.end(), [&](const auto& c) { return clipId(c) == id; });
    if (found == clips.end() || !editableUserTargets(doc, {id}, false, false).count(id)) {
        return raw;
    }
    auto& clip = *found;
    const auto operation = payload.value("operation").toString();
    if (operation == "clear" || operation == "disable") {
        clip.remove("timeRemap");
    } else if (operation == "enable") {
        if (!clip.value("timeRemap").isObject()) {
            const double in = numberOr(clip, "inPointMs", 0);
            clip.insert(
                "timeRemap",
                QJsonObject{{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", in}},
                                                     QJsonObject{{"t", 1},
                                                                 {"sourceMs", numberOr(clip, "outPointMs",
                                                                                       in + clipDurationMs(clip) *
                                                                                                sourceRate(clip))}}}}});
        }
    } else {
        auto frames = clip.value("timeRemap").toObject().value("keyframes").toArray();
        const int index = payload.value("index").toInt(-1);
        if (operation == "add") {
            const auto last = frames.isEmpty() ? QJsonObject{} : frames.last().toObject();
            const auto taken = [&](double t) {
                return std::any_of(frames.begin(), frames.end(),
                                   [&](const auto& f) { return f.toObject().value("t").toDouble() == t; });
            };
            const double candidate = std::min(1.0, last.value("t").toDouble() + 0.1);
            const double previous = frames.size() < 2 ? 0 : frames[frames.size() - 2].toObject().value("t").toDouble();
            const double t = taken(candidate) ? (previous + numberOr(last, "t", 1)) / 2 : candidate;
            if (taken(t)) {
                return raw;
            }
            frames.append(QJsonObject{{"t", t}, {"sourceMs", last.value("sourceMs").toDouble()}});
        } else if (operation == "remove") {
            if (index < 0 || index >= frames.size()) {
                return raw;
            }
            frames.removeAt(index);
        } else if (operation == "patch") {
            if (index < 0 || index >= frames.size()) {
                return raw;
            }
            auto frame = frames[index].toObject();
            const auto patch = payload.value("patch").toObject();
            for (const auto& key : {QString("t"), QString("sourceMs")}) {
                if (!patch.contains(key)) {
                    continue;
                }
                const auto value = patch.value(key);
                bool ok = value.isDouble();
                const double number = ok ? value.toDouble() : value.toString().trimmed().toDouble(&ok);
                if (!ok || !std::isfinite(number)) {
                    return raw;
                }
                const double clamped = key == "t" ? std::clamp(number, 0.0, 1.0) : std::max(0.0, number);
                if (key == "t") {
                    for (qsizetype i = 0; i < frames.size(); ++i) {
                        if (i != index && frames[i].toObject().value("t").toDouble() == clamped) {
                            return raw;
                        }
                    }
                }
                frame.insert(key, clamped);
            }
            if (patch.contains("easing")) {
                const auto easing = patch.value("easing").toString().trimmed();
                if (easing.isEmpty()) {
                    frame.remove("easing");
                } else {
                    frame.insert("easing", easing);
                }
            }
            frames[index] = frame;
        } else {
            return raw;
        }
        ClipList ordered;
        for (const auto& f : frames) {
            ordered.push_back(f.toObject());
        }
        std::stable_sort(ordered.begin(), ordered.end(), [](const auto& a, const auto& b) {
            return a.value("t").toDouble() < b.value("t").toDouble();
        });
        QJsonArray sorted;
        for (const auto& f : ordered) {
            sorted.append(f);
        }
        clip.insert("timeRemap", QJsonObject{{"keyframes", sorted}});
    }
    return withClips(raw, clips);
}
} // namespace nt::speed
