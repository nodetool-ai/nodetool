#include "audio/Mixer.h"
#include "audio/DenormalGuard.h"
#include "audio/SincResampler.h"
#include "audio/effects/Effects.h"
#include "scene/Animation.h"
#include "scene/ClipScene.h"

#include <algorithm>
#include <atomic>
#include <array>
#include <limits>
#include <mutex>
#include <unordered_map>
#include <cmath>
#include <numbers>
#include <optional>
#include <set>

namespace nt::audio {
bool BlockProcessor::processBlock(std::span<float> stereo, const BlockContext& context) noexcept {
    if (context.quantumOffset == 0) { activeInQuantum_ = false; }
    const bool wantBypass = bypassed();
    const float targetMix = wantBypass ? 1.0f : 0.0f;
    if (!bypassStateInitialized_) {
        bypassMix_ = targetMix;
        bypassStateInitialized_ = true;
    }
    if (wantBypass && bypassMix_ >= 1.0f) {
        onBypassedBlock(stereo, context);
        activeInQuantum_ |= (!context.silent && keepsActiveInput()) ||
                            std::ranges::any_of(stereo, [](float x) { return x != 0; });
        return !activeInQuantum_;
    }
    // Look ahead only in already-owned state, then retain the activity tag
    // for this entire quantum. Callback fragments must not change DSP output.
    activeInQuantum_ |= (!context.silent && keepsActiveInput()) || hasPendingOutput(kMixBlockFrames - context.quantumOffset);
    const bool fading = (bypassMix_ != targetMix) || (bypassMix_ > 0.0f && bypassMix_ < 1.0f);
    if (!fading) {
        process(stereo, context);
    } else {
        const int totalFrames = static_cast<int>(stereo.size() / 2);
        constexpr float kStep = 1.0f / static_cast<float>(kBypassCrossfadeFrames);
        for (int offset = 0; offset < totalFrames;) {
            const int chunkFrames = std::min(kMixBlockFrames, totalFrames - offset);
            const auto chunkSamples = static_cast<std::size_t>(chunkFrames) * 2;
            auto chunk = stereo.subspan(static_cast<std::size_t>(offset) * 2, chunkSamples);
            std::copy_n(chunk.begin(), chunkSamples, bypassDryScratch_.begin());
            BlockContext subCtx = context;
            subCtx.timelineMs = context.timelineMs + static_cast<double>(offset) * context.msPerFrame;
            subCtx.quantumOffset = context.quantumOffset + offset;
            process(chunk, subCtx);
            for (int f = 0; f < chunkFrames; ++f) {
                if (bypassMix_ < targetMix) {
                    bypassMix_ = std::min(targetMix, bypassMix_ + kStep);
                } else if (bypassMix_ > targetMix) {
                    bypassMix_ = std::max(targetMix, bypassMix_ - kStep);
                }
                const float wetGain = 1.0f - bypassMix_;
                const auto idx = static_cast<std::size_t>(f) * 2;
                chunk[idx] = chunk[idx] * wetGain + bypassDryScratch_[idx] * bypassMix_;
                chunk[idx + 1] = chunk[idx + 1] * wetGain + bypassDryScratch_[idx + 1] * bypassMix_;
            }
            offset += chunkFrames;
        }
    }
    activeInQuantum_ |= std::ranges::any_of(stereo, [](float x) { return x != 0; });
    return !activeInQuantum_;
}
// Prepared on the control thread. MixRenderLease grants exclusive access to mutable DSP and buffers.
struct MixPlan::State {
    // Pre-sized stereo PDC delay line with click-free read-position crossfade and
    // off-thread overflow ring growth.
    // Thread affinity: prepare(), updatePreparedDelay(), and serviceOverflow() run on the
    // control/worker thread; reset() and process() run on the audio render thread with
    // zero heap allocations and zero locks.
    struct DelayLine {
        static constexpr int kCrossfadeFrames = 64;
        // Pre-sized headroom (~1.36 s at 48 kHz, 512 KB stereo) so runtime latency jumps
        // and bypass toggles never allocate on the audio thread.
        static constexpr int kDefaultMaxRuntimeDelayFrames = 65536;
        static constexpr int kMaxRuntimeDelayFrames = kMaxProcessorLatencySamples;

        struct Ring {
            std::vector<float> buffer;
            int cap = 0;
        };

        // Owned by DelayLine. Active ring is touched on the audio thread during process().
        // On overflow growth adoption, the previous ring moves to drainingRing while the new
        // ring fills in parallel (avoiding clicks and silence dropouts), then moves to
        // retiredRing for off-thread reclamation by serviceOverflow().
        std::unique_ptr<Ring> ring;
        std::unique_ptr<Ring> drainingRing;
        std::atomic<Ring*> pendingRing{nullptr};
        std::atomic<Ring*> retiredRing{nullptr};
        std::atomic<int> overflowDelay{0};
        std::atomic<bool> transitionInProgress{false};
        int preparedMaxDelay = 0;  // control/worker thread only
        int cap = 0;
        int writePos = 0;
        int validFrames = 0;
        int activeDelay = 0;
        int fadeFromDelay = 0;
        int fadePos = 0;
        int fadeLen = 0;
        // Old ring cursors while drainingRing is non-null (audio thread only).
        int drainCap = 0;
        int drainWritePos = 0;
        int drainValidFrames = 0;
        int drainDelay = 0;
        int drainFadePos = 0;
        int drainFadeLen = 0;
        int nonZeroAge = std::numeric_limits<int>::max();

        DelayLine() = default;
        ~DelayLine() {
            std::unique_ptr<Ring> pending(pendingRing.exchange(nullptr, std::memory_order_acq_rel));
            std::unique_ptr<Ring> retired(retiredRing.exchange(nullptr, std::memory_order_acq_rel));
        }
        DelayLine(const DelayLine&) = delete;
        DelayLine& operator=(const DelayLine&) = delete;

        void prepare(int initialDelay, int maxDelayFrames) {
            std::unique_ptr<Ring> pending(pendingRing.exchange(nullptr, std::memory_order_acq_rel));
            std::unique_ptr<Ring> retired(retiredRing.exchange(nullptr, std::memory_order_acq_rel));
            pending.reset();
            retired.reset();
            drainingRing.reset();
            transitionInProgress.store(false, std::memory_order_release);
            clearDrainState();

            const int initD = std::clamp(initialDelay, 0, kMaxRuntimeDelayFrames);
            const int maxD = std::clamp(std::max(initD, std::max(0, maxDelayFrames)), 0, kMaxRuntimeDelayFrames);
            if (maxD <= 0) {
                ring.reset();
                cap = 0;
                preparedMaxDelay = 0;
                activeDelay = 0;
                overflowDelay.store(0, std::memory_order_release);
                reset();
                return;
            }
            auto next = std::make_unique<Ring>();
            next->cap = maxD + 1;
            next->buffer.assign(static_cast<std::size_t>(next->cap) * 2, 0.0f);
            cap = next->cap;
            ring = std::move(next);
            preparedMaxDelay = cap - 1;
            activeDelay = initD;
            overflowDelay.store(0, std::memory_order_release);
            reset();
        }

        // Control/offline thread: updates prepared delay after latency re-probing,
        // growing the ring buffer if the newly probed latency exceeds current capacity.
        void updatePreparedDelay(int newDelay, int minMaxDelayFrames) {
            const int d = std::clamp(newDelay, 0, kMaxRuntimeDelayFrames);
            const int targetMax = std::clamp(std::max(d, std::max(0, minMaxDelayFrames)), 0, kMaxRuntimeDelayFrames);
            if (targetMax > preparedMaxDelay) {
                prepare(d, targetMax);
                return;
            }
            activeDelay = d;
            reset();
        }

        // Control/worker thread: reclaims any retired ring and publishes a grown ring
        // if runtime latency exceeded the pre-sized capacity.
        bool serviceOverflow() {
            std::unique_ptr<Ring> retired(retiredRing.exchange(nullptr, std::memory_order_acq_rel));
            retired.reset();
            if (transitionInProgress.load(std::memory_order_acquire) ||
                pendingRing.load(std::memory_order_acquire) != nullptr ||
                retiredRing.load(std::memory_order_acquire) != nullptr) {
                return false;
            }
            const int rawNeeded = overflowDelay.load(std::memory_order_acquire);
            const int needed = std::clamp(rawNeeded, 0, kMaxRuntimeDelayFrames);
            if (needed <= 0 || needed <= preparedMaxDelay) {
                if (rawNeeded != 0) {
                    int expected = rawNeeded;
                    (void)overflowDelay.compare_exchange_strong(expected, 0, std::memory_order_acq_rel,
                                                                std::memory_order_acquire);
                }
                return false;
            }
            auto next = std::make_unique<Ring>();
            next->cap = needed + kMixBlockFrames + 1;
            next->buffer.assign(static_cast<std::size_t>(next->cap) * 2, 0.0f);
            preparedMaxDelay = next->cap - 1;
            int expected = rawNeeded;
            (void)overflowDelay.compare_exchange_strong(expected, 0, std::memory_order_acq_rel,
                                                        std::memory_order_acquire);
            pendingRing.store(next.release(), std::memory_order_release);
            return true;
        }

        void clearDrainState() noexcept {
            drainCap = 0;
            drainWritePos = 0;
            drainValidFrames = 0;
            drainDelay = 0;
            drainFadePos = 0;
            drainFadeLen = 0;
        }

        void retireDrainingRing() noexcept {
            if (drainingRing) {
                // retiredRing is guaranteed null because serviceOverflow() never publishes
                // a new pendingRing while transitionInProgress is true or retiredRing is non-null.
                retiredRing.store(drainingRing.release(), std::memory_order_release);
                transitionInProgress.store(false, std::memory_order_release);
            }
            clearDrainState();
        }

        void reset() noexcept {
            // O(1) invalidation: never bulk-clear or deallocate large PDC buffers on the audio thread.
            retireDrainingRing();
            writePos = 0;
            validFrames = 0;
            fadePos = 0;
            fadeLen = 0;
            nonZeroAge = std::numeric_limits<int>::max();
        }

        void adoptPendingRing(int requested) noexcept {
            Ring* next = pendingRing.exchange(nullptr, std::memory_order_acq_rel);
            if (!next) { return; }
            if (ring && cap > 1 && validFrames > 0) {
                // Keep playing seamlessly from the old ring while the grown ring fills in parallel.
                drainingRing = std::move(ring);
                drainCap = cap;
                drainWritePos = writePos;
                drainValidFrames = validFrames;
                drainDelay = activeDelay;
                drainFadePos = 0;
                drainFadeLen = 0;
                transitionInProgress.store(true, std::memory_order_release);
            } else {
                retiredRing.store(ring.release(), std::memory_order_release);
                transitionInProgress.store(false, std::memory_order_release);
                clearDrainState();
            }
            ring.reset(next);
            cap = ring->cap;
            writePos = 0;
            validFrames = 0;
            fadePos = 0;
            fadeLen = 0;
            activeDelay = (cap > 1) ? std::clamp(requested, 0, cap - 1) : 0;
        }

        static void readFromRing(const Ring& r, int rCap, int rWritePos, int rValidFrames,
                                 int delayFrames, float& outL, float& outR) noexcept {
            if (delayFrames <= 0) {
                const auto idx = static_cast<std::size_t>(rWritePos) * 2;
                outL = r.buffer[idx];
                outR = r.buffer[idx + 1];
                return;
            }
            if (rValidFrames < delayFrames) {
                outL = 0.0f;
                outR = 0.0f;
                return;
            }
            int rPos = rWritePos - delayFrames;
            if (rPos < 0) { rPos += rCap; }
            const auto idx = static_cast<std::size_t>(rPos) * 2;
            outL = r.buffer[idx];
            outR = r.buffer[idx + 1];
        }

        void readDelayed(int delayFrames, float& outL, float& outR) const noexcept {
            readFromRing(*ring, cap, writePos, validFrames, delayFrames, outL, outR);
        }

        // Audio thread (O(frames), zero allocation, zero locks): always records input into the
        // ring so 0->N runtime jumps crossfade smoothly from history without dropouts or clicks.
        // Returns true if any delayed non-zero sample was emitted or remains queued.
        bool process(std::span<float> stereo, int targetDelay) noexcept {
            const int requested = std::clamp(targetDelay, 0, kMaxRuntimeDelayFrames);
            if (!drainingRing && fadePos >= fadeLen) {
                adoptPendingRing(requested);
            }
            if (!ring || cap <= 1) { return false; }
            int clamped = requested;
            if (requested > cap - 1) {
                int prev = overflowDelay.load(std::memory_order_relaxed);
                while (requested > prev &&
                       !overflowDelay.compare_exchange_weak(prev, requested, std::memory_order_release,
                                                            std::memory_order_relaxed)) {}
                clamped = cap - 1;
            }
            const bool hadFade = (fadePos < fadeLen) || (drainingRing != nullptr);
            bool emitted = false;
            const int frames = static_cast<int>(stereo.size() / 2);
            for (int f = 0; f < frames; ++f) {
                const float inL = stereo[static_cast<std::size_t>(f) * 2];
                const float inR = stereo[static_cast<std::size_t>(f) * 2 + 1];
                if (inL != 0.0f || inR != 0.0f) {
                    nonZeroAge = 0;
                } else if (nonZeroAge < cap) {
                    ++nonZeroAge;
                }
                const auto wIdx = static_cast<std::size_t>(writePos) * 2;
                ring->buffer[wIdx] = inL;
                ring->buffer[wIdx + 1] = inR;

                float outL = inL;
                float outR = inR;
                if (drainingRing) {
                    const auto dIdx = static_cast<std::size_t>(drainWritePos) * 2;
                    drainingRing->buffer[dIdx] = inL;
                    drainingRing->buffer[dIdx + 1] = inR;
                    if (drainFadeLen == 0) {
                        activeDelay = clamped;
                        if (validFrames >= activeDelay) {
                            drainFadeLen = kCrossfadeFrames;
                            drainFadePos = 0;
                        }
                    }
                    if (drainFadeLen > 0) {
                        float oldL = 0.0f, oldR = 0.0f, newL = 0.0f, newR = 0.0f;
                        readFromRing(*drainingRing, drainCap, drainWritePos, drainValidFrames, drainDelay, oldL, oldR);
                        readDelayed(activeDelay, newL, newR);
                        const float alpha = static_cast<float>(drainFadePos + 1) / static_cast<float>(drainFadeLen);
                        outL = oldL * (1.0f - alpha) + newL * alpha;
                        outR = oldR * (1.0f - alpha) + newR * alpha;
                        ++drainFadePos;
                        if (++drainWritePos == drainCap) { drainWritePos = 0; }
                        if (drainValidFrames < drainCap) { ++drainValidFrames; }
                        if (drainFadePos >= drainFadeLen) {
                            retireDrainingRing();
                        }
                    } else {
                        readFromRing(*drainingRing, drainCap, drainWritePos, drainValidFrames, drainDelay, outL, outR);
                        if (++drainWritePos == drainCap) { drainWritePos = 0; }
                        if (drainValidFrames < drainCap) { ++drainValidFrames; }
                    }
                } else {
                    // Defer retargeting until any active crossfade finishes so alpha always reaches 1.0.
                    if (fadePos >= fadeLen && clamped != activeDelay) {
                        if (validFrames == 0) {
                            activeDelay = clamped;
                            fadePos = 0;
                            fadeLen = 0;
                        } else {
                            fadeFromDelay = activeDelay;
                            activeDelay = clamped;
                            fadeLen = kCrossfadeFrames;
                            fadePos = 0;
                        }
                    }
                    if (fadePos < fadeLen) {
                        float fromL = 0.0f, fromR = 0.0f, toL = 0.0f, toR = 0.0f;
                        readDelayed(fadeFromDelay, fromL, fromR);
                        readDelayed(activeDelay, toL, toR);
                        const float alpha = static_cast<float>(fadePos + 1) / static_cast<float>(fadeLen);
                        outL = fromL * (1.0f - alpha) + toL * alpha;
                        outR = fromR * (1.0f - alpha) + toR * alpha;
                        ++fadePos;
                    } else if (activeDelay > 0) {
                        readDelayed(activeDelay, outL, outR);
                    }
                }
                if (outL != 0.0f || outR != 0.0f) {
                    emitted = true;
                }
                stereo[static_cast<std::size_t>(f) * 2] = outL;
                stereo[static_cast<std::size_t>(f) * 2 + 1] = outR;
                if (++writePos == cap) { writePos = 0; }
                if (validFrames < cap) { ++validFrames; }
            }
            const bool activeOrFading = (activeDelay > 0) || hadFade || (drainingRing != nullptr);
            const int maxDelayed = std::max({activeDelay,
                                             (fadePos < fadeLen) ? fadeFromDelay : 0,
                                             drainingRing ? drainDelay : 0});
            return activeOrFading && (emitted || nonZeroAge < maxDelayed);
        }
    };

    struct VoiceGroupMeta {
        std::size_t first = 0;
        std::size_t end = 0;
        std::size_t trackIndex = 0;
        double clipStart = 0.0;
        double clipEnd = 0.0;
        double tailMs = 0.0;
        bool offline = false;
        bool silent = true;
        bool skipped = false;
    };

    std::atomic_flag rendering=ATOMIC_FLAG_INIT;
    std::array<float, kMixBlockFrames * 2> voice{};
    std::vector<std::array<float, kMixBlockFrames * 2>> voiceBuffers;
    std::vector<VoiceGroupMeta> voiceGroups;
    std::vector<std::array<float, kMixBlockFrames * 2>> tracks;
    std::vector<std::unique_ptr<DelayLine>> voiceDelay;
    std::vector<int> voiceLatency;
    std::vector<int> trackVoiceLatency;
    std::vector<int> trackLatency;
    std::vector<bool> trackBusSilent;
    std::vector<std::unique_ptr<DelayLine>> trackDelay;
    std::vector<std::vector<int>> trackProcLatencies;
    std::vector<int> masterProcLatencies;
    std::vector<bool> trackSilent;
    std::vector<bool> voiceUnderrun;
    std::atomic<int> maxTrackLatency{0};
    std::atomic<int> masterPluginLatency{0};
    bool hasVoiceProcessors = false;
    bool dynamicTrackPdc = false;
    int quantumCursor = 0;
    double sampleRate = 0;
    int deviceBlockFrames = 0;
    double nextMs = std::numeric_limits<double>::quiet_NaN();
};
namespace {
struct Stage {
    MixPlanStageToken token;
    std::string name;
    MixPlanStage function;
    int priority;
};
struct StageRegistry {
    // Guards stages and token allocation.
    std::mutex mutex;
    std::vector<Stage> stages;
    MixPlanStageToken next = 1;
};
StageRegistry& registry() {
    // native-rules #14: function-local static StageRegistry, mutable global state
    static StageRegistry instance;
    return instance;
}

// The file the sound reads: `audioPath` when set (a server open points it at
// the original while `mediaPath` may be the video proxy, which has no audio
// track), else `mediaPath`.
const std::string& soundPath(const Clip& clip) {
    return clip.audioPath.empty() ? clip.mediaPath : clip.audioPath;
}

// `effectiveAssetId` in clipAudio.ts: a clip sounds only in these states.
// The sound path stands in for `currentAssetId` in the prototype.
bool hasEffectiveAsset(const Clip& clip) {
    if (soundPath(clip).empty()) return false;
    return clip.status == "generated" || clip.status == "stale" || clip.status == "locked" ||
           clip.status == "generating";
}

double sourceRateOf(const Clip& clip) {
    return clip.speedBaked ? 1.0 : std::max(0.0001, clip.speedMultiplier);
}

// A clip's keyed Volume (`volumeDb` param curve), in dB on top of its static level. The plan stage
// bakes the curve to straight gain ramps, so the audio thread only searches a table and
// interpolates, and the gain never jumps between samples.
class ClipVolumeEnvelope final : public ParameterSource {
public:
    ClipVolumeEnvelope(const scene::ParamCurves::Curve& curve, double startMs, double durationMs) {
        constexpr double kMaxStepMs = 10;
        constexpr double kMaxStepDb = 0.25;
        constexpr double kMaxStepsPerSegment = 65536;
        // However close the keys, a change this size takes 5 ms per 40 dB. It moves later keys
        // along if it has to, since the level has to arrive before the next one leaves.
        constexpr double kMaxDbPerMs = 8;
        double lastMs = 0;
        double lastDb = 0;
        const auto add = [&](double t, double db) {
            const double wanted = startMs + t * durationMs;
            const double timeMs = m_points.empty() ? wanted : std::max(wanted, lastMs + std::abs(db - lastDb) / kMaxDbPerMs);
            m_points.push_back({timeMs, std::pow(10.0, db / 20.0)});
            lastMs = timeMs;
            lastDb = db;
        };
        const auto& points = curve.points;
        add(points.front().t, points.front().value);
        for (std::size_t i = 1; i < points.size(); ++i) {
            const auto& from = points[i - 1];
            const auto& to = points[i];
            const double spanMs = (to.t - from.t) * durationMs;
            if (spanMs <= 0 || to.value == from.value) {
                add(to.t, to.value);
            } else if (to.easing == "hold") {
                // Holds until the ramp that arrives at the key has to start.
                const double rampMs = std::abs(to.value - from.value) / kMaxDbPerMs;
                add(std::max(from.t, to.t - rampMs / durationMs), from.value);
                add(to.t, to.value);
            } else {
                const bool straight = to.easing.empty() || to.easing == "linear";
                const double byTime = std::ceil(spanMs / kMaxStepMs);
                const double byLevel = std::ceil(std::abs(to.value - from.value) / kMaxStepDb);
                const int steps = static_cast<int>(std::clamp(straight ? std::min(byTime, byLevel) : byTime, 1.0, kMaxStepsPerSegment));
                const std::string easing = straight ? std::string("linear") : to.easing;
                for (int step = 1; step <= steps; ++step) {
                    const double f = static_cast<double>(step) / steps;
                    add(from.t + (to.t - from.t) * f, from.value + (to.value - from.value) * scene::ease(easing, f));
                }
            }
        }
    }
    double valueAt(double timeMs, double base) const noexcept override {
        const auto next = std::upper_bound(m_points.begin(), m_points.end(), timeMs,
                                           [](double t, const Point& point) { return t < point.timeMs; });
        if (next == m_points.begin()) return base * next->gain;
        const auto& previous = *(next - 1);
        if (next == m_points.end()) return base * previous.gain;
        const double f = (timeMs - previous.timeMs) / (next->timeMs - previous.timeMs);
        return base * (previous.gain + (next->gain - previous.gain) * f);
    }

private:
    struct Point {
        double timeMs;
        double gain;
    };
    std::vector<Point> m_points;
};

// Null when the clip has no Volume keys. A switched-off Volume has moved them to its stash.
std::shared_ptr<const ParameterSource> clipVolumeEnvelope(const Clip& clip) {
    if (!clip.scene || !clip.scene->paramCurves || clip.durationMs <= 0) {
        return nullptr;
    }
    const auto* curve = clip.scene->paramCurves->find(u"volumeDb");
    return curve ? std::make_shared<const ClipVolumeEnvelope>(*curve, clip.startMs, clip.durationMs) : nullptr;
}

VoicePlan voiceFor(const Clip& clip) {
    VoicePlan v;
    v.clipId = clip.id;
    v.mediaPath = soundPath(clip);
    v.startMs = clip.startMs;
    v.durationMs = clip.durationMs;
    v.inPointMs = clip.inPointMs;
    v.sourceRate = sourceRateOf(clip);
    v.clipGain = clip.volumeDb != 0.0 ? std::pow(10.0, clip.volumeDb / 20.0) : 1.0;
    v.gainSource = clipVolumeEnvelope(clip);
    v.fades = resolveClipFades(clip.fadeInMs, clip.fadeOutMs, parseFadeShape(clip.fadeInShape),
                               parseFadeShape(clip.fadeOutShape), clip.durationMs);
    return v;
}

std::size_t clipVoiceEnd(const std::vector<VoicePlan>& voices, std::size_t first) {
    std::size_t end = first + 1;
    if (!voices[first].segmentId.empty()) {
        while (end < voices.size() && !voices[end].segmentId.empty() && voices[end].clipId == voices[first].clipId) {
            ++end;
        }
    }
    return end;
}

}  // namespace

MixPlanStageToken registerMixPlanStage(std::string name, MixPlanStage stage, int priority, bool unique) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    if (unique) {
        for (const auto& existing : r.stages) {
            if (existing.name == name) return existing.token;
        }
    }
    const auto token = r.next++;
    r.stages.push_back({token, std::move(name), std::move(stage), priority});
    return token;
}

bool hasMixPlanStage(std::string_view name) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    return std::ranges::any_of(r.stages, [name](const Stage& stage) { return stage.name == name; });
}

void applyMixPlanStage(std::string_view name,const Timeline& timeline,MixPlan& plan) {
    MixPlanStage apply;
    {
        auto& r=registry(); const std::scoped_lock lock(r.mutex);
        for (const auto& stage:r.stages) { if (stage.name==name) { apply=stage.function; break; } }
    }
    if (apply) { apply(timeline,plan); }
}
void unregisterMixPlanStage(MixPlanStageToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.stages, [token](const Stage& s) { return s.token == token; });
}

namespace {
// Plan-building thread only. These values never reach the real-time callback.
void projectAutoCrossfades(std::vector<Clip>& clips, double durationMs) {
    using Want = std::pair<double, FadeShape>;
    std::vector<std::optional<Want>> ins(clips.size()), outs(clips.size());
    std::unordered_map<std::string, std::vector<std::size_t>> tracks;
    for (std::size_t i = 0; i < clips.size(); ++i) {
        if (clips[i].mediaType == MediaType::Audio && clips[i].durationMs > 0 &&
            !clips[i].muted && !clips[i].raw.value("hidden").toBool() && hasEffectiveAsset(clips[i])) { tracks[clips[i].trackId].push_back(i); }
    }
    const auto want = [](auto& values, std::size_t i, double ms, FadeShape shape) {
        if (ms > 0 && (!values[i] || ms < values[i]->first)) { values[i] = Want{ms, shape}; }
    };
    const auto room = [](const Clip& c, double opposite, double ms) {
        return std::min({ms, c.durationMs / 2, std::max(0.0, c.durationMs - opposite)});
    };
    for (auto& [trackId, list] : tracks) {
        (void)trackId;
        std::stable_sort(list.begin(), list.end(), [&clips](auto a, auto b) { return clips[a].startMs < clips[b].startMs; });
        for (std::size_t i = 0; i < list.size(); ++i) {
            const auto& a = clips[list[i]];
            for (std::size_t j = i + 1; j < list.size(); ++j) {
                const auto& b = clips[list[j]];
                const double aEnd = a.startMs + a.durationMs, bEnd = b.startMs + b.durationMs;
                const double overlap = aEnd - b.startMs;
                if (overlap < -std::min(1.0, durationMs / 2)) { break; }
                double outMs, inMs;
                FadeShape shape;
                if (overlap > durationMs) {
                    outMs = aEnd <= bEnd + 1e-6 ? durationMs : 0;
                    inMs = durationMs; shape = FadeShape::Linear;
                } else if (overlap > 1e-6) {
                    outMs = inMs = overlap; shape = FadeShape::Plus3dB;
                } else {
                    outMs = inMs = durationMs / 2; shape = FadeShape::Linear;
                }
                want(outs, list[i], room(a, a.fadeInMs, outMs), shape);
                want(ins, list[j], room(b, b.fadeOutMs, inMs), shape);
                if (bEnd < aEnd - 1e-6) {
                    const double bOut = std::min(durationMs, overlap > 1e-6 ? overlap : durationMs);
                    want(outs, list[j], room(b, b.fadeInMs, bOut), bOut >= durationMs ? FadeShape::Linear : shape);
                }
            }
        }
    }
    const auto shapeName = [](FadeShape shape) { return shape == FadeShape::Plus3dB ? "plus3dB" : "linear"; };
    for (std::size_t i = 0; i < clips.size(); ++i) {
        auto& c = clips[i];
        const auto& fadeIn = ins[i];
        const auto& fadeOut = outs[i];
        if (fadeIn.has_value() && !c.hasFadeInMs && !(c.fadeInMs > 0)) {
            c.fadeInMs = fadeIn->first;
            c.fadeInShape = shapeName(fadeIn->second);
        }
        if (fadeOut.has_value() && !c.hasFadeOutMs && !(c.fadeOutMs > 0)) {
            c.fadeOutMs = fadeOut->first;
            c.fadeOutShape = shapeName(fadeOut->second);
        }
    }
}
}

bool masterLimiterEnabled(const Timeline& timeline) noexcept {
    const auto master = timeline.raw.value(QStringLiteral("master"));
    if (!master.isObject()) { return true; }
    const auto limiter = master.toObject().value(QStringLiteral("limiter"));
    return limiter.isBool() ? limiter.toBool() : true;
}

int planLatencySamples(const MixPlan& plan) noexcept {
    if (!plan.state) { return 0; }
    return plan.state->maxTrackLatency.load(std::memory_order_acquire) +
           plan.state->masterPluginLatency.load(std::memory_order_acquire);
}

MixPlan buildMixPlan(const Timeline& document, RenderMode mode) {
    std::optional<Timeline> projected;
    if (document.raw.value("music").isObject()) {
        const double ms = document.raw.value("music").toObject().value("autoCrossfadeMs").toDouble(10);
        if (std::isfinite(ms) && ms > 0) {
            projected = document;
            projectAutoCrossfades(projected->clips, ms);
        }
    }
    const auto& tl = projected ? *projected : document;
    MixPlan plan;
    plan.renderMode = mode;
    plan.masterGain = dbToGain(tl.masterVolumeDb);
    plan.masterLimiterEnabled = masterLimiterEnabled(tl);

    const auto isSoundTrack = [](const Track& t) { return t.type == TrackType::Audio || t.type == TrackType::Midi; };
    bool soloed = false;  // `soundTrackSoloed`
    for (const Track& t : tl.tracks) soloed = soloed || (isSoundTrack(t) && t.solo);

    // `videoClipsWithOwnAudio`: video clips with no extracted-audio partner.
    if (!soloed) {
        std::set<std::string> extracted;  // `extractedAudioLinkIds`
        for (const Clip& c : tl.clips) {
            const Track* t = tl.findTrack(c.trackId);
            if (t && t->type == TrackType::Audio && c.mediaType == MediaType::Audio && !c.linkId.empty()) {
                extracted.insert(c.linkId);
            }
        }
        for (const Clip& c : tl.clips) {
            const Track* t = tl.findTrack(c.trackId);
            if (!t || (t->type != TrackType::Video && t->type != TrackType::Overlay) || t->muted) continue;
            if (c.muted || c.mediaType != MediaType::Video || !hasEffectiveAsset(c) || c.durationMs <= 0.0) continue;
            if (!c.linkId.empty() && extracted.count(c.linkId)) continue;
            if (c.startMs + c.durationMs <= 0.0) continue;
            VoicePlan v = voiceFor(c);
            v.videoOwnAudio = true;
            plan.voices.push_back(std::move(v));
        }
    }

    // `isPlayableAudioClip` on an audible audio or midi track.
    for (const Clip& c : tl.clips) {
        const Track* t = tl.findTrack(c.trackId);
        if (!t || !isSoundTrack(*t) || t->muted || (soloed && !t->solo)) continue;
        if (c.muted || c.raw.value("hidden").toBool() || c.startMs + c.durationMs <= 0.0) continue;
        if (c.mediaType != MediaType::Audio || !hasEffectiveAsset(c)) continue;
        VoicePlan v = voiceFor(c);
        v.trackGain = dbToGain(t->volumeDb);
        v.pan = std::clamp(t->pan, -1.0, 1.0);
        plan.voices.push_back(std::move(v));
    }
    std::unordered_map<std::string, std::size_t> trackIndices;
    std::unordered_map<std::string, const Clip*> clipsById;
    clipsById.reserve(tl.clips.size());
    for (const auto& clip : tl.clips) { clipsById.emplace(clip.id, &clip); }
    for (auto& voice : plan.voices) {
        const auto found = clipsById.find(voice.clipId);
        if (found == clipsById.end()) { continue; }
        const auto* clip = found->second;
        const auto [it, inserted] = trackIndices.try_emplace(clip->trackId, plan.tracks.size());
        if (inserted) {
            TrackPlan track;
            track.trackId = clip->trackId;
            track.gain = voice.trackGain;
            track.pan = voice.pan;
            plan.tracks.push_back(std::move(track));
        }
        voice.trackIndex = it->second;
    }
    effects::ensureRegistered();
    std::vector<Stage> stages;
    {
        auto& r = registry();
        const std::scoped_lock lock(r.mutex);
        stages = r.stages;
    }
    std::stable_sort(stages.begin(), stages.end(), [](const Stage& a, const Stage& b) {
        return a.priority < b.priority;
    });
    for (const auto& stage : stages) { stage.function(tl, plan); }
    // An expander with an explicitly earlier priority may precede inserts.
    // Retain only the clip owner's chain before preparing any DSP state.
    for (std::size_t first = 0; first < plan.voices.size();) {
        const auto end = clipVoiceEnd(plan.voices, first);
        for (auto i = first + 1; i < end; ++i) { plan.voices[i].processors.clear(); }
        first = end;
    }
    bool processing = !plan.processors.empty() || plan.gainSource;
    for (const auto& voice : plan.voices) { processing |= !voice.processors.empty() || bool(voice.gainSource); }
    for (const auto& track : plan.tracks) {
        processing |= !track.processors.empty() || bool(track.gainSource) || bool(track.panSource);
    }
    if (processing) {
        plan.state = std::make_shared<MixPlan::State>();
        plan.state->tracks.resize(plan.tracks.size());
        plan.state->voiceDelay.resize(plan.voices.size());
        plan.state->voiceLatency.assign(plan.voices.size(), 0);
        plan.state->trackVoiceLatency.assign(plan.tracks.size(), 0);
        plan.state->trackLatency.assign(plan.tracks.size(), 0);
        plan.state->trackBusSilent.assign(plan.tracks.size(), true);
        plan.state->trackDelay.resize(plan.tracks.size());
        plan.state->trackSilent.resize(plan.tracks.size());
        plan.state->voiceUnderrun.resize(plan.voices.size());
    }
    prepareMixPlan(plan, kDefaultMixRate);
    return plan;
}

void prepareMixPlan(const MixPlan& plan, double sampleRate, int deviceBlockFrames) {
    const int blockFrames = deviceBlockFrames > 0 ? deviceBlockFrames : kMixBlockFrames;
    if (!plan.state || (plan.state->sampleRate == sampleRate && plan.state->deviceBlockFrames == blockFrames)) {
        return;
    }
    auto& state = *plan.state;
    state.voiceLatency.assign(plan.voices.size(), 0);
    state.trackVoiceLatency.assign(plan.tracks.size(), 0);
    std::vector<int> trackClipGroups(plan.tracks.size(), 0);
    std::vector<bool> trackHasVoiceProc(plan.tracks.size(), false);
    bool anyVoiceProc = false;
    for (std::size_t first = 0; first < plan.voices.size();) {
        const auto end = clipVoiceEnd(plan.voices, first);
        int sum = 0;
        const bool hasProc = !plan.voices[first].processors.empty();
        anyVoiceProc |= hasProc;
        for (const auto& processor : plan.voices[first].processors) {
            processor->prepare(sampleRate, blockFrames);
            sum += processor->effectiveLatencySamples();
        }
        state.voiceLatency[first] = sum;
        const std::size_t ti = plan.voices[first].trackIndex;
        if (ti < state.trackVoiceLatency.size()) {
            ++trackClipGroups[ti];
            if (hasProc) { trackHasVoiceProc[ti] = true; }
            state.trackVoiceLatency[ti] = std::max(state.trackVoiceLatency[ti], sum);
        }
        first = end;
    }
    state.hasVoiceProcessors = anyVoiceProc;
    state.voiceGroups.clear();
    if (anyVoiceProc) {
        state.voiceBuffers.resize(plan.voices.size());
        for (std::size_t first = 0; first < plan.voices.size();) {
            const auto end = clipVoiceEnd(plan.voices, first);
            MixPlan::State::VoiceGroupMeta meta;
            meta.first = first;
            meta.end = end;
            meta.trackIndex = plan.voices[first].trackIndex;
            state.voiceGroups.push_back(meta);
            first = end;
        }
    } else {
        state.voiceBuffers.clear();
    }
    state.voiceDelay.resize(plan.voices.size());
    for (std::size_t first = 0; first < plan.voices.size();) {
        const auto end = clipVoiceEnd(plan.voices, first);
        const std::size_t ti = plan.voices[first].trackIndex;
        const int target = ti < state.trackVoiceLatency.size() ? state.trackVoiceLatency[ti] : 0;
        const bool needsVoiceHeadroom = ti < trackClipGroups.size() && trackClipGroups[ti] > 1 && trackHasVoiceProc[ti];
        const int headroom = needsVoiceHeadroom
            ? std::max(MixPlan::State::DelayLine::kDefaultMaxRuntimeDelayFrames, target)
            : 0;
        if (!state.voiceDelay[first]) { state.voiceDelay[first] = std::make_unique<MixPlan::State::DelayLine>(); }
        state.voiceDelay[first]->prepare(target - state.voiceLatency[first], headroom);
        for (auto i = first + 1; i < end; ++i) {
            if (!state.voiceDelay[i]) { state.voiceDelay[i] = std::make_unique<MixPlan::State::DelayLine>(); }
            state.voiceDelay[i]->prepare(0, 0);
        }
        first = end;
    }

    state.trackLatency.assign(plan.tracks.size(), 0);
    state.trackBusSilent.assign(plan.tracks.size(), true);
    state.trackProcLatencies.assign(plan.tracks.size(), {});
    int maxTrackLatency = 0;
    bool anyTrackProc = anyVoiceProc;
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        int sum = state.trackVoiceLatency[i];
        auto& procLats = state.trackProcLatencies[i];
        procLats.reserve(plan.tracks[i].processors.size());
        if (!plan.tracks[i].processors.empty()) { anyTrackProc = true; }
        for (const auto& processor : plan.tracks[i].processors) {
            processor->prepare(sampleRate, blockFrames);
            const int lat = processor->effectiveLatencySamples();
            procLats.push_back(lat);
            sum += lat;
        }
        state.trackLatency[i] = sum;
        maxTrackLatency = std::max(maxTrackLatency, sum);
    }
    int masterLatency = 0;
    state.masterProcLatencies.clear();
    state.masterProcLatencies.reserve(plan.processors.size());
    for (const auto& processor : plan.processors) {
        processor->prepare(sampleRate, blockFrames);
        const int lat = processor->effectiveLatencySamples();
        state.masterProcLatencies.push_back(lat);
        masterLatency += lat;
    }
    state.dynamicTrackPdc = plan.tracks.size() > 1 && anyTrackProc;
    const int trackHeadroom = state.dynamicTrackPdc
        ? std::max(MixPlan::State::DelayLine::kDefaultMaxRuntimeDelayFrames, maxTrackLatency)
        : 0;
    state.trackDelay.resize(plan.tracks.size());
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        if (!state.trackDelay[i]) { state.trackDelay[i] = std::make_unique<MixPlan::State::DelayLine>(); }
        state.trackDelay[i]->prepare(maxTrackLatency - state.trackLatency[i], trackHeadroom);
    }
    state.maxTrackLatency.store(maxTrackLatency, std::memory_order_release);
    state.masterPluginLatency.store(masterLatency, std::memory_order_release);
    state.sampleRate = sampleRate;
    state.deviceBlockFrames = blockFrames;
    state.quantumCursor = 0;
    state.nextMs = std::numeric_limits<double>::quiet_NaN();
}

void reprobeMixPlanLatency(const MixPlan& plan, double sampleRate) {
    if (!plan.state) { return; }
    if (plan.state->sampleRate != sampleRate) {
        prepareMixPlan(plan, sampleRate);
    }
    auto& state = *plan.state;
    state.voiceLatency.assign(plan.voices.size(), 0);
    state.trackVoiceLatency.assign(plan.tracks.size(), 0);
    std::vector<int> trackClipGroups(plan.tracks.size(), 0);
    std::vector<bool> trackHasVoiceProc(plan.tracks.size(), false);
    for (std::size_t first = 0; first < plan.voices.size();) {
        const auto end = clipVoiceEnd(plan.voices, first);
        int sum = 0;
        const bool hasProc = !plan.voices[first].processors.empty();
        for (const auto& processor : plan.voices[first].processors) {
            if (!processor) { continue; }
            processor->reprobeLatency(sampleRate);
            sum += processor->effectiveLatencySamples();
        }
        state.voiceLatency[first] = sum;
        const std::size_t ti = plan.voices[first].trackIndex;
        if (ti < state.trackVoiceLatency.size()) {
            ++trackClipGroups[ti];
            if (hasProc) { trackHasVoiceProc[ti] = true; }
            state.trackVoiceLatency[ti] = std::max(state.trackVoiceLatency[ti], sum);
        }
        first = end;
    }
    for (std::size_t first = 0; first < plan.voices.size();) {
        const auto end = clipVoiceEnd(plan.voices, first);
        const std::size_t ti = plan.voices[first].trackIndex;
        const int target = ti < state.trackVoiceLatency.size() ? state.trackVoiceLatency[ti] : 0;
        const bool needsVoiceHeadroom = ti < trackClipGroups.size() && trackClipGroups[ti] > 1 && trackHasVoiceProc[ti];
        const int headroom = needsVoiceHeadroom
            ? std::max(MixPlan::State::DelayLine::kDefaultMaxRuntimeDelayFrames, target)
            : 0;
        if (first < state.voiceDelay.size() && state.voiceDelay[first]) {
            state.voiceDelay[first]->updatePreparedDelay(target - state.voiceLatency[first], headroom);
        }
        first = end;
    }

    int maxTrackLatency = 0;
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        int sum = state.trackVoiceLatency[i];
        auto& procLats = state.trackProcLatencies[i];
        procLats.resize(plan.tracks[i].processors.size(), 0);
        for (std::size_t p = 0; p < plan.tracks[i].processors.size(); ++p) {
            const auto& processor = plan.tracks[i].processors[p];
            if (!processor) { continue; }
            processor->reprobeLatency(sampleRate);
            const int lat = processor->effectiveLatencySamples();
            procLats[p] = lat;
            sum += lat;
        }
        state.trackLatency[i] = sum;
        maxTrackLatency = std::max(maxTrackLatency, sum);
    }
    int masterLatency = 0;
    state.masterProcLatencies.resize(plan.processors.size(), 0);
    for (std::size_t p = 0; p < plan.processors.size(); ++p) {
        const auto& processor = plan.processors[p];
        if (!processor) { continue; }
        processor->reprobeLatency(sampleRate);
        const int lat = processor->effectiveLatencySamples();
        state.masterProcLatencies[p] = lat;
        masterLatency += lat;
    }
    const int trackHeadroom = state.dynamicTrackPdc
        ? std::max(MixPlan::State::DelayLine::kDefaultMaxRuntimeDelayFrames, maxTrackLatency)
        : 0;
    for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
        if (i < state.trackDelay.size() && state.trackDelay[i]) {
            state.trackDelay[i]->updatePreparedDelay(maxTrackLatency - state.trackLatency[i], trackHeadroom);
        }
    }
    state.maxTrackLatency.store(maxTrackLatency, std::memory_order_release);
    state.masterPluginLatency.store(masterLatency, std::memory_order_release);
}

void serviceMixPlanControl(const MixPlan& plan) {
    for (const auto& voice : plan.voices) {
        for (const auto& processor : voice.processors) {
            if (processor) processor->serviceControlThread();
        }
    }
    for (const auto& track : plan.tracks) {
        for (const auto& processor : track.processors) {
            if (processor) processor->serviceControlThread();
        }
    }
    for (const auto& processor : plan.processors) {
        if (processor) processor->serviceControlThread();
    }
    if (plan.state) {
        for (const auto& delay : plan.state->voiceDelay) {
            if (delay) { (void)delay->serviceOverflow(); }
        }
        for (const auto& delay : plan.state->trackDelay) {
            if (delay) { (void)delay->serviceOverflow(); }
        }
    }
}

void armMixPlanForPlayback(const MixPlan& plan) {
    for (const auto& voice : plan.voices) {
        for (const auto& processor : voice.processors) {
            if (processor) processor->armForPlayback();
        }
    }
    for (const auto& track : plan.tracks) {
        for (const auto& processor : track.processors) {
            if (processor) processor->armForPlayback();
        }
    }
    for (const auto& processor : plan.processors) {
        if (processor) processor->armForPlayback();
    }
}

namespace {
void mixVoice(const VoicePlan& v, VoicePcm& src, double masterGain, bool dry,
              double sampleRate, double timelineMs0, double msPerFrame,
              int frames, std::span<float> out, MixStats& stats) {
    if (v.silent) { return; }
    const double msBlockEnd = timelineMs0 + msPerFrame * frames;
        const double clipEndMs = v.startMs + v.durationMs;
        const double lo = std::min(timelineMs0, msBlockEnd);
        const double hi = std::max(timelineMs0, msBlockEnd);
        if (hi < v.startMs || lo >= clipEndMs) { return; }

        // StereoPannerNode on a stereo input (Web Audio spec). Pan 0 is the
        // identity, set exactly so a centred track is sample exact.
        double inLtoL = 1.0, inRtoL = 0.0, inLtoR = 0.0, inRtoR = 1.0;
        if (!dry && v.pan < 0.0) {
            const double x = (v.pan + 1.0) * std::numbers::pi / 2.0;
            inRtoL = std::cos(x);
            inRtoR = std::sin(x);
        } else if (!dry && v.pan > 0.0) {
            const double x = v.pan * std::numbers::pi / 2.0;
            inLtoL = std::cos(x);
            inLtoR = std::sin(x);
        }
        const double staticGain = dry ? 1.0 : v.trackGain * masterGain;
        const double durationFrames = std::round(v.durationMs * sampleRate / 1000.0 * 1e6) / 1e6;
        const double effectiveRate = v.sourceRate * msPerFrame * sampleRate / 1000.0;
        const double absEffectiveRate = std::abs(effectiveRate);
        const bool needVarispeed = std::abs(absEffectiveRate - 1.0) > 1e-9;
        bool usedSinc = needVarispeed;
        bool underrun = false;
        double lastSource = -1.0;
        const auto fetchCore = [&](std::int64_t f, float& l, float& r) {
            if (src.ring) {
                PcmRing& ring = *src.ring;
                if (f < 0 || f >= ring.endFrame()) return;
                if (f < ring.readFloor() || f >= ring.readableEnd()) {
                    underrun = true;
                    return;
                }
                ring.get(f, l, r);
            } else if (src.linear && f >= src.linearFirst && f < src.linearFirst + src.linearCount) {
                const std::size_t at = static_cast<std::size_t>(f - src.linearFirst) * 2;
                l = src.linear[at];
                r = src.linear[at + 1];
            }
        };
        const auto fetchTap = [&](std::int64_t f, float& l, float& r) noexcept -> bool {
            if (src.ring) {
                PcmRing& ring = *src.ring;
                if (f < 0 || f >= ring.endFrame()) return false;
                if (f < ring.readFloor() || f >= ring.readableEnd()) return false;
                ring.get(f, l, r);
                return true;
            } else if (src.linear && f >= src.linearFirst && f < src.linearFirst + src.linearCount) {
                const std::size_t at = static_cast<std::size_t>(f - src.linearFirst) * 2;
                l = src.linear[at];
                r = src.linear[at + 1];
                return true;
            }
            return false;
        };
        for (int i = 0; i < frames; ++i) {
            const double t = timelineMs0 + msPerFrame * i;
            // Positions in frames, snapped when within 1e-6 of a whole frame:
            // floating-point time steps land that close to the frame grid when
            // the clip is frame aligned, and the clip edges and the source
            // frame are then exact.
            const auto snap = [](double x) {
                const double nearest = std::round(x);
                return std::abs(x - nearest) < 1e-6 ? nearest : x;
            };
            const double intoFrames = snap((t - v.startMs) * sampleRate / 1000.0);
            if (intoFrames < 0.0 || intoFrames >= durationFrames) continue;
            const double into = intoFrames * 1000.0 / sampleRate;
            const double s = snap(v.sourceFrameAt(v.startMs + into, sampleRate));
            lastSource = s;
            if (s < 0.0) continue;
            const auto f0 = static_cast<std::int64_t>(std::floor(s));
            const double frac = s - static_cast<double>(f0);
            double inL = 0.0, inR = 0.0;
            if (!needVarispeed && frac == 0.0) {
                float l0 = 0.0f, r0 = 0.0f;
                fetchCore(f0, l0, r0);
                inL = l0;
                inR = r0;
            } else {
                usedSinc = true;
                const SincSupport support = sincSupportForSample(s, absEffectiveRate);
                if (src.ring) {
                    PcmRing& ring = *src.ring;
                    const std::int64_t srcEnd = ring.endFrame();
                    const std::int64_t ringFloor = ring.readFloor();
                    const std::int64_t ringEnd = ring.readableEnd();
                    // Physical source frames lie in [0, srcEnd). Temporary ring limits
                    // [ringFloor, ringEnd) that clip in-range kernel taps are underruns.
                    const std::int64_t needFirst = std::max<std::int64_t>(0, support.first);
                    const std::int64_t needLast =
                        (srcEnd == std::numeric_limits<std::int64_t>::max())
                            ? support.last
                            : std::min<std::int64_t>(support.last, srcEnd - 1);
                    if (needFirst <= needLast) {
                        if (needFirst < ringFloor || needLast >= ringEnd) {
                            underrun = true;
                        } else {
                            sampleSinc(s, absEffectiveRate, fetchTap, inL, inR);
                        }
                    }
                } else if (src.linear && src.linearCount > 0) {
                    const std::int64_t linFirst = src.linearFirst;
                    const std::int64_t linEnd = src.linearFirst + src.linearCount;
                    if (support.last >= linFirst && support.first < linEnd) {
                        sampleSinc(s, absEffectiveRate, fetchTap, inL, inR);
                    }
                }
            }
            const double clipGain = v.gainSource ? v.gainSource->valueAt(t, v.clipGain) : v.clipGain;
            const double fade = v.fadeDurationMs > 0
                ? clipFadeGain(v.fades, v.fadeDurationMs, into + v.fadeOffsetMs)
                : clipFadeGain(v.fades, v.durationMs, into);
            const double g = clipGain * fade * staticGain;
            const double outL = inL * inLtoL + inR * inRtoL;
            const double outR = inL * inLtoR + inR * inRtoR;
            out[2 * i] += static_cast<float>(outL * g);
            out[2 * i + 1] += static_cast<float>(outR * g);
        }
        if (src.ring && lastSource >= 0.0 && effectiveRate >= 0.0) {
            // Keep enough history below the next position for interpolation / sinc wings.
            // Live AudioEngine rings retain kSincMaxRadius + 1 frames so a forward transport-rate
            // jump mid-session (e.g. 1x -> 2x/4x with keepPitch=false) keeps full left-wing support.
            const std::int64_t keepMargin = src.live
                ? static_cast<std::int64_t>(kSincMaxRadius) + 1
                : (usedSinc ? static_cast<std::int64_t>(sincRadiusForRate(absEffectiveRate)) + 1 : 1);
            src.ring->release(static_cast<std::int64_t>(std::floor(lastSource)) - keepMargin);
        }
        if (underrun) ++stats.underruns;
}
bool process(const Processors& processors, std::span<float> stereo, BlockContext context) {
    for (const auto& processor : processors) {
        context.silent = processor->processBlock(stereo, context);
    }
    return context.silent;
}
// Match web-audio-api's 2048-step quarter-cycle table and f32 arithmetic.
// Namespace initialization keeps table construction out of the render callback.
const std::array<float, 2049> panSines = [] {
    std::array<float, 2049> table{};
    for (std::size_t i = 0; i < table.size(); ++i) {
        table[i] = static_cast<float>(std::sin(static_cast<double>(i) * std::numbers::pi / 4096));
    }
    return table;
}();

void panAndAdd(std::span<const float> in, std::span<float> out, double gain, double pan) {
    const float p = static_cast<float>(pan);
    const float x = p <= 0 ? p + 1.f : p;
    const auto index = static_cast<std::size_t>(x * 2048.f);
    const float sine = panSines[index], cosine = panSines[2048 - index];
    for (std::size_t i = 0; i < in.size(); i += 2) {
        const float left = p <= 0 ? in[i] + in[i + 1] * cosine : in[i] * cosine;
        const float right = p <= 0 ? in[i + 1] * sine : in[i + 1] + in[i] * sine;
        out[i] += static_cast<float>(left * gain);
        out[i + 1] += static_cast<float>(right * gain);
    }
}
} // namespace

MixRenderLease::MixRenderLease(const MixPlan& plan) noexcept
    : plan_(plan), owned_(!plan.state || !plan.state->rendering.test_and_set(std::memory_order_acquire)) {}
MixRenderLease::~MixRenderLease() {
    if (owned_ && plan_.state) { plan_.state->rendering.clear(std::memory_order_release); }
}
void mixBlock(const MixPlan& plan, VoicePcm* pcm, double sampleRate, double timelineMs0, double msPerFrame,
              int frames, float* out, MixStats& stats) {
    if (frames <= 0) { return; }
    const std::span<float> output(out, static_cast<std::size_t>(frames) * 2);
    const MixRenderLease lease(plan);
    if (!lease) {
        std::ranges::fill(output,0.f);
        ++stats.underruns;
        return;
    }
    lease.mix({pcm,plan.voices.size()},sampleRate,timelineMs0,msPerFrame,output,stats);
}
void MixRenderLease::mix(std::span<VoicePcm> pcm, double sampleRate, double timelineMs0, double msPerFrame,
                         std::span<float> output, MixStats& stats) const {
    const ScopedDenormalGuard denormalGuard;
    std::ranges::fill(output,0.f);
    if (!owned_) { ++stats.underruns; return; }
    const auto& plan=plan_;
    const int frames=static_cast<int>(output.size()/2);
    if (frames<=0) { return; }
    if (!plan.state) {
        // Keep the established no-effects arithmetic, including its rounding.
        for (std::size_t i = 0; i < plan.voices.size(); ++i) {
            mixVoice(plan.voices[i], pcm[i], plan.masterGain, false, sampleRate, timelineMs0,
                     msPerFrame, frames, output, stats);
        }
        return;
    }
    if (plan.state->sampleRate != sampleRate) {
        prepareMixPlan(plan, sampleRate);
        ++stats.preparations;
    }
    auto& state = *plan.state;
    if (std::isfinite(state.nextMs) && std::abs(timelineMs0 - state.nextMs) > 1e-5) {
        // AudioGraph.stopAll/releaseEffectChain rebuilds clip chains on seek.
        // Track and master chains persist, as they do in AudioGraph.
        for (const auto& voice : plan.voices) {
            for (const auto& processor : voice.processors) { processor->reset(); }
        }
        for (const auto& delay : state.voiceDelay) { if (delay) { delay->reset(); } }
        for (const auto& delay : state.trackDelay) { if (delay) { delay->reset(); } }
    }
    state.nextMs = timelineMs0 + frames * msPerFrame;
    std::fill(state.voiceUnderrun.begin(), state.voiceUnderrun.end(), false);
    for (int offset = 0; offset < frames;) {
        const int n = std::min(kMixBlockFrames - state.quantumCursor, frames - offset);
        const auto samples = static_cast<std::size_t>(n) * 2;
        const BlockContext context{sampleRate, timelineMs0 + offset * msPerFrame, msPerFrame, false, state.quantumCursor};
        auto dest = output.subspan(static_cast<std::size_t>(offset) * 2, samples);
        for (auto& track : state.tracks) { std::ranges::fill(track, 0.0f); }
        std::fill(state.trackSilent.begin(), state.trackSilent.end(), true);
        const double quantumStart = context.timelineMs - state.quantumCursor * msPerFrame;
        const double quantumEnd = quantumStart + kMixBlockFrames * msPerFrame;
        if (state.hasVoiceProcessors) {
            // Two-phase voice mixing (matching Track PDC Phase 1 / Phase 2) so mid-block
            // latency increases or decreases across sibling voices on a track stay aligned
            // on the same block and never inject a bogus delay on latency decrease.
            std::fill(state.trackVoiceLatency.begin(), state.trackVoiceLatency.end(), 0);
            for (auto& g : state.voiceGroups) {
                const auto& voice = plan.voices[g.first];
                g.skipped = (g.end == g.first + 1 && voice.silent);
                if (g.skipped) {
                    state.voiceLatency[g.first] = 0;
                    continue;
                }
                auto scratch = std::span(state.voiceBuffers[g.first]).first(samples);
                std::ranges::fill(scratch, 0.0f);
                auto voiceContext = context;
                voiceContext.silent = true;
                double clipStart = voice.startMs;
                double clipEnd = voice.startMs + voice.durationMs;
                double tailMs = voice.tailMs;
                bool offline = false;
                for (auto segment = g.first; segment < g.end; ++segment) {
                    const auto& part = plan.voices[segment];
                    MixStats voiceStats;
                    mixVoice(part, pcm[segment], 1, true, sampleRate, context.timelineMs, msPerFrame, n, scratch, voiceStats);
                    state.voiceUnderrun[segment] = state.voiceUnderrun[segment] || voiceStats.underruns > 0;
                    clipStart = std::min(clipStart, part.startMs);
                    clipEnd = std::max(clipEnd, part.startMs + part.durationMs);
                    tailMs = std::max(tailMs, part.tailMs);
                    offline |= !pcm[segment].live && !pcm[segment].ring;
                    voiceContext.silent = voiceContext.silent && (part.silent ||
                        std::max(quantumStart, quantumEnd) <= part.startMs ||
                        std::min(quantumStart, quantumEnd) >= part.startMs + part.durationMs);
                }
                g.clipStart = clipStart;
                g.clipEnd = clipEnd;
                g.tailMs = tailMs;
                g.offline = offline;
                g.silent = process(voice.processors, scratch, voiceContext);
                int curVoiceLat = 0;
                for (const auto& processor : voice.processors) {
                    curVoiceLat += processor->effectiveLatencySamples();
                }
                state.voiceLatency[g.first] = curVoiceLat;
                if (g.trackIndex < state.trackVoiceLatency.size()) {
                    state.trackVoiceLatency[g.trackIndex] = std::max(state.trackVoiceLatency[g.trackIndex], curVoiceLat);
                }
            }
            for (const auto& g : state.voiceGroups) {
                if (g.skipped) { continue; }
                const auto& voice = plan.voices[g.first];
                auto scratch = std::span(state.voiceBuffers[g.first]).first(samples);
                bool silent = g.silent;
                const int maxVoiceLat = g.trackIndex < state.trackVoiceLatency.size()
                    ? state.trackVoiceLatency[g.trackIndex]
                    : 0;
                const int targetVoiceDelay = std::max(0, maxVoiceLat - state.voiceLatency[g.first]);
                if (g.first < state.voiceDelay.size() && state.voiceDelay[g.first]) {
                    if (state.voiceDelay[g.first]->process(scratch, targetVoiceDelay)) { silent = false; }
                }
                const double voicePdcMs = (msPerFrame > 0.0) ? static_cast<double>(maxVoiceLat) * msPerFrame : 0.0;
                const bool offlineResidual = g.offline && !voice.processors.empty();
                const double audibleEnd = g.clipEnd + g.tailMs + (voice.processors.empty() ? 0 : 25) + voicePdcMs;
                const bool audibleQuantum = std::max(quantumStart, quantumEnd) > g.clipStart &&
                    (offlineResidual || std::min(quantumStart, quantumEnd) < audibleEnd);
                state.trackSilent[g.trackIndex] = state.trackSilent[g.trackIndex] && (silent || !audibleQuantum);
                auto& track = state.tracks[g.trackIndex];
                for (int f = 0; f < n; ++f) {
                    const double t = context.timelineMs + f * msPerFrame;
                    if (t >= g.clipStart && (t < audibleEnd || offlineResidual)) {
                        track[2 * f] += scratch[2 * f];
                        track[2 * f + 1] += scratch[2 * f + 1];
                    }
                }
            }
        } else {
            for (std::size_t i = 0; i < plan.voices.size();) {
                const auto& voice = plan.voices[i];
                const auto end = clipVoiceEnd(plan.voices, i);
                const auto first = i;
                i = end;
                if (end == first + 1 && voice.silent) { continue; }
                auto scratch = std::span(state.voice).first(samples);
                std::ranges::fill(scratch, 0.0f);
                auto voiceContext = context;
                voiceContext.silent = true;
                double clipStart = voice.startMs;
                double clipEnd = voice.startMs + voice.durationMs;
                double tailMs = voice.tailMs;
                for (auto segment = first; segment < end; ++segment) {
                    const auto& part = plan.voices[segment];
                    MixStats voiceStats;
                    mixVoice(part, pcm[segment], 1, true, sampleRate, context.timelineMs, msPerFrame, n, scratch, voiceStats);
                    state.voiceUnderrun[segment] = state.voiceUnderrun[segment] || voiceStats.underruns > 0;
                    clipStart = std::min(clipStart, part.startMs);
                    clipEnd = std::max(clipEnd, part.startMs + part.durationMs);
                    tailMs = std::max(tailMs, part.tailMs);
                    voiceContext.silent = voiceContext.silent && (part.silent ||
                        std::max(quantumStart, quantumEnd) <= part.startMs ||
                        std::min(quantumStart, quantumEnd) >= part.startMs + part.durationMs);
                }
                const bool silent = voiceContext.silent;
                const double audibleEnd = clipEnd + tailMs;
                const bool audibleQuantum = std::max(quantumStart, quantumEnd) > clipStart &&
                    std::min(quantumStart, quantumEnd) < audibleEnd;
                state.trackSilent[voice.trackIndex] = state.trackSilent[voice.trackIndex] && (silent || !audibleQuantum);
                auto& track = state.tracks[voice.trackIndex];
                for (int f = 0; f < n; ++f) {
                    const double t = context.timelineMs + f * msPerFrame;
                    if (t >= clipStart && t < audibleEnd) {
                        track[2 * f] += scratch[2 * f];
                        track[2 * f + 1] += scratch[2 * f + 1];
                    }
                }
            }
        }
        // AudioGraph.addClips: source -> clipGain/fades -> clip inserts.
        // AudioGraph.updateTracks: trackGain(mute/solo) -> inserts -> fader -> pan.
        // Phase 1: run every track's insert chain and collect live latencies so every track's
        // PDC delay line sees runtime latency changes and bypass toggles on the same block.
        int maxTrackLatency = 0;
        for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
            const auto& track = plan.tracks[i];
            auto scratch = std::span(state.tracks[i]).first(samples);
            auto trackContext = context;
            const int voiceLat = i < state.trackVoiceLatency.size() ? state.trackVoiceLatency[i] : 0;
            if (voiceLat > 0) {
                trackContext.timelineMs -= static_cast<double>(voiceLat) * msPerFrame;
            }
            trackContext.silent = state.trackSilent[i];
            auto* procLats = i < state.trackProcLatencies.size() ? &state.trackProcLatencies[i] : nullptr;
            int trackLatSum = voiceLat;
            for (std::size_t p = 0; p < track.processors.size(); ++p) {
                trackContext.silent = track.processors[p]->processBlock(scratch, trackContext);
                const int lat = track.processors[p]->effectiveLatencySamples();
                if (procLats && p < procLats->size()) { (*procLats)[p] = lat; }
                trackLatSum += lat;
                if (lat > 0) {
                    trackContext.timelineMs -= static_cast<double>(lat) * msPerFrame;
                }
            }
            state.trackLatency[i] = trackLatSum;
            state.trackBusSilent[i] = trackContext.silent;
            maxTrackLatency = std::max(maxTrackLatency, trackLatSum);
        }
        state.maxTrackLatency.store(maxTrackLatency, std::memory_order_release);
        // Phase 2: apply dynamic PDC delay lines (crossfading smoothly on changes) and sum tracks.
        const double trackPdcMs = static_cast<double>(maxTrackLatency) * msPerFrame;
        auto trackPostContext = context;
        trackPostContext.timelineMs = context.timelineMs - trackPdcMs;
        bool masterSilent = true;
        for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
            const auto& track = plan.tracks[i];
            auto scratch = std::span(state.tracks[i]).first(samples);
            bool trackBusSilent = state.trackBusSilent[i];
            const int targetTrackDelay = std::max(0, maxTrackLatency - state.trackLatency[i]);
            if (i < state.trackDelay.size() && state.trackDelay[i]) {
                if (state.trackDelay[i]->process(scratch, targetTrackDelay)) { trackBusSilent = false; }
            }
            masterSilent = trackBusSilent && masterSilent;
            if (track.gainSource) { track.gainSource->beginBlock(trackPostContext, n, track.gain); }
            if (track.panSource) { track.panSource->beginBlock(trackPostContext, n, track.pan); }
            if (!track.gainSource && !track.panSource) {
                panAndAdd(scratch, dest, track.gain, track.pan);
            } else {
                for (int f = 0; f < n; ++f) {
                    const double t = trackPostContext.timelineMs + f * msPerFrame;
                    const double gain = track.gainSource ? track.gainSource->valueAt(t, track.gain) : track.gain;
                    const double pan = std::clamp(track.panSource ? track.panSource->valueAt(t, track.pan) : track.pan, -1.0, 1.0);
                    panAndAdd(scratch.subspan(2 * f, 2), dest.subspan(2 * f, 2), gain, pan);
                }
            }
        }
        // AudioGraph.getContext/setMaster: mix bus -> master inserts -> fader.
        auto masterContext = context;
        masterContext.timelineMs = context.timelineMs - trackPdcMs;
        masterContext.silent = masterSilent;
        int masterLatSum = 0;
        for (std::size_t p = 0; p < plan.processors.size(); ++p) {
            masterContext.silent = plan.processors[p]->processBlock(dest, masterContext);
            const int lat = plan.processors[p]->effectiveLatencySamples();
            if (p < state.masterProcLatencies.size()) { state.masterProcLatencies[p] = lat; }
            masterLatSum += lat;
            if (lat > 0) {
                masterContext.timelineMs -= static_cast<double>(lat) * msPerFrame;
            }
        }
        state.masterPluginLatency.store(masterLatSum, std::memory_order_release);
        auto masterPostContext = masterContext;
        masterPostContext.timelineMs = context.timelineMs -
            static_cast<double>(maxTrackLatency + masterLatSum) * msPerFrame;
        if (plan.gainSource) { plan.gainSource->beginBlock(masterPostContext, n, plan.masterGain); }
        for (int f = 0; f < n; ++f) {
            const double gain = plan.gainSource ? plan.gainSource->valueAt(masterPostContext.timelineMs + f * msPerFrame, plan.masterGain) : plan.masterGain;
            dest[2 * f] *= gain;
            dest[2 * f + 1] *= gain;
        }
        state.quantumCursor = (state.quantumCursor + n) % kMixBlockFrames;
        offset += n;
    }
    stats.underruns += std::count(state.voiceUnderrun.begin(), state.voiceUnderrun.end(), true);
}

}  // namespace nt::audio
