// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit ae9fca7 (juce/source/drum/dsp/{DrumEngine,DrumKits,OneShotSamples.gen.*,KitLevels.gen.h,DrumParams}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/DrumSampler.h"

namespace {
// Linked into every audio host (including headless tests, CLI tools, and QML hosts)
// via the nt_drum_sampler_registrar OBJECT library in midi/module.cmake.
[[maybe_unused]] const auto drumSamplerStageRegistered = nt::midi::registerDrumSamplerStage();
}  // namespace
