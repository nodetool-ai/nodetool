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
["panelEffects",[{"key":"7","shift":true}]]
]})overlay";

}  // namespace nt::edit
