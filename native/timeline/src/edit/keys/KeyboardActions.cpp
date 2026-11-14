// The actions behind the keys of the keyboard presets that have no other home.
// The web handlers in TracksRegion.tsx come first. The keys only Premiere has
// follow FilmCraft (crates/engine/src/keyboard.rs, licenses/FilmCraft-MIT.txt)
// where it matches what Premiere does. The keys themselves are in Keymap.
#include "app/EditRegistry.h"
#include "app/Preferences/PreferencesSettings.h"
#include "edit/ClipGestureController.h"
#include "edit/clipboard/RawDocument.h"
#include "edit/keyframes/Keyframes.h"
#include "edit/keys/AudioCrossfade.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "edit/speed/TimeRemap.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/targeting/TrackTargeting.h"
#include "ui/TimelineViewState.h"
#include "ui/TimelineWheel.h"
#include "wiring/KeyActions.h"
#include "wiring/SourceDurations.h"
#include "wiring/w/SceneItems.h"

#include <QQmlEngine>

#include <algorithm>
#include <cmath>
#include <exception>
#include <optional>
#include <vector>

namespace {
using namespace nt::edit;
using Handler = std::function<bool(ClipGestureController&, const QVariantMap&)>;

// Merge keys of held keys. ClipGestureController uses 1 and 2.
constexpr int SLIDE_MERGE_ID = 3;
constexpr int VOLUME_MERGE_ID = 4;
constexpr double DEFAULT_AUDIO_TRANSITION_MS = 500;
// TracksRegion.tsx TRACK_HEIGHT_STEP, as a vertical zoom.
constexpr double TRACK_ZOOM_STEP = 0.25;
constexpr double AUDIO_TRACK_HEIGHT_STEP_PX = 12;
constexpr double MIN_TRACK_HEIGHT_PX = 48;
constexpr double MAX_TRACK_HEIGHT_PX = 300;
constexpr double DEFAULT_TRACK_HEIGHT_PX = 64;
constexpr double LARGE_VOLUME_STEP_DB = 6;
// Within this many ms an edge counts as at the playhead (editPoints.ts AT_EDGE_MS).
constexpr double AT_EDGE_MS = 1;

double playhead(const ClipGestureController& gestures) { return gestures.clock()->currentTimeMs(); }
double frameMs(const ClipGestureController& gestures) { return 1000.0 / std::max(1.0, gestures.timeline()->fps()); }
bool autoRepeat(const QVariantMap& context) { return context.value("autoRepeat").toBool(); }
IdSet targetedTracks(const EditDoc& doc) {
    return nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
}
// editPoints.ts clipsAtTime
std::vector<QJsonObject> clipsAtTime(const EditDoc& doc, const IdSet& tracks, double atMs) {
    std::vector<QJsonObject> out;
    for (const auto& c : doc.clips) {
        if (!isGroupClip(c) && tracks.contains(clipTrackId(c)) && clipStartMs(c) <= atMs && atMs < clipEndMs(c)) out.push_back(c);
    }
    return out;
}
// seekToNeighbour: the nearest time more than 1 ms away.
void seekToNeighbour(const ClipGestureController& gestures, std::vector<double> times, bool forward) {
    std::ranges::sort(times);
    const double now = playhead(gestures);
    std::optional<double> target;
    for (const double t : times) {
        if (forward && t > now + AT_EDGE_MS) { target = t; break; }
        if (!forward && t < now - AT_EDGE_MS) target = t;
    }
    if (target) gestures.clock()->seek(*target);
}
// editPoints.ts editTimesMs: every clip edge on `tracks`, plus the sequence start.
std::vector<double> editTimes(const EditDoc& doc, const std::optional<IdSet>& tracks) {
    std::vector<double> times{0};
    for (const auto& c : doc.clips) {
        if (isGroupClip(c) || (tracks && !tracks->contains(clipTrackId(c)))) continue;
        times.push_back(clipStartMs(c));
        times.push_back(clipEndMs(c));
    }
    return times;
}
QStringList withLinks(const ClipGestureController& gestures, const EditDoc& doc, const QStringList& ids) {
    const IdSet unit = moveUnitIds(doc.clips, ids, gestures.linkedSelection());
    QStringList out = ids;
    for (const auto& c : doc.clips) {
        if (unit.contains(clipId(c)) && !out.contains(clipId(c))) out.append(clipId(c));
    }
    return out;
}
bool selectClipsAtPlayhead(ClipGestureController& gestures) {
    const auto doc = gestures.editDoc();
    QStringList ids;
    for (const auto& c : clipsAtTime(doc, targetedTracks(doc), playhead(gestures))) ids.append(clipId(c));
    gestures.setSelection(withLinks(gestures, doc, ids));
    return true;
}
// Select Next / Previous Clip: on each track of the selection, the clip after
// its last selected clip or before its first. The selection stays at the end.
bool selectStep(ClipGestureController& gestures, bool next) {
    if (gestures.selection().isEmpty()) return selectClipsAtPlayhead(gestures);
    const auto doc = gestures.editDoc();
    QStringList picks;
    for (const auto& track : doc.tracks) {
        ClipList lane;
        for (const auto& c : doc.clips) {
            if (clipTrackId(c) == track.id && !isGroupClip(c)) lane.push_back(c);
        }
        std::ranges::sort(lane, {}, [](const QJsonObject& c) { return clipStartMs(c); });
        std::optional<size_t> anchor;
        for (size_t i = 0; i < lane.size(); ++i) {
            if (!gestures.selection().contains(clipId(lane[i]))) continue;
            if (next || !anchor) anchor = i;
        }
        if (!anchor) continue;
        if (next && *anchor + 1 < lane.size()) picks.append(clipId(lane[*anchor + 1]));
        if (!next && *anchor > 0) picks.append(clipId(lane[*anchor - 1]));
    }
    if (!picks.isEmpty()) gestures.setSelection(withLinks(gestures, doc, picks));
    return true;
}
std::optional<std::pair<double, double>> selectionSpan(const ClipGestureController& gestures) {
    std::optional<std::pair<double, double>> span;
    const auto doc = gestures.editDoc();
    for (const auto& c : doc.clips) {
        if (!gestures.selection().contains(clipId(c))) continue;
        span = span ? std::pair{std::min(span->first, clipStartMs(c)), std::max(span->second, clipEndMs(c))}
                    : std::pair{clipStartMs(c), clipEndMs(c)};
    }
    return span;
}
// Gaps where no track has a clip, from time 0 (edit::through::sequence_gaps).
bool goToGap(const ClipGestureController& gestures, bool next) {
    const auto doc = gestures.editDoc();
    std::vector<std::pair<double, double>> spans;
    for (const auto& c : doc.clips) {
        if (!isGroupClip(c)) spans.emplace_back(clipStartMs(c), clipEndMs(c));
    }
    std::ranges::sort(spans);
    std::vector<double> starts;
    double covered = 0;
    for (const auto& [start, end] : spans) {
        if (start > covered) starts.push_back(covered);
        covered = std::max(covered, end);
    }
    seekToNeighbour(gestures, starts, next);
    return true;
}
std::optional<double> sourceCapOf(ClipGestureController& gestures, const QString& id) {
    const double cap = gestures.sourceCapMs(id);
    return cap >= 0 ? std::optional(cap) : std::nullopt;
}
// Extend Previous / Next Edit To Playhead: on each targeted, unlocked track, the
// nearest edit before or after the playhead moves to it. A cut between two clips
// rolls, an edge beside a gap is trimmed, and nothing ripples.
bool extendEditToPlayhead(ClipGestureController& gestures, bool next) {
    auto doc = gestures.editDoc();
    const double now = playhead(gestures);
    const auto targets = targetedTracks(doc);
    const auto locked = lockedTrackIds(doc);
    struct Move { QString left; QString right; double edge; };
    std::vector<Move> moves;
    for (const auto& track : doc.tracks) {
        if (!targets.contains(track.id) || locked.contains(track.id)) continue;
        std::optional<double> edge;
        for (const auto& c : doc.clips) {
            if (clipTrackId(c) != track.id || isGroupClip(c)) continue;
            for (const double e : {clipStartMs(c), clipEndMs(c)}) {
                if ((next ? e - now : now - e) <= AT_EDGE_MS) continue;
                if (!edge || std::abs(e - now) < std::abs(*edge - now)) edge = e;
            }
        }
        if (!edge) continue;
        Move move{{}, {}, *edge};
        for (const auto& c : doc.clips) {
            if (clipTrackId(c) != track.id || isGroupClip(c)) continue;
            if (std::abs(clipEndMs(c) - *edge) <= AT_EDGE_MS) move.left = clipId(c);
            if (std::abs(clipStartMs(c) - *edge) <= AT_EDGE_MS) move.right = clipId(c);
        }
        moves.push_back(move);
    }
    if (moves.empty()) return false;
    const auto before = gestures.timeline()->clipsJson();
    const auto edgeOf = [&](const Move& move) {
        for (const auto& c : doc.clips) {
            if (clipId(c) == move.left) return clipEndMs(c);
            if (clipId(c) == move.right) return clipStartMs(c);
        }
        return move.edge;
    };
    const bool linked = gestures.linkedSelection();
    for (const auto& move : moves) {
        // A linked partner on an earlier track may have moved this edge already.
        if (std::abs(edgeOf(move) - move.edge) > AT_EDGE_MS) continue;
        const double delta = now - move.edge;
        if (!move.left.isEmpty() && !move.right.isEmpty()) {
            doc.clips = rollClipEdge(doc, move.left, "end", delta, sourceCapOf(gestures, move.left), linked);
        } else if (!move.left.isEmpty()) {
            doc.clips = trimClipEnd(doc, move.left, delta, sourceCapOf(gestures, move.left), linked);
        } else {
            doc.clips = trimClipStart(doc, move.right, -delta, linked);
        }
    }
    gestures.timeline()->commitEdit(next ? QStringLiteral("Extend next edit") : QStringLiteral("Extend previous edit"), before,
                                    structure::clipsToJson(doc.clips));
    return true;
}
bool trimEditByFrames(ClipGestureController& gestures, double frames, const QVariantMap& context) {
    const auto edit = gestures.selectedEdit();
    if (edit.isEmpty()) return false;
    const auto doc = gestures.editDoc();
    for (const auto& c : doc.clips) {
        if (clipId(c) != edit.value("clipId").toString()) continue;
        const double edgeMs = edit.value("edge").toString() == u"start" ? clipStartMs(c) : clipEndMs(c);
        return gestures.trimEditPoint(frameStepMs(edgeMs, frames, gestures.timeline()->fps()), autoRepeat(context));
    }
    return false;
}
// Slide Clip Selection: every selected clip by one frame on the grid, its
// neighbours trimming to follow. A linked partner moves with its clip.
bool slideSelection(ClipGestureController& gestures, double frames, const QVariantMap& context) {
    if (gestures.selection().isEmpty()) return false;
    auto doc = gestures.editDoc();
    const auto before = gestures.timeline()->clipsJson();
    double delta = 0;
    for (const auto& c : doc.clips) {
        if (clipId(c) == gestures.selection().first()) {
            delta = frameStepMs(clipStartMs(c), frames, gestures.timeline()->fps()) - clipStartMs(c);
        }
    }
    IdSet moved;
    for (const auto& id : gestures.selection()) {
        if (moved.contains(id)) continue;
        doc.clips = slideClip(doc, id, delta, gestures.linkedSelection());
        moved.merge(moveUnitIds(doc.clips, {id}, gestures.linkedSelection()));
    }
    gestures.timeline()->commitEdit(QStringLiteral("Slide clip"), before, structure::clipsToJson(doc.clips), SLIDE_MERGE_ID, autoRepeat(context));
    return true;
}
// Increase / Decrease Clip Volume: the selected sounding clips, one undo entry
// for a held key. The edit is the audio gain dialog's.
bool changeVolume(ClipGestureController& gestures, double db, const QVariantMap& context) {
    if (gestures.selection().isEmpty()) return false;
    const auto edit = nt::app::findEdit("setClipsGain");
    if (!edit) return false;
    const auto doc = gestures.editDoc();
    const auto ids = withLinks(gestures, doc, gestures.selection());
    auto raw = gestures.timeline()->timeline().raw;
    const auto before = gestures.timeline()->clipsJson();
    raw.insert("clips", before);
    const auto next = edit(std::move(raw), {{"selectedIds", QJsonArray::fromStringList(ids)}, {"db", db}, {"mode", "adjust"}});
    return gestures.timeline()->commitEdit(QStringLiteral("Clip volume"), before, next.value("clips").toArray(),
                                           VOLUME_MERGE_ID, autoRepeat(context)) != 0;
}
// Expand or Minimize All Tracks. Pressing the same key again restores the zoom.
bool zoomAllTracks(ClipGestureController& gestures, double zoom) {
    auto* view = gestures.viewState();
    const char* key = "trackZoomBeforeAll";
    const QVariant restore = gestures.property(key);
    if (restore.isValid() && std::abs(view->verticalZoom() - zoom) < 1e-6) {
        view->setVerticalZoom(restore.toDouble());
        gestures.setProperty(key, {});
    } else {
        if (!restore.isValid()) gestures.setProperty(key, view->verticalZoom());
        view->setVerticalZoom(zoom);
    }
    return true;
}
// Slow shuttle: 10% of normal speed, and each further press adds 10%.
bool slowShuttle(ClipGestureController& gestures, int direction) {
    auto* clock = gestures.clock();
    const bool sameWay = clock->playing() && clock->rate() * direction > 0 && std::abs(clock->rate()) < 1;
    if (sameWay) {
        clock->setRate(direction * std::min(1.0, std::round(std::abs(clock->rate()) * 10 + 1) / 10));
    } else {
        clock->pause();
        clock->setRate(direction * 0.1);
        clock->play();
    }
    return true;
}
double sequenceEnd(const ClipGestureController& gestures) {
    double end = 0;
    for (const auto& c : gestures.timeline()->timeline().clips) end = std::max(end, c.endMs());
    return end;
}
// Keyframe keys: one selected clip, and for adding, the playhead on it.
std::optional<QJsonObject> singleSelectedClip(const ClipGestureController& gestures) {
    if (gestures.selection().size() != 1) return std::nullopt;
    const auto doc = gestures.editDoc();
    for (const auto& c : doc.clips) {
        if (clipId(c) == gestures.selection().first()) return c;
    }
    return std::nullopt;
}
bool stepKeyframe(ClipGestureController& gestures, bool forward) {
    const auto clip = singleSelectedClip(gestures);
    if (!clip) return false;
    std::vector<double> times;
    const auto properties = gestures.keyframeRowOnly() ? nt::keyframes::properties(gestures.keyframeRow()) : QStringList{};
    for (const auto& t : nt::keyframes::times(*clip, properties)) times.push_back(clipStartMs(*clip) + t.toDouble());
    seekToNeighbour(gestures, times, forward);
    return true;
}
// matchFrame.ts matchFrameTarget: the clip under the playhead on the topmost
// targeted track that has an asset.
struct MediaTarget {
    QString assetId;
    QString name;
    QString mediaType;
    double sourceMs = 0;
    double sourceLengthMs = -1;
};
std::optional<MediaTarget> clipMediaAtPlayhead(ClipGestureController& gestures) {
    const auto doc = gestures.editDoc();
    const double at = playhead(gestures);
    QHash<QString, int> order;
    for (const auto& t : gestures.timeline()->timeline().raw.value(u"tracks").toArray()) {
        order.insert(t.toObject().value(u"id").toString(), t.toObject().value(u"index").toInt());
    }
    std::optional<QJsonObject> top;
    for (const auto& c : clipsAtTime(doc, targetedTracks(doc), at)) {
        if (c.value("currentAssetId").toString().isEmpty()) continue;
        if (!top || order.value(clipTrackId(c)) < order.value(clipTrackId(*top))) top = c;
    }
    if (!top) return std::nullopt;
    MediaTarget target{top->value("currentAssetId").toString(), top->value("name").toString(), top->value("mediaType").toString()};
    target.sourceMs = std::max(0.0, (at - clipStartMs(*top)) * sourceRate(*top) + top->value("inPointMs").toDouble(0));
    if (const auto* typed = gestures.timeline()->findClip(clipId(*top))) {
        if (const auto remapped = nt::speed::clipRemapSourceMs(*typed, at)) target.sourceMs = std::max(0.0, *remapped);
    }
    target.sourceMs = std::round(target.sourceMs);
    target.sourceLengthMs = gestures.sourceCapMs(clipId(*top));
    return target;
}
QQuickItem* editorOf(ClipGestureController& gestures) {
    for (QQuickItem* item = &gestures; item; item = item->parentItem()) {
        if (item->property("dockStore").isValid()) return item;
    }
    return nullptr;
}
bool revealClipMedia(ClipGestureController& gestures, bool match) {
    const auto target = clipMediaAtPlayhead(gestures);
    auto* editor = editorOf(gestures);
    if (!target || !editor) return false;
    if (match) {
        auto* engine = qmlEngine(&gestures);
        auto* source = engine ? engine->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState") : nullptr;
        if (!source) return false;
        // Enough of the asset to show now. The Library's row replaces it when it arrives.
        QVariantMap asset{{"id", target->assetId}, {"name", target->name}, {"content_type", target->mediaType + "/*"}};
        if (target->sourceLengthMs > 0) asset.insert("duration", target->sourceLengthMs / 1000);
        source->cue(asset, target->sourceMs);
    }
    QVariant shown;
    return QMetaObject::invokeMethod(editor, "revealAsset", Q_RETURN_ARG(QVariant, shown), Q_ARG(QVariant, target->assetId),
                                     Q_ARG(QVariant, match)) && shown.toBool();
}
QJsonObject changeAudioTrackHeights(QJsonObject document, const QJsonObject& payload) {
    auto tracks = document.value("tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value("type").toString() != u"audio") continue;
        track.insert("heightPx", std::clamp(track.value("heightPx").toDouble(DEFAULT_TRACK_HEIGHT_PX) + payload.value("deltaPx").toDouble(),
                                            MIN_TRACK_HEIGHT_PX, MAX_TRACK_HEIGHT_PX));
        tracks[i] = track;
    }
    document.insert("tracks", tracks);
    return document;
}
QJsonObject clearAllMarkers(QJsonObject document, const QJsonObject&) {
    document.insert("markers", QJsonArray{});
    return document;
}
QJsonObject applyDefaultAudioTransition(QJsonObject document, const QJsonObject& payload) {
    const auto doc = structure::editDocument(document);
    IdSet chosen;
    for (const auto& id : payload.value("selectedIds").toArray()) chosen.insert(id.toString());
    const auto caps = payload.value("sourceCaps").toObject();
    AudioCrossfadeOptions options;
    options.canExtend = [&doc](const QJsonObject& c) { return editableUserTargets(doc, {clipId(c)}, true, false).contains(clipId(c)); };
    options.sourceDurationMs = [&caps](const QJsonObject& c) -> std::optional<double> {
        const auto cap = caps.value(clipId(c));
        return cap.isDouble() ? std::optional(cap.toDouble()) : std::nullopt;
    };
    document.insert("clips", structure::clipsToJson(applyAudioCrossfades(doc.clips, editableUserTargets(doc, chosen, false, false),
                                                                         DEFAULT_AUDIO_TRANSITION_MS, options)));
    return document;
}

struct Entry {
    const char* name;
    const char* label;
    const char* group;
    Handler handler;
    QList<QKeySequence> defaultKeys = {};  // keys for presets that do not bind the action
};

const bool registered = [] {
    nt::app::registerEdit("changeAudioTrackHeights", changeAudioTrackHeights);
    nt::app::registerEdit("clearAllMarkers", clearAllMarkers);
    nt::app::registerEdit("applyDefaultAudioTransition", applyDefaultAudioTransition);
    using C = ClipGestureController&;
    using V = const QVariantMap&;
    const std::vector<Entry> entries{
        // Bound in the web table, with no native handler until now.
        {"prevCut", "Previous cut", "Playback", [](C g, V) {
            const auto doc = g.editDoc();
            seekToNeighbour(g, editTimes(doc, targetedTracks(doc)), false);
            return true;
        }},
        {"nextCut", "Next cut", "Playback", [](C g, V) {
            const auto doc = g.editDoc();
            seekToNeighbour(g, editTimes(doc, targetedTracks(doc)), true);
            return true;
        }},
        {"selectClipAtPlayhead", "Select the clips at the playhead", "Editing", [](C g, V) { return selectClipsAtPlayhead(g); }},
        {"extendEdit", "Extend the edit point to the playhead", "Editing", [](C g, V c) {
            return g.trimEditPoint(playhead(g), autoRepeat(c));
        }},
        {"trimEditLeft", "Trim edit point one frame back", "Editing", [](C g, V c) { return trimEditByFrames(g, -1, c); }},
        {"trimEditRight", "Trim edit point one frame on", "Editing", [](C g, V c) { return trimEditByFrames(g, 1, c); }},
        {"trimEditLeftLarge", "Trim edit point ten frames back", "Editing", [](C g, V c) { return trimEditByFrames(g, -10, c); }},
        {"trimEditRightLarge", "Trim edit point ten frames on", "Editing", [](C g, V c) { return trimEditByFrames(g, 10, c); }},
        {"audioGain", "Audio gain of selected clips", "Editing", [](C g, V) {
            if (g.selection().isEmpty()) return false;
            auto* host = nt::wiring::w::windowItem(&g, "audioGainHost");
            QVariant opened;
            return host && QMetaObject::invokeMethod(host, "openForSelection", Q_RETURN_ARG(QVariant, opened),
                Q_ARG(QVariant, QVariant::fromValue(g.selection()))) && opened.toBool();
        }},
        {"applyDefaultAudioTransition", "Cross-fade the audio at the selected clips' edits", "Editing", [](C g, V) {
            if (g.selection().isEmpty()) return false;
            QJsonObject caps;
            for (const auto& c : g.timeline()->timeline().clips) {
                if (c.mediaType != nt::MediaType::Audio) continue;
                const auto& path = c.audioPath.empty() ? c.mediaPath : c.audioPath;
                if (const auto cap = nt::wiring::knownSourceDuration(QString::fromStdString(path))) {
                    caps.insert(QString::fromStdString(c.id), *cap);
                }
            }
            g.timeline()->applyEdit("applyDefaultAudioTransition",
                                    {{"selectedIds", QJsonArray::fromStringList(g.selection())}, {"sourceCaps", caps}});
            return true;
        }},
        {"matchFrame", "Match frame (open the source at this frame)", "Playback", [](C g, V) { return revealClipMedia(g, true); }},
        {"revealInProject", "Reveal the clip's media in Assets", "Playback", [](C g, V c) {
            // A menu names its clip. The key follows the playhead.
            const auto ids = c.value("clipIds").toStringList();
            if (ids.isEmpty()) return revealClipMedia(g, false);
            const auto clip = g.clipData(ids.first());
            auto* editor = editorOf(g);
            const auto asset = clip.value("currentAssetId").toString();
            QVariant shown;
            return editor && !asset.isEmpty() && QMetaObject::invokeMethod(editor, "revealAsset", Q_RETURN_ARG(QVariant, shown),
                       Q_ARG(QVariant, asset), Q_ARG(QVariant, false)) && shown.toBool();
        }},
        {"addKeyframe", "Keyframe the selected clip at the playhead", "Keyframes & source", [](C g, V) {
            const auto clip = singleSelectedClip(g);
            if (!clip) return false;
            const double at = playhead(g) - clipStartMs(*clip);
            if (at < 0 || at > clipDurationMs(*clip)) return false;
            g.timeline()->applyEdit("keyframes.toggle", {{"clipId", clipId(*clip)}, {"row", g.keyframeRow()}, {"atMs", at}});
            return true;
        }},
        {"nextKeyframe", "Next keyframe", "Keyframes & source", [](C g, V) { return stepKeyframe(g, true); }},
        {"prevKeyframe", "Previous keyframe", "Keyframes & source", [](C g, V) { return stepKeyframe(g, false); }},
        {"expandTracks", "Make tracks taller", "Zoom & view", [](C g, V) {
            g.viewState()->setVerticalZoom(g.viewState()->verticalZoom() + TRACK_ZOOM_STEP);
            return true;
        }},
        {"shrinkTracks", "Make tracks shorter", "Zoom & view", [](C g, V) {
            g.viewState()->setVerticalZoom(g.viewState()->verticalZoom() - TRACK_ZOOM_STEP);
            return true;
        }},
        // The keys only the Premiere preset has. Home and End reach the
        // sequence ends under every preset that leaves those keys free.
        {"goToSequenceStart", "Go to the sequence start", "Playback", [](C g, V) { g.clock()->seek(0); return true; }, {QKeySequence(Qt::Key_Home)}},
        {"goToSequenceEnd", "Go to the sequence end", "Playback", [](C g, V) { g.clock()->seek(sequenceEnd(g)); return true; }, {QKeySequence(Qt::Key_End)}},
        {"prevCutAnyTrack", "Previous cut on any track", "Playback", [](C g, V) {
            seekToNeighbour(g, editTimes(g.editDoc(), std::nullopt), false);
            return true;
        }},
        {"nextCutAnyTrack", "Next cut on any track", "Playback", [](C g, V) {
            seekToNeighbour(g, editTimes(g.editDoc(), std::nullopt), true);
            return true;
        }},
        {"goToSelectedStart", "Go to the start of the selection", "Playback", [](C g, V) {
            const auto span = selectionSpan(g);
            if (!span) return false;
            g.clock()->seek(span->first);
            return true;
        }},
        {"goToSelectedEnd", "Go to the last frame of the selection", "Playback", [](C g, V) {
            const auto span = selectionSpan(g);
            if (!span) return false;
            g.clock()->seek(std::max(span->first, span->second - frameMs(g)));
            return true;
        }},
        {"selectPrevClip", "Select the previous clip", "Editing", [](C g, V) { return selectStep(g, false); }},
        {"selectNextClip", "Select the next clip", "Editing", [](C g, V) { return selectStep(g, true); }},
        {"nextGap", "Go to the next gap in the sequence", "Playback", [](C g, V) { return goToGap(g, true); }},
        {"prevGap", "Go to the previous gap in the sequence", "Playback", [](C g, V) { return goToGap(g, false); }},
        {"slowShuttleBack", "Shuttle backwards slowly (again: faster)", "Playback", [](C g, V) { return slowShuttle(g, -1); }},
        {"slowShuttleForward", "Shuttle forwards slowly (again: faster)", "Playback", [](C g, V) { return slowShuttle(g, 1); }},
        {"playAround", "Play around the playhead", "Playback", [](C g, V c) {
            const double at = playhead(g);
            if (!autoRepeat(c)) g.clock()->playSpan(std::max(0.0, at - nt::app::playbackPrerollMs()), at + nt::app::playbackPostrollMs(), at);
            return true;
        }},
        {"playInToOutWithRoll", "Play from in to out with preroll and postroll", "Playback", [](C g, V c) {
            if (autoRepeat(c)) return true;
            const double in = g.viewState()->rangeInMs();
            const double out = g.viewState()->rangeOutMs();
            g.clock()->playSpan(std::max(0.0, std::max(0.0, in) - nt::app::playbackPrerollMs()),
                                (out >= 0 ? out : sequenceEnd(g)) + nt::app::playbackPostrollMs());
            return true;
        }},
        {"playToOut", "Play from the playhead to out", "Playback", [](C g, V c) {
            if (autoRepeat(c)) return true;
            const double out = g.viewState()->rangeOutMs();
            g.clock()->playSpan(playhead(g), out >= 0 ? out : sequenceEnd(g));
            return true;
        }},
        {"extendPrevEdit", "Extend the previous edit to the playhead", "Editing", [](C g, V) { return extendEditToPlayhead(g, false); }},
        {"extendNextEdit", "Extend the next edit to the playhead", "Editing", [](C g, V) { return extendEditToPlayhead(g, true); }},
        {"slideLeft", "Slide selected clips one frame back", "Move", [](C g, V c) { return slideSelection(g, -1, c); }},
        {"slideRight", "Slide selected clips one frame on", "Move", [](C g, V c) { return slideSelection(g, 1, c); }},
        {"markSelection", "Mark the selection (in and out around it)", "Playback", [](C g, V) {
            const auto span = selectionSpan(g);
            if (!span) return false;
            g.viewState()->clearRange();
            g.viewState()->setRangeIn(span->first);
            g.viewState()->setRangeOut(span->second);
            return true;
        }},
        {"clearIn", "Clear in", "Playback", [](C g, V) { g.viewState()->setRangeIn(-1); return true; }},
        {"clearOut", "Clear out", "Playback", [](C g, V) { g.viewState()->setRangeOut(-1); return true; }},
        {"clearMarker", "Clear the marker at the playhead", "Playback", [](C g, V) {
            const double at = playhead(g);
            const double reach = frameMs(g) / 2;
            for (const auto& m : g.timeline()->markersJson()) {
                if (std::abs(m.toObject().value("timeMs").toDouble() - at) <= reach) {
                    return g.timeline()->deleteMarker(m.toObject().value("id").toString());
                }
            }
            return false;
        }},
        {"clearAllMarkers", "Clear all markers", "Playback", [](C g, V) {
            if (g.timeline()->markersJson().isEmpty()) return false;
            g.timeline()->applyEdit("clearAllMarkers", {});
            return true;
        }},
        {"expandAllTracks", "Expand all tracks (again: restore)", "Zoom & view", [](C g, V) { return zoomAllTracks(g, nt::ui::MAX_VERTICAL_ZOOM); }},
        {"minimizeAllTracks", "Minimize all tracks (again: restore)", "Zoom & view", [](C g, V) { return zoomAllTracks(g, nt::ui::MIN_VERTICAL_ZOOM); }},
        {"audioTracksTaller", "Make audio tracks taller", "Zoom & view", [](C g, V c) {
            if (!autoRepeat(c)) g.timeline()->applyEdit("changeAudioTrackHeights", {{"deltaPx", AUDIO_TRACK_HEIGHT_STEP_PX}});
            return true;
        }},
        {"audioTracksShorter", "Make audio tracks shorter", "Zoom & view", [](C g, V c) {
            if (!autoRepeat(c)) g.timeline()->applyEdit("changeAudioTrackHeights", {{"deltaPx", -AUDIO_TRACK_HEIGHT_STEP_PX}});
            return true;
        }},
        {"clipVolumeUp", "Raise clip volume by 1 dB", "Editing", [](C g, V c) { return changeVolume(g, 1, c); }},
        {"clipVolumeDown", "Lower clip volume by 1 dB", "Editing", [](C g, V c) { return changeVolume(g, -1, c); }},
        {"clipVolumeUpMore", "Raise clip volume by 6 dB", "Editing", [](C g, V c) { return changeVolume(g, LARGE_VOLUME_STEP_DB, c); }},
        {"clipVolumeDownMore", "Lower clip volume by 6 dB", "Editing", [](C g, V c) { return changeVolume(g, -LARGE_VOLUME_STEP_DB, c); }},
    };
    for (const auto& entry : entries) {
        nt::wiring::registerKeyAction({QString::fromLatin1(entry.name), QString::fromUtf8(entry.label), entry.defaultKeys, entry.handler,
                                       QString::fromUtf8(entry.group)});
    }
    return true;
}();
}  // namespace
