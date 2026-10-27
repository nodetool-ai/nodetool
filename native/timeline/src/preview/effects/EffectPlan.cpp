#include "preview/effects/ClipEffects.h"
#include "preview/layers/SceneHooks.h"
#include "render2d/Paint.h"
#include "scene/ClipScene.h"
#include <QRegularExpression>
#include <algorithm>
#include <bit>
#include <cmath>
#include <limits>
#include <numbers>
#include <span>
#include <unordered_map>

namespace nt::effects {
namespace {
double number(const QJsonObject &e, const char *key, double fallback = 0) {
    return e.value(QLatin1String(key)).toDouble(fallback);
}
float f(const QJsonObject &e, const char *key, double fallback = 0) {
    return static_cast<float>(number(e, key, fallback));
}
std::array<float, 3> color(const QJsonObject &e, const char *key = "color", const char *fallback = "") {
    auto c = render2d::cssColor(e.value(QLatin1String(key)).toString(QLatin1String(fallback)));
    if (!c.isValid()) {
        c = Qt::black;
    }
    return {float(c.redF()), float(c.greenF()), float(c.blueF())};
}
struct Point {
    double x, y;
};
std::vector<Point> readPoints(const QJsonArray &points) {
    std::vector<Point> result;
    for (const auto &value : points) {
        const auto p = value.toObject();
        if (p.value("x").isDouble() && p.value("y").isDouble() && std::isfinite(number(p, "x")) &&
            std::isfinite(number(p, "y"))) {
            result.push_back({number(p, "x"), number(p, "y")});
        }
    }
    return result;
}
double sample(const std::vector<Point> &points, double x) {
    if (points.empty()) {
        return x;
    }
    if (x <= points.front().x) {
        return points.front().y;
    }
    if (x >= points.back().x) {
        return points.back().y;
    }
    for (size_t i = 1; i < points.size(); ++i) {
        const auto a = points[i - 1], b = points[i];
        if (x > b.x) {
            continue;
        }
        return b.x <= a.x ? b.y : a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y);
    }
    return points.back().y;
}
double midtone(double y) { return std::clamp(std::log(0.5) / std::log(std::clamp(y, 0.001, 0.999)) - 1, -0.9, 9.0); }
} // namespace
std::uint16_t cubeHalfBits(float value) {
    const auto bits = std::bit_cast<std::uint32_t>(value);
    const auto sign = (bits >> 16) & 0x8000;
    const int exponent = int((bits >> 23) & 0xff) - 112;
    const auto fraction = bits & 0x7fffff;
    if (exponent <= 0) {
        if (exponent < -10) {
            return std::uint16_t(sign);
        }
        const auto subnormal = (fraction | 0x800000) >> (1 - exponent);
        return std::uint16_t(sign | ((subnormal + 0x1000) >> 13));
    }
    if (exponent >= 31) {
        return std::uint16_t(sign | 0x7bff);
    }
    return std::uint16_t(sign | ((std::uint32_t(exponent) << 10) + ((fraction + 0x1000) >> 13)));
}
std::optional<Cube> parseCube(const QString &text) {
    Cube cube;
    for (const auto &raw : text.split('\n')) {
        const auto line = raw.section('#', 0, 0).trimmed();
        if (line.isEmpty()) {
            continue;
        }
        const auto parts = line.split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
        const auto head = parts[0].toUpper();
        if (head == "TITLE") {
            continue;
        }
        if (head == "LUT_1D_SIZE") {
            return {};
        }
        if (head == "LUT_3D_SIZE") {
            bool ok = false;
            const double size = parts.value(1).toDouble(&ok);
            if (!ok || parts.size() != 2 || size < 2 || size > 64 || std::floor(size) != size) {
                return {};
            }
            cube.size = int(size);
            continue;
        }
        const bool minimum = head == "DOMAIN_MIN", maximum = head == "DOMAIN_MAX";
        const int offset = minimum || maximum ? 1 : 0;
        if (parts.size() != offset + 3 || (!offset && cube.size == 0)) {
            return {};
        }
        std::array<float, 3> triplet{};
        for (int c = 0; c < 3; ++c) {
            bool ok = false;
            const double value = parts[c + offset].toDouble(&ok);
            if (!ok || !std::isfinite(value) || !std::isfinite(float(value))) {
                return {};
            }
            triplet[c] = float(value);
        }
        if (minimum) {
            cube.minimum = triplet;
        } else if (maximum) {
            cube.maximum = triplet;
        } else {
            cube.rgb.insert(cube.rgb.end(), triplet.begin(), triplet.end());
            if (cube.rgb.size() > size_t(cube.size * cube.size * cube.size * 3)) {
                return {};
            }
        }
    }
    if (!cube.size || cube.rgb.size() != size_t(cube.size * cube.size * cube.size * 3)) {
        return {};
    }
    for (int c = 0; c < 3; ++c) {
        if (cube.maximum[c] <= cube.minimum[c]) {
            return {};
        }
    }
    return cube;
}
CurveKnobs fitCurve(const QJsonArray &values) {
    auto points = readPoints(values);
    std::stable_sort(points.begin(), points.end(), [](auto a, auto b) { return a.x < b.x; });
    if (points.size() < 2) {
        return {};
    }
    CurveKnobs knobs;
    for (const auto p : points) {
        if (p.y <= 0.001) {
            knobs.black = std::clamp(p.x, 0.0, 1.0);
        }
    }
    for (auto p = points.rbegin(); p != points.rend(); ++p) {
        if (p->y >= 0.999) {
            knobs.white = std::clamp(p->x, 0.0, 1.0);
        }
    }
    if (knobs.white - knobs.black < 0.01) {
        return {};
    }
    const auto at = [&](double u) {
        return std::clamp(sample(points, knobs.black + u * (knobs.white - knobs.black)), 0.0, 1.0);
    };
    knobs.midtones = midtone(at(0.5));
    const double gamma = 1 / (1 + knobs.midtones);
    knobs.shadows = std::clamp((std::pow(at(0.25), 1 / gamma) - 0.25) / 0.1875, -1.0, 1.0);
    const double bent = std::pow(std::clamp(0.75 + knobs.shadows * 0.75 * 0.25, 0.0, 1.0), gamma);
    const double room = bent * (1 - bent);
    knobs.highlights = room > 0.001 ? std::clamp((at(0.75) - bent) / room, -1.0, 1.0) : 0;
    return knobs;
}
double channelMidtones(const QJsonArray &values) {
    const auto points = readPoints(values);
    return points.size() < 2 ? 0 : midtone(std::clamp(sample(points, 0.5), 0.0, 1.0));
}
std::vector<Pass> planChain(const QJsonArray &effects, const QJsonArray &trackEffects) {
    std::vector<Pass> result;
    QJsonArray combined = effects;
    QJsonObject sharpen, vignette, chromaKey;
    for (const auto &value : trackEffects) {
        const auto e = value.toObject();
        if (!e.value("enabled").toBool()) { continue; }
        const auto type = e.value("type").toString();
        if (type == "color" || type == "blur") { combined.append(e); }
        else if (type == "sharpen" && sharpen.isEmpty()) { sharpen = e; }
        else if (type == "vignette" && vignette.isEmpty()) { vignette = e; }
        else if (type == "chromaKey" && chromaKey.isEmpty()) { chromaKey = e; }
    }
    if (number(chromaKey, "tolerance") > 0.001) { result = planChain({chromaKey}); }
    std::array<double, 8> grade{0, 1, 1, 0, 0, 0, 0, 0};
    double radius = 0;
    for (const auto &value : combined) {
        const auto e = value.toObject();
        if (!e.value("enabled").toBool()) {
            continue;
        }
        const auto type = e.value("type").toString();
        Pass p;
        auto &v = p.params;
        if (type == "color") {
            constexpr std::array keys{"brightness",  "contrast", "saturation", "hue",
                                      "temperature", "tint",     "shadows",    "highlights"};
            for (size_t i = 0; i < keys.size(); ++i) {
                if (i == 1 || i == 2) {
                    grade[i] *= number(e, keys[i], 1);
                } else {
                    grade[i] += number(e, keys[i]);
                }
            }
            continue;
        }
        if (type == "blur") {
            radius += number(e, "radius");
            continue;
        }
        if (type == "stylize" || type == "generator") {
            constexpr std::array stylize{"rgbSplit", "radialBlur", "zoomBlur", "turbulence", "glitch", "halftone",
                                         "dither", "lightRays", "lensFlare", "innerShadow", "innerGlow", "edgeHighlight",
                                         "displacement", "gradientWipe", "lightLeakOverlay"};
            constexpr std::array generator{"noise", "fractal", "conicGradient", "meshGradient", "gradientField",
                                           "particles", "lightLeak", "gridPattern"};
            const bool generated = type == "generator";
            const auto modes = generated ? std::span<const char *const>(generator) : std::span<const char *const>(stylize);
            const auto found = std::ranges::find_if(modes, [&](const char *mode) { return e.value("mode") == mode; });
            if (found == modes.end()) {
                continue;
            }
            p.op = Op::VisualFx;
            v = {float(std::distance(modes.begin(), found) + (generated ? 15 : 0)),
                 f(e, "amount", generated ? 1 : 0.5), f(e, "scale", 8),
                 float(number(e, "angle") * std::numbers::pi / 180), f(e, "time"), f(e, "seed"),
                 generated ? 0.1f : f(e, "softness", 0.1)};
            const auto a = generated ? color(e, "colorA", "#101a33") : std::array<float, 3>{};
            const auto b = generated ? color(e, "colorB", "#ffb45e") : color(e, "color", "#ffffff");
            std::ranges::copy(a, v.begin() + 8);
            std::ranges::copy(b, v.begin() + 12);
            v[11] = v[15] = 1;
        } else if (type == "pixelate") {
            p.op = Op::Pixelate;
            v[0] = f(e, "cellSize", 8);
        } else if (type == "posterize") {
            p.op = Op::Posterize;
            v[0] = f(e, "levels", 4);
        } else if (type == "directionalBlur") {
            p.op = Op::Gaussian;
            v[0] = f(e, "radius");
            v[1] = std::max(0.001f, v[0] / 3);
            const double angle = number(e, "angle") * std::numbers::pi / 180;
            v[2] = float(std::cos(angle));
            v[3] = float(std::sin(angle));
        } else if (type == "lensDistortion") {
            p.op = Op::Spherize;
            v[0] = f(e, "amount");
        } else if (type == "vignette") {
            p.op = Op::Vignette;
            v[0] = f(e, "amount");
            v[1] = f(e, "radius", 0.9);
            v[2] = f(e, "softness", 0.5);
        } else if (type == "sharpen") {
            p.op = Op::Sharpen;
            v[0] = f(e, "amount");
            v[1] = f(e, "threshold");
        } else if (type == "chromaKey") {
            p.op = Op::ChromaKey;
            const auto rgb = color(e);
            std::copy(rgb.begin(), rgb.end(), v.begin());
            v[3] = f(e, "tolerance");
            v[4] = f(e, "softness", 0.1);
            v[5] = f(e, "spill", 0.5);
        } else if (type == "curves") {
            p.op = Op::Curves;
            const auto c = fitCurve(e.value("master").toArray());
            v = {float(c.black),
                 float(c.white),
                 float(c.shadows),
                 float(c.midtones),
                 float(c.highlights),
                 float(channelMidtones(e.value("r").toArray())),
                 float(channelMidtones(e.value("g").toArray())),
                 float(channelMidtones(e.value("b").toArray()))};
        } else if (type == "levels") {
            p.op = Op::Levels;
            v[0] = f(e, "inBlack");
            v[1] = f(e, "gamma", 1);
            v[2] = f(e, "inWhite", 1);
            result.push_back(p);
            const float slope = f(e, "outWhite", 1) - f(e, "outBlack");
            if (std::abs(slope - 1) > 0.001 || std::abs(f(e, "outBlack")) > 0.001) {
                p.op = Op::Cdl;
                p.params = {slope, f(e, "outBlack")};
                result.push_back(p);
            }
            continue;
        } else if (type == "liftGammaGain") {
            p.op = Op::LiftGammaGain;
            constexpr std::array keys{"lift", "gamma", "gain"};
            for (size_t i = 0; i < keys.size(); ++i) {
                const auto triple = e.value(QLatin1String(keys[i])).toArray();
                for (int c = 0; c < 3; ++c) {
                    v[i * 4 + c] = float(triple.at(c).toDouble(i == 0 ? 0 : 1));
                }
            }
        } else if (type == "grain") {
            p.op = Op::Grain;
            v = {f(e, "amount"), f(e, "size", 1),        f(e, "colorAmount"),
                 f(e, "seed"),   f(e, "roughness", 0.5), f(e, "softness", 0.25)};
        } else if (type == "lut") {
            p.op = Op::Lut;
            p.cube = e.value("cube").toString();
            v[0] = f(e, "intensity", 1);
        } else if (type == "glow" || type == "dropShadow") {
            const bool glow = type == "glow";
            p.op = glow ? Op::Threshold : Op::AlphaMask;
            v = {0.7f, 0.1f};
            result.push_back(p);
            p.op = Op::Gaussian;
            p.params = {f(e, glow ? "radius" : "blur"), 0, 1, 0};
            result.push_back(p);
            p.params[2] = 0;
            p.params[3] = 1;
            result.push_back(p);
            p.params = {};
            p.op = glow ? Op::Add : Op::Shadow;
            if (glow) {
                v[0] = f(e, "intensity", 1);
            } else {
                const auto rgb = color(e);
                std::copy(rgb.begin(), rgb.end(), v.begin());
                v[3] = f(e, "opacity", 1);
                v[4] = f(e, "offsetX");
                v[5] = f(e, "offsetY");
            }
            result.push_back(p);
            continue;
        } else {
            continue;
        }
        result.push_back(p);
    }
    bool active = false;
    for (size_t i = 0; i < grade.size(); ++i) {
        if (i == 3) {
            grade[i] = std::fmod(std::fmod(grade[i], 360) + 540, 360) - 180;
        } else {
            grade[i] = std::clamp(grade[i], i == 1 || i == 2 ? 0.0 : -1.0, i == 1 || i == 2 ? 4.0 : 1.0);
        }
        active = active || std::abs(grade[i] - (i == 1 || i == 2 ? 1 : 0)) > 0.001;
    }
    if (active) {
        Pass p;
        p.op = Op::Grade;
        std::transform(grade.begin(), grade.end(), p.params.begin(), [](double x) { return float(x); });
        result.push_back(p);
    }
    radius = std::min(256.0, radius);
    if (radius >= 0.5) {
        Pass p;
        p.op = Op::Gaussian;
        p.params = {float(radius), float(radius / 3), 1, 0};
        result.push_back(p);
        p.params[2] = 0;
        p.params[3] = 1;
        result.push_back(p);
    }
    for (const auto &e : {sharpen, vignette}) {
        if (number(e, "amount") > 0.001) {
            const auto passes = planChain({e});
            result.insert(result.end(), passes.begin(), passes.end());
        }
    }
    return result;
}
QMargins chainOutset(const QJsonArray &effects) {
    double margin = 0;
    for (const auto &value : effects) {
        const auto e = value.toObject();
        if (!e.value("enabled").toBool()) {
            continue;
        }
        if (e.value("type") == "glow") {
            margin += std::max(0.0, number(e, "radius")) * 3;
        } else if (e.value("type") == "dropShadow") {
            margin += std::max(std::abs(number(e, "offsetX")), std::abs(number(e, "offsetY"))) +
                      std::max(0.0, number(e, "blur")) * 3;
        }
    }
    // Keep malformed documents from overflowing QSize before the compositor validates it.
    const int px = int(std::min(std::ceil(margin), double(std::numeric_limits<int>::max() / 4)));
    return {px, px, px, px};
}
QRect cropPixels(const QJsonObject &ext, QSize size) {
    const auto rect = ext.value("effectSourceRect").toArray();
    if (rect.size() != 4) {
        return {{0, 0}, size};
    }
    std::array<float, 4> uv{};
    for (int i = 0; i < 4; ++i) {
        uv[i] = float(rect[i].toDouble());
    }
    const auto [w, h] = croppedSourceSize(uv, size.width(), size.height());
    return {int(std::floor(double(uv[0]) * size.width())), int(std::floor(double(uv[1]) * size.height())), w, h};
}
void decorateEffects(QJsonObject &ext, const Clip &clip, double timeMs) {
    QJsonArray enabled;
    for (const auto &effect : clip.raw.value("effects").toArray()) {
        auto e = effect.toObject();
        if (e.value("enabled").toBool()) {
            if ((e.value("type") == "stylize" || e.value("type") == "generator") && e.value("animate").toBool()) {
                e.insert("time", timeMs / 1000);
            }
            enabled.append(e);
        }
    }
    ext.insert("clipEffects", enabled);
}
void decorateEffects(QJsonObject &ext, const Clip &clip, const SceneDecorationContext &context) {
    decorateEffects(ext, clip, context.sequenceTimeMs);
    auto enabled = ext.value("clipEffects").toArray();
    for (auto value = enabled.begin(); value != enabled.end(); ++value) {
        auto e = value->toObject();
        if (e.value("type") == "grain" && e.value("animate").toBool()) {
            e.insert("seed", static_cast<double>(context.frameIndex));
            *value = e;
        }
    }
    ext.insert("clipEffects", enabled);
}
namespace {
QJsonValue interpolateStyle(const QJsonValue &from, const QJsonValue &to, double t, bool path) {
    if (from.isDouble() && to.isDouble()) { return from.toDouble() + (to.toDouble() - from.toDouble()) * t; }
    if (from.isString() && to.isString()) {
        if (path) {
            static const QRegularExpression token("[a-zA-Z]|[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?");
            const auto tokens = [&](const QString &value) {
                QStringList result;
                auto matches = token.globalMatch(value);
                while (matches.hasNext()) { result.push_back(matches.next().captured()); }
                return result;
            };
            const auto left = tokens(from.toString()), right = tokens(to.toString());
            if (!left.isEmpty() && left.size() == right.size()) {
                QStringList result;
                for (qsizetype i = 0; i < left.size(); ++i) {
                    if (left[i].size() == 1 && left[i][0].isLetter()) {
                        if (left[i] != right[i] || left[i].toLower() == "a") { return t < 1 ? from : to; }
                        result.push_back(left[i]);
                    } else {
                        bool validFrom = false, validTo = false;
                        const double a = left[i].toDouble(&validFrom), b = right[i].toDouble(&validTo);
                        if (!validFrom || !validTo || !std::isfinite(a + b)) { return t < 1 ? from : to; }
                        result.push_back(QString::number(a + (b - a) * t, 'g', 17));
                    }
                }
                return result.join(' ');
            }
        } else {
            const auto a = render2d::cssColor(from.toString()), b = render2d::cssColor(to.toString());
            if (a.isValid() && b.isValid()) {
                QString result = "#";
                for (const auto &[start, end] : {std::pair{a.redF(), b.redF()}, {a.greenF(), b.greenF()},
                                                {a.blueF(), b.blueF()}, {a.alphaF(), b.alphaF()}}) {
                    const int channel = std::clamp(int(std::floor((start + (end - start) * t) * 255 + 0.5)), 0, 255);
                    result += QString::number(channel, 16).rightJustified(2, '0');
                }
                return result;
            }
        }
    }
    return t < 1 ? from : to;
}
}

bool decorateAdjustment(SceneAdjustment &adjustment, const Clip &clip, const SceneDecorationContext &context) {
    Clip animated = clip;
    auto effects = clip.raw.value("effects").toArray();
    auto mask = clip.raw.value("mask").toObject();
    const auto definitions = scene::parseAnimations(clip.raw.value("animations").toArray());
    const auto compiled = scene::compileAnimations(definitions, clip.durationMs,
        {double(context.timeline.width), double(context.timeline.height)});
    const double localMs = context.timeMs - clip.startMs;
    std::unordered_map<std::string, const scene::CompiledAnimation *> byId;
    for (const auto &animation : compiled) { byId[animation.id] = &animation; }
    std::unordered_map<std::string, qsizetype> effectById;
    for (qsizetype i = 0; i < effects.size(); ++i) {
        effectById.emplace(effects[i].toObject().value("id").toString().toStdString(), i);
    }
    // Style tracks replace authored knobs before the additive animation channels.
    for (const auto &value : clip.raw.value("animations").toArray()) {
        const auto animation = value.toObject();
        if (!animation.value("enabled").toBool(true)) { continue; }
        const auto id = animation.value("id").toString().toStdString();
        const auto found = byId.find(id);
        if (found == byId.end()) { continue; }
        const auto &window = *found->second;
        auto progress = scene::animationProgressAt(window, localMs);
        if (!progress && !window.loop && localMs > window.windowEndMs) { progress = 1; }
        if (!progress) { continue; }
        for (const auto &trackValue : animation.value("styleTracks").toArray()) {
            const auto track = trackValue.toObject();
            const auto parts = track.value("target").toString().split('.');
            const auto frames = track.value("keyframes").toArray();
            if (frames.isEmpty()) { continue; }
            QJsonValue sampled = frames.last().toObject().value("value");
            if (*progress <= frames.first().toObject().value("t").toDouble()) {
                sampled = frames.first().toObject().value("value");
            } else {
                for (qsizetype i = 1; i < frames.size(); ++i) {
                    const auto end = frames[i].toObject(), start = frames[i - 1].toObject();
                    const double b = end.value("t").toDouble(), a = start.value("t").toDouble();
                    if (*progress > b) { continue; }
                    const double t = scene::ease(end.value("easing").toString("linear").toStdString(),
                        b == a ? 1 : std::clamp((*progress - a) / (b - a), 0., 1.));
                    const auto from = start.value("value"), to = end.value("value");
                    sampled = interpolateStyle(from, to, t, track.value("target").toString().endsWith(".d"));
                    break;
                }
            }
            if (parts.size() == 2 && parts[0] == "mask" && !mask.isEmpty()) {
                mask.insert(parts[1], sampled);
            } else if (parts.size() == 3 && parts[0] == "effect") {
                const auto foundEffect = effectById.find(parts[1].toStdString());
                if (foundEffect == effectById.end()) { continue; }
                auto effect = effects[foundEffect->second].toObject();
                if (!effect.contains(parts[2])) { continue; }
                effect.insert(parts[2], sampled);
                effects[foundEffect->second] = effect;
            }
        }
    }
    const auto sample = scene::sampleAnimations(compiled, localMs, clipSourceMsAt(clip, context.timeMs));
    if (sample.brightness != 0 || sample.saturation != 1 || sample.contrast != 1 || sample.hue != 0 ||
        sample.temperature != 0 || sample.tint != 0) {
        effects.append(QJsonObject{{"id", "anim-color"}, {"type", "color"}, {"enabled", true},
            {"brightness", sample.brightness}, {"saturation", sample.saturation}, {"contrast", sample.contrast},
            {"hue", sample.hue}, {"temperature", sample.temperature}, {"tint", sample.tint}});
    }
    if (sample.blur > 0) {
        effects.append(QJsonObject{{"id", "anim-blur"}, {"type", "blur"}, {"enabled", true}, {"radius", sample.blur}});
    }
    animated.raw.insert("effects", effects);
    decorateEffects(adjustment.ext, animated, context);
    if (adjustment.ext.value("clipEffects").toArray().isEmpty()) { return false; }
    adjustment.ext.insert("adjustmentTreatment", true);
    if (!mask.isEmpty()) { adjustment.ext.insert("shapeMask", mask); }
    return true;
}

void decorateTrackEffects(QJsonObject &ext, const Track *track) {
    QJsonArray converted;
    if (track) {
        for (const auto &value : track->raw.value("effects").toArray()) {
            const auto raw = value.toObject();
            if (!raw.value("enabled").toBool()) { continue; }
            const auto type = raw.value("type").toString();
            QJsonObject e{{"id", raw.value("id")}, {"enabled", true}};
            const auto copy = [&](std::initializer_list<const char *> keys) {
                for (const auto *key : keys) {
                    if (raw.contains(QLatin1String(key))) { e.insert(QLatin1String(key), raw.value(QLatin1String(key))); }
                }
            };
            if (type == "colorCorrection") {
                e.insert("type", "color");
                copy({"brightness", "contrast", "saturation", "hue", "temperature", "tint", "shadows", "highlights"});
            } else if (type == "videoBlur") {
                e.insert("type", "blur");
                copy({"radius"});
            } else if (type == "sharpen") {
                e.insert("type", type);
                copy({"amount", "threshold"});
            } else if (type == "vignette") {
                e.insert("type", type);
                e.insert("amount", raw.value("intensity"));
                copy({"radius", "softness"});
            } else if (type == "chromaKey") {
                e.insert("type", type);
                e.insert("color", raw.value("keyColor"));
                copy({"tolerance", "softness", "spill"});
            } else {
                continue;
            }
            converted.append(e);
        }
    }
    ext.insert("trackEffects", converted);
}
} // namespace nt::effects
