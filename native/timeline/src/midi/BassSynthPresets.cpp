// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/bass/dsp/BassPatches.{h,cpp} and
// packages/timeline/src/midi/{presets.ts,fablesynthPresets.gen.ts}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/BassSynthPresets.h"

#include <QJsonValue>

#include <algorithm>
#include <cmath>

namespace nt::midi {
namespace {

BassSynthParams makePresetParams(
    BassWaveform wave, float pw, float oscLvl,
    bool hardSync, float syncSemi, float drift,
    BassSubShape subShape, int subOct, float subLvl,
    float cutHz, float res, float drive, float envOct, float keyTrack,
    float fAtt, float fDec, float fSus, float fRel,
    float aAtt, float aDec, float aSus, float aRel,
    float accAmt, float slideMs, bool retrigger, float sat, float gainDb) {
    BassSynthParams p{};
    p.waveform = wave;
    p.pulseWidth = pw;
    p.oscLevel = oscLvl;
    p.hardSync = hardSync;
    p.syncSemitones = syncSemi;
    p.analogDrift = drift;
    p.subShape = subShape;
    p.subOctave = subOct;
    p.subLevel = subLvl;
    p.cutoffHz = cutHz;
    p.resonance = res;
    p.drive = drive;
    p.filterEnvAmount = envOct;
    p.keyTrack = keyTrack;
    p.filterAttackMs = fAtt;
    p.filterDecayMs = fDec;
    p.filterSustain = fSus;
    p.filterReleaseMs = fRel;
    p.attackMs = aAtt;
    p.decayMs = aDec;
    p.sustain = aSus;
    p.releaseMs = aRel;
    p.accentAmount = accAmt;
    p.accentVelocity = 100;
    p.slideMs = slideMs;
    p.retrigger = retrigger;
    p.saturation = sat;
    p.gainDb = gainDb;
    return p;
}

double readBounded(const QJsonObject& obj, const char* key, double fallback, double lo, double hi) {
    const QJsonValue v = obj.value(QLatin1String(key));
    if (!v.isDouble()) return fallback;
    const double d = v.toDouble(fallback);
    return std::isfinite(d) ? std::clamp(d, lo, hi) : fallback;
}

}  // namespace

const std::vector<BassPreset>& factoryBassPresets() {
    static const std::vector<BassPreset> presets = {
        // ---- Acid 303-style (4) ----
        {"bl1-acid", "Acid 303", "Acid",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.85f, false, 12.0f, 0.15f,
                          BassSubShape::Sine, -1, 0.45f,
                          340.0f, 0.65f, 0.45f, 3.0f, 0.30f,
                          1.0f, 180.0f, 0.0f, 80.0f,
                          1.0f, 300.0f, 0.50f, 80.0f,
                          0.75f, 60.0f, false, 0.28f, -6.0f)},
        {"bl1-neon-squelch", "Neon Squelch", "Acid",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.85f, false, 12.0f, 0.18f,
                          BassSubShape::Sine, -1, 0.28f,
                          480.0f, 0.82f, 0.50f, 3.6f, 0.30f,
                          1.0f, 120.0f, 0.0f, 70.0f,
                          1.0f, 280.0f, 0.50f, 80.0f,
                          0.88f, 90.0f, false, 0.32f, -6.0f)},
        {"bl1-warehouse", "Warehouse Acid", "Acid",
         makePresetParams(BassWaveform::Square, 0.32f, 0.85f, false, 12.0f, 0.18f,
                          BassSubShape::Square, -1, 0.40f,
                          420.0f, 0.72f, 0.68f, 3.1f, 0.30f,
                          1.0f, 140.0f, 0.0f, 75.0f,
                          1.0f, 220.0f, 0.42f, 80.0f,
                          0.90f, 55.0f, false, 0.45f, -6.0f)},
        {"bl1-rubber", "Rubber Squelch", "Acid",
         makePresetParams(BassWaveform::Square, 0.40f, 0.80f, false, 12.0f, 0.14f,
                          BassSubShape::Sine, -1, 0.45f,
                          460.0f, 0.78f, 0.55f, 3.3f, 0.30f,
                          1.0f, 120.0f, 0.0f, 70.0f,
                          1.0f, 260.0f, 0.52f, 80.0f,
                          0.85f, 45.0f, false, 0.35f, -6.0f)},

        // ---- Sub (4) ----
        {"bl1-clean-sub", "Clean Sub", "Sub",
         makePresetParams(BassWaveform::Triangle, 0.50f, 0.40f, false, 12.0f, 0.05f,
                          BassSubShape::Sine, -1, 0.92f,
                          620.0f, 0.08f, 0.08f, 0.48f, 0.50f,
                          1.0f, 450.0f, 0.0f, 120.0f,
                          6.0f, 500.0f, 0.90f, 120.0f,
                          0.32f, 70.0f, false, 0.08f, -5.0f)},
        {"bl1-deep", "Deep Sub", "Sub",
         makePresetParams(BassWaveform::Square, 0.50f, 0.65f, false, 12.0f, 0.12f,
                          BassSubShape::Sine, -1, 0.80f,
                          220.0f, 0.38f, 0.25f, 1.80f, 0.30f,
                          1.0f, 320.0f, 0.0f, 120.0f,
                          3.0f, 500.0f, 0.70f, 140.0f,
                          0.52f, 90.0f, false, 0.22f, -6.0f)},
        {"bl1-808-glide", "808 Glide", "Sub",
         makePresetParams(BassWaveform::Triangle, 0.50f, 0.30f, false, 12.0f, 0.06f,
                          BassSubShape::Sine, -1, 1.00f,
                          240.0f, 0.10f, 0.35f, 0.60f, 0.30f,
                          1.0f, 800.0f, 0.0f, 250.0f,
                          3.0f, 1400.0f, 0.85f, 350.0f,
                          0.50f, 140.0f, false, 0.32f, -5.0f)},
        {"bl1-sub-stab", "Sub Stab", "Sub",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.36f, false, 12.0f, 0.10f,
                          BassSubShape::Sine, -1, 0.98f,
                          260.0f, 0.16f, 0.30f, 1.20f, 0.25f,
                          1.0f, 100.0f, 0.0f, 80.0f,
                          1.0f, 300.0f, 0.60f, 90.0f,
                          0.45f, 40.0f, false, 0.20f, -5.0f)},

        // ---- Classic Analog, Reese-Free (4) ----
        {"bl1-rounded-bass", "Rounded Analog", "Analog",
         makePresetParams(BassWaveform::Triangle, 0.50f, 0.78f, false, 12.0f, 0.18f,
                          BassSubShape::Sine, -1, 0.45f,
                          650.0f, 0.16f, 0.18f, 0.85f, 0.35f,
                          1.0f, 380.0f, 0.0f, 140.0f,
                          8.0f, 650.0f, 0.40f, 180.0f,
                          0.25f, 25.0f, false, 0.18f, -6.0f)},
        {"bl1-tape-bass", "Tape Analog", "Analog",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.72f, false, 12.0f, 0.35f,
                          BassSubShape::Sine, -1, 0.62f,
                          480.0f, 0.20f, 0.32f, 1.50f, 0.30f,
                          6.0f, 400.0f, 0.0f, 160.0f,
                          8.0f, 500.0f, 0.70f, 200.0f,
                          0.44f, 100.0f, false, 0.35f, -6.0f)},
        {"bl1-house-organ", "House Punch", "Analog",
         makePresetParams(BassWaveform::Square, 0.28f, 0.76f, false, 12.0f, 0.14f,
                          BassSubShape::Sine, -1, 0.70f,
                          420.0f, 0.30f, 0.40f, 2.00f, 0.35f,
                          1.0f, 160.0f, 0.0f, 90.0f,
                          1.0f, 240.0f, 0.55f, 90.0f,
                          0.62f, 50.0f, false, 0.28f, -6.0f)},
        {"bl1-cinematic-sub", "Cinematic Low", "Analog",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.55f, false, 12.0f, 0.22f,
                          BassSubShape::Sine, -1, 0.85f,
                          260.0f, 0.14f, 0.16f, 0.55f, 0.25f,
                          20.0f, 550.0f, 0.10f, 280.0f,
                          25.0f, 700.0f, 0.85f, 320.0f,
                          0.20f, 120.0f, false, 0.20f, -6.0f)},

        // ---- Pluck (2) ----
        {"bl1-plucked-wire", "Plucked Wire", "Pluck",
         makePresetParams(BassWaveform::Square, 0.22f, 0.92f, false, 12.0f, 0.10f,
                          BassSubShape::Sine, -1, 0.22f,
                          1100.0f, 0.42f, 0.26f, 3.50f, 0.62f,
                          1.0f, 75.0f, 0.0f, 50.0f,
                          1.0f, 110.0f, 0.18f, 55.0f,
                          0.80f, 35.0f, true, 0.22f, -6.0f)},
        {"bl1-score-pulse", "Score Pulse", "Pluck",
         makePresetParams(BassWaveform::Square, 0.35f, 0.82f, false, 12.0f, 0.12f,
                          BassSubShape::Sine, -1, 0.50f,
                          380.0f, 0.28f, 0.20f, 1.85f, 0.35f,
                          1.0f, 160.0f, 0.0f, 80.0f,
                          4.0f, 280.0f, 0.12f, 90.0f,
                          0.38f, 0.0f, true, 0.18f, -6.0f)},

        // ---- Sync Lead-Bass (2) ----
        {"bl1-sync-lead", "Sync Lead Bass", "Sync",
         makePresetParams(BassWaveform::Saw, 0.50f, 0.85f, true, 19.0f, 0.16f,
                          BassSubShape::Sine, -1, 0.32f,
                          1400.0f, 0.48f, 0.42f, 2.80f, 0.60f,
                          1.0f, 220.0f, 0.10f, 100.0f,
                          1.0f, 360.0f, 0.72f, 110.0f,
                          0.72f, 65.0f, false, 0.30f, -6.0f)},
        {"bl1-sync-bite", "Sync Bite", "Sync",
         makePresetParams(BassWaveform::Square, 0.42f, 0.85f, true, 12.0f, 0.18f,
                          BassSubShape::Square, -1, 0.45f,
                          820.0f, 0.58f, 0.52f, 3.40f, 0.50f,
                          1.0f, 140.0f, 0.0f, 80.0f,
                          1.0f, 240.0f, 0.55f, 90.0f,
                          0.82f, 45.0f, false, 0.36f, -6.0f)},
    };
    return presets;
}

const BassPreset* findBassPreset(std::string_view id) noexcept {
    for (const auto& preset : factoryBassPresets()) {
        if (preset.id == id) return &preset;
    }
    return nullptr;
}

QStringList bassPresetIds() {
    QStringList ids;
    const auto& presets = factoryBassPresets();
    ids.reserve(static_cast<qsizetype>(presets.size()));
    for (const auto& preset : presets) {
        ids.append(QString::fromUtf8(preset.id));
    }
    return ids;
}

QJsonObject bassParamsToJson(const BassSynthParams& p, const QString& presetId) {
    QJsonObject obj{
        {QStringLiteral("type"), QStringLiteral("bass")},
        {QStringLiteral("waveform"), QString::fromUtf8(bassWaveformName(p.waveform))},
        {QStringLiteral("pulseWidth"), static_cast<double>(p.pulseWidth)},
        {QStringLiteral("semitones"), p.semitones},
        {QStringLiteral("fine"), static_cast<double>(p.fine)},
        {QStringLiteral("oscLevel"), static_cast<double>(p.oscLevel)},
        {QStringLiteral("hardSync"), p.hardSync},
        {QStringLiteral("syncSemitones"), static_cast<double>(p.syncSemitones)},
        {QStringLiteral("analogDrift"), static_cast<double>(p.analogDrift)},
        {QStringLiteral("subShape"), QString::fromUtf8(bassSubShapeName(p.subShape))},
        {QStringLiteral("subOctave"), p.subOctave},
        {QStringLiteral("subLevel"), static_cast<double>(p.subLevel)},
        {QStringLiteral("cutoffHz"), static_cast<double>(p.cutoffHz)},
        {QStringLiteral("resonance"), static_cast<double>(p.resonance)},
        {QStringLiteral("drive"), static_cast<double>(p.drive)},
        {QStringLiteral("filterEnvAmount"), static_cast<double>(p.filterEnvAmount)},
        {QStringLiteral("keyTrack"), static_cast<double>(p.keyTrack)},
        {QStringLiteral("filterAttackMs"), static_cast<double>(p.filterAttackMs)},
        {QStringLiteral("filterDecayMs"), static_cast<double>(p.filterDecayMs)},
        {QStringLiteral("filterSustain"), static_cast<double>(p.filterSustain)},
        {QStringLiteral("filterReleaseMs"), static_cast<double>(p.filterReleaseMs)},
        {QStringLiteral("ampEnv"), QJsonObject{
            {QStringLiteral("attackMs"), static_cast<double>(p.attackMs)},
            {QStringLiteral("decayMs"), static_cast<double>(p.decayMs)},
            {QStringLiteral("sustain"), static_cast<double>(p.sustain)},
            {QStringLiteral("releaseMs"), static_cast<double>(p.releaseMs)},
        }},
        {QStringLiteral("accentAmount"), static_cast<double>(p.accentAmount)},
        {QStringLiteral("accentVelocity"), p.accentVelocity},
        {QStringLiteral("slideMs"), static_cast<double>(p.slideMs)},
        {QStringLiteral("retrigger"), p.retrigger},
        {QStringLiteral("saturation"), static_cast<double>(p.saturation)},
        {QStringLiteral("gainDb"), static_cast<double>(p.gainDb)},
    };
    if (!presetId.isEmpty()) {
        obj.insert(QStringLiteral("preset"), presetId);
    }
    return obj;
}

BassSynthParams bassParamsFromJson(const QJsonObject& instrument) {
    BassSynthParams p{};
    const QString presetId = instrument.value(u"preset").toString();
    if (!presetId.isEmpty()) {
        if (const auto* preset = findBassPreset(presetId.toStdString())) {
            p = preset->params;
        }
    }

    if (instrument.contains(u"waveform")) {
        if (const auto wf = tryParseBassWaveform(instrument.value(u"waveform").toString().toStdString())) {
            p.waveform = *wf;
        }
    } else if (instrument.contains(u"table")) {
        // Graceful fallback when reading a legacy web BL-1 track JSON without an explicit analog waveform.
        const QString tbl = instrument.value(u"table").toString();
        if (tbl == u"pulse") p.waveform = BassWaveform::Square;
        else if (tbl == u"bloom") p.waveform = BassWaveform::Triangle;
        else p.waveform = BassWaveform::Saw;
    }

    p.pulseWidth = static_cast<float>(readBounded(instrument, "pulseWidth", p.pulseWidth, 0.05, 0.95));
    p.semitones = static_cast<int>(std::llround(readBounded(instrument, "semitones", p.semitones, -24.0, 24.0)));
    p.fine = static_cast<float>(readBounded(instrument, "fine", p.fine, -100.0, 100.0));
    p.oscLevel = static_cast<float>(readBounded(instrument, "oscLevel", p.oscLevel, 0.0, 1.2));
    if (instrument.value(u"hardSync").isBool()) p.hardSync = instrument.value(u"hardSync").toBool();
    p.syncSemitones = static_cast<float>(readBounded(instrument, "syncSemitones", p.syncSemitones, 0.0, 36.0));
    p.analogDrift = static_cast<float>(readBounded(instrument, "analogDrift", p.analogDrift, 0.0, 1.0));

    if (instrument.contains(u"subShape")) {
        if (const auto sub = tryParseBassSubShape(instrument.value(u"subShape").toString().toStdString())) {
            p.subShape = *sub;
        }
    }
    p.subOctave = static_cast<int>(std::llround(readBounded(instrument, "subOctave", p.subOctave, -2.0, -1.0)));
    p.subLevel = static_cast<float>(readBounded(instrument, "subLevel", p.subLevel, 0.0, 1.0));

    p.cutoffHz = static_cast<float>(readBounded(instrument, "cutoffHz", p.cutoffHz, 20.0, 18000.0));
    p.resonance = static_cast<float>(readBounded(instrument, "resonance", p.resonance, 0.0, 1.0));
    p.drive = static_cast<float>(readBounded(instrument, "drive", p.drive, 0.0, 1.0));
    p.filterEnvAmount = static_cast<float>(readBounded(instrument, "filterEnvAmount", p.filterEnvAmount, -5.0, 5.0));
    p.keyTrack = static_cast<float>(readBounded(instrument, "keyTrack", p.keyTrack, 0.0, 1.0));

    p.filterAttackMs = static_cast<float>(readBounded(instrument, "filterAttackMs", p.filterAttackMs, 0.5, 500.0));
    p.filterDecayMs = static_cast<float>(readBounded(instrument, "filterDecayMs", p.filterDecayMs, 5.0, 4000.0));
    p.filterSustain = static_cast<float>(readBounded(instrument, "filterSustain", p.filterSustain, 0.0, 1.0));
    p.filterReleaseMs = static_cast<float>(readBounded(instrument, "filterReleaseMs", p.filterReleaseMs, 5.0, 2000.0));

    const QJsonObject ampEnv = instrument.value(u"ampEnv").toObject();
    p.attackMs = static_cast<float>(readBounded(ampEnv, "attackMs",
        readBounded(instrument, "attackMs", p.attackMs, 0.5, 500.0), 0.5, 500.0));
    p.decayMs = static_cast<float>(readBounded(ampEnv, "decayMs",
        readBounded(instrument, "decayMs", p.decayMs, 5.0, 4000.0), 5.0, 4000.0));
    p.sustain = static_cast<float>(readBounded(ampEnv, "sustain",
        readBounded(instrument, "sustain", p.sustain, 0.0, 1.0), 0.0, 1.0));
    p.releaseMs = static_cast<float>(readBounded(ampEnv, "releaseMs",
        readBounded(instrument, "releaseMs", p.releaseMs, 5.0, 2000.0), 5.0, 2000.0));

    p.accentAmount = static_cast<float>(readBounded(instrument, "accentAmount", p.accentAmount, 0.0, 1.0));
    p.accentVelocity = static_cast<int>(std::llround(readBounded(instrument, "accentVelocity", p.accentVelocity, 1.0, 127.0)));
    p.slideMs = static_cast<float>(readBounded(instrument, "slideMs", p.slideMs, 0.0, 500.0));
    if (instrument.value(u"retrigger").isBool()) p.retrigger = instrument.value(u"retrigger").toBool();
    p.saturation = static_cast<float>(readBounded(instrument, "saturation", p.saturation, 0.0, 1.0));
    p.gainDb = static_cast<float>(readBounded(instrument, "gainDb", p.gainDb, -60.0, 12.0));

    // Also honor legacy `fableParams` overrides when present on imported web documents.
    const QJsonObject fp = instrument.value(u"fableParams").toObject();
    if (!fp.isEmpty()) {
        p.oscLevel = static_cast<float>(readBounded(fp, "osc.level", p.oscLevel, 0.0, 1.2));
        p.fine = static_cast<float>(readBounded(fp, "osc.fine", p.fine, -100.0, 100.0));
    }

    return p;
}

}  // namespace nt::midi
