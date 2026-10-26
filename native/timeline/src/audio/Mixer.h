#pragma once

// The mix (DESIGN.md D25, D26). `buildMixPlan` copies the web rules for
// which clips sound and at what gain: `isPlayableAudioClip` and the solo
// group in web/src/components/timeline/render/renderAudio.ts,
// `videoClipsWithOwnAudio` in packages/timeline/src/clipAudio.ts, and the
// gain chain of preview/AudioGraph.ts: clip volumeDb and fades, then the
// track fader and pan (audio and midi tracks only; a video track's chain
// keeps unity gain and centre pan, as AudioGraph never sets it), then
// master.volumeDb. `mixBlock` renders that plan sample by sample. The device
// callback and the offline render both call it, so they cannot disagree.
//
// Not mixed: midi clips (no instrument yet),
// automation, and time remaps. A clip speed reads the source at
// `sourceRate` (`speedBaked` plays at 1), resampled linearly, with the
// pitch shift of WebAudio's playbackRate.

#include "audio/FadeCurves.h"
#include "audio/PcmRing.h"
#include "model/TimelineTypes.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace nt::audio {

inline constexpr int kMixBlockFrames = 128;
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

// State belongs to one plan and one render thread. All storage must be
// allocated by the plan stage, never by process(), reset() or valueAt().
class BlockProcessor {
public:
    virtual ~BlockProcessor() = default;
    virtual void process(std::span<float> stereo, const BlockContext&) noexcept = 0;
    virtual void prepare(double) {}
    virtual void reset() noexcept { activeInQuantum_ = false; }
    // Stateful extensions report audio anywhere in the rest of this quantum,
    // even if the current callback fragment itself contains only zeros.
    virtual bool hasPendingOutput(int) const noexcept { return false; }
    virtual bool keepsActiveInput() const noexcept { return true; }
    bool processBlock(std::span<float> stereo, const BlockContext&) noexcept;
    // P2 can address an insert by its document id and set automatable fields.
    std::string id;
    virtual bool setParameter(std::string_view, double) noexcept { return false; }
private:
    bool activeInQuantum_ = false;
};

class ParameterSource {
public:
    virtual ~ParameterSource() = default;
    virtual double valueAt(double timelineMs, double baseValue) const noexcept = 0;
};

using Processors = std::vector<std::shared_ptr<BlockProcessor>>;

struct TrackPlan {
    std::string trackId;
    double gain = 1.0;
    double pan = 0.0;
    Processors processors;
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
    std::vector<TrackPlan> tracks;
    Processors processors;
    std::shared_ptr<const ParameterSource> gainSource;
    struct State;
    std::shared_ptr<State> state;
};

MixPlan buildMixPlan(const Timeline& timeline);
// Control-thread preparation. A rate change resets all effect state.
void prepareMixPlan(const MixPlan& plan, double sampleRate);

// Registration is a startup/control-thread operation. Stages run in ascending
// priority then registration order, after voices/buses exist. P1 uses priority
// 0, P2 can use priority 100 to attach automation to those inserts. The token
// supports scoped registrations in tests and dynamically loaded modules.
using MixPlanStage = std::function<void(const Timeline&, MixPlan&)>;
using MixPlanStageToken = std::uint64_t;
MixPlanStageToken registerMixPlanStage(std::string name, MixPlanStage stage, int priority = 100);
void unregisterMixPlanStage(MixPlanStageToken token);

// The PCM a voice reads: a ring in the device callback, or a whole decoded
// span in the offline render. Missing frames are silence.
struct VoicePcm {
    PcmRing* ring = nullptr;
    const float* linear = nullptr;  // interleaved stereo
    std::int64_t linearFirst = 0;   // source frame of linear[0]
    std::int64_t linearCount = 0;
};

struct MixStats {
    // Voices that needed a frame the ring did not hold yet, counted once per
    // voice per block.
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
              int frames, float* out, MixStats& stats);

}  // namespace nt::audio
