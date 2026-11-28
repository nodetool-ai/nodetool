// The keys that differ from the web table, per preset, in the form of
// KeymapData.h. An entry replaces all the bindings of its action, adds the
// action when the table has none, and removes it when its list is empty.
//
// The web keeps Ctrl+K for its command menu and Alt+M for the Video/DAW
// switch, has no frame export, and has no Library, Mixer or Effects panel, so
// those Premiere keys live only here.
//
// The Premiere keys follow the default keyboard of Premiere on macOS with Cmd
// written as Ctrl, as FilmCraft's table does
// (crates/engine/src/shortcut_presets.rs). Key assignments are facts about how
// an editor is operated. No file of another application is used.
//
// rangeTool is the music Range tool (docs/MUSIC-MODE.md MD11), which the web
// editor does not have. P is free in both presets.
#pragma once

namespace nt::edit {

inline constexpr const char* KEYMAP_OVERLAY_JSON = R"overlay({"premiere":[
["splitAtPlayhead",[{"key":"k","ctrl":true}]],
["exportFrame",[{"key":"e","ctrl":true,"shift":true}]],
["sourceAppend",[{"key":"e","ctrl":true,"alt":true}]],
["toggleDawMode",[]],
["clearMarker",[{"key":"m","alt":true}]],
["panelAssets",[{"key":"1","shift":true}]],
["panelMixer",[{"key":"6","shift":true}]],
["panelEffects",[{"key":"7","shift":true}]],
["rangeTool",[{"key":"p"}]]
],"fcp":[
["rangeTool",[{"key":"p"}]]
]})overlay";

// Keys that apply only in a context of the editor, over either preset. A
// context's keymap is named "<preset>@<context>" (keymapName in Keymap.h). An
// entry puts its bindings first on its action, so the action's shortcut text
// shows them, and takes the same chords from every other action of the
// preset, so a key means one action in each context.
//
// "music" is the Music layout (docs/MUSIC-MODE.md MD11, TK-2): R and V pick
// the Range and Select tools, L loops the music range, and [ and ] step
// through the takes of the clip under the range. Range keeps P. Outside the
// Music layout the preset's R, V, L, [ and ] stay as they are.
inline constexpr const char* KEYMAP_CONTEXT_JSON = R"context({"music":[
["rangeTool",[{"key":"r"}]],
["selectTool",[{"key":"v"}]],
["loopMusicRange",[{"key":"l"}]],
["previousMusicTake",[{"key":"["}]],
["nextMusicTake",[{"key":"]"}]]
]})context";

}  // namespace nt::edit
