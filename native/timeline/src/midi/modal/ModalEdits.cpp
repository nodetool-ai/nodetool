// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#include "midi/modal/ModalEdits.h"
#include "midi/modal/ModalPresets.h"
#include "app/EditRegistry.h"

#include <QJsonArray>
#include <QJsonValue>
#include <QString>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

bool applyFloatParam(const QJsonObject& payload, const char* key, float& target,
                     double lo, double hi, bool& anyValid) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    anyValid = true;
    const float next = static_cast<float>(std::clamp(d, lo, hi));
    if (next == target) return false;
    target = next;
    return true;
}

bool applyIntParam(const QJsonObject& payload, const char* key, int& target,
                   int lo, int hi, bool& anyValid) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    anyValid = true;
    const int next = std::clamp(static_cast<int>(std::llround(d)), lo, hi);
    if (next == target) return false;
    target = next;
    return true;
}

bool applyBoolParam(const QJsonObject& payload, const char* key, bool& target, bool& anyValid) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isBool()) return false;
    anyValid = true;
    const bool next = v.toBool();
    if (next == target) return false;
    target = next;
    return true;
}

}  // namespace

QJsonObject setModalPresetEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const QString presetId = payload.value(u"preset").toString();
    if (trackId.isEmpty() || presetId.isEmpty()) return doc;
    const auto* preset = findModalPreset(presetId.toStdString());
    if (!preset) return doc;

    const QJsonObject nextInstrument = modalParamsToJson(preset->params, presetId);
    auto tracks = doc.value(u"tracks").toArray();
    bool changed = false;
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) {
            return doc;
        }
        if (track.value(u"instrument").toObject() == nextInstrument) {
            return doc;
        }
        track.insert(u"instrument", nextInstrument);
        tracks[i] = track;
        changed = true;
        break;
    }
    if (changed) {
        doc.insert(u"tracks", tracks);
    }
    return doc;
}

QJsonObject setModalParamsEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    if (trackId.isEmpty()) return doc;

    auto tracks = doc.value(u"tracks").toArray();
    bool changed = false;
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        auto track = tracks[i].toObject();
        if (track.value(u"id").toString() != trackId) continue;
        if (track.value(u"type").toString() != u"midi" || track.value(u"locked").toBool()) {
            return doc;
        }

        const QJsonObject currentInst = track.value(u"instrument").toObject();
        const bool wasModal = (currentInst.value(u"type").toString() == u"modal");
        ModalSynthParams p = wasModal ? modalParamsFromJson(currentInst) : ModalSynthParams{};
        QString presetId = wasModal ? currentInst.value(u"preset").toString() : QString{};

        bool anyValid = false;
        bool anyPatched = false;

        anyPatched |= applyFloatParam(payload, "malletMix", p.malletMix, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "malletRes", p.malletRes, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "malletStiff", p.malletStiff, 100.0, 5000.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velMalletMix", p.velMalletMix, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velMalletRes", p.velMalletRes, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velMalletStiff", p.velMalletStiff, -1.0, 1.0, anyValid);

        anyPatched |= applyFloatParam(payload, "noiseOsc", p.noiseOsc, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseMix", p.noiseMix, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseRes", p.noiseRes, 0.0, 1.0, anyValid);
        if (const QJsonValue v = payload.value(u"noiseFilterMode"); v.isString()) {
            if (const auto parsed = modal::tryNoiseFilterModeFromName(v.toString().toStdString())) {
                anyValid = true;
                if (*parsed != p.noiseFilterMode) { p.noiseFilterMode = *parsed; anyPatched = true; }
            }
        }
        anyPatched |= applyFloatParam(payload, "noiseFilterFreq", p.noiseFilterFreq, 20.0, 20000.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseFilterQ", p.noiseFilterQ, 0.707, 4.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseAttackMs", p.noiseAttackMs, 1.0, 20000.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseDecayMs", p.noiseDecayMs, 1.0, 20000.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseSustain", p.noiseSustain, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseReleaseMs", p.noiseReleaseMs, 1.0, 20000.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseAttackTension", p.noiseAttackTension, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseDecayTension", p.noiseDecayTension, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "noiseReleaseTension", p.noiseReleaseTension, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseMix", p.velNoiseMix, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseRes", p.velNoiseRes, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseFreq", p.velNoiseFreq, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseQ", p.velNoiseQ, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseAttack", p.velNoiseAttack, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseDecay", p.velNoiseDecay, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseSustain", p.velNoiseSustain, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velNoiseRelease", p.velNoiseRelease, -1.0, 1.0, anyValid);

        anyPatched |= applyBoolParam(payload, "aOn", p.a.on, anyValid);
        if (const QJsonValue v = payload.value(u"aModel"); v.isString()) {
            if (const auto parsed = modal::tryModalModelFromName(v.toString().toStdString())) {
                anyValid = true;
                if (*parsed != p.a.model) {
                    p.a.model = *parsed;
                    if (!payload.contains(u"aRatio")) {
                        p.a.ratio = static_cast<float>(modal::defaultRatioForModel(*parsed));
                    }
                    anyPatched = true;
                }
            }
        }
        if (const QJsonValue v = payload.value(u"aPartials"); v.isDouble() && std::isfinite(v.toDouble())) {
            anyValid = true;
            const int next = modal::sanitizePartialCount(static_cast<int>(std::llround(v.toDouble())));
            if (next != p.a.partials) { p.a.partials = next; anyPatched = true; }
        }
        anyPatched |= applyFloatParam(payload, "aDecay", p.a.decay, 0.01, 100.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aDamp", p.a.damp, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aTone", p.a.tone, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aHit", p.a.hit, 0.02, 0.5, anyValid);
        anyPatched |= applyFloatParam(payload, "aRelease", p.a.release, 0.001, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aInharm", p.a.inharm, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aRatio", p.a.ratio, 0.1, 10.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aCut", p.a.cut, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aRadius", p.a.radius, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aCoarse", p.a.coarse, -48.0, 48.0, anyValid);
        anyPatched |= applyFloatParam(payload, "aFine", p.a.fine, -99.0, 99.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velADecay", p.a.velDecay, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velAHit", p.a.velHit, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velAInharm", p.a.velInharm, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velADamp", p.a.velDamp, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velATone", p.a.velTone, -1.0, 1.0, anyValid);

        anyPatched |= applyBoolParam(payload, "bOn", p.b.on, anyValid);
        if (const QJsonValue v = payload.value(u"bModel"); v.isString()) {
            if (const auto parsed = modal::tryModalModelFromName(v.toString().toStdString())) {
                anyValid = true;
                if (*parsed != p.b.model) {
                    p.b.model = *parsed;
                    if (!payload.contains(u"bRatio")) {
                        p.b.ratio = static_cast<float>(modal::defaultRatioForModel(*parsed));
                    }
                    anyPatched = true;
                }
            }
        }
        if (const QJsonValue v = payload.value(u"bPartials"); v.isDouble() && std::isfinite(v.toDouble())) {
            anyValid = true;
            const int next = modal::sanitizePartialCount(static_cast<int>(std::llround(v.toDouble())));
            if (next != p.b.partials) { p.b.partials = next; anyPatched = true; }
        }
        anyPatched |= applyFloatParam(payload, "bDecay", p.b.decay, 0.01, 100.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bDamp", p.b.damp, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bTone", p.b.tone, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bHit", p.b.hit, 0.02, 0.5, anyValid);
        anyPatched |= applyFloatParam(payload, "bRelease", p.b.release, 0.001, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bInharm", p.b.inharm, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bRatio", p.b.ratio, 0.1, 10.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bCut", p.b.cut, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bRadius", p.b.radius, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bCoarse", p.b.coarse, -48.0, 48.0, anyValid);
        anyPatched |= applyFloatParam(payload, "bFine", p.b.fine, -99.0, 99.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velBDecay", p.b.velDecay, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velBHit", p.b.velHit, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velBInharm", p.b.velInharm, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velBDamp", p.b.velDamp, -1.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "velBTone", p.b.velTone, -1.0, 1.0, anyValid);

        if (const QJsonValue v = payload.value(u"coupling"); v.isString()) {
            if (const auto parsed = modal::tryModalCouplingFromName(v.toString().toStdString())) {
                anyValid = true;
                if (*parsed != p.coupling) { p.coupling = *parsed; anyPatched = true; }
            }
        }
        anyPatched |= applyFloatParam(payload, "abMix", p.abMix, 0.0, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "abSplit", p.abSplit, 0.01, 1.0, anyValid);
        anyPatched |= applyFloatParam(payload, "gainDb", p.gainDb, -24.0, 24.0, anyValid);
        anyPatched |= applyIntParam(payload, "pitchBendRange", p.pitchBendRange, 1, 24, anyValid);
        anyPatched |= applyBoolParam(payload, "stereoizer", p.stereoizer, anyValid);
        anyPatched |= applyIntParam(payload, "polyphony", p.polyphony, 1, 16, anyValid);
        anyPatched |= applyBoolParam(payload, "reuseVoices", p.reuseVoices, anyValid);
        anyPatched |= applyBoolParam(payload, "fadeoutRepeats", p.fadeoutRepeats, anyValid);

        // Return unchanged doc if nothing valid was supplied, or if an existing modal track had no effective change.
        if (!anyValid || (wasModal && !anyPatched)) {
            return doc;
        }

        const QJsonObject nextInstrument = modalParamsToJson(p, anyPatched ? QString{} : presetId);
        if (currentInst == nextInstrument) {
            return doc;
        }
        track.insert(u"instrument", nextInstrument);
        tracks[i] = track;
        changed = true;
        break;
    }
    if (changed) {
        doc.insert(u"tracks", tracks);
    }
    return doc;
}

void registerModalEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("modal.setPreset"), setModalPresetEdit);
        nt::app::registerEdit(QStringLiteral("modal.setParams"), setModalParamsEdit);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::midi
