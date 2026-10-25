#include "scene/Animation.h"

#include <QJsonValue>
#include <QRegularExpression>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>
#include <unordered_map>

namespace nt::scene {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTwoPi = kPi * 2.0;

// JavaScript's Math.round: halves round toward +infinity.
double jsRound(double x) { return std::floor(x + 0.5); }

// ── easing.ts ─────────────────────────────────────────────────────────────

using EasingFn = std::function<double(double)>;

constexpr double kBackC1 = 1.70158;
constexpr double kBackC3 = kBackC1 + 1.0;
constexpr double kElasticC4 = (2.0 * kPi) / 3.0;

double easeOutBounce(double t) {
    const double n1 = 7.5625;
    const double d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
        const double u = t - 1.5 / d1;
        return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
        const double u = t - 2.25 / d1;
        return n1 * u * u + 0.9375;
    }
    const double u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
}

const std::map<std::string, EasingFn>& namedEasings() {
    static const std::map<std::string, EasingFn> m = {
        {"linear", [](double t) { return t; }},
        {"easeIn", [](double t) { return t * t * t; }},
        {"easeOut", [](double t) { const double u = 1 - t; return 1 - u * u * u; }},
        {"easeInOut", [](double t) { return t < 0.5 ? 4 * t * t * t : 1 - std::pow(-2 * t + 2, 3) / 2; }},
        {"easeOutBack", [](double t) { const double u = t - 1; return 1 + kBackC3 * u * u * u + kBackC1 * u * u; }},
        {"easeOutElastic",
         [](double t) {
             if (t <= 0) return 0.0;
             if (t >= 1) return 1.0;
             return std::pow(2, -10 * t) * std::sin((t * 10 - 0.75) * kElasticC4) + 1;
         }},
        {"easeOutBounce", easeOutBounce},
        {"easeInExpo", [](double t) { return t <= 0 ? 0.0 : std::pow(2, 10 * t - 10); }},
        {"easeOutExpo", [](double t) { return t >= 1 ? 1.0 : 1 - std::pow(2, -10 * t); }},
        {"easeInOutExpo",
         [](double t) {
             if (t <= 0) return 0.0;
             if (t >= 1) return 1.0;
             return t < 0.5 ? std::pow(2, 20 * t - 10) / 2 : (2 - std::pow(2, -20 * t + 10)) / 2;
         }},
        {"easeInQuint", [](double t) { return std::pow(t, 5); }},
        {"easeOutQuint", [](double t) { return 1 - std::pow(1 - t, 5); }},
        {"easeInOutQuint", [](double t) { return t < 0.5 ? 16 * std::pow(t, 5) : 1 - std::pow(-2 * t + 2, 5) / 2; }},
        {"easeInCirc", [](double t) { return 1 - std::sqrt(1 - t * t); }},
        {"easeOutCirc", [](double t) { return std::sqrt(1 - std::pow(t - 1, 2)); }},
        {"easeInOutCirc",
         [](double t) {
             return t < 0.5 ? (1 - std::sqrt(1 - std::pow(2 * t, 2))) / 2
                            : (std::sqrt(1 - std::pow(-2 * t + 2, 2)) + 1) / 2;
         }},
        {"hold", [](double t) { return t >= 1 ? 1.0 : 0.0; }},
    };
    return m;
}

EasingFn cubicBezier(double x1, double y1, double x2, double y2) {
    const double cx1 = std::min(1.0, std::max(0.0, x1));
    const double cx2 = std::min(1.0, std::max(0.0, x2));
    const double cX = 3 * cx1;
    const double bX = 3 * (cx2 - cx1) - cX;
    const double aX = 1 - cX - bX;
    const double cY = 3 * y1;
    const double bY = 3 * (y2 - y1) - cY;
    const double aY = 1 - cY - bY;
    return [=](double tIn) {
        if (tIn <= 0) return 0.0;
        if (tIn >= 1) return 1.0;
        const auto sampleX = [&](double t) { return ((aX * t + bX) * t + cX) * t; };
        const auto sampleY = [&](double t) { return ((aY * t + bY) * t + cY) * t; };
        const auto slopeX = [&](double t) { return (3 * aX * t + 2 * bX) * t + cX; };
        const double x = tIn;
        const auto solveT = [&]() {
            double t = x;
            for (int i = 0; i < 8; i++) {
                const double error = sampleX(t) - x;
                if (std::abs(error) < 1e-4) return t;
                const double slope = slopeX(t);
                if (std::abs(slope) < 1e-6) break;
                t -= error / slope;
                if (t < 0 || t > 1) break;
            }
            double lo = 0;
            double hi = 1;
            t = x;
            for (int i = 0; i < 24; i++) {
                const double error = sampleX(t) - x;
                if (std::abs(error) < 1e-4) return t;
                if (error > 0) hi = t;
                else lo = t;
                t = (lo + hi) / 2;
            }
            return t;
        };
        return sampleY(solveT());
    };
}

std::optional<EasingFn> spring(double stiffness, double damping, double mass) {
    if (stiffness <= 0 || damping <= 0 || mass <= 0) return std::nullopt;
    const double omega0 = std::sqrt(stiffness / mass);
    const double zeta = damping / (2 * std::sqrt(stiffness * mass));
    constexpr double settleEps = 1e-4;
    std::function<double(double)> displacement;
    double settleTime = 0;
    if (std::abs(zeta - 1) < 1e-6) {
        displacement = [omega0](double tau) { return std::exp(-omega0 * tau) * (1 + omega0 * tau); };
        double x = std::log(1 / settleEps);
        for (int i = 0; i < 40; i++) x = std::log((1 + x) / settleEps);
        settleTime = x / omega0;
    } else if (zeta < 1) {
        const double omegaD = omega0 * std::sqrt(1 - zeta * zeta);
        const double ratio = (zeta * omega0) / omegaD;
        displacement = [=](double tau) {
            return std::exp(-zeta * omega0 * tau) * (std::cos(omegaD * tau) + ratio * std::sin(omegaD * tau));
        };
        const double amplitude = 1 / std::sqrt(1 - zeta * zeta);
        settleTime = std::log(amplitude / settleEps) / (zeta * omega0);
    } else {
        const double root = omega0 * std::sqrt(zeta * zeta - 1);
        const double slow = -zeta * omega0 + root;
        const double fast = -zeta * omega0 - root;
        const double cSlow = -fast / (slow - fast);
        const double cFast = slow / (slow - fast);
        displacement = [=](double tau) { return cSlow * std::exp(slow * tau) + cFast * std::exp(fast * tau); };
        settleTime = std::log((std::abs(cSlow) + std::abs(cFast)) / settleEps) / -slow;
    }
    if (!std::isfinite(settleTime) || settleTime <= 0) return std::nullopt;
    return [displacement, settleTime](double t) {
        if (t <= 0) return 0.0;
        return 1 - displacement(t * settleTime);
    };
}

std::optional<EasingFn> compileEasing(const std::string& idIn) {
    const QString text = QString::fromStdString(idIn).trimmed();
    const auto& named = namedEasings();
    if (const auto it = named.find(text.toStdString()); it != named.end()) return it->second;
    static const QRegularExpression call(QStringLiteral("^([a-z-]+)\\(([^()]*)\\)$"));
    const auto m = call.match(text);
    if (!m.hasMatch()) return std::nullopt;
    std::vector<double> args;
    for (const QString& part : m.captured(2).split(u',')) {
        const QString t = part.trimmed();
        if (t.isEmpty()) return std::nullopt;
        bool ok = false;
        const double v = t.toDouble(&ok);
        if (!ok || !std::isfinite(v)) return std::nullopt;
        args.push_back(v);
    }
    if (m.captured(1) == u"cubic-bezier") {
        if (args.size() != 4) return std::nullopt;
        return cubicBezier(args[0], args[1], args[2], args[3]);
    }
    if (m.captured(1) == u"spring") {
        if (args.size() != 3) return std::nullopt;
        return spring(args[0], args[1], args[2]);
    }
    return std::nullopt;
}

const std::optional<EasingFn>& parsedEasing(const std::string& id) {
    static std::mutex mutex;
    static std::unordered_map<std::string, std::optional<EasingFn>> cache;
    std::lock_guard lock(mutex);
    auto it = cache.find(id);
    if (it == cache.end()) {
        if (cache.size() >= 512) cache.clear();
        it = cache.emplace(id, compileEasing(id)).first;
    }
    return it->second;
}

// ── types.ts: the fold and pass tables ────────────────────────────────────

enum class Fold { Add, Multiply, Replace, Min };

struct ChannelInfo {
    const char* name;
    Channel channel;
    Fold fold;
    bool motion;  // ANIMATED_PROPERTY_PASS: motion, else effects
};

const ChannelInfo kChannels[] = {
    {"offsetX", Channel::OffsetX, Fold::Add, true},
    {"offsetY", Channel::OffsetY, Fold::Add, true},
    {"scale", Channel::Scale, Fold::Multiply, true},
    {"scaleX", Channel::ScaleX, Fold::Multiply, true},
    {"scaleY", Channel::ScaleY, Fold::Multiply, true},
    {"rotation", Channel::Rotation, Fold::Add, true},
    {"rotationX", Channel::RotationX, Fold::Add, true},
    {"rotationY", Channel::RotationY, Fold::Add, true},
    {"opacity", Channel::Opacity, Fold::Multiply, true},
    {"wipeProgress", Channel::WipeProgress, Fold::Min, false},
    {"blur", Channel::Blur, Fold::Add, false},
    {"brightness", Channel::Brightness, Fold::Add, false},
    {"saturation", Channel::Saturation, Fold::Multiply, false},
    {"contrast", Channel::Contrast, Fold::Multiply, false},
    {"hue", Channel::Hue, Fold::Add, false},
    {"temperature", Channel::Temperature, Fold::Add, false},
    {"tint", Channel::Tint, Fold::Add, false},
    {"positionX", Channel::PositionX, Fold::Replace, true},
    {"positionY", Channel::PositionY, Fold::Replace, true},
    {"anchorX", Channel::AnchorX, Fold::Replace, true},
    {"anchorY", Channel::AnchorY, Fold::Replace, true},
    {"trimStart", Channel::TrimStart, Fold::Replace, false},
    {"trimEnd", Channel::TrimEnd, Fold::Replace, false},
    {"cameraAzimuth", Channel::CameraAzimuth, Fold::Add, false},
    {"cameraElevation", Channel::CameraElevation, Fold::Add, false},
    {"cameraZoom", Channel::CameraZoom, Fold::Multiply, false},
    {"cameraFov", Channel::CameraFov, Fold::Add, false},
};

const ChannelInfo& info(Channel c) { return kChannels[static_cast<int>(c)]; }

double* arithmeticField(AnimationSample& s, Channel c) {
    switch (c) {
    case Channel::OffsetX: return &s.offsetX;
    case Channel::OffsetY: return &s.offsetY;
    case Channel::Scale: return &s.scale;
    case Channel::ScaleX: return &s.scaleX;
    case Channel::ScaleY: return &s.scaleY;
    case Channel::Rotation: return &s.rotation;
    case Channel::RotationX: return &s.rotationX;
    case Channel::RotationY: return &s.rotationY;
    case Channel::Opacity: return &s.opacity;
    case Channel::Blur: return &s.blur;
    case Channel::Brightness: return &s.brightness;
    case Channel::Saturation: return &s.saturation;
    case Channel::Contrast: return &s.contrast;
    case Channel::Hue: return &s.hue;
    case Channel::Temperature: return &s.temperature;
    case Channel::Tint: return &s.tint;
    case Channel::CameraAzimuth: return &s.cameraAzimuth;
    case Channel::CameraElevation: return &s.cameraElevation;
    case Channel::CameraZoom: return &s.cameraZoom;
    case Channel::CameraFov: return &s.cameraFov;
    default: return nullptr;
    }
}

std::optional<double>* replaceField(AnimationSample& s, Channel c) {
    switch (c) {
    case Channel::PositionX: return &s.positionX;
    case Channel::PositionY: return &s.positionY;
    case Channel::AnchorX: return &s.anchorX;
    case Channel::AnchorY: return &s.anchorY;
    case Channel::TrimStart: return &s.trimStart;
    case Channel::TrimEnd: return &s.trimEnd;
    default: return nullptr;
    }
}

bool finite(const QJsonValue& v) { return v.isDouble() && std::isfinite(v.toDouble()); }

// ── custom.ts ─────────────────────────────────────────────────────────────

constexpr int kMaxCustomCurves = 16;
constexpr int kMaxCustomKeyframes = 4096;

struct CustomCurves {
    bool ok = false;
    bool sourceTime = false;
    std::vector<PropertyCurve> curves;
};

CustomCurves normalizeCustomCurves(const QJsonValue& raw, const QJsonValue& timeBase) {
    CustomCurves out;
    bool sourceBased = false;
    if (!(timeBase.isUndefined() || timeBase.isNull())) {
        if (!timeBase.isString()) return out;
        if (timeBase.toString() == u"source") sourceBased = true;
        else if (timeBase.toString() != u"clip") return out;
    }
    if (!raw.isArray()) return out;
    const QJsonArray arr = raw.toArray();
    if (arr.isEmpty() || arr.size() > kMaxCustomCurves) return out;
    std::vector<Channel> seen;
    for (const QJsonValue& cv : arr) {
        if (!cv.isObject()) return out;
        const QJsonObject c = cv.toObject();
        if (!c.value(u"property").isString()) return out;
        const auto channel = channelFromName(c.value(u"property").toString());
        if (!channel) return out;
        const QJsonValue kfsV = c.value(u"keyframes");
        if (!kfsV.isArray() || kfsV.toArray().isEmpty() || kfsV.toArray().size() > kMaxCustomKeyframes) return out;
        std::vector<Keyframe> parsed;
        for (const QJsonValue& kv : kfsV.toArray()) {
            if (!kv.isObject()) return out;
            const QJsonObject k = kv.toObject();
            const bool hasTime = finite(k.value(u"t")) || sourceBased;
            if (!hasTime || !finite(k.value(u"value"))) return out;
            Keyframe kf;
            kf.t = finite(k.value(u"t")) ? k.value(u"t").toDouble() : 0.0;
            kf.value = k.value(u"value").toDouble();
            if (finite(k.value(u"sourceMs"))) kf.sourceMs = k.value(u"sourceMs").toDouble();
            if (k.value(u"easing").isString()) kf.easing = k.value(u"easing").toString().toStdString();
            parsed.push_back(kf);
        }
        PropertyCurve curve;
        curve.channel = *channel;
        if (sourceBased) {
            double previous = -1;
            for (size_t i = 0; i < parsed.size(); ++i) {
                if (!parsed[i].sourceMs || *parsed[i].sourceMs < 0) return out;
                if (i > 0 && *parsed[i].sourceMs < previous) return out;
                previous = *parsed[i].sourceMs;
            }
            const double firstMs = *parsed.front().sourceMs;
            const double span = *parsed.back().sourceMs - firstMs;
            for (Keyframe& kf : parsed) kf.t = span > 0 ? (*kf.sourceMs - firstMs) / span : 0;
            curve.keyframes = parsed;
        } else {
            std::vector<Keyframe> sorted;
            for (const Keyframe& kf : parsed) {
                Keyframe c2;
                c2.t = std::min(1.0, std::max(0.0, kf.t));
                c2.value = kf.value;
                c2.easing = kf.easing;
                sorted.push_back(c2);
            }
            std::stable_sort(sorted.begin(), sorted.end(), [](const Keyframe& a, const Keyframe& b) { return a.t < b.t; });
            if (sorted.front().t > 0) {
                Keyframe first = sorted.front();
                first.t = 0;
                sorted.insert(sorted.begin(), first);
            }
            if (sorted.back().t < 1) {
                Keyframe last = sorted.back();
                last.t = 1;
                sorted.push_back(last);
            }
            curve.keyframes = sorted;
        }
        if (std::find(seen.begin(), seen.end(), curve.channel) != seen.end()) return out;
        seen.push_back(curve.channel);
        out.curves.push_back(std::move(curve));
    }
    out.ok = true;
    out.sourceTime = sourceBased;
    return out;
}

bool isWipeDirection(const QString& d) {
    return d == u"left" || d == u"right" || d == u"up" || d == u"down";
}

// ── presets.ts ────────────────────────────────────────────────────────────

double num(const QJsonObject& params, const char* name, double fallback) {
    const QJsonValue v = params.value(QLatin1String(name));
    return finite(v) ? v.toDouble() : fallback;
}

QString str(const QJsonObject& params, const char* name, const QString& fallback) {
    const QJsonValue v = params.value(QLatin1String(name));
    return v.isString() ? v.toString() : fallback;
}

PropertyCurve line(Channel c, double from, double to) {
    return PropertyCurve{c, {Keyframe{0, from, {}, {}}, Keyframe{1, to, {}, {}}}};
}

PropertyCurve sampleCurve(Channel c, int count, const std::function<double(double)>& fn) {
    PropertyCurve curve{c, {}};
    for (int i = 0; i < count; i++) {
        const double t = static_cast<double>(i) / (count - 1);
        curve.keyframes.push_back(Keyframe{t, fn(t), {}, {}});
    }
    return curve;
}

int sampleCountFor(double durationMs, double frequencyHz, int lo, int hi) {
    const double cycles = durationMs > 0 && frequencyHz > 0 ? (durationMs / 1000) * frequencyHz : 0;
    const double raw = jsRound(cycles * 8) + 1;
    return static_cast<int>(std::max<double>(lo, std::min<double>(hi, raw)));
}

std::function<double()> mulberry32(double seed) {
    auto a = std::make_shared<uint32_t>(static_cast<uint32_t>(static_cast<int64_t>(seed)));
    return [a]() {
        *a += 0x6d2b79f5u;
        uint32_t t = (*a ^ (*a >> 15)) * (1u | *a);
        t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
        return static_cast<double>(t ^ (t >> 14)) / 4294967296.0;
    };
}

double smoothstep(double t) { return t * t * (3 - 2 * t); }

std::vector<double> buildNoiseLattice(const std::function<double()>& rand, int count) {
    std::vector<double> lattice;
    for (int i = 0; i < count; i++) lattice.push_back(rand() * 2 - 1);
    return lattice;
}

double sampleLatticeNoise(const std::vector<double>& lattice, double u) {
    const int n = static_cast<int>(lattice.size());
    if (n == 0) return 0;
    if (n == 1) return lattice[0];
    const double scaled = std::max(0.0, std::min(1.0, u)) * (n - 1);
    const int i0 = std::min(n - 2, static_cast<int>(std::floor(scaled)));
    const double frac = scaled - i0;
    return lattice[i0] + (lattice[i0 + 1] - lattice[i0]) * smoothstep(frac);
}

double sampleCircularLatticeNoise(const std::vector<double>& lattice, double u) {
    const int n = static_cast<int>(lattice.size());
    if (n == 0) return 0;
    const double scaled = u * n;
    const int i0 = ((static_cast<int>(std::floor(scaled)) % n) + n) % n;
    const int i1 = (i0 + 1) % n;
    const double frac = scaled - std::floor(scaled);
    return lattice[i0] + (lattice[i1] - lattice[i0]) * smoothstep(frac);
}

double fadeEnvelope(double tMs, double windowMs, double fadeInMs, double fadeOutMs) {
    double e = 1;
    if (fadeInMs > 0 && tMs < fadeInMs) e = std::min(e, tMs / fadeInMs);
    if (fadeOutMs > 0 && tMs > windowMs - fadeOutMs) e = std::min(e, (windowMs - tMs) / fadeOutMs);
    return std::max(0.0, std::min(1.0, e));
}

struct Preset {
    std::vector<std::string> roles;
    std::string defaultEasing;  // empty: role default
    bool fullClip = false;
    std::function<std::vector<PropertyCurve>(const QJsonObject&, const CompileContext&, double durationMs)> curves;
    std::function<std::optional<WipeMask>(const QJsonObject&)> mask;
};

const std::map<std::string, Preset>& presets() {
    static const std::map<std::string, Preset> m = [] {
        std::map<std::string, Preset> p;
        p["fade"] = {{"in", "out"}, "", false,
                     [](const QJsonObject&, const CompileContext&, double) {
                         return std::vector<PropertyCurve>{line(Channel::Opacity, 0, 1)};
                     },
                     {}};
        p["typewriter"] = {{"in"}, "hold", false,
                           [](const QJsonObject&, const CompileContext&, double) {
                               return std::vector<PropertyCurve>{line(Channel::Opacity, 0, 1)};
                           },
                           {}};
        p["slide"] = {{"in", "out"}, "", false,
                      [](const QJsonObject& params, const CompileContext& c, double) {
                          const QString direction = str(params, "direction", QStringLiteral("left"));
                          const double distance = num(params, "distance", 0.3);
                          const double dx = distance * c.canvasWidth;
                          const double dy = distance * c.canvasHeight;
                          std::vector<PropertyCurve> curves{line(Channel::Opacity, 0, 1)};
                          if (direction == u"right") curves.push_back(line(Channel::OffsetX, dx, 0));
                          else if (direction == u"up") curves.push_back(line(Channel::OffsetY, -dy, 0));
                          else if (direction == u"down") curves.push_back(line(Channel::OffsetY, dy, 0));
                          else curves.push_back(line(Channel::OffsetX, -dx, 0));
                          return curves;
                      },
                      {}};
        p["pop"] = {{"in", "out"}, "easeOut", false,
                    [](const QJsonObject& params, const CompileContext&, double) {
                        const double overshoot = num(params, "overshoot", 1.08);
                        return std::vector<PropertyCurve>{
                            PropertyCurve{Channel::Scale, {{0, 0.6, {}, {}}, {0.6, overshoot, {}, {}}, {1, 1, {}, {}}}},
                            PropertyCurve{Channel::Opacity, {{0, 0, {}, {}}, {0.6, 1, {}, {}}, {1, 1, {}, {}}}}};
                    },
                    {}};
        p["spin"] = {{"in", "out"}, "", false,
                     [](const QJsonObject& params, const CompileContext&, double) {
                         const double turns = num(params, "turns", 0.25);
                         return std::vector<PropertyCurve>{line(Channel::Rotation, -turns * kTwoPi, 0),
                                                           line(Channel::Opacity, 0, 1)};
                     },
                     {}};
        p["wipe"] = {{"in", "out"}, "", false,
                     [](const QJsonObject&, const CompileContext&, double) {
                         return std::vector<PropertyCurve>{line(Channel::WipeProgress, 0, 1)};
                     },
                     [](const QJsonObject& params) {
                         const QString raw = str(params, "direction", QStringLiteral("left"));
                         WipeMask mask;
                         mask.direction = (raw == u"right" || raw == u"up" || raw == u"down") ? raw.toStdString() : "left";
                         mask.softness = std::min(0.5, std::max(0.0, num(params, "softness", 0.05)));
                         return std::optional<WipeMask>(mask);
                     }};
        p["blur"] = {{"in", "out"}, "", false,
                     [](const QJsonObject& params, const CompileContext&, double) {
                         const double amount = std::max(0.0, std::min(40.0, num(params, "amount", 12)));
                         return std::vector<PropertyCurve>{line(Channel::Blur, amount, 0), line(Channel::Opacity, 0, 1)};
                     },
                     {}};
        p["colorFade"] = {{"in", "out"}, "", false,
                          [](const QJsonObject&, const CompileContext&, double) {
                              return std::vector<PropertyCurve>{line(Channel::Saturation, 0, 1)};
                          },
                          {}};
        p["pulse"] = {{"emphasis"}, "easeInOut", false,
                      [](const QJsonObject& params, const CompileContext&, double) {
                          const double intensity = num(params, "intensity", 0.06);
                          return std::vector<PropertyCurve>{PropertyCurve{
                              Channel::Scale, {{0, 1, {}, {}}, {0.5, 1 + intensity, {}, {}}, {1, 1, {}, {}}}}};
                      },
                      {}};
        p["flash"] = {{"emphasis"}, "easeInOut", false,
                      [](const QJsonObject& params, const CompileContext&, double) {
                          const double intensity = std::max(0.0, std::min(1.0, num(params, "intensity", 0.6)));
                          return std::vector<PropertyCurve>{PropertyCurve{
                              Channel::Brightness, {{0, 0, {}, {}}, {0.5, intensity, {}, {}}, {1, 0, {}, {}}}}};
                      },
                      {}};
        p["shake"] = {{"emphasis"}, "linear", false,
                      [](const QJsonObject& params, const CompileContext& c, double durationMs) {
                          const double intensity = num(params, "intensity", 0.02);
                          const double frequency = std::max(0.01, num(params, "frequency", 8));
                          const double seed = jsRound(num(params, "seed", 1));
                          const double fadeInMs = std::max(0.0, num(params, "fadeInMs", 0));
                          const double fadeOutMs = std::max(0.0, num(params, "fadeOutMs", 0));
                          const double windowMs = durationMs;
                          const int count = sampleCountFor(windowMs, frequency, 9, kMaxCustomKeyframes);
                          const int latticeCount =
                              static_cast<int>(std::max(2.0, jsRound((frequency * windowMs) / 1000) + 1));
                          const auto noiseX = buildNoiseLattice(mulberry32(seed * 2 + 1), latticeCount);
                          const auto noiseY = buildNoiseLattice(mulberry32(seed * 2 + 2), latticeCount);
                          const double ampX = intensity * c.canvasWidth;
                          const double ampY = intensity * c.canvasHeight;
                          const auto axis = [&](const std::vector<double>& lattice, double amp) {
                              return [=](double t) {
                                  if (t <= 0 || t >= 1) return 0.0;
                                  const double envelope = fadeEnvelope(t * windowMs, windowMs, fadeInMs, fadeOutMs);
                                  return amp * sampleLatticeNoise(lattice, t) * envelope;
                              };
                          };
                          return std::vector<PropertyCurve>{sampleCurve(Channel::OffsetX, count, axis(noiseX, ampX)),
                                                            sampleCurve(Channel::OffsetY, count, axis(noiseY, ampY))};
                      },
                      {}};
        p["bounce"] = {{"emphasis"}, "linear", false,
                       [](const QJsonObject& params, const CompileContext& c, double) {
                           const double height = num(params, "height", 0.05) * c.canvasHeight;
                           const auto profile = [](double t) {
                               if (t < 0.5) return ease("easeOut", t / 0.5);
                               return 1 - ease("easeOutBounce", (t - 0.5) / 0.5);
                           };
                           return std::vector<PropertyCurve>{
                               sampleCurve(Channel::OffsetY, 24, [=](double t) { return -height * profile(t); })};
                       },
                       {}};
        p["squash"] = {{"emphasis"}, "easeOutBack", false,
                       [](const QJsonObject& params, const CompileContext&, double) {
                           const double amount = std::max(0.0, std::min(0.5, num(params, "amount", 0.12)));
                           return std::vector<PropertyCurve>{
                               PropertyCurve{Channel::ScaleX, {{0, 1, {}, {}}, {0.5, 1 + amount, {}, {}}, {1, 1, {}, {}}}},
                               PropertyCurve{Channel::ScaleY, {{0, 1, {}, {}}, {0.5, 1 - amount, {}, {}}, {1, 1, {}, {}}}}};
                       },
                       {}};
        p["kenBurns"] = {{"loop"}, "easeInOut", true,
                         [](const QJsonObject& params, const CompileContext& c, double) {
                             const double zoom = num(params, "zoom", 0.12);
                             const QString direction = str(params, "direction", QStringLiteral("in"));
                             const double driftX = num(params, "driftX", 0.02) * c.canvasWidth;
                             const double driftY = num(params, "driftY", 0.02) * c.canvasHeight;
                             const double from = direction == u"out" ? 1 + zoom : 1;
                             const double to = direction == u"out" ? 1 : 1 + zoom;
                             return std::vector<PropertyCurve>{line(Channel::Scale, from, to),
                                                               line(Channel::OffsetX, 0, driftX),
                                                               line(Channel::OffsetY, 0, driftY)};
                         },
                         {}};
        p["float"] = {{"loop"}, "linear", false,
                      [](const QJsonObject& params, const CompileContext& c, double durationMs) {
                          const double amp = num(params, "amplitude", 0.015) * c.canvasHeight;
                          const double frequency = std::max(0.01, num(params, "frequency", 1));
                          const double seed = jsRound(num(params, "seed", 0));
                          const int count = sampleCountFor(durationMs, frequency, 9, kMaxCustomKeyframes);
                          const double cycles = std::max(1.0, jsRound(frequency));
                          std::optional<std::vector<double>> lattice;
                          if (seed != 0) {
                              const int latticeCount =
                                  static_cast<int>(std::max(4.0, std::min(64.0, jsRound(frequency * 8))));
                              lattice = buildNoiseLattice(mulberry32(seed), latticeCount);
                          }
                          return std::vector<PropertyCurve>{sampleCurve(Channel::OffsetY, count, [=](double t) {
                              const double base = -amp * std::sin(kTwoPi * cycles * t);
                              if (!lattice) return base;
                              return base + amp * 0.5 * sampleCircularLatticeNoise(*lattice, t);
                          })};
                      },
                      {}};
        p["breathe"] = {{"loop"}, "linear", false,
                        [](const QJsonObject& params, const CompileContext&, double) {
                            const double intensity = num(params, "intensity", 0.03);
                            return std::vector<PropertyCurve>{sampleCurve(Channel::Scale, 16, [=](double t) {
                                return 1 + intensity * (0.5 - 0.5 * std::cos(kTwoPi * t));
                            })};
                        },
                        {}};
        p["rotate"] = {{"loop"}, "linear", false,
                       [](const QJsonObject& params, const CompileContext&, double) {
                           const double sign = str(params, "direction", QStringLiteral("cw")) == u"ccw" ? -1 : 1;
                           return std::vector<PropertyCurve>{line(Channel::Rotation, 0, sign * kTwoPi)};
                       },
                       {}};
        p["hueShift"] = {{"loop"}, "linear", false,
                         [](const QJsonObject& params, const CompileContext&, double) {
                             const double sign = str(params, "direction", QStringLiteral("forward")) == u"reverse" ? -1 : 1;
                             return std::vector<PropertyCurve>{line(Channel::Hue, 0, sign * 360)};
                         },
                         {}};
        p["orbit"] = {{"loop"}, "linear", false,
                      [](const QJsonObject& params, const CompileContext&, double) {
                          const double degrees = num(params, "degrees", 360);
                          const double sign = str(params, "direction", QStringLiteral("cw")) == u"ccw" ? -1 : 1;
                          return std::vector<PropertyCurve>{line(Channel::CameraAzimuth, 0, sign * degrees)};
                      },
                      {}};
        return p;
    }();
    return m;
}

std::string roleDefaultEasing(const std::string& role) {
    if (role == "in") return "easeOut";
    if (role == "out") return "easeIn";
    if (role == "emphasis") return "easeInOut";
    return "linear";
}

PropertyCurve reverseCurve(const PropertyCurve& c) {
    PropertyCurve out{c.channel, {}};
    const size_t n = c.keyframes.size();
    for (size_t i = 0; i < n; ++i) {
        const Keyframe& src = c.keyframes[n - 1 - i];
        out.keyframes.push_back(Keyframe{1 - src.t, src.value, src.easing, {}});
    }
    return out;
}

bool isKeyframeAnimation(const AnimationDef& a) {
    return a.preset == "custom" && a.role == "emphasis" && a.delayMs.value_or(0) == 0 &&
           a.params.value(u"keyframed").isBool() && a.params.value(u"keyframed").toBool();
}

double keyframeAt(const Keyframe& kf, bool sourceBased) { return sourceBased ? kf.sourceMs.value_or(0) : kf.t; }

double evalCurve(const PropertyCurve& curve, double at, bool sourceBased) {
    const auto& kfs = curve.keyframes;
    if (kfs.empty()) return 0;
    if (at <= keyframeAt(kfs.front(), sourceBased)) return kfs.front().value;
    const Keyframe& last = kfs.back();
    if (at >= keyframeAt(last, sourceBased)) return last.value;
    for (size_t i = 1; i < kfs.size(); i++) {
        const Keyframe& b = kfs[i];
        const double bAt = keyframeAt(b, sourceBased);
        if (at <= bAt) {
            const Keyframe& a = kfs[i - 1];
            const double span = bAt - keyframeAt(a, sourceBased);
            const double segT = span > 0 ? (at - keyframeAt(a, sourceBased)) / span : 0;
            const double eased = ease(b.easing.empty() ? std::string("linear") : b.easing, segT);
            return a.value + (b.value - a.value) * eased;
        }
    }
    return last.value;
}

std::optional<double> windowT(const CompiledAnimation& anim, double localMs) {
    if (anim.loop) {
        const double period = anim.periodMs.value_or(anim.windowEndMs - anim.windowStartMs);
        if (period <= 0) return std::nullopt;
        if (localMs < anim.windowStartMs || localMs >= anim.windowEndMs) return std::nullopt;
        const double origin = anim.loopOriginMs.value_or(anim.windowStartMs);
        return std::fmod(std::fmod(localMs - origin, period) + period, period) / period;
    }
    if (localMs < anim.windowStartMs) return anim.holdBefore ? std::optional<double>(0) : std::nullopt;
    if (localMs > anim.windowEndMs) return anim.holdAfter ? std::optional<double>(1) : std::nullopt;
    const double span = anim.windowEndMs - anim.windowStartMs;
    return span > 0 ? (localMs - anim.windowStartMs) / span : 0;
}

void clampSample(AnimationSample& s) {
    s.opacity = std::min(1.0, std::max(0.0, s.opacity));
    if (s.scale < 0) s.scale = 0;
    if (s.scaleX < 0) s.scaleX = 0;
    if (s.scaleY < 0) s.scaleY = 0;
    if (s.blur < 0) s.blur = 0;
    s.brightness = std::min(1.0, std::max(-1.0, s.brightness));
    s.saturation = std::min(4.0, std::max(0.0, s.saturation));
    s.contrast = std::min(4.0, std::max(0.0, s.contrast));
    if (s.hue != 0) s.hue = std::fmod(std::fmod(s.hue, 360) + 540, 360) - 180;
    s.temperature = std::min(1.0, std::max(-1.0, s.temperature));
    s.tint = std::min(1.0, std::max(-1.0, s.tint));
    if (s.cameraZoom < 0) s.cameraZoom = 0;
    if (s.trimStart) s.trimStart = std::min(1.0, std::max(0.0, *s.trimStart));
    if (s.trimEnd) s.trimEnd = std::min(1.0, std::max(0.0, *s.trimEnd));
}

}  // namespace

double ease(const std::string& id, double t) {
    const auto& fn = parsedEasing(id);
    return fn ? (*fn)(t) : t;
}

bool isKnownEasing(const std::string& id) { return parsedEasing(id).has_value(); }

std::optional<Channel> channelFromName(const QString& name) {
    for (const ChannelInfo& c : kChannels) {
        if (name == QLatin1String(c.name)) return c.channel;
    }
    return std::nullopt;
}

bool AnimationSample::isIdentity() const {
    return offsetX == 0 && offsetY == 0 && scale == 1 && scaleX == 1 && scaleY == 1 && rotation == 0 &&
           rotationX == 0 && rotationY == 0 && opacity == 1 && blur == 0 && brightness == 0 && saturation == 1 &&
           contrast == 1 && hue == 0 && temperature == 0 && tint == 0 && cameraAzimuth == 0 &&
           cameraElevation == 0 && cameraZoom == 1 && cameraFov == 0 && !mask && !replaced;
}

std::vector<AnimationDef> parseAnimations(const QJsonArray& raw) {
    std::vector<AnimationDef> out;
    for (const QJsonValue& v : raw) {
        const QJsonObject a = v.toObject();
        AnimationDef d;
        d.id = a.value(u"id").toString().toStdString();
        d.role = a.value(u"role").toString().toStdString();
        d.preset = a.value(u"preset").toString().toStdString();
        d.durationMs = a.value(u"durationMs").toDouble(0);
        if (a.value(u"delayMs").isDouble()) d.delayMs = a.value(u"delayMs").toDouble();
        if (a.value(u"easing").isString()) d.easing = a.value(u"easing").toString().toStdString();
        d.enabled = !(a.value(u"enabled").isBool() && !a.value(u"enabled").toBool());
        d.hasBeat = a.contains(u"beat") && !a.value(u"beat").isNull() && !a.value(u"beat").isUndefined();
        d.params = a.value(u"params").toObject();
        d.custom = a.value(u"custom").toObject();
        const bool noCurves = d.custom.value(u"curves").toArray().isEmpty();
        d.styleOnly = noCurves && (!a.value(u"styleTracks").toArray().isEmpty() ||
                                   (a.contains(u"textAnimator") && !a.value(u"textAnimator").isNull()));
        if (a.value(u"stagger").isObject()) {
            const QJsonObject s = a.value(u"stagger").toObject();
            d.staggerUnit = s.value(u"unit").toString().toStdString();
            d.staggerOffsetMs = s.value(u"offsetMs").toDouble(0);
            if (s.value(u"from").isString()) d.staggerFrom = s.value(u"from").toString().toStdString();
        }
        out.push_back(std::move(d));
    }
    return out;
}

std::string unsupportedReason(const AnimationDef& def, const QJsonObject& clipRaw) {
    if (!def.enabled) return {};
    if (def.hasBeat) return "beat";
    if (def.preset == "followPath") return "preset=followPath";
    if (def.staggerUnit && *def.staggerUnit == "line" && clipRaw.value(u"mediaType").toString() == u"text" &&
        clipRaw.value(u"textStyle").isObject()) {
        return "stagger.unit=line";
    }
    return {};
}

std::vector<CompiledAnimation> compileAnimations(const std::vector<AnimationDef>& defs, double clipDurationMs,
                                                 const CompileContext& ctx) {
    std::vector<CompiledAnimation> out;
    for (const AnimationDef& a : defs) {
        if (!a.enabled) continue;
        std::vector<PropertyCurve> curves;
        std::optional<WipeMask> mask;
        std::string baseEasing;
        bool fullClip = false;
        bool sourceTime = false;
        if (a.preset == "custom") {
            if (!a.styleOnly) {
                const CustomCurves baked = normalizeCustomCurves(a.custom.value(u"curves"), a.custom.value(u"timeBase"));
                if (!baked.ok) continue;
                curves = baked.curves;
                sourceTime = baked.sourceTime;
            }
            const bool drivesWipe = std::any_of(curves.begin(), curves.end(),
                                                [](const PropertyCurve& c) { return c.channel == Channel::WipeProgress; });
            const QJsonValue rawMask = a.custom.value(u"mask");
            if (!rawMask.isObject()) {
                if (drivesWipe) continue;
            } else {
                const QJsonObject m = rawMask.toObject();
                if (!m.value(u"direction").isString() || !isWipeDirection(m.value(u"direction").toString())) continue;
                const QJsonValue soft = m.value(u"softness");
                if (!finite(soft) || soft.toDouble() < 0 || soft.toDouble() > 1) continue;
                mask = WipeMask{m.value(u"direction").toString().toStdString(), soft.toDouble(), 1.0};
            }
            baseEasing = "linear";
        } else {
            const auto it = presets().find(a.preset);
            if (it == presets().end()) continue;
            const Preset& preset = it->second;
            if (std::find(preset.roles.begin(), preset.roles.end(), a.role) == preset.roles.end()) continue;
            QJsonObject params = a.params;
            if (preset.mask) mask = preset.mask(params);
            const double animDurationMs = std::max(1.0, a.durationMs);
            curves = preset.curves(params, ctx, animDurationMs);
            if (a.role == "out") {
                for (PropertyCurve& c : curves) c = reverseCurve(c);
            }
            baseEasing = preset.defaultEasing;
            fullClip = preset.fullClip;
        }
        // applyEasing
        const std::string base = baseEasing.empty() ? roleDefaultEasing(a.role) : baseEasing;
        for (PropertyCurve& c : curves) {
            for (Keyframe& kf : c.keyframes) {
                if (a.easing) kf.easing = *a.easing;
                else if (kf.easing.empty()) kf.easing = base;
            }
        }

        const double delayMs = std::max(0.0, a.delayMs.value_or(0));
        const double durationMs = std::max(1.0, isKeyframeAnimation(a) ? clipDurationMs : a.durationMs);

        if (fullClip) {
            CompiledAnimation c;
            c.id = a.id;
            c.role = a.role;
            c.windowStartMs = 0;
            c.windowEndMs = clipDurationMs;
            c.holdAfter = true;
            c.curves = std::move(curves);
            out.push_back(std::move(c));
            continue;
        }

        const bool staggerOn = a.staggerUnit && *a.staggerUnit == ctx.staggerUnit && a.staggerOffsetMs > 0 &&
                               ctx.staggerCount >= 2;
        const int staggerCount = staggerOn ? ctx.staggerCount : 0;
        const std::string from = staggerOn ? a.staggerFrom : "start";
        const auto maxFactor = [&]() {
            return from == "center" ? std::floor((staggerCount - 1) / 2.0) : static_cast<double>(staggerCount - 1);
        };

        if (a.role == "loop") {
            const double loopOriginMs = a.delayMs.value_or(0);
            const double windowStartMs = std::max(0.0, loopOriginMs);
            if (windowStartMs >= clipDurationMs) continue;
            CompiledAnimation c;
            c.id = a.id;
            c.role = "loop";
            c.windowStartMs = windowStartMs;
            c.windowEndMs = clipDurationMs;
            c.loop = true;
            c.periodMs = durationMs;
            c.loopOriginMs = loopOriginMs;
            c.sourceTime = sourceTime;
            c.staggered = staggerOn;
            c.curves = std::move(curves);
            out.push_back(std::move(c));
            continue;
        }

        double staggerMaxDelayMs = 0;
        if (staggerOn) {
            const double mf = maxFactor();
            const double availableMs = clipDurationMs - delayMs;
            double offset = a.staggerOffsetMs;
            if (durationMs + mf * offset > availableMs) offset = std::max(0.0, (availableMs - durationMs) / mf);
            staggerMaxDelayMs = mf * offset;
        }
        double windowStartMs;
        double windowEndMs;
        if (a.role == "out") {
            windowEndMs = clipDurationMs - delayMs;
            windowStartMs = windowEndMs - durationMs - staggerMaxDelayMs;
        } else {
            windowStartMs = delayMs;
            windowEndMs = delayMs + durationMs + staggerMaxDelayMs;
        }
        windowEndMs = std::min(windowEndMs, clipDurationMs);
        windowStartMs = std::max(0.0, windowStartMs);
        if (windowStartMs >= clipDurationMs || windowEndMs <= windowStartMs) continue;
        CompiledAnimation c;
        c.id = a.id;
        c.role = a.role;
        c.windowStartMs = windowStartMs;
        c.windowEndMs = windowEndMs;
        c.holdBefore = a.role == "in";
        c.holdAfter = a.role == "out";
        c.sourceTime = sourceTime;
        c.mask = mask;
        c.staggered = staggerOn;
        c.curves = std::move(curves);
        out.push_back(std::move(c));
    }
    return out;
}

AnimationSample sampleAnimations(const std::vector<CompiledAnimation>& compiled, double localMs,
                                 std::optional<double> sourceMs) {
    AnimationSample acc;
    for (const CompiledAnimation& anim : compiled) {
        const auto t = windowT(anim, localMs);
        if (!t) continue;
        if (anim.sourceTime && !sourceMs) continue;
        const double at = anim.sourceTime ? *sourceMs : *t;
        for (const PropertyCurve& curve : anim.curves) {
            const ChannelInfo& ci = info(curve.channel);
            if (anim.staggered && ci.motion) continue;  // folded per unit, not here
            const double value = evalCurve(curve, at, anim.sourceTime);
            switch (ci.fold) {
            case Fold::Add: *arithmeticField(acc, curve.channel) += value; break;
            case Fold::Multiply: *arithmeticField(acc, curve.channel) *= value; break;
            case Fold::Replace:
                *replaceField(acc, curve.channel) = value;
                acc.replaced = true;
                break;
            case Fold::Min: {
                if (!anim.mask) break;
                const double progress = value < 0 ? 0 : value;
                if (progress >= 1) break;
                if (!acc.mask || progress < acc.mask->progress) {
                    acc.mask = WipeMask{anim.mask->direction, anim.mask->softness, progress};
                }
                break;
            }
            }
        }
    }
    clampSample(acc);
    return acc;
}

int countWords(const QString& text) {
    static const QRegularExpression ws(QStringLiteral("\\s+"), QRegularExpression::UseUnicodePropertiesOption);
    return static_cast<int>(text.split(ws, Qt::SkipEmptyParts).size());
}

int countCharacters(const QString& text) {
    static const QRegularExpression ws(QStringLiteral("\\s+"), QRegularExpression::UseUnicodePropertiesOption);
    const QStringList words = text.split(ws, Qt::SkipEmptyParts);
    if (words.isEmpty()) return 0;
    int count = static_cast<int>(words.size()) - 1;
    for (const QString& w : words) count += static_cast<int>(w.toUcs4().size());
    return count;
}

}  // namespace nt::scene
