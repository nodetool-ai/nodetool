#pragma once

// The mix (DESIGN.md D25, D26). `buildMixPlan` copies the web rules for
// which clips sound and at what gain: `isPlayableAudioClip` and the solo
// group in the timeline editor's renderAudio.ts,
// `videoClipsWithOwnAudio` in packages/timeline/src/clipAudio.ts, and the
// gain chain of preview/AudioGraph.ts: clip volumeDb and fades, then the
// track fader and pan (audio and midi tracks only; a video track's chain
// keeps unity gain and centre pan, as AudioGraph never sets it), then
// master.volumeDb. `mixBlock` renders that plan sample by sample. The device
// callback and the offline render both call it, so they cannot disagree. A clip's
// keyed Volume is a `gainSource` on its voices, baked to gain ramps here, and it
// multiplies with the track's automation on the bus.
//
// Not mixed: midi clips (no instrument yet),
// automation, and time remaps. A clip speed reads the source at
// `sourceRate` (`speedBaked` plays at 1), resampled linearly, with the
// pitch shift of WebAudio's playbackRate.

#include "audio/FadeCurves.h"
#include "audio/PcmRing.h"
#include "model/TimelineTypes.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace nt::audio {

inline constexpr int kMixBlockFrames = 128;
// Hard upper bound on reported plug-in latency (10 s at 96 kHz / 20 s at 48 kHz)
// to prevent signed integer overflow and unbounded ring allocations from broken plug-ins.
inline constexpr int kMaxProcessorLatencySamples = 960000;
// AudioEngine::Options defaults to 48000, AudioCli::kRate renders at 48000.
inline constexpr double kDefaultMixRate = 48000;

struct BlockContext {
    double sampleRate;
    double timelineMs;
    double msPerFrame;
    // No scheduled source or upstream residual in this Web Audio quantum.
    // Distortion propagates this silence without draining its resampler.
    bool silent = false;
    int quantumOffset = 0;
};

// Prepared state belongs to one renderer at a time. All storage must be
// allocated by the plan stage, never by process(), reset() or valueAt().
class BlockProcessor {
public:
    virtual ~BlockProcessor() = default;
    virtual void process(std::span<float> stereo, const BlockContext&) noexcept = 0;
    virtual void prepare(double) {}
    virtual void reset() noexcept {
        activeInQuantum_ = false;
        bypassStateInitialized_ = false;
        bypassMix_ = 0.0f;
    }
    // Stateful extensions report audio anywhere in the rest of this quantum,
    // even if the current callback fragment itself contains only zeros.
    virtual bool hasPendingOutput(int) const noexcept { return false; }
    virtual bool keepsActiveInput() const noexcept { return true; }
    bool processBlock(std::span<float> stereo, const BlockContext&) noexcept;
    // P2 can address an insert by its document id and set automatable fields.
    std::string id;
    virtual bool setParameter(std::string_view, double) noexcept { return false; }
    // A merged device curve already includes stored lanes. Control-thread query.
    virtual bool drivesDeviceAutomation() const noexcept { return false; }
    // Reported processing delay in samples at the prepared sample rate.
    // Queried during prepareMixPlan (control thread) and on the audio thread.
    virtual int latencySamples() const noexcept { return 0; }
    // Thread-safe live bypass. A bypassed processor passes audio through untouched
    // and reports 0 latency to plug-in delay compensation.
    virtual void setBypassed(bool bypassed) noexcept { bypassed_.store(bypassed, std::memory_order_release); }
    virtual bool bypassed() const noexcept { return bypassed_.load(std::memory_order_acquire); }
    [[nodiscard]] int effectiveLatencySamples() const noexcept {
        return bypassed() ? 0 : std::clamp(latencySamples(), 0, kMaxProcessorLatencySamples);
    }
    // Audio-thread hook called instead of process() when bypassed() is true
    // (e.g., to keep internal dry-path history warm and mark host clocks discontinuous).
    virtual void onBypassedBlock(std::span<const float>, const BlockContext&) noexcept {}
    // Control/offline thread: re-probes latency from external plug-in hosts before rendering.
    virtual void reprobeLatency(double) {}
    // Non-audio control/worker thread maintenance (e.g., growing overflowed delay buffers
    // off the audio thread and publishing them atomically). Never called on the audio thread.
    virtual void serviceControlThread() {}
private:
    static constexpr int kBypassCrossfadeFrames = 64;
    bool activeInQuantum_ = false;
    std::atomic<bool> bypassed_{false};
    bool bypassStateInitialized_ = false;
    float bypassMix_ = 0.0f;  // 0.0 = active (wet), 1.0 = bypassed (dry); audio thread only
    std::array<float, static_cast<std::size_t>(kMixBlockFrames) * 2> bypassDryScratch_{};
};

// Constructed on the control thread. Only the active render thread calls beginBlock/valueAt.
// Immutable sources need no synchronization. Live sources snapshot their atomic input in beginBlock.
class ParameterSource {
public:
    virtual ~ParameterSource() = default;
    virtual void beginBlock(const BlockContext&, int, double) const noexcept {}
    virtual double valueAt(double timelineMs, double baseValue) const noexcept = 0;
};

// native-rules #1: std::shared_ptr BlockProcessor list, no comment on why unique ownership is impossible
using Processors = std::vector<std::shared_ptr<BlockProcessor>>;

struct TrackPlan {
    std::string trackId;
    double gain = 1.0;
    double pan = 0.0;
    Processors processors;
    // native-rules #1: std::shared_ptr ParameterSource, no comment on why unique ownership is impossible
    std::shared_ptr<const ParameterSource> gainSource;
    std::shared_ptr<const ParameterSource> panSource;
};

struct VoicePlan {
    std::string clipId;
    std::string segmentId;  // stable within an expanded clip, empty without expansion
    std::string mediaPath;  // the clip's `audioPath`, else its `mediaPath`
    double startMs = 0.0;
    double durationMs = 0.0;
    double inPointMs = 0.0;
    double sourceRate = 1.0;  // source ms per timeline ms
    double clipGain = 1.0;    // dbToGain(clip.volumeDb)
    ResolvedFades fades;
    double fadeOffsetMs = 0;
    double fadeDurationMs = 0;  // zero uses this voice's duration
    double trackGain = 1.0;   // dbToGain(track.volumeDb)
    double pan = 0.0;         // track pan in [-1, 1]
    bool silent = false;
    bool videoOwnAudio = false;
    std::size_t trackIndex = 0;
    double tailMs = 0.0;
    Processors processors;
    // native-rules #1: std::shared_ptr ParameterSource, no comment on why unique ownership is impossible
    std::shared_ptr<const ParameterSource> gainSource;

    // The source frame (at `sampleRate`) that timeline time `timelineMs`
    // reads. Not clamped to the clip.
    double sourceFrameAt(double timelineMs, double sampleRate) const {
        return (inPointMs + (timelineMs - startMs) * sourceRate) * sampleRate / 1000.0;
    }
};

struct MixPlan {
    std::vector<VoicePlan> voices;
    double masterGain = 1.0;
    // Project setting `master.limiter` (defaults to true when absent).
    bool masterLimiterEnabled = true;
    std::vector<TrackPlan> tracks;
    Processors processors;
    // native-rules #1: std::shared_ptr ParameterSource, no comment on why unique ownership is impossible
    std::shared_ptr<const ParameterSource> gainSource;
    struct State;
    // native-rules #1: std::shared_ptr State, no comment on why unique ownership is impossible
    std::shared_ptr<State> state;
};

[[nodiscard]] bool masterLimiterEnabled(const Timeline& timeline) noexcept;
// Total plug-in delay compensation latency of `plan` (max track chain + master inserts), in samples.
[[nodiscard]] int planLatencySamples(const MixPlan& plan) noexcept;

MixPlan buildMixPlan(const Timeline& timeline);
// Control-thread preparation. A rate change resets all effect state.
void prepareMixPlan(const MixPlan& plan, double sampleRate);
// Control/offline-thread latency re-probe before offline render.
void reprobeMixPlanLatency(const MixPlan& plan, double sampleRate);
// Control/worker-thread maintenance for processors in `plan` (never call on audio thread).
void serviceMixPlanControl(const MixPlan& plan);

// Registration is a startup/control-thread operation. Stages run in ascending
// priority then registration order, after voices/buses exist. P1 uses priority
// 0, P2 can use priority 100 to attach automation to those inserts. The token
// supports scoped registrations in tests and dynamically loaded modules.
using MixPlanStage = std::function<void(const Timeline&, MixPlan&)>;
using MixPlanStageToken = std::uint64_t;
MixPlanStageToken registerMixPlanStage(std::string name, MixPlanStage stage, int priority = 100, bool unique = false);
void unregisterMixPlanStage(MixPlanStageToken token);
bool hasMixPlanStage(std::string_view name);
void applyMixPlanStage(std::string_view name,const Timeline& timeline,MixPlan& plan);

// The PCM a voice reads: a ring in the device callback, or a whole decoded
// span in the offline render. Missing frames are silence.
struct VoicePcm {
    PcmRing* ring = nullptr;
    const float* linear = nullptr;  // interleaved stereo
    std::int64_t linearFirst = 0;   // source frame of linear[0]
    std::int64_t linearCount = 0;
    // Set by the device callback. A live voice whose ring has gone keeps the
    // tail cap, where an offline render lets a residual ring out in full.
    bool live = false;
};

struct MixStats {
    // Missing PCM, once per voice per block, or one busy render lease per block.
    std::int64_t underruns = 0;
    std::int64_t preparations = 0;
};

// Renders `frames` interleaved stereo frames into `out` (overwritten). Output
// frame i carries timeline time `timelineMs0 + i * msPerFrame`. `pcm` has
// one entry per plan voice. Rings are released up to the frames the next
// block needs. Real-time safe: no locks, no allocation at the prepared rate. The sole
// exception is a device at a non-default rate: the first mismatching call
// prepares once and increments stats.preparations. AudioEngine can avoid this
// by preparing with its selected device rate before publishing the plan.
void mixBlock(const MixPlan& plan, VoicePcm* pcm, double sampleRate, double timelineMs0, double msPerFrame,
              // native-rules #5: raw float* output buffer crosses the module boundary
              int frames, float* out, MixStats& stats);

// Stack-owned on one render thread. Borrows a session-retained plan and releases
// its atomic claim on destruction. No waiting, allocation, or ownership transfer.
class MixRenderLease {
public:
    explicit MixRenderLease(const MixPlan& plan) noexcept;
    ~MixRenderLease();
    MixRenderLease(const MixRenderLease&)=delete;
    MixRenderLease& operator=(const MixRenderLease&)=delete;
    explicit operator bool() const noexcept { return owned_; }
    void mix(std::span<VoicePcm> pcm, double sampleRate, double timelineMs0, double msPerFrame,
             std::span<float> output, MixStats& stats) const;
private:
    const MixPlan& plan_;
    bool owned_;
};
}  // namespace nt::audio
