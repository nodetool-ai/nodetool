#include "audio/Mixer.h"
#include "audio/effects/Effects.h"

#include <algorithm>
#include <array>
#include <limits>
#include <mutex>
#include <unordered_map>
#include <cmath>
#include <numbers>
#include <set>

namespace nt::audio {
bool BlockProcessor::processBlock(std::span<float> stereo, const BlockContext& context) noexcept {
    if (context.quantumOffset == 0) { activeInQuantum_ = false; }
    // Look ahead only in already-owned state, then retain the activity tag
    // for this entire quantum. Callback fragments must not change DSP output.
    activeInQuantum_ |= (!context.silent && keepsActiveInput()) || hasPendingOutput(kMixBlockFrames - context.quantumOffset);
    process(stereo, context);
    activeInQuantum_ |= std::ranges::any_of(stereo, [](float x) { return x != 0; });
    return !activeInQuantum_;
}
struct MixPlan::State {
    std::array<float, kMixBlockFrames * 2> voice{};
    std::vector<std::array<float, kMixBlockFrames * 2>> tracks;
    std::vector<bool> trackSilent;
    std::vector<bool> voiceUnderrun;
    int quantumCursor = 0;
    double sampleRate = 0;
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
    std::mutex mutex;
    std::vector<Stage> stages;
    MixPlanStageToken next = 1;
};
StageRegistry& registry() {
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

VoicePlan voiceFor(const Clip& clip) {
    VoicePlan v;
    v.clipId = clip.id;
    v.mediaPath = soundPath(clip);
    v.startMs = clip.startMs;
    v.durationMs = clip.durationMs;
    v.inPointMs = clip.inPointMs;
    v.sourceRate = sourceRateOf(clip);
    v.clipGain = clip.volumeDb != 0.0 ? std::pow(10.0, clip.volumeDb / 20.0) : 1.0;
    v.fades = resolveClipFades(clip.fadeInMs, clip.fadeOutMs, parseFadeShape(clip.fadeInShape),
                               parseFadeShape(clip.fadeOutShape), clip.durationMs);
    return v;
}

}  // namespace

MixPlanStageToken registerMixPlanStage(std::string name, MixPlanStage stage, int priority) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    const auto token = r.next++;
    r.stages.push_back({token, std::move(name), std::move(stage), priority});
    return token;
}

void unregisterMixPlanStage(MixPlanStageToken token) {
    auto& r = registry();
    const std::scoped_lock lock(r.mutex);
    std::erase_if(r.stages, [token](const Stage& s) { return s.token == token; });
}

MixPlan buildMixPlan(const Timeline& tl) {
    MixPlan plan;
    plan.masterGain = dbToGain(tl.masterVolumeDb);

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
        if (c.muted || c.startMs + c.durationMs <= 0.0) continue;
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
    bool processing = !plan.processors.empty() || plan.gainSource;
    for (const auto& voice : plan.voices) { processing |= !voice.processors.empty() || bool(voice.gainSource); }
    for (const auto& track : plan.tracks) {
        processing |= !track.processors.empty() || bool(track.gainSource) || bool(track.panSource);
    }
    if (processing) {
        plan.state = std::make_shared<MixPlan::State>();
        plan.state->tracks.resize(plan.tracks.size());
        plan.state->trackSilent.resize(plan.tracks.size());
        plan.state->voiceUnderrun.resize(plan.voices.size());
    }
    prepareMixPlan(plan, kDefaultMixRate);
    return plan;
}

void prepareMixPlan(const MixPlan& plan, double sampleRate) {
    if (!plan.state || plan.state->sampleRate == sampleRate) { return; }
    for (const auto& voice : plan.voices) {
        for (const auto& processor : voice.processors) { processor->prepare(sampleRate); }
    }
    for (const auto& track : plan.tracks) {
        for (const auto& processor : track.processors) { processor->prepare(sampleRate); }
    }
    for (const auto& processor : plan.processors) { processor->prepare(sampleRate); }
    plan.state->sampleRate = sampleRate;
    plan.state->quantumCursor = 0;
    plan.state->nextMs = std::numeric_limits<double>::quiet_NaN();
}

namespace {
void mixVoice(const VoicePlan& v, VoicePcm& src, double masterGain, bool dry,
              double sampleRate, double timelineMs0, double msPerFrame,
              int frames, std::span<float> out, MixStats& stats) {
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
        bool underrun = false;
        double lastSource = -1.0;
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
            float l0 = 0.0f, r0 = 0.0f, l1 = 0.0f, r1 = 0.0f;
            const auto fetch = [&](std::int64_t f, float& l, float& r) {
                if (src.ring) {
                    PcmRing& ring = *src.ring;
                    if (f < ring.readFloor()) return;
                    if (f >= ring.readableEnd()) {
                        if (f < ring.endFrame()) underrun = true;
                        return;
                    }
                    ring.get(f, l, r);
                } else if (src.linear && f >= src.linearFirst && f < src.linearFirst + src.linearCount) {
                    const std::size_t at = static_cast<std::size_t>(f - src.linearFirst) * 2;
                    l = src.linear[at];
                    r = src.linear[at + 1];
                }
            };
            fetch(f0, l0, r0);
            double inL = l0, inR = r0;
            if (frac > 0.0) {
                fetch(f0 + 1, l1, r1);
                inL = l0 + (l1 - l0) * frac;
                inR = r0 + (r1 - r0) * frac;
            }
            const double clipGain = v.gainSource ? v.gainSource->valueAt(t, v.clipGain) : v.clipGain;
            const double g = clipGain * clipFadeGain(v.fades, v.durationMs, into) * staticGain;
            const double outL = inL * inLtoL + inR * inRtoL;
            const double outR = inL * inLtoR + inR * inRtoR;
            out[2 * i] += static_cast<float>(outL * g);
            out[2 * i + 1] += static_cast<float>(outR * g);
        }
        if (src.ring && lastSource >= 0.0) {
            // Keep one frame below the next position for the interpolation.
            src.ring->release(static_cast<std::int64_t>(std::floor(lastSource)) - 1);
        }
        if (underrun) ++stats.underruns;
}
bool process(const Processors& processors, std::span<float> stereo, BlockContext context) {
    for (const auto& processor : processors) {
        context.silent = processor->processBlock(stereo, context);
    }
    return context.silent;
}
void panAndAdd(std::span<const float> in, std::span<float> out, double gain, double pan) {
    double ll = 1, rl = 0, lr = 0, rr = 1;
    if (pan < 0) {
        const double x = (pan + 1) * std::numbers::pi / 2;
        rl = std::cos(x); rr = std::sin(x);
    } else if (pan > 0) {
        const double x = pan * std::numbers::pi / 2;
        ll = std::cos(x); lr = std::sin(x);
    }
    for (std::size_t i = 0; i < in.size(); i += 2) {
        out[i] += static_cast<float>((in[i] * ll + in[i + 1] * rl) * gain);
        out[i + 1] += static_cast<float>((in[i] * lr + in[i + 1] * rr) * gain);
    }
}
} // namespace

void mixBlock(const MixPlan& plan, VoicePcm* pcm, double sampleRate, double timelineMs0, double msPerFrame,
              int frames, float* out, MixStats& stats) {
    if (frames <= 0) { return; }
    const std::span<float> output(out, static_cast<std::size_t>(frames) * 2);
    std::ranges::fill(output, 0.0f);
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
        for (std::size_t i = 0; i < plan.voices.size(); ++i) {
            const auto& voice = plan.voices[i];
            auto scratch = std::span(state.voice).first(samples);
            std::ranges::fill(scratch, 0.0f);
            MixStats voiceStats;
            mixVoice(voice, pcm[i], 1, true, sampleRate, context.timelineMs, msPerFrame, n, scratch, voiceStats);
            state.voiceUnderrun[i] = state.voiceUnderrun[i] || voiceStats.underruns > 0;
            auto voiceContext = context;
            const double quantumStart = context.timelineMs - state.quantumCursor * msPerFrame;
            const double quantumEnd = quantumStart + kMixBlockFrames * msPerFrame;
            voiceContext.silent = std::max(quantumStart, quantumEnd) <= voice.startMs ||
                std::min(quantumStart, quantumEnd) >= voice.startMs + voice.durationMs;
            const bool silent = process(voice.processors, scratch, voiceContext);
            const bool offlineResidual = !pcm[i].ring && !voice.processors.empty();
            // AudioGraph's natural release keeps the chain connected for
            // DECLICK_RELEASE_MS (25ms) beyond its declared musical tail.
            const double audibleEnd = voice.startMs + voice.durationMs + voice.tailMs + (voice.processors.empty() ? 0 : 25);
            const bool audibleQuantum = std::max(quantumStart, quantumEnd) > voice.startMs &&
                (offlineResidual || std::min(quantumStart, quantumEnd) < audibleEnd);
            state.trackSilent[voice.trackIndex] = state.trackSilent[voice.trackIndex] && (silent || !audibleQuantum);
            auto& track = state.tracks[voice.trackIndex];
            for (int f = 0; f < n; ++f) {
                const double t = context.timelineMs + f * msPerFrame;
                // AudioGraph.releaseEffectChain retains offline chains so
                // natural residuals render fully. Live ring sources use its
                // explicit clipAudioTailSec cap, including the 20s echo cap.
                if (t >= voice.startMs && (t < audibleEnd || offlineResidual)) {
                    track[2 * f] += scratch[2 * f];
                    track[2 * f + 1] += scratch[2 * f + 1];
                }
            }
        }
        // AudioGraph.addClips: source -> clipGain/fades -> clip inserts.
        // AudioGraph.updateTracks: trackGain(mute/solo) -> inserts -> fader -> pan.
        bool masterSilent = true;
        for (std::size_t i = 0; i < plan.tracks.size(); ++i) {
            const auto& track = plan.tracks[i];
            auto scratch = std::span(state.tracks[i]).first(samples);
            auto trackContext = context;
            trackContext.silent = state.trackSilent[i];
            masterSilent = process(track.processors, scratch, trackContext) && masterSilent;
            if (!track.gainSource && !track.panSource) {
                panAndAdd(scratch, dest, track.gain, track.pan);
            } else {
                for (int f = 0; f < n; ++f) {
                    const double t = context.timelineMs + f * msPerFrame;
                    const double gain = track.gainSource ? track.gainSource->valueAt(t, track.gain) : track.gain;
                    const double pan = std::clamp(track.panSource ? track.panSource->valueAt(t, track.pan) : track.pan, -1.0, 1.0);
                    panAndAdd(scratch.subspan(2 * f, 2), dest.subspan(2 * f, 2), gain, pan);
                }
            }
        }
        // AudioGraph.getContext/setMaster: mix bus -> master inserts -> fader.
        auto masterContext = context;
        masterContext.silent = masterSilent;
        process(plan.processors, dest, masterContext);
        for (int f = 0; f < n; ++f) {
            const double gain = plan.gainSource ? plan.gainSource->valueAt(context.timelineMs + f * msPerFrame, plan.masterGain) : plan.masterGain;
            dest[2 * f] *= gain;
            dest[2 * f + 1] *= gain;
        }
        state.quantumCursor = (state.quantumCursor + n) % kMixBlockFrames;
        offset += n;
    }
    stats.underruns += std::count(state.voiceUnderrun.begin(), state.voiceUnderrun.end(), true);
}

}  // namespace nt::audio
