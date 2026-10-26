#include "app/EditRegistry.h"
#include "edit/clipboard/RawDocument.h"
#include <QHash>
#include <algorithm>
#include <cmath>
#include <limits>

namespace {
using namespace nt::edit;
QJsonObject patchClip(QJsonObject raw, const QJsonObject& payload) {
    auto clips = raw.value("clips").toArray();
    for (qsizetype i = 0; i < clips.size(); ++i) {
        auto clip = clips[i].toObject();
        if (clipId(clip) != payload.value("clipId").toString()) { continue; }
        const auto patch = payload.value("patch").toObject();
        for (auto it = patch.begin(); it != patch.end(); ++it) {
            // JSON null represents the web's `undefined` for optional fields.
            if (it.value().isNull()) { clip.remove(it.key()); }
            else { clip.insert(it.key(), it.value()); }
        }
        clips[i] = clip;
        break;
    }
    raw.insert("clips", clips);
    return raw;
}
QJsonObject setClipSpeed(QJsonObject raw, const QJsonObject& payload) {
    auto doc = structure::editDocument(raw);
    const auto id = payload.value("clipId").toString();
    const double speed = payload.value("speedMultiplier").toDouble(payload.value("speed").toDouble());
    const auto primary = std::ranges::find_if(doc.clips, [&](const auto& c) { return clipId(c) == id; });
    const bool linked = payload.value("linked").toBool(true);
    if (primary == doc.clips.end() || isGroupClip(*primary) || !std::isfinite(speed) || speed <= 0) { return raw; }
    // Speed follows one link unit and never descends into groups. Validate
    // each member once rather than expanding that same link for each member.
    const auto lockedTracks = lockedTrackIds(doc);
    ClipList members;
    IdSet memberIds;
    for (const auto& c : doc.clips) {
        if (clipId(c) == id || (linked && !clipLinkId(*primary).isEmpty() && clipLinkId(c) == clipLinkId(*primary))) {
            if (c.value("locked").toBool() || lockedTracks.contains(clipTrackId(c)) ||
                !c.value("timeRemap").toObject().value("keyframes").toArray().isEmpty()) { return raw; }
            members.push_back(c);
            memberIds.insert(clipId(c));
        }
    }
    QHash<QString, std::vector<double>> starts;
    for (const auto& c : doc.clips) {
        if (!memberIds.contains(clipId(c))) { starts[clipTrackId(c)].push_back(clipStartMs(c)); }
    }
    for (auto& values : starts) { std::ranges::sort(values); }
    double overflow = 0;
    for (const auto& c : members) {
        const auto& values = starts[clipTrackId(c)];
        const auto next = std::upper_bound(values.begin(), values.end(), clipStartMs(c));
        const double nextStart = next == values.end() ? std::numeric_limits<double>::infinity() : *next;
        auto probe = c; probe.insert("speedMultiplier", speed);
        const double target = clipDurationMs(c) * sourceRate(c) / sourceRate(probe);
        overflow = std::max(overflow, target - std::max(clipDurationMs(c), nextStart - clipStartMs(c)));
    }
    for (auto& c : doc.clips) {
        if (!memberIds.contains(clipId(c))) { continue; }
        const double oldRate = sourceRate(c);
        c.insert("speedMultiplier", speed);
        const double newRate = sourceRate(c);
        const double duration = std::max(1.0, clipDurationMs(c) * oldRate / newRate - overflow);
        c.insert("durationMs", duration);
        if (overflow > 0 && c.contains("outPointMs")) { c.insert("outPointMs", c.value("inPointMs").toDouble() + duration * newRate); }
        if (c.contains("caption")) { c.insert("caption", retimeCaption(c.value("caption").toObject(), 0, oldRate / newRate)); }
    }
    return structure::withClips(std::move(raw), doc.clips);
}
const bool registered = [] {
    nt::app::registerEdit("patchClip", patchClip);
    nt::app::registerEdit("setClipSpeed", setClipSpeed);
    return true;
}();
}
