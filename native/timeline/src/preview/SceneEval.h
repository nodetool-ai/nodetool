#pragma once

// The scene model for one frame: which clips draw at a time, in which order,
// and where. A port of `computeActiveLayersWithHorizon` and
// `resolveAnimatedLayerProps` in packages/timeline/src/render/sceneModel.ts,
// `buildTransformMatrix` in render/transform.ts, `resolveTransition` in
// render/transition.ts, `expandTemporalClips` in render/temporal.ts and the
// camera in render/spatial.ts, for what the layer plan holds:
//   - the active set and its order (tracks, depth, echoes, start), the video
//     and 3D caps, mattes that divert or drop a layer, caption layers;
//   - group parents (`parentId`): window, opacity, matrix, and the group
//     precomposites with their surfaces and stack order;
//   - keyframed and preset animations with easing (scene/Animation.h),
//     stepped time, repeaters and temporal echoes, the scene camera;
//   - transitions: opacity, easing, and the geometry (offset, scale, wipe,
//     iris, dip solid).
// Flex layout, animation links, track bindings and track automation are not
// ported; the loader report lists the clips they touch (effect "plan").
// Pure functions, no Qt GUI or GPU types.

#include "model/TimelineTypes.h"
#include "scene/Animation.h"

#include <QJsonObject>

#include <array>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace nt {

using Mat4 = std::array<float, 16>;  // column-major, like the web's Float32Array

// A cut in flight on a layer (`ResolvedTransition`).
struct LayerTransition {
    std::string type;  // a known type; anything else resolves as "crossfade"
    std::string role;  // "in" or "out"
    double progress = 0.0;
    double opacity = 1.0;
    std::optional<double> scale;
    std::optional<Vec2> offset;  // in frame sizes
    std::optional<scene::WipeMask> mask;
    std::optional<std::string> solidColor;
    double solidOpacity = 0.0;
    std::optional<std::pair<double, double>> iris;  // progress, softness
    // The cut's effect (`cutEffect`: whip, zoomBlur, glitch, gradientWipe,
    // lightLeak), as the web's effect object. Carried in the plan; the
    // compositor does not draw it.
    std::optional<QJsonObject> effect;
};

struct ActiveLayer {
    std::string clipId;
    std::string trackId;
    std::string label;      // clip name, drawn by the synthetic source
    std::string kind;       // video, image, text, shape, caption, model3d
    MediaType mediaType = MediaType::Video;
    int trackIndex = 0;
    int z = 0;              // higher draws later (on top)
    std::optional<int> stackOrder;  // set when the frame has precomposites
    double clipTimeMs = 0.0;   // time since the clip start
    double sourceTimeMs = 0.0; // the frame the source shows
    // The animated opacity: clip, group, fade, transition and animation.
    double opacity = 1.0;
    // `opacity` times every enclosing precomposite's opacity. The compositor
    // draws precomposited children straight onto the frame (DESIGN.md D35),
    // so this is the opacity it draws with.
    double drawOpacity = 1.0;
    std::string blendMode = "normal";
    // The animated transform, the camera applied. Absent: the clip has none.
    std::optional<ClipTransform> transform;
    std::optional<Mat4> parentMatrix;     // the group's matrix
    std::string precomposeGroupId;        // the surface this layer draws into
    std::optional<LayerTransition> transition;
    std::optional<scene::WipeMask> mask;  // an animated wipe
    int sourceWidth = 0;
    int sourceHeight = 0;
    std::string mediaPath;
    std::optional<std::string> assetId;  // `effectiveAssetId`
};

// A group that composites its children before they blend (`PrecompositeLayer`).
struct PrecompositeLayer {
    std::string clipId;
    int trackIndex = 0;
    int z = 0;
    std::optional<int> stackOrder;
    double opacity = 1.0;
    std::string blendMode = "normal";
    bool effects = false;  // the group runs an effect chain on its surface
    std::optional<LayerTransition> transition;
    std::string precomposeGroupId;  // the surface this one draws into
};

struct DroppedLayer {
    std::string clipId;
    std::string reason;  // video_layer_cap, model3d_layer_cap, matte_source_inactive
};

struct SceneFrame {
    std::vector<ActiveLayer> layers;  // bottom to top (stable by z)
    std::vector<PrecompositeLayer> precomposites;  // innermost first
    std::vector<DroppedLayer> dropped;
};

// Base for `trackZ`: track index 0 (the top UI row) gets the highest z.
inline constexpr int kLayerZBase = 1000;
inline int trackZ(int uiIndex) { return kLayerZBase - uiIndex; }
inline constexpr int kMaxVideoLayers = 8;
inline constexpr int kMaxModel3dLayers = 2;
inline constexpr int kCaptionTrackIndex = -1;

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

// The opacity multiplier each clip in a cut carries at `timeMs`, keyed by
// clip id (`resolveDocumentTransitions`). Clips not in a cut are absent.
std::unordered_map<std::string, double> transitionOpacitiesAt(const Timeline& timeline, double timeMs);

// The whole scene at `timeMs`.
SceneFrame evaluateScene(const Timeline& timeline, double timeMs);

// The layers of `evaluateScene`, bottom to top.
std::vector<ActiveLayer> activeLayersAt(const Timeline& timeline, double timeMs);

// `containBaseScale`: the fraction of the canvas a source covers at scale 1.
Vec2 containBaseScale(double layerWidth, double layerHeight, double canvasWidth, double canvasHeight);

// `buildTransformMatrix`: column-major 4x4 mapping the unit quad [-1,1]^2 of a
// source to clip space (NDC, y up), in float like the web, `parent` composed.
Mat4 buildTransformMatrix(const ClipTransform& transform, Vec2 base, double width, double height,
                          const std::optional<Mat4>& parent = std::nullopt);

// The matrix a layer draws with for a source of this size: its transform
// moved by its cut (`transitionTransform`), contain fit, its group's matrix.
// A caption composites frame-sized and untransformed.
Mat4 layerDrawMatrix(const ActiveLayer& layer, int sourceWidth, int sourceHeight, int canvasWidth, int canvasHeight);

// The contain-fit matrix of a transform with no parent (the M1a form).
std::array<float, 16> layerMatrix(const ClipTransform& transform, int sourceWidth, int sourceHeight,
                                  int canvasWidth, int canvasHeight);

// One frame of the plan: the scene, each layer with its draw matrix for its
// source size (clip `width`/`height`, else the sequence size). Its JSON form
// (`--dump-plan`) is the conformance format that scripts/plan-conformance.mjs
// diffs against the web scene model.
struct PlanLayer {
    ActiveLayer layer;
    Mat4 matrix{};
};

struct FramePlan {
    double timeMs = 0.0;
    std::vector<PlanLayer> layers;
    std::vector<PrecompositeLayer> precomposites;
    std::vector<DroppedLayer> dropped;
};

FramePlan buildFramePlan(const Timeline& timeline, double timeMs);

// {timeMs, layers[], precomposites[], dropped[]}.
QJsonObject framePlanJson(const FramePlan& plan);

}  // namespace nt
