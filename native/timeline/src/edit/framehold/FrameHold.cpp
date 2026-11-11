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
// A hold's duration no longer follows its source, so a window that was implicit must be written down first.
void writeSourceWindow(QJsonObject& clip) {
    const double in = clip.value("inPointMs").toDouble();
    clip.insert("inPointMs", in);
    clip.insert("outPointMs", clip.value("outPointMs").toDouble(in + clipDurationMs(clip) * sourceRate(clip)));
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
bool sourceAnchored(const QJsonObject& animation) {
    const auto custom = animation.value("custom").toObject();
    return animation.value("preset").toString() == u"custom" && custom.value("timeBase").toString() == u"source" &&
           !custom.value("curves").toArray().isEmpty();
}
// `piece` is the right half of `original`, whose source curves were cut at the split. Its own animations keep their ids.
void restoreSourceCurves(QJsonObject& piece, const QJsonObject& original, double fromMs) {
    if (!original.value("animations").isArray() || !piece.value("animations").isArray()) { return; }
    const double in = original.value("inPointMs").toDouble();
    const double out = original.value("outPointMs").toDouble(in + clipDurationMs(original) * sourceRate(original));
    const auto whole = sourceAnimationsForWindow(original.value("animations").toArray(), fromMs, out, clipDurationMs(piece));
    QList<QJsonObject> curves;
    for (const auto& value : whole) {
        if (sourceAnchored(value.toObject())) { curves.append(value.toObject()); }
    }
    auto own = piece.value("animations").toArray();
    qsizetype next = 0;
    for (qsizetype i = 0; i < own.size() && next < curves.size(); ++i) {
        auto animation = own[i].toObject();
        if (!sourceAnchored(animation)) { continue; }
        auto restored = curves[next++];
        restored.insert("id", animation.value("id"));
        own[i] = restored;
    }
    piece.insert("animations", own);
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
double sourceMsAt(const QJsonObject& clip, double requestedMs) {
    // A stepped clip shows the frame at the start of its step, as SceneEval's steppedTime does.
    double timelineMs = requestedMs;
    const auto steppedFps = clip.value("steppedTime").toObject().value("fps").toDouble();
    if (std::isfinite(steppedFps) && steppedFps > 0) {
        const double step = 1000 / steppedFps;
        timelineMs = clipStartMs(clip) + std::floor((requestedMs - clipStartMs(clip)) / step) * step;
    }
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
        // A stepped clip holds a frame from before the cut, so the piece needs the curve from there.
        if (found != split.rightIds.end() && sources.at(id) < original.value("inPointMs").toDouble() + (atMs - clipStartMs(original)) * sourceRate(original)) {
            for (auto& clip : split.clips) {
                if (clipId(clip) == target) { restoreSourceCurves(clip, original, sources.at(id)); }
            }
        }
    }
    for (auto& clip : split.clips) {
        if (const auto source = heldSources.find(clipId(clip)); source != heldSources.end()) {
            writeSourceWindow(clip);
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
    // At the video's first frame nothing splits, so linked audio that started earlier must be cut here.
    // Its tail stays linked to the video, and the head stays in place as a clip of its own.
    if (atMs == clipStartMs(original) && !clipLinkId(original).isEmpty()) {
        ClipList cut;
        for (const auto& clip : split.clips) {
            if (clipId(clip) == id || clipLinkId(clip) != clipLinkId(original) || !(clipStartMs(clip) < atMs && atMs < clipEndMs(clip))) {
                cut.push_back(clip);
                continue;
            }
            // Its media tracks name this clip by id, and a split gives it new ids (the same refusal as an ordinary split).
            if (doc.clipsWithMediaTracks.count(clipId(clip))) {
                return {raw, {}, "A linked clip with motion tracking spans this point. Remove the tracking or choose another position."};
            }
            try {
                auto [head, tail] = splitClip(clip, atMs);
                head.remove("linkId");
                cut.push_back(head);
                cut.push_back(tail);
            } catch (const OpError&) { return {raw, {}, "This clip and its linked clips could not be split here."}; }
        }
        split.clips = std::move(cut);
    }
    auto segment = original;
    const auto newId = nt::edit::newId();
    segment.insert("id", newId); segment.insert("startMs", atMs); segment.insert("durationMs", duration);
    const double originalIn = original.value("inPointMs").toDouble();
    const double originalOut = original.value("outPointMs").toDouble(originalIn + clipDurationMs(original) * sourceRate(original));
    // A hold may show a frame outside the clip's source window. The window stays valid, and it is what Disable plays.
    const bool inside = source < originalOut;
    segment.insert("inPointMs", inside ? source : originalIn);
    segment.insert("outPointMs", inside ? std::min(source + duration * sourceRate(original), originalOut) : originalOut);
    segment.insert("timeRemap", holdRemap(source));
    for (const auto* key : {"linkId", "caption", "animations", "paramCurves", "transitionIn", "transitionOut", "transitions",
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
            // A hold can run past its source window. In motion the clip ends where the window does.
            const double in = clip.value("inPointMs").toDouble();
            const double rate = sourceRate(clip);
            const double window = (clip.value("outPointMs").toDouble(in + clipDurationMs(clip) * rate) - in) / rate;
            if (window > 0 && clipDurationMs(clip) > window) {
                next.insert("durationMs", window);
                if (next.value("animations").isArray()) {
                    next.insert("animations", sourceAnimationsForWindow(next.value("animations").toArray(), in, in + window * rate, window));
                }
            }
        } else {
            auto moving = clip;
            if (isHold(moving)) { moving.remove("timeRemap"); }
            const double start = clipStartMs(clip);
            const double end = clipEndMs(clip);
            const double in = clip.value("inPointMs").toDouble();
            const double rate = sourceRate(clip);
            const double out = clip.value("outPointMs").toDouble(in + clipDurationMs(clip) * rate);
            const double lastSource = std::max(in, out - frame * rate);
            // A hold can outlast its source window, so a time mapped at the clip's rate can land past the media.
            const auto at = [&](double time) {
                const double mapped = sourceMsAt(moving, std::clamp(time, start, std::max(start, std::nextafter(end, start))));
                return hasRemap(moving) ? mapped : std::min(mapped, lastSource);
            };
            double source = at(start);
            if (request.holdOn == "out") {
                source = at(std::max(start, end - frame));
            } else if (request.holdOn == "playhead") { source = at(request.playheadMs); }
            else if (request.holdOn == "sequenceTime") { source = at(request.timeMs); }
            else if (request.holdOn == "sourceTime") { source = std::max(0.0, request.timeMs); }
            writeSourceWindow(next);
            next.insert("timeRemap", holdRemap(source));
        }
        if (next != clip) { changed.append(clipId(clip)); clip = next; }
    }
    if (changed.isEmpty()) { return {raw, {}, "No frame holds changed.", true}; }
    return {structure::withClips(raw, doc.clips), changed, {}};
}
}
