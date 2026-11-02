// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#include "FrameHold.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/speed/TimeRemap.h"
#include "edit/targeting/TargetingEdits.h"
#include <algorithm>
#include <cmath>
#include <map>

namespace nt::framehold {
namespace {
using namespace nt::edit;
const QString curveError = "Clear the time remap on this clip first.";
const QString targetError = "Place the playhead over a video clip.";
QJsonObject holdRemap(double sourceMs) {
    return {{"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"sourceMs", sourceMs}},
                                     QJsonObject{{"t", 1}, {"sourceMs", sourceMs}}}}};
}
bool hasRemap(const QJsonObject& clip) {
    return !clip.value("timeRemap").toObject().value("keyframes").toArray().isEmpty();
}
bool spans(const QJsonObject& clip, double atMs) {
    return std::isfinite(atMs) && clipStartMs(clip) <= atMs && atMs < clipEndMs(clip);
}
QString validate(const EditDoc& doc, const QJsonObject& clip, bool split) {
    if (clip.value("mediaType") != "video") { return targetError; }
    if (!editableUserTargets(doc, {clipId(clip)}, split, false).contains(clipId(clip))) {
        return "Unlock the clip and its track before adding a frame hold.";
    }
    if (split && hasRemap(clip) && !isHold(clip)) { return curveError; }
    return {};
}
struct Split {
    ClipList clips;
    std::map<QString, QString> rightIds;
};
Split splitAt(const EditDoc& doc, const QStringList& ids, double atMs) {
    Split result{splitSelectedAtPlayhead(doc, atMs, ids).clips, {}};
    size_t index = 0;
    for (const auto& original : doc.clips) {
        if (clipId(result.clips[index]) == clipId(original)) { ++index; }
        else {
            result.rightIds.emplace(clipId(original), clipId(result.clips[index + 1]));
            index += 2;
        }
    }
    return result;
}
}
bool isHold(const QJsonObject& clip) { return nt::edit::isHoldRemap(clip); }
double sourceMsAt(const QJsonObject& clip, double timelineMs) {
    if (const auto remap = nt::speed::parseTimeRemap(clip.value("timeRemap"))) {
        const double t = clipDurationMs(clip) > 0 ? (timelineMs - clipStartMs(clip)) / clipDurationMs(clip) : 0;
        if (const auto source = nt::speed::evaluateTimeRemapMs(remap->keyframes, t)) { return std::max(0.0, *source); }
    }
    return std::max(0.0, clip.value("inPointMs").toDouble() + (timelineMs - clipStartMs(clip)) * sourceRate(clip));
}
Result addFrameHold(const QJsonObject& raw, const QStringList& ids, double atMs) {
    const auto doc = structure::editDocument(raw);
    std::map<QString, double> sources;
    QStringList selected;
    for (const auto& id : ids) {
        const int index = doc.indexOf(id);
        if (index < 0) { continue; }
        const auto& clip = doc.clips[static_cast<size_t>(index)];
        if (!spans(clip, atMs) || clip.value("mediaType") != "video") { continue; }
        if (hasRemap(clip) && !isHold(clip)) { return {raw, {}, curveError}; }
        if (sources.emplace(id, sourceMsAt(clip, atMs)).second) { selected.append(id); }
    }
    if (selected.isEmpty()) { return {raw, {}, targetError}; }
    if (editableUserTargets(doc, IdSet(selected.begin(), selected.end()), true, false).size() != sources.size()) {
        return {raw, {}, "Unlock the clip and its track before adding a frame hold."};
    }
    auto split = splitAt(doc, selected, atMs);
    QStringList heldIds;
    std::map<QString, double> heldSources;
    for (const auto& id : selected) {
        const auto& original = doc.clips[static_cast<size_t>(doc.indexOf(id))];
        const auto found = split.rightIds.find(id);
        if (clipStartMs(original) < atMs && found == split.rightIds.end()) {
            return {raw, {}, "This clip and its linked clips could not be split here."};
        }
        const auto target = found == split.rightIds.end() ? id : found->second;
        heldSources.emplace(target, sources.at(id));
        heldIds.append(target);
    }
    for (auto& clip : split.clips) {
        if (const auto source = heldSources.find(clipId(clip)); source != heldSources.end()) {
            clip.insert("timeRemap", holdRemap(source->second));
        }
    }
    return {structure::withClips(raw, split.clips), heldIds, {}};
}
Result insertFrameHoldSegment(const QJsonObject& raw, const QString& id, double atMs, double durationMs) {
    if (!std::isfinite(durationMs) || durationMs <= 0) { return {raw, {}, "Enter a positive duration for the frame hold."}; }
    auto doc = structure::editDocument(raw);
    const int index = doc.indexOf(id);
    if (index < 0 || !spans(doc.clips[static_cast<size_t>(index)], atMs)) { return {raw, {}, targetError}; }
    const auto original = doc.clips[static_cast<size_t>(index)];
    const auto error = validate(doc, original, true);
    if (!error.isEmpty()) { return {raw, {}, error}; }
    const double fps = raw.value("fps").toDouble(30);
    const double duration = std::max(durationMs, 1000.0 / (std::isfinite(fps) && fps > 0 ? fps : 30));
    const double source = sourceMsAt(original, atMs);
    auto split = splitAt(doc, {id}, atMs);
    if (atMs > clipStartMs(original) && !split.rightIds.contains(id)) {
        return {raw, {}, "This clip and its linked clips could not be split here."};
    }
    auto segment = original;
    const auto newId = nt::edit::newId();
    segment.insert("id", newId); segment.insert("startMs", atMs); segment.insert("durationMs", duration);
    segment.insert("inPointMs", source);
    const double originalOut = original.value("outPointMs").toDouble(
        original.value("inPointMs").toDouble() + clipDurationMs(original) * sourceRate(original));
    segment.insert("outPointMs", std::min(source + duration * sourceRate(original), originalOut));
    segment.insert("timeRemap", holdRemap(source));
    for (const auto* key : {"linkId", "caption", "animations", "transitionIn", "transitionOut", "transitions",
                            "fadeInMs", "fadeOutMs", "fadeInShape", "fadeOutShape", "markers"}) {
        segment.remove(key);
    }
    doc.clips = std::move(split.clips);
    doc.clips.push_back(segment);
    const auto unresolved = doc.clips;
    const auto& state = nt::targeting::TrackTargeting::current().state();
    const QString blocked = "A locked or linked clip is in the way. Unlock it or choose another position.";
    try { doc.clips = nt::targeting::resolveDropAction(doc, state, {newId}, "insert"); }
    catch (const OpError&) { return {raw, {}, blocked}; }
    if (doc.clips == unresolved) {
        const auto frozen = nt::targeting::rippleFrozenTrackIds(doc, state, {clipTrackId(segment)});
        const auto locked = lockedUserTargetIds(doc);
        for (const auto& c : doc.clips) {
            if (clipId(c) != newId && clipStartMs(c) >= atMs && !frozen.contains(clipTrackId(c)) &&
                !locked.contains(clipId(c))) { return {raw, {}, blocked}; }
        }
    }
    for (const auto& c : doc.clips) {
        if (clipId(c) != newId && clipTrackId(c) == clipTrackId(segment) &&
            clipStartMs(c) < atMs + duration && atMs < clipEndMs(c)) { return {raw, {}, blocked}; }
    }
    return {structure::withClips(raw, doc.clips), {newId}, {}};
}
Result setFrameHoldOptions(const QJsonObject& raw, const OptionsRequest& request) {
    const QStringList modes{"in", "out", "playhead", "sequenceTime", "sourceTime"};
    if (request.enabled && (!modes.contains(request.holdOn) ||
        (request.holdOn == "playhead" && !std::isfinite(request.playheadMs)) ||
        ((request.holdOn == "sequenceTime" || request.holdOn == "sourceTime") && !std::isfinite(request.timeMs)))) {
        return {raw, {}, "Choose a valid frame to hold."};
    }
    auto doc = structure::editDocument(raw);
    const IdSet ids(request.clipIds.begin(), request.clipIds.end());
    const auto editable = editableUserTargets(doc, ids, false, false);
    const double fps = raw.value("fps").toDouble(30);
    const double frame = 1000.0 / (std::isfinite(fps) && fps > 0 ? fps : 30);
    QStringList changed;
    for (auto& clip : doc.clips) {
        if (!ids.contains(clipId(clip)) || clip.value("mediaType") != "video") { continue; }
        if (!editable.contains(clipId(clip))) {
            return {raw, {}, "Unlock the clip and its track before adding a frame hold."};
        }
        auto next = clip;
        if (!request.enabled) {
            if (!isHold(clip)) { continue; }
            next.remove("timeRemap");
        } else {
            auto moving = clip;
            if (isHold(moving)) { moving.remove("timeRemap"); }
            const double start = clipStartMs(clip);
            const double end = clipEndMs(clip);
            const double in = clip.value("inPointMs").toDouble();
            const double rate = sourceRate(clip);
            const auto at = [&](double time) { return sourceMsAt(moving, std::clamp(time, start, std::max(start, std::nextafter(end, start)))); };
            double source = at(start);
            if (request.holdOn == "out") {
                const double out = clip.value("outPointMs").toDouble(in + clipDurationMs(clip) * rate);
                source = std::max(in, std::min(at(std::max(start, end - frame)), out - frame * rate));
            } else if (request.holdOn == "playhead") { source = at(request.playheadMs); }
            else if (request.holdOn == "sequenceTime") { source = at(request.timeMs); }
            else if (request.holdOn == "sourceTime") { source = std::max(0.0, request.timeMs); }
            next.insert("timeRemap", holdRemap(source));
        }
        if (next != clip) { changed.append(clipId(clip)); clip = next; }
    }
    if (changed.isEmpty()) { return {raw, {}, "No frame holds changed."}; }
    return {structure::withClips(raw, doc.clips), changed, {}};
}
}
