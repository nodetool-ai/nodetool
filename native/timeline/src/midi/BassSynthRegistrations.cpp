// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/BassSynthEdits.h"

namespace {
// Linked into every audio host (including non-QML tests and headless bounces)
// via the nt_bass_synth_registrar OBJECT library in midi/module.cmake.
[[maybe_unused]] const bool bassEditsRegistered = [] {
    nt::midi::registerBassEdits();
    return true;
}();
}  // namespace
