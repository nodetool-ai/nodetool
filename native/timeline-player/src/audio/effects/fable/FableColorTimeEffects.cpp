// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,DriveOs.h,PlateReverb.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableColorTimeEffects.h"

#include "audio/DenormalGuard.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace nt::audio::effects::fable {
namespace {

constexpr int kChunkFrames = 128;

constexpr std::array<ParamDef, 4> kDriveParams{{
    {"fx.drive.amt", "AMOUNT", 0.0, 1.0, 0.3, ParamCurve::Linear},
    {"fx.drive.mix", "MIX", 0.0, 1.0, 1.0, ParamCurve::Linear},
    {"fx.drive.tone", "TONE", -1.0, 1.0, 0.0, ParamCurve::Linear},
    {"fx.drive.type", "TYPE", 0.0, 2.0, 0.0, ParamCurve::Enum},
}};

constexpr std::array<ParamDef, 3> kChorusParams{{
    {"fx.chorus.rate", "RATE", 0.05, 8.0, 0.6, ParamCurve::Log},
    {"fx.chorus.depth", "DEPTH", 0.0, 1.0, 0.5, ParamCurve::Linear},
    {"fx.chorus.mix", "MIX", 0.0, 1.0, 0.5, ParamCurve::Linear},
}};

constexpr std::array<ParamDef, 11> kEchoParams{{
    {"fx.delay.time", "TIME", 0.02, 1.5, 0.36, ParamCurve::Log},
    {"fx.delay.fb", "FDBK", 0.0, 0.92, 0.35, ParamCurve::Linear},
    {"fx.delay.mix", "MIX", 0.0, 1.0, 0.3, ParamCurve::Linear},
    {"fx.delay.tone", "TONE", 400.0, 12000.0, 4500.0, ParamCurve::Log},
    {"fx.delay.sat", "SAT", 0.0, 1.0, 0.2, ParamCurve::Linear},
    {"fx.delay.wow", "WOW", 0.0, 1.0, 0.18, ParamCurve::Linear},
    {"fx.delay.flutter", "FLUTTER", 0.0, 1.0, 0.12, ParamCurve::Linear},
    {"fx.delay.width", "WIDTH", 0.0, 1.0, 1.0, ParamCurve::Linear},
    {"fx.delay.mode", "MODE", 0.0, 1.0, 0.0, ParamCurve::Enum},
    {"fx.delay.sync", "SYNC", 0.0, 1.0, 0.0, ParamCurve::Bool},
    {"fx.delay.div", "DIV", 0.0, 5.0, 3.0, ParamCurve::Enum},
}};

constexpr std::array<ParamDef, 4> kReverbParams{{
    {"fx.reverb.size", "SIZE", 0.0, 1.0, 0.5, ParamCurve::Linear},
    {"fx.reverb.mix", "MIX", 0.0, 1.0, 0.3, ParamCurve::Linear},
    {"fx.reverb.type", "TYPE", 0.0, 1.0, 0.0, ParamCurve::Enum},
    {"fx.reverb.damp", "DAMP", 0.0, 1.0, 0.5, ParamCurve::Linear},
}};

double readParam(const QJsonObject& effect, std::string_view key, double fallback) {
    const QString qkey = QString::fromUtf8(key.data(), static_cast<qsizetype>(key.size()));
    const QJsonObject params = effect.value(u"params").toObject();
    QJsonValue v = params.value(qkey);
    if (!v.isDouble()) {
        v = effect.value(qkey);
    }
    if (!v.isDouble()) {
        return fallback;
    }
    const double d = v.toDouble();
    return std::isfinite(d) ? d : fallback;
}

template <class Dsp>
void processStereoChunks(Dsp& dsp, std::span<float> stereo) noexcept {
    ScopedDenormalGuard denormalGuard;
    const std::size_t totalFrames = stereo.size() / 2;
    std::array<float, kChunkFrames> bufL{};
    std::array<float, kChunkFrames> bufR{};
    std::size_t offset = 0;
    while (offset < totalFrames) {
        const std::size_t count = std::min<std::size_t>(kChunkFrames, totalFrames - offset);
        for (std::size_t i = 0; i < count; ++i) {
            bufL[i] = stereo[(offset + i) * 2];
            bufR[i] = stereo[(offset + i) * 2 + 1];
        }
        dsp.process(bufL.data(), bufR.data(), static_cast<int>(count));
        for (std::size_t i = 0; i < count; ++i) {
            stereo[(offset + i) * 2] = bufL[i];
            stereo[(offset + i) * 2 + 1] = bufR[i];
        }
        offset += count;
    }
}

}  // namespace

bool isFableColorTimeKind(std::string_view kind) noexcept {
    return kind == "drive" || kind == "chorus" || kind == "echo" || kind == "reverb";
}

std::span<const ParamDef> fableColorTimeParams(std::string_view kind) noexcept {
    if (kind == "drive") {
        return kDriveParams;
    }
    if (kind == "chorus") {
        return kChorusParams;
    }
    if (kind == "echo") {
        return kEchoParams;
    }
    if (kind == "reverb") {
        return kReverbParams;
    }
    return {};
}

QJsonObject fableColorTimeDefaults(std::string_view kind) {
    QJsonObject out;
    for (const auto& def : fableColorTimeParams(kind)) {
        out.insert(QString::fromUtf8(def.id.data(), static_cast<qsizetype>(def.id.size())), def.def);
    }
    return out;
}

std::unique_ptr<nt::audio::BlockProcessor> createFableColorTimeEffect(
    const QJsonObject& effect, double tempoBpm) {
    const QString kind = effect.value(u"kind").toString();
    if (kind == u"drive") {
        return std::make_unique<FableDriveProcessor>(effect);
    }
    if (kind == u"chorus") {
        return std::make_unique<FableChorusProcessor>(effect);
    }
    if (kind == u"echo") {
        return std::make_unique<FableEchoProcessor>(effect, tempoBpm);
    }
    if (kind == u"reverb") {
        return std::make_unique<FableReverbProcessor>(effect);
    }
    return nullptr;
}

// ---------------- FableDriveProcessor ----------------

FableDriveProcessor::FableDriveProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true);
    amt_ = static_cast<float>(std::clamp(readParam(effect, "fx.drive.amt", 0.3), 0.0, 1.0));
    mix_ = static_cast<float>(std::clamp(readParam(effect, "fx.drive.mix", 1.0), 0.0, 1.0));
    tone_ = static_cast<float>(std::clamp(readParam(effect, "fx.drive.tone", 0.0), -1.0, 1.0));
    type_ = static_cast<float>(std::clamp(std::round(readParam(effect, "fx.drive.type", 0.0)), 0.0, 2.0));
}

void FableDriveProcessor::applyParams() noexcept {
    drive_.setParams(on_, amt_, mix_, type_, tone_);
}

void FableDriveProcessor::prepare(double sampleRate) {
    drive_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
}

void FableDriveProcessor::reset() noexcept {
    BlockProcessor::reset();
    drive_.reset();
}

bool FableDriveProcessor::setParameter(std::string_view key, double value) noexcept {
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.drive.on") {
        on_ = value > 0.5;
    } else if (key == "fx.drive.amt") {
        amt_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.drive.mix") {
        mix_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.drive.tone") {
        tone_ = static_cast<float>(std::clamp(value, -1.0, 1.0));
    } else if (key == "fx.drive.type") {
        type_ = static_cast<float>(std::clamp(std::round(value), 0.0, 2.0));
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableDriveProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    processStereoChunks(drive_, stereo);
}

bool FableDriveProcessor::hasPendingOutput(int) const noexcept {
    return drive_.hasPendingOutput();
}

// ---------------- FableChorusProcessor ----------------

FableChorusProcessor::FableChorusProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true);
    rate_ = static_cast<float>(std::clamp(readParam(effect, "fx.chorus.rate", 0.6), 0.05, 8.0));
    depth_ = static_cast<float>(std::clamp(readParam(effect, "fx.chorus.depth", 0.5), 0.0, 1.0));
    mix_ = static_cast<float>(std::clamp(readParam(effect, "fx.chorus.mix", 0.5), 0.0, 1.0));
}

void FableChorusProcessor::applyParams() noexcept {
    chorus_.setParams(on_, rate_, depth_, mix_);
}

void FableChorusProcessor::prepare(double sampleRate) {
    chorus_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
}

void FableChorusProcessor::reset() noexcept {
    BlockProcessor::reset();
    chorus_.reset();
}

bool FableChorusProcessor::setParameter(std::string_view key, double value) noexcept {
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.chorus.on") {
        on_ = value > 0.5;
    } else if (key == "fx.chorus.rate") {
        rate_ = static_cast<float>(std::clamp(value, 0.05, 8.0));
    } else if (key == "fx.chorus.depth") {
        depth_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.chorus.mix") {
        mix_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableChorusProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    processStereoChunks(chorus_, stereo);
}

bool FableChorusProcessor::hasPendingOutput(int) const noexcept {
    return chorus_.hasPendingOutput();
}

// ---------------- FableEchoProcessor ----------------

FableEchoProcessor::FableEchoProcessor(const QJsonObject& effect, double tempoBpm) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true);
    const double jsonBpm = effect.value(u"bpm").toDouble(0.0);
    tempoBpm_ = (std::isfinite(tempoBpm) && tempoBpm > 0.0)
        ? tempoBpm
        : ((std::isfinite(jsonBpm) && jsonBpm > 0.0) ? jsonBpm : 120.0);
    time_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.time", 0.36), 0.02, 1.5));
    fb_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.fb", 0.35), 0.0, 0.92));
    mix_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.mix", 0.3), 0.0, 1.0));
    tone_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.tone", 4500.0), 400.0, 12000.0));
    sat_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.sat", 0.2), 0.0, 1.0));
    wow_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.wow", 0.18), 0.0, 1.0));
    flutter_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.flutter", 0.12), 0.0, 1.0));
    width_ = static_cast<float>(std::clamp(readParam(effect, "fx.delay.width", 1.0), 0.0, 1.0));
    mode_ = readParam(effect, "fx.delay.mode", 0.0) > 0.5 ? 1.0f : 0.0f;
    sync_ = readParam(effect, "fx.delay.sync", 0.0) > 0.5;
    div_ = std::clamp(static_cast<int>(std::lround(readParam(effect, "fx.delay.div", 3.0))), 0, 5);
}

void FableEchoProcessor::applyParams() noexcept {
    echo_.setParams(on_, time_, fb_, mix_, tone_, sat_, wow_, flutter_, width_, mode_, sync_, div_, tempoBpm_);
}

void FableEchoProcessor::prepare(double sampleRate) {
    echo_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
}

void FableEchoProcessor::reset() noexcept {
    BlockProcessor::reset();
    echo_.reset();
}

void FableEchoProcessor::setTempoBpm(double tempoBpm) noexcept {
    if (!std::isfinite(tempoBpm) || tempoBpm <= 0.0) {
        return;
    }
    tempoBpm_ = std::max(1.0, tempoBpm);
    if (prepared_) {
        applyParams();
    }
}

bool FableEchoProcessor::setParameter(std::string_view key, double value) noexcept {
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.delay.on") {
        on_ = value > 0.5;
    } else if (key == "fx.delay.time") {
        time_ = static_cast<float>(std::clamp(value, 0.02, 1.5));
    } else if (key == "fx.delay.fb") {
        fb_ = static_cast<float>(std::clamp(value, 0.0, 0.92));
    } else if (key == "fx.delay.mix") {
        mix_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.delay.tone") {
        tone_ = static_cast<float>(std::clamp(value, 400.0, 12000.0));
    } else if (key == "fx.delay.sat") {
        sat_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.delay.wow") {
        wow_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.delay.flutter") {
        flutter_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.delay.width") {
        width_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.delay.mode") {
        mode_ = value > 0.5 ? 1.0f : 0.0f;
    } else if (key == "fx.delay.sync") {
        sync_ = value > 0.5;
    } else if (key == "fx.delay.div") {
        div_ = std::clamp(static_cast<int>(std::lround(value)), 0, 5);
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableEchoProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    processStereoChunks(echo_, stereo);
}

bool FableEchoProcessor::hasPendingOutput(int) const noexcept {
    return echo_.hasPendingOutput();
}

// ---------------- FableReverbProcessor ----------------

FableReverbProcessor::FableReverbProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true);
    size_ = static_cast<float>(std::clamp(readParam(effect, "fx.reverb.size", 0.5), 0.0, 1.0));
    mix_ = static_cast<float>(std::clamp(readParam(effect, "fx.reverb.mix", 0.3), 0.0, 1.0));
    type_ = readParam(effect, "fx.reverb.type", 0.0) > 0.5 ? 1 : 0;
    damp_ = static_cast<float>(std::clamp(readParam(effect, "fx.reverb.damp", 0.5), 0.0, 1.0));
}

void FableReverbProcessor::applyParams() noexcept {
    reverb_.setParams(on_, size_, mix_, type_, damp_);
}

void FableReverbProcessor::prepare(double sampleRate) {
    reverb_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
}

void FableReverbProcessor::reset() noexcept {
    BlockProcessor::reset();
    reverb_.reset();
}

bool FableReverbProcessor::setParameter(std::string_view key, double value) noexcept {
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.reverb.on") {
        on_ = value > 0.5;
    } else if (key == "fx.reverb.size") {
        size_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.reverb.mix") {
        mix_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.reverb.type") {
        type_ = value > 0.5 ? 1 : 0;
    } else if (key == "fx.reverb.damp") {
        damp_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableReverbProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    processStereoChunks(reverb_, stereo);
}

bool FableReverbProcessor::hasPendingOutput(int) const noexcept {
    return reverb_.hasPendingOutput();
}

}  // namespace nt::audio::effects::fable
