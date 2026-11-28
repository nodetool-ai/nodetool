// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableDynamicsEffects.h"

#include "audio/DenormalGuard.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace nt::audio::effects::fable {
namespace {

constexpr double kSqrt1_2 = 0.7071067811865476;

constexpr std::array<ParamDef, 20> kEqParams{{
    {"fx.eq.low", "LOW", -15.0, 15.0, 0.0, ParamCurve::Linear},
    {"fx.eq.mid", "MID", -15.0, 15.0, 0.0, ParamCurve::Linear},
    {"fx.eq.mfreq", "FREQ", 20.0, 20000.0, 900.0, ParamCurve::Log},
    {"fx.eq.high", "HIGH", -15.0, 15.0, 0.0, ParamCurve::Linear},
    {"fx.eq.lfreq", "FREQ", 20.0, 20000.0, 120.0, ParamCurve::Log},
    {"fx.eq.m2freq", "FREQ", 20.0, 20000.0, 2500.0, ParamCurve::Log},
    {"fx.eq.hfreq", "FREQ", 20.0, 20000.0, 6000.0, ParamCurve::Log},
    {"fx.eq.mid2", "GAIN", -15.0, 15.0, 0.0, ParamCurve::Linear},
    {"fx.eq.lq", "Q", 0.2, 12.0, kSqrt1_2, ParamCurve::Log},
    {"fx.eq.ltype", "TYPE", 0.0, 2.0, 0.0, ParamCurve::Enum},
    {"fx.eq.lon", "ON", 0.0, 1.0, 1.0, ParamCurve::Bool},
    {"fx.eq.mq", "Q", 0.2, 12.0, 0.9, ParamCurve::Log},
    {"fx.eq.mtype", "TYPE", 0.0, 2.0, 1.0, ParamCurve::Enum},
    {"fx.eq.mon", "ON", 0.0, 1.0, 1.0, ParamCurve::Bool},
    {"fx.eq.m2q", "Q", 0.2, 12.0, 0.9, ParamCurve::Log},
    {"fx.eq.m2type", "TYPE", 0.0, 2.0, 1.0, ParamCurve::Enum},
    {"fx.eq.m2on", "ON", 0.0, 1.0, 1.0, ParamCurve::Bool},
    {"fx.eq.hq", "Q", 0.2, 12.0, kSqrt1_2, ParamCurve::Log},
    {"fx.eq.htype", "TYPE", 0.0, 2.0, 2.0, ParamCurve::Enum},
    {"fx.eq.hon", "ON", 0.0, 1.0, 1.0, ParamCurve::Bool},
}};

constexpr std::array<ParamDef, 5> kCompParams{{
    {"fx.comp.thr", "THRESH", -40.0, 0.0, -18.0, ParamCurve::Linear},
    {"fx.comp.att", "ATTACK", 0.0001, 0.1, 0.003, ParamCurve::Log},
    {"fx.comp.rel", "RELEASE", 0.01, 2.0, 0.25, ParamCurve::Log},
    {"fx.comp.ratio", "RATIO", 1.0, 20.0, 4.0, ParamCurve::Log},
    {"fx.comp.schp", "KEY HP", 20.0, 500.0, 20.0, ParamCurve::Log},
}};

constexpr std::array<ParamDef, 4> kOttParams{{
    {"fx.ott.depth", "DEPTH", 0.0, 1.0, 0.35, ParamCurve::Linear},
    {"fx.ott.time", "TIME", 0.01, 10.0, 1.0, ParamCurve::Log},
    {"fx.ott.up", "UPWARD", 0.0, 2.0, 1.0, ParamCurve::Linear},
    {"fx.ott.down", "DOWNWARD", 0.0, 2.0, 1.0, ParamCurve::Linear},
}};

constexpr std::array<ParamDef, 3> kLimiterParams{{
    {"fx.limit.gain", "INPUT", 0.0, 24.0, 0.0, ParamCurve::Linear},
    {"fx.limit.ceil", "CEILING", -12.0, 0.0, -1.0, ParamCurve::Linear},
    {"fx.limit.rel", "RELEASE", 0.01, 1.0, 0.1, ParamCurve::Log},
}};

constexpr std::array<std::string_view, ParametricEq::kParamCount> kEqFieldOrder{{
    "fx.eq.on", "fx.eq.low", "fx.eq.mid", "fx.eq.mfreq", "fx.eq.high",
    "fx.eq.lfreq", "fx.eq.m2freq", "fx.eq.hfreq", "fx.eq.mid2",
    "fx.eq.lq", "fx.eq.ltype", "fx.eq.lon",
    "fx.eq.mq", "fx.eq.mtype", "fx.eq.mon",
    "fx.eq.m2q", "fx.eq.m2type", "fx.eq.m2on",
    "fx.eq.hq", "fx.eq.htype", "fx.eq.hon",
}};

constexpr std::array<float, ParametricEq::kParamCount> kEqDefaultValues{{
    1.0f, 0.0f, 0.0f, 900.0f, 0.0f,
    120.0f, 2500.0f, 6000.0f, 0.0f,
    static_cast<float>(kSqrt1_2), 0.0f, 1.0f,
    0.9f, 1.0f, 1.0f,
    0.9f, 1.0f, 1.0f,
    static_cast<float>(kSqrt1_2), 2.0f, 1.0f,
}};

double readParam(const QJsonObject& effect, std::string_view key, double fallback) {
    const QString qkey = QString::fromUtf8(key.data(), static_cast<qsizetype>(key.size()));
    const QJsonObject params = effect.value(u"params").toObject();
    QJsonValue v = params.value(qkey);
    if (!v.isDouble() && !v.isBool()) {
        v = effect.value(qkey);
    }
    if (v.isBool()) {
        return v.toBool() ? 1.0 : 0.0;
    }
    if (!v.isDouble()) {
        return fallback;
    }
    const double d = v.toDouble();
    return std::isfinite(d) ? d : fallback;
}

double dbToGain(double db) noexcept {
    return std::pow(10.0, db / 20.0);
}

constexpr int kChunkFrames = 128;

}  // namespace

bool isFableDynamicsKind(std::string_view kind) noexcept {
    return kind == "eq" || kind == "comp" || kind == "ott" || kind == "limiter";
}

std::span<const ParamDef> fableDynamicsParams(std::string_view kind) noexcept {
    if (kind == "eq") {
        return kEqParams;
    }
    if (kind == "comp") {
        return kCompParams;
    }
    if (kind == "ott") {
        return kOttParams;
    }
    if (kind == "limiter") {
        return kLimiterParams;
    }
    return {};
}

QJsonObject fableDynamicsDefaults(std::string_view kind) {
    QJsonObject out;
    for (const auto& def : fableDynamicsParams(kind)) {
        out.insert(QString::fromUtf8(def.id.data(), static_cast<qsizetype>(def.id.size())), def.def);
    }
    return out;
}

std::unique_ptr<nt::audio::BlockProcessor> createFableDynamicsEffect(const QJsonObject& effect) {
    const QString kind = effect.value(u"kind").toString();
    if (kind == u"eq") {
        return std::make_unique<FableEqProcessor>(effect);
    }
    if (kind == u"comp") {
        return std::make_unique<FableCompProcessor>(effect);
    }
    if (kind == u"ott") {
        return std::make_unique<FableOttProcessor>(effect);
    }
    if (kind == u"limiter") {
        return std::make_unique<FableLimiterProcessor>(effect);
    }
    return nullptr;
}

// ---------------- FableEqProcessor ----------------

FableEqProcessor::FableEqProcessor(const QJsonObject& effect) : params_(kEqDefaultValues) {
    id = effect.value(u"id").toString().toStdString();
    const bool enabled = effect.value(u"enabled").toBool(true) && (readParam(effect, "fx.eq.on", 1.0) > 0.5);
    params_[0] = enabled ? 1.0f : 0.0f;
    for (std::size_t i = 1; i < kEqFieldOrder.size(); ++i) {
        const double raw = readParam(effect, kEqFieldOrder[i], static_cast<double>(kEqDefaultValues[i]));
        params_[i] = static_cast<float>(raw);
    }
}

void FableEqProcessor::prepare(double sampleRate) {
    threadGuard_.unbind();
    eq_.prepare(sampleRate);
    eq_.setParams(params_);
    prepared_ = true;
}

void FableEqProcessor::reset() noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    BlockProcessor::reset();
    eq_.reset();
}

bool FableEqProcessor::setParameter(std::string_view key, double value) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    if (!std::isfinite(value)) {
        return false;
    }
    for (std::size_t i = 0; i < kEqFieldOrder.size(); ++i) {
        if (kEqFieldOrder[i] != key) {
            continue;
        }
        double clamped = value;
        if (i == 0) {
            clamped = value > 0.5 ? 1.0 : 0.0;
        } else {
            for (const auto& def : kEqParams) {
                if (def.id == key) {
                    clamped = std::clamp(value, def.min, def.max);
                    break;
                }
            }
        }
        params_[i] = static_cast<float>(clamped);
        if (prepared_) {
            eq_.setParams(params_);
        }
        return true;
    }
    return false;
}

void FableEqProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(true);
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
        eq_.process(bufL.data(), bufR.data(), static_cast<int>(count));
        for (std::size_t i = 0; i < count; ++i) {
            stereo[(offset + i) * 2] = bufL[i];
            stereo[(offset + i) * 2 + 1] = bufR[i];
        }
        offset += count;
    }
}

bool FableEqProcessor::hasPendingOutput(int) const noexcept {
    return eq_.hasPendingOutput();
}

// ---------------- FableCompProcessor ----------------

FableCompProcessor::FableCompProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true) && (readParam(effect, "fx.comp.on", 1.0) > 0.5);
    thresholdDb_ = static_cast<float>(std::clamp(readParam(effect, "fx.comp.thr", -18.0), -40.0, 0.0));
    attackSec_ = static_cast<float>(std::clamp(readParam(effect, "fx.comp.att", 0.003), 0.0001, 0.1));
    releaseSec_ = static_cast<float>(std::clamp(readParam(effect, "fx.comp.rel", 0.25), 0.01, 2.0));
    ratio_ = static_cast<float>(std::clamp(readParam(effect, "fx.comp.ratio", 4.0), 1.0, 20.0));
    scHpHz_ = static_cast<float>(std::clamp(readParam(effect, "fx.comp.schp", 20.0), 20.0, 500.0));
}

void FableCompProcessor::applyParams() noexcept {
    comp_.setParams(on_, thresholdDb_, attackSec_, releaseSec_, ratio_);
    comp_.setKey(false, scHpHz_);
}

void FableCompProcessor::prepare(double sampleRate) {
    threadGuard_.unbind();
    comp_.prepare(sampleRate);
    guard_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
    comp_.reset();
}

void FableCompProcessor::reset() noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    BlockProcessor::reset();
    comp_.reset();
    guard_.reset();
}

bool FableCompProcessor::setParameter(std::string_view key, double value) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.comp.on") {
        on_ = value > 0.5;
    } else if (key == "fx.comp.thr") {
        thresholdDb_ = static_cast<float>(std::clamp(value, -40.0, 0.0));
    } else if (key == "fx.comp.att") {
        attackSec_ = static_cast<float>(std::clamp(value, 0.0001, 0.1));
    } else if (key == "fx.comp.rel") {
        releaseSec_ = static_cast<float>(std::clamp(value, 0.01, 2.0));
    } else if (key == "fx.comp.ratio") {
        ratio_ = static_cast<float>(std::clamp(value, 1.0, 20.0));
    } else if (key == "fx.comp.schp") {
        scHpHz_ = static_cast<float>(std::clamp(value, 20.0, 500.0));
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableCompProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(true);
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
        comp_.process(bufL.data(), bufR.data(), static_cast<int>(count), nullptr);
        guard_.process(bufL.data(), bufR.data(), static_cast<int>(count));
        for (std::size_t i = 0; i < count; ++i) {
            stereo[(offset + i) * 2] = bufL[i];
            stereo[(offset + i) * 2 + 1] = bufR[i];
        }
        offset += count;
    }
}

// ---------------- FableOttProcessor ----------------

FableOttProcessor::FableOttProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true) && (readParam(effect, "fx.ott.on", 1.0) > 0.5);
    depth_ = static_cast<float>(std::clamp(readParam(effect, "fx.ott.depth", 0.35), 0.0, 1.0));
    time_ = static_cast<float>(std::clamp(readParam(effect, "fx.ott.time", 1.0), 0.01, 10.0));
    up_ = static_cast<float>(std::clamp(readParam(effect, "fx.ott.up", 1.0), 0.0, 2.0));
    down_ = static_cast<float>(std::clamp(readParam(effect, "fx.ott.down", 1.0), 0.0, 2.0));
}

void FableOttProcessor::applyParams() noexcept {
    ott_.setParams(on_, depth_, time_, up_, down_);
}

void FableOttProcessor::prepare(double sampleRate) {
    threadGuard_.unbind();
    ott_.prepare(sampleRate);
    guard_.prepare(sampleRate);
    prepared_ = true;
    applyParams();
    ott_.reset();
}

void FableOttProcessor::reset() noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    BlockProcessor::reset();
    ott_.reset();
    guard_.reset();
}

bool FableOttProcessor::setParameter(std::string_view key, double value) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.ott.on") {
        on_ = value > 0.5;
    } else if (key == "fx.ott.depth") {
        depth_ = static_cast<float>(std::clamp(value, 0.0, 1.0));
    } else if (key == "fx.ott.time") {
        time_ = static_cast<float>(std::clamp(value, 0.01, 10.0));
    } else if (key == "fx.ott.up") {
        up_ = static_cast<float>(std::clamp(value, 0.0, 2.0));
    } else if (key == "fx.ott.down") {
        down_ = static_cast<float>(std::clamp(value, 0.0, 2.0));
    } else {
        return false;
    }
    if (prepared_) {
        applyParams();
    }
    return true;
}

void FableOttProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(true);
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
        ott_.process(bufL.data(), bufR.data(), static_cast<int>(count));
        guard_.process(bufL.data(), bufR.data(), static_cast<int>(count));
        for (std::size_t i = 0; i < count; ++i) {
            stereo[(offset + i) * 2] = bufL[i];
            stereo[(offset + i) * 2 + 1] = bufR[i];
        }
        offset += count;
    }
}

bool FableOttProcessor::hasPendingOutput(int) const noexcept {
    return ott_.hasPendingOutput();
}

// ---------------- FableLimiterProcessor ----------------

FableLimiterProcessor::FableLimiterProcessor(const QJsonObject& effect) {
    id = effect.value(u"id").toString().toStdString();
    on_ = effect.value(u"enabled").toBool(true) && (readParam(effect, "fx.limit.on", 1.0) > 0.5);
    gainDb_ = std::clamp(readParam(effect, "fx.limit.gain", 0.0), 0.0, 24.0);
    ceilDb_ = std::clamp(readParam(effect, "fx.limit.ceil", -1.0), -12.0, 0.0);
    releaseSec_ = std::clamp(readParam(effect, "fx.limit.rel", 0.1), 0.01, 1.0);
}

void FableLimiterProcessor::applyTargets(bool snap) noexcept {
    inputGain_.target = dbToGain(gainDb_);
    ceiling_.target = dbToGain(ceilDb_);
    wet_.target = on_ ? 1.0 : 0.0;
    dry_.target = on_ ? 0.0 : 1.0;
    limiter_.setRelease(releaseSec_);
    if (snap) {
        inputGain_.snap(inputGain_.target);
        ceiling_.snap(ceiling_.target);
        wet_.snap(wet_.target);
        dry_.snap(dry_.target);
    }
}

void FableLimiterProcessor::prepare(double sampleRate) {
    threadGuard_.unbind();
    limiter_.prepare(sampleRate, 1.0, true, releaseSec_);
    bypassGuard_.prepare(sampleRate);
    inputGain_.setTime(0.02, sampleRate);
    ceiling_.setTime(0.02, sampleRate);
    wet_.setTime(0.02, sampleRate);
    dry_.setTime(0.02, sampleRate);
    const std::size_t delayLen = static_cast<std::size_t>(std::max(1, limiter_.latencySamples()));
    rawDelayL_.assign(delayLen, 0.0f);
    rawDelayR_.assign(delayLen, 0.0f);
    rawPos_ = 0;
    prepared_ = true;
    applyTargets(true);
    reset();
}

void FableLimiterProcessor::reset() noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    BlockProcessor::reset();
    limiter_.reset();
    bypassGuard_.reset();
    std::ranges::fill(rawDelayL_, 0.0f);
    std::ranges::fill(rawDelayR_, 0.0f);
    rawPos_ = 0;
    if (prepared_) {
        applyTargets(true);
    }
}

bool FableLimiterProcessor::setParameter(std::string_view key, double value) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(false);
    if (!std::isfinite(value)) {
        return false;
    }
    if (key == "fx.limit.on") {
        const bool nextOn = value > 0.5;
        if (nextOn && !on_) {
            bypassGuard_.reset();
        }
        on_ = nextOn;
    } else if (key == "fx.limit.gain") {
        gainDb_ = std::clamp(value, 0.0, 24.0);
    } else if (key == "fx.limit.ceil") {
        ceilDb_ = std::clamp(value, -12.0, 0.0);
    } else if (key == "fx.limit.rel") {
        releaseSec_ = std::clamp(value, 0.01, 1.0);
    } else {
        return false;
    }
    if (prepared_) {
        applyTargets(false);
    }
    return true;
}

void FableLimiterProcessor::process(std::span<float> stereo, const nt::audio::BlockContext&) noexcept {
    [[maybe_unused]] const auto renderScope = threadGuard_.enterRender(true);
    ScopedDenormalGuard denormalGuard;
    if (rawDelayL_.empty()) {
        return;
    }
    if (on_ && bypassGuard_.gain != 1.0) {
        bypassGuard_.reset();
    }
    const int delayLen = static_cast<int>(rawDelayL_.size());
    const std::size_t totalFrames = stereo.size() / 2;
    for (std::size_t i = 0; i < totalFrames; ++i) {
        const float rawL = std::isfinite(stereo[i * 2]) ? stereo[i * 2] : 0.0f;
        const float rawR = std::isfinite(stereo[i * 2 + 1]) ? stereo[i * 2 + 1] : 0.0f;

        const double drive = inputGain_.next();
        const double ceil = ceiling_.next();
        const double wet = wet_.next();
        const double dry = dry_.next();

        float limL = static_cast<float>(std::clamp(static_cast<double>(rawL) * drive, -1.0e18, 1.0e18));
        float limR = static_cast<float>(std::clamp(static_cast<double>(rawR) * drive, -1.0e18, 1.0e18));
        (void)limiter_.process(limL, limR, ceil);

        const float outRawL = rawDelayL_[static_cast<std::size_t>(rawPos_)];
        const float outRawR = rawDelayR_[static_cast<std::size_t>(rawPos_)];
        rawDelayL_[static_cast<std::size_t>(rawPos_)] = rawL;
        rawDelayR_[static_cast<std::size_t>(rawPos_)] = rawR;
        if (++rawPos_ >= delayLen) {
            rawPos_ = 0;
        }

        double yL = dry * static_cast<double>(outRawL) + wet * static_cast<double>(limL);
        double yR = dry * static_cast<double>(outRawR) + wet * static_cast<double>(limR);
        if (!on_) {
            bypassGuard_.apply(yL, yR);
        }
        stereo[i * 2] = std::isfinite(yL) ? static_cast<float>(yL) : 0.0f;
        stereo[i * 2 + 1] = std::isfinite(yR) ? static_cast<float>(yR) : 0.0f;
    }
}

bool FableLimiterProcessor::hasPendingOutput(int) const noexcept {
    if (limiter_.hasPendingOutput()) {
        return true;
    }
    for (float v : rawDelayL_) {
        if (v != 0.0f) {
            return true;
        }
    }
    for (float v : rawDelayR_) {
        if (v != 0.0f) {
            return true;
        }
    }
    return false;
}

}  // namespace nt::audio::effects::fable
