#include "preview/SceneEval.h"

#include "scene/ClipScene.h"
#include "scene/FlexLayout.h"
#include "scene/TextAnimation.h"

#include <QJsonArray>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <unordered_map>
#include <unordered_set>

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

constexpr double kPi = 3.14159265358979323846;

const scene::ClipScene& sceneOf(const Clip& clip) {
    static const scene::ClipScene empty;
    return clip.scene ? *clip.scene : empty;
}

bool isActiveAt(const Clip& clip, double timeMs) { return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs; }

double clamp01(double v) { return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v); }

ClipTransform identityTransform() { return ClipTransform{}; }

// ── transitions (transition.ts) ──────────────────────────────────────────

const std::set<std::string>& knownTransitionTypes() {
    static const std::set<std::string> t = {"crossfade", "dipToColor", "wipe",   "push",        "slide", "zoom",
                                            "whip",      "zoomBlur",   "glitch", "gradientWipe", "iris",  "lightLeak"};
    return t;
}

std::string directionOf(const Clip& clip) {
    const auto& d = sceneOf(clip).transitionDirection;
    if (d && (*d == "left" || *d == "right" || *d == "up" || *d == "down")) return *d;
    return "left";
}

Vec2 directionVector(const std::string& d, double amount) {
    if (d == "right") return {amount, 0};
    if (d == "up") return {0, -amount};
    if (d == "down") return {0, amount};
    return {-amount, 0};
}

// `cutEffect` in transition.ts.
std::optional<QJsonObject> cutEffect(const std::string& type, double progress, const Clip& clip) {
    const QJsonObject t = clip.raw.value(u"transitionIn").toObject();
    const auto numeric = [&t](const char* key, double fallback) {
        const QJsonValue v = t.value(QLatin1String(key));
        return v.isDouble() && std::isfinite(v.toDouble()) ? v.toDouble() : fallback;
    };
    const auto angle = [&clip]() {
        const std::string d = directionOf(clip);
        return d == "left" ? 180.0 : d == "right" ? 0.0 : d == "up" ? 270.0 : 90.0;
    };
    const double envelope = std::sin(kPi * clamp01(progress));
    const QString color = t.value(u"color").isString() ? t.value(u"color").toString() : QStringLiteral("#000000");
    if (type == "whip") {
        return QJsonObject{{QStringLiteral("id"), QStringLiteral("transition-whip")}, {QStringLiteral("type"), QStringLiteral("directionalBlur")},
                           {QStringLiteral("enabled"), true}, {QStringLiteral("radius"), numeric("blur", 24) * envelope},
                           {QStringLiteral("angle"), angle()}};
    }
    if (type == "zoomBlur") {
        return QJsonObject{{QStringLiteral("id"), QStringLiteral("transition-zoom-blur")}, {QStringLiteral("type"), QStringLiteral("stylize")},
                           {QStringLiteral("enabled"), true}, {QStringLiteral("mode"), QStringLiteral("zoomBlur")},
                           {QStringLiteral("amount"), numeric("blur", 24) * envelope}, {QStringLiteral("scale"), 8}};
    }
    if (type == "glitch") {
        return QJsonObject{{QStringLiteral("id"), QStringLiteral("transition-glitch")}, {QStringLiteral("type"), QStringLiteral("stylize")},
                           {QStringLiteral("enabled"), true}, {QStringLiteral("mode"), QStringLiteral("glitch")},
                           {QStringLiteral("amount"), numeric("amount", 1) * envelope}, {QStringLiteral("time"), progress},
                           {QStringLiteral("seed"), 7}};
    }
    if (type == "gradientWipe") {
        const QString map = t.value(u"map").toString();
        const double softness = t.value(u"softness").isDouble() ? t.value(u"softness").toDouble() : 0;
        return QJsonObject{{QStringLiteral("id"), QStringLiteral("transition-gradient-wipe")}, {QStringLiteral("type"), QStringLiteral("stylize")},
                           {QStringLiteral("enabled"), true}, {QStringLiteral("mode"), QStringLiteral("gradientWipe")},
                           {QStringLiteral("amount"), clamp01(progress)}, {QStringLiteral("angle"), angle()},
                           {QStringLiteral("time"), map == u"radial" ? 1 : map == u"noise" ? 2 : 0},
                           {QStringLiteral("scale"), numeric("scale", 6)}, {QStringLiteral("seed"), numeric("seed", 0)},
                           {QStringLiteral("softness"), softness != 0 ? softness : 0.1}};
    }
    if (type == "lightLeak") {
        return QJsonObject{{QStringLiteral("id"), QStringLiteral("transition-light-leak")}, {QStringLiteral("type"), QStringLiteral("stylize")},
                           {QStringLiteral("enabled"), true}, {QStringLiteral("mode"), QStringLiteral("lightLeakOverlay")},
                           {QStringLiteral("amount"), envelope * 0.9}, {QStringLiteral("scale"), numeric("scale", 4)},
                           {QStringLiteral("seed"), numeric("seed", 0)}, {QStringLiteral("time"), progress},
                           {QStringLiteral("color"), color == u"#000000" ? QStringLiteral("#ff9f43") : color}};
    }
    return std::nullopt;
}

LayerTransition incomingRecord(const std::string& type, double p, const Clip& clip) {
    LayerTransition r;
    r.type = type;
    r.role = "in";
    r.progress = p;
    const auto& s = sceneOf(clip);
    if (type == "dipToColor") {
        r.opacity = clamp01(2 * p - 1);
        r.solidColor = s.transitionColor.value_or("#000000");
        r.solidOpacity = clamp01(1 - std::abs(2 * p - 1));
    } else if (type == "wipe") {
        r.opacity = 1;
        r.mask = scene::WipeMask{directionOf(clip), s.transitionSoftness.value_or(0), clamp01(p)};
    } else if (type == "gradientWipe") {
        r.opacity = 1;
        r.effect = cutEffect(type, p, clip);
    } else if (type == "push" || type == "slide" || type == "whip") {
        r.opacity = 1;
        r.offset = directionVector(directionOf(clip), 1 - p);
        r.effect = cutEffect(type, p, clip);
    } else if (type == "zoom" || type == "zoomBlur") {
        r.opacity = clamp01(p);
        r.scale = 0.8 + (1 - 0.8) * p;
        r.effect = cutEffect(type, p, clip);
    } else if (type == "iris") {
        r.opacity = 1;
        r.iris = std::make_pair(clamp01(p), s.transitionSoftness.value_or(0));
    } else {  // crossfade, glitch, lightLeak
        r.opacity = clamp01(p);
        r.effect = cutEffect(type, p, clip);
    }
    return r;
}

LayerTransition outgoingRecord(const std::string& type, double p, const Clip& clip) {
    LayerTransition r;
    r.type = type;
    r.role = "out";
    r.progress = p;
    r.opacity = 1;
    if (type == "dipToColor") {
        r.opacity = clamp01(1 - 2 * p);
    } else if (type == "push" || type == "whip") {
        r.offset = directionVector(directionOf(clip), -p);
        r.effect = cutEffect(type, p, clip);
    } else if (type == "zoom" || type == "zoomBlur") {
        r.scale = 1 + (1.25 - 1) * p;
        r.effect = cutEffect(type, p, clip);
    } else if (type == "glitch" || type == "lightLeak") {
        r.effect = cutEffect(type, p, clip);
    }
    return r;
}

struct TransitionPair {
    LayerTransition incoming;
    std::optional<LayerTransition> outgoing;
    const Clip* outgoingClip = nullptr;
};

std::optional<TransitionPair> resolveTransition(const Clip& clip, const std::vector<const Clip*>& siblings, double t) {
    const Clip* partner = nullptr;
    double furthestEnd = clip.startMs;
    for (const Clip* prev : siblings) {
        if (prev == &clip || prev->startMs >= clip.startMs) continue;
        const double prevEnd = prev->startMs + prev->durationMs;
        if (prevEnd <= clip.startMs) continue;
        if (!partner || prevEnd > furthestEnd) {
            partner = prev;
            furthestEnd = prevEnd;
        }
    }
    const double overlapMs = partner ? std::min(furthestEnd - clip.startMs, clip.durationMs) : 0;
    double durationMs;
    if (clip.transitionIn) {
        if (clip.transitionIn->durationMs <= 0) return std::nullopt;
        durationMs = clip.transitionIn->durationMs;
    } else {
        durationMs = overlapMs;
        if (durationMs <= 0) return std::nullopt;
    }
    const double into = t - clip.startMs;
    if (into >= durationMs) return std::nullopt;
    const double raw = clamp01(into / durationMs);
    const double progress =
        clip.transitionIn && !clip.transitionIn->easing.empty() ? scene::ease(clip.transitionIn->easing, raw) : raw;
    std::string type = "crossfade";
    if (clip.transitionIn && knownTransitionTypes().count(clip.transitionIn->type)) type = clip.transitionIn->type;
    TransitionPair pair{incomingRecord(type, progress, clip), std::nullopt, nullptr};
    if (partner) {
        pair.outgoing = outgoingRecord(type, progress, clip);
        pair.outgoingClip = partner;
    }
    return pair;
}

// `resolveDocumentTransitions`: per track and per group parent.
std::unordered_map<std::string, LayerTransition> resolveDocumentTransitions(const std::vector<const Clip*>& clips,
                                                                             double t) {
    std::unordered_set<std::string> groupIds;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Group) groupIds.insert(c->id);
    }
    std::map<std::pair<std::string, std::string>, std::vector<const Clip*>> buckets;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Adjustment || c->hidden || !isActiveAt(*c, t)) continue;
        const std::string& parent = sceneOf(*c).parentId;
        const std::string key = !parent.empty() && groupIds.count(parent) ? parent : std::string("\x01none");
        buckets[{c->trackId, key}].push_back(c);
    }
    std::unordered_map<std::string, LayerTransition> out;
    for (auto& [key, siblings] : buckets) {
        std::stable_sort(siblings.begin(), siblings.end(), [](const Clip* a, const Clip* b) { return a->startMs < b->startMs; });
        for (const Clip* clip : siblings) {
            const auto pair = resolveTransition(*clip, siblings, t);
            if (!pair) continue;
            if (pair->outgoing && pair->outgoingClip) {
                const std::string& id = pair->outgoingClip->id;
                auto it = out.find(id);
                if (it != out.end()) it->second.opacity *= pair->outgoing->opacity;
                else out.emplace(id, *pair->outgoing);
            }
            auto it = out.find(clip->id);
            if (it != out.end()) {
                LayerTransition merged = pair->incoming;
                merged.opacity = pair->incoming.opacity * it->second.opacity;
                it->second = merged;
            } else {
                out.emplace(clip->id, pair->incoming);
            }
        }
    }
    return out;
}

std::optional<ClipTransform> transitionTransform(const std::optional<ClipTransform>& transform,
                                                 const std::optional<LayerTransition>& tr, double w, double h) {
    if (!tr || (!tr->offset && !tr->scale)) return transform;
    const ClipTransform base = transform.value_or(identityTransform());
    ClipTransform out = base;
    out.depthPx.reset();
    out.position.x = base.position.x + (tr->offset ? tr->offset->x * w : 0);
    out.position.y = base.position.y + (tr->offset ? tr->offset->y * h : 0);
    out.scale.x = base.scale.x * tr->scale.value_or(1);
    out.scale.y = base.scale.y * tr->scale.value_or(1);
    return out;
}

// ── camera (spatial.ts) ───────────────────────────────────────────────────

scene::Camera2D sampleCamera(const scene::Camera2D& cam, double t) {
    const auto& f = cam.keyframes;
    if (f.empty()) return cam;
    const auto apply = [&](const scene::CameraKeyframe& k) {
        scene::Camera2D c = cam;
        c.x = k.x;
        c.y = k.y;
        c.depthPx = k.depthPx;
        if (k.focusDepthPx) c.focusDepthPx = k.focusDepthPx;
        if (k.aperturePx) c.aperturePx = k.aperturePx;
        return c;
    };
    if (t <= f.front().timeMs) return apply(f.front());
    if (t >= f.back().timeMs) return apply(f.back());
    for (size_t i = 1; i < f.size(); i++) {
        const auto& end = f[i];
        if (t > end.timeMs) continue;
        const auto& start = f[i - 1];
        const double u = (t - start.timeMs) / (end.timeMs - start.timeMs);
        const auto mix = [u](double a, double b) { return a + (b - a) * u; };
        scene::Camera2D c = cam;
        c.x = mix(start.x, end.x);
        c.y = mix(start.y, end.y);
        c.depthPx = mix(start.depthPx, end.depthPx);
        c.focusDepthPx = mix(start.focusDepthPx.value_or(cam.focusDepthPx.value_or(0)),
                             end.focusDepthPx.value_or(cam.focusDepthPx.value_or(0)));
        c.aperturePx = mix(start.aperturePx.value_or(cam.aperturePx.value_or(0)),
                           end.aperturePx.value_or(cam.aperturePx.value_or(0)));
        return c;
    }
    return cam;
}

// `resolveCamera2D`: the placed transform, and whether depth of field adds a blur.
std::pair<ClipTransform, bool> resolveCamera(const ClipTransform& t, const scene::Camera2D& cam) {
    const double depth = t.depthPx.value_or(0);
    const double distance = std::max(1.0, cam.focalLengthPx - cam.depthPx - depth);
    const double k = cam.focalLengthPx / distance;
    ClipTransform placed = t;
    placed.position = Vec2{(t.position.x - cam.x) * k, (t.position.y - cam.y) * k};
    placed.scale = Vec2{t.scale.x * k, t.scale.y * k};
    const double aperture = cam.aperturePx.value_or(0);
    const double focusDistance = std::max(1.0, cam.focalLengthPx - cam.depthPx - cam.focusDepthPx.value_or(0));
    const double radius = std::min(64.0, aperture * std::abs(distance - focusDistance) / distance);
    return {placed, radius >= 0.5};
}

// ── animation (resolveAnimatedLayerProps) ─────────────────────────────────

double steppedTime(const Clip& clip, double t) {
    const auto& fps = sceneOf(clip).steppedFps;
    if (!fps || !std::isfinite(*fps) || *fps <= 0) return t;
    const double frameMs = 1000 / *fps;
    return clip.startMs + std::floor((t - clip.startMs) / frameMs) * frameMs;
}

scene::CompileContext compileContext(const Clip& clip, double w, double h) {
    scene::CompileContext ctx;
    ctx.canvasWidth = w;
    ctx.canvasHeight = h;
    const auto& s = sceneOf(clip);
    if (clip.mediaType != MediaType::Text || !s.hasTextStyle) return ctx;
    for (const auto& a : *s.animations) {
        if (!a.enabled || !a.staggerUnit) continue;
        const std::string& unit = *a.staggerUnit;
        if (unit != "word" && unit != "character" && unit != "line") continue;
        ctx.staggerUnit = unit;
        if (unit == "word") ctx.staggerCount = scene::countWords(s.text);
        else if (unit == "character") ctx.staggerCount = scene::countCharacters(s.text);
        else ctx.staggerCount = static_cast<int>(s.text.split(u'\n').size());  // not ported: measured wrap
        break;
    }
    return ctx;
}

// `compiledFor`: compiled animations per clip revision. The key is the
// parsed animations (a new parse is a new pointer), the clip duration, the
// canvas size and the stagger context, as in the web's compile cache. Shared
// by the GUI and render threads.
std::shared_ptr<const std::vector<scene::CompiledAnimation>> compiledFor(
    const std::shared_ptr<const std::vector<scene::AnimationDef>>& anims, const Clip& clip, double w, double h) {
    struct Entry {
        std::weak_ptr<const std::vector<scene::AnimationDef>> source;
        double durationMs;
        double w, h;
        std::string staggerUnit;
        int staggerCount;
        std::shared_ptr<const std::vector<scene::CompiledAnimation>> compiled;
    };
    static std::mutex mutex;
    static std::unordered_map<const void*, Entry> cache;
    const scene::CompileContext ctx = compileContext(clip, w, h);
    std::lock_guard lock(mutex);
    const auto it = cache.find(anims.get());
    if (it != cache.end() && it->second.source.lock() == anims && it->second.durationMs == clip.durationMs &&
        it->second.w == w && it->second.h == h && it->second.staggerUnit == ctx.staggerUnit &&
        it->second.staggerCount == ctx.staggerCount) {
        return it->second.compiled;
    }
    if (cache.size() >= 8192) cache.clear();
    auto compiled = std::make_shared<const std::vector<scene::CompiledAnimation>>(
        scene::compileAnimations(*anims, clip.durationMs, ctx));
    cache[anims.get()] = Entry{anims, clip.durationMs, w, h, ctx.staggerUnit, ctx.staggerCount, compiled};
    return compiled;
}

struct AnimatedProps {
    std::optional<ClipTransform> transform;
    double opacity = 1;
    std::optional<scene::WipeMask> mask;
    bool cameraBlur = false;
};

AnimatedProps resolveAnimated(const Clip& clip, const std::optional<ClipTransform>& layerTransform, double opacity,
                              const scene::Camera2D* camera, double timeMs, double w, double h) {
    const double t = steppedTime(clip, timeMs);
    AnimatedProps props;
    props.transform = layerTransform;
    props.opacity = opacity;
    const auto& anims = sceneOf(clip).animations;
    if (!anims->empty()) {
        const auto compiledPtr = compiledFor(anims, clip, w, h);
        const auto& compiled = *compiledPtr;
        if (!compiled.empty()) {
            const auto s = scene::sampleAnimations(compiled, t - clip.startMs, clipSourceMsAt(clip, steppedTime(clip, t)));
            if (!s.isIdentity()) {
                const ClipTransform base = layerTransform.value_or(identityTransform());
                ClipTransform x;
                x.position.x = s.positionX.value_or(base.position.x) + s.offsetX;
                x.position.y = s.positionY.value_or(base.position.y) + s.offsetY;
                x.scale.x = base.scale.x * s.scale * s.scaleX;
                x.scale.y = base.scale.y * s.scale * s.scaleY;
                x.rotation = base.rotation + s.rotation;
                x.anchor = (!s.anchorX && !s.anchorY) ? base.anchor
                                                       : Vec2{s.anchorX.value_or(base.anchor.x), s.anchorY.value_or(base.anchor.y)};
                x.depthPx = base.depthPx;
                if (base.rotationX || s.rotationX != 0) x.rotationX = base.rotationX.value_or(0) + s.rotationX;
                if (base.rotationY || s.rotationY != 0) x.rotationY = base.rotationY.value_or(0) + s.rotationY;
                x.perspective = base.perspective;
                props.transform = x;
                props.opacity = opacity * s.opacity;
                props.mask = s.mask;
            }
        }
    }
    if (camera && props.transform) {
        const auto [placed, blur] = resolveCamera(*props.transform, sampleCamera(*camera, t));
        props.transform = placed;
        props.cameraBlur = blur;
    }
    return props;
}

// ── layoutClipsAt ─────────────────────────────────────────────────────────

// The animated text style of each text clip with animations under a flex
// group: its size moves the tree, so the layout reads it at this frame.
std::unordered_map<std::string, scene::TextStyle> flexTextStylesAt(const std::vector<const Clip*>& clips, double t,
                                                                   double w, double h) {
    std::unordered_map<std::string, scene::TextStyle> out;
    std::unordered_map<std::string, const Clip*> byId;
    for (const Clip* c : clips) byId[c->id] = c;
    const auto inFlexTree = [&](const Clip& clip) {
        std::string cursor = sceneOf(clip).parentId;
        for (int hops = 0; !cursor.empty() && hops < 64; hops++) {
            const auto it = byId.find(cursor);
            if (it == byId.end()) return false;
            if (it->second->raw.value(u"layout").toObject().value(u"display").toString() == u"flex") return true;
            cursor = sceneOf(*it->second).parentId;
        }
        return false;
    };
    for (const Clip* c : clips) {
        const QJsonValue style = c->raw.value(u"textStyle");
        const QJsonArray animations = c->raw.value(u"animations").toArray();
        if (!style.isObject() || animations.isEmpty() || !inFlexTree(*c)) continue;
        const auto& s = sceneOf(*c);
        const auto compiled = compiledFor(s.animations, *c, w, h);
        const double localMs = steppedTime(*c, t) - c->startMs;
        out.emplace(c->id, scene::animatedTextStyle(scene::parseTextStyle(style.toObject()), animations, *compiled, localMs));
    }
    return out;
}

// The layout cache (`layoutCache` in layout.ts): one layout per document
// revision, canvas size and set of animated text styles. A ticker's layout
// changes only when its text does, so playback hits the cache between
// changes. The measurer is the fallback rule everywhere, so it is not part
// of the key. Shared by the GUI and render threads.
struct FlexCacheEntry {
    std::uint64_t revision = 0;
    double w = 0, h = 0;
    std::string textKey;
    std::shared_ptr<const scene::FlexResult> result;
};
std::mutex gFlexMutex;
std::deque<FlexCacheEntry> gFlexCache;  // most recent first
std::atomic<std::uint64_t> gFlexHits{0}, gFlexMisses{0};
constexpr size_t kFlexCacheMax = 64;

// The animated styles as a key: every field the text box reads.
std::string textStylesKey(const std::unordered_map<std::string, scene::TextStyle>& styles) {
    std::vector<const std::pair<const std::string, scene::TextStyle>*> sorted;
    for (const auto& e : styles) sorted.push_back(&e);
    std::sort(sorted.begin(), sorted.end(), [](const auto* a, const auto* b) { return a->first < b->first; });
    QByteArray key;
    const auto num = [&key](const std::optional<double>& v) {
        key += v ? QByteArray::number(*v, 'g', 17) : QByteArray("-");
        key += '\x1f';
    };
    for (const auto* e : sorted) {
        const scene::TextStyle& s = e->second;
        key += QByteArray::fromStdString(e->first) + '\x1f' + s.text.toUtf8() + '\x1f' + s.align.toUtf8() + '\x1f' +
               s.verticalAlign.toUtf8() + '\x1f';
        num(s.fontSizePx);
        num(s.lineHeight);
        num(s.letterSpacingPx);
        num(s.maxWidthFrac);
        key += '\x1e';
    }
    return key.toStdString();
}

std::shared_ptr<const scene::FlexResult> flexLayoutFor(const Timeline& timeline, const std::vector<const Clip*>& clips,
                                                       double t, double w, double h) {
    const auto styles = flexTextStylesAt(clips, t, w, h);
    if (timeline.revision == 0) {
        gFlexMisses.fetch_add(1, std::memory_order_relaxed);
        return std::make_shared<const scene::FlexResult>(scene::resolveClipLayouts(clips, w, h, styles));
    }
    const std::string key = textStylesKey(styles);
    {
        std::lock_guard lock(gFlexMutex);
        for (auto it = gFlexCache.begin(); it != gFlexCache.end(); ++it) {
            if (it->revision == timeline.revision && it->w == w && it->h == h && it->textKey == key) {
                FlexCacheEntry hit = *it;
                gFlexCache.erase(it);
                gFlexCache.push_front(hit);
                gFlexHits.fetch_add(1, std::memory_order_relaxed);
                return hit.result;
            }
        }
    }
    gFlexMisses.fetch_add(1, std::memory_order_relaxed);
    auto result = std::make_shared<const scene::FlexResult>(scene::resolveClipLayouts(clips, w, h, styles));
    std::lock_guard lock(gFlexMutex);
    gFlexCache.push_front(FlexCacheEntry{timeline.revision, w, h, key, result});
    if (gFlexCache.size() > kFlexCacheMax) gFlexCache.pop_back();
    return result;
}

// ── temporal.ts ───────────────────────────────────────────────────────────

std::vector<const Clip*> expandTemporal(const std::vector<Clip>& clips, std::deque<Clip>& store) {
    std::vector<const Clip*> out;
    out.reserve(clips.size());
    for (const Clip& clip : clips) {
        const auto& s = sceneOf(clip);
        std::vector<const Clip*> instances{&clip};
        if (s.repeater) {
            const auto& r = *s.repeater;
            const int count = r.count;
            const int columns = r.columns.value_or(count);
            for (int index = 1; index < count; index++) {
                Clip copy = clip;
                const ClipTransform base = clip.transform.value_or(identityTransform());
                const int column = index % columns;
                const int row = index / columns;
                ClipTransform x = base;
                x.position.x = base.position.x + column * r.stepX + row * r.rowStepX;
                x.position.y = base.position.y + column * r.stepY + row * r.rowStepY;
                copy.transform = x;
                copy.id = clip.id + ":repeat:" + std::to_string(index);
                copy.name = clip.name + " " + std::to_string(index + 1);
                copy.startMs = clip.startMs + index * r.timeStepMs;
                auto cs = std::make_shared<scene::ClipScene>(s);
                cs->repeater.reset();
                if (index * r.hueDegrees != 0 || index * r.brightness != 0) cs->anyEnabledEffect = true;
                copy.scene = cs;
                store.push_back(std::move(copy));
                instances.push_back(&store.back());
            }
        }
        for (const Clip* instance : instances) {
            out.push_back(instance);
            const auto& is = sceneOf(*instance);
            if (!is.temporalEcho) continue;
            const auto& echo = *is.temporalEcho;
            for (int index = echo.copies; index >= 1; index--) {
                Clip copy = *instance;
                copy.id = instance->id + ":echo:" + std::to_string(index);
                copy.startMs = instance->startMs + index * echo.intervalMs;
                copy.opacity = instance->opacity * std::pow(echo.opacityDecay, index);
                auto cs = std::make_shared<scene::ClipScene>(is);
                cs->repeater.reset();
                cs->temporalEcho.reset();
                copy.scene = cs;
                store.push_back(std::move(copy));
                out.push_back(&store.back());
            }
        }
    }
    return out;
}

// ── groups (resolveGroups) ────────────────────────────────────────────────

struct Precomposite {
    double opacity = 1;
    std::string blendMode;
    bool effects = false;
    std::optional<LayerTransition> transition;
    std::string parentSurfaceId;
};

struct ResolvedGroup {
    std::optional<Mat4> matrix;
    double opacity = 1;
    double windowStart = 0, windowEnd = 0;
    bool cycle = false;
    std::string surfaceId;
    std::optional<Precomposite> precomposite;
    bool cameraApplied = false;
};

std::unordered_map<std::string, ResolvedGroup> resolveGroups(
    const std::vector<const Clip*>& clips, double t, double w, double h,
    const std::unordered_map<std::string, LayerTransition>& transitions, const scene::Camera2D* camera) {
    std::unordered_map<std::string, const Clip*> groupById;
    std::vector<std::string> order;
    for (const Clip* c : clips) {
        if (c->mediaType != MediaType::Group) continue;
        if (!groupById.count(c->id)) order.push_back(c->id);
        groupById[c->id] = c;
    }
    std::unordered_set<std::string> adjusted;
    for (const Clip* c : clips) {
        if (c->mediaType != MediaType::Adjustment || sceneOf(*c).parentId.empty()) continue;
        if (isActiveAt(*c, t)) adjusted.insert(sceneOf(*c).parentId);
    }
    std::unordered_map<std::string, ResolvedGroup> resolved;
    for (const std::string& gid : order) {
        if (resolved.count(gid)) continue;
        std::vector<const Clip*> chain;
        std::unordered_set<std::string> walked;
        const Clip* cursor = groupById[gid];
        bool cycle = false;
        while (cursor && !resolved.count(cursor->id)) {
            if (walked.count(cursor->id)) {
                cycle = true;
                break;
            }
            walked.insert(cursor->id);
            chain.push_back(cursor);
            const std::string& p = sceneOf(*cursor).parentId;
            const auto it = p.empty() ? groupById.end() : groupById.find(p);
            cursor = it == groupById.end() ? nullptr : it->second;
        }
        std::optional<ResolvedGroup> inherited;
        if (cursor) inherited = resolved[cursor->id];
        for (int i = static_cast<int>(chain.size()) - 1; i >= 0; i--) {
            const Clip& current = *chain[i];
            const std::optional<ResolvedGroup> parent = cycle ? std::nullopt : inherited;
            ResolvedGroup entry;
            entry.windowStart = std::max(current.startMs, parent ? parent->windowStart : -INFINITY);
            entry.windowEnd = std::min(current.startMs + current.durationMs, parent ? parent->windowEnd : INFINITY);
            if (t < entry.windowStart || t >= entry.windowEnd) {
                entry.opacity = 0;
                entry.cycle = cycle;
                resolved[current.id] = entry;
                inherited = entry;
                continue;
            }
            const AnimatedProps own = resolveAnimated(current, current.transform, current.opacity, nullptr, t, w, h);
            const bool spatial = camera && !(parent && parent->cameraApplied) && own.transform && own.transform->depthPx;
            std::optional<ClipTransform> placed = own.transform;
            bool dofBlur = false;
            if (spatial) {
                const auto [x, blur] = resolveCamera(*own.transform, sampleCamera(*camera, t));
                placed = x;
                dofBlur = blur;
            }
            const auto trIt = transitions.find(current.id);
            const std::optional<LayerTransition> transition =
                trIt == transitions.end() ? std::nullopt : std::optional<LayerTransition>(trIt->second);
            const auto& cs = sceneOf(current);
            const bool precompose = adjusted.count(current.id) || transition ||
                                    (current.transitionIn && current.transitionIn->durationMs > 0) ||
                                    cs.blendMode != "normal" || cs.anyEnabledEffect || dofBlur;
            const double folded = (parent ? parent->opacity : 1) * own.opacity;
            entry.opacity = precompose ? 1 : folded;
            entry.cameraApplied = spatial || (parent && parent->cameraApplied);
            entry.matrix = buildTransformMatrix(placed.value_or(identityTransform()), Vec2{1, 1}, w, h,
                                                parent ? parent->matrix : std::nullopt);
            entry.cycle = cycle;
            if (precompose) {
                entry.surfaceId = current.id;
                Precomposite pc;
                pc.opacity = clamp01(folded * (transition ? transition->opacity : 1));
                pc.blendMode = cs.blendMode;
                pc.effects = cs.anyEnabledEffect || dofBlur;
                pc.transition = transition;
                pc.parentSurfaceId = parent ? parent->surfaceId : std::string();
                entry.precomposite = pc;
            } else {
                entry.surfaceId = parent ? parent->surfaceId : std::string();
            }
            resolved[current.id] = entry;
            inherited = entry;
        }
    }
    return resolved;
}

std::optional<std::string> effectiveAssetId(const Clip& clip) {
    if (clip.status == "generated" || clip.status == "stale" || clip.status == "locked" || clip.status == "generating") {
        if (clip.raw.contains(u"currentAssetId")) return sceneOf(clip).currentAssetId;
    }
    return std::nullopt;
}

double depthOf(const Clip& c) { return c.transform && c.transform->depthPx ? *c.transform->depthPx : 0.0; }
bool isEcho(const Clip& c) { return c.id.find(":echo:") != std::string::npos; }

bool drawOrderLess(const Clip* a, const Clip* b) {
    const double depth = depthOf(*a) - depthOf(*b);
    if (depth != 0) return depth < 0;
    const int ae = isEcho(*a) ? 0 : 1;
    const int be = isEcho(*b) ? 0 : 1;
    if (ae != be) return ae < be;
    return a->startMs < b->startMs;
}

QJsonArray matrixJson(const Mat4& m) {
    QJsonArray a;
    for (float v : m) a.append(static_cast<double>(v));
    return a;
}

QJsonObject transitionJson(const LayerTransition& t) {
    QJsonObject o{{QStringLiteral("type"), QString::fromStdString(t.type)},
                  {QStringLiteral("role"), QString::fromStdString(t.role)},
                  {QStringLiteral("progress"), t.progress},
                  {QStringLiteral("opacity"), t.opacity}};
    if (t.scale) o.insert(QStringLiteral("scale"), *t.scale);
    if (t.offset) o.insert(QStringLiteral("offset"), QJsonObject{{QStringLiteral("x"), t.offset->x}, {QStringLiteral("y"), t.offset->y}});
    if (t.mask) {
        o.insert(QStringLiteral("mask"), QJsonObject{{QStringLiteral("direction"), QString::fromStdString(t.mask->direction)},
                                                     {QStringLiteral("progress"), t.mask->progress},
                                                     {QStringLiteral("softness"), t.mask->softness}});
    }
    if (t.solidColor) {
        o.insert(QStringLiteral("solid"), QJsonObject{{QStringLiteral("color"), QString::fromStdString(*t.solidColor)},
                                                      {QStringLiteral("opacity"), t.solidOpacity}});
    }
    if (t.effect) o.insert(QStringLiteral("effect"), *t.effect);
    if (t.iris) {
        o.insert(QStringLiteral("iris"), QJsonObject{{QStringLiteral("progress"), t.iris->first},
                                                     {QStringLiteral("softness"), t.iris->second}});
    }
    return o;
}

}  // namespace

double fadeShapeGain(const std::string& shape, double t) {
    const double x = clamp01(t);
    if (shape == "sCurve") return (1.0 - std::cos(x * kPi)) / 2.0;
    if (shape == "plus3dB") return std::sin(x * kPi / 2.0);
    if (shape == "minus3dB") return (2.0 / kPi) * std::asin(x);
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

FlexCacheStats flexLayoutCacheStats() {
    return FlexCacheStats{gFlexHits.load(std::memory_order_relaxed), gFlexMisses.load(std::memory_order_relaxed)};
}

std::unordered_map<std::string, double> transitionOpacitiesAt(const Timeline& timeline, double timeMs) {
    std::vector<const Clip*> clips;
    for (const Clip& c : timeline.clips) clips.push_back(&c);
    std::unordered_map<std::string, double> out;
    for (const auto& [id, tr] : resolveDocumentTransitions(clips, timeMs)) out.emplace(id, tr.opacity);
    return out;
}

Vec2 containBaseScale(double layerWidth, double layerHeight, double canvasWidth, double canvasHeight) {
    if (canvasWidth == 0 || canvasHeight == 0 || layerWidth == 0 || layerHeight == 0) return Vec2{1, 1};
    const double canvasAspect = canvasWidth / canvasHeight;
    const double layerAspect = layerWidth / layerHeight;
    if (layerAspect > canvasAspect) return Vec2{1, canvasAspect / layerAspect};
    return Vec2{layerAspect / canvasAspect, 1};
}

Mat4 buildTransformMatrix(const ClipTransform& t, Vec2 base, double width, double height, const std::optional<Mat4>& parent) {
    // Every store rounds to float, as into the web's Float32Array; every
    // expression reads the rounded values back as doubles.
    Mat4 m{};
    const auto f = [](double v) { return static_cast<float>(v); };
    const auto d = [&m](int i) { return static_cast<double>(m[i]); };
    const double sx = base.x * t.scale.x;
    const double sy = base.y * t.scale.y;
    const double cosR = std::cos(t.rotation);
    const double sinR = -std::sin(t.rotation);
    const double aspect = width > 0 && height > 0 ? width / height : 1;
    const double r00 = cosR;
    const double r01 = -sinR / aspect;
    const double r10 = sinR * aspect;
    const double r11 = cosR;
    const double tx = width == 0 ? 0 : (t.position.x / width) * 2;
    const double ty = height == 0 ? 0 : -(t.position.y / height) * 2;
    const double ax = (t.anchor.x - 0.5) * 2;
    const double ay = (t.anchor.y - 0.5) * 2;
    m[0] = f(r00 * sx);
    m[1] = f(r10 * sx);
    m[4] = f(r01 * sy);
    m[5] = f(r11 * sy);
    m[10] = 1;
    m[12] = f(tx + ax - (d(0) * ax + d(4) * ay));
    m[13] = f(ty + ay - (d(1) * ax + d(5) * ay));
    m[15] = 1;
    const double rx = t.rotationX.value_or(0) * kPi / 180;
    const double ry = t.rotationY.value_or(0) * kPi / 180;
    if (rx != 0 || ry != 0) {
        const double cosX = std::cos(rx);
        const double sinX = std::sin(rx);
        const double cosY = std::cos(ry);
        const double sinY = std::sin(ry);
        const double xFromX = cosY * sx;
        const double yFromX = -aspect * sinX * sinY * sx;
        const double yFromY = cosX * sy;
        m[0] = f(r00 * xFromX + r01 * yFromX);
        m[1] = f(r10 * xFromX + r11 * yFromX);
        m[4] = f(r01 * yFromY);
        m[5] = f(r11 * yFromY);
        if (t.perspective && *t.perspective > 0) {
            m[3] = f(cosX * sinY * sx * width / (2 * *t.perspective));
            m[7] = f(sinX * sy * height / (2 * *t.perspective));
        }
        m[12] = f(tx + ax - (d(0) * ax + d(4) * ay));
        m[13] = f(ty + ay - (d(1) * ax + d(5) * ay));
        m[15] = f(1 - d(3) * ax - d(7) * ay);
    }
    if (parent) {
        const Mat4& p = *parent;
        if (m[3] != 0 || m[7] != 0 || p[3] != 0 || p[7] != 0) {
            Mat4 r{};
            for (int col = 0; col < 4; col++) {
                for (int row = 0; row < 4; row++) {
                    for (int k = 0; k < 4; k++) {
                        r[col * 4 + row] = f(static_cast<double>(r[col * 4 + row]) +
                                             static_cast<double>(p[k * 4 + row]) * static_cast<double>(m[col * 4 + k]));
                    }
                }
            }
            m = r;
        } else {
            const double a0 = m[0], a1 = m[1], a4 = m[4], a5 = m[5], a12 = m[12], a13 = m[13];
            const double p0 = p[0], p1 = p[1], p4 = p[4], p5 = p[5], p12 = p[12], p13 = p[13];
            m[0] = f(p0 * a0 + p4 * a1);
            m[1] = f(p1 * a0 + p5 * a1);
            m[4] = f(p0 * a4 + p4 * a5);
            m[5] = f(p1 * a4 + p5 * a5);
            m[12] = f(p0 * a12 + p4 * a13 + p12);
            m[13] = f(p1 * a12 + p5 * a13 + p13);
        }
    }
    return m;
}

Mat4 layerDrawMatrix(const ActiveLayer& layer, int sourceWidth, int sourceHeight, int canvasWidth, int canvasHeight) {
    if (layer.kind == "caption") {
        return buildTransformMatrix(identityTransform(), Vec2{1, 1}, canvasWidth, canvasHeight);
    }
    const auto placed = transitionTransform(layer.transform, layer.transition, canvasWidth, canvasHeight);
    return buildTransformMatrix(placed.value_or(identityTransform()),
                                containBaseScale(sourceWidth, sourceHeight, canvasWidth, canvasHeight), canvasWidth,
                                canvasHeight, layer.parentMatrix);
}

std::array<float, 16> layerMatrix(const ClipTransform& transform, int sourceWidth, int sourceHeight, int canvasWidth,
                                  int canvasHeight) {
    if (canvasWidth <= 0 || canvasHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return Mat4{};
    return buildTransformMatrix(transform, containBaseScale(sourceWidth, sourceHeight, canvasWidth, canvasHeight),
                                canvasWidth, canvasHeight);
}

SceneFrame evaluateScene(const Timeline& timeline, double timeMs) {
    const double W = timeline.width;
    const double H = timeline.height;
    const scene::Camera2D* camera =
        timeline.scene && timeline.scene->camera2d ? &*timeline.scene->camera2d : nullptr;

    std::deque<Clip> store;
    const std::vector<const Clip*> clips = expandTemporal(timeline.clips, store);
    const auto transitions = resolveDocumentTransitions(clips, timeMs);
    // Flex layout (layout.ts) over every clip, active or not. A laid-out
    // group places its children from its resolved transform; a nested flex
    // container with its position zeroed, since its children's boxes already
    // hold its translation (`groupPatchedFor`).
    std::shared_ptr<const scene::FlexResult> flex;
    if (scene::hasFlexLayout(clips)) flex = flexLayoutFor(timeline, clips, timeMs, W, H);
    std::vector<const Clip*> groupClips = clips;
    if (flex && !flex->transforms.empty()) {
        for (const Clip*& c : groupClips) {
            if (c->mediaType != MediaType::Group) continue;
            const auto it = flex->transforms.find(c->id);
            if (it == flex->transforms.end()) continue;
            Clip patched = *c;
            patched.transform = it->second;
            if (patched.raw.value(u"layout").toObject().value(u"display").toString() == u"flex") {
                patched.transform->position = Vec2{0, 0};
            }
            store.push_back(std::move(patched));
            c = &store.back();
        }
    }
    const auto groups = resolveGroups(groupClips, timeMs, W, H, transitions, camera);

    std::unordered_map<std::string, const Clip*> clipById;
    std::unordered_map<std::string, std::vector<const Clip*>> clipsByTrack;
    for (const Clip* c : clips) {
        clipById[c->id] = c;
        clipsByTrack[c->trackId].push_back(c);
    }
    std::unordered_set<std::string> matteSources;
    for (const Clip* c : clips) {
        const auto& src = sceneOf(*c).matteSource;
        if (!src) continue;
        const auto it = clipById.find(*src);
        if (it == clipById.end() || it->second->mediaType == MediaType::Adjustment) continue;
        matteSources.insert(*src);
    }

    struct Pending {
        ActiveLayer layer;
        const Clip* clip;
        std::optional<ClipTransform> transform;  // before animation
        bool camera = false;
    };
    std::vector<Pending> media;
    std::vector<Pending> captions;
    std::unordered_map<std::string, Pending> matteLayers;
    SceneFrame frame;
    // In the order the walk finds them, like the web's Set: equal sort keys
    // keep this order (collectPrecomposites).
    std::vector<std::string> usedSurfaces;
    std::unordered_set<std::string> usedSeen;
    int videoCount = 0;
    int model3dCount = 0;

    std::vector<const Track*> tracks;
    for (const Track& t : timeline.tracks) tracks.push_back(&t);
    std::stable_sort(tracks.begin(), tracks.end(), [](const Track* a, const Track* b) { return a->index < b->index; });

    for (const Track* track : tracks) {
        if (!track->visible) continue;
        const bool isVisual = track->type == TrackType::Video || track->type == TrackType::Overlay;
        std::vector<const Clip*> active;
        for (const Clip* c : clipsByTrack[track->id]) {
            if (c->mediaType == MediaType::Group || c->mediaType == MediaType::Adjustment) continue;
            if (c->hidden && !matteSources.count(c->id)) continue;
            if (!isActiveAt(*c, timeMs)) continue;
            active.push_back(c);
        }
        std::stable_sort(active.begin(), active.end(), [](const Clip* a, const Clip* b) { return a->startMs < b->startMs; });
        std::stable_sort(active.begin(), active.end(), drawOrderLess);

        for (const Clip* clipPtr : active) {
            const Clip& clip = *clipPtr;
            const auto& cs = sceneOf(clip);
            const ResolvedGroup* parent = nullptr;
            if (!cs.parentId.empty()) {
                const auto it = groups.find(cs.parentId);
                if (it != groups.end()) parent = &it->second;
            }
            if (parent && (timeMs < parent->windowStart || timeMs >= parent->windowEnd)) continue;
            if (parent && !parent->surfaceId.empty() && usedSeen.insert(parent->surfaceId).second) {
                usedSurfaces.push_back(parent->surfaceId);
            }

            const auto trIt = transitions.find(clip.id);
            const std::optional<LayerTransition> transition =
                trIt == transitions.end() ? std::nullopt : std::optional<LayerTransition>(trIt->second);
            const double fade = (clip.fadeInMs == 0.0 && clip.fadeOutMs == 0.0) ? 1.0 : clipFadeGain(clip, timeMs - clip.startMs);
            const double parentOpacity = parent ? parent->opacity : 1.0;
            const double opacity = clamp01(clip.opacity * parentOpacity * (transition ? transition->opacity : 1.0) * fade);

            ActiveLayer base;
            base.clipId = clip.id;
            base.trackId = clip.trackId;
            base.label = clip.name;
            base.mediaType = clip.mediaType;
            base.trackIndex = track->index;
            base.clipTimeMs = timeMs - clip.startMs;
            base.sourceTimeMs = clipSourceMsAt(clip, steppedTime(clip, timeMs));
            base.opacity = opacity;
            base.blendMode = cs.blendMode;
            if (parent) base.parentMatrix = parent->matrix;
            if (parent) base.precomposeGroupId = parent->surfaceId;
            base.transition = transition;
            base.sourceWidth = clip.width.value_or(timeline.width);
            base.sourceHeight = clip.height.value_or(timeline.height);
            base.mediaPath = clip.mediaPath;
            base.assetId = effectiveAssetId(clip);
            const bool cameraHere = !(base.parentMatrix && parent && parent->cameraApplied);

            if (cs.hasCaption && !matteSources.count(clip.id)) {
                // A caption layer is pushed straight, so it carries no camera.
                Pending p{base, &clip, clip.transform, false};
                p.layer.kind = "caption";
                p.layer.trackIndex = kCaptionTrackIndex;
                p.layer.mediaPath.clear();
                captions.push_back(std::move(p));
            }
            if (!isVisual) continue;
            if (clip.mediaType == MediaType::Audio || clip.mediaType == MediaType::Midi) continue;

            const auto emitLayer = [&](const std::string& kind) {
                Pending p{base, &clip, clip.transform, cameraHere};
                p.layer.kind = kind;
                if (flex) {
                    const auto t = flex->transforms.find(clip.id);
                    if (t != flex->transforms.end()) p.transform = t->second;
                    const auto size = flex->sizes.find(clip.id);
                    if (size != flex->sizes.end() && W > 0 && H > 0) {
                        if (clip.mediaType == MediaType::Shape && cs.hasShapeStyle) {
                            p.layer.flexShapeBox = std::array<double, 4>{0, 0, size->second.width / W, size->second.height / H};
                        } else if (clip.mediaType == MediaType::Text && cs.hasTextStyle) {
                            p.layer.flexTextMaxWidthFrac = std::min(1.0, std::max(0.05, size->second.width / W));
                        }
                    }
                }
                if (matteSources.count(clip.id)) matteLayers.emplace(clip.id, std::move(p));
                else media.push_back(std::move(p));
            };
            if (clip.mediaType == MediaType::Text) {
                if (cs.hasTextStyle) emitLayer("text");
                continue;
            }
            if (clip.mediaType == MediaType::Shape) {
                if (cs.hasShapeStyle) emitLayer("shape");
                continue;
            }
            if (clip.mediaType == MediaType::Model3d) {
                if (!cs.hasModel3dStyle) continue;
                if (effectiveAssetId(clip)) {
                    if (model3dCount >= kMaxModel3dLayers) {
                        frame.dropped.push_back({clip.id, "model3d_layer_cap"});
                        continue;
                    }
                    model3dCount += 1;
                }
                emitLayer("model3d");
                continue;
            }
            const auto assetId = effectiveAssetId(clip);
            if (cs.hasCaption && !assetId) continue;
            if (clip.mediaType == MediaType::Image) {
                emitLayer("image");
                continue;
            }
            if (assetId && !assetId->empty() && !matteSources.count(clip.id)) {
                if (videoCount >= kMaxVideoLayers) {
                    frame.dropped.push_back({clip.id, "video_layer_cap"});
                    continue;
                }
                videoCount += 1;
            }
            emitLayer("video");
        }
    }

    // attachMattes: a layer whose matte source drew nothing is dropped.
    std::vector<Pending> drawn;
    for (Pending& p : media) {
        const auto& cs = sceneOf(*p.clip);
        if (!cs.generatedMatte && cs.matteSource && !matteLayers.count(*cs.matteSource)) {
            const auto it = clipById.find(*cs.matteSource);
            if (it != clipById.end() && it->second->mediaType != MediaType::Adjustment) {
                frame.dropped.push_back({p.clip->id, "matte_source_inactive"});
                continue;
            }
        }
        drawn.push_back(std::move(p));
    }

    // collectPrecomposites
    if (!usedSurfaces.empty()) {
        std::vector<std::string> needed;
        std::unordered_set<std::string> neededSeen;
        for (const std::string& id : usedSurfaces) {
            std::string cursor = id;
            while (!cursor.empty() && neededSeen.insert(cursor).second) {
                needed.push_back(cursor);
                const auto it = groups.find(cursor);
                cursor = it != groups.end() && it->second.precomposite ? it->second.precomposite->parentSurfaceId : std::string();
            }
        }
        std::unordered_map<std::string, int> trackIndexById;
        for (const Track& t : timeline.tracks) trackIndexById[t.id] = t.index;
        const auto depthOfSurface = [&](const std::string& id) {
            int depth = 0;
            auto it = groups.find(id);
            std::string cursor = it != groups.end() && it->second.precomposite ? it->second.precomposite->parentSurfaceId : "";
            while (!cursor.empty()) {
                depth += 1;
                it = groups.find(cursor);
                cursor = it != groups.end() && it->second.precomposite ? it->second.precomposite->parentSurfaceId : "";
            }
            return depth;
        };
        std::vector<std::pair<PrecompositeLayer, double>> out;  // with the group's start
        for (const std::string& id : needed) {
            const auto g = groups.find(id);
            const auto c = clipById.find(id);
            if (g == groups.end() || !g->second.precomposite || c == clipById.end()) continue;
            const auto& pc = *g->second.precomposite;
            PrecompositeLayer layer;
            layer.clipId = id;
            const auto ti = trackIndexById.find(c->second->trackId);
            layer.trackIndex = ti != trackIndexById.end() ? ti->second : kCaptionTrackIndex;
            layer.z = trackZ(layer.trackIndex);
            layer.opacity = pc.opacity;
            layer.blendMode = pc.blendMode;
            layer.effects = pc.effects;
            layer.transition = pc.transition;
            layer.precomposeGroupId = pc.parentSurfaceId;
            out.emplace_back(layer, c->second->startMs);
        }
        std::stable_sort(out.begin(), out.end(), [&](const auto& a, const auto& b) {
            const int depth = depthOfSurface(b.first.clipId) - depthOfSurface(a.first.clipId);
            if (depth != 0) return depth < 0;
            const int track = b.first.trackIndex - a.first.trackIndex;
            if (track != 0) return track < 0;
            return a.second < b.second;
        });
        for (auto& [layer, start] : out) frame.precomposites.push_back(std::move(layer));
    }
    if (!frame.precomposites.empty()) {
        // stackOrderOf: every clip's bottom-to-top order on its track.
        std::unordered_map<std::string, int> stackOrder;
        for (const Track& t : timeline.tracks) {
            std::vector<const Clip*> ordered;
            for (const Clip* c : clipsByTrack[t.id]) {
                if (c->mediaType != MediaType::Adjustment) ordered.push_back(c);
            }
            std::stable_sort(ordered.begin(), ordered.end(), drawOrderLess);
            for (size_t i = 0; i < ordered.size(); i++) stackOrder[ordered[i]->id] = static_cast<int>(i);
        }
        for (Pending& p : drawn) {
            const auto it = stackOrder.find(p.clip->id);
            if (it != stackOrder.end()) p.layer.stackOrder = it->second;
        }
        for (PrecompositeLayer& g : frame.precomposites) {
            const auto it = stackOrder.find(g.clipId);
            if (it != stackOrder.end()) g.stackOrder = it->second;
        }
    }

    std::unordered_map<std::string, const PrecompositeLayer*> surfaceById;
    for (const PrecompositeLayer& g : frame.precomposites) surfaceById[g.clipId] = &g;
    const auto finish = [&](Pending& p) {
        const AnimatedProps a = resolveAnimated(*p.clip, p.transform, p.layer.opacity, p.camera ? camera : nullptr, timeMs, W, H);
        p.layer.transform = a.transform;
        p.layer.opacity = a.opacity;
        p.layer.mask = a.mask;
        p.layer.z = trackZ(p.layer.trackIndex);
        double draw = a.opacity;
        std::string surface = p.layer.precomposeGroupId;
        for (int hops = 0; !surface.empty() && hops < 64; hops++) {
            const auto it = surfaceById.find(surface);
            if (it == surfaceById.end()) break;
            draw *= it->second->opacity;
            surface = it->second->precomposeGroupId;
        }
        p.layer.drawOpacity = draw;
        frame.layers.push_back(std::move(p.layer));
    };
    for (Pending& p : drawn) finish(p);
    for (Pending& p : captions) finish(p);
    std::stable_sort(frame.layers.begin(), frame.layers.end(),
                     [](const ActiveLayer& a, const ActiveLayer& b) { return a.z < b.z; });
    for (PrecompositeLayer& g : frame.precomposites) {
        for (const ActiveLayer& l : frame.layers) {
            if (l.precomposeGroupId == g.clipId) g.children.push_back(l.clipId);
        }
        for (const PrecompositeLayer& inner : frame.precomposites) {
            if (inner.precomposeGroupId == g.clipId) g.children.push_back(inner.clipId);
        }
    }
    return frame;
}

std::vector<ActiveLayer> activeLayersAt(const Timeline& timeline, double timeMs) {
    return evaluateScene(timeline, timeMs).layers;
}

FramePlan buildFramePlan(const Timeline& timeline, double timeMs) {
    SceneFrame frame = evaluateScene(timeline, timeMs);
    FramePlan plan;
    plan.timeMs = timeMs;
    for (ActiveLayer& layer : frame.layers) {
        PlanLayer pl;
        pl.matrix = layerDrawMatrix(layer, layer.sourceWidth, layer.sourceHeight, timeline.width, timeline.height);
        pl.layer = std::move(layer);
        plan.layers.push_back(std::move(pl));
    }
    plan.precomposites = std::move(frame.precomposites);
    plan.dropped = std::move(frame.dropped);
    return plan;
}

QJsonObject framePlanJson(const FramePlan& plan) {
    QJsonArray layers;
    for (const PlanLayer& pl : plan.layers) {
        const ActiveLayer& l = pl.layer;
        QJsonObject o{{QStringLiteral("clipId"), QString::fromStdString(l.clipId)},
                      {QStringLiteral("kind"), QString::fromStdString(l.kind)},
                      {QStringLiteral("trackIndex"), l.trackIndex},
                      {QStringLiteral("z"), l.z},
                      {QStringLiteral("opacity"), l.opacity},
                      {QStringLiteral("blendMode"), QString::fromStdString(l.blendMode)},
                      {QStringLiteral("sourceTimeMs"), l.sourceTimeMs},
                      {QStringLiteral("drawOpacity"), l.drawOpacity},
                      {QStringLiteral("matrix"), matrixJson(pl.matrix)}};
        if (l.stackOrder) o.insert(QStringLiteral("stackOrder"), *l.stackOrder);
        if (l.assetId) o.insert(QStringLiteral("assetId"), QString::fromStdString(*l.assetId));
        if (!l.precomposeGroupId.empty()) o.insert(QStringLiteral("precomposeGroupId"), QString::fromStdString(l.precomposeGroupId));
        if (l.flexShapeBox) {
            const auto& box = *l.flexShapeBox;
            o.insert(QStringLiteral("flexShapeBox"), QJsonArray{box[0], box[1], box[2], box[3]});
        }
        if (l.flexTextMaxWidthFrac) o.insert(QStringLiteral("flexTextMaxWidthFrac"), *l.flexTextMaxWidthFrac);
        if (l.transition) o.insert(QStringLiteral("transition"), transitionJson(*l.transition));
        if (l.mask) {
            o.insert(QStringLiteral("mask"), QJsonObject{{QStringLiteral("direction"), QString::fromStdString(l.mask->direction)},
                                                         {QStringLiteral("progress"), l.mask->progress},
                                                         {QStringLiteral("softness"), l.mask->softness}});
        }
        if (l.transform) {
            const ClipTransform& t = *l.transform;
            QJsonObject x{{QStringLiteral("position"), QJsonObject{{QStringLiteral("x"), t.position.x}, {QStringLiteral("y"), t.position.y}}},
                          {QStringLiteral("scale"), QJsonObject{{QStringLiteral("x"), t.scale.x}, {QStringLiteral("y"), t.scale.y}}},
                          {QStringLiteral("rotation"), t.rotation},
                          {QStringLiteral("anchor"), QJsonObject{{QStringLiteral("x"), t.anchor.x}, {QStringLiteral("y"), t.anchor.y}}}};
            if (t.rotationX) x.insert(QStringLiteral("rotationX"), *t.rotationX);
            if (t.rotationY) x.insert(QStringLiteral("rotationY"), *t.rotationY);
            if (t.perspective) x.insert(QStringLiteral("perspective"), *t.perspective);
            if (t.depthPx) x.insert(QStringLiteral("depthPx"), *t.depthPx);
            o.insert(QStringLiteral("transform"), x);
        }
        layers.append(o);
    }
    QJsonArray precomposites;
    for (const PrecompositeLayer& g : plan.precomposites) {
        QJsonObject o{{QStringLiteral("clipId"), QString::fromStdString(g.clipId)},
                      {QStringLiteral("trackIndex"), g.trackIndex},
                      {QStringLiteral("z"), g.z},
                      {QStringLiteral("opacity"), g.opacity},
                      {QStringLiteral("blendMode"), QString::fromStdString(g.blendMode)},
                      {QStringLiteral("effects"), g.effects}};
        if (g.stackOrder) o.insert(QStringLiteral("stackOrder"), *g.stackOrder);
        if (!g.precomposeGroupId.empty()) o.insert(QStringLiteral("precomposeGroupId"), QString::fromStdString(g.precomposeGroupId));
        if (g.transition) o.insert(QStringLiteral("transition"), transitionJson(*g.transition));
        QJsonArray children;
        for (const std::string& c : g.children) children.append(QString::fromStdString(c));
        o.insert(QStringLiteral("children"), children);
        precomposites.append(o);
    }
    QJsonArray dropped;
    for (const DroppedLayer& d : plan.dropped) {
        dropped.append(QJsonObject{{QStringLiteral("clipId"), QString::fromStdString(d.clipId)},
                                   {QStringLiteral("reason"), QString::fromStdString(d.reason)}});
    }
    return QJsonObject{{QStringLiteral("timeMs"), plan.timeMs},
                       {QStringLiteral("layers"), layers},
                       {QStringLiteral("precomposites"), precomposites},
                       {QStringLiteral("dropped"), dropped}};
}

}  // namespace nt
