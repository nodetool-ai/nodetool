#include "preview/transitions/TransitionResolver.h"

#include "scene/ClipScene.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <unordered_set>

namespace nt {
namespace {
constexpr double kPi = 3.14159265358979323846;

const scene::ClipScene& sceneOf(const Clip& clip) {
    static const scene::ClipScene empty;
    return clip.scene ? *clip.scene : empty;
}

bool isActiveAt(const Clip& clip, double timeMs) { return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs; }
double clamp01(double v) { return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v); }
}  // namespace

namespace transitions::detail {
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

}  // namespace transitions::detail

std::optional<TransitionPair> resolveTransition(const Clip& clip, const Clip* partner, double t) {
    const double overlapMs = partner ? std::min(partner->startMs + partner->durationMs - clip.startMs, clip.durationMs) : 0;
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
    if (clip.transitionIn && transitions::detail::knownTransitionTypes().count(clip.transitionIn->type)) type = clip.transitionIn->type;
    TransitionPair pair{transitions::detail::incomingRecord(type, progress, clip), std::nullopt, nullptr};
    if (partner) {
        pair.outgoing = transitions::detail::outgoingRecord(type, progress, clip);
        pair.outgoingClip = partner;
    }
    return pair;
}

std::unordered_map<std::string, LayerTransition> resolveDocumentTransitions(std::span<const Clip* const> clips, double t) {
    std::unordered_set<std::string> groupIds;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Group) {
            groupIds.insert(c->id);
        }
    }
    std::map<std::pair<std::string, std::string>, std::vector<const Clip*>> buckets;
    for (const Clip* c : clips) {
        if (c->mediaType == MediaType::Adjustment || c->hidden || !isActiveAt(*c, t)) {
            continue;
        }
        const std::string& parent = sceneOf(*c).parentId;
        const std::string key = !parent.empty() && groupIds.count(parent) ? parent : std::string("\x01none");
        buckets[{c->trackId, key}].push_back(c);
    }
    std::unordered_map<std::string, LayerTransition> out;
    for (auto& [key, siblings] : buckets) {
        std::stable_sort(siblings.begin(), siblings.end(), [](const Clip* a, const Clip* b) { return a->startMs < b->startMs; });
        const Clip* furthestClip = nullptr;
        double furthestEnd = 0;
        const Clip* runClip = nullptr;
        double runEnd = 0;
        for (const Clip* clip : siblings) {
            // Publish a shared-start run only after all its clips have read the previous maximum.
            if (runClip && runClip->startMs < clip->startMs) {
                if (!furthestClip || runEnd > furthestEnd) {
                    furthestClip = runClip;
                    furthestEnd = runEnd;
                }
                runClip = nullptr;
            }
            const Clip* partner = furthestClip && furthestEnd > clip->startMs ? furthestClip : nullptr;
            const double end = clip->startMs + clip->durationMs;
            if (!runClip || end > runEnd) {
                runClip = clip;
                runEnd = end;
            }
            const auto pair = resolveTransition(*clip, partner, t);
            if (!pair) {
                continue;
            }
            if (pair->outgoing && pair->outgoingClip) {
                const std::string& id = pair->outgoingClip->id;
                auto it = out.find(id);
                if (it != out.end()) {
                    it->second.opacity *= pair->outgoing->opacity;
                } else {
                    out.emplace(id, *pair->outgoing);
                }
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

}  // namespace nt

