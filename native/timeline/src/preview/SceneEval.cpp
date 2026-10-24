#include "preview/SceneEval.h"

#include <algorithm>
#include <cmath>
#include <unordered_map>

namespace nt {

bool isVisualMediaType(MediaType type) {
    switch (type) {
    case MediaType::Image:
    case MediaType::Video:
    case MediaType::Overlay:
    case MediaType::Text:
    case MediaType::Shape:
    case MediaType::Model3d:
        return true;
    case MediaType::Audio:
    case MediaType::Group:
    case MediaType::Adjustment:
    case MediaType::Midi:
        return false;
    }
    return false;
}

namespace {

bool isVisualTrackType(TrackType type) {
    return type == TrackType::Video || type == TrackType::Overlay;
}

bool isActiveAt(const Clip& clip, double timeMs) {
    return timeMs >= clip.startMs && timeMs < clip.endMs();
}

double clamp01(double v) {
    return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
}

// `incomingRecord` / `outgoingRecord` in transition.ts, opacity only.
double incomingOpacity(const std::string& type, double p) {
    if (type == "dipToColor") return clamp01(2.0 * p - 1.0);
    if (type == "wipe" || type == "gradientWipe" || type == "push" || type == "slide" || type == "whip" ||
        type == "iris") {
        return 1.0;
    }
    // crossfade, zoom, zoomBlur, glitch, lightLeak, and any unknown type,
    // which the web resolves as a crossfade.
    return clamp01(p);
}

double outgoingOpacity(const std::string& type, double p) {
    return type == "dipToColor" ? clamp01(1.0 - 2.0 * p) : 1.0;
}

}  // namespace

double fadeShapeGain(const std::string& shape, double t) {
    const double x = clamp01(t);
    constexpr double pi = 3.14159265358979323846;
    if (shape == "sCurve") return (1.0 - std::cos(x * pi)) / 2.0;
    if (shape == "plus3dB") return std::sin(x * pi / 2.0);
    if (shape == "minus3dB") return (2.0 / pi) * std::asin(x);
    return x;
}

double clipFadeGain(const Clip& clip, double msIntoClip) {
    const double span = std::max(0.0, clip.durationMs);
    if (msIntoClip < 0.0 || msIntoClip > span) return 0.0;
    const auto cap = [span](double ms) { return std::min(span, std::max(0.0, std::isfinite(ms) ? ms : 0.0)); };
    double fadeIn = cap(clip.fadeInMs);
    double fadeOut = cap(clip.fadeOutMs);
    if (fadeIn + fadeOut > span) {
        fadeIn = std::min(fadeIn, span / 2.0);
        fadeOut = std::min(fadeOut, span / 2.0);
    }
    double gain = 1.0;
    if (fadeIn > 0.0 && msIntoClip < fadeIn) gain = std::min(gain, fadeShapeGain(clip.fadeInShape, msIntoClip / fadeIn));
    if (fadeOut > 0.0 && msIntoClip > span - fadeOut) {
        gain = std::min(gain, fadeShapeGain(clip.fadeOutShape, (span - msIntoClip) / fadeOut));
    }
    return gain;
}

double clipSourceMsAt(const Clip& clip, double timeMs) {
    const double rate = clip.speedBaked ? 1.0 : std::max(0.0001, clip.speedMultiplier);
    return std::max(0.0, (timeMs - clip.startMs) * rate + clip.inPointMs);
}

std::unordered_map<std::string, double> transitionOpacitiesAt(const Timeline& timeline, double timeMs) {
    // `resolveDocumentTransitions` in sceneModel.ts: per track, the active,
    // non-hidden, non-adjustment clips in start order.
    std::unordered_map<std::string, std::vector<const Clip*>> byTrack;
    for (const Clip& clip : timeline.clips) {
        if (clip.mediaType == MediaType::Adjustment || clip.hidden || !isActiveAt(clip, timeMs)) {
            continue;
        }
        byTrack[clip.trackId].push_back(&clip);
    }
    std::unordered_map<std::string, double> out;
    const auto multiply = [&out](const std::string& id, double v) {
        auto [it, inserted] = out.emplace(id, v);
        if (!inserted) it->second *= v;
    };
    for (auto& [trackId, siblings] : byTrack) {
        std::stable_sort(siblings.begin(), siblings.end(),
                         [](const Clip* a, const Clip* b) { return a->startMs < b->startMs; });
        for (const Clip* clip : siblings) {
            // `headOverlap`: the earlier-starting sibling reaching furthest
            // past this clip's start.
            const Clip* partner = nullptr;
            double furthestEnd = clip->startMs;
            for (const Clip* prev : siblings) {
                if (prev == clip || prev->startMs >= clip->startMs) continue;
                if (prev->endMs() <= clip->startMs) continue;
                if (!partner || prev->endMs() > furthestEnd) {
                    partner = prev;
                    furthestEnd = prev->endMs();
                }
            }
            double durationMs = 0.0;
            std::string type = "crossfade";
            if (clip->transitionIn) {
                if (clip->transitionIn->durationMs <= 0.0) continue;  // explicit hard cut
                durationMs = clip->transitionIn->durationMs;
                type = clip->transitionIn->type;
            } else {
                durationMs = partner ? std::min(furthestEnd - clip->startMs, clip->durationMs) : 0.0;
                if (durationMs <= 0.0) continue;  // nothing to dissolve against
            }
            const double into = timeMs - clip->startMs;
            if (into >= durationMs) continue;  // the cut is over
            const double progress = clamp01(into / durationMs);
            if (partner) multiply(partner->id, outgoingOpacity(type, progress));
            multiply(clip->id, incomingOpacity(type, progress));
        }
    }
    return out;
}

std::vector<ActiveLayer> activeLayersAt(const Timeline& timeline, double timeMs) {
    const auto transitions = transitionOpacitiesAt(timeline, timeMs);
    struct Entry {
        ActiveLayer layer;
        double startMs;
        size_t docOrder;
    };
    std::vector<Entry> entries;
    for (size_t i = 0; i < timeline.clips.size(); ++i) {
        const Clip& clip = timeline.clips[i];
        if (clip.hidden || !isVisualMediaType(clip.mediaType)) {
            continue;
        }
        if (!isActiveAt(clip, timeMs)) {
            continue;
        }
        const Track* track = timeline.findTrack(clip.trackId);
        if (!track || !track->visible || !isVisualTrackType(track->type)) {
            continue;
        }
        ActiveLayer layer;
        layer.clipId = clip.id;
        layer.trackId = clip.trackId;
        layer.label = clip.name;
        layer.mediaType = clip.mediaType;
        layer.trackIndex = track->index;
        layer.z = trackZ(track->index);
        layer.clipTimeMs = timeMs - clip.startMs;
        layer.sourceTimeMs = clipSourceMsAt(clip, timeMs);
        const auto tr = transitions.find(clip.id);
        // `clipFadeOpacity`: a clip with no fade skips the envelope.
        const double fade = (clip.fadeInMs == 0.0 && clip.fadeOutMs == 0.0) ? 1.0 : clipFadeGain(clip, layer.clipTimeMs);
        layer.opacity = clamp01(clip.opacity * (tr == transitions.end() ? 1.0 : tr->second) * fade);
        layer.transform = clip.transform.value_or(ClipTransform{});
        layer.sourceWidth = clip.width.value_or(timeline.width);
        layer.sourceHeight = clip.height.value_or(timeline.height);
        layer.mediaPath = clip.mediaPath;
        entries.push_back(Entry{std::move(layer), clip.startMs, i});
    }
    std::stable_sort(entries.begin(), entries.end(), [](const Entry& a, const Entry& b) {
        if (a.layer.z != b.layer.z) return a.layer.z < b.layer.z;
        if (a.startMs != b.startMs) return a.startMs < b.startMs;
        return a.docOrder < b.docOrder;
    });
    std::vector<ActiveLayer> out;
    out.reserve(entries.size());
    for (auto& e : entries) {
        out.push_back(std::move(e.layer));
    }
    return out;
}

std::array<float, 16> layerMatrix(const ClipTransform& transform, int sourceWidth, int sourceHeight,
                                  int canvasWidth, int canvasHeight) {
    std::array<float, 16> m{};
    if (canvasWidth <= 0 || canvasHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
        return m;
    }
    const double W = canvasWidth;
    const double H = canvasHeight;
    // Contain-fit base: the fraction of the canvas the source covers at scale 1.
    const double fit = std::min(W / sourceWidth, H / sourceHeight);
    const double baseX = sourceWidth * fit / W;
    const double baseY = sourceHeight * fit / H;
    const double sx = baseX * transform.scale.x;
    const double sy = baseY * transform.scale.y;

    // Clockwise on screen for positive rotation (canvas y grows downward).
    const double c = std::cos(transform.rotation);
    const double s = -std::sin(transform.rotation);
    // Aspect-corrected rotation: A^-1 R A with A = diag(W/2, H/2).
    const double aspect = W / H;
    const double r00 = c;
    const double r01 = -s / aspect;
    const double r10 = s * aspect;
    const double r11 = c;

    const double tx = transform.position.x / W * 2.0;
    const double ty = -transform.position.y / H * 2.0;
    const double ax = (transform.anchor.x - 0.5) * 2.0;
    // Same sign as the web compositor, which applies anchor y unflipped.
    const double ay = (transform.anchor.y - 0.5) * 2.0;

    m[0] = static_cast<float>(r00 * sx);
    m[1] = static_cast<float>(r10 * sx);
    m[4] = static_cast<float>(r01 * sy);
    m[5] = static_cast<float>(r11 * sy);
    m[10] = 1.0f;
    m[12] = static_cast<float>(tx + ax - (m[0] * ax + m[4] * ay));
    m[13] = static_cast<float>(ty + ay - (m[1] * ax + m[5] * ay));
    m[15] = 1.0f;
    return m;
}

FramePlan buildFramePlan(const Timeline& timeline, double timeMs) {
    FramePlan plan;
    plan.timeMs = timeMs;
    for (ActiveLayer& layer : activeLayersAt(timeline, timeMs)) {
        PlanLayer pl;
        pl.matrix = layerMatrix(layer.transform, layer.sourceWidth, layer.sourceHeight, timeline.width, timeline.height);
        pl.layer = std::move(layer);
        plan.layers.push_back(std::move(pl));
    }
    return plan;
}

}  // namespace nt
