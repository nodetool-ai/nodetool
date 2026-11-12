#pragma once

#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <span>

namespace nt::spike {
constexpr std::size_t quantum = 128;
using Block = std::array<float, quantum * 2>;

// Immutable values handed from prepare to audio through PlanMailbox.
struct Plan {
    std::uint64_t revision = 0;
    std::uint64_t subgraphHash = 0;
    float gain = 1.0f;
};
// Value snapshots handed from prepare to audio through SeqLock.
struct Param {
    std::uint64_t revision = 0;
    float gain = 0.1f;
};
// Value snapshots handed from audio to host through SeqLock.
struct Applied {
    std::uint64_t revision = 0;
    std::uint64_t planRevision = 0;
    std::uint64_t streamFrame = 0;
    std::uint64_t clockGeneration = 1;
    float gain = 0.1f;
};

// Prepare owns the value arena. Atomic exchange transfers a borrowed slot index
// to audio. The SPSC retire ring returns it only after audio stops reading it.
class PlanMailbox {
public:
    bool publish(Plan plan) {
        auto read = retiredRead_.load(std::memory_order_relaxed);
        const auto end = retiredWrite_.load(std::memory_order_acquire);
        while (read != end) {
            free_[retired_[read % retired_.size()]] = true;
            ++read;
        }
        retiredRead_.store(read, std::memory_order_release);
        for (std::size_t slot = 0; slot < slots_.size(); ++slot) {
            if (!free_[slot]) { continue; }
            free_[slot] = false;
            slots_[slot] = plan;
            const int previous = pending_.exchange(static_cast<int>(slot), std::memory_order_acq_rel);
            if (previous >= 0) { free_[static_cast<std::size_t>(previous)] = true; }
            return true;
        }
        return false;
    }

    bool take() {
        const auto write = retiredWrite_.load(std::memory_order_relaxed);
        if (write - retiredRead_.load(std::memory_order_acquire) == retired_.size()) {
            return false;
        }
        const int slot = pending_.exchange(-1, std::memory_order_acq_rel);
        if (slot < 0) { return false; }
        retired_[write % retired_.size()] = active_;
        retiredWrite_.store(write + 1, std::memory_order_release);
        active_ = static_cast<std::size_t>(slot);
        return true;
    }
    const Plan& current() const { return slots_[active_]; }

private:
    std::array<Plan, 4> slots_{};
    std::array<bool, 4> free_{false, true, true, true}; // Prepare only.
    std::atomic<int> pending_{-1};
    std::size_t active_ = 0; // Audio only.
    std::array<std::size_t, 4> retired_{};
    std::atomic<std::uint64_t> retiredWrite_{0};
    std::atomic<std::uint64_t> retiredRead_{0};
};

// Audio thread only. State belongs to the session, not to a replaceable plan.
class AudioKernel {
public:
    explicit AudioKernel(double sampleRate) : phaseStep_(twoPi * 440.0 / sampleRate) {
        const double omega = twoPi * 1000.0 / sampleRate;
        const double alpha = std::sin(omega) / (2.0 * 0.7071);
        const double cosine = std::cos(omega);
        b0_ = (1.0 - cosine) / (2.0 * (1.0 + alpha));
        b1_ = 2.0 * b0_;
        a1_ = -2.0 * cosine / (1.0 + alpha);
        a2_ = (1.0 - alpha) / (1.0 + alpha);
    }
    void render(const Plan& plan, const Param& param, std::span<float, quantum * 2> output) {
        const bool changed = plan.subgraphHash != hash_;
        for (std::size_t frame = 0; frame < quantum; ++frame) {
            const double input = std::sin(phase_);
            phase_ += phaseStep_;
            if (phase_ >= twoPi) { phase_ -= twoPi; }
            const double filtered = b0_ * input + z1_;
            z1_ = b1_ * input - a1_ * filtered + z2_;
            z2_ = b0_ * input - a2_ * filtered;
            const float gain = previousGain_ + (param.gain - previousGain_) *
                static_cast<float>(frame + 1) / static_cast<float>(quantum);
            float value = static_cast<float>(filtered) * gain * plan.gain;
            if (changed && frame == 0) {
                // RT-F48: render one plan, then correct its sink's first-sample slope.
                offset_ = 2.0f * last_ - beforeLast_ - value;
                rampRemaining_ = 256;
            }
            if (rampRemaining_ > 0) {
                value += offset_ * static_cast<float>(rampRemaining_ - 1) / 255.0f;
                --rampRemaining_;
            }
            output[frame * 2] = value;
            output[frame * 2 + 1] = value;
            beforeLast_ = last_;
            last_ = value;
        }
        framesStepped_ += quantum;
        previousGain_ = param.gain;
        hash_ = plan.subgraphHash;
    }
    std::uint64_t framesStepped() const { return framesStepped_; }

private:
    static constexpr double twoPi = 6.2831853071795864769;
    double phase_ = 0, phaseStep_, b0_, b1_, a1_, a2_, z1_ = 0, z2_ = 0;
    float previousGain_ = 0.1f, last_ = 0, beforeLast_ = 0, offset_ = 0;
    unsigned rampRemaining_ = 0;
    std::uint64_t hash_ = 0, framesStepped_ = 0;
};
} // namespace nt::spike
