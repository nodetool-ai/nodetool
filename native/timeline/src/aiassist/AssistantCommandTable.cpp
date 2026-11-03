#include "aiassist/AssistantCommandTable.h"
#include "edit/ClipGestureController.h"
#include "markers/MarkerOps.h"

#include <algorithm>

namespace nt::aiassist::commands {
namespace {
using P = Param;
const P clipIds{"clip_ids", ParamKind::Selection, false, "Clips to act on. They become the selection. Defaults to the current selection."};
const P atMs{"atMs", ParamKind::Playhead, false, "Move the playhead here first, in timeline ms. Defaults to where it is.", {}, {}, 0};
const P inMs{"inMs", ParamKind::RangeIn, false, "Set the In point here first, in timeline ms.", {}, {}, 0};
const P outMs{"outMs", ParamKind::RangeOut, false, "Set the Out point here first, in timeline ms.", {}, {}, 0};
const P gapTrack{"gap_track_id", ParamKind::GapTrack, false, "With gap_at_ms: select the gap on this track instead of clips."};
const P gapAt{"gap_at_ms", ParamKind::GapTime, false, "A time inside the gap, in timeline ms.", {}, {}, 0};
const P editClip{"clip_id", ParamKind::EditClip, false, "With edge: the edit point to work on."};
const P editEdge{"edge", ParamKind::EditEdge, false, "Which edge of clip_id.", {"start", "end"}};
const P markerId{"marker_id", ParamKind::ContextMarker, false, "The marker. Defaults to the selected markers, else the one at the playhead.", {}, "markerId"};
// One day. Large enough for any edit, and small enough not to overflow a later calculation.
constexpr double MAX_LENGTH_MS = 86400000;
const QList<P> clips{clipIds};
const QList<P> seek{atMs};
const QList<P> clipsAtTime{clipIds, atMs};
const QList<P> editPoint{editClip, editEdge};
const QList<P> range{inMs, outMs};

const P clip{"clip_id", ParamKind::ClipId, true, "The clip.", {}, "clipId"};
const P edge{"edge", ParamKind::Choice, true, "Which edge of the clip.", {"start", "end"}};
const P delta{"deltaMs", ParamKind::Number, true, "How far to move the edge, in timeline ms. Positive is later."};
const P track{"track_id", ParamKind::TrackId, true, "The track.", {}, "trackId"};

QString need(ClipGestureController& g, bool ok, const char* reason) { return g.timeline() && ok ? QString{} : QString::fromUtf8(reason); }
const Need selected = [](ClipGestureController& g) { return need(g, !g.selection().isEmpty(), "Select a clip first."); };
const Need atEditPoint = [](ClipGestureController& g) {
    return need(g, !g.selectedEdit().isEmpty(), "Pass clip_id and edge, or select an edit point first.");
};
// A clip's own lock can be toggled, but a locked track holds its clips.
const Need onUnlockedTrack = [](ClipGestureController& g) {
    const auto doc = g.editDoc();
    const auto locked = nt::edit::lockedTrackIds(doc);
    const bool blocked = std::ranges::any_of(doc.clips, [&](const QJsonObject& clip) {
        return g.selection().contains(nt::edit::clipId(clip)) && locked.contains(nt::edit::clipTrackId(clip));
    });
    return need(g, !blocked, "That clip's track is locked. Unlock the track first.");
};

// Commands of one family, for ids that differ by a suffix.
QStringList family(const QString& prefix, const QStringList& suffixes) {
    QStringList out;
    for (const auto& suffix : suffixes) { out.append(prefix + suffix); }
    return out;
}
QStringList markerColors() {
    QStringList out{"none"};
    for (const auto& color : nt::markers::colors()) { out.append(color.id); }
    return out;
}
QStringList numbered(const QString& prefix, int last) {
    QStringList out;
    for (int i = 1; i <= last; ++i) { out.append(prefix + QString::number(i)); }
    return out;
}

QList<Command> buildAllowed() {
    QList<Command> out;
    const auto action = [&out](const QString& id, const QList<P>& params = {}, const Need& requirement = {}) {
        out.append(Command{id, Runs::Action, params, {}, requirement});
    };
    const auto actions = [&action](const QStringList& ids, const QList<P>& params = {}, const Need& requirement = {}) {
        for (const auto& id : ids) { action(id, params, requirement); }
    };
    const auto edit = [&out](const QString& id, const QString& label, const QList<P>& params) -> Command& {
        out.append(Command{id, Runs::Edit, params, label});
        return out.last();
    };

    // History and clipboard.
    actions({"undo", "redo"});
    actions({"cut", "copy"}, clips);
    actions({"paste", "pasteInsert"}, seek);
    // Delete: the selection, or a gap.
    actions({"deleteSelected", "rippleDeleteSelected"}, {clipIds, gapTrack, gapAt});
    actions({"duplicate", "duplicateWithGap"}, clips);
    // Selection.
    actions({"selectAll", "deselectAll"});
    action("selectClipAtPlayhead", seek);
    actions({"selectNextClip", "selectPrevClip"}, clips);
    // Clip state, transitions, fades, labels and framing.
    action("toggleClipLock", clips, onUnlockedTrack);
    actions({"toggleClipEnabled", "linkClips", "groupClips", "ungroupClips", "applyDefaultTransition",
             "applyDefaultAudioTransition", "removeTransition", "applyFades", "removeFades", "fitToFrame", "fillFrame"}, clips);
    actions(family("clipLabel.", markerColors()), clips);
    actions({"nudgeLeft", "nudgeRight", "nudgeLeftLarge", "nudgeRightLarge", "slideLeft", "slideRight"}, clips, selected);
    // Audio.
    actions({"clipVolumeUp", "clipVolumeDown", "clipVolumeUpMore", "clipVolumeDownMore"}, clips, selected);
    actions(family("audioRole.", {"dialogue", "music", "sfx", "ambience", "none"}), clips);
    for (const auto* id : {"matchLoudness", "duckMusic"}) {
        action(id, clips);
        out.last().background = true;
    }
    action("assist.removeFillers");
    // Keyframes on the selected clip.
    action("addKeyframe", clipsAtTime);
    actions({"nextKeyframe", "prevKeyframe"}, clips);
    // Cuts and trims at the playhead.
    action("splitAtPlayhead", clipsAtTime);
    action("cutAllTracks", seek);
    action("extendEdit", {editClip, editEdge, atMs});
    actions({"extendPrevEdit", "extendNextEdit", "rippleTrimPrevToPlayhead", "rippleTrimNextToPlayhead"}, seek);
    actions({"trimEditLeft", "trimEditRight", "trimEditLeftLarge", "trimEditRightLarge"}, editPoint, atEditPoint);
    // In and Out.
    actions({"liftRange", "extractRange"}, range);
    // Both clear the range and move the playhead even when locks stop the edit.
    out[out.size() - 1].mustChange = out[out.size() - 2].mustChange = true;
    actions({"markIn", "markOut"}, seek);
    actions({"markClip", "markSelection"}, clips);
    actions({"goToIn", "goToOut", "clearIn", "clearOut", "clearRange"});
    // Markers.
    actions({"addMarker", "addRangeMarker", "clearMarker"}, seek);
    action("addMarkerInOut", range);
    actions({"nextMarker", "prevMarker", "clearAllMarkers"});
    actions(family("markerColor.", markerColors()), {markerId});
    action("clearSelectedMarkers", {markerId});
    // Clips and gaps a track names.
    const P contextTrack{"track_id", ParamKind::ContextTrack, true, "The track.", {}, "trackId"};
    const P contextTime{"timeMs", ParamKind::ContextTime, true, "The time on the track, in timeline ms.", {}, "timeMs", 0};
    actions({"closeGapAt", "addText"}, {contextTrack, contextTime});
    // Takes that exist already. Generating a take goes through its own review step.
    actions(numbered("takeSwitch", 9), clips);
    actions(numbered("takeCut", 9), clipsAtTime);
    action("takeGrid");
    // The Source monitor.
    actions({"sourceInsert", "sourceOverwrite", "sourceAppend"}, seek);
    action("matchFrame", seek);
    action("revealInProject", clips);
    // Moving the playhead.
    actions({"stepFrameBack", "stepFrameForward", "stepFramesBack", "stepFramesForward", "prevCut", "nextCut", "prevCutAnyTrack",
             "nextCutAnyTrack", "goToSequenceStart", "goToSequenceEnd", "nextGap", "prevGap"});
    actions({"goToSelectedStart", "goToSelectedEnd"}, clips);
    // The view.
    actions({"zoomIn", "zoomOut", "zoomFit", "zoomSelection", "expandTracks", "shrinkTracks", "expandAllTracks", "minimizeAllTracks", "audioTracksTaller",
             "audioTracksShorter", "toggleTimecodeRuler", "nextPanel", "prevPanel", "toggleLeftPanels", "toggleRightPanels", "toggleDawMode"});
    actions(family("panel", {"Assets", "Effects", "Source", "Timeline", "Program", "Reference", "Inspector", "Mixer", "Audio", "Script", "Storyboard",
                             "Text", "EffectControls", "Motion", "Color", "Scopes", "Entities", "Markers", "Assistant", "Ai", "Activity"}));
    actions(numbered("workspace", 6));
    actions(family("monitorZoom", {"Fit", "10", "25", "50", "75", "100", "150", "200", "400", "800", "1600"}));
    actions({"monitorDisplayComposite", "monitorDisplayAlpha", "monitorDisplay:comparison", "monitorDisplay:takes", "monitorShowControls",
             "monitorSafeMargins", "monitorTransparencyGrid", "monitorRulers", "monitorGuides", "monitorLockGuides", "monitorClearGuides"});
    // The reference monitor.
    action("setReferenceFrame", seek);
    const P contextClip{"clip_id", ParamKind::ContextClip, false, "The clip. Defaults to the one selected clip.", {}, "clipId"};
    actions({"referenceClipFirstFrame", "referenceClipLastFrame", "referenceClipTake"}, {contextClip});
    action("referenceMarker", {P{"marker_id", ParamKind::ContextMarker, true, "The marker.", {}, "markerId"}});

    // An action on the selected clips returns true when it refuses them, so its result is whether
    // the document changed. Those that only read or move the view don't count.
    static const QStringList reads{"copy", "selectNextClip", "selectPrevClip", "markClip", "markSelection", "goToSelectedStart", "goToSelectedEnd", "revealInProject",
                                   "nextKeyframe", "prevKeyframe", "toggleClipLock"};
    for (auto& command : out) {
        const bool onSelection = std::ranges::any_of(command.params, [](const P& param) { return param.kind == ParamKind::Selection; });
        if (onSelection && !reads.contains(command.id)) {
            command.editsSelection = true;
            command.mustChange = !command.background;
        }
    }

    // Headless forms: the same edits a gesture or dialog makes, with typed parameters.
    edit("trimClipStart", "Trim clip start", {clip, delta}).linked = true;
    {
        auto& c = edit("trimClipEnd", "Trim clip end", {clip, delta});
        c.linked = c.sourceLimit = true;
    }
    edit("rippleTrimClipStart", "Ripple trim clip start", {clip, delta}).linked = true;
    {
        auto& c = edit("rippleTrimClipEnd", "Ripple trim clip end", {clip, delta});
        c.linked = c.sourceLimit = true;
    }
    {
        auto& c = edit("rollClipEdge", "Roll edit", {clip, edge, delta});
        c.linked = c.sourceLimit = true;
    }
    {
        auto& c = edit("slipClip", "Slip clip", {clip, P{"sourceDeltaMs", ParamKind::Number, true, "How far to move the source under the clip, in source ms."}});
        c.linked = c.sourceLimit = true;
    }
    edit("slideClip", "Slide clip", {clip, P{"deltaMs", ParamKind::Number, true, "How far to move the clip between its neighbours, in timeline ms."}}).linked = true;
    edit("rateStretchClip", "Rate stretch clip", {clip, edge, P{"durationMs", ParamKind::Number, true, "The clip's new length in ms.", {}, {}, 1, MAX_LENGTH_MS}}).linked = true;
    edit("moveClip", "Move clip", {clip, P{"deltaMs", ParamKind::Number, true, "How far to move the clip, in timeline ms."},
                                   P{"to_track_id", ParamKind::TrackId, false, "Move it to this track.", {}, "toTrackId"}}).linked = true;
    edit("splitClipAtTime", "Split clip at a time", {clip, P{"atMs", ParamKind::Number, true, "Where to split, in timeline ms.", {}, {}, 0}});
    edit("setClipTransition", "Set the transition into a clip",
         {clip, P{"mode", ParamKind::Choice, true, "The transition. auto removes it.", {"auto", "none", "crossfade", "dipToColor", "wipe", "push", "slide", "zoom"}}})
        .sourceLimits = true;
    edit("setTransitionDuration", "Set a transition's length", {clip, P{"durationMs", ParamKind::Number, true, "The length in ms.", {}, {}, 0}}).sourceLimits = true;
    const P speed{"speed", ParamKind::Number, true, "Speed multiplier. 2 is twice as fast.", {}, "speedMultiplier", 0.01, 100};
    edit("setClipSpeed", "Set clip speed", {clip, speed, P{"ripple", ParamKind::Boolean, false, "Move later clips to follow the new length."}}).linked = true;
    edit("setClipsSpeed", "Set the speed of several clips", {P{"clip_ids", ParamKind::ClipIds, true, "The clips.", {}, "clipIds"}, speed}).linked = true;
    edit("setClipsGain", "Set audio gain", {P{"clip_ids", ParamKind::ClipIds, true, "The clips.", {}, "selectedIds"}, P{"db", ParamKind::Number, true, "Gain in dB.", {}, {}, -96, 24},
                                            P{"mode", ParamKind::Choice, false, "adjust adds to the current gain. set replaces it. Defaults to adjust.", {"adjust", "set"}}})
        .fixed = {{"mode", "adjust"}};
    edit("setClipAudio", "Set a clip's fade", {clip, P{"field", ParamKind::Choice, true, "Which fade. For volume use setClipsGain.", {"fadeInMs", "fadeOutMs"}},
                                               P{"value", ParamKind::Number, true, "Its length in ms.", {}, {}, 0, MAX_LENGTH_MS}});
    edit("patchClip", "Set clip properties",
         {clip, P{"patch", ParamKind::Patch, true, "Fields to set. textStyle changes only the fields it names. For position, scale and rotation use keyframes.input.",
                  {"name", "labelColor", "speaker", "opacity", "blendMode", "hidden", "muted", "borderRadius", "textStyle"}}});
    // Tracks.
    const P trackType{"type", ParamKind::Choice, true, "The kind of track.", {"video", "audio", "overlay"}};
    const P trackName{"name", ParamKind::Text, false, "Its name."};
    edit("addTrack", "Add a track at the end", {trackType, trackName});
    edit("insertTrack", "Insert a track", {trackType, trackName, P{"atIndex", ParamKind::Number, true, "Where it goes among the tracks, from 0.", {}, {}, 0}});
    edit("duplicateTrack", "Duplicate a track", {track});
    edit("removeTrack", "Remove a track and its clips", {track});
    edit("reorderTracks", "Reorder tracks", {P{"track_ids", ParamKind::TrackIds, true, "Every track id, in the new order.", {}, "orderedIds"}});
    edit("setTrackName", "Name a track", {track, P{"name", ParamKind::Text, true, "The name."}});
    edit("setTrackHeight", "Set a track's height", {track, P{"heightPx", ParamKind::Number, true, "The height in pixels.", {}, {}, 24, 1000}});
    edit("setTrackVisible", "Show or hide a track", {track, P{"visible", ParamKind::Boolean, true}});
    edit("setTrackLocked", "Lock or unlock a track", {track, P{"locked", ParamKind::Boolean, true}});
    edit("setTrackMuted", "Mute or unmute a track", {track, P{"muted", ParamKind::Boolean, true}});
    edit("setTrackSolo", "Solo a track", {track, P{"solo", ParamKind::Boolean, true}});
    const P db{"db", ParamKind::Number, true, "Volume in dB.", {}, {}, -120, 24};
    edit("setTrackVolume", "Set a track's volume", {track, db});
    edit("setTrackPan", "Set a track's pan", {track, P{"pan", ParamKind::Number, true, "-1 is left, 1 is right.", {}, {}, -1, 1}});
    edit("setMasterVolume", "Set the master volume", {db});
    // Effects by name, with their default values.
    const P effect{"effect", ParamKind::Text, true, "The effect's name, such as eq3."};
    const P effectId{"effect_id", ParamKind::EffectId, true, "The effect's id from the document.", {}, "effectId"};
    edit("addTrackEffect", "Add a track effect", {track, effect});
    edit("removeTrackEffect", "Remove a track effect", {track, effectId});
    edit("addMasterEffect", "Add a master effect", {effect});
    edit("removeMasterEffect", "Remove a master effect", {effectId});
    edit("addClipAudioEffect", "Add a clip audio effect", {clip, P{"type", ParamKind::Text, true, "The effect's type, such as eq3."}});
    edit("removeClipAudioEffect", "Remove a clip audio effect", {clip, effectId});
    // Markers with their text.
    const P markers{"marker_ids", ParamKind::MarkerIds, true, "The markers.", {}, "ids"};
    edit("markers.add", "Add a marker with details", {P{"timeMs", ParamKind::Number, true, "Where, in timeline ms.", {}, {}, 0}, P{"label", ParamKind::Text, false}, P{"note", ParamKind::Text, false},
                                                     P{"color", ParamKind::Text, false, "A CSS colour."}, P{"durationMs", ParamKind::Number, false, "Length of a range marker.", {}, {}, 0}})
        .fixed = {{"author", "Assistant"}};
    edit("markers.update", "Change markers", {markers, P{"patch", ParamKind::Patch, true, "Fields to set. A time or duration needs a single marker.", {"label", "note", "color", "timeMs", "durationMs"}}});
    edit("markers.remove", "Remove markers", {markers});
    // Keyframes, in ms from the clip's start.
    const P row{"row", ParamKind::Text, true, "The property row: position, scale, rotation, anchor, rotationX, rotationY, perspective, depth, opacity, cropLeft, cropTop, cropRight, cropBottom or borderRadius, volume on a sound clip, cameraOrbit, cameraFov or cameraZoom on a 3D clip, or effect:<effectId>:<param> for a numeric parameter of a video effect from the Effects panel. Colors, switches, tone curves, Color panel grades and the analysis settings of Stabilization and Deflicker have no keys."};
    const P clipTime{"atMs", ParamKind::Number, true, "Time from the clip's start, in ms.", {}, {}, 0};
    edit("keyframes.toggle", "Add or remove a keyframe", {clip, row, clipTime});
    edit("keyframes.input", "Set a property's value", {clip, row, P{"input", ParamKind::Number, true, "Which value of the row, from 0.", {}, {}, 0}, P{"value", ParamKind::Number, true},
                                                       P{"atMs", ParamKind::Number, false, "Time from the clip's start, in ms.", {}, {}, 0}});
    edit("keyframes.delete", "Delete a keyframe", {clip, row, clipTime});
    // Captions, by the first word and word count of the cue.
    const P firstWord{"firstWord", ParamKind::Number, true, "The index of the cue's first word.", {}, {}, 0};
    const P wordCount{"wordCount", ParamKind::Number, true, "How many words the cue has.", {}, {}, 1};
    edit("captions.setText", "Change a caption's text", {clip, firstWord, wordCount, P{"text", ParamKind::Text, true}});
    edit("captions.setTimes", "Change a caption's times", {clip, firstWord, wordCount, P{"startMs", ParamKind::Number, true, "Start in timeline ms.", {}, {}, 0},
                                                            P{"endMs", ParamKind::Number, true, "End in timeline ms.", {}, {}, 0}});
    edit("captions.split", "Split a caption", {clip, firstWord, wordCount, P{"atWord", ParamKind::Number, true, "The word the second part starts with.", {}, {}, 0}});
    edit("captions.merge", "Merge a caption with the next", {clip, firstWord, wordCount});
    edit("captions.delete", "Delete a caption", {clip, firstWord, wordCount});
    edit("captions.add", "Add a caption to the clip under a time", {P{"text", ParamKind::Text, true}, P{"atMs", ParamKind::Number, true, "Where, in timeline ms. The clip with captions there gets it.", {}, {}, 0},
                                                                    P{"durationMs", ParamKind::Number, false, "Its length in ms.", {}, {}, 1, MAX_LENGTH_MS}});
    // Frame holds, without their dialogs.
    const P holdClips{"clip_ids", ParamKind::ClipIds, true, "The clips.", {}, "clipIds"};
    edit("frameHold.add", "Hold a frame until the clip's end", {holdClips, P{"atMs", ParamKind::Number, true, "The frame to hold, in timeline ms.", {}, {}, 0}});
    edit("frameHold.insertSegment", "Insert a frame hold", {clip, P{"atMs", ParamKind::Number, true, "Where, in timeline ms.", {}, {}, 0},
                                                            P{"durationMs", ParamKind::Number, true, "How long to hold, in ms.", {}, {}, 1, MAX_LENGTH_MS}});
    edit("frameHold.options", "Set frame hold options", {holdClips, P{"enabled", ParamKind::Boolean, false, "False removes the hold."},
                                                         P{"holdOn", ParamKind::Choice, false, "Which frame to hold.", {"in", "out", "playhead", "sequenceTime", "sourceTime"}},
                                                         P{"playheadMs", ParamKind::Number, false, "With holdOn playhead, in timeline ms.", {}, {}, 0},
                                                         P{"timeMs", ParamKind::Number, false, "With holdOn sequenceTime or sourceTime, in ms.", {}, {}, 0}});
    // Crop and the sequence's picture.
    edit("setClipCropEdge", "Crop one edge of a clip", {clip, P{"edge", ParamKind::Choice, true, "The edge.", {"left", "right", "top", "bottom"}},
                                                        P{"value", ParamKind::Number, true, "How much to crop, from 0 to about 0.95.", {}, {}, 0, 1}});
    edit("clearClipReframe", "Clear a clip's reframe", {clip});
    edit("setProjectSettings", "Set the sequence size and frame rate",
         {P{"width", ParamKind::Number, true, "Width in pixels.", {}, {}, 16, 7680}, P{"height", ParamKind::Number, true, "Height in pixels.", {}, {}, 16, 7680},
          P{"fps", ParamKind::Number, true, "Frames per second.", {}, {}, 1, 240}});
    return out;
}

QHash<QString, QString> buildDenied() {
    QHash<QString, QString> out;
    const auto deny = [&out](const QStringList& ids, const QString& reason) {
        for (const auto& id : ids) { out.insert(id, reason); }
    };
    const QString files = "it writes files or reads ones the Assistant didn't choose";
    const QString paid = "it opens the panel that starts paid or long-running generation, which stays behind its review step";
    const QString settings = "it changes an editor setting, not the document or the view";
    const QString playback = "it starts playback. Pass atMs to a command, or use ui_timeline_capture_frame, to look at a time";
    const QString tool = "it changes the pointer tool, which only affects mouse gestures. Use the trim commands";
    const QString dialog = "it opens a dialog";
    const QString gesture = "it belongs to a mouse gesture";
    const QString internal = "it is a step inside another command or a server sync, not a command of its own";
    const QString window = "it covers or rearranges the window in a way the person has to undo by hand";
    deny({"exportVideo", "quickExport", "exportFrame", "exportPremiere", "importPremiere", "exportMarkersCsv"}, files);
    deny({"remixClip", "sceneEditDetection"}, paid);
    deny({"revertRemix"}, "it runs through the remix panel, which a person drives");
    deny({"toggleSnap", "sequence.linkedSelection", "toggleLoop", "toggleScrubAudio", "toggleShuttleKeepsPitch", "toggleLibraryScrub"}, settings);
    deny(family("monitorPlaybackResolution", {"1", "2", "4", "8"}) + family("monitorPausedResolution", {"1", "2", "4", "8"}), settings);
    deny({"playPause", "playInToOut", "playInToOutWithRoll", "playToOut", "playAround", "shuttleBack", "shuttleStop", "shuttleForward", "slowShuttleBack", "slowShuttleForward"}, playback);
    deny({"selectTool", "trackSelectTool", "trackSelectBackwardTool", "rippleTool", "rollTool", "rateStretchTool", "cutTool", "slipTool", "slideTool", "handTool", "zoomTool"}, tool);
    deny({"selectEditPoint", "rollCut", "disableSnapping", "insertOnDrop", "escape"}, gesture);
    deny(family("editPoint.", {"rippleIn", "rippleOut", "roll", "trimIn", "trimOut"}), tool);
    deny({"selectNearestEditPoint", "toggleTrimType", "exitTrimMode", "monitorDisplay:trim"}, "it enters trim mode, which needs a person at the keys. Use the trim commands");
    deny({"takeRecord"}, "it records live take switches during playback");
    deny({"toggleShortcuts", "projectSettings"}, dialog);
    deny({"pasteAttributes"}, dialog);
    deny({"audioGain"}, dialog + ". Use setClipsGain");
    deny({"speedDuration"}, dialog + ". Use setClipSpeed");
    deny({"frameHoldOptions"}, dialog + ". Use frameHold.options");
    deny({"frameHoldInsert"}, dialog + ". Use frameHold.insertSegment");
    deny({"frameHoldAdd"}, "it reports through a banner meant for a person. Use frameHold.add");
    deny({"editMarker"}, dialog + ". Use markers.update");
    deny({"resetWorkspace", "maximizePanel", "toggleProgramFullscreen"}, window);
    // Steps of other features. An edit with the same id as an action above runs through that action.
    deny({"applyClipEffects"},
        "it is the Effects panel's add for several clips. Use patchClip or addClipAudioEffect for one clip");
    deny({"updateTrackEffect", "updateMasterEffect", "patchClipAudioEffect"},
         "only the panels know each value's range, and a very large one can exhaust memory. Add or remove the effect instead");
    deny({"deleteMarker", "altDragCopy", "duplicateSelected", "moveSelectedClips", "nudge", "pasteClipAttributes", "removeRange", "resolveDropAction", "splitSelectedAtPlayhead",
          "changeAudioTrackHeights", "setClipFadeGrip", "setClipTimeRemap", "setClipsAudioRole", "setClipsVolumeDb", "applyDucking", "moveClipAudioEffect", "moveTrackEffect",
          "setTrackAutomation", "addClipReframeKeyframe", "setClipReframeSubject", "source.place", "clip.remix", "clip.remix.revert", "sceneEdit.cut", "sceneEdit.markers",
          "assets.dropAsset", "acceptExternalUnit", "restoreDocument",
          "keyframes.animations", "keyframes.bypass", "keyframes.deleteMany", "keyframes.easing", "keyframes.easingMany", "keyframes.field", "keyframes.move", "keyframes.moveMany", "keyframes.stopwatch"},
         internal);
    deny({"ai.insertGeneration", "ai.insertImageVideo", "assistant.commitBeatGeneration", "assistant.generateClip"}, "it places generated media, which stays behind its review step. Use ui_timeline_generate_clip");
    deny({"assistant.foldedCommand"}, internal);
    deny({"assistant.ui_timeline_delete_clip", "assistant.ui_timeline_move_clip", "assistant.ui_timeline_plan_beats", "assistant.ui_timeline_remove_beat",
          "assistant.ui_timeline_set_clip_binding", "assistant.ui_timeline_set_setup", "assistant.ui_timeline_split_clip", "assistant.ui_timeline_update_beat"},
         "the Assistant has its own tool for it");
    deny({"assist.addBeat", "assist.applyBeatTake", "assist.applyTranscription", "assist.assembleStoryboard", "assist.correctTranscript", "assist.deleteBeat",
          "assist.deleteTranscriptRange", "assist.reconcileScript", "assist.reorderBeats", "assist.setBeatText", "assist.syncStoryboardShot", "shot.accept", "shot.insertDerived",
          "shot.link", "storyboard.placeShot"}, internal);
    return out;
}
}
const QList<Command>& allowedCommands() {
    static const QList<Command> table = buildAllowed();
    return table;
}
const QHash<QString, QString>& deniedCommands() {
    static const QHash<QString, QString> table = buildDenied();
    return table;
}
}
