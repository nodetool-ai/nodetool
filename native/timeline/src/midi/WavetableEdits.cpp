// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/WavetableEdits.h"
#include "midi/WavetablePresets.h"
#include "app/EditRegistry.h"

#include <QJsonArray>
#include <QJsonValue>
#include <QString>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

bool readDoubleKey(const QJsonObject& payload, const char* key, double& out) {
    const QJsonValue v = payload.value(QLatin1String(key));
    if (!v.isDouble()) return false;
    const double d = v.toDouble();
    if (!std::isfinite(d)) return false;
    out = d;
    return true;
}

bool applyFloat(const QJsonObject& payload, const char* key, float& target, double lo, double hi, double scale = 1.0) {
    double d = 0.0;
    if (!readDoubleKey(payload, key, d)) return false;
    const float next = static_cast<float>(std::clamp(d * scale, lo, hi));
    if (next == target) return false;
    target = next;
    return true;
}

bool applyInt(const QJsonObject& payload, const char* key, int& target, int lo, int hi) {
    double d = 0.0;
    if (!readDoubleKey(payload, key, d)) return false;
    const int next = std::clamp(static_cast<int>(std::llround(d)), lo, hi);
    if (next == target) return false;
    target = next;
    return true;
}

bool applyBool(const QJsonObject& payload, const char* key, bool& target) {
    const QJsonValue v = payload.value(QLatin1String(key));
    bool next = target;
    if (v.isBool()) {
        next = v.toBool();
    } else if (v.isDouble() && std::isfinite(v.toDouble())) {
        next = v.toDouble() >= 0.5;
    } else {
        return false;
    }
    if (next == target) return false;
    target = next;
    return true;
}

bool applyTable(const QJsonObject& payload, const char* key, WavetableId& target) {
    const QJsonValue v = payload.value(QLatin1String(key));
    WavetableId next = target;
    if (v.isString()) {
        next = wavetableIdFromName(v.toString().toStdString());
    } else if (v.isDouble() && std::isfinite(v.toDouble())) {
        next = wavetableIdFromIndex(static_cast<int>(std::llround(v.toDouble())));
    } else {
        return false;
    }
    if (next == target) return false;
    target = next;
    return true;
}

bool applyOsc(const QJsonObject& payload, const char* prefixCamel, const char* prefixDot,
              WavetableSynthParams::Osc& osc) {
    bool patched = false;
    auto keyC = [&](const char* suffix) { return QString::fromLatin1(prefixCamel) + QLatin1String(suffix); };
    auto keyD = [&](const char* suffix) { return QString::fromLatin1(prefixDot) + QLatin1String(suffix); };

    auto runBool = [&](const char* cSuf, const char* dSuf, bool& dst) {
        const QByteArray ck = keyC(cSuf).toLatin1();
        const QByteArray dk = keyD(dSuf).toLatin1();
        patched |= applyBool(payload, ck.constData(), dst);
        patched |= applyBool(payload, dk.constData(), dst);
    };
    auto runTable = [&](const char* cSuf, const char* dSuf, WavetableId& dst) {
        const QByteArray ck = keyC(cSuf).toLatin1();
        const QByteArray dk = keyD(dSuf).toLatin1();
        patched |= applyTable(payload, ck.constData(), dst);
        patched |= applyTable(payload, dk.constData(), dst);
    };
    auto runFloat = [&](const char* cSuf, const char* dSuf, float& dst, double lo, double hi) {
        const QByteArray ck = keyC(cSuf).toLatin1();
        const QByteArray dk = keyD(dSuf).toLatin1();
        patched |= applyFloat(payload, ck.constData(), dst, lo, hi);
        patched |= applyFloat(payload, dk.constData(), dst, lo, hi);
    };
    auto runInt = [&](const char* cSuf, const char* dSuf, int& dst, int lo, int hi) {
        const QByteArray ck = keyC(cSuf).toLatin1();
        const QByteArray dk = keyD(dSuf).toLatin1();
        patched |= applyInt(payload, ck.constData(), dst, lo, hi);
        patched |= applyInt(payload, dk.constData(), dst, lo, hi);
    };

    runBool("On", "on", osc.on);
    runTable("Table", "table", osc.table);
    runFloat("Position", "position", osc.position, 0.0, 1.0);
    {
        const QByteArray dk = keyD("pos").toLatin1();
        patched |= applyFloat(payload, dk.constData(), osc.position, 0.0, 1.0);
    }
    runInt("Octave", "octave", osc.octave, -3, 3);
    {
        const QByteArray dk = keyD("oct").toLatin1();
        patched |= applyInt(payload, dk.constData(), osc.octave, -3, 3);
    }
    runInt("Semitones", "semitones", osc.semitones, -24, 24);
    {
        const QByteArray dk = keyD("semi").toLatin1();
        patched |= applyInt(payload, dk.constData(), osc.semitones, -24, 24);
    }
    runFloat("Fine", "fine", osc.fine, -100.0, 100.0);
    runInt("Unison", "unison", osc.unison, 1, WavetableSynth::kMaxUnison);
    runFloat("Detune", "detune", osc.detune, 0.0, 1.0);
    runFloat("Spread", "spread", osc.spread, 0.0, 1.0);
    runFloat("Blend", "blend", osc.blend, 0.0, 1.0);
    runFloat("Level", "level", osc.level, 0.0, 1.2);
    runFloat("Pan", "pan", osc.pan, -1.0, 1.0);
    return patched;
}

}  // namespace

QJsonObject setWavetablePresetEdit(QJsonObject doc, const QJsonObject& payload) {
    const QString trackId = payload.value(u"trackId").toString();
    const QString presetId = payload.value(u"preset").toString();
    if (trackId.isEmpty() || presetId.isEmpty()) return doc;
    const auto* preset = findWavetablePreset(presetId.toStdString());
    if (!preset) return doc;

    const QJsonObject nextInstrument = wavetableParamsToJson(preset->params, presetId);
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

QJsonObject setWavetableParamsEdit(QJsonObject doc, const QJsonObject& payload) {
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
        const bool isWt = currentInst.value(u"type").toString() == u"wavetable";
        WavetableSynthParams params = isWt ? wavetableParamsFromJson(currentInst) : WavetableSynthParams{};
        const QString presetId = isWt ? currentInst.value(u"preset").toString() : QString{};

        bool anyPatched = false;
        anyPatched |= applyOsc(payload, "oscA", "oscA.", params.oscA);
        anyPatched |= applyOsc(payload, "oscB", "oscB.", params.oscB);

        // Sub oscillator
        anyPatched |= applyBool(payload, "subOn", params.sub.on);
        anyPatched |= applyBool(payload, "sub.on", params.sub.on);
        auto applySubShapeKey = [&](const char* key) {
            const QJsonValue v = payload.value(QLatin1String(key));
            SubShape next = params.sub.shape;
            if (v.isString()) {
                next = subShapeFromName(v.toString().toStdString());
            } else if (v.isDouble() && std::isfinite(v.toDouble())) {
                next = subShapeFromIndex(static_cast<int>(std::llround(v.toDouble())));
            } else {
                return;
            }
            if (next != params.sub.shape) { params.sub.shape = next; anyPatched = true; }
        };
        applySubShapeKey("subShape");
        applySubShapeKey("sub.shape");
        anyPatched |= applyInt(payload, "subOctave", params.sub.octave, -2, 0);
        anyPatched |= applyInt(payload, "sub.oct", params.sub.octave, -2, 0);
        anyPatched |= applyInt(payload, "sub.octave", params.sub.octave, -2, 0);
        if (applyFloat(payload, "subLevel", params.sub.level, 0.0, 1.0) ||
            applyFloat(payload, "sub.level", params.sub.level, 0.0, 1.0)) {
            anyPatched = true;
            if (!payload.contains(u"subOn") && !payload.contains(u"sub.on")) {
                params.sub.on = params.sub.level > 0.0f;
            }
        }

        // Noise
        anyPatched |= applyBool(payload, "noiseOn", params.noise.on);
        anyPatched |= applyBool(payload, "noise.on", params.noise.on);
        auto applyNoiseTypeKey = [&](const char* key) {
            const QJsonValue v = payload.value(QLatin1String(key));
            NoiseType next = params.noise.type;
            if (v.isString()) {
                next = noiseTypeFromName(v.toString().toStdString());
            } else if (v.isDouble() && std::isfinite(v.toDouble())) {
                next = noiseTypeFromIndex(static_cast<int>(std::llround(v.toDouble())));
            } else {
                return;
            }
            if (next != params.noise.type) { params.noise.type = next; anyPatched = true; }
        };
        applyNoiseTypeKey("noiseType");
        applyNoiseTypeKey("noise.type");
        if (applyFloat(payload, "noiseLevel", params.noise.level, 0.0, 1.0) ||
            applyFloat(payload, "noise.level", params.noise.level, 0.0, 1.0)) {
            anyPatched = true;
            if (!payload.contains(u"noiseOn") && !payload.contains(u"noise.on")) {
                params.noise.on = params.noise.level > 0.0f;
            }
        }

        // Filter
        anyPatched |= applyBool(payload, "filterOn", params.filter.on);
        anyPatched |= applyBool(payload, "filter.on", params.filter.on);
        if (params.filter.on && params.filter.type == FilterType::None) {
            params.filter.type = FilterType::Lp24;
            anyPatched = true;
        }
        auto applyFilterTypeKey = [&](const char* key) {
            const QJsonValue v = payload.value(QLatin1String(key));
            FilterType ft = params.filter.type;
            if (v.isString()) {
                ft = filterTypeFromName(v.toString().toStdString());
            } else if (v.isDouble() && std::isfinite(v.toDouble())) {
                ft = filterTypeFromIndex(static_cast<int>(std::llround(v.toDouble())));
            } else {
                return;
            }
            if (ft == FilterType::None) {
                if (params.filter.type != FilterType::None || params.filter.on) {
                    params.filter.type = FilterType::None;
                    params.filter.on = false;
                    anyPatched = true;
                }
            } else {
                if (ft != params.filter.type) { params.filter.type = ft; anyPatched = true; }
                if (!payload.contains(u"filterOn") && !payload.contains(u"filter.on") && !params.filter.on) {
                    params.filter.on = true;
                    anyPatched = true;
                }
            }
        };
        applyFilterTypeKey("filterType");
        applyFilterTypeKey("filter.type");
        anyPatched |= applyFloat(payload, "cutoffHz", params.filter.cutoffHz, 20.0, 20000.0);
        anyPatched |= applyFloat(payload, "filter.cutoff", params.filter.cutoffHz, 20.0, 20000.0);
        anyPatched |= applyFloat(payload, "resonance", params.filter.resonance, 0.0, 0.99);
        anyPatched |= applyFloat(payload, "filter.res", params.filter.resonance, 0.0, 0.99);
        anyPatched |= applyFloat(payload, "drive", params.filter.drive, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "filter.drive", params.filter.drive, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "filterEnvAmount", params.filter.envAmount, -1.0, 1.0, 0.25);
        anyPatched |= applyFloat(payload, "filter.env", params.filter.envAmount, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "keyTrack", params.filter.keyTrack, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "filter.key", params.filter.keyTrack, 0.0, 1.0);

        // Amp envelope
        anyPatched |= applyFloat(payload, "ampAttackMs", params.ampEnv.attackSec, 0.001, 8.0, 0.001);
        anyPatched |= applyFloat(payload, "ampDecayMs", params.ampEnv.decaySec, 0.005, 10.0, 0.001);
        anyPatched |= applyFloat(payload, "ampSustain", params.ampEnv.sustain, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "ampReleaseMs", params.ampEnv.releaseSec, 0.005, 12.0, 0.001);
        anyPatched |= applyFloat(payload, "env1.a", params.ampEnv.attackSec, 0.001, 8.0);
        anyPatched |= applyFloat(payload, "env1.d", params.ampEnv.decaySec, 0.005, 10.0);
        anyPatched |= applyFloat(payload, "env1.s", params.ampEnv.sustain, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "env1.r", params.ampEnv.releaseSec, 0.005, 12.0);

        // Mod envelope
        anyPatched |= applyFloat(payload, "modAttackMs", params.modEnv.attackSec, 0.001, 8.0, 0.001);
        anyPatched |= applyFloat(payload, "modDecayMs", params.modEnv.decaySec, 0.005, 10.0, 0.001);
        anyPatched |= applyFloat(payload, "modSustain", params.modEnv.sustain, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "modReleaseMs", params.modEnv.releaseSec, 0.005, 12.0, 0.001);
        anyPatched |= applyFloat(payload, "env2.a", params.modEnv.attackSec, 0.001, 8.0);
        anyPatched |= applyFloat(payload, "env2.d", params.modEnv.decaySec, 0.005, 10.0);
        anyPatched |= applyFloat(payload, "env2.s", params.modEnv.sustain, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "env2.r", params.modEnv.releaseSec, 0.005, 12.0);

        // LFO
        auto applyLfoShapeKey = [&](const char* key) {
            const QJsonValue v = payload.value(QLatin1String(key));
            LfoShape next = params.lfo.shape;
            if (v.isString()) {
                next = lfoShapeFromName(v.toString().toStdString());
            } else if (v.isDouble() && std::isfinite(v.toDouble())) {
                next = lfoShapeFromIndex(static_cast<int>(std::llround(v.toDouble())));
            } else {
                return;
            }
            if (next != params.lfo.shape) { params.lfo.shape = next; anyPatched = true; }
        };
        applyLfoShapeKey("lfoShape");
        applyLfoShapeKey("lfo1.shape");
        anyPatched |= applyFloat(payload, "lfoRateHz", params.lfo.rateHz, 0.02, 30.0);
        anyPatched |= applyFloat(payload, "lfo1.rate", params.lfo.rateHz, 0.02, 30.0);
        anyPatched |= applyBool(payload, "lfoTempoSync", params.lfo.tempoSync);
        anyPatched |= applyBool(payload, "lfo1.sync", params.lfo.tempoSync);
        anyPatched |= applyInt(payload, "lfoSyncDiv", params.lfo.syncDiv, 0, kLfoSyncDivCount - 1);
        anyPatched |= applyInt(payload, "lfo1.syncrate", params.lfo.syncDiv, 0, kLfoSyncDivCount - 1);
        anyPatched |= applyFloat(payload, "lfoRiseSec", params.lfo.riseSec, 0.0, 5.0);
        anyPatched |= applyFloat(payload, "lfo1.rise", params.lfo.riseSec, 0.0, 5.0);
        anyPatched |= applyFloat(payload, "lfoPhase", params.lfo.phase, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "lfo1.phase", params.lfo.phase, 0.0, 1.0);
        anyPatched |= applyBool(payload, "lfoRetrig", params.lfo.retrig);
        anyPatched |= applyBool(payload, "lfo1.retrig", params.lfo.retrig);
        anyPatched |= applyFloat(payload, "lfoToPitch", params.lfo.toPitch, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "lfo1.toPitch", params.lfo.toPitch, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "lfoToPos", params.lfo.toPos, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "lfo1.toPos", params.lfo.toPos, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "lfoToCutoff", params.lfo.toCutoff, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "lfo1.toCutoff", params.lfo.toCutoff, -1.0, 1.0);

        // Velocity, voice mode, performance, master
        anyPatched |= applyFloat(payload, "velToAmp", params.velToAmp, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "vel.toAmp", params.velToAmp, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "velToCutoff", params.velToCutoff, -1.0, 1.0);
        anyPatched |= applyFloat(payload, "vel.toCutoff", params.velToCutoff, -1.0, 1.0);
        anyPatched |= applyBool(payload, "mono", params.mono);
        anyPatched |= applyBool(payload, "master.mono", params.mono);
        anyPatched |= applyBool(payload, "legato", params.legato);
        anyPatched |= applyBool(payload, "master.legato", params.legato);
        anyPatched |= applyFloat(payload, "glideMs", params.glideSec, 0.0, 2.0, 0.001);
        anyPatched |= applyFloat(payload, "master.glide", params.glideSec, 0.0, 2.0);
        anyPatched |= applyFloat(payload, "pitchBendRange", params.pitchBendRange, 0.0, 24.0);
        anyPatched |= applyFloat(payload, "master.pitchBendRange", params.pitchBendRange, 0.0, 24.0);
        anyPatched |= applyFloat(payload, "modWheel", params.modWheel, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "perf.modwheel", params.modWheel, 0.0, 1.0);
        anyPatched |= applyFloat(payload, "masterVolume", params.masterVolume, 0.0, 1.5);
        anyPatched |= applyFloat(payload, "master.volume", params.masterVolume, 0.0, 1.5);
        if (double gainDb = 0.0; readDoubleKey(payload, "gainDb", gainDb)) {
            const double v = 0.75 * std::pow(10.0, (std::clamp(gainDb, -60.0, 12.0) + 8.0) / 40.0);
            const float next = static_cast<float>(std::clamp(v, 0.0, 1.5));
            if (next != params.masterVolume) {
                params.masterVolume = next;
                anyPatched = true;
            }
        }

        const QJsonObject nextInstrument = wavetableParamsToJson(params, anyPatched ? QString{} : presetId);
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

void registerWavetableEdits() {
    static const bool registered = [] {
        nt::app::registerEdit(QStringLiteral("wavetable.setPreset"), setWavetablePresetEdit);
        nt::app::registerEdit(QStringLiteral("wavetable.setParams"), setWavetableParamsEdit);
        return true;
    }();
    (void)registered;
}

}  // namespace nt::midi
