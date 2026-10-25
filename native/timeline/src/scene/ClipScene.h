#pragma once

// The scene fields of a clip and a sequence beyond the core model: group
// parents, animations, repeaters and echoes, stepped time, captions, mattes,
// the style presence that decides whether a text, shape or 3D clip draws,
// the extra transition fields, and the scene camera. Parsed once from the raw
// JSON (TimelineJson), read by SceneEval. Names follow
// packages/protocol/src/api-schemas/timeline.ts.

#include "scene/Animation.h"

#include <QJsonObject>
#include <QString>

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace nt::scene {

struct Repeater {
    int count = 1;
    double stepX = 0, stepY = 0;
    std::optional<int> columns;
    double rowStepX = 0, rowStepY = 0;
    double timeStepMs = 0;
    double hueDegrees = 0, brightness = 0;
};

struct TemporalEcho {
    int copies = 1;
    double intervalMs = 0;
    double opacityDecay = 1;
};

struct CaptionWord {
    double startMs = 0, endMs = 0;
};

struct ClipScene {
    std::string parentId;
    std::string blendMode = "normal";
    bool anyEnabledEffect = false;  // an enabled entry in `effects`
    // Shared by a clip's repeater copies and echoes, so the compiled cache
    // (SceneEval) keys on one pointer for all of them. Never null.
    std::shared_ptr<const std::vector<AnimationDef>> animations = std::make_shared<const std::vector<AnimationDef>>();
    std::optional<Repeater> repeater;
    std::optional<TemporalEcho> temporalEcho;
    std::optional<double> steppedFps;
    bool hasCaption = false;  // `caption` present: the clip adds a caption layer
    std::vector<CaptionWord> captionWords;
    std::optional<std::string> matteSource;  // `matte` with a readable mode (alpha, luma)
    bool generatedMatte = false;
    bool hasTextStyle = false, hasShapeStyle = false, hasModel3dStyle = false;
    QString text;  // textStyle.text
    std::string currentAssetId;
    // transitionIn fields beyond type, duration and easing.
    std::optional<std::string> transitionDirection;
    std::optional<std::string> transitionColor;
    std::optional<double> transitionSoftness;
};

struct CameraKeyframe {
    double timeMs = 0;
    double x = 0, y = 0;
    double depthPx = 0;
    std::optional<double> focusDepthPx, aperturePx;
};

struct Camera2D {
    double x = 0, y = 0;
    double depthPx = 0;
    double focalLengthPx = 1;
    std::optional<double> focusDepthPx, aperturePx;
    std::vector<CameraKeyframe> keyframes;  // sorted by timeMs
};

struct SequenceScene {
    std::optional<Camera2D> camera2d;
};

std::shared_ptr<const ClipScene> parseClipScene(const QJsonObject& clip);
std::shared_ptr<const SequenceScene> parseSequenceScene(const QJsonObject& sequence);

}  // namespace nt::scene
