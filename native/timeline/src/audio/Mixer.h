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
// Not mixed: midi clips (no instrument yet), clip and track effects,
// automation, and time remaps. A clip speed reads the source at
// `sourceRate` (`speedBaked` plays at 1), resampled linearly, with the
// pitch shift of WebAudio's playbackRate.

#include "audio/FadeCurves.h"
#include "audio/PcmRing.h"
#include "model/TimelineTypes.h"

#include <cstdint>
#include <string>
#include <vector>

namespace nt::audio {

struct VoicePlan {
    std::string clipId;
    std::string mediaPath;  // the clip's `audioPath`, else its `mediaPath`
    double startMs = 0.0;
    double durationMs = 0.0;
    double inPointMs = 0.0;
    double sourceRate = 1.0;  // source ms per timeline ms
    double clipGain = 1.0;    // dbToGain(clip.volumeDb)
    ResolvedFades fades;
    double trackGain = 1.0;   // dbToGain(track.volumeDb)
    double pan = 0.0;         // track pan in [-1, 1]
    bool videoOwnAudio = false;

    // The source frame (at `sampleRate`) that timeline time `timelineMs`
    // reads. Not clamped to the clip.
    double sourceFrameAt(double timelineMs, double sampleRate) const {
        return (inPointMs + (timelineMs - startMs) * sourceRate) * sampleRate / 1000.0;
    }
};

struct MixPlan {
    std::vector<VoicePlan> voices;
    double masterGain = 1.0;
};

MixPlan buildMixPlan(const Timeline& timeline);

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
};

// Renders `frames` interleaved stereo frames into `out` (overwritten). Output
// frame i carries timeline time `timelineMs0 + i * msPerFrame`. `pcm` has
// one entry per plan voice. Rings are released up to the frames the next
// block needs. Real-time safe: no locks, no allocation.
void mixBlock(const MixPlan& plan, VoicePcm* pcm, double sampleRate, double timelineMs0, double msPerFrame,
              int frames, float* out, MixStats& stats);

}  // namespace nt::audio
