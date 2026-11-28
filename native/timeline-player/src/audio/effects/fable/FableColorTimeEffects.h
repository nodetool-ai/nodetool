// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,DriveOs.h,PlateReverb.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include "audio/Mixer.h"
#include "audio/effects/fable/FableColorTime.h"
#include "audio/effects/fable/FableDynamicsEffects.h"

#include <QJsonObject>

#include <memory>
#include <span>
#include <string_view>

namespace nt::audio::effects::fable {

// Returns true for the FableSynth color/time effect kinds implemented here:
// "drive", "chorus", "echo", "reverb".
[[nodiscard]] bool isFableColorTimeKind(std::string_view kind) noexcept;

// Canonical parameter definitions matching FableSynth fableFxParams.ts and params.ts
// (plus FableSynth ae9fca7 reverb type/damp controls, defaulting to ROOM/0.5).
[[nodiscard]] std::span<const ParamDef> fableColorTimeParams(std::string_view kind) noexcept;

// Default `params` JSON object for a FableSynth track insert of `kind`.
[[nodiscard]] QJsonObject fableColorTimeDefaults(std::string_view kind);

// Creates a BlockProcessor for `{ type: "fable", kind: "drive"|"chorus"|"echo"|"reverb", params: {...} }`,
// or nullptr for unsupported kinds. Pass tempoBpm > 0 to override JSON `effect["bpm"]` (0 = use JSON or 120).
[[nodiscard]] std::unique_ptr<nt::audio::BlockProcessor> createFableColorTimeEffect(
    const QJsonObject& effect, double tempoBpm = 0.0);

// 4x oversampled FableSynth drive insert (kind = "drive").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableDriveProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableDriveProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void armForPlayback() override { threadGuard_.unbind(); }
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return drive_.latencySamples(); }

private:
    void applyParams() noexcept;

    FableDriveDsp drive_;
    bool on_ = true;
    float amt_ = 0.3f;
    float mix_ = 1.0f;
    float tone_ = 0.0f;
    float type_ = 0.0f;
    bool prepared_ = false;
    DebugRenderThreadGuard threadGuard_;
};

// Stereo modulated-tap FableSynth chorus insert (kind = "chorus").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableChorusProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableChorusProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void armForPlayback() override { threadGuard_.unbind(); }
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return chorus_.latencySamples(); }

private:
    void applyParams() noexcept;

    FableChorusDsp chorus_;
    bool on_ = true;
    float rate_ = 0.6f;
    float depth_ = 0.5f;
    float mix_ = 0.5f;
    bool prepared_ = false;
    DebugRenderThreadGuard threadGuard_;
};

// Tempo-synced FableSynth stereo tape echo insert (kind = "echo").
// Thread affinity: constructed and prepared on control thread; process/setParameter/setTempoBpm/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableEchoProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableEchoProcessor(const QJsonObject& effect = {}, double tempoBpm = 0.0);
    void prepare(double sampleRate) override;
    void armForPlayback() override { threadGuard_.unbind(); }
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void setTempoBpm(double tempoBpm) noexcept;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return echo_.latencySamples(); }
    [[nodiscard]] double targetDelaySec() const noexcept { return echo_.targetDelaySec(); }

private:
    void applyParams() noexcept;

    FableEchoDsp echo_;
    bool on_ = true;
    float time_ = 0.36f;
    float fb_ = 0.35f;
    float mix_ = 0.3f;
    float tone_ = 4500.0f;
    float sat_ = 0.2f;
    float wow_ = 0.18f;
    float flutter_ = 0.12f;
    float width_ = 1.0f;
    float mode_ = 0.0f;
    bool sync_ = false;
    int div_ = 3;
    double tempoBpm_ = 120.0;
    bool prepared_ = false;
    DebugRenderThreadGuard threadGuard_;
};

// Dual-mode (ROOM Freeverb / PLATE Dattorro) FableSynth reverb insert (kind = "reverb").
// Thread affinity: constructed and prepared on control thread; process/setParameter/reset
// touched on the single active audio render thread (serialized by MixRenderLease).
class FableReverbProcessor final : public nt::audio::BlockProcessor {
public:
    explicit FableReverbProcessor(const QJsonObject& effect = {});
    void prepare(double sampleRate) override;
    void armForPlayback() override { threadGuard_.unbind(); }
    void reset() noexcept override;
    bool setParameter(std::string_view key, double value) noexcept override;
    void process(std::span<float> stereo, const nt::audio::BlockContext& context) noexcept override;
    [[nodiscard]] bool hasPendingOutput(int frames) const noexcept override;
    [[nodiscard]] int latencySamples() const noexcept override { return reverb_.latencySamples(); }

private:
    void applyParams() noexcept;

    FableReverbDsp reverb_;
    bool on_ = true;
    float size_ = 0.5f;
    float mix_ = 0.3f;
    int type_ = 0;
    float damp_ = 0.5f;
    bool prepared_ = false;
    DebugRenderThreadGuard threadGuard_;
};

}  // namespace nt::audio::effects::fable
