// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/Mixer.h"
#include "audio/effects/fable/FableDynamics.h"
#include "audio/effects/fable/FableParametricEq.h"

#include <QJsonObject>

#include <array>
#include <memory>
#include <span>
#include <string_view>
#include <vector>

namespace nt::audio::effects::fable {

enum class ParamCurve {
    Linear,
    Log,
    Int,
    Bool,
    Enum,
};

struct ParamDef {
    std::string_view id;
    std::string_view label;
    double min = 0.0;
    double max = 1.0;
    double def = 0.0;
    ParamCurve curve = ParamCurve::Linear;
};

// Returns true for the FableSynth dynamics/EQ effect kinds implemented here:
// "eq", "comp", "ott", "limiter".
[[nodiscard]] bool isFableDynamicsKind(std::string_view kind) noexcept;

// Canonical parameter definitions matching FableSynth fableFxParams.ts and params.ts
// (in params.ts order, excluding the `.on` switch).
[[nodiscard]] std::span<const ParamDef> fableDynamicsParams(std::string_view kind) noexcept;

// Default `params` JSON object for a FableSynth track insert of `kind`.
[[nodiscard]] QJsonObject fableDynamicsDefaults(std::string_view kind);

// Creates a BlockProcessor for a `{ type: "fable", kind: "eq"|"comp"|"ott"|"limiter", params: {...} }`
// effect object, or nullptr for unsupported kinds.
[[nodiscard]] std::unique_ptr<nt::audio::BlockProcessor> createFableDynamicsEffect(const QJsonObject& effect);

// Four-band FableSynth parametric EQ insert (kind = "eq").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableEqProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableEqProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return eq_.latencySamples(); }

private:
    ParametricEq eq_;
    std::array<float, ParametricEq::kParamCount> params_{};
    bool prepared_ = false;
};

// Stereo-linked FableSynth leveling compressor insert with AutoGain (kind = "comp").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableCompProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableCompProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return comp_.latencySamples(); }

private:
    void applyParams() noexcept;

    WebCompressor comp_;
    PeakGuard guard_;
    bool on_ = true;
    float thresholdDb_ = -18.0f;
    float attackSec_ = 0.003f;
    float releaseSec_ = 0.25f;
    float ratio_ = 4.0f;
    float scHpHz_ = 20.0f;
    bool prepared_ = false;
};

// Three-band FableSynth OTT multiband dynamics insert with AutoGain (kind = "ott").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableOttProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableOttProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return ott_.latencySamples(); }

private:
    void applyParams() noexcept;

    OttCompressor ott_;
    PeakGuard guard_;
    bool on_ = true;
    float depth_ = 0.35f;
    float time_ = 1.0f;
    float up_ = 1.0f;
    float down_ = 1.0f;
    bool prepared_ = false;
};

// Stereo-linked FableSynth lookahead true-peak limiter insert using 4x HalfBandFir (kind = "limiter").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableLimiterProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableLimiterProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return limiter_.latencySamples(); }

private:
    void applyTargets(bool snap) noexcept;

    LookaheadLimiter limiter_;
    PeakGuard bypassGuard_;
    SmoothD inputGain_;
    SmoothD ceiling_;
    SmoothD wet_;
    SmoothD dry_;
    std::vector<float> rawDelayL_;
    std::vector<float> rawDelayR_;
    int rawPos_ = 0;
    bool on_ = true;
    double gainDb_ = 0.0;
    double ceilDb_ = -1.0;
    double releaseSec_ = 0.1;
    bool prepared_ = false;
};

}  // namespace nt::audio::effects::fable
