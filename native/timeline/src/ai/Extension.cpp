#include "ai/Extension.h"
#include "edit/ClipOps.h"
#include <algorithm>
#include <cmath>
#include <map>
#include <vector>

namespace nt::ai {
namespace {
ExtensionResult refuse(const char* code, const char* error) { return {{}, QString::fromLatin1(code), QString::fromLatin1(error)}; }
bool positive(double n) { return std::isfinite(n) && n > 0; }
bool validPlacement(const QJsonObject& clip) {
    const auto start = clip.value("startMs"), duration = clip.value("durationMs");
    return start.isDouble() && duration.isDouble() && std::isfinite(start.toDouble()) && start.toDouble() >= 0 &&
           positive(duration.toDouble()) && std::isfinite(start.toDouble() + duration.toDouble());
}
QString activeTake(const QJsonObject& clip) {
    for (const auto& value : clip.value("versions").toArray()) {
        const auto take = value.toObject();
        if (take.value("assetId") == clip.value("currentAssetId")) return take.value("id").toString();
    }
    return clip.value("activeTakeId").toString();
}
using Intervals = std::vector<std::pair<double, double>>;
bool overlaps(const Intervals& intervals, double start, double end) {
    if (start >= end) return false;
    const auto it = std::lower_bound(intervals.begin(), intervals.end(), start,
        [](const auto& interval, double value) { return interval.second <= value; });
    return it != intervals.end() && it->first < end;
}
}

ExtensionResult applyExtension(const QJsonArray& clips, const QJsonObject& source, const QString& takeId,
                               const QString& direction, double added, const QString& timing,
                               const QSet<QString>& lockedTracks) {
    if ((direction != u"start" && direction != u"end") ||
        (timing != u"keep-cut" && timing != u"available-space" && timing != u"ripple") || !positive(added))
        return refuse("invalid", "Choose an extension direction, timing and positive duration.");
    nt::edit::ClipList all;
    std::map<QString, QJsonObject> byId;
    for (const auto& value : clips) {
        const auto clip = value.toObject();
        const auto id = clip.value("id").toString(), track = clip.value("trackId").toString();
        if (id.isEmpty() || track.isEmpty() || !validPlacement(clip) || !byId.emplace(id, clip).second)
            return refuse("invalid", "The timeline contains duplicate ids or invalid clip placement.");
        all.push_back(clip);
    }
    const auto it = byId.find(source.value("clipId").toString());
    if (it == byId.end()) return refuse("stale", "The source clip no longer exists.");
    const auto clip = it->second;
    const auto id = clip.value("id").toString(), track = clip.value("trackId").toString();
    const auto asset = clip.value("currentAssetId").toString();
    if (clip.value("mediaType").toString() != u"video" || asset.isEmpty())
        return refuse("invalid", "Extension requires a video clip with an active asset.");
    if (!clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty())
        return refuse("unsupported", "Bake the time remap before extending this clip.");
    if (!clip.value("speedBaked").toBool() && !positive(clip.value("speedMultiplier").toDouble(1)))
        return refuse("invalid", "Extension requires a finite positive playback rate.");
    const double rate = nt::edit::sourceRate(clip);
    const double start = clip.value("startMs").toDouble(), duration = clip.value("durationMs").toDouble();
    const double in = clip.value("inPointMs").toDouble(0), expected = in + duration * rate;
    const double out = clip.value("outPointMs").toDouble(expected);
    if (!positive(rate) || !std::isfinite(in) || in < 0 || !std::isfinite(expected) || !std::isfinite(out) || out <= in || std::abs(out - expected) > 0.5)
        return refuse("invalid", "Extension requires a valid constant-rate source window.");
    if (source.value("trackId").toString() != track || source.value("sourceAssetId").toString() != asset ||
        (source.contains("sourceTakeId") && source.value("sourceTakeId").toString() != activeTake(clip)) ||
        source.value("sourceStartMs").toDouble(-1) != in || source.value("sourceEndMs").toDouble(-1) != out ||
        source.value("timelineStartMs").toDouble(-1) != start || source.value("timelineDurationMs").toDouble(-1) != duration ||
        source.value("rate").toDouble(-1) != rate)
        return refuse("stale", "The accepted source, mapping or placement changed after submission.");
    if (clip.value("locked").toBool() || lockedTracks.contains(track))
        return refuse("locked", "Unlock the source clip and its track before applying an extension.");
    QJsonObject take;
    int matching = 0;
    for (const auto& value : clip.value("versions").toArray()) {
        const auto candidate = value.toObject();
        if (candidate.value("id").toString() == takeId) { take = candidate; ++matching; }
    }
    if (matching != 1 || take.value("status").toString() != u"success" || take.value("source").toString() != u"extended" ||
        take.value("assetId").toString().isEmpty() || take.value("assetId").toString() == asset)
        return refuse("invalid", "Choose a successful inactive extended take on the source clip.");
    const double original = duration * rate, required = original + added, extra = added / rate;
    if (!positive(required) || !positive(extra) || required <= original)
        return refuse("invalid", "The extension duration exceeds the supported numeric range.");
    const double resultDuration = take.value("durationMs").toDouble();
    if (!positive(resultDuration)) return refuse("invalid", "The extension take requires a measured source duration.");
    if (resultDuration < required) return refuse("short", "The extension take cannot cover the source window and requested extension.");
    const bool keep = timing == u"keep-cut";
    if (!keep) {
        if (!clip.value("parentId").toString().isEmpty()) return refuse("unsupported", "Ungroup or unlink the source clip before changing its duration.");
        const auto link = clip.value("linkId");
        if (!link.isUndefined() && !link.isNull()) for (const auto& item : all)
            if (item.value("id").toString() != id && item.value("linkId") == link)
                return refuse("unsupported", "Ungroup or unlink the source clip before changing its duration.");
    }
    auto applied = clip;
    applied.insert("currentAssetId", take.value("assetId")); applied.insert("activeTakeId", take.value("id"));
    const double appliedIn = keep && direction == u"start" ? added : 0;
    applied.insert("inPointMs", appliedIn); applied.insert("outPointMs", keep ? appliedIn + original : required);
    applied.insert("startMs", timing == u"available-space" && direction == u"start" ? start - extra : start);
    applied.insert("durationMs", keep ? duration : duration + extra);
    if (!validPlacement(applied) || (!keep && applied.value("durationMs").toDouble() <= duration))
        return refuse("invalid", "The extension would create invalid timeline placement.");
    if (keep) {
        QJsonArray result;
        for (const auto& item : all) result.append(item.value("id").toString() == id ? applied : item);
        return {result, {}, {}};
    }
    nt::edit::IdSet excluded{id};
    for (const auto& item : all) if (item.value("locked").toBool()) excluded.insert(item.value("id").toString());
    nt::edit::RippleOptions options;
    for (const auto& trackId : lockedTracks) options.lockedTrackIds.insert(trackId);
    const double oldEnd = start + duration;
    auto shifted = timing == u"ripple" ? nt::edit::shiftClipsFrom(all, oldEnd, extra, excluded, options) : all;
    QSet<QString> moved;
    for (const auto& item : shifted) {
        if (!validPlacement(item)) return refuse("invalid", "A downstream clip would exceed the supported numeric range.");
        const auto itemId = item.value("id").toString();
        if (item != byId.at(itemId)) moved.insert(itemId);
    }
    std::map<QString, bool> linkedMovement;
    for (const auto& item : all) {
        const bool moves = moved.contains(item.value("id").toString());
        const auto link = item.value("linkId");
        if (!link.isUndefined() && !link.isNull()) {
            const auto [group, inserted] = linkedMovement.emplace(link.toString(), moves);
            if (!inserted && group->second != moves) return refuse("unsupported", "The ripple would separate linked clips.");
        }
        const auto parent = item.value("parentId").toString();
        if (!parent.isEmpty() && moves != moved.contains(parent)) return refuse("unsupported", "The ripple would separate a group from its children.");
    }
    std::map<QString, Intervals> occupied;
    for (const auto& item : all) if (item.value("id").toString() != id && !moved.contains(item.value("id").toString())) {
        const double begin = item.value("startMs").toDouble();
        occupied[item.value("trackId").toString()].emplace_back(begin, begin + item.value("durationMs").toDouble());
    }
    for (auto& [key, intervals] : occupied) {
        std::sort(intervals.begin(), intervals.end());
        Intervals merged;
        for (const auto& interval : intervals) {
            if (!merged.empty() && interval.first <= merged.back().second) merged.back().second = std::max(merged.back().second, interval.second);
            else merged.push_back(interval);
        }
        intervals = std::move(merged);
    }
    const auto& sourceTrack = occupied[track];
    if (overlaps(sourceTrack, applied.value("startMs").toDouble(), start) ||
        overlaps(sourceTrack, oldEnd, applied.value("startMs").toDouble() + applied.value("durationMs").toDouble()))
        return refuse("collision", "The extended clip would overlap stationary media on its track.");
    for (const auto& item : shifted) {
        const auto itemId = item.value("id").toString();
        if (!moved.contains(itemId)) continue;
        const auto& originalClip = byId.at(itemId);
        const double itemStart = item.value("startMs").toDouble(), itemDuration = item.value("durationMs").toDouble();
        if (overlaps(occupied[item.value("trackId").toString()],
                     std::max(originalClip.value("startMs").toDouble() + originalClip.value("durationMs").toDouble(), itemStart),
                     itemStart + itemDuration))
            return refuse("collision", "A rippled clip would overlap stationary media on its track.");
    }
    QJsonArray result;
    for (const auto& item : shifted) result.append(item.value("id").toString() == id ? applied : item);
    return {result, {}, {}};
}
}
