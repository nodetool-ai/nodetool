// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/Presets.cpp and
// packages/timeline/src/midi/fablesynthPresets.gen.ts).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "midi/WavetablePresets.h"

#include <QJsonValue>

#include <algorithm>
#include <cmath>
#include <utility>

namespace nt::midi {
namespace {

using P = WavetableSynthParams;

double clampFinite(double value, double lo, double hi, double fallback) noexcept {
    return std::isfinite(value) ? std::clamp(value, lo, hi) : fallback;
}

float masterVolumeFromGainDb(double gainDb) noexcept {
    // Matches native/timeline/src/audio/automation/Automation.cpp wavetable mapping.
    const double v = 0.75 * std::pow(10.0, (std::clamp(gainDb, -60.0, 12.0) + 8.0) / 40.0);
    return static_cast<float>(std::clamp(v, 0.0, 1.5));
}

double gainDbFromMasterVolume(float vol) noexcept {
    const double v = std::max(1e-4, static_cast<double>(vol));
    return -8.0 + 40.0 * std::log10(v / 0.75);
}

std::vector<WavetablePreset> buildFactoryPresets() {
    std::vector<WavetablePreset> list;
    list.reserve(24);

    // 1. wt1-init
    {
        P p;
        list.push_back({"wt1-init", "WT-1 Init", "Init", p});
    }
    // 2. wt1-acid-line
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.85f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.4f};
        p.filter = {true, FilterType::Lp24, 240.0f, 0.78f, 0.35f, 0.85f, 0.0f};
        p.ampEnv = {0.002f, 0.3f, 0.45f, 0.08f};
        p.modEnv = {0.001f, 0.19f, 0.0f, 0.12f};
        p.mono = true;
        p.glideSec = 0.06f;
        list.push_back({"wt1-acid-line", "WT-1 Acid Line", "Bass", p});
    }
    // 3. wt1-hyper-saw
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 7, 0.42f, 1.0f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, 1, 0, 0.0f, 5, 0.35f, 0.9f, 1.0f, 0.45f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.45f};
        p.filter = {true, FilterType::Lp12, 12000.0f, 0.05f, 0.0f, 0.0f, 0.0f};
        p.ampEnv = {0.01f, 0.4f, 0.9f, 0.5f};
        list.push_back({"wt1-hyper-saw", "WT-1 Hyper Saw", "Lead", p});
    }
    // 4. wt1-neuro-wobble
    {
        P p;
        p.oscA = {true, WavetableId::Glitch, 0.3f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 1.0f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.55f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.55f};
        p.filter = {true, FilterType::Lp24, 700.0f, 0.45f, 0.4f, 0.0f, 0.0f};
        p.ampEnv = {0.003f, 0.3f, 0.9f, 0.15f};
        p.lfo.rateHz = 2.2f;
        p.lfo.toCutoff = 0.55f;
        p.lfo.toPos = 0.5f;
        list.push_back({"wt1-neuro-wobble", "WT-1 Neuro Wobble", "Bass", p});
    }
    // 5. wt1-reese-bass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 4, 0.5f, 0.35f, 1.0f, 0.85f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, 0, -12, 0.0f, 2, 0.28f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.5f};
        p.filter = {true, FilterType::Lp24, 520.0f, 0.26f, 0.3f, 0.0f, 0.2f};
        p.ampEnv = {0.005f, 0.4f, 0.85f, 0.18f};
        p.lfo.rateHz = 0.16f;
        p.lfo.toCutoff = 0.18f;
        p.lfo.toPos = 0.12f;
        list.push_back({"wt1-reese-bass", "WT-1 Reese Bass", "Bass", p});
    }
    // 6. wt1-power-fifths
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 3, 0.22f, 0.7f, 1.0f, 0.7f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, 0, 7, 0.0f, 3, 0.22f, 0.7f, 1.0f, 0.55f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.35f};
        p.filter = {true, FilterType::Lp12, 6500.0f, 0.12f, 0.0f, 0.3f, 0.3f};
        p.ampEnv = {0.005f, 0.6f, 0.8f, 0.35f};
        p.modEnv = {0.005f, 0.3f, 0.0f, 0.2f};
        p.masterVolume = 0.5005f;
        list.push_back({"wt1-power-fifths", "WT-1 Power Fifths", "Chord", p});
    }
    // 7. wt1-growl-bass
    {
        P p;
        p.oscA = {true, WavetableId::Vox, 0.15f, 0, 0, 0.0f, 2, 0.14f, 0.5f, 1.0f, 0.85f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.55f};
        p.filter = {true, FilterType::Lp24, 650.0f, 0.45f, 0.5f, 0.0f, 0.0f};
        p.ampEnv = {0.004f, 0.3f, 0.9f, 0.12f};
        p.lfo.shape = LfoShape::Tri;
        p.lfo.rateHz = 5.5f;
        p.lfo.toPos = 0.7f;
        p.lfo.toCutoff = 0.4f;
        list.push_back({"wt1-growl-bass", "WT-1 Growl Bass", "Bass", p});
    }
    // 8. wt1-future-chord
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 7, 0.32f, 1.0f, 1.0f, 0.72f, 0.0f};
        p.oscB = {true, WavetableId::Bloom, 0.4f, 0, 0, 0.0f, 3, 0.24f, 0.8f, 1.0f, 0.4f, 0.0f};
        p.filter = {true, FilterType::Lp12, 8000.0f, 0.08f, 0.0f, 0.25f, 0.2f};
        p.ampEnv = {0.02f, 0.5f, 0.85f, 0.6f};
        p.lfo.rateHz = 0.5f;
        p.lfo.toPos = 0.3f;
        p.lfo.toCutoff = 0.2f;
        list.push_back({"wt1-future-chord", "WT-1 Future Chord", "Chord", p});
    }
    // 9. wt1-screech-lead
    {
        P p;
        p.oscA = {true, WavetableId::Pulse, 0.7f, 0, 0, 0.0f, 3, 0.3f, 0.7f, 1.0f, 0.78f, 0.0f};
        p.oscB = {true, WavetableId::Glitch, 0.4f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.4f, 0.0f};
        p.filter = {true, FilterType::Bp12, 1800.0f, 0.6f, 0.4f, 0.0f, 0.0f};
        p.ampEnv = {0.004f, 0.4f, 0.85f, 0.15f};
        p.lfo.shape = LfoShape::Square;
        p.lfo.rateHz = 8.0f;
        p.lfo.toCutoff = 0.5f;
        p.lfo.toPos = 0.4f;
        p.velToCutoff = 0.3f;
        p.mono = true;
        list.push_back({"wt1-screech-lead", "WT-1 Screech Lead", "Lead", p});
    }
    // 10. wt1-house-pluck
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 1, 0, 0.0f, 3, 0.18f, 0.6f, 1.0f, 0.78f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.3f, 1, 12, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.3f, 0.0f};
        p.filter = {true, FilterType::Lp24, 2200.0f, 0.2f, 0.0f, 0.55f, 0.5f};
        p.ampEnv = {0.003f, 0.28f, 0.0f, 0.2f};
        p.modEnv = {0.003f, 0.18f, 0.0f, 0.15f};
        p.masterVolume = 0.5365f;
        list.push_back({"wt1-house-pluck", "WT-1 House Pluck", "Pluck", p});
    }
    // 11. wt1-8-bit-lead
    {
        P p;
        p.oscA = {true, WavetableId::Pulse, 0.0f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.filter = {false, FilterType::Lp12, 20000.0f, 0.0f, 0.0f, 0.0f, 0.0f};
        p.ampEnv = {0.001f, 0.1f, 0.7f, 0.05f};
        p.lfo.rateHz = 6.0f;
        p.lfo.toPitch = 0.01f;
        p.lfo.toPos = 0.2f;
        p.mono = true;
        list.push_back({"wt1-8-bit-lead", "WT-1 8-Bit Lead", "Lead", p});
    }
    // 12. wt1-wub-bass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 1.0f, 0, 0, 0.0f, 2, 0.1f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.5f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.6f};
        p.filter = {true, FilterType::Lp24, 400.0f, 0.55f, 0.45f, 0.0f, 0.0f};
        p.ampEnv = {0.004f, 0.3f, 0.95f, 0.12f};
        p.lfo.rateHz = 4.0f;
        p.lfo.toCutoff = 0.7f;
        list.push_back({"wt1-wub-bass", "WT-1 Wub Bass", "Bass", p});
    }
    // 13. wt1-glide-lead
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 1, 0, 0.0f, 2, 0.12f, 0.4f, 1.0f, 0.82f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.4f, 1, -12, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.4f, 0.0f};
        p.filter = {true, FilterType::Lp24, 1600.0f, 0.4f, 0.0f, 0.5f, 0.4f};
        p.ampEnv = {0.005f, 0.5f, 0.6f, 0.25f};
        p.modEnv = {0.005f, 0.3f, 0.2f, 0.2f};
        p.lfo.rateHz = 5.0f;
        p.lfo.toPitch = 0.008f;
        p.mono = true;
        p.glideSec = 0.12f;
        list.push_back({"wt1-glide-lead", "WT-1 Glide Lead", "Lead", p});
    }
    // 14. wt1-brass-section
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 3, 0.15f, 0.5f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, 0, 0, 8.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.3f};
        p.filter = {true, FilterType::Lp12, 900.0f, 0.15f, 0.0f, 0.7f, 0.3f};
        p.ampEnv = {0.03f, 0.3f, 0.85f, 0.2f};
        p.modEnv = {0.06f, 0.35f, 0.55f, 0.2f};
        p.lfo.rateHz = 5.0f;
        p.lfo.toPitch = 0.003f;
        p.velToCutoff = 0.3f;
        list.push_back({"wt1-brass-section", "WT-1 Brass Section", "Brass", p});
    }
    // 15. wt1-soft-brass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 5, 0.28f, 0.9f, 1.0f, 0.7f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.15f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.45f, 0.0f};
        p.filter = {true, FilterType::Lp12, 1200.0f, 0.1f, 0.0f, 0.5f, 0.25f};
        p.ampEnv = {0.12f, 0.6f, 0.8f, 0.8f};
        p.modEnv = {1.5f, 0.8f, 0.4f, 0.6f};
        list.push_back({"wt1-soft-brass", "WT-1 Soft Brass", "Brass", p});
    }
    // 16. wt1-tape-keys
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.12f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Glitch, 0.15f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.15f, 0.0f};
        p.noise = {true, NoiseType::Pink, 0.08f};
        p.filter = {true, FilterType::Lp12, 1500.0f, 0.12f, 0.0f, 0.3f, 0.35f};
        p.ampEnv = {0.002f, 1.2f, 0.35f, 0.5f};
        p.modEnv = {0.001f, 0.3f, 0.0f, 0.25f};
        p.lfo.shape = LfoShape::SampleHold;
        p.lfo.rateHz = 3.2f;
        p.lfo.toPitch = 0.006f;
        p.velToCutoff = 0.35f;
        list.push_back({"wt1-tape-keys", "WT-1 Tape Keys", "Keys", p});
    }
    // 17. wt1-mini-lead
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 2, 0.12f, 0.2f, 1.0f, 0.85f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, -1, 0, 6.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.filter = {true, FilterType::Lp24, 1300.0f, 0.3f, 0.2f, 0.55f, 0.35f};
        p.ampEnv = {0.004f, 0.35f, 0.75f, 0.15f};
        p.modEnv = {0.002f, 0.4f, 0.3f, 0.2f};
        p.lfo.rateHz = 5.2f;
        p.lfo.toPitch = 0.005f;
        p.mono = true;
        p.glideSec = 0.05f;
        list.push_back({"wt1-mini-lead", "WT-1 Mini Lead", "Lead", p});
    }
    // 18. wt1-jump-brass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 2, 0.18f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.1f, 0, 0, -7.0f, 1, 0.2f, 0.6f, 1.0f, 0.6f, 0.0f};
        p.filter = {true, FilterType::Lp12, 4500.0f, 0.08f, 0.0f, 0.15f, 0.3f};
        p.ampEnv = {0.005f, 0.4f, 0.9f, 0.3f};
        p.modEnv = {0.003f, 0.25f, 0.4f, 0.25f};
        p.masterVolume = 0.5033f;
        list.push_back({"wt1-jump-brass", "WT-1 Jump Brass", "Brass", p});
    }
    // 19. wt1-blade-brass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 2, 0.1f, 0.4f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.25f, 0, 0, 9.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.filter = {true, FilterType::Lp12, 900.0f, 0.2f, 0.0f, 0.6f, 0.3f};
        p.ampEnv = {0.15f, 0.8f, 0.85f, 1.6f};
        p.modEnv = {0.25f, 1.2f, 0.6f, 1.0f};
        p.lfo.rateHz = 4.2f;
        p.lfo.riseSec = 1.2f;
        p.lfo.toPitch = 0.006f;
        p.glideSec = 0.09f;
        list.push_back({"wt1-blade-brass", "WT-1 Blade Brass", "Brass", p});
    }
    // 20. wt1-taurus-pedal
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 1.0f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.5f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.7f};
        p.filter = {true, FilterType::Lp24, 380.0f, 0.2f, 0.3f, 0.45f, 0.0f};
        p.ampEnv = {0.004f, 0.5f, 0.8f, 0.25f};
        p.modEnv = {0.003f, 0.4f, 0.2f, 0.2f};
        p.mono = true;
        p.glideSec = 0.07f;
        list.push_back({"wt1-taurus-pedal", "WT-1 Taurus Pedal", "Bass", p});
    }
    // 21. wt1-funky-worm
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.0f, 1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.9f, 0.0f};
        p.filter = {true, FilterType::Lp12, 4000.0f, 0.1f, 0.0f, 0.0f, 0.5f};
        p.ampEnv = {0.002f, 0.3f, 0.85f, 0.15f};
        p.lfo.rateHz = 5.8f;
        p.lfo.toPitch = 0.007f;
        p.mono = true;
        p.glideSec = 0.22f;
        list.push_back({"wt1-funky-worm", "WT-1 Funky Worm", "Lead", p});
    }
    // 22. wt1-lately-bass
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.05f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.9f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.45f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.4f};
        p.filter = {true, FilterType::Lp12, 700.0f, 0.12f, 0.0f, 0.65f, 0.4f};
        p.ampEnv = {0.001f, 0.4f, 0.6f, 0.1f};
        p.modEnv = {0.001f, 0.18f, 0.0f, 0.1f};
        p.velToCutoff = 0.4f;
        p.masterVolume = 0.4767f;
        list.push_back({"wt1-lately-bass", "WT-1 Lately Bass", "Bass", p});
    }
    // 23. wt1-prophet-stab
    {
        P p;
        p.oscA = {true, WavetableId::Prime, 0.66f, 0, 0, 0.0f, 2, 0.1f, 0.5f, 1.0f, 0.75f, 0.0f};
        p.oscB = {true, WavetableId::Pulse, 0.3f, 0, 0, 5.0f, 1, 0.2f, 0.6f, 1.0f, 0.55f, 0.0f};
        p.filter = {true, FilterType::Lp12, 1700.0f, 0.25f, 0.0f, 0.55f, 0.4f};
        p.ampEnv = {0.003f, 0.5f, 0.35f, 0.3f};
        p.modEnv = {0.002f, 0.35f, 0.1f, 0.25f};
        p.masterVolume = 0.4805f;
        list.push_back({"wt1-prophet-stab", "WT-1 Prophet Stab", "Stab", p});
    }
    // 24. wt1-glitch-shuffle
    {
        P p;
        p.oscA = {true, WavetableId::Glitch, 0.4f, 0, 0, 0.0f, 2, 0.12f, 0.4f, 1.0f, 0.8f, 0.0f};
        p.oscB = {true, WavetableId::Prime, 0.66f, -1, 0, 0.0f, 1, 0.2f, 0.6f, 1.0f, 0.4f, 0.0f};
        p.sub = {true, SubShape::Sine, -1, 0.5f};
        p.filter = {true, FilterType::Lp24, 1100.0f, 0.35f, 0.4f, 0.0f, 0.0f};
        p.ampEnv = {0.003f, 0.3f, 0.9f, 0.12f};
        p.lfo.shape = LfoShape::SampleHold;
        p.lfo.tempoSync = true;
        p.lfo.syncDiv = 8;  // 1/16
        p.lfo.toPos = 0.45f;
        p.lfo.toCutoff = 0.3f;
        list.push_back({"wt1-glitch-shuffle", "WT-1 Glitch Shuffle", "FX", p});
    }

    return list;
}

QJsonObject oscToJson(const P::Osc& o) {
    return QJsonObject{
        {QStringLiteral("on"), o.on},
        {QStringLiteral("table"), QString::fromUtf8(wavetableName(o.table))},
        {QStringLiteral("position"), static_cast<double>(o.position)},
        {QStringLiteral("octave"), o.octave},
        {QStringLiteral("semitones"), o.semitones},
        {QStringLiteral("fine"), static_cast<double>(o.fine)},
        {QStringLiteral("level"), static_cast<double>(o.level)},
        {QStringLiteral("unison"), o.unison},
        {QStringLiteral("detune"), static_cast<double>(o.detune)},
        {QStringLiteral("spread"), static_cast<double>(o.spread)},
        {QStringLiteral("blend"), static_cast<double>(o.blend)},
        {QStringLiteral("pan"), static_cast<double>(o.pan)},
    };
}

void parseOscJson(const QJsonObject& obj, P::Osc& o) {
    if (obj.isEmpty()) return;
    if (obj.contains(u"on")) o.on = obj.value(u"on").toBool(o.on);
    if (obj.value(u"table").isString()) {
        o.table = wavetableIdFromName(obj.value(u"table").toString().toStdString());
    } else if (obj.value(u"table").isDouble()) {
        o.table = wavetableIdFromIndex(obj.value(u"table").toInt(0));
    }
    if (obj.value(u"position").isDouble()) {
        o.position = static_cast<float>(clampFinite(obj.value(u"position").toDouble(), 0.0, 1.0, o.position));
    }
    if (obj.value(u"octave").isDouble()) {
        o.octave = static_cast<int>(clampFinite(obj.value(u"octave").toDouble(), -3.0, 3.0, o.octave));
    }
    if (obj.value(u"semitones").isDouble()) {
        const int semi = static_cast<int>(clampFinite(obj.value(u"semitones").toDouble(), -36.0, 36.0, o.semitones));
        if (!obj.contains(u"octave") && std::abs(semi) >= 12) {
            o.octave = std::clamp(semi / 12, -3, 3);
            o.semitones = semi - o.octave * 12;
        } else {
            o.semitones = std::clamp(semi, -24, 24);
        }
    }
    if (obj.value(u"fine").isDouble()) {
        o.fine = static_cast<float>(clampFinite(obj.value(u"fine").toDouble(), -100.0, 100.0, o.fine));
    }
    if (obj.value(u"level").isDouble()) {
        o.level = static_cast<float>(clampFinite(obj.value(u"level").toDouble(), 0.0, 1.2, o.level));
        if (!obj.contains(u"on")) {
            o.on = o.level > 0.0f;
        }
    }
    if (obj.value(u"unison").isDouble()) {
        o.unison = static_cast<int>(clampFinite(obj.value(u"unison").toDouble(), 1.0, WavetableSynth::kMaxUnison, o.unison));
    }
    if (obj.value(u"detune").isDouble()) {
        o.detune = static_cast<float>(clampFinite(obj.value(u"detune").toDouble(), 0.0, 1.0, o.detune));
    }
    if (obj.value(u"spread").isDouble()) {
        o.spread = static_cast<float>(clampFinite(obj.value(u"spread").toDouble(), 0.0, 1.0, o.spread));
    }
    if (obj.value(u"blend").isDouble()) {
        o.blend = static_cast<float>(clampFinite(obj.value(u"blend").toDouble(), 0.0, 1.0, o.blend));
    }
    if (obj.value(u"pan").isDouble()) {
        o.pan = static_cast<float>(clampFinite(obj.value(u"pan").toDouble(), -1.0, 1.0, o.pan));
    }
}

QJsonObject envToJson(const P::Env& e) {
    return QJsonObject{
        {QStringLiteral("attackMs"), static_cast<double>(e.attackSec) * 1000.0},
        {QStringLiteral("decayMs"), static_cast<double>(e.decaySec) * 1000.0},
        {QStringLiteral("sustain"), static_cast<double>(e.sustain)},
        {QStringLiteral("releaseMs"), static_cast<double>(e.releaseSec) * 1000.0},
    };
}

void parseEnvJson(const QJsonObject& obj, P::Env& e) {
    if (obj.isEmpty()) return;
    if (obj.value(u"attackMs").isDouble()) {
        e.attackSec = static_cast<float>(clampFinite(obj.value(u"attackMs").toDouble() / 1000.0, 0.001, 8.0, e.attackSec));
    }
    if (obj.value(u"decayMs").isDouble()) {
        e.decaySec = static_cast<float>(clampFinite(obj.value(u"decayMs").toDouble() / 1000.0, 0.005, 10.0, e.decaySec));
    }
    if (obj.value(u"sustain").isDouble()) {
        e.sustain = static_cast<float>(clampFinite(obj.value(u"sustain").toDouble(), 0.0, 1.0, e.sustain));
    }
    if (obj.value(u"releaseMs").isDouble()) {
        e.releaseSec = static_cast<float>(clampFinite(obj.value(u"releaseMs").toDouble() / 1000.0, 0.005, 12.0, e.releaseSec));
    }
}

void applyFableParams(const QJsonObject& fp, P& p) {
    if (fp.isEmpty()) return;
    auto num = [&](const char* key, double lo, double hi, float& dst) {
        const auto v = fp.value(QLatin1String(key));
        if (v.isDouble()) dst = static_cast<float>(clampFinite(v.toDouble(), lo, hi, dst));
    };
    auto integer = [&](const char* key, int lo, int hi, int& dst) {
        const auto v = fp.value(QLatin1String(key));
        if (v.isDouble()) dst = static_cast<int>(clampFinite(v.toDouble(), lo, hi, dst));
    };
    auto flag = [&](const char* key, bool& dst) {
        const auto v = fp.value(QLatin1String(key));
        if (v.isBool()) dst = v.toBool();
        else if (v.isDouble()) dst = v.toDouble() >= 0.5;
    };

    flag("oscA.on", p.oscA.on);
    if (fp.value(u"oscA.table").isDouble()) p.oscA.table = wavetableIdFromIndex(fp.value(u"oscA.table").toInt());
    num("oscA.pos", 0.0, 1.0, p.oscA.position);
    integer("oscA.oct", -3, 3, p.oscA.octave);
    integer("oscA.semi", -24, 24, p.oscA.semitones);
    num("oscA.fine", -100.0, 100.0, p.oscA.fine);
    integer("oscA.unison", 1, WavetableSynth::kMaxUnison, p.oscA.unison);
    num("oscA.detune", 0.0, 1.0, p.oscA.detune);
    num("oscA.spread", 0.0, 1.0, p.oscA.spread);
    num("oscA.blend", 0.0, 1.0, p.oscA.blend);
    num("oscA.level", 0.0, 1.2, p.oscA.level);
    num("oscA.pan", -1.0, 1.0, p.oscA.pan);

    flag("oscB.on", p.oscB.on);
    if (fp.value(u"oscB.table").isDouble()) p.oscB.table = wavetableIdFromIndex(fp.value(u"oscB.table").toInt());
    num("oscB.pos", 0.0, 1.0, p.oscB.position);
    integer("oscB.oct", -3, 3, p.oscB.octave);
    integer("oscB.semi", -24, 24, p.oscB.semitones);
    num("oscB.fine", -100.0, 100.0, p.oscB.fine);
    integer("oscB.unison", 1, WavetableSynth::kMaxUnison, p.oscB.unison);
    num("oscB.detune", 0.0, 1.0, p.oscB.detune);
    num("oscB.spread", 0.0, 1.0, p.oscB.spread);
    num("oscB.blend", 0.0, 1.0, p.oscB.blend);
    num("oscB.level", 0.0, 1.2, p.oscB.level);
    num("oscB.pan", -1.0, 1.0, p.oscB.pan);

    flag("sub.on", p.sub.on);
    if (fp.value(u"sub.shape").isDouble()) {
        p.sub.shape = subShapeFromIndex(fp.value(u"sub.shape").toInt(0));
    }
    integer("sub.oct", -2, 0, p.sub.octave);
    integer("sub.octave", -2, 0, p.sub.octave);
    num("sub.level", 0.0, 1.0, p.sub.level);

    flag("noise.on", p.noise.on);
    if (fp.value(u"noise.type").isDouble()) {
        p.noise.type = noiseTypeFromIndex(fp.value(u"noise.type").toInt(0));
    }
    num("noise.level", 0.0, 1.0, p.noise.level);

    flag("filter.on", p.filter.on);
    if (fp.value(u"filter.type").isDouble()) {
        const FilterType ft = filterTypeFromIndex(fp.value(u"filter.type").toInt(1));
        p.filter.type = ft;
        if (ft == FilterType::None) {
            p.filter.on = false;
        }
    }
    num("filter.cutoff", 20.0, 20000.0, p.filter.cutoffHz);
    num("filter.res", 0.0, 0.99, p.filter.resonance);
    num("filter.drive", 0.0, 1.0, p.filter.drive);
    num("filter.env", -1.0, 1.0, p.filter.envAmount);
    num("filter.key", 0.0, 1.0, p.filter.keyTrack);

    num("env1.a", 0.001, 8.0, p.ampEnv.attackSec);
    num("env1.d", 0.005, 10.0, p.ampEnv.decaySec);
    num("env1.s", 0.0, 1.0, p.ampEnv.sustain);
    num("env1.r", 0.005, 12.0, p.ampEnv.releaseSec);

    num("env2.a", 0.001, 8.0, p.modEnv.attackSec);
    num("env2.d", 0.005, 10.0, p.modEnv.decaySec);
    num("env2.s", 0.0, 1.0, p.modEnv.sustain);
    num("env2.r", 0.005, 12.0, p.modEnv.releaseSec);

    if (fp.value(u"lfo1.shape").isDouble()) {
        const int s = std::clamp(fp.value(u"lfo1.shape").toInt(0), 0, 4);
        p.lfo.shape = static_cast<LfoShape>(s);
    }
    num("lfo1.rate", 0.02, 30.0, p.lfo.rateHz);
    flag("lfo1.sync", p.lfo.tempoSync);
    integer("lfo1.syncrate", 0, kLfoSyncDivCount - 1, p.lfo.syncDiv);
    num("lfo1.rise", 0.0, 5.0, p.lfo.riseSec);
    num("lfo1.phase", 0.0, 1.0, p.lfo.phase);
    flag("lfo1.retrig", p.lfo.retrig);
    num("lfo1.toPitch", -1.0, 1.0, p.lfo.toPitch);
    num("lfo1.toPos", -1.0, 1.0, p.lfo.toPos);
    num("lfo1.toCutoff", -1.0, 1.0, p.lfo.toCutoff);

    flag("master.mono", p.mono);
    flag("master.legato", p.legato);
    num("master.glide", 0.0, 2.0, p.glideSec);
    num("master.pitchBendRange", 0.0, 24.0, p.pitchBendRange);
    num("master.volume", 0.0, 1.5, p.masterVolume);
    num("perf.modwheel", 0.0, 1.0, p.modWheel);
    num("vel.toAmp", 0.0, 1.0, p.velToAmp);
    num("vel.toCutoff", -1.0, 1.0, p.velToCutoff);
}

}  // namespace

const std::vector<WavetablePreset>& factoryWavetablePresets() {
    static const std::vector<WavetablePreset> kPresets = buildFactoryPresets();
    return kPresets;
}

const WavetablePreset* findWavetablePreset(std::string_view id) noexcept {
    const auto& presets = factoryWavetablePresets();
    for (const auto& preset : presets) {
        if (preset.id == id) {
            return &preset;
        }
    }
    return nullptr;
}

QStringList wavetablePresetIds() {
    QStringList ids;
    const auto& presets = factoryWavetablePresets();
    ids.reserve(static_cast<qsizetype>(presets.size()));
    for (const auto& preset : presets) {
        ids.append(QString::fromUtf8(preset.id));
    }
    return ids;
}

QJsonObject wavetableParamsToJson(const WavetableSynthParams& p, const QString& presetId) {
    QJsonObject obj{
        {QStringLiteral("type"), QStringLiteral("wavetable")},
        {QStringLiteral("oscA"), oscToJson(p.oscA)},
        {QStringLiteral("oscB"), oscToJson(p.oscB)},
        {QStringLiteral("subOn"), p.sub.on},
        {QStringLiteral("subShape"), QString::fromUtf8(subShapeName(p.sub.shape))},
        {QStringLiteral("subLevel"), p.sub.on ? static_cast<double>(p.sub.level) : 0.0},
        {QStringLiteral("subOctave"), p.sub.octave},
        {QStringLiteral("noiseOn"), p.noise.on},
        {QStringLiteral("noiseType"), QString::fromUtf8(noiseTypeName(p.noise.type))},
        {QStringLiteral("noiseLevel"), p.noise.on ? static_cast<double>(p.noise.level) : 0.0},
        {QStringLiteral("filterOn"), p.filter.on},
        {QStringLiteral("filterType"), QString::fromUtf8(p.filter.on ? filterTypeName(p.filter.type) : "none")},
        {QStringLiteral("cutoffHz"), static_cast<double>(p.filter.cutoffHz)},
        {QStringLiteral("resonance"), static_cast<double>(p.filter.resonance)},
        {QStringLiteral("drive"), static_cast<double>(p.filter.drive)},
        {QStringLiteral("filterEnvAmount"), static_cast<double>(p.filter.envAmount) * 4.0},
        {QStringLiteral("keyTrack"), static_cast<double>(p.filter.keyTrack)},
        {QStringLiteral("ampEnv"), envToJson(p.ampEnv)},
        {QStringLiteral("modEnv"), envToJson(p.modEnv)},
        {QStringLiteral("lfo"), QJsonObject{
            {QStringLiteral("shape"), QString::fromUtf8(lfoShapeName(p.lfo.shape))},
            {QStringLiteral("rateHz"), static_cast<double>(p.lfo.rateHz)},
            {QStringLiteral("tempoSync"), p.lfo.tempoSync},
            {QStringLiteral("syncDiv"), p.lfo.syncDiv},
            {QStringLiteral("riseSec"), static_cast<double>(p.lfo.riseSec)},
            {QStringLiteral("phase"), static_cast<double>(p.lfo.phase)},
            {QStringLiteral("retrig"), p.lfo.retrig},
            {QStringLiteral("toPitch"), static_cast<double>(p.lfo.toPitch)},
            {QStringLiteral("toPos"), static_cast<double>(p.lfo.toPos)},
            {QStringLiteral("toCutoff"), static_cast<double>(p.lfo.toCutoff)},
        }},
        {QStringLiteral("velToAmp"), static_cast<double>(p.velToAmp)},
        {QStringLiteral("velToCutoff"), static_cast<double>(p.velToCutoff)},
        {QStringLiteral("mono"), p.mono},
        {QStringLiteral("legato"), p.legato},
        {QStringLiteral("glideMs"), static_cast<double>(p.glideSec) * 1000.0},
        {QStringLiteral("pitchBendRange"), static_cast<double>(p.pitchBendRange)},
        {QStringLiteral("modWheel"), static_cast<double>(p.modWheel)},
        {QStringLiteral("masterVolume"), static_cast<double>(p.masterVolume)},
        {QStringLiteral("gainDb"), gainDbFromMasterVolume(p.masterVolume)},
    };
    if (!presetId.isEmpty()) {
        obj.insert(QStringLiteral("preset"), presetId);
    }
    return obj;
}

WavetableSynthParams wavetableParamsFromJson(const QJsonObject& instrument) {
    WavetableSynthParams p;
    if (instrument.value(u"preset").isString()) {
        if (const auto* preset = findWavetablePreset(instrument.value(u"preset").toString().toStdString())) {
            p = preset->params;
        }
    }

    if (instrument.value(u"oscA").isObject()) parseOscJson(instrument.value(u"oscA").toObject(), p.oscA);
    if (instrument.value(u"oscB").isObject()) parseOscJson(instrument.value(u"oscB").toObject(), p.oscB);

    if (instrument.value(u"subLevel").isDouble()) {
        p.sub.level = static_cast<float>(clampFinite(instrument.value(u"subLevel").toDouble(), 0.0, 1.0, p.sub.level));
        p.sub.on = instrument.contains(u"subOn") ? instrument.value(u"subOn").toBool() : (p.sub.level > 0.0f);
    } else if (instrument.contains(u"subOn")) {
        p.sub.on = instrument.value(u"subOn").toBool(p.sub.on);
    }
    if (instrument.value(u"subShape").isString()) {
        p.sub.shape = subShapeFromName(instrument.value(u"subShape").toString().toStdString());
    }
    if (instrument.value(u"subOctave").isDouble()) {
        p.sub.octave = static_cast<int>(clampFinite(instrument.value(u"subOctave").toDouble(), -2.0, 0.0, p.sub.octave));
    }

    if (instrument.value(u"noiseLevel").isDouble()) {
        p.noise.level = static_cast<float>(clampFinite(instrument.value(u"noiseLevel").toDouble(), 0.0, 1.0, p.noise.level));
        p.noise.on = instrument.contains(u"noiseOn") ? instrument.value(u"noiseOn").toBool() : (p.noise.level > 0.0f);
    } else if (instrument.contains(u"noiseOn")) {
        p.noise.on = instrument.value(u"noiseOn").toBool(p.noise.on);
    }
    if (instrument.value(u"noiseType").isString()) {
        p.noise.type = noiseTypeFromName(instrument.value(u"noiseType").toString().toStdString());
    }

    if (instrument.value(u"filterType").isString()) {
        const auto ft = filterTypeFromName(instrument.value(u"filterType").toString().toStdString());
        if (ft == FilterType::None) {
            p.filter.on = false;
        } else {
            p.filter.type = ft;
            p.filter.on = instrument.contains(u"filterOn") ? instrument.value(u"filterOn").toBool(true) : true;
        }
    } else if (instrument.contains(u"filterOn")) {
        p.filter.on = instrument.value(u"filterOn").toBool(p.filter.on);
    }
    if (instrument.value(u"cutoffHz").isDouble()) {
        p.filter.cutoffHz = static_cast<float>(clampFinite(instrument.value(u"cutoffHz").toDouble(), 20.0, 20000.0, p.filter.cutoffHz));
    }
    if (instrument.value(u"resonance").isDouble()) {
        p.filter.resonance = static_cast<float>(clampFinite(instrument.value(u"resonance").toDouble(), 0.0, 0.99, p.filter.resonance));
    }
    if (instrument.value(u"drive").isDouble()) {
        p.filter.drive = static_cast<float>(clampFinite(instrument.value(u"drive").toDouble(), 0.0, 1.0, p.filter.drive));
    }
    if (instrument.value(u"filterEnvAmount").isDouble()) {
        // Web stores filterEnvAmount in octaves (-4..+4); engine stores -1..+1 (x4 octaves).
        p.filter.envAmount = static_cast<float>(clampFinite(instrument.value(u"filterEnvAmount").toDouble() * 0.25, -1.0, 1.0, p.filter.envAmount));
    }
    if (instrument.value(u"keyTrack").isDouble()) {
        p.filter.keyTrack = static_cast<float>(clampFinite(instrument.value(u"keyTrack").toDouble(), 0.0, 1.0, p.filter.keyTrack));
    }

    if (instrument.value(u"ampEnv").isObject()) parseEnvJson(instrument.value(u"ampEnv").toObject(), p.ampEnv);
    if (instrument.value(u"modEnv").isObject()) parseEnvJson(instrument.value(u"modEnv").toObject(), p.modEnv);

    if (instrument.value(u"lfo").isObject()) {
        const auto lfo = instrument.value(u"lfo").toObject();
        if (lfo.value(u"shape").isString()) p.lfo.shape = lfoShapeFromName(lfo.value(u"shape").toString().toStdString());
        if (lfo.value(u"rateHz").isDouble()) p.lfo.rateHz = static_cast<float>(clampFinite(lfo.value(u"rateHz").toDouble(), 0.02, 30.0, p.lfo.rateHz));
        if (lfo.contains(u"tempoSync")) p.lfo.tempoSync = lfo.value(u"tempoSync").toBool(p.lfo.tempoSync);
        if (lfo.value(u"syncDiv").isDouble()) p.lfo.syncDiv = static_cast<int>(clampFinite(lfo.value(u"syncDiv").toDouble(), 0.0, kLfoSyncDivCount - 1, p.lfo.syncDiv));
        if (lfo.value(u"riseSec").isDouble()) p.lfo.riseSec = static_cast<float>(clampFinite(lfo.value(u"riseSec").toDouble(), 0.0, 5.0, p.lfo.riseSec));
        if (lfo.value(u"phase").isDouble()) p.lfo.phase = static_cast<float>(clampFinite(lfo.value(u"phase").toDouble(), 0.0, 1.0, p.lfo.phase));
        if (lfo.contains(u"retrig")) p.lfo.retrig = lfo.value(u"retrig").toBool(p.lfo.retrig);
        if (lfo.value(u"toPitch").isDouble()) p.lfo.toPitch = static_cast<float>(clampFinite(lfo.value(u"toPitch").toDouble(), -1.0, 1.0, p.lfo.toPitch));
        if (lfo.value(u"toPos").isDouble()) p.lfo.toPos = static_cast<float>(clampFinite(lfo.value(u"toPos").toDouble(), -1.0, 1.0, p.lfo.toPos));
        if (lfo.value(u"toCutoff").isDouble()) p.lfo.toCutoff = static_cast<float>(clampFinite(lfo.value(u"toCutoff").toDouble(), -1.0, 1.0, p.lfo.toCutoff));
    }

    if (instrument.value(u"velToAmp").isDouble()) {
        p.velToAmp = static_cast<float>(clampFinite(instrument.value(u"velToAmp").toDouble(), 0.0, 1.0, p.velToAmp));
    }
    if (instrument.value(u"velToCutoff").isDouble()) {
        p.velToCutoff = static_cast<float>(clampFinite(instrument.value(u"velToCutoff").toDouble(), -1.0, 1.0, p.velToCutoff));
    }
    if (instrument.contains(u"mono")) p.mono = instrument.value(u"mono").toBool(p.mono);
    if (instrument.contains(u"legato")) p.legato = instrument.value(u"legato").toBool(p.legato);
    if (instrument.value(u"glideMs").isDouble()) {
        p.glideSec = static_cast<float>(clampFinite(instrument.value(u"glideMs").toDouble() / 1000.0, 0.0, 2.0, p.glideSec));
    }
    if (instrument.value(u"pitchBendRange").isDouble()) {
        p.pitchBendRange = static_cast<float>(clampFinite(instrument.value(u"pitchBendRange").toDouble(), 0.0, 24.0, p.pitchBendRange));
    }
    if (instrument.value(u"modWheel").isDouble()) {
        p.modWheel = static_cast<float>(clampFinite(instrument.value(u"modWheel").toDouble(), 0.0, 1.0, p.modWheel));
    }
    if (instrument.value(u"masterVolume").isDouble()) {
        p.masterVolume = static_cast<float>(clampFinite(instrument.value(u"masterVolume").toDouble(), 0.0, 1.5, p.masterVolume));
    } else if (instrument.value(u"gainDb").isDouble()) {
        p.masterVolume = masterVolumeFromGainDb(instrument.value(u"gainDb").toDouble());
    }

    if (instrument.value(u"fableParams").isObject()) {
        applyFableParams(instrument.value(u"fableParams").toObject(), p);
    }

    return p;
}

}  // namespace nt::midi
