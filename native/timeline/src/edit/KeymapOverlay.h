// The keys that differ from the web table, per preset, in the form of
// KeymapData.h. An entry replaces all the bindings of its action, adds the
// action when the table has none, and removes it when its list is empty.
//
// The Premiere keys follow the default keyboard of Premiere on macOS with Cmd
// written as Ctrl, as FilmCraft's table does
// (crates/engine/src/shortcut_presets.rs). Key assignments are facts about how
// an editor is operated. No file of another application is used.
#pragma once

namespace nt::edit {

inline constexpr const char* KEYMAP_OVERLAY_JSON = R"overlay({"premiere":[
["splitAtPlayhead",[{"key":"k","ctrl":true}]],
["exportFrame",[{"key":"e","ctrl":true,"shift":true}]],
["sourceAppend",[{"key":"e","ctrl":true,"alt":true}]],
["toggleLoop",[{"key":"l","ctrl":true,"shift":true}]],
["toggleDawMode",[]],
["nudgeLeft",[{"key":"ArrowLeft","alt":true},{"key":"ArrowLeft","ctrl":true}]],
["nudgeRight",[{"key":"ArrowRight","alt":true},{"key":"ArrowRight","ctrl":true}]],
["clearRange",[{"key":"x","ctrl":true,"shift":true},{"key":"x","alt":true}]],
["goToSequenceStart",[{"key":"Home"}]],
["goToSequenceEnd",[{"key":"End"}]],
["prevCutAnyTrack",[{"key":"ArrowUp","shift":true}]],
["nextCutAnyTrack",[{"key":"ArrowDown","shift":true}]],
["goToSelectedStart",[{"key":"Home","shift":true}]],
["goToSelectedEnd",[{"key":"End","shift":true}]],
["selectPrevClip",[{"key":"ArrowUp","ctrl":true}]],
["selectNextClip",[{"key":"ArrowDown","ctrl":true}]],
["nextGap",[{"key":";","shift":true}]],
["prevGap",[{"key":";","alt":true}]],
["slowShuttleBack",[{"key":"j","shift":true}]],
["slowShuttleForward",[{"key":"l","shift":true}]],
["playAround",[{"key":"k","shift":true}]],
["playInToOutWithRoll",[{"key":" ","shift":true}]],
["playToOut",[{"key":" ","ctrl":true}]],
["extendPrevEdit",[{"key":"q","shift":true}]],
["extendNextEdit",[{"key":"w","shift":true}]],
["slideLeft",[{"key":",","alt":true}]],
["slideRight",[{"key":".","alt":true}]],
["markSelection",[{"key":"/"}]],
["clearIn",[{"key":"i","alt":true}]],
["clearOut",[{"key":"o","alt":true}]],
["clearMarker",[{"key":"m","alt":true}]],
["clearAllMarkers",[{"key":"m","ctrl":true,"alt":true}]],
["addRangeMarker",[{"key":"m","alt":true,"shift":true}]],
["addMarkerInOut",[{"key":"m","ctrl":true}]],
["expandAllTracks",[{"key":"=","shift":true}]],
["minimizeAllTracks",[{"key":"-","shift":true}]],
["audioTracksTaller",[{"key":"=","alt":true}]],
["audioTracksShorter",[{"key":"-","alt":true}]],
["clipVolumeDown",[{"key":"["}]],
["clipVolumeUp",[{"key":"]"}]],
["clipVolumeDownMore",[{"key":"[","shift":true}]],
["clipVolumeUpMore",[{"key":"]","shift":true}]],
["panelAssets",[{"key":"1","shift":true}]],
["panelSource",[{"key":"2","shift":true}]],
["panelTimeline",[{"key":"3","shift":true}]],
["panelProgram",[{"key":"4","shift":true}]],
["panelEffectControls",[{"key":"5","shift":true}]],
["panelInspector",[{"key":"9","shift":true}]],
["panelMixer",[{"key":"6","shift":true}]],
["panelEffects",[{"key":"7","shift":true}]],
["panelScript",[{"key":"0","shift":true}]],
["panelStoryboard",[{"key":"8","shift":true}]],
["nextPanel",[{"key":".","ctrl":true,"shift":true}]],
["prevPanel",[{"key":",","ctrl":true,"shift":true}]]
]})overlay";

}  // namespace nt::edit
