// The menu bar, as one table. A row names an action, its label, and what the action
// needs. Modules with their own entries register them where the action lives, as the
// markers and the dock do, with an order that places them among these groups.
#include "app/MenuRegistry.h"
#include "app/Menus/MenuContext.h"
#include "app/Menus/ShellMenus.h"
#include "edit/clipboard/ClipboardOps.h"
#include "edit/targeting/TargetingEdits.h"
#include "edit/targeting/TrackTargeting.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "edit/sourceEdit/SourceViewerState.h"
#include "ui/TimelineViewState.h"

#include <QJsonArray>
#include <QQmlEngine>
#include <QUndoStack>

#include <cmath>

namespace {
using namespace nt::app;
using namespace nt::edit;
using menu::anyTarget;
using menu::clipTargets;
using menu::gestures;
using menu::hasEditor;

struct Need {
    MenuPredicate enabled;
    QString reason;
};
struct Row {
    QString action;
    QString label;
    Need need = {};
    MenuPredicate checked = {};
    QString submenu = {};
    MenuPredicate run = {};
    QString shortcut = {};
};
struct Group {
    QString menu;
    QString group;
    int order;
    std::vector<Row> rows;
};

TimelineViewState* viewOf(const QVariantMap& c) {
    auto* g = gestures(c);
    return g ? g->viewState() : nullptr;
}
bool inSet(const QVariantMap& c) { return viewOf(c) && viewOf(c)->rangeInMs() >= 0; }
bool outSet(const QVariantMap& c) { return viewOf(c) && viewOf(c)->rangeOutMs() >= 0; }
QJsonArray markersOf(const QVariantMap& c) { return hasEditor(c) ? gestures(c)->timeline()->markersJson() : QJsonArray{}; }
bool hasClips(const QVariantMap& c) { return hasEditor(c) && !gestures(c)->timeline()->clipsJson().isEmpty(); }
bool hasSelection(const QVariantMap& c) { return !clipTargets(c).isEmpty(); }
QString option(const QVariantMap& c, const char* name) {
    auto* g = gestures(c);
    return g ? g->property(name).toString() : QString{};
}

const Need editor{hasEditor, QStringLiteral("Open a timeline first.")};
const Need selection{hasSelection, QStringLiteral("Select a clip first.")};
const Need twoClips{[](const QVariantMap& c) { return clipTargets(c).size() >= 2; }, QStringLiteral("Select two or more clips first.")};
const Need clipOrGap{[](const QVariantMap& c) {
    return hasSelection(c) || (gestures(c) && !gestures(c)->selectedGap().isEmpty());
}, QStringLiteral("Select a clip or a gap first.")};
const Need canUndo{[](const QVariantMap& c) { return hasEditor(c) && gestures(c)->timeline()->undoStack()->canUndo(); }, QStringLiteral("Nothing to undo.")};
const Need canRedo{[](const QVariantMap& c) { return hasEditor(c) && gestures(c)->timeline()->undoStack()->canRedo(); }, QStringLiteral("Nothing to redo.")};
const Need oneClip{[](const QVariantMap& c) { return clipTargets(c).size() == 1; }, QStringLiteral("Select one clip first.")};
const Need playheadOnSelectedClip{[](const QVariantMap& c) {
    const auto clips = menu::targetClips(c);
    if (clips.size() != 1 || !gestures(c)->clock()) { return false; }
    const double at = gestures(c)->clock()->currentTimeMs();
    return clipStartMs(clips.first()) <= at && at <= clipEndMs(clips.first());
}, QStringLiteral("Select one clip and move the playhead over it.")};
const Need clipboardClips{[](const QVariantMap& c) { return hasEditor(c) && nt::edit::clipboard::hasClipboardClips(); }, QStringLiteral("Copy a clip first.")};
const Need attributes{[](const QVariantMap& c) { return hasSelection(c) && nt::edit::clipboard::hasClipboardClips(); },
                      QStringLiteral("Copy a clip, then select the clips to paste onto.")};
const Need linkable{[](const QVariantMap& c) {
    return clipTargets(c).size() >= 2 || anyTarget(c, [](const QJsonObject& clip) { return !clipLinkId(clip).isEmpty(); });
}, QStringLiteral("Select two or more clips, or a linked clip.")};
const Need groupSelected{[](const QVariantMap& c) { return anyTarget(c, isGroupClip); }, QStringLiteral("Select a group first.")};
const Need withFades{[](const QVariantMap& c) {
    return anyTarget(c, [](const QJsonObject& clip) { return clip.value("fadeInMs").toDouble() > 0 || clip.value("fadeOutMs").toDouble() > 0; });
}, QStringLiteral("Select a clip with fades first.")};
const Need withTransition{[](const QVariantMap& c) {
    return anyTarget(c, [](const QJsonObject& clip) { return clip.value("transitionIn").toObject().value("durationMs").toDouble() > 0; });
}, QStringLiteral("Select a clip with a transition first.")};
const Need withAsset{[](const QVariantMap& c) {
    return anyTarget(c, [](const QJsonObject& clip) { return !clip.value("currentAssetId").toString().isEmpty(); });
}, QStringLiteral("Select a clip that has media in the Library.")};
// matchFrame.ts: the clip under the playhead on a targeted track that has an asset.
const Need assetAtPlayhead{[](const QVariantMap& c) {
    auto* g = gestures(c);
    if (!g || !g->timeline() || !g->clock()) { return false; }
    const auto doc = g->editDoc();
    const auto targeted = nt::targeting::targetedTrackIds(doc, nt::targeting::TrackTargeting::current().state());
    const double at = g->clock()->currentTimeMs();
    return std::any_of(doc.clips.begin(), doc.clips.end(), [&](const QJsonObject& clip) {
        return targeted.contains(clipTrackId(clip)) && !clip.value("currentAssetId").toString().isEmpty() &&
            clipStartMs(clip) <= at && at < clipEndMs(clip);
    });
}, QStringLiteral("Move the playhead over a clip that has media in the Library.")};
const Need editPoint{[](const QVariantMap& c) { return gestures(c) && !gestures(c)->selectedEdit().isEmpty(); }, QStringLiteral("Click a clip edge first.")};
const Need in{inSet, QStringLiteral("Set an In point first.")};
const Need out{outSet, QStringLiteral("Set an Out point first.")};
const Need inAndOut{[](const QVariantMap& c) { return inSet(c) && outSet(c); }, QStringLiteral("Set In and Out points first.")};
const Need inOrOut{[](const QVariantMap& c) { return inSet(c) || outSet(c); }, QStringLiteral("Set an In or Out point first.")};
const Need clipToMark{menu::canMarkClip, QStringLiteral("Select a clip, or move the playhead over one.")};
const Need anyMarker{[](const QVariantMap& c) { return !markersOf(c).isEmpty(); }, QStringLiteral("Add a marker first.")};
const Need sequenceClips{hasClips, QStringLiteral("Add a clip to the timeline first.")};
const Need sourceRange{[](const QVariantMap& c) {
    auto* g = gestures(c);
    auto* engine = g ? qmlEngine(g) : nullptr;
    auto* source = engine ? engine->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState") : nullptr;
    return source && !source->asset().value("id").toString().isEmpty();
}, QStringLiteral("Open a clip in Source first.")};

bool allTargets(const QVariantMap& c, const std::function<bool(const QJsonObject&)>& test) {
    const auto clips = menu::targetClips(c);
    return !clips.isEmpty() && std::all_of(clips.begin(), clips.end(), test);
}
MenuPredicate toolIs(const QString& tool) {
    return [tool](const QVariantMap& c) { return option(c, "activeTool") == tool; };
}
MenuPredicate clockFlag(bool (PlaybackClock::*read)() const) {
    return [read](const QVariantMap& c) { return gestures(c) && gestures(c)->clock() && (gestures(c)->clock()->*read)(); };
}
bool clipEnabled(const QJsonObject& clip) {
    const auto type = clip.value("mediaType").toString();
    return !clip.value(type == "audio" || type == "midi" ? "muted" : "hidden").toBool();
}

std::vector<Group> table() {
    return {
        {"Edit", "history", 0, {{"undo", "Undo", canUndo}, {"redo", "Redo", canRedo}}},
        {"Edit", "clipboard", 10, {{"cut", "Cut", selection}, {"copy", "Copy", selection}, {"paste", "Paste", clipboardClips},
                                   {"pasteInsert", "Paste Insert", clipboardClips}, {"pasteAttributes", "Paste Attributes…", attributes}}},
        {"Edit", "delete", 20, {{"deleteSelected", "Delete", clipOrGap}, {"rippleDeleteSelected", "Ripple Delete", clipOrGap}, {"duplicate", "Duplicate", selection},
                                {"duplicateWithGap", "Duplicate with Gap", selection}}},
        {"Edit", "select", 30, {{"selectAll", "Select All", sequenceClips}, {"deselectAll", "Deselect All", selection},
                                {"selectClipAtPlayhead", "Select Clips at Playhead", sequenceClips},
                                {"selectNextClip", "Select Next Clip", sequenceClips}, {"selectPrevClip", "Select Previous Clip", sequenceClips}}},

        // Clip, in the order of a Premiere menu. Each module's entries use the orders of these
        // groups: options 0 to 14, framing 15 to 16, remix 30, takes 60.
        {"Clip", "options", 5, {{"audioGain", "Audio Gain…", selection, {}, "Audio Options"}}},
        {"Clip", "options", 13, {{"speedDuration", "Speed / Duration…", selection}}},
        {"Clip", "source", 20, {{"sourceInsert", "Insert", sourceRange}, {"sourceOverwrite", "Overwrite", sourceRange}, {"sourceAppend", "Append to End", sourceRange}}},
        {"Clip", "state", 40, {{"toggleClipEnabled", "Enable", selection, [](const QVariantMap& c) { return allTargets(c, clipEnabled); }},
                               {"linkClips", "Link", linkable, [](const QVariantMap& c) { return allTargets(c, [](const QJsonObject& clip) { return !clipLinkId(clip).isEmpty(); }); }},
                               {"groupClips", "Group", twoClips}, {"ungroupClips", "Ungroup", groupSelected},
                               {"toggleClipLock", "Lock", selection, [](const QVariantMap& c) { return allTargets(c, [](const QJsonObject& clip) { return clip.value("locked").toBool(); }); }}}},
        {"Clip", "keyframes", 50, {{"addKeyframe", "Add or Remove Keyframe", playheadOnSelectedClip, {}, "Keyframes"},
                                   {"nextKeyframe", "Next Keyframe", oneClip, {}, "Keyframes"}, {"prevKeyframe", "Previous Keyframe", oneClip, {}, "Keyframes"}}},
        {"Clip", "reveal", 70, {{"revealInProject", "Reveal in Library", withAsset, {}, {}, [](const QVariantMap& c) {
            auto* g = gestures(c);
            return g && g->runAction("revealInProject", {{"clipIds", clipTargets(c)}});
        }}}},

        {"Sequence", "match", 0, {{"matchFrame", "Match Frame", assetAtPlayhead}}},
        {"Sequence", "edit", 10, {{"splitAtPlayhead", "Add Edit", sequenceClips}, {"cutAllTracks", "Add Edit to All Tracks", sequenceClips}}},
        {"Sequence", "text", 12, {{"addTextAtPlayhead", "Add Text at Playhead", editor}}},
        // The trim module's own entries use orders 15 to 17.
        {"Sequence", "Trim", 18, {{"extendEdit", "Extend Selected Edit to Playhead", editPoint},
                                  {"extendPrevEdit", "Extend Previous Edit to Playhead", sequenceClips},
                                  {"extendNextEdit", "Extend Next Edit to Playhead", sequenceClips},
                                  {"rippleTrimPrevToPlayhead", "Ripple Trim Previous Edit to Playhead", sequenceClips},
                                  {"rippleTrimNextToPlayhead", "Ripple Trim Next Edit to Playhead", sequenceClips}}},
        {"Sequence", "transition", 20, {{"applyDefaultTransition", "Apply Video Transition", selection},
                                        {"applyDefaultAudioTransition", "Apply Audio Transition", selection},
                                        {"removeTransition", "Remove Transition", withTransition},
                                        {"applyFades", "Fade In and Out", selection}, {"removeFades", "Remove Fades", withFades}}},
        {"Sequence", "range", 30, {{"liftRange", "Lift", inAndOut}, {"extractRange", "Extract", inAndOut}}},
        {"Sequence", "zoom", 40, {{"zoomIn", "Zoom In", editor}, {"zoomOut", "Zoom Out", editor}, {"zoomFit", "Zoom to Fit Content", editor}, {"zoomSelection", "Zoom to Selection", selection}}},
        {"Sequence", "gap", 50, {{"nextGap", "Next in Sequence", sequenceClips, {}, "Go to Gap"}, {"prevGap", "Previous in Sequence", sequenceClips, {}, "Go to Gap"}}},
        {"Sequence", "tools", 60, {{"selectTool", "Select", editor, toolIs("select"), "Tools"},
                                   {"trackSelectTool", "Track Select Forward", editor, toolIs("trackSelect"), "Tools"},
                                   {"trackSelectBackwardTool", "Track Select Backward", editor, toolIs("trackSelectBackward"), "Tools"},
                                   {"rippleTool", "Ripple Edit", editor, toolIs("ripple"), "Tools"},
                                   {"rollTool", "Rolling Edit", editor, toolIs("roll"), "Tools"},
                                   {"rateStretchTool", "Rate Stretch", editor, toolIs("rateStretch"), "Tools"},
                                   {"cutTool", "Cut (Blade)", editor, toolIs("cut"), "Tools"},
                                   {"slipTool", "Slip", editor, toolIs("slip"), "Tools"},
                                   {"slideTool", "Slide", editor, toolIs("slide"), "Tools"},
                                   {"handTool", "Hand", editor, toolIs("hand"), "Tools"},
                                   {"zoomTool", "Zoom", editor, toolIs("zoom"), "Tools"}}},
        {"Sequence", "options", 70, {{"toggleSnap", "Snap in Timeline", editor, [](const QVariantMap& c) { return gestures(c) && gestures(c)->snapEnabled(); }},
                                     {"sequence.linkedSelection", "Linked Selection", editor, [](const QVariantMap& c) { return gestures(c) && gestures(c)->linkedSelection(); }, {},
                                      [](const QVariantMap& c) { auto* g = gestures(c); if (!g) { return false; } g->setLinkedSelection(!g->linkedSelection()); return true; }}}},

        // Markers: the module's own entries use orders 10 to 50.
        {"Markers", "mark", 1, {{"markIn", "Mark In", editor}, {"markOut", "Mark Out", editor}, {"markClip", "Mark Clip", clipToMark}, {"markSelection", "Mark Selection", selection}}},
        {"Markers", "goToMark", 5, {{"goToIn", "Go to In", in}, {"goToOut", "Go to Out", out}}},
        {"Markers", "clearMark", 7, {{"clearIn", "Clear In", in}, {"clearOut", "Clear Out", out}, {"clearRange", "Clear In and Out", inOrOut}}},
        {"Markers", "add", 9, {{"addMarker", "Add Marker", editor}}},
        {"Markers", "goToMarker", 15, {{"nextMarker", "Go to Next Marker", anyMarker}, {"prevMarker", "Go to Previous Marker", anyMarker}}},

        {"View", "tracks", 20, {{"expandTracks", "Make Tracks Taller", editor}, {"shrinkTracks", "Make Tracks Shorter", editor},
                                {"expandAllTracks", "Expand All Tracks", editor}, {"minimizeAllTracks", "Minimize All Tracks", editor},
                                {"audioTracksTaller", "Make Audio Tracks Taller", editor}, {"audioTracksShorter", "Make Audio Tracks Shorter", editor}}},

        {"Playback", "play", 0, {{"playPause", "Play / Pause", editor, {}, {}, [](const QVariantMap& c) {
                                     auto* g = gestures(c);
                                     if (!g || !g->clock()) { return false; }
                                     g->clock()->toggle();
                                     return true;
                                 }, "Space"},
                                 {"playInToOut", "Play In to Out", editor},
                                 {"playInToOutWithRoll", "Play In to Out with Preroll/Postroll", editor},
                                 {"playToOut", "Play to Out", editor}, {"playAround", "Play Around", editor},
                                 {"toggleLoop", "Loop", editor, clockFlag(&PlaybackClock::loop)}}},
        {"Playback", "shuttle", 10, {{"shuttleBack", "Shuttle Left", editor}, {"shuttleStop", "Shuttle Stop", editor}, {"shuttleForward", "Shuttle Right", editor},
                                     {"slowShuttleBack", "Shuttle Slow Left", editor}, {"slowShuttleForward", "Shuttle Slow Right", editor}}},
        {"Playback", "step", 20, {{"stepFrameBack", "Step Back 1 Frame", editor}, {"stepFrameForward", "Step Forward 1 Frame", editor},
                                  {"stepFramesBack", "Step Back 5 Frames", editor}, {"stepFramesForward", "Step Forward 5 Frames", editor}}},
        {"Playback", "goTo", 30, {{"prevCut", "Go to Previous Edit Point", editor}, {"nextCut", "Go to Next Edit Point", editor},
                                  {"prevCutAnyTrack", "Go to Previous Edit on Any Track", editor}, {"nextCutAnyTrack", "Go to Next Edit on Any Track", editor},
                                  {"goToSequenceStart", "Go to Sequence Start", editor}, {"goToSequenceEnd", "Go to Sequence End", editor},
                                  {"goToSelectedStart", "Go to Selection Start", selection}, {"goToSelectedEnd", "Go to Selection End", selection}}},

        {"Help", "help", 0, {{"toggleShortcuts", "Keyboard Shortcuts", editor}}},
    };
}

const bool registered = [] {
    for (const auto& group : table()) {
        int order = group.order;
        for (const auto& row : group.rows) {
            const Need& need = row.need.enabled ? row.need : editor;
            registerShellMenuItem({group.menu, row.action, row.label, row.shortcut, row.submenu, group.group, order++,
                                   need.enabled, row.checked, row.run, need.reason});
        }
    }
    return true;
}();
}  // namespace
