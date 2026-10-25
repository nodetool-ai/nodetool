#include "scene/ClipScene.h"

#include <QJsonArray>

#include <algorithm>
#include <cmath>

namespace nt::scene {
namespace {

std::optional<double> optNumber(const QJsonValue& v) {
    if (v.isDouble() && std::isfinite(v.toDouble())) return v.toDouble();
    return std::nullopt;
}

}  // namespace

std::shared_ptr<const ClipScene> parseClipScene(const QJsonObject& c) {
    auto s = std::make_shared<ClipScene>();
    s->parentId = c.value(u"parentId").toString().toStdString();
    if (c.value(u"blendMode").isString()) s->blendMode = c.value(u"blendMode").toString().toStdString();
    for (const QJsonValue& e : c.value(u"effects").toArray()) {
        if (e.toObject().value(u"enabled").toBool(false)) s->anyEnabledEffect = true;
    }
    s->animations = std::make_shared<const std::vector<AnimationDef>>(parseAnimations(c.value(u"animations").toArray()));
    if (c.value(u"repeater").isObject()) {
        const QJsonObject r = c.value(u"repeater").toObject();
        Repeater rep;
        rep.count = static_cast<int>(std::max(1.0, std::min(128.0, std::floor(r.value(u"count").toDouble(1)))));
        rep.stepX = r.value(u"positionStep").toObject().value(u"x").toDouble(0);
        rep.stepY = r.value(u"positionStep").toObject().value(u"y").toDouble(0);
        if (r.value(u"columns").toDouble(0) > 0) {
            rep.columns = static_cast<int>(std::max(1.0, std::min(128.0, std::floor(r.value(u"columns").toDouble()))));
        }
        rep.rowStepX = r.value(u"rowStep").toObject().value(u"x").toDouble(0);
        rep.rowStepY = r.value(u"rowStep").toObject().value(u"y").toDouble(0);
        rep.timeStepMs = r.value(u"timeStepMs").toDouble(0);
        rep.hueDegrees = r.value(u"colorStep").toObject().value(u"hueDegrees").toDouble(0);
        rep.brightness = r.value(u"colorStep").toObject().value(u"brightness").toDouble(0);
        s->repeater = rep;
    }
    if (c.value(u"temporalEcho").isObject()) {
        const QJsonObject e = c.value(u"temporalEcho").toObject();
        TemporalEcho echo;
        echo.copies = static_cast<int>(std::max(1.0, std::min(32.0, std::floor(e.value(u"copies").toDouble(1)))));
        echo.intervalMs = e.value(u"intervalMs").toDouble(0);
        echo.opacityDecay = e.value(u"opacityDecay").toDouble(1);
        s->temporalEcho = echo;
    }
    if (const auto fps = optNumber(c.value(u"steppedTime").toObject().value(u"fps")); fps && *fps > 0) {
        s->steppedFps = fps;
    }
    if (c.value(u"caption").isObject()) {
        s->hasCaption = true;
        for (const QJsonValue& w : c.value(u"caption").toObject().value(u"words").toArray()) {
            s->captionWords.push_back(
                CaptionWord{w.toObject().value(u"startMs").toDouble(0), w.toObject().value(u"endMs").toDouble(0)});
        }
    }
    if (c.value(u"matte").isObject()) {
        const QJsonObject m = c.value(u"matte").toObject();
        const QString mode = m.value(u"mode").toString();
        if (mode == u"alpha" || mode == u"luma") s->matteSource = m.value(u"sourceClipId").toString().toStdString();
    }
    if (c.value(u"generatedMatte").isObject()) {
        const QString status = c.value(u"generatedMatte").toObject().value(u"status").toString(QStringLiteral("ready"));
        s->generatedMatte = status == u"ready";
    }
    s->hasTextStyle = c.value(u"textStyle").isObject();
    s->hasShapeStyle = c.value(u"shapeStyle").isObject();
    s->hasModel3dStyle = c.value(u"model3dStyle").isObject();
    s->text = c.value(u"textStyle").toObject().value(u"text").toString();
    s->currentAssetId = c.value(u"currentAssetId").toString().toStdString();
    if (c.value(u"transitionIn").isObject()) {
        const QJsonObject t = c.value(u"transitionIn").toObject();
        if (t.value(u"direction").isString()) s->transitionDirection = t.value(u"direction").toString().toStdString();
        if (t.value(u"color").isString()) s->transitionColor = t.value(u"color").toString().toStdString();
        if (t.value(u"softness").isDouble()) s->transitionSoftness = t.value(u"softness").toDouble();
    }
    return s;
}

std::shared_ptr<const SequenceScene> parseSequenceScene(const QJsonObject& seq) {
    auto s = std::make_shared<SequenceScene>();
    if (seq.value(u"camera2d").isObject()) {
        const QJsonObject c = seq.value(u"camera2d").toObject();
        Camera2D cam;
        cam.x = c.value(u"position").toObject().value(u"x").toDouble(0);
        cam.y = c.value(u"position").toObject().value(u"y").toDouble(0);
        cam.depthPx = c.value(u"depthPx").toDouble(0);
        cam.focalLengthPx = c.value(u"focalLengthPx").toDouble(1);
        cam.focusDepthPx = optNumber(c.value(u"focusDepthPx"));
        cam.aperturePx = optNumber(c.value(u"aperturePx"));
        for (const QJsonValue& kv : c.value(u"keyframes").toArray()) {
            const QJsonObject k = kv.toObject();
            CameraKeyframe kf;
            kf.timeMs = k.value(u"timeMs").toDouble(0);
            kf.x = k.value(u"position").toObject().value(u"x").toDouble(0);
            kf.y = k.value(u"position").toObject().value(u"y").toDouble(0);
            kf.depthPx = k.value(u"depthPx").toDouble(0);
            kf.focusDepthPx = optNumber(k.value(u"focusDepthPx"));
            kf.aperturePx = optNumber(k.value(u"aperturePx"));
            cam.keyframes.push_back(kf);
        }
        std::stable_sort(cam.keyframes.begin(), cam.keyframes.end(),
                         [](const CameraKeyframe& a, const CameraKeyframe& b) { return a.timeMs < b.timeMs; });
        s->camera2d = cam;
    }
    return s;
}

}  // namespace nt::scene
