#include "render2d/LayerStyle.h"
#include "render2d/Paint.h"
#include "render2d/Rasterizer.h"
#include "scene/TextAnimation.h"
#include <QJsonArray>
#include <QRegularExpression>
#include <algorithm>
#include <cmath>
#include <unordered_map>

namespace nt::render2d {
namespace {
QJsonValue trackValue(const QJsonObject& track, double t) {
    const auto frames = track.value(u"keyframes").toArray();
    if (frames.isEmpty()) {
        return {};
    }
    if (t <= frames.first().toObject().value(u"t").toDouble()) {
        return frames.first().toObject().value(u"value");
    }
    for (qsizetype i = 1; i < frames.size(); ++i) {
        const auto end = frames[i].toObject(), start = frames[i - 1].toObject();
        const double endT = end.value(u"t").toDouble(), startT = start.value(u"t").toDouble();
        if (t > endT) {
            continue;
        }
        const double progress = endT == startT ? 1
                                               : scene::ease(end.value(u"easing").toString("linear").toStdString(),
                                                             std::clamp((t - startT) / (endT - startT), 0.0, 1.0));
        const auto a = start.value(u"value"), b = end.value(u"value");
        if (a.isDouble() && b.isDouble()) {
            return a.toDouble() + (b.toDouble() - a.toDouble()) * progress;
        }
        if (a.isString() && b.isString()) {
            if (track.value(u"target").toString().endsWith(".d")) {
                static const QRegularExpression token(
                    QStringLiteral("[a-zA-Z]|[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?"));
                auto left = token.globalMatch(a.toString()), right = token.globalMatch(b.toString());
                QStringList out;
                bool compatible = true;
                while (left.hasNext() && right.hasNext()) {
                    const auto x = left.next().captured(), y = right.next().captured();
                    if (x.size() == 1 && x.front().isLetter()) {
                        if (x != y || x.toLower() == "a") {
                            compatible = false;
                            break;
                        }
                        out.append(x);
                    } else {
                        bool okX = false, okY = false;
                        const double xx = x.toDouble(&okX), yy = y.toDouble(&okY);
                        if (!okX || !okY) {
                            compatible = false;
                            break;
                        }
                        out.append(QString::number(xx + (yy - xx) * progress, 'g', 17));
                    }
                }
                if (compatible && !left.hasNext() && !right.hasNext() && !out.isEmpty()) {
                    return out.join(u' ');
                }
                return progress < 1 ? a : b;
            }
            const auto ca = cssColor(a.toString()), cb = cssColor(b.toString());
            const auto channel = [&](int x, int y) {
                return std::clamp(static_cast<int>(std::floor(x + (y - x) * progress + 0.5)), 0, 255);
            };
            const QColor c(channel(ca.red(), cb.red()), channel(ca.green(), cb.green()), channel(ca.blue(), cb.blue()),
                           channel(ca.alpha(), cb.alpha()));
            return QString("#%1%2%3%4")
                .arg(c.red(), 2, 16, QLatin1Char('0'))
                .arg(c.green(), 2, 16, QLatin1Char('0'))
                .arg(c.blue(), 2, 16, QLatin1Char('0'))
                .arg(c.alpha(), 2, 16, QLatin1Char('0'));
        }
        return progress < 1 ? a : b;
    }
    return frames.last().toObject().value(u"value");
}
QJsonObject applyValue(QJsonObject object, const QStringList& path, qsizetype at, const QJsonValue& value) {
    if (at == path.size() - 1) {
        object.insert(path[at], value);
        return object;
    }
    const auto key = path[at];
    if (object.value(key).isArray() && at + 2 < path.size()) {
        auto array = object.value(key).toArray();
        bool ok = false;
        const int index = path[at + 1].toInt(&ok);
        if (ok && index >= 0 && index < array.size()) {
            array.replace(index, applyValue(array[index].toObject(), path, at + 2, value));
            object.insert(key, array);
        }
    } else if (object.value(key).isObject()) {
        object.insert(key, applyValue(object.value(key).toObject(), path, at + 1, value));
    }
    return object;
}
QString unitOf(const QJsonArray& animations) {
    for (const auto& item : animations) {
        const auto a = item.toObject();
        if (a.value(u"enabled") == false) {
            continue;
        }
        const auto stagger = a.value(u"stagger").toObject();
        if (!stagger.isEmpty()) {
            return stagger.value(u"unit").toString("word");
        }
    }
    return "word";
}
int unitCount(const QString& unit, const scene::TextStyle& style, QSize size) {
    if (unit == "line") {
        return static_cast<int>(
            scene::layoutTextBlock(textMeasurer(), style, size.width(), size.height()).lines.size());
    }
    if (unit == "character") {
        static const QRegularExpression ws(QStringLiteral("\\s+"), QRegularExpression::UseUnicodePropertiesOption);
        const auto words = style.text.split(ws, Qt::SkipEmptyParts);
        int count = std::max(0, static_cast<int>(words.size()) - 1);
        for (const auto& word : words) {
            count += scene::graphemeCount(word);
        }
        return count;
    }
    return scene::countWords(style.text);
}
struct Compiled {
    QJsonObject raw;
    QSize size;
    QString unit;
    int count = 0;
    std::vector<scene::CompiledAnimation> animations;
};
const Compiled& compiledFor(const Clip& clip, QSize size) {
    thread_local std::unordered_map<std::string, Compiled> cache;
    if (const auto it = cache.find(clip.id);
        it != cache.end() && it->second.raw == clip.raw && it->second.size == size) {
        return it->second;
    }
    if (cache.size() >= 512) {
        cache.clear();
    }
    Compiled compiled;
    compiled.raw = clip.raw;
    compiled.size = size;
    const auto animations = clip.raw.value(u"animations").toArray();
    compiled.unit = unitOf(animations);
    compiled.count = unitCount(compiled.unit, scene::parseTextStyle(clip.raw.value(u"textStyle").toObject()), size);
    compiled.animations =
        scene::compileAnimations(scene::parseAnimations(animations), clip.durationMs,
                                 {static_cast<double>(size.width()), static_cast<double>(size.height()), compiled.count,
                                  compiled.unit.toStdString()});
    return cache.insert_or_assign(clip.id, std::move(compiled)).first->second;
}
const scene::CompiledAnimation* byId(const Compiled& compiled, const QJsonObject& raw) {
    const auto id = raw.value(u"id").toString().toStdString();
    const auto it = std::ranges::find(compiled.animations, id, &scene::CompiledAnimation::id);
    return it == compiled.animations.end() ? nullptr : &*it;
}
double delayFactor(const QString& from, int count, int index) {
    if (from == "end") {
        return count - 1 - index;
    }
    if (from == "center") {
        return std::floor(std::abs(index - (count - 1) / 2.0));
    }
    return index;
}
scene::CompiledAnimation unitAnimation(const scene::CompiledAnimation& compiled, const QJsonObject& raw,
                                       const Compiled& context, int index, double clipDuration) {
    auto result = compiled;
    result.staggered = false;
    const auto stagger = raw.value(u"stagger").toObject();
    const auto from = stagger.value(u"from").toString("start");
    const double duration = std::max(1.0, raw.value(u"durationMs").toDouble());
    double offset = stagger.value(u"offsetMs").toDouble();
    if (!compiled.loop) {
        const double maxFactor = from == "center" ? std::floor((context.count - 1) / 2.0) : context.count - 1;
        const double available = clipDuration - std::max(0.0, raw.value(u"delayMs").toDouble());
        if (maxFactor > 0 && duration + offset * maxFactor > available) {
            offset = std::max(0.0, (available - duration) / maxFactor);
        }
    }
    const double delay = offset * delayFactor(from, context.count, index);
    if (compiled.loop) {
        result.loopOriginMs = compiled.loopOriginMs.value_or(compiled.windowStartMs) + delay;
    } else {
        result.windowStartMs += delay;
        result.windowEndMs = result.windowStartMs + duration;
    }
    return result;
}
QJsonObject sampleObject(const scene::AnimationSample& s) {
    QJsonObject out{{"offsetX", s.offsetX},         {"offsetY", s.offsetY},   {"scaleX", s.scale * s.scaleX},
                    {"scaleY", s.scale * s.scaleY}, {"rotation", s.rotation}, {"opacity", s.opacity}};
    if (s.positionX) {
        out.insert("positionX", *s.positionX);
    }
    if (s.positionY) {
        out.insert("positionY", *s.positionY);
    }
    if (s.anchorX) {
        out.insert("anchorX", *s.anchorX);
    }
    if (s.anchorY) {
        out.insert("anchorY", *s.anchorY);
    }
    return out;
}
QJsonObject captionAt(const QJsonObject& caption, double localMs, double duration) {
    std::vector<QJsonArray> cues;
    QJsonArray cue;
    for (const auto& value : caption.value(u"words").toArray()) {
        const auto word = value.toObject();
        if (word.value(u"endMs").toDouble() <= 0 || word.value(u"startMs").toDouble() >= duration) {
            continue;
        }
        if (!cue.isEmpty() &&
            (cue.size() >= 10 ||
             word.value(u"startMs").toDouble() - cue.last().toObject().value(u"endMs").toDouble() >= 700)) {
            cues.push_back(cue);
            cue = {};
        }
        cue.append(word);
    }
    if (!cue.isEmpty()) {
        cues.push_back(cue);
    }
    QJsonArray words;
    for (const auto& group : cues) {
        if (localMs < group.first().toObject().value(u"startMs").toDouble() ||
            localMs >= group.last().toObject().value(u"endMs").toDouble()) {
            continue;
        }
        for (const auto& value : group) {
            const auto word = value.toObject();
            words.append(QJsonObject{
                {"text", word.value(u"word")},
                {"active", localMs >= word.value(u"startMs").toDouble() && localMs < word.value(u"endMs").toDouble()}});
        }
        break;
    }
    return {{"words", words}, {"style", caption.value(u"style")}};
}
} // namespace
void decorateLayer(ActiveLayer& layer, const Clip& clip, double timeMs) {
    if (layer.kind != "text" && layer.kind != "shape" && layer.kind != "caption") {
        return;
    }
    double local = timeMs - clip.startMs;
    const auto stepped = clip.raw.value(u"steppedTime").toObject().value(u"fps");
    if (stepped.isDouble() && stepped.toDouble() > 0) {
        const double step = 1000 / stepped.toDouble();
        local = std::floor(std::max(0.0, local) / step) * step;
    }
    if (layer.kind == "caption") {
        layer.ext.insert("caption",
                         captionAt(clip.raw.value(u"caption").toObject(), timeMs - clip.startMs, clip.durationMs));
        return;
    }
    const auto& compiled = compiledFor(clip, {layer.sourceWidth, layer.sourceHeight});
    const auto animations = clip.raw.value(u"animations").toArray();
    auto text = clip.raw.value(u"textStyle").toObject(), shape = clip.raw.value(u"shapeStyle").toObject();
    for (const auto& value : animations) {
        const auto raw = value.toObject();
        const auto* animation = byId(compiled, raw);
        if (!animation || raw.value(u"enabled") == false) {
            continue;
        }
        auto t = scene::animationProgressAt(*animation, local);
        if (!t && !animation->loop && local > animation->windowEndMs) {
            t = 1;
        }
        if (!t) {
            continue;
        }
        for (const auto& track : raw.value(u"styleTracks").toArray()) {
            const auto object = track.toObject();
            const auto parts = object.value(u"target").toString().split(u'.');
            if (parts.size() < 2 || (parts[0] != "text" && parts[0] != "shape")) {
                continue;
            }
            const auto evaluated = trackValue(object, *t);
            if (evaluated.isUndefined()) {
                continue;
            }
            if (parts[0] == "text") {
                text = applyValue(text, parts, 1, evaluated);
            } else {
                shape = applyValue(shape, parts, 1, evaluated);
            }
        }
    }
    if (layer.kind == "shape") {
        if (layer.flexShapeBox) {
            const auto& b = *layer.flexShapeBox;
            shape.insert("x", b[0]);
            shape.insert("y", b[1]);
            shape.insert("width", b[2]);
            shape.insert("height", b[3]);
        }
        const auto sample = scene::sampleAnimations(compiled.animations, local, layer.sourceTimeMs);
        if (sample.trimStart) {
            shape.insert("trimStart", *sample.trimStart);
        }
        if (sample.trimEnd) {
            shape.insert("trimEnd", *sample.trimEnd);
        }
        layer.ext.insert("shapeStyle", shape);
        return;
    }
    const auto animated = scene::animatedTextStyle(scene::parseTextStyle(text), animations, compiled.animations, local);
    text.insert("text", animated.text);
    if (layer.flexTextMaxWidthFrac) {
        text.insert("maxWidthFrac", *layer.flexTextMaxWidthFrac);
    }
    layer.ext.insert("textStyle", text);
    const bool staggered = std::ranges::any_of(compiled.animations, [](const auto& a) { return a.staggered; });
    if (!staggered) {
        return;
    }
    // resolveTextStaggerContext uses the unquantized edit clock. Stepped
    // time applies to block styles/transforms, not the per-word raster.
    const double staggerLocal = timeMs - clip.startMs;
    QJsonArray units;
    for (int index = 0; index < compiled.count; ++index) {
        std::vector<scene::CompiledAnimation> perUnit;
        QJsonObject glyph;
        for (const auto& value : animations) {
            const auto raw = value.toObject();
            const auto* a = byId(compiled, raw);
            if (!a || !a->staggered) {
                continue;
            }
            const auto unit = unitAnimation(*a, raw, compiled, index, clip.durationMs);
            perUnit.push_back(unit);
            const auto t = scene::animationProgressAt(unit, staggerLocal);
            if (!t) {
                continue;
            }
            for (const auto& track : raw.value(u"styleTracks").toArray()) {
                const auto object = track.toObject();
                const auto target = object.value(u"target").toString();
                if (target.startsWith("glyph.")) {
                    glyph.insert(target.mid(6), trackValue(object, *t));
                }
            }
        }
        auto sample = sampleObject(scene::sampleAnimations(perUnit, staggerLocal, layer.sourceTimeMs));
        sample.insert("glyph", glyph);
        units.append(sample);
    }
    layer.ext.insert("unit", compiled.unit);
    layer.ext.insert("units", units);
    for (const auto& raw : animations) {
        const auto a = raw.toObject();
        if (a.value(u"preset") != "typewriter" || !a.value(u"caret").isObject()) {
            continue;
        }
        const auto* c = byId(compiled, a);
        if (!c || !c->staggered) {
            continue;
        }
        const auto caret = a.value(u"caret").toObject();
        const double period = caret.value(u"blinkPeriodMs").toDouble(1000);
        if (local < c->windowEndMs || (period > 0 && std::fmod(local - c->windowEndMs, period) < period / 2)) {
            layer.ext.insert("caret", caret);
        }
    }
}
} // namespace nt::render2d
