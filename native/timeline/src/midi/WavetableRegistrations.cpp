// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/WavetableEdits.h"

namespace {
// Linked into every audio host (including headless tests, CLI tools, and QML hosts)
// via the nt_wavetable_registrar OBJECT library in midi/module.cmake.
[[maybe_unused]] const bool wavetableEditsRegistered = [] {
    nt::midi::registerWavetableEdits();
    return true;
}();
}  // namespace
