#include "scene/TextAnimation.h"

#include <QJsonObject>

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdio>
#include <optional>
#include <string>
#include <vector>

namespace nt::scene {
namespace {

double clamp01(double v) { return std::max(0.0, std::min(1.0, v)); }

const CompiledAnimation* compiledById(const std::vector<CompiledAnimation>& compiled, const QString& id) {
    const std::string key = id.toStdString();
    for (const CompiledAnimation& c : compiled) {
        if (c.id == key) return &c;
    }
    return nullptr;
}

// `progress` in both resolvers: the window's, else 1 after a finished
// non-loop window.
std::optional<double> progressOf(const CompiledAnimation& c, double localMs) {
    if (const auto p = animationProgressAt(c, localMs)) return p;
    if (!c.loop && localMs > c.windowEndMs) return 1.0;
    return std::nullopt;
}

// `styleTrackValue` for a numeric target: the number it gives, if any.
std::optional<double> numericTrackValue(const QJsonObject& track, double t) {
    const QJsonArray frames = track.value(u"keyframes").toArray();
    if (frames.isEmpty()) return std::nullopt;
    const auto numberOf = [](const QJsonObject& f) -> std::optional<double> {
        const QJsonValue v = f.value(u"value");
        return v.isDouble() ? std::optional<double>(v.toDouble()) : std::nullopt;
    };
    if (t <= frames.first().toObject().value(u"t").toDouble()) return numberOf(frames.first().toObject());
    for (qsizetype i = 1; i < frames.size(); i++) {
        const QJsonObject end = frames[i].toObject();
        const double endT = end.value(u"t").toDouble();
        if (t > endT) continue;
        const QJsonObject start = frames[i - 1].toObject();
        const double startT = start.value(u"t").toDouble();
        const std::string easing = end.value(u"easing").isString() ? end.value(u"easing").toString().toStdString() : "linear";
        const double progress = endT == startT ? 1 : ease(easing, clamp01((t - startT) / (endT - startT)));
        const auto a = numberOf(start);
        const auto b = numberOf(end);
        if (a && b) return *a + (*b - *a) * progress;
        // Mixed or string values: the step value; a string is not a number.
        return progress < 1 ? a : b;
    }
    return numberOf(frames.last().toObject());
}

}  // namespace

QString jsToFixed(double value, int digits) {
    if (std::isnan(value)) return QStringLiteral("NaN");
    if (std::abs(value) >= 1e21) {
        // `String(x)`: the shortest round trip, "d.ddde+NN" (the exponent is
        // at least 21 here, so to_chars' two-digit minimum never shows).
        char out[64];
        const auto r = std::to_chars(out, out + sizeof out, value, std::chars_format::scientific);
        return QString::fromLatin1(out, static_cast<qsizetype>(r.ptr - out));
    }
    const bool negative = value < 0;
    const double x = std::abs(value);
    // The exact decimal expansion with spare digits, then round half up on
    // the magnitude ("pick the larger n").
    std::vector<char> buf(400);
    std::snprintf(buf.data(), buf.size(), "%.*f", digits + 30, x);
    std::string s(buf.data());
    const size_t dot = s.find('.');
    std::string intPart = s.substr(0, dot);
    std::string frac = s.substr(dot + 1);
    std::string kept = intPart + frac.substr(0, static_cast<size_t>(digits));
    if (frac[static_cast<size_t>(digits)] >= '5') {
        int i = static_cast<int>(kept.size()) - 1;
        while (i >= 0 && kept[static_cast<size_t>(i)] == '9') kept[static_cast<size_t>(i--)] = '0';
        if (i < 0) kept.insert(kept.begin(), '1');
        else kept[static_cast<size_t>(i)]++;
    }
    const size_t intLen = kept.size() - static_cast<size_t>(digits);
    std::string out = kept.substr(0, intLen);
    if (digits > 0) out += "." + kept.substr(intLen);
    return QString::fromStdString((negative ? "-" : "") + out);
}

QString groupThousands(const QString& integer, const QString& separator) {
    const auto isWord = [](QChar c) {
        const char16_t u = c.unicode();
        return (u >= u'0' && u <= u'9') || (u >= u'a' && u <= u'z') || (u >= u'A' && u <= u'Z') || u == u'_';
    };
    const auto isDigit = [](QChar c) { return c.unicode() >= u'0' && c.unicode() <= u'9'; };
    QString out;
    for (qsizetype i = 0; i < integer.size(); i++) {
        // `\B`, then a run of digits to the end of the digits, 3n long.
        if (i > 0 && isWord(integer[i - 1]) == isWord(integer[i])) {
            qsizetype run = 0;
            while (i + run < integer.size() && isDigit(integer[i + run])) run++;
            if (run > 0 && run % 3 == 0) out += separator;
        }
        out += integer[i];
    }
    return out;
}

QString tickerText(const QJsonObject& animator, double eased) {
    const int decimals =
        static_cast<int>(std::max(0.0, std::min(6.0, animator.value(u"decimals").toDouble(0))));
    const double from = animator.value(u"from").toDouble();
    const double to = animator.value(u"to").toDouble();
    const QString formatted = jsToFixed(from + (to - from) * eased, decimals);
    const double padTo = std::floor(animator.value(u"padTo").toDouble(0));
    QString padded = formatted;
    if (static_cast<double>(padded.size()) < padTo) {
        padded.prepend(QString(static_cast<qsizetype>(padTo) - padded.size(), u'0'));
    }
    const QString separator = animator.value(u"groupSeparator").toString();
    QString grouped = padded;
    if (!separator.isEmpty()) {
        const qsizetype dot = padded.indexOf(u'.');
        const QString integer = dot < 0 ? padded : padded.left(dot);
        const QString fraction = dot < 0 ? QString() : padded.mid(dot);
        grouped = groupThousands(integer, separator) + fraction;
    }
    return animator.value(u"prefix").toString() + grouped + animator.value(u"suffix").toString();
}

double animatedBorderRadius(double base, const QJsonArray& animations,
                            const std::vector<CompiledAnimation>& compiled, double localMs) {
    for (const QJsonValue& av : animations) {
        const QJsonObject a = av.toObject();
        if (a.value(u"enabled") == QJsonValue(false)) continue;
        const auto* c = compiledById(compiled, a.value(u"id").toString());
        if (!c) continue;
        const auto progress = progressOf(*c, localMs);
        if (!progress) continue;
        for (const QJsonValue& tv : a.value(u"styleTracks").toArray()) {
            const auto track = tv.toObject();
            if (track.value(u"target").toString() != u"clip.borderRadius") continue;
            if (const auto value = numericTrackValue(track, *progress)) base = std::max(0.0, *value);
        }
    }
    return base;
}

TextStyle animatedTextStyle(const TextStyle& base, const QJsonArray& animations,
                            const std::vector<CompiledAnimation>& compiled, double localMs) {
    TextStyle style = base;
    // resolveAnimatedStyleTracks: the numeric text targets the box reads.
    for (const QJsonValue& av : animations) {
        const QJsonObject a = av.toObject();
        if (a.value(u"enabled") == QJsonValue(false) || !a.value(u"styleTracks").isArray()) continue;
        const CompiledAnimation* c = compiledById(compiled, a.value(u"id").toString());
        if (!c) continue;
        const auto progress = progressOf(*c, localMs);
        if (!progress) continue;
        for (const QJsonValue& tv : a.value(u"styleTracks").toArray()) {
            const QJsonObject track = tv.toObject();
            const QString target = track.value(u"target").toString();
            if (target != u"text.fontSizePx" && target != u"text.letterSpacingPx" && target != u"text.lineHeight") continue;
            const auto value = numericTrackValue(track, *progress);
            if (!value) continue;
            if (target == u"text.fontSizePx") style.fontSizePx = *value;
            else if (target == u"text.letterSpacingPx") style.letterSpacingPx = *value;
            else style.lineHeight = *value;
        }
    }
    // resolveAnimatedTextContent.
    const QString source = style.text;
    QString result = source;
    for (const QJsonValue& av : animations) {
        const QJsonObject a = av.toObject();
        if (a.value(u"enabled") == QJsonValue(false) || !a.value(u"textAnimator").isObject()) continue;
        const CompiledAnimation* c = compiledById(compiled, a.value(u"id").toString());
        if (!c) continue;
        const auto progress = progressOf(*c, localMs);
        if (!progress) continue;
        const std::string easing = a.value(u"easing").isString() ? a.value(u"easing").toString().toStdString() : "linear";
        const double eased = clamp01(ease(easing, *progress));
        const QJsonObject animator = a.value(u"textAnimator").toObject();
        if (animator.value(u"kind").toString() == u"ticker") {
            result = tickerText(animator, eased);
            continue;
        }
        // Decode: code points, a deterministic scramble before each reveal.
        const QList<uint> chars = source.toUcs4();
        const QList<uint> charset = animator.value(u"charset").isString()
                                        ? animator.value(u"charset").toString().toUcs4()
                                        : QStringLiteral("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").toUcs4();
        const auto decoded = static_cast<qsizetype>(std::floor(eased * static_cast<double>(chars.size())));
        const double frame = std::floor(localMs / 33);
        const double seed = animator.value(u"seed").toDouble(0);
        QList<uint> out;
        for (qsizetype i = 0; i < chars.size(); i++) {
            const uint ch = chars[i];
            const bool space = ch < 0x10000 && isJsSpace(static_cast<char16_t>(ch));
            if (i < decoded || eased >= 1 || space) {
                out.push_back(ch);
                continue;
            }
            const double random = std::abs(std::sin(seed * 127.1 + static_cast<double>(i) * 311.7 + frame * 74.7) * 43758.5453);
            const auto pick = static_cast<qsizetype>(std::floor((random - std::floor(random)) * static_cast<double>(charset.size())));
            out.push_back(pick >= 0 && pick < charset.size() ? charset[pick] : ch);
        }
        result = QString::fromUcs4(reinterpret_cast<const char32_t*>(out.constData()), out.size());
    }
    style.text = result;
    return style;
}

}  // namespace nt::scene
