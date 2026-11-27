#include "aiassist/AssistantCommandTable.h"
#include "edit/ClipGestureController.h"
#include "markers/MarkerOps.h"
#include "midi/BassSynthPresets.h"
#include "midi/WavetablePresets.h"
#include "midi/modal/ModalPresets.h"
#include "midi/InstrumentEdits.h"

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

    for (const auto* name : {"midi.moveNotes", "midi.resizeNotes", "midi.setNoteVelocities", "midi.addNotes"}) {
        edit(QString::fromLatin1(name), "Patch MIDI notes", {clip,
            P{"notes", ParamKind::Array, true, "Note patches with id and absolute startTick/pitch, durationTick, velocity, or complete new notes."}});
    }
    edit("midi.patchNotes", "Patch mixed MIDI notes", {clip,
        P{"notes", ParamKind::Array, true, "Full changed or added notes."},
        P{"noteIds", ParamKind::Array, false, "Existing note ids to remove atomically with the updates."}});
    edit("midi.removeNotes", "Remove MIDI notes", {clip,
        P{"noteIds", ParamKind::Array, true, "Existing note ids to remove."}});

    // Music clip and song-section operations share the editor's atomic edit path.
    const P musicClip{"clipId", ParamKind::ClipId, true, "The clip id."};
    const P barPosition{"atBar", ParamKind::Number, false, "One-based bar position, instead of milliseconds.", {}, {}, 1};
    const P beatPosition{"beat", ParamKind::Number, false, "One-based beat within atBar.", {}, {}, 1};
    const P timePosition{"atMs", ParamKind::Number, false, "Timeline milliseconds, instead of atBar.", {}, {}, 0};
    const P scopedTracks{"trackIds", ParamKind::TrackIds, false, "Only these tracks. Omit for every track and global metadata."};
    const QList<P> sectionRange{
        P{"fromBar", ParamKind::Number, false, "First bar, included.", {}, {}, 1},
        P{"toBar", ParamKind::Number, false, "End bar, excluded.", {}, {}, 1},
        P{"fromMs", ParamKind::Number, false, "Range start in milliseconds, instead of bars.", {}, {}, 0},
        P{"toMs", ParamKind::Number, false, "Range end in milliseconds, instead of bars.", {}, {}, 0}, scopedTracks};
    edit("insert_time", "Insert silence", {barPosition, beatPosition, timePosition,
        P{"bars", ParamKind::Number, false, "Inserted length in bars, instead of ms.", {}, {}, 0},
        P{"ms", ParamKind::Number, false, "Inserted length in milliseconds, instead of bars.", {}, {}, 0}, scopedTracks});
    edit("delete_time", "Delete section", sectionRange);
    edit("duplicate_range", "Duplicate section", sectionRange);
    edit("paste_range", "Paste section", {barPosition, beatPosition, timePosition,
        P{"content", ParamKind::Object, true, "Section content with lengthMs, clips and optional metadata."},
        P{"mode", ParamKind::Choice, false, "Insert silence or replace receiving tracks.", {"insert", "overwrite"}}});
    edit("set_tempo", "Set tempo", {
        P{"bpm", ParamKind::Number, false, "Beats per minute.", {}, {}, 0},
        P{"offset_ms", ParamKind::Number, false, "Beat-one position in milliseconds.", {}, {}, 0},
        P{"beats_per_bar", ParamKind::Number, false, "Time-signature numerator.", {}, {}, 1},
        P{"beat_unit", ParamKind::Number, false, "Time-signature denominator.", {}, {}, 1},
        P{"key", ParamKind::NullableObject, false, "Project {tonic, mode}, or null to clear."},
        P{"auto_crossfade_ms", ParamKind::Number, false, "Automatic crossfade in milliseconds. Zero disables it.", {}, {}, 0, 1000}});
    edit("music.setAutoCrossfade", "Set automatic crossfade", {
        P{"autoCrossfadeMs", ParamKind::Number, true, "Automatic audio crossfade length in ms. Zero disables it. Default 10.", {}, {}, 0, 1000}});
    auto& clipParams = edit("set_clip_params", "Set clip parameters", {
        P{"target", ParamKind::ClipId, false, "The clip id."},
        P{"clipId", ParamKind::ClipId, false, "Alias for target."},
        P{"startMs", ParamKind::Number, false, "Timeline start in milliseconds.", {}, {}, 0},
        P{"durationMs", ParamKind::Number, false, "Timeline duration in milliseconds.", {}, {}, 0},
        P{"trackId", ParamKind::TrackId, false, "Destination track."},
        P{"inPointMs", ParamKind::Number, false, "Source in-point in milliseconds. Alone, slips the linked source windows.", {}, {}, 0},
        P{"outPointMs", ParamKind::Number, false, "Source out-point in milliseconds. Must exceed the in-point.", {}, {}, 0},
        P{"transform", ParamKind::Object, false, "Partial transform: position, scale, rotation, rotationX, rotationY, perspective, anchor."},
        P{"blendMode", ParamKind::Text, false, "Clip blend mode."},
        P{"borderRadius", ParamKind::Number, false, "Clip border radius."},
        P{"crop", ParamKind::NullableObject, false, "Source crop: left, right, top, bottom fractions. Null clears it."},
        P{"fontSizePx", ParamKind::Number, false, "Shorthand for textStyle.fontSizePx."},
        P{"textStyle", ParamKind::Object, false, "Text style patch, merged with the stored style."},
        P{"shapeStyle", ParamKind::Object, false, "Replacement shape style, including kind."},
        P{"captionStyle", ParamKind::Object, false, "Replacement style for the clip's existing caption."},
        P{"audioEffects", ParamKind::Array, false, "The complete clip audio-effect chain. An empty array clears it."},
        P{"speedMultiplier", ParamKind::Number, false, "Playback speed. Retimes the linked clips.", {}, {}, 0},
        P{"volumeDb", ParamKind::Number, false, "Clip gain in decibels."},
        P{"fadeInMs", ParamKind::Number, false, "Fade-in duration."},
        P{"fadeOutMs", ParamKind::Number, false, "Fade-out duration."},
        P{"fadeInShape", ParamKind::Choice, false, "Fade-in shape.", {"linear", "sCurve", "plus3dB", "minus3dB"}},
        P{"fadeOutShape", ParamKind::Choice, false, "Fade-out shape.", {"linear", "sCurve", "plus3dB", "minus3dB"}},
        P{"opacity", ParamKind::Number, false, "Clip opacity.", {}, {}, 0, 1},
        P{"muted", ParamKind::Boolean, false, "Mute the clip."},
        P{"hidden", ParamKind::Boolean, false, "Hide the clip."},
        P{"locked", ParamKind::Boolean, false, "Lock the clip."},
        P{"name", ParamKind::Text, false, "Clip name."},
        P{"labelColor", ParamKind::NullableText, false, "Label color, or null to clear."},
        P{"transpose", ParamKind::NullableNumber, false, "MIDI semitones, or null to clear.", {}, {}, -48, 48},
        P{"velocityOffset", ParamKind::NullableNumber, false, "MIDI velocity offset, or null to clear.", {}, {}, -127, 127},
        P{"quantize", ParamKind::NullableObject, false, "MIDI {grid, strength} or null to clear."}});
    clipParams.linked = true;
    clipParams.sourceLimit = true;
    edit("join_clips", "Join clips", {P{"clips", ParamKind::ClipIds, false, "MIDI clips on one track, or continuous pieces of one audio source."}});
    edit("loop_clip", "Loop clip", {musicClip,
        P{"times", ParamKind::Number, false, "How many source-window repetitions, including a partial final repeat.", {}, {}, 0},
        P{"untilMs", ParamKind::Number, false, "Timeline end in milliseconds.", {}, {}, 0},
        P{"untilBar", ParamKind::Number, false, "Timeline end as a one-based bar.", {}, {}, 1},
        P{"loopLengthMs", ParamKind::NullableNumber, false, "Source-window length in timeline ms. Null removes the loop.", {}, {}, 0}}).sourceLimit = true;
    edit("duplicate_clip", "Repeat clip", {musicClip, barPosition, beatPosition, timePosition,
        P{"count", ParamKind::Number, false, "Whole number of additional copies, from 1 to 64.", {}, {}, 1, 64},
        P{"gapMs", ParamKind::Number, false, "Gap between copies. Defaults to zero."}});
    edit("move_clip", "Move clip", {musicClip, barPosition, beatPosition,
        P{"startMs", ParamKind::Number, false, "New start in milliseconds, instead of atBar.", {}, {}, 0},
        P{"trackId", ParamKind::TrackId, false, "Destination track. Linked partners retain their tracks."}});
    edit("split_clip", "Split clip", {musicClip, barPosition, beatPosition, timePosition,
        P{"crossing", ParamKind::Choice, false, "Shorten a crossing MIDI note or also keep its tail on the right.", {"shorten", "split"}}});
    edit("trim_clip", "Trim clip", {musicClip, barPosition, beatPosition,
        P{"durationMs", ParamKind::Number, false, "New duration, instead of an end bar.", {}, {}, 0},
        P{"startMs", ParamKind::Number, false, "Head trim position. Send alone.", {}, {}, 0}}).sourceLimit = true;
    edit("add_media_clip", "Add media clip", {barPosition, beatPosition,
        P{"startMs", ParamKind::Number, false, "Start in milliseconds, instead of atBar.", {}, {}, 0},
        P{"trackId", ParamKind::TrackId, false, "Receiving track. Omit to create a track."},
        P{"asset", ParamKind::Object, true, "Resolved library asset metadata, including id and content_type."}});

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
    action("addTextAtPlayhead", seek);
    // Takes that exist already. Generating a take goes through its own review step.
    actions(numbered("takeSwitch", 9), clips);
    actions(numbered("takeCut", 9), clipsAtTime);
    action("takeGrid");
    action("saveDocument");
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
                             "Text", "EffectControls", "Motion", "Color", "Scopes", "Entities", "Markers", "Assistant", "Ai", "Activity", "Files", "Music",
                             "PianoRoll", "StepEditor", "StepSequencer", "TrackEffects"}));
    actions(numbered("workspace", 7));
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
    const P trackType{"type", ParamKind::Choice, true, "The kind of track.", {"video", "audio", "overlay", "midi"}};
    const P trackName{"name", ParamKind::Text, false, "Its name."};
    edit("addTrack", "Add a track at the end", {trackType, trackName});
    edit("insertTrack", "Insert a track", {trackType, trackName, P{"atIndex", ParamKind::Number, true, "Where it goes among the tracks, from 0.", {}, {}, 0}});
    edit("addTextOnTop", "Add a title over every picture", {P{"atMs", ParamKind::Number, true, "Where it starts, in timeline ms.", {}, {}, 0, MAX_LENGTH_MS},
        P{"text", ParamKind::Text, false, "The words. Defaults to Text."}, P{"durationMs", ParamKind::Number, false, "How long it shows, in ms. Defaults to 3000.", {}, {}, 1, MAX_LENGTH_MS}});
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
    edit("setMasterLimiter", "Enable or disable the master true-peak limiter",
         {P{"enabled", ParamKind::Boolean, true, "True enables the -1 dBTP look-ahead limiter (default). False turns it off."}});
    edit("music.setTrackRole", "Set a track's music role",
         {track, P{"role", ParamKind::Choice, true, "The instrument the track holds in a music project. Add instrument generates this stem.",
                   {"vocals", "backing_vocals", "drums", "bass", "guitar", "keyboard", "percussion", "strings", "synth", "fx", "brass", "woodwinds"}}});
    edit("music.setKey", "Set a music project's key",
         {P{"tonic", ParamKind::Choice, false, "The key's tonic. Leave it out to clear the key.",
            {"C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"}},
          P{"mode", ParamKind::Choice, false, "Needed with a tonic.", {"major", "minor"}}});
    edit("music.selectTake", "Make one of a music clip's takes the one it plays",
         {clip, P{"take_id", ParamKind::Text, true, "The take's id from the clip's versions.", {}, "takeId"}});
    // Effects by name, with their default values.
    const P effect{"effect", ParamKind::Text, true, "The effect's name (gain, filter, eq3, compressor, or fable:eq, fable:comp, fable:ott, fable:limiter, fable:drive, fable:chorus, fable:echo, fable:reverb, fable:lab)."};
    const P effectId{"effect_id", ParamKind::EffectId, true, "The effect's id from the document.", {}, "effectId"};
    edit("effect.setParams", "Set Fable effect parameters", {
        P{"trackId", ParamKind::TrackId, true, "The track id."},
        P{"effectId", ParamKind::EffectId, true, "The Fable effect id."},
        P{"params", ParamKind::Object, true, "Partial fx.<unit>.<param> numeric values. Numeric ranges clamp. Enum indices and bool values (0 or 1) must be valid."}});
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

    edit("instrument.setBuiltin", "Replace a MIDI track's instrument with a built-in instrument",
         {track, P{"type", ParamKind::Choice, true, "Built-in instrument: drum sampler, analog bass, wavetable, sampler, modal or subtractive.",
                   nt::midi::builtinInstrumentTypes()},
          P{"preset", ParamKind::Text, false, "Optional preset id: a bass, wavetable or modal preset, or the drum kit '808' or 'uzu'."}});
    // Analog bass synth (BASS1): curated presets and all voice parameters.
    edit("bass.setPreset", "Load an analog bass synth preset onto a MIDI track",
         {track, P{"preset", ParamKind::Choice, true, "Curated bass preset id.", nt::midi::bassPresetIds()}});
    edit("bass.setParams", "Set analog bass synth parameters on a MIDI track",
         {track,
          P{"waveform", ParamKind::Choice, false, "Oscillator waveform.", {"saw", "square", "triangle"}},
          P{"pulseWidth", ParamKind::Number, false, "Square pulse width.", {}, {}, 0.05, 0.95},
          P{"semitones", ParamKind::Number, false, "Oscillator coarse tune in semitones.", {}, {}, -24, 24},
          P{"fine", ParamKind::Number, false, "Oscillator fine tune in cents.", {}, {}, -100, 100},
          P{"oscLevel", ParamKind::Number, false, "Main oscillator mix level.", {}, {}, 0, 1.2},
          P{"hardSync", ParamKind::Boolean, false, "Enable master-to-slave hard sync."},
          P{"syncSemitones", ParamKind::Number, false, "Hard sync slave pitch offset in semitones.", {}, {}, 0, 36},
          P{"analogDrift", ParamKind::Number, false, "Per-note analog pitch drift and phase randomness.", {}, {}, 0, 1},
          P{"subShape", ParamKind::Choice, false, "Sub oscillator waveform.", {"sine", "square"}},
          P{"subOctave", ParamKind::Number, false, "Sub oscillator octave offset (-2 or -1).", {}, {}, -2, -1},
          P{"subLevel", ParamKind::Number, false, "Sub oscillator level.", {}, {}, 0, 1},
          P{"cutoffHz", ParamKind::Number, false, "4-pole ladder filter cutoff in Hz.", {}, {}, 20, 18000},
          P{"resonance", ParamKind::Number, false, "4-pole ladder resonance (0..1; self-oscillates near 1).", {}, {}, 0, 1},
          P{"drive", ParamKind::Number, false, "Pre-ladder analog drive.", {}, {}, 0, 1},
          P{"filterEnvAmount", ParamKind::Number, false, "Filter envelope depth in octaves.", {}, {}, -5, 5},
          P{"keyTrack", ParamKind::Number, false, "Filter keyboard tracking amount.", {}, {}, 0, 1},
          P{"filterAttackMs", ParamKind::Number, false, "Filter envelope attack in ms.", {}, {}, 0.5, 500},
          P{"filterDecayMs", ParamKind::Number, false, "Filter envelope decay in ms.", {}, {}, 5, 4000},
          P{"filterSustain", ParamKind::Number, false, "Filter envelope sustain level.", {}, {}, 0, 1},
          P{"filterReleaseMs", ParamKind::Number, false, "Filter envelope release in ms.", {}, {}, 5, 2000},
          P{"attackMs", ParamKind::Number, false, "Amp envelope attack in ms.", {}, {}, 0.5, 500},
          P{"decayMs", ParamKind::Number, false, "Amp envelope decay in ms.", {}, {}, 5, 4000},
          P{"sustain", ParamKind::Number, false, "Amp envelope sustain level.", {}, {}, 0, 1},
          P{"releaseMs", ParamKind::Number, false, "Amp envelope release in ms.", {}, {}, 5, 2000},
          P{"accentAmount", ParamKind::Number, false, "Velocity accent amount.", {}, {}, 0, 1},
          P{"accentVelocity", ParamKind::Number, false, "MIDI velocity threshold (1..127) for accent.", {}, {}, 1, 127},
          P{"slideMs", ParamKind::Number, false, "Constant-time legato slide/glide in ms.", {}, {}, 0, 500},
          P{"retrigger", ParamKind::Boolean, false, "Retrigger envelopes on overlapping legato notes."},
          P{"saturation", ParamKind::Number, false, "Gentle output analog saturation stage.", {}, {}, 0, 1},
          P{"gainDb", ParamKind::Number, false, "Output trim gain in dB.", {}, {}, -60, 12}});

    // Multisample sampler (SMP1): instrument parameters and key/velocity zones.
    edit("sampler.setParams", "Set multisample sampler instrument parameters on a MIDI track",
         {track,
          P{"oneShot", ParamKind::Boolean, false, "True for one-shot playback; false for sustained/looped playback."},
          P{"attackMs", ParamKind::Number, false, "Amp envelope attack in ms.", {}, {}, 0, 10000},
          P{"decayMs", ParamKind::Number, false, "Amp envelope decay in ms.", {}, {}, 0, 10000},
          P{"sustain", ParamKind::Number, false, "Amp envelope sustain level (0..1).", {}, {}, 0, 1},
          P{"releaseMs", ParamKind::Number, false, "Amp envelope release in ms.", {}, {}, 0, 30000},
          P{"velocityCurve", ParamKind::Number, false, "Velocity curve (-1 hard, 0 linear, +1 soft).", {}, {}, -1, 1},
          P{"glideMs", ParamKind::Number, false, "Pitch portamento glide time in ms.", {}, {}, 0, 2000},
          P{"voiceLimit", ParamKind::Number, false, "Maximum simultaneous polyphonic voices (1..64).", {}, {}, 1, 64},
          P{"pitchBendRange", ParamKind::Number, false, "Pitch bend range in semitones (1..24).", {}, {}, 1, 24},
          P{"gainDb", ParamKind::Number, false, "Output trim gain in dB.", {}, {}, -60, 12}});
    edit("sampler.setZones", "Replace all zones on a MIDI track's multisample sampler",
         {track,
          P{"zones", ParamKind::Array, true, "Complete array of sampler zone objects."}});
    edit("sampler.addZone", "Add a sample zone to a MIDI track's multisample sampler",
         {track,
          P{"id", ParamKind::Text, false, "Optional stable zone id."},
          P{"name", ParamKind::Text, false, "Display name for the zone."},
          P{"assetId", ParamKind::Text, false, "Audio asset id (32-hex)."},
          P{"mediaPath", ParamKind::Text, false, "Project-relative audio file path (WAV/AIFF/FLAC/MP3)."},
          P{"rootNote", ParamKind::Number, false, "Root MIDI note (0..127, C3 = 60).", {}, {}, 0, 127},
          P{"lowNote", ParamKind::Number, false, "Lowest MIDI key in range (0..127).", {}, {}, 0, 127},
          P{"highNote", ParamKind::Number, false, "Highest MIDI key in range (0..127).", {}, {}, 0, 127},
          P{"lowVelocity", ParamKind::Number, false, "Lowest MIDI velocity in range (0..127).", {}, {}, 0, 127},
          P{"highVelocity", ParamKind::Number, false, "Highest MIDI velocity in range (0..127).", {}, {}, 0, 127},
          P{"gainDb", ParamKind::Number, false, "Zone gain trim in dB.", {}, {}, -60, 12},
          P{"pan", ParamKind::Number, false, "Zone stereo pan (-1..+1).", {}, {}, -1, 1},
          P{"tuneCents", ParamKind::Number, false, "Zone fine tuning in cents (-100..+100).", {}, {}, -100, 100},
          P{"loopMode", ParamKind::Choice, false, "Zone playback mode ('oneShot', 'sustain', or 'inherit' to follow instrument oneShot).", {"oneShot", "sustain", "inherit"}},
          P{"loopStart", ParamKind::Number, false, "Normalized sustain loop start (0..1).", {}, {}, 0, 1},
          P{"loopEnd", ParamKind::Number, false, "Normalized sustain loop end (0..1).", {}, {}, 0, 1},
          P{"loopCrossfadeMs", ParamKind::Number, false, "Loop seam crossfade duration in ms.", {}, {}, 0, 500},
          P{"releaseAssetId", ParamKind::Text, false, "Optional release sample asset id."},
          P{"releaseMediaPath", ParamKind::Text, false, "Optional release sample project-relative path."},
          P{"releaseGainDb", ParamKind::Number, false, "Release sample gain trim in dB.", {}, {}, -60, 12}});
    edit("sampler.updateZone", "Update fields on an existing multisample sampler zone",
         {track,
          P{"zoneId", ParamKind::Text, true, "Id of the zone to update."},
          P{"name", ParamKind::Text, false, "Display name for the zone."},
          P{"assetId", ParamKind::Text, false, "Audio asset id (32-hex)."},
          P{"mediaPath", ParamKind::Text, false, "Project-relative audio file path."},
          P{"rootNote", ParamKind::Number, false, "Root MIDI note (0..127, C3 = 60).", {}, {}, 0, 127},
          P{"lowNote", ParamKind::Number, false, "Lowest MIDI key in range (0..127).", {}, {}, 0, 127},
          P{"highNote", ParamKind::Number, false, "Highest MIDI key in range (0..127).", {}, {}, 0, 127},
          P{"lowVelocity", ParamKind::Number, false, "Lowest MIDI velocity in range (0..127).", {}, {}, 0, 127},
          P{"highVelocity", ParamKind::Number, false, "Highest MIDI velocity in range (0..127).", {}, {}, 0, 127},
          P{"gainDb", ParamKind::Number, false, "Zone gain trim in dB.", {}, {}, -60, 12},
          P{"pan", ParamKind::Number, false, "Zone stereo pan (-1..+1).", {}, {}, -1, 1},
          P{"tuneCents", ParamKind::Number, false, "Zone fine tuning in cents (-100..+100).", {}, {}, -100, 100},
          P{"loopMode", ParamKind::Choice, false, "Zone playback mode ('oneShot', 'sustain', or 'inherit' to follow instrument oneShot).", {"oneShot", "sustain", "inherit"}},
          P{"loopStart", ParamKind::Number, false, "Normalized sustain loop start (0..1).", {}, {}, 0, 1},
          P{"loopEnd", ParamKind::Number, false, "Normalized sustain loop end (0..1).", {}, {}, 0, 1},
          P{"loopCrossfadeMs", ParamKind::Number, false, "Loop seam crossfade duration in ms.", {}, {}, 0, 500},
          P{"releaseAssetId", ParamKind::Text, false, "Optional release sample asset id."},
          P{"releaseMediaPath", ParamKind::Text, false, "Optional release sample project-relative path."},
          P{"releaseGainDb", ParamKind::Number, false, "Release sample gain trim in dB.", {}, {}, -60, 12}});
    edit("sampler.removeZone", "Remove a zone from a MIDI track's multisample sampler",
         {track,
          P{"zoneId", ParamKind::Text, true, "Id of the zone to remove."}});

    // Wavetable synth (WT-1): curated presets and all voice parameters.
    const QStringList wtTables{"prime", "bloom", "pulse", "vox", "chime", "glitch"};
    edit("wavetable.setPreset", "Load a WT-1 wavetable synth preset onto a MIDI track",
         {track, P{"preset", ParamKind::Choice, true, "Curated WT-1 wavetable preset id.", nt::midi::wavetablePresetIds()}});
    edit("wavetable.setParams", "Set WT-1 wavetable synth parameters on a MIDI track",
         {track,
          P{"oscAOn", ParamKind::Boolean, false, "Enable oscillator A."},
          P{"oscATable", ParamKind::Choice, false, "Oscillator A wavetable.", wtTables},
          P{"oscAPosition", ParamKind::Number, false, "Oscillator A wavetable morph position (0..1).", {}, {}, 0, 1},
          P{"oscAOctave", ParamKind::Number, false, "Oscillator A octave offset (-3..+3).", {}, {}, -3, 3},
          P{"oscASemitones", ParamKind::Number, false, "Oscillator A semitone offset (-24..+24).", {}, {}, -24, 24},
          P{"oscAFine", ParamKind::Number, false, "Oscillator A fine tuning in cents (-100..+100).", {}, {}, -100, 100},
          P{"oscAUnison", ParamKind::Number, false, "Oscillator A unison voice count (1..7).", {}, {}, 1, 7},
          P{"oscADetune", ParamKind::Number, false, "Oscillator A unison detune amount (0..1).", {}, {}, 0, 1},
          P{"oscASpread", ParamKind::Number, false, "Oscillator A unison stereo spread (0..1).", {}, {}, 0, 1},
          P{"oscABlend", ParamKind::Number, false, "Oscillator A outer unison voice balance (0..1).", {}, {}, 0, 1},
          P{"oscALevel", ParamKind::Number, false, "Oscillator A output level (0..1.2).", {}, {}, 0, 1.2},
          P{"oscAPan", ParamKind::Number, false, "Oscillator A stereo pan (-1..+1).", {}, {}, -1, 1},
          P{"oscBOn", ParamKind::Boolean, false, "Enable oscillator B."},
          P{"oscBTable", ParamKind::Choice, false, "Oscillator B wavetable.", wtTables},
          P{"oscBPosition", ParamKind::Number, false, "Oscillator B wavetable morph position (0..1).", {}, {}, 0, 1},
          P{"oscBOctave", ParamKind::Number, false, "Oscillator B octave offset (-3..+3).", {}, {}, -3, 3},
          P{"oscBSemitones", ParamKind::Number, false, "Oscillator B semitone offset (-24..+24).", {}, {}, -24, 24},
          P{"oscBFine", ParamKind::Number, false, "Oscillator B fine tuning in cents (-100..+100).", {}, {}, -100, 100},
          P{"oscBUnison", ParamKind::Number, false, "Oscillator B unison voice count (1..7).", {}, {}, 1, 7},
          P{"oscBDetune", ParamKind::Number, false, "Oscillator B unison detune amount (0..1).", {}, {}, 0, 1},
          P{"oscBSpread", ParamKind::Number, false, "Oscillator B unison stereo spread (0..1).", {}, {}, 0, 1},
          P{"oscBBlend", ParamKind::Number, false, "Oscillator B outer unison voice balance (0..1).", {}, {}, 0, 1},
          P{"oscBLevel", ParamKind::Number, false, "Oscillator B output level (0..1.2).", {}, {}, 0, 1.2},
          P{"oscBPan", ParamKind::Number, false, "Oscillator B stereo pan (-1..+1).", {}, {}, -1, 1},
          P{"subOn", ParamKind::Boolean, false, "Enable sub oscillator."},
          P{"subShape", ParamKind::Choice, false, "Sub oscillator waveform.", {"sine", "square"}},
          P{"subOctave", ParamKind::Number, false, "Sub oscillator octave offset (-2..0).", {}, {}, -2, 0},
          P{"subLevel", ParamKind::Number, false, "Sub oscillator level (0..1).", {}, {}, 0, 1},
          P{"noiseOn", ParamKind::Boolean, false, "Enable noise generator."},
          P{"noiseType", ParamKind::Choice, false, "Noise color.", {"white", "pink"}},
          P{"noiseLevel", ParamKind::Number, false, "Noise generator level (0..1).", {}, {}, 0, 1},
          P{"filterOn", ParamKind::Boolean, false, "Enable ZDF SVF filter."},
          P{"filterType", ParamKind::Choice, false, "ZDF SVF filter topology.", {"lp12", "lp24", "hp12", "hp24", "bp12", "bp24", "none"}},
          P{"cutoffHz", ParamKind::Number, false, "Filter cutoff frequency in Hz (20..20000).", {}, {}, 20, 20000},
          P{"resonance", ParamKind::Number, false, "Filter resonance (0..0.99).", {}, {}, 0, 0.99},
          P{"drive", ParamKind::Number, false, "Oversampled pre-filter analog drive (0..1).", {}, {}, 0, 1},
          P{"filterEnvAmount", ParamKind::Number, false, "Mod envelope to filter cutoff in octaves (-4..+4).", {}, {}, -4, 4},
          P{"keyTrack", ParamKind::Number, false, "Filter keyboard tracking amount (0..1).", {}, {}, 0, 1},
          P{"ampAttackMs", ParamKind::Number, false, "Amp envelope attack in ms (1..8000).", {}, {}, 1, 8000},
          P{"ampDecayMs", ParamKind::Number, false, "Amp envelope decay in ms (5..10000).", {}, {}, 5, 10000},
          P{"ampSustain", ParamKind::Number, false, "Amp envelope sustain level (0..1).", {}, {}, 0, 1},
          P{"ampReleaseMs", ParamKind::Number, false, "Amp envelope release in ms (5..12000).", {}, {}, 5, 12000},
          P{"modAttackMs", ParamKind::Number, false, "Mod envelope attack in ms (1..8000).", {}, {}, 1, 8000},
          P{"modDecayMs", ParamKind::Number, false, "Mod envelope decay in ms (5..10000).", {}, {}, 5, 10000},
          P{"modSustain", ParamKind::Number, false, "Mod envelope sustain level (0..1).", {}, {}, 0, 1},
          P{"modReleaseMs", ParamKind::Number, false, "Mod envelope release in ms (5..12000).", {}, {}, 5, 12000},
          P{"lfoShape", ParamKind::Choice, false, "LFO waveform.", {"sine", "tri", "saw", "square", "sh"}},
          P{"lfoRateHz", ParamKind::Number, false, "LFO free-running rate in Hz (0.02..30).", {}, {}, 0.02, 30},
          P{"lfoTempoSync", ParamKind::Boolean, false, "Sync LFO rate to timeline tempo."},
          P{"lfoSyncDiv", ParamKind::Number, false, "Tempo-synced LFO division index (0=1/1 .. 10=1/32).", {}, {}, 0, 10},
          P{"lfoRiseSec", ParamKind::Number, false, "Per-note LFO fade-in rise time in seconds (0..5).", {}, {}, 0, 5},
          P{"lfoPhase", ParamKind::Number, false, "LFO phase offset (0..1).", {}, {}, 0, 1},
          P{"lfoRetrig", ParamKind::Boolean, false, "Retrigger LFO per voice on note-on."},
          P{"lfoToPitch", ParamKind::Number, false, "LFO to pitch depth (-1..+1; 1 = +/-12 semitones).", {}, {}, -1, 1},
          P{"lfoToPos", ParamKind::Number, false, "LFO to wavetable position depth (-1..+1).", {}, {}, -1, 1},
          P{"lfoToCutoff", ParamKind::Number, false, "LFO to filter cutoff depth (-1..+1; 1 = +/-5 octaves).", {}, {}, -1, 1},
          P{"velToAmp", ParamKind::Number, false, "Velocity sensitivity to voice amplitude (0..1).", {}, {}, 0, 1},
          P{"velToCutoff", ParamKind::Number, false, "Velocity to filter cutoff (-1..+1; 1 = +5 octaves).", {}, {}, -1, 1},
          P{"mono", ParamKind::Boolean, false, "Monophonic voice mode."},
          P{"legato", ParamKind::Boolean, false, "Legato mode (suppress envelope retrigger on overlapping mono notes)."},
          P{"glideMs", ParamKind::Number, false, "Portamento glide time in ms (0..2000).", {}, {}, 0, 2000},
          P{"pitchBendRange", ParamKind::Number, false, "Pitch bend range in semitones (0..24).", {}, {}, 0, 24},
          P{"modWheel", ParamKind::Number, false, "Mod wheel performance depth (0..1).", {}, {}, 0, 1},
          P{"masterVolume", ParamKind::Number, false, "Master synth volume (0..1.5).", {}, {}, 0, 1.5},
          P{"gainDb", ParamKind::Number, false, "Output trim gain in dB (-60..+12).", {}, {}, -60, 12}});

    // Modal percussion/mallet synth (MOD1, ported from RipplerX): factory presets and all parameters.
    const QStringList modalModels{"string", "beam", "squared", "membrane", "plate", "drumhead",
                                  "marimba", "openTube", "closedTube", "marimba2", "bell", "djembe"};
    edit("modal.setPreset", "Load a physically modeled percussion/mallet preset onto a MIDI track",
         {track, P{"preset", ParamKind::Choice, true, "Factory modal synth preset id.", nt::midi::modalPresetIds()}});
    edit("modal.setParams", "Set physically modeled percussion/mallet synth parameters on a MIDI track",
         {track,
          P{"malletMix", ParamKind::Number, false, "Direct mallet exciter level (0..1).", {}, {}, 0, 1},
          P{"malletRes", ParamKind::Number, false, "Mallet exciter feed into resonators (0..1).", {}, {}, 0, 1},
          P{"malletStiff", ParamKind::Number, false, "Mallet stiffness bandpass frequency in Hz (100..5000).", {}, {}, 100, 5000},
          P{"velMalletMix", ParamKind::Number, false, "Velocity modulation of direct mallet level (-1..+1).", {}, {}, -1, 1},
          P{"velMalletRes", ParamKind::Number, false, "Velocity modulation of mallet resonator feed (-1..+1).", {}, {}, -1, 1},
          P{"velMalletStiff", ParamKind::Number, false, "Velocity modulation of mallet stiffness (-1..+1).", {}, {}, -1, 1},
          P{"noiseOsc", ParamKind::Number, false, "Partial oscillator blend inside noise exciter (0..1).", {}, {}, 0, 1},
          P{"noiseMix", ParamKind::Number, false, "Direct noise exciter level (0..1).", {}, {}, 0, 1},
          P{"noiseRes", ParamKind::Number, false, "Noise exciter feed into resonators (0..1).", {}, {}, 0, 1},
          P{"noiseFilterMode", ParamKind::Choice, false, "Noise exciter filter mode.", {"lp", "bp", "hp"}},
          P{"noiseFilterFreq", ParamKind::Number, false, "Noise filter cutoff/center frequency in Hz (20..20000).", {}, {}, 20, 20000},
          P{"noiseFilterQ", ParamKind::Number, false, "Noise filter Q (0.707..4.0).", {}, {}, 0.707, 4},
          P{"noiseAttackMs", ParamKind::Number, false, "Noise envelope attack in ms (1..20000).", {}, {}, 1, 20000},
          P{"noiseDecayMs", ParamKind::Number, false, "Noise envelope decay in ms (1..20000).", {}, {}, 1, 20000},
          P{"noiseSustain", ParamKind::Number, false, "Noise envelope sustain level (0..1).", {}, {}, 0, 1},
          P{"noiseReleaseMs", ParamKind::Number, false, "Noise envelope release in ms (1..20000).", {}, {}, 1, 20000},
          P{"noiseAttackTension", ParamKind::Number, false, "Noise attack curve tension (-1..+1).", {}, {}, -1, 1},
          P{"noiseDecayTension", ParamKind::Number, false, "Noise decay curve tension (-1..+1).", {}, {}, -1, 1},
          P{"noiseReleaseTension", ParamKind::Number, false, "Noise release curve tension (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseMix", ParamKind::Number, false, "Velocity modulation of noise mix (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseRes", ParamKind::Number, false, "Velocity modulation of noise resonator feed (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseFreq", ParamKind::Number, false, "Velocity modulation of noise filter frequency (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseQ", ParamKind::Number, false, "Velocity modulation of noise filter Q (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseAttack", ParamKind::Number, false, "Velocity modulation of noise attack (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseDecay", ParamKind::Number, false, "Velocity modulation of noise decay (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseSustain", ParamKind::Number, false, "Velocity modulation of noise sustain (-1..+1).", {}, {}, -1, 1},
          P{"velNoiseRelease", ParamKind::Number, false, "Velocity modulation of noise release (-1..+1).", {}, {}, -1, 1},
          P{"aOn", ParamKind::Boolean, false, "Enable resonator A."},
          P{"aModel", ParamKind::Choice, false, "Resonator A modal or waveguide model.", modalModels},
          P{"aPartials", ParamKind::Number, false, "Resonator A partial count (1, 2, 4, 8, 16, 32, or 64).", {}, {}, 1, 64},
          P{"aDecay", ParamKind::Number, false, "Resonator A decay time in seconds (0.01..100).", {}, {}, 0.01, 100},
          P{"aDamp", ParamKind::Number, false, "Resonator A material damping (-1..+1).", {}, {}, -1, 1},
          P{"aTone", ParamKind::Number, false, "Resonator A spectral tilt (-1..+1).", {}, {}, -1, 1},
          P{"aHit", ParamKind::Number, false, "Resonator A strike position (0.02..0.50).", {}, {}, 0.02, 0.5},
          P{"aRelease", ParamKind::Number, false, "Resonator A note-off decay multiplier (0.001..1).", {}, {}, 0.001, 1},
          P{"aInharm", ParamKind::Number, false, "Resonator A inharmonicity (0..1).", {}, {}, 0, 1},
          P{"aRatio", ParamKind::Number, false, "Resonator A aspect ratio for Beam/Membrane/Plate/Djembe (0.1..10).", {}, {}, 0.1, 10},
          P{"aCut", ParamKind::Number, false, "Resonator A post filter (-1 LP .. 0 off .. +1 HP).", {}, {}, -1, 1},
          P{"aRadius", ParamKind::Number, false, "Resonator A waveguide tube radius damping (0..1).", {}, {}, 0, 1},
          P{"aCoarse", ParamKind::Number, false, "Resonator A coarse pitch in semitones (-48..+48).", {}, {}, -48, 48},
          P{"aFine", ParamKind::Number, false, "Resonator A fine pitch in cents (-99..+99).", {}, {}, -99, 99},
          P{"velADecay", ParamKind::Number, false, "Velocity modulation of resonator A decay (-1..+1).", {}, {}, -1, 1},
          P{"velAHit", ParamKind::Number, false, "Velocity modulation of resonator A hit position (-1..+1).", {}, {}, -1, 1},
          P{"velAInharm", ParamKind::Number, false, "Velocity modulation of resonator A inharmonicity (-1..+1).", {}, {}, -1, 1},
          P{"velADamp", ParamKind::Number, false, "Velocity modulation of resonator A damping (-1..+1).", {}, {}, -1, 1},
          P{"velATone", ParamKind::Number, false, "Velocity modulation of resonator A tone (-1..+1).", {}, {}, -1, 1},
          P{"bOn", ParamKind::Boolean, false, "Enable resonator B."},
          P{"bModel", ParamKind::Choice, false, "Resonator B modal or waveguide model.", modalModels},
          P{"bPartials", ParamKind::Number, false, "Resonator B partial count (1, 2, 4, 8, 16, 32, or 64).", {}, {}, 1, 64},
          P{"bDecay", ParamKind::Number, false, "Resonator B decay time in seconds (0.01..100).", {}, {}, 0.01, 100},
          P{"bDamp", ParamKind::Number, false, "Resonator B material damping (-1..+1).", {}, {}, -1, 1},
          P{"bTone", ParamKind::Number, false, "Resonator B spectral tilt (-1..+1).", {}, {}, -1, 1},
          P{"bHit", ParamKind::Number, false, "Resonator B strike position (0.02..0.50).", {}, {}, 0.02, 0.5},
          P{"bRelease", ParamKind::Number, false, "Resonator B note-off decay multiplier (0.001..1).", {}, {}, 0.001, 1},
          P{"bInharm", ParamKind::Number, false, "Resonator B inharmonicity (0..1).", {}, {}, 0, 1},
          P{"bRatio", ParamKind::Number, false, "Resonator B aspect ratio for Beam/Membrane/Plate/Djembe (0.1..10).", {}, {}, 0.1, 10},
          P{"bCut", ParamKind::Number, false, "Resonator B post filter (-1 LP .. 0 off .. +1 HP).", {}, {}, -1, 1},
          P{"bRadius", ParamKind::Number, false, "Resonator B waveguide tube radius damping (0..1).", {}, {}, 0, 1},
          P{"bCoarse", ParamKind::Number, false, "Resonator B coarse pitch in semitones (-48..+48).", {}, {}, -48, 48},
          P{"bFine", ParamKind::Number, false, "Resonator B fine pitch in cents (-99..+99).", {}, {}, -99, 99},
          P{"velBDecay", ParamKind::Number, false, "Velocity modulation of resonator B decay (-1..+1).", {}, {}, -1, 1},
          P{"velBHit", ParamKind::Number, false, "Velocity modulation of resonator B hit position (-1..+1).", {}, {}, -1, 1},
          P{"velBInharm", ParamKind::Number, false, "Velocity modulation of resonator B inharmonicity (-1..+1).", {}, {}, -1, 1},
          P{"velBDamp", ParamKind::Number, false, "Velocity modulation of resonator B damping (-1..+1).", {}, {}, -1, 1},
          P{"velBTone", ParamKind::Number, false, "Velocity modulation of resonator B tone (-1..+1).", {}, {}, -1, 1},
          P{"coupling", ParamKind::Choice, false, "Coupling topology between resonators A and B.", {"parallel", "serial"}},
          P{"abMix", ParamKind::Number, false, "Parallel A/B mix balance (0=A .. 1=B).", {}, {}, 0, 1},
          P{"abSplit", ParamKind::Number, false, "Serial coupling frequency-split amount (0.01..1).", {}, {}, 0.01, 1},
          P{"gainDb", ParamKind::Number, false, "Resonator output gain in dB (-24..+24).", {}, {}, -24, 24},
          P{"pitchBendRange", ParamKind::Number, false, "Pitch bend range in semitones (1..24).", {}, {}, 1, 24},
          P{"stereoizer", ParamKind::Boolean, false, "Enable 20 ms comb stereoizer."},
          P{"polyphony", ParamKind::Number, false, "Maximum simultaneous voices (1..16).", {}, {}, 1, 16},
          P{"reuseVoices", ParamKind::Boolean, false, "Reuse voice on repeated pitches."},
          P{"fadeoutRepeats", ParamKind::Boolean, false, "Apply 1 ms fadeout when retriggering a repeated pitch."}});
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
    deny({"accountSignIn"}, "it signs in, cancels sign-in or signs out, which a person controls");
    deny({"accountOtherServer", "accountSwitchServer"}, "it changes the account server through controls a person drives");
    deny({"shareTimeline"}, "it opens sharing controls, where a person decides who can access the timeline");
    deny({"remixClip", "sceneEditDetection"}, paid);
    deny({"revertRemix"}, "it runs through the remix panel, which a person drives");
    deny({"toggleSnap", "sequence.linkedSelection", "toggleLoop", "toggleScrubAudio", "toggleShuttleKeepsPitch", "toggleLibraryScrub"}, settings);
    deny(family("monitorPlaybackResolution", {"1", "2", "4", "8"}) + family("monitorPausedResolution", {"1", "2", "4", "8"}), settings);
    deny({"playPause", "playInToOut", "playInToOutWithRoll", "playToOut", "playAround", "shuttleBack", "shuttleStop", "shuttleForward", "slowShuttleBack", "slowShuttleForward"}, playback);
    deny({"selectTool", "rangeTool", "trackSelectTool", "trackSelectBackwardTool", "rippleTool", "rollTool", "rateStretchTool", "cutTool", "slipTool", "slideTool", "handTool", "zoomTool"}, tool);
    deny({"selectEditPoint", "rollCut", "disableSnapping", "insertOnDrop", "escape"}, gesture);
    deny(family("editPoint.", {"rippleIn", "rippleOut", "roll", "trimIn", "trimOut"}), tool);
    deny({"selectNearestEditPoint", "toggleTrimType", "exitTrimMode", "monitorDisplay:trim"}, "it enters trim mode, which needs a person at the keys. Use the trim commands");
    deny({"takeRecord"}, "it records live take switches during playback");
    deny({"toggleShortcuts", "projectSettings", "publishToCloud", "synchronize", "newMusicProject"}, dialog);
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
    deny({"deleteMarker", "altDragCopy", "duplicateSelected", "moveSelectedClips", "moveSelectedClipsAndDrop", "nudge", "pasteClipAttributes", "removeRange", "resolveDropAction", "splitSelectedAtPlayhead",
          "changeAudioTrackHeights", "setClipFadeGrip", "setClipTimeRemap", "setClipsAudioRole", "setClipsVolumeDb", "applyDucking", "moveClipAudioEffect", "moveTrackEffect",
          "setTrackAutomation", "addClipReframeKeyframe", "setClipReframeSubject", "source.place", "clip.remix", "clip.remix.revert", "sceneEdit.cut", "sceneEdit.markers",
          "assets.dropAsset", "acceptExternalUnit", "restoreDocument",
          "keyframes.animations", "keyframes.bypass", "keyframes.deleteMany", "keyframes.easing", "keyframes.easingMany", "keyframes.field", "keyframes.move", "keyframes.moveMany", "keyframes.stopwatch"},
         internal);
    deny({"ai.insertGeneration", "ai.insertImageVideo", "assistant.commitBeatGeneration", "assistant.generateClip"}, "it places generated media, which stays behind its review step. Use ui_timeline_generate_clip");
    deny({"music.insertPlaceholder", "music.applyResult"}, "it is a step of a music job, which the music panel submits and places");
    deny({"music.recordPrompt"}, "it records the prompt of a music job, which the music panel submits");
    deny({"music.deleteTake"}, "it drops a take from a music clip, which a person decides in the take list");
    deny({"loopMusicRange"}, playback);
    deny({"previousMusicTake", "nextMusicTake"}, "it steps through the takes under the music range, which a person sets. Use music.selectTake");
    deny({"musicCleanUpTakes", "music.removeTakes"}, "it leads to deleting take audio on the server, which a person confirms in the clean-up dialog");
    deny({"assistant.foldedCommand"}, internal);
    deny({"assistant.ui_timeline_delete_clip", "assistant.ui_timeline_move_clip", "assistant.ui_timeline_plan_beats", "assistant.ui_timeline_remove_beat",
          "assistant.ui_timeline_set_clip_binding", "assistant.ui_timeline_set_setup", "assistant.ui_timeline_split_clip", "assistant.ui_timeline_update_beat",
          "midi.setNotes", "midi.setControllers", "midi.setEvents", "music.createMidiClip"},
         "the Assistant has its own tool for it");
    deny({"setTrackAutomationMode", "writeTrackAutomationPass"}, "it is a step of automation recording, which a person performs during playback");
    deny({"setTrackInstrument", "setTrackInstrumentState"}, "the Assistant uses ui_timeline_load_plugin, ui_timeline_select_plugin_preset and ui_timeline_set_plugin_parameters");
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
