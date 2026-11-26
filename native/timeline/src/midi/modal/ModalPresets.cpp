// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#include "midi/modal/ModalPresets.h"

#include <QJsonValue>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

using namespace modal;

double numOr(const QJsonObject& obj, const char* key, double fallback, double lo, double hi) {
    const QJsonValue v = obj.value(QLatin1String(key));
    if (!v.isDouble()) return fallback;
    const double d = v.toDouble();
    return std::isfinite(d) ? std::clamp(d, lo, hi) : fallback;
}

bool boolOr(const QJsonObject& obj, const char* key, bool fallback) {
    const QJsonValue v = obj.value(QLatin1String(key));
    return v.isBool() ? v.toBool() : fallback;
}

std::vector<ModalPreset> buildFactoryPresets() {
    std::vector<ModalPreset> out;
    out.reserve(14);

    // 1. Marimba (warm rosewood bar)
    {
        ModalSynthParams p{};
        p.malletStiff = 1530.0f;
        p.malletRes = 0.35f;
        p.velMalletRes = 0.65f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba;
        p.a.partials = 32;
        p.a.decay = 6.5f;
        p.a.damp = -0.54f;
        p.a.tone = 0.0f;
        p.a.hit = 0.26f;
        p.a.cut = 0.28f;
        p.b.on = false;
        p.gainDb = 10.0f;
        out.push_back({"modal-marimba", "Marimba", "Mallets", p});
    }

    // 2. Concert Marimba (mesh2faust Marimba2 bar)
    {
        ModalSynthParams p{};
        p.malletStiff = 1350.0f;
        p.malletRes = 0.45f;
        p.velMalletRes = 0.55f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba2;
        p.a.partials = 32;
        p.a.decay = 4.2f;
        p.a.damp = -0.45f;
        p.a.tone = -0.10f;
        p.a.hit = 0.24f;
        p.b.on = false;
        p.gainDb = 8.0f;
        out.push_back({"modal-concert-marimba", "Concert Marimba", "Mallets", p});
    }

    // 3. Vibraphone (Marimba bar coupled serially into a closed resonator tube)
    {
        ModalSynthParams p{};
        p.malletStiff = 2050.0f;
        p.malletRes = 0.30f;
        p.velMalletRes = 0.70f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba;
        p.a.partials = 32;
        p.a.decay = 4.1f;
        p.a.damp = -0.42f;
        p.a.hit = 0.26f;
        p.b.on = true;
        p.b.model = ModalModel::ClosedTube;
        p.b.decay = 0.68f;
        p.b.radius = 0.74f;
        p.b.fine = 4.0f;
        p.coupling = ModalCoupling::Serial;
        p.abSplit = 0.12f;
        p.gainDb = -6.0f;
        out.push_back({"modal-vibes", "Vibraphone", "Mallets", p});
    }

    // 4. Tubular Bells (long-decay Beam resonator)
    {
        ModalSynthParams p{};
        p.malletStiff = 630.0f;
        p.malletRes = 0.30f;
        p.velMalletRes = 0.70f;
        p.noiseRes = 0.0f;
        p.velNoiseRes = 0.35f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 2035.0f;
        p.noiseFilterQ = 2.3f;
        p.noiseDecayMs = 420.0f;
        p.a.on = true;
        p.a.model = ModalModel::Beam;
        p.a.partials = 32;
        p.a.decay = 10.8f;
        p.a.damp = -0.62f;
        p.a.tone = -0.20f;
        p.a.hit = 0.50f;
        p.a.ratio = 2.0f;
        p.a.cut = 0.42f;
        p.b.on = false;
        p.gainDb = 6.0f;
        out.push_back({"modal-tubular-bells", "Tubular Bells", "Bells", p});
    }

    // 5. Church Bell (mesh2faust Russian Bell)
    {
        ModalSynthParams p{};
        p.malletStiff = 1800.0f;
        p.malletRes = 0.55f;
        p.velMalletRes = 0.45f;
        p.a.on = true;
        p.a.model = ModalModel::Bell;
        p.a.partials = 32;
        p.a.decay = 12.0f;
        p.a.damp = -0.38f;
        p.a.tone = 0.05f;
        p.a.hit = 0.32f;
        p.b.on = false;
        p.gainDb = 6.0f;
        out.push_back({"modal-church-bell", "Church Bell", "Bells", p});
    }

    // 6. Kalimba (Marimba + Beam fifth shimmer in parallel)
    {
        ModalSynthParams p{};
        p.malletStiff = 1207.0f;
        p.malletRes = 0.80f;
        p.noiseRes = 0.12f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 314.0f;
        p.noiseFilterQ = 1.58f;
        p.noiseDecayMs = 233.0f;
        p.noiseReleaseMs = 165.0f;
        p.a.on = true;
        p.a.model = ModalModel::Marimba;
        p.a.partials = 32;
        p.a.decay = 9.0f;
        p.a.damp = -0.24f;
        p.a.tone = 0.15f;
        p.a.hit = 0.31f;
        p.a.release = 0.76f;
        p.a.inharm = 0.0089f;
        p.b.on = true;
        p.b.model = ModalModel::Beam;
        p.b.partials = 32;
        p.b.decay = 1.04f;
        p.b.damp = -0.08f;
        p.b.hit = 0.24f;
        p.b.release = 0.85f;
        p.b.ratio = 2.0f;
        p.b.coarse = 7.0f;
        p.b.cut = 0.50f;
        p.coupling = ModalCoupling::Parallel;
        p.abMix = 0.50f;
        p.gainDb = 8.0f;
        out.push_back({"modal-kalimba", "Kalimba", "Mallets", p});
    }

    // 7. Steel Drum (bright metallic membrane + octave plate)
    {
        ModalSynthParams p{};
        p.malletStiff = 2600.0f;
        p.malletRes = 0.75f;
        p.velMalletStiff = 0.30f;
        p.a.on = true;
        p.a.model = ModalModel::Membrane;
        p.a.partials = 32;
        p.a.decay = 2.8f;
        p.a.damp = -0.18f;
        p.a.tone = 0.28f;
        p.a.hit = 0.35f;
        p.a.inharm = 0.004f;
        p.a.ratio = 0.85f;
        p.b.on = true;
        p.b.model = ModalModel::Plate;
        p.b.partials = 16;
        p.b.decay = 1.6f;
        p.b.damp = -0.35f;
        p.b.tone = 0.20f;
        p.b.hit = 0.28f;
        p.b.ratio = 0.78f;
        p.b.coarse = 12.0f;
        p.coupling = ModalCoupling::Parallel;
        p.abMix = 0.38f;
        p.gainDb = 4.0f;
        out.push_back({"modal-steel-drum", "Steel Drum", "Percussion", p});
    }

    // 8. Concert Tom (Bessel circular drumhead membrane)
    {
        ModalSynthParams p{};
        p.malletStiff = 480.0f;
        p.malletRes = 0.85f;
        p.velMalletStiff = 0.25f;
        p.noiseRes = 0.08f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 900.0f;
        p.noiseFilterQ = 1.4f;
        p.noiseDecayMs = 45.0f;
        p.a.on = true;
        p.a.model = ModalModel::Drumhead;
        p.a.partials = 32;
        p.a.decay = 1.4f;
        p.a.damp = -0.45f;
        p.a.tone = -0.15f;
        p.a.hit = 0.28f;
        p.b.on = false;
        p.gainDb = 4.0f;
        out.push_back({"modal-concert-tom", "Concert Tom", "Percussion", p});
    }

    // 9. Djembe (hand drum with skin slap)
    {
        ModalSynthParams p{};
        p.malletStiff = 820.0f;
        p.malletRes = 0.80f;
        p.noiseMix = 0.05f;
        p.noiseRes = 0.16f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 1400.0f;
        p.noiseFilterQ = 1.6f;
        p.noiseDecayMs = 35.0f;
        p.noiseReleaseMs = 40.0f;
        p.a.on = true;
        p.a.model = ModalModel::Djembe;
        p.a.partials = 24;  // sanitized to 32
        p.a.decay = 0.95f;
        p.a.damp = -0.50f;
        p.a.tone = -0.10f;
        p.a.hit = 0.22f;
        p.a.ratio = 1.0f;
        p.b.on = false;
        p.gainDb = 5.0f;
        out.push_back({"modal-djembe", "Djembe", "Percussion", p});
    }

    // 10. Plucked Harp (harmonic string model)
    {
        ModalSynthParams p{};
        p.malletStiff = 2200.0f;
        p.malletRes = 0.75f;
        p.velMalletStiff = 0.35f;
        p.a.on = true;
        p.a.model = ModalModel::String;
        p.a.partials = 32;
        p.a.decay = 5.2f;
        p.a.damp = -0.42f;
        p.a.tone = -0.05f;
        p.a.hit = 0.18f;
        p.a.release = 0.35f;
        p.a.inharm = 0.0003f;
        p.b.on = false;
        p.gainDb = 4.0f;
        out.push_back({"modal-plucked-harp", "Plucked Harp", "Plucked", p});
    }

    // 11. Crystal Glass (shimmering resonant glass plate)
    {
        ModalSynthParams p{};
        p.malletStiff = 3600.0f;
        p.malletRes = 0.65f;
        p.a.on = true;
        p.a.model = ModalModel::Plate;
        p.a.partials = 32;
        p.a.decay = 7.5f;
        p.a.damp = -0.25f;
        p.a.tone = 0.30f;
        p.a.hit = 0.38f;
        p.a.inharm = 0.002f;
        p.a.ratio = 0.62f;
        p.a.cut = 0.38f;
        p.b.on = true;
        p.b.model = ModalModel::Beam;
        p.b.partials = 16;
        p.b.decay = 4.0f;
        p.b.damp = -0.30f;
        p.b.tone = 0.25f;
        p.b.hit = 0.45f;
        p.b.ratio = 2.0f;
        p.b.coarse = 12.0f;
        p.coupling = ModalCoupling::Parallel;
        p.abMix = 0.30f;
        p.gainDb = 3.0f;
        out.push_back({"modal-crystal-glass", "Crystal Glass", "Bells", p});
    }

    // 12. Wood Block (tight woody knock)
    {
        ModalSynthParams p{};
        p.malletStiff = 2800.0f;
        p.malletRes = 0.90f;
        p.malletMix = 0.06f;
        p.a.on = true;
        p.a.model = ModalModel::Squared;
        p.a.partials = 16;
        p.a.decay = 0.22f;
        p.a.damp = -0.60f;
        p.a.tone = 0.10f;
        p.a.hit = 0.26f;
        p.a.cut = 0.32f;
        p.b.on = true;
        p.b.model = ModalModel::Marimba;
        p.b.partials = 16;
        p.b.decay = 0.16f;
        p.b.damp = -0.50f;
        p.b.hit = 0.30f;
        p.b.coarse = 5.0f;
        p.coupling = ModalCoupling::Parallel;
        p.abMix = 0.45f;
        p.gainDb = 8.0f;
        out.push_back({"modal-wood-block", "Wood Block", "Percussion", p});
    }

    // 13. Open Pipe (OpenTube waveguide with airy excitation)
    {
        ModalSynthParams p{};
        p.malletStiff = 1200.0f;
        p.malletRes = 0.55f;
        p.noiseRes = 0.24f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 1600.0f;
        p.noiseFilterQ = 1.2f;
        p.noiseAttackMs = 18.0f;
        p.noiseDecayMs = 280.0f;
        p.noiseSustain = 0.30f;
        p.noiseReleaseMs = 140.0f;
        p.a.on = true;
        p.a.model = ModalModel::OpenTube;
        p.a.decay = 2.6f;
        p.a.radius = 0.72f;
        p.a.release = 0.25f;
        p.b.on = false;
        p.gainDb = -2.0f;
        out.push_back({"modal-open-tube", "Open Pipe", "Tubes", p});
    }

    // 14. Closed Tube (ClosedTube odd-harmonic waveguide)
    {
        ModalSynthParams p{};
        p.malletStiff = 950.0f;
        p.malletRes = 0.65f;
        p.noiseRes = 0.18f;
        p.noiseFilterMode = NoiseFilterMode::BandPass;
        p.noiseFilterFreq = 1100.0f;
        p.noiseFilterQ = 1.5f;
        p.noiseAttackMs = 10.0f;
        p.noiseDecayMs = 220.0f;
        p.noiseSustain = 0.20f;
        p.noiseReleaseMs = 120.0f;
        p.a.on = true;
        p.a.model = ModalModel::ClosedTube;
        p.a.decay = 2.2f;
        p.a.radius = 0.78f;
        p.a.release = 0.30f;
        p.b.on = false;
        p.gainDb = -2.0f;
        out.push_back({"modal-closed-tube", "Closed Tube", "Tubes", p});
    }

    return out;
}

}  // namespace

const std::vector<ModalPreset>& factoryModalPresets() {
    static const std::vector<ModalPreset> kPresets = buildFactoryPresets();
    return kPresets;
}

const ModalPreset* findModalPreset(std::string_view id) noexcept {
    for (const auto& preset : factoryModalPresets()) {
        if (preset.id == id) return &preset;
    }
    return nullptr;
}

QStringList modalPresetIds() {
    QStringList ids;
    for (const auto& preset : factoryModalPresets()) {
        ids.append(QString::fromUtf8(preset.id));
    }
    return ids;
}

QJsonObject modalParamsToJson(const ModalSynthParams& p, const QString& presetId) {
    QJsonObject obj;
    obj.insert(u"type", QStringLiteral("modal"));
    if (!presetId.isEmpty()) {
        obj.insert(u"preset", presetId);
    }

    obj.insert(u"malletMix", static_cast<double>(p.malletMix));
    obj.insert(u"malletRes", static_cast<double>(p.malletRes));
    obj.insert(u"malletStiff", static_cast<double>(p.malletStiff));
    obj.insert(u"velMalletMix", static_cast<double>(p.velMalletMix));
    obj.insert(u"velMalletRes", static_cast<double>(p.velMalletRes));
    obj.insert(u"velMalletStiff", static_cast<double>(p.velMalletStiff));

    obj.insert(u"noiseOsc", static_cast<double>(p.noiseOsc));
    obj.insert(u"noiseMix", static_cast<double>(p.noiseMix));
    obj.insert(u"noiseRes", static_cast<double>(p.noiseRes));
    obj.insert(u"noiseFilterMode", QString::fromUtf8(modal::noiseFilterModeName(p.noiseFilterMode)));
    obj.insert(u"noiseFilterFreq", static_cast<double>(p.noiseFilterFreq));
    obj.insert(u"noiseFilterQ", static_cast<double>(p.noiseFilterQ));
    obj.insert(u"noiseAttackMs", static_cast<double>(p.noiseAttackMs));
    obj.insert(u"noiseDecayMs", static_cast<double>(p.noiseDecayMs));
    obj.insert(u"noiseSustain", static_cast<double>(p.noiseSustain));
    obj.insert(u"noiseReleaseMs", static_cast<double>(p.noiseReleaseMs));
    obj.insert(u"noiseAttackTension", static_cast<double>(p.noiseAttackTension));
    obj.insert(u"noiseDecayTension", static_cast<double>(p.noiseDecayTension));
    obj.insert(u"noiseReleaseTension", static_cast<double>(p.noiseReleaseTension));
    obj.insert(u"velNoiseMix", static_cast<double>(p.velNoiseMix));
    obj.insert(u"velNoiseRes", static_cast<double>(p.velNoiseRes));
    obj.insert(u"velNoiseFreq", static_cast<double>(p.velNoiseFreq));
    obj.insert(u"velNoiseQ", static_cast<double>(p.velNoiseQ));
    obj.insert(u"velNoiseAttack", static_cast<double>(p.velNoiseAttack));
    obj.insert(u"velNoiseDecay", static_cast<double>(p.velNoiseDecay));
    obj.insert(u"velNoiseSustain", static_cast<double>(p.velNoiseSustain));
    obj.insert(u"velNoiseRelease", static_cast<double>(p.velNoiseRelease));

    obj.insert(u"aOn", p.a.on);
    obj.insert(u"aModel", QString::fromUtf8(modal::modalModelName(p.a.model)));
    obj.insert(u"aPartials", modal::sanitizePartialCount(p.a.partials));
    obj.insert(u"aDecay", static_cast<double>(p.a.decay));
    obj.insert(u"aDamp", static_cast<double>(p.a.damp));
    obj.insert(u"aTone", static_cast<double>(p.a.tone));
    obj.insert(u"aHit", static_cast<double>(p.a.hit));
    obj.insert(u"aRelease", static_cast<double>(p.a.release));
    obj.insert(u"aInharm", static_cast<double>(p.a.inharm));
    obj.insert(u"aRatio", static_cast<double>(p.a.ratio));
    obj.insert(u"aCut", static_cast<double>(p.a.cut));
    obj.insert(u"aRadius", static_cast<double>(p.a.radius));
    obj.insert(u"aCoarse", static_cast<double>(p.a.coarse));
    obj.insert(u"aFine", static_cast<double>(p.a.fine));
    obj.insert(u"velADecay", static_cast<double>(p.a.velDecay));
    obj.insert(u"velAHit", static_cast<double>(p.a.velHit));
    obj.insert(u"velAInharm", static_cast<double>(p.a.velInharm));
    obj.insert(u"velADamp", static_cast<double>(p.a.velDamp));
    obj.insert(u"velATone", static_cast<double>(p.a.velTone));

    obj.insert(u"bOn", p.b.on);
    obj.insert(u"bModel", QString::fromUtf8(modal::modalModelName(p.b.model)));
    obj.insert(u"bPartials", modal::sanitizePartialCount(p.b.partials));
    obj.insert(u"bDecay", static_cast<double>(p.b.decay));
    obj.insert(u"bDamp", static_cast<double>(p.b.damp));
    obj.insert(u"bTone", static_cast<double>(p.b.tone));
    obj.insert(u"bHit", static_cast<double>(p.b.hit));
    obj.insert(u"bRelease", static_cast<double>(p.b.release));
    obj.insert(u"bInharm", static_cast<double>(p.b.inharm));
    obj.insert(u"bRatio", static_cast<double>(p.b.ratio));
    obj.insert(u"bCut", static_cast<double>(p.b.cut));
    obj.insert(u"bRadius", static_cast<double>(p.b.radius));
    obj.insert(u"bCoarse", static_cast<double>(p.b.coarse));
    obj.insert(u"bFine", static_cast<double>(p.b.fine));
    obj.insert(u"velBDecay", static_cast<double>(p.b.velDecay));
    obj.insert(u"velBHit", static_cast<double>(p.b.velHit));
    obj.insert(u"velBInharm", static_cast<double>(p.b.velInharm));
    obj.insert(u"velBDamp", static_cast<double>(p.b.velDamp));
    obj.insert(u"velBTone", static_cast<double>(p.b.velTone));

    obj.insert(u"coupling", QString::fromUtf8(modal::modalCouplingName(p.coupling)));
    obj.insert(u"abMix", static_cast<double>(p.abMix));
    obj.insert(u"abSplit", static_cast<double>(p.abSplit));
    obj.insert(u"gainDb", static_cast<double>(p.gainDb));
    obj.insert(u"pitchBendRange", p.pitchBendRange);
    obj.insert(u"stereoizer", p.stereoizer);
    obj.insert(u"polyphony", p.polyphony);
    obj.insert(u"reuseVoices", p.reuseVoices);
    obj.insert(u"fadeoutRepeats", p.fadeoutRepeats);
    return obj;
}

ModalSynthParams modalParamsFromJson(const QJsonObject& obj) {
    ModalSynthParams p{};
    if (const QJsonValue pv = obj.value(u"preset"); pv.isString()) {
        if (const auto* preset = findModalPreset(pv.toString().toStdString())) {
            p = preset->params;
        }
    }

    p.malletMix = static_cast<float>(numOr(obj, "malletMix", p.malletMix, 0.0, 1.0));
    p.malletRes = static_cast<float>(numOr(obj, "malletRes", p.malletRes, 0.0, 1.0));
    p.malletStiff = static_cast<float>(numOr(obj, "malletStiff", p.malletStiff, 100.0, 5000.0));
    p.velMalletMix = static_cast<float>(numOr(obj, "velMalletMix", p.velMalletMix, -1.0, 1.0));
    p.velMalletRes = static_cast<float>(numOr(obj, "velMalletRes", p.velMalletRes, -1.0, 1.0));
    p.velMalletStiff = static_cast<float>(numOr(obj, "velMalletStiff", p.velMalletStiff, -1.0, 1.0));

    p.noiseOsc = static_cast<float>(numOr(obj, "noiseOsc", p.noiseOsc, 0.0, 1.0));
    p.noiseMix = static_cast<float>(numOr(obj, "noiseMix", p.noiseMix, 0.0, 1.0));
    p.noiseRes = static_cast<float>(numOr(obj, "noiseRes", p.noiseRes, 0.0, 1.0));
    if (const QJsonValue v = obj.value(u"noiseFilterMode"); v.isString()) {
        if (const auto parsed = modal::tryNoiseFilterModeFromName(v.toString().toStdString())) {
            p.noiseFilterMode = *parsed;
        }
    }
    p.noiseFilterFreq = static_cast<float>(numOr(obj, "noiseFilterFreq", p.noiseFilterFreq, 20.0, 20000.0));
    p.noiseFilterQ = static_cast<float>(numOr(obj, "noiseFilterQ", p.noiseFilterQ, 0.707, 4.0));
    p.noiseAttackMs = static_cast<float>(numOr(obj, "noiseAttackMs", p.noiseAttackMs, 1.0, 20000.0));
    p.noiseDecayMs = static_cast<float>(numOr(obj, "noiseDecayMs", p.noiseDecayMs, 1.0, 20000.0));
    p.noiseSustain = static_cast<float>(numOr(obj, "noiseSustain", p.noiseSustain, 0.0, 1.0));
    p.noiseReleaseMs = static_cast<float>(numOr(obj, "noiseReleaseMs", p.noiseReleaseMs, 1.0, 20000.0));
    p.noiseAttackTension = static_cast<float>(numOr(obj, "noiseAttackTension", p.noiseAttackTension, -1.0, 1.0));
    p.noiseDecayTension = static_cast<float>(numOr(obj, "noiseDecayTension", p.noiseDecayTension, -1.0, 1.0));
    p.noiseReleaseTension = static_cast<float>(numOr(obj, "noiseReleaseTension", p.noiseReleaseTension, -1.0, 1.0));
    p.velNoiseMix = static_cast<float>(numOr(obj, "velNoiseMix", p.velNoiseMix, -1.0, 1.0));
    p.velNoiseRes = static_cast<float>(numOr(obj, "velNoiseRes", p.velNoiseRes, -1.0, 1.0));
    p.velNoiseFreq = static_cast<float>(numOr(obj, "velNoiseFreq", p.velNoiseFreq, -1.0, 1.0));
    p.velNoiseQ = static_cast<float>(numOr(obj, "velNoiseQ", p.velNoiseQ, -1.0, 1.0));
    p.velNoiseAttack = static_cast<float>(numOr(obj, "velNoiseAttack", p.velNoiseAttack, -1.0, 1.0));
    p.velNoiseDecay = static_cast<float>(numOr(obj, "velNoiseDecay", p.velNoiseDecay, -1.0, 1.0));
    p.velNoiseSustain = static_cast<float>(numOr(obj, "velNoiseSustain", p.velNoiseSustain, -1.0, 1.0));
    p.velNoiseRelease = static_cast<float>(numOr(obj, "velNoiseRelease", p.velNoiseRelease, -1.0, 1.0));

    p.a.on = boolOr(obj, "aOn", p.a.on);
    if (const QJsonValue v = obj.value(u"aModel"); v.isString()) {
        if (const auto parsed = modal::tryModalModelFromName(v.toString().toStdString())) {
            p.a.model = *parsed;
        }
    }
    p.a.partials = modal::sanitizePartialCount(static_cast<int>(std::llround(numOr(obj, "aPartials", p.a.partials, 1.0, 64.0))));
    p.a.decay = static_cast<float>(numOr(obj, "aDecay", p.a.decay, 0.01, 100.0));
    p.a.damp = static_cast<float>(numOr(obj, "aDamp", p.a.damp, -1.0, 1.0));
    p.a.tone = static_cast<float>(numOr(obj, "aTone", p.a.tone, -1.0, 1.0));
    p.a.hit = static_cast<float>(numOr(obj, "aHit", p.a.hit, 0.02, 0.5));
    p.a.release = static_cast<float>(numOr(obj, "aRelease", p.a.release, 0.001, 1.0));
    p.a.inharm = static_cast<float>(numOr(obj, "aInharm", p.a.inharm, 0.0, 1.0));
    p.a.ratio = static_cast<float>(numOr(obj, "aRatio", p.a.ratio, 0.1, 10.0));
    p.a.cut = static_cast<float>(numOr(obj, "aCut", p.a.cut, -1.0, 1.0));
    p.a.radius = static_cast<float>(numOr(obj, "aRadius", p.a.radius, 0.0, 1.0));
    p.a.coarse = static_cast<float>(numOr(obj, "aCoarse", p.a.coarse, -48.0, 48.0));
    p.a.fine = static_cast<float>(numOr(obj, "aFine", p.a.fine, -99.0, 99.0));
    p.a.velDecay = static_cast<float>(numOr(obj, "velADecay", p.a.velDecay, -1.0, 1.0));
    p.a.velHit = static_cast<float>(numOr(obj, "velAHit", p.a.velHit, -1.0, 1.0));
    p.a.velInharm = static_cast<float>(numOr(obj, "velAInharm", p.a.velInharm, -1.0, 1.0));
    p.a.velDamp = static_cast<float>(numOr(obj, "velADamp", p.a.velDamp, -1.0, 1.0));
    p.a.velTone = static_cast<float>(numOr(obj, "velATone", p.a.velTone, -1.0, 1.0));

    p.b.on = boolOr(obj, "bOn", p.b.on);
    if (const QJsonValue v = obj.value(u"bModel"); v.isString()) {
        if (const auto parsed = modal::tryModalModelFromName(v.toString().toStdString())) {
            p.b.model = *parsed;
        }
    }
    p.b.partials = modal::sanitizePartialCount(static_cast<int>(std::llround(numOr(obj, "bPartials", p.b.partials, 1.0, 64.0))));
    p.b.decay = static_cast<float>(numOr(obj, "bDecay", p.b.decay, 0.01, 100.0));
    p.b.damp = static_cast<float>(numOr(obj, "bDamp", p.b.damp, -1.0, 1.0));
    p.b.tone = static_cast<float>(numOr(obj, "bTone", p.b.tone, -1.0, 1.0));
    p.b.hit = static_cast<float>(numOr(obj, "bHit", p.b.hit, 0.02, 0.5));
    p.b.release = static_cast<float>(numOr(obj, "bRelease", p.b.release, 0.001, 1.0));
    p.b.inharm = static_cast<float>(numOr(obj, "bInharm", p.b.inharm, 0.0, 1.0));
    p.b.ratio = static_cast<float>(numOr(obj, "bRatio", p.b.ratio, 0.1, 10.0));
    p.b.cut = static_cast<float>(numOr(obj, "bCut", p.b.cut, -1.0, 1.0));
    p.b.radius = static_cast<float>(numOr(obj, "bRadius", p.b.radius, 0.0, 1.0));
    p.b.coarse = static_cast<float>(numOr(obj, "bCoarse", p.b.coarse, -48.0, 48.0));
    p.b.fine = static_cast<float>(numOr(obj, "bFine", p.b.fine, -99.0, 99.0));
    p.b.velDecay = static_cast<float>(numOr(obj, "velBDecay", p.b.velDecay, -1.0, 1.0));
    p.b.velHit = static_cast<float>(numOr(obj, "velBHit", p.b.velHit, -1.0, 1.0));
    p.b.velInharm = static_cast<float>(numOr(obj, "velBInharm", p.b.velInharm, -1.0, 1.0));
    p.b.velDamp = static_cast<float>(numOr(obj, "velBDamp", p.b.velDamp, -1.0, 1.0));
    p.b.velTone = static_cast<float>(numOr(obj, "velBTone", p.b.velTone, -1.0, 1.0));

    if (const QJsonValue v = obj.value(u"coupling"); v.isString()) {
        if (const auto parsed = modal::tryModalCouplingFromName(v.toString().toStdString())) {
            p.coupling = *parsed;
        }
    }
    p.abMix = static_cast<float>(numOr(obj, "abMix", p.abMix, 0.0, 1.0));
    p.abSplit = static_cast<float>(numOr(obj, "abSplit", p.abSplit, 0.01, 1.0));
    p.gainDb = static_cast<float>(numOr(obj, "gainDb", p.gainDb, -24.0, 24.0));
    p.pitchBendRange = static_cast<int>(std::llround(numOr(obj, "pitchBendRange", p.pitchBendRange, 1.0, 24.0)));
    p.stereoizer = boolOr(obj, "stereoizer", p.stereoizer);
    p.polyphony = static_cast<int>(std::llround(numOr(obj, "polyphony", p.polyphony, 1.0, 16.0)));
    p.reuseVoices = boolOr(obj, "reuseVoices", p.reuseVoices);
    p.fadeoutRepeats = boolOr(obj, "fadeoutRepeats", p.fadeoutRepeats);
    return p;
}

}  // namespace nt::midi
