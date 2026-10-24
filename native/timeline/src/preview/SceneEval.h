#pragma once

// The scene model for one frame: which clips draw at a time, in which order,
// and where. It mirrors `activeLayersAt` / `trackZ` in
// packages/timeline/src/render/sceneModel.ts and `buildTransformMatrix` in
// packages/timeline/src/render/transform.ts in spirit, for the fields the
// prototype models. Pure functions, no Qt GUI or GPU types.

#include "model/TimelineTypes.h"

#include <array>
#include <string>
#include <unordered_map>
#include <vector>

namespace nt {

struct ActiveLayer {
    std::string clipId;
    std::string trackId;
    std::string label;      // clip name, drawn by the synthetic source
    MediaType mediaType = MediaType::Video;
    int trackIndex = 0;
    int z = 0;              // higher draws later (on top)
    double clipTimeMs = 0.0;   // time since the clip start
    double sourceTimeMs = 0.0; // inPointMs + clipTimeMs: the frame the source shows
    double opacity = 1.0;
    ClipTransform transform;
    int sourceWidth = 0;
    int sourceHeight = 0;
    std::string mediaPath;
};

// Base for `trackZ`: track index 0 (the top UI row) gets the highest z.
inline constexpr int kLayerZBase = 1000;
inline int trackZ(int uiIndex) { return kLayerZBase - uiIndex; }

// True when a clip of this media type draws pixels in the preview.
bool isVisualMediaType(MediaType type);

// `fadeShapeGain` in audioFade.ts for t in [0, 1].
double fadeShapeGain(const std::string& shape, double t);

// `clipFadeGain`: the fade envelope `msIntoClip` into the clip, with both
// fades capped at the clip and at half of it when they cross.
double clipFadeGain(const Clip& clip, double msIntoClip);

// `clipSourceMsAt` without time remap: max(0, (t - start) * rate + inPoint)
// with rate 1 for speedBaked media, else max(1e-4, speedMultiplier).
double clipSourceMsAt(const Clip& clip, double timeMs);

// The opacity multiplier each clip in a cut carries at `timeMs`, keyed by clip
// id (`resolveDocumentTransitions` and `resolveTransition` in the web). With no
// `transitionIn`, a clip fades in across its head overlap with an earlier clip
// on the same track and the outgoing clip stays opaque. `transitionIn` with
// `durationMs <= 0` is a hard cut. Clips not in a cut are absent.
std::unordered_map<std::string, double> transitionOpacitiesAt(const Timeline& timeline, double timeMs);

// The layers visible at `timeMs`, sorted bottom to top (draw order). A clip is
// active on [startMs, startMs + durationMs). Opacity is
// clamp01(clip opacity x transition opacity x fade gain). Hidden clips, invisible tracks,
// non-visual tracks and non-visual media types are left out. Within one track,
// a later-starting clip draws above an earlier one; ties keep document order.
std::vector<ActiveLayer> activeLayersAt(const Timeline& timeline, double timeMs);

// Column-major 4x4 mapping the unit quad [-1,1]^2 of a source to clip space
// (NDC, y up) on a canvas. Scale 1 is the contain fit of the source in the
// canvas. Matches `buildTransformMatrix` without rotationX/Y and perspective.
std::array<float, 16> layerMatrix(const ClipTransform& transform, int sourceWidth, int sourceHeight,
                                  int canvasWidth, int canvasHeight);

// One frame of the plan: the active layers bottom to top, each with its
// placement matrix for its source size (clip `width`/`height`, else the
// sequence size). Its JSON form (`--dump-plan`) is the conformance format that
// scripts/plan-conformance.mjs diffs against the web scene model.
struct PlanLayer {
    ActiveLayer layer;
    std::array<float, 16> matrix{};
};

struct FramePlan {
    double timeMs = 0.0;
    std::vector<PlanLayer> layers;
};

FramePlan buildFramePlan(const Timeline& timeline, double timeMs);

}  // namespace nt
