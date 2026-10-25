#pragma once

// Clip animations for the layer plan: a port of
// packages/timeline/src/animation/{easing,compile,sample,presets,custom}.ts
// for the channels that move a layer (offsets, scale, rotation, opacity,
// position, anchor) and the ones that only change pixels (blur, grade, trim,
// wipe), so the fold matches the web sample for sample.
//
// Not ported (the loader report lists them as unsupported, effect "plan"):
// beat-timed animations, the `followPath` preset, and `line` staggers (they
// need text measurement). `styleTracks` and `textAnimator` change only text
// pixels.

#include <QJsonArray>
#include <QJsonObject>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace nt::scene {

// `ease(id, t)` in easing.ts: named easings, cubic-bezier(...), spring(...);
// an unknown id eases linearly.
double ease(const std::string& id, double t);
// True when `id` parses (named or functional).
bool isKnownEasing(const std::string& id);

enum class Channel {
    OffsetX, OffsetY, Scale, ScaleX, ScaleY, Rotation, RotationX, RotationY, Opacity, WipeProgress, Blur,
    Brightness, Saturation, Contrast, Hue, Temperature, Tint, PositionX, PositionY, AnchorX, AnchorY,
    TrimStart, TrimEnd, CameraAzimuth, CameraElevation, CameraZoom, CameraFov
};
std::optional<Channel> channelFromName(const QString& name);

struct Keyframe {
    double t = 0.0;
    double value = 0.0;
    std::string easing;  // empty: linear
    std::optional<double> sourceMs;
};

struct PropertyCurve {
    Channel channel = Channel::Opacity;
    std::vector<Keyframe> keyframes;
};

struct WipeMask {
    std::string direction;  // left, right, up, down
    double softness = 0.0;
    double progress = 1.0;  // sample only
};

struct CompiledAnimation {
    std::string id;
    std::string role;
    double windowStartMs = 0.0;
    double windowEndMs = 0.0;
    bool loop = false;
    std::optional<double> periodMs;
    std::optional<double> loopOriginMs;
    bool holdBefore = false;
    bool holdAfter = false;
    bool sourceTime = false;  // timeBase "source"
    bool staggered = false;   // the block sample folds only effect channels
    std::optional<WipeMask> mask;
    std::vector<PropertyCurve> curves;
};

// The fold of every animation at one clip-local time (`AnimationSample`).
struct AnimationSample {
    double offsetX = 0, offsetY = 0, scale = 1, scaleX = 1, scaleY = 1, rotation = 0, rotationX = 0, rotationY = 0;
    double opacity = 1, blur = 0, brightness = 0, saturation = 1, contrast = 1, hue = 0, temperature = 0, tint = 0;
    double cameraAzimuth = 0, cameraElevation = 0, cameraZoom = 1, cameraFov = 0;
    std::optional<double> positionX, positionY, anchorX, anchorY, trimStart, trimEnd;
    std::optional<WipeMask> mask;
    bool replaced = false;  // a replace channel fired (`replacedBy` set)

    bool isIdentity() const;
};

// One authored `ClipAnimation`, as read from the document.
struct AnimationDef {
    std::string id;
    std::string role;
    std::string preset;
    double durationMs = 0.0;
    std::optional<double> delayMs;
    std::optional<std::string> easing;
    bool enabled = true;
    bool hasBeat = false;
    QJsonObject params;
    QJsonObject custom;  // `custom`, raw
    bool styleOnly = false;  // custom with no curves but style tracks or a text animator
    std::optional<std::string> staggerUnit;
    double staggerOffsetMs = 0.0;
    std::string staggerFrom = "start";
};

std::vector<AnimationDef> parseAnimations(const QJsonArray& raw);

// Why a def is outside the ported subset, or empty.
std::string unsupportedReason(const AnimationDef& def, const QJsonObject& clipRaw);

struct CompileContext {
    double canvasWidth = 1920;
    double canvasHeight = 1080;
    int staggerCount = 0;            // units of the clip's text in `staggerUnit`
    std::string staggerUnit = "word";
};

// `compileClipAnimations`.
std::vector<CompiledAnimation> compileAnimations(const std::vector<AnimationDef>& defs, double clipDurationMs,
                                                 const CompileContext& ctx);

// `sampleAnimations`: the block-level fold (staggered animations fold only
// their effect channels here).
AnimationSample sampleAnimations(const std::vector<CompiledAnimation>& compiled, double localMs,
                                 std::optional<double> sourceMs);

// Unit counts for `clipStaggerCount`: words, or characters as the typewriter
// counts them (code points per word plus one per gap).
int countWords(const QString& text);
int countCharacters(const QString& text);

}  // namespace nt::scene
