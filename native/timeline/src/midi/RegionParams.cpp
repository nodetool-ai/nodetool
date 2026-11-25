#include "midi/RegionParams.h"
#include <QJsonArray>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <optional>
#include <unordered_map>
#include <vector>
namespace nt::midi {
namespace {
double ticks(double ms, double bpm) { return ms * bpm * 960 / 60000; }
std::int64_t rounded(double value) { return static_cast<std::int64_t>(std::floor(value + 0.5)); }
int roundedClamp(double value, int lo, int hi) { return static_cast<int>(std::clamp(std::floor(value + 0.5), double(lo), double(hi))); }
std::optional<double> quantizeDivisionTicks(const QString& grid) noexcept {
    if (grid == u"1/4") return static_cast<double>(960);
    if (grid == u"1/8") return static_cast<double>(960) / 2.0;
    if (grid == u"1/16") return static_cast<double>(960) / 4.0;
    if (grid == u"1/32") return static_cast<double>(960) / 8.0;
    if (grid == u"1/8T") return (static_cast<double>(960) / 2.0) * (2.0 / 3.0);
    if (grid == u"1/16T") return (static_cast<double>(960) / 4.0) * (2.0 / 3.0);
    return std::nullopt;
}

double expressionValueAt(const QJsonArray& points, double tick, double neutral) {
    if (points.isEmpty() || tick < points.at(0).toObject().value(u"tick").toDouble()) return neutral;
    const auto last = points.at(points.size() - 1).toObject();
    if (tick >= last.value(u"tick").toDouble()) return last.value(u"value").toDouble();
    for (qsizetype i = 1; i < points.size(); ++i) {
        const auto b = points.at(i).toObject();
        const double bt = b.value(u"tick").toDouble();
        if (tick < bt) {
            const auto a = points.at(i - 1).toObject();
            const double at = a.value(u"tick").toDouble();
            const double span = bt - at;
            const double av = a.value(u"value").toDouble();
            const double bv = b.value(u"value").toDouble();
            return span <= 0.0 ? bv : av + ((bv - av) * (tick - at)) / span;
        }
    }
    return last.value(u"value").toDouble();
}

QJsonObject fitExpressionToDuration(QJsonObject note) {
    if (!note.value(u"expression").isObject()) return note;
    const auto expr = note.value(u"expression").toObject();
    const double dur = note.value(u"durationTick").toDouble();
    struct Spec {
        QLatin1StringView key;
        double neutral = 0;
    };
    constexpr std::array<Spec, 4> kSpecs{{
        {QLatin1StringView("pitch"), 0.0},
        {QLatin1StringView("volume"), 1.0},
        {QLatin1StringView("pan"), 0.0},
        {QLatin1StringView("brightness"), 0.5},
    }};
    QJsonObject nextExpr;
    bool changed = false;
    for (const auto& s : kSpecs) {
        const QString k = QString(s.key);
        if (!expr.value(k).isArray()) continue;
        const auto pts = expr.value(k).toArray();
        bool allInside = true;
        for (const auto& pv : pts) {
            if (pv.toObject().value(u"tick").toDouble() > dur) {
                allInside = false;
                break;
            }
        }
        if (allInside) {
            nextExpr.insert(k, pts);
            continue;
        }
        changed = true;
        QJsonArray kept;
        for (const auto& pv : pts) {
            if (pv.toObject().value(u"tick").toDouble() <= dur) kept.append(pv);
        }
        const double endVal = expressionValueAt(pts, dur, s.neutral);
        if (kept.isEmpty() || kept.at(kept.size() - 1).toObject().value(u"tick").toDouble() < dur) {
            kept.append(QJsonObject{{QStringLiteral("tick"), dur}, {QStringLiteral("value"), endVal}});
        }
        nextExpr.insert(k, kept);
    }
    if (changed) note.insert(QStringLiteral("expression"), nextExpr);
    return note;
}

bool notesOverlap(const QJsonObject& a, const QJsonObject& b) noexcept {
    const std::int64_t a0 = static_cast<std::int64_t>(a.value(u"startTick").toDouble());
    const std::int64_t a1 = a0 + static_cast<std::int64_t>(a.value(u"durationTick").toDouble());
    const std::int64_t b0 = static_cast<std::int64_t>(b.value(u"startTick").toDouble());
    const std::int64_t b1 = b0 + static_cast<std::int64_t>(b.value(u"durationTick").toDouble());
    return a0 < b1 && b0 < a1;
}

QJsonArray applyMidiRegionParamsToExpandedNotes(const QJsonArray& rawNotes, const QJsonObject& clip, double bpm,
                                                double gridOffsetMs) {
    std::vector<QJsonObject> out;
    out.reserve(static_cast<std::size_t>(rawNotes.size()));
    for (const auto& v : rawNotes) out.push_back(v.toObject());

    const auto q = clip.value(u"quantize").toObject();
    const double qStrength = q.value(u"strength").toDouble(0.0);
    if (!q.isEmpty() && std::isfinite(qStrength) && qStrength > 0.0) {
        if (const auto gridOpt = quantizeDivisionTicks(q.value(u"grid").toString())) {
            const double grid = *gridOpt;
            const double strength = std::clamp(qStrength / 100.0, 0.0, 1.0);
            const double phase = ticks(gridOffsetMs - clip.value(u"startMs").toDouble() + clip.value(u"inPointMs").toDouble(), bpm);
            const std::int64_t from = rounded(ticks(clip.value(u"inPointMs").toDouble(), bpm));
            const double duration = clip.value(u"durationMs").toDouble();
            const double loop = clip.value(u"loopLengthMs").toDouble();
            const std::int64_t to = rounded(ticks(clip.value(u"inPointMs").toDouble() + (loop > 0 && loop < duration ? loop : duration), bpm));

            std::vector<QJsonObject> raw = out;
            for (std::size_t i = 0; i < out.size(); ++i) {
                const double rawStart = raw[i].value(u"startTick").toDouble();
                const double k = rounded((rawStart - phase) / grid);
                const double startTarget = phase + k * grid;
                const std::int64_t qStart =
                    std::max<std::int64_t>(0, rounded(rawStart + (startTarget - rawStart) * strength));
                const bool wasShown = static_cast<std::int64_t>(rawStart) >= from &&
                                      static_cast<std::int64_t>(rawStart) < to;
                const bool isShown = qStart >= from && qStart < to;
                out[i].insert(QStringLiteral("startTick"),
                              static_cast<double>(wasShown && !isShown ? static_cast<std::int64_t>(rawStart) : qStart));
            }

            // Only overlaps introduced by quantize shorten notes. Stored overlaps keep their sound.
            std::unordered_map<std::int64_t, std::vector<std::size_t>> groups;
            for (std::size_t i = 0; i < out.size(); ++i) {
                if (out[i].value(u"muted").toBool(false)) continue;
                const int ch = out[i].value(u"channel").toInt(0);
                const int pitch = out[i].value(u"pitch").toInt(0);
                groups[(static_cast<std::int64_t>(ch) << 8) | pitch].push_back(i);
            }
            std::vector<bool> dropped(out.size(), false);
            for (auto& [_, idxs] : groups) {
                if (idxs.size() < 2) continue;
                std::stable_sort(idxs.begin(), idxs.end(), [&](std::size_t x, std::size_t y) {
                    return out[x].value(u"startTick").toDouble() < out[y].value(u"startTick").toDouble();
                });
                for (std::size_t k = 0; k + 1 < idxs.size(); ++k) {
                    const std::size_t a = idxs[k];
                    const std::size_t b = idxs[k + 1];
                    if (!notesOverlap(out[a], out[b]) || notesOverlap(raw[a], raw[b])) continue;
                    const std::int64_t gap = static_cast<std::int64_t>(out[b].value(u"startTick").toDouble()) -
                                             static_cast<std::int64_t>(out[a].value(u"startTick").toDouble());
                    if (gap <= 0) {
                        dropped[a] = true;
                    } else {
                        out[a].insert(QStringLiteral("durationTick"), static_cast<double>(gap));
                        out[a] = fitExpressionToDuration(std::move(out[a]));
                    }
                }
            }
            std::vector<QJsonObject> filtered;
            filtered.reserve(out.size());
            for (std::size_t i = 0; i < out.size(); ++i) {
                if (!dropped[i]) filtered.push_back(std::move(out[i]));
            }
            out = std::move(filtered);
        }
    }

    const int transpose = roundedClamp(clip.value(u"transpose").toDouble(0.0), -127, 127);
    if (transpose != 0) {
        for (auto& n : out) {
            const int p = std::clamp(n.value(u"pitch").toInt(60) + transpose, 0, 127);
            n.insert(QStringLiteral("pitch"), p);
        }
    }
    const double velOffset = clip.value(u"velocityOffset").toDouble(0.0);
    if (std::isfinite(velOffset) && velOffset != 0.0) {
        for (auto& n : out) {
            const int v = roundedClamp(n.value(u"velocity").toDouble(100.0) + velOffset, 1, 127);
            n.insert(QStringLiteral("velocity"), v);
        }
    }

    QJsonArray res;
    for (auto& n : out) res.append(std::move(n));
    return res;
}

}
QJsonObject bakeRegionQuantize(QJsonObject clip, double bpm, double gridOffsetMs) {
    if (!clip.contains("quantize")) { return clip; }
    auto quantized = clip;
    quantized.remove("transpose"); quantized.remove("velocityOffset");
    if (clip.contains("notes")) {
        clip.insert("notes", applyMidiRegionParamsToExpandedNotes(clip.value("notes").toArray(), quantized, bpm, gridOffsetMs));
    }
    clip.remove("quantize");
    return clip;
}
QJsonObject applyRegionParams(QJsonObject clip, double bpm, double gridOffsetMs) {
    if (clip.value("transpose").toDouble() == 0 && clip.value("velocityOffset").toDouble() == 0 &&
        clip.value("quantize").toObject().value("strength").toDouble() <= 0) { return clip; }
    if (clip.contains("notes")) {
        clip.insert("notes", applyMidiRegionParamsToExpandedNotes(clip.value("notes").toArray(), clip, bpm, gridOffsetMs));
    }
    const int transpose = roundedClamp(clip.value("transpose").toDouble(), -48, 48);
    if (transpose && clip.contains("controllers")) {
        auto lanes = clip.value("controllers").toArray();
        for (qsizetype i = 0; i < lanes.size(); ++i) {
            auto lane = lanes[i].toObject();
            if (lane.value("kind").toString() == u"polyPressure" && lane.contains("pitch")) {
                lane.insert("pitch", std::clamp(lane.value("pitch").toInt() + transpose, 0, 127));
                lanes[i] = lane;
            }
        }
        clip.insert("controllers", lanes);
    }
    clip.remove("transpose"); clip.remove("velocityOffset"); clip.remove("quantize");
    return clip;
}
}
