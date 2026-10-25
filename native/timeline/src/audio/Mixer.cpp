#include "audio/Mixer.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <set>

namespace nt::audio {
namespace {

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
    return plan;
}

void mixBlock(const MixPlan& plan, VoicePcm* pcm, double sampleRate, double timelineMs0, double msPerFrame,
              int frames, float* out, MixStats& stats) {
    std::fill(out, out + static_cast<std::ptrdiff_t>(frames) * 2, 0.0f);
    const double msBlockEnd = timelineMs0 + msPerFrame * frames;
    for (std::size_t vi = 0; vi < plan.voices.size(); ++vi) {
        const VoicePlan& v = plan.voices[vi];
        VoicePcm& src = pcm[vi];
        const double clipEndMs = v.startMs + v.durationMs;
        const double lo = std::min(timelineMs0, msBlockEnd);
        const double hi = std::max(timelineMs0, msBlockEnd);
        if (hi < v.startMs || lo >= clipEndMs) continue;

        // StereoPannerNode on a stereo input (Web Audio spec). Pan 0 is the
        // identity, set exactly so a centred track is sample exact.
        double inLtoL = 1.0, inRtoL = 0.0, inLtoR = 0.0, inRtoR = 1.0;
        if (v.pan < 0.0) {
            const double x = (v.pan + 1.0) * std::numbers::pi / 2.0;
            inRtoL = std::cos(x);
            inRtoR = std::sin(x);
        } else if (v.pan > 0.0) {
            const double x = v.pan * std::numbers::pi / 2.0;
            inLtoL = std::cos(x);
            inLtoR = std::sin(x);
        }
        const double staticGain = v.trackGain * plan.masterGain;
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
            const double g = v.clipGain * clipFadeGain(v.fades, v.durationMs, into) * staticGain;
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
}

}  // namespace nt::audio
