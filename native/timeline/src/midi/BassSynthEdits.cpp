// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/BassSynthEdits.h"
#include "midi/BassSynthPresets.h"
#include "app/EditRegistry.h"

#include <QJsonArray>
#include <QJsonValue>
#include <QString>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

bool applyDoubleParam(const QJsonObject& payload, const char* key, float& target, double lo, double hi) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    const float next = static_cast<float>(std::clamp(d, lo, hi));
    if (next == target) return false;
    target = next;
    return true;
}

bool applyIntParam(const QJsonObject& payload, const char* key, int& target, int lo, int hi) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    const int next = std::clamp(static_cast<int>(std::llround(d)), lo, hi);
    if (next == target) return false;
    target = next;
    return true;
}

bool applyBoolParam(const QJsonObject& payload, const char* key, bool& target) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isBool()) return false;
    const bool next = v.toBool();
    if (next == target) return false;
    target = next;
    return true;
}

}  // namespace

QJsonObject setBassPresetEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const QString presetId = payload.value(u"preset").toString();
    if (trackId.isEmpty() || presetId.isEmpty()) return doc;
    const auto* preset = findBassPreset(presetId.toStdString());
    if (!preset) return doc;

    const QJsonObject nextInstrument = bassParamsToJson(preset->params, presetId);
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

QJsonObject setBassParamsEdit(QJsonObject doc, const QJsonObject& payload) {
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
        BassSynthParams params = currentInst.value(u"type").toString() == u"bass"
            ? bassParamsFromJson(currentInst)
            : BassSynthParams{};
        QString presetId = currentInst.value(u"type").toString() == u"bass"
            ? currentInst.value(u"preset").toString()
            : QString{};

        bool anyPatched = false;
        if (const QJsonValue v = payload.value(u"waveform"); v.isString()) {
            if (const auto next = tryParseBassWaveform(v.toString().toStdString()); next && *next != params.waveform) {
                params.waveform = *next;
                anyPatched = true;
            }
        }
        if (const QJsonValue v = payload.value(u"subShape"); v.isString()) {
            if (const auto next = tryParseBassSubShape(v.toString().toStdString()); next && *next != params.subShape) {
                params.subShape = *next;
                anyPatched = true;
            }
        }
        anyPatched |= applyDoubleParam(payload, "pulseWidth", params.pulseWidth, 0.05, 0.95);
        anyPatched |= applyIntParam(payload, "semitones", params.semitones, -24, 24);
        anyPatched |= applyDoubleParam(payload, "fine", params.fine, -100.0, 100.0);
        anyPatched |= applyDoubleParam(payload, "oscLevel", params.oscLevel, 0.0, 1.2);
        anyPatched |= applyBoolParam(payload, "hardSync", params.hardSync);
        anyPatched |= applyDoubleParam(payload, "syncSemitones", params.syncSemitones, 0.0, 36.0);
        anyPatched |= applyDoubleParam(payload, "analogDrift", params.analogDrift, 0.0, 1.0);
        anyPatched |= applyIntParam(payload, "subOctave", params.subOctave, -2, -1);
        anyPatched |= applyDoubleParam(payload, "subLevel", params.subLevel, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "cutoffHz", params.cutoffHz, 20.0, 18000.0);
        anyPatched |= applyDoubleParam(payload, "resonance", params.resonance, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "drive", params.drive, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "filterEnvAmount", params.filterEnvAmount, -5.0, 5.0);
        anyPatched |= applyDoubleParam(payload, "keyTrack", params.keyTrack, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "filterAttackMs", params.filterAttackMs, 0.5, 500.0);
        anyPatched |= applyDoubleParam(payload, "filterDecayMs", params.filterDecayMs, 5.0, 4000.0);
        anyPatched |= applyDoubleParam(payload, "filterSustain", params.filterSustain, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "filterReleaseMs", params.filterReleaseMs, 5.0, 2000.0);
        anyPatched |= applyDoubleParam(payload, "attackMs", params.attackMs, 0.5, 500.0);
        anyPatched |= applyDoubleParam(payload, "decayMs", params.decayMs, 5.0, 4000.0);
        anyPatched |= applyDoubleParam(payload, "sustain", params.sustain, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "releaseMs", params.releaseMs, 5.0, 2000.0);
        anyPatched |= applyDoubleParam(payload, "accentAmount", params.accentAmount, 0.0, 1.0);
        anyPatched |= applyIntParam(payload, "accentVelocity", params.accentVelocity, 1, 127);
        anyPatched |= applyDoubleParam(payload, "slideMs", params.slideMs, 0.0, 500.0);
        anyPatched |= applyBoolParam(payload, "retrigger", params.retrigger);
        anyPatched |= applyDoubleParam(payload, "saturation", params.saturation, 0.0, 1.0);
        anyPatched |= applyDoubleParam(payload, "gainDb", params.gainDb, -60.0, 12.0);

        const QJsonObject nextInstrument = bassParamsToJson(params, anyPatched ? QString{} : presetId);
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

void registerBassEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("bass.setPreset"), setBassPresetEdit);
        nt::app::registerEdit(QStringLiteral("bass.setParams"), setBassParamsEdit);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::midi
