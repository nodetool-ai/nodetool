#include "bench/BenchReport.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QStringList>

#include <algorithm>
#include <cmath>
#include <numeric>

namespace nt::bench {
namespace {

// Measurements a budget may limit. gpuMs is reported but takes no limit.
const QStringList kMeasurements{QStringLiteral("cpuMs"), QStringLiteral("submitIntervalMs"),
                                QStringLiteral("renderIntervalMs"), QStringLiteral("frameError")};
// Scalar budget keys and whether their limit is a minimum.
const std::map<QString, bool> kScalars{{QStringLiteral("skippedSubmitsFraction"), false},
                                       {QStringLiteral("frameErrorZeroFraction"), true},
                                       {QStringLiteral("cutMisses"), false},
                                       {QStringLiteral("missingMediaFrames"), false},
                                       {QStringLiteral("frameRefCloseMs"), false},
                                       {QStringLiteral("cpuCopies"), false},
                                       {QStringLiteral("framesReleasedInFlight"), false},
                                       {QStringLiteral("decoderCloseMs"), false}};
const QStringList kStats{QStringLiteral("p50"), QStringLiteral("p95"), QStringLiteral("max"),
                         QStringLiteral("count")};

double round3(double v) {
    return std::round(v * 1000.0) / 1000.0;
}

double percentile(const std::vector<double>& sorted, double q) {
    // Nearest rank: the smallest value with at least q of the samples at or below it.
    const auto rank = static_cast<size_t>(std::ceil(q * static_cast<double>(sorted.size())));
    return sorted[std::clamp<size_t>(rank, 1, sorted.size()) - 1];
}

QJsonValue summaryJson(const std::optional<Summary>& s) {
    if (!s || s->count == 0) {
        return QJsonValue();
    }
    return QJsonObject{{QStringLiteral("p50"), round3(s->p50)},
                       {QStringLiteral("p95"), round3(s->p95)},
                       {QStringLiteral("max"), round3(s->max)},
                       {QStringLiteral("count"), s->count}};
}

std::optional<double> statOf(const std::optional<Summary>& s, const QString& stat) {
    if (!s || s->count == 0) {
        return std::nullopt;
    }
    if (stat == u"p50") return s->p50;
    if (stat == u"p95") return s->p95;
    if (stat == u"max") return s->max;
    return static_cast<double>(s->count);
}

// Budget parameters: values the report uses, not limits it checks.
const QString kTargetHz = QStringLiteral("targetHz");
constexpr double kDefaultTargetHz = 60.0;

std::optional<QString> checkKey(const QString& key) {
    if (kScalars.count(key) > 0 || key == kTargetHz) {
        return std::nullopt;
    }
    if (key.startsWith(u"gpuMs.")) {
        return QStringLiteral("'%1': gpuMs is information only (whole window, not the compositor) and takes no limit")
            .arg(key);
    }
    const QStringList parts = key.split(QLatin1Char('.'));
    if (parts.size() != 2 || !kMeasurements.contains(parts[0]) || !kStats.contains(parts[1])) {
        QStringList scalars;
        for (const auto& [name, isMin] : kScalars) scalars << name;
        return QStringLiteral("unknown budget key '%1' (use <%2>.<%3> or %4)")
            .arg(key, kMeasurements.join(u'|'), kStats.join(u'|'), scalars.join(u'|'));
    }
    return std::nullopt;
}

}  // namespace

Summary summarize(std::vector<double> samples) {
    Summary s;
    s.count = static_cast<int>(samples.size());
    if (samples.empty()) {
        return s;
    }
    std::sort(samples.begin(), samples.end());
    s.p50 = percentile(samples, 0.50);
    s.p95 = percentile(samples, 0.95);
    s.max = samples.back();
    return s;
}

double measuredCadenceHz(const std::vector<double>& submitIntervalMs) {
    if (submitIntervalMs.empty()) return 0.0;
    const double p50 = summarize(submitIntervalMs).p50;
    double best = 0.0;
    double bestDistance = 1e300;
    for (const double hz : {120.0, 60.0, 30.0}) {
        const double distance = std::abs(p50 - 1000.0 / hz);
        if (distance < bestDistance) {
            best = hz;
            bestDistance = distance;
        }
    }
    return best;
}

std::optional<int> skippedSubmits(const std::vector<double>& submitIntervalMs, double refreshHz, bool vsync) {
    if (!vsync || refreshHz <= 0.0 || submitIntervalMs.empty()) {
        return std::nullopt;
    }
    const double period = 1000.0 / refreshHz;
    int skipped = 0;
    for (double interval : submitIntervalMs) {
        if (interval > 1.5 * period) {
            skipped += static_cast<int>(std::lround(interval / period)) - 1;
        }
    }
    return skipped;
}

BudgetParse parseBudget(const QString& text) {
    BudgetParse out;
    Budget budget;
    const QString trimmed = text.trimmed();
    if (trimmed.startsWith(QLatin1Char('{'))) {
        QJsonParseError err{};
        const QJsonDocument doc = QJsonDocument::fromJson(trimmed.toUtf8(), &err);
        if (err.error != QJsonParseError::NoError || !doc.isObject()) {
            out.error = QStringLiteral("budget is not a JSON object: %1").arg(err.errorString());
            return out;
        }
        const QJsonObject o = doc.object();
        for (auto it = o.begin(); it != o.end(); ++it) {
            // "_machine", "_note": what a platform budget file was measured
            // on (PLAN M6), not a budget.
            if (it.key().startsWith(QLatin1Char('_'))) continue;
            if (!it.value().isDouble()) {
                out.error = QStringLiteral("budget '%1' is not a number").arg(it.key());
                return out;
            }
            budget[it.key().toStdString()] = it.value().toDouble();
        }
    } else {
        for (const QString& part : trimmed.split(QLatin1Char(','), Qt::SkipEmptyParts)) {
            const QStringList kv = part.split(QLatin1Char('='));
            bool ok = false;
            const double v = kv.size() == 2 ? kv[1].trimmed().toDouble(&ok) : 0.0;
            if (!ok) {
                out.error = QStringLiteral("budget entry '%1' is not key=number").arg(part);
                return out;
            }
            budget[kv[0].trimmed().toStdString()] = v;
        }
    }
    if (budget.empty()) {
        out.error = QStringLiteral("budget is empty");
        return out;
    }
    for (const auto& [key, limit] : budget) {
        if (const auto err = checkKey(QString::fromStdString(key))) {
            out.error = *err;
            return out;
        }
    }
    out.budget = std::move(budget);
    return out;
}

Report buildReport(const BenchData& data, const std::optional<Budget>& budget) {
    std::map<QString, std::optional<Summary>> m;
    m[QStringLiteral("cpuMs")] = summarize(data.cpuMs);
    m[QStringLiteral("renderIntervalMs")] = summarize(data.renderIntervalMs);
    m[QStringLiteral("submitIntervalMs")] = summarize(data.submitIntervalMs);
    m[QStringLiteral("frameError")] = summarize(data.frameError);
    // GPU time is null when under 90% of the frames saw a value (DESIGN.md).
    const bool gpuEnough = static_cast<double>(data.gpuObservationsMs.size()) >= 0.9 * data.frames && data.frames > 0;
    m[QStringLiteral("gpuMs")] = gpuEnough ? std::optional<Summary>(summarize(data.gpuObservationsMs)) : std::nullopt;
    // Skips count against an explicit target rate (the budget's targetHz,
    // else 60 Hz), never the measured cadence: a steady 30 Hz run then misses
    // every other slot of a 60 Hz target. The cadence is information only.
    const double cadenceHz = measuredCadenceHz(data.submitIntervalMs);
    double targetHz = kDefaultTargetHz;
    if (budget) {
        const auto it = budget->find(kTargetHz.toStdString());
        if (it != budget->end() && it->second > 0.0) targetHz = it->second;
    }
    const std::optional<int> skipped = skippedSubmits(data.submitIntervalMs, targetHz, data.vsync);

    Report r;
    QJsonObject o;
    o[QStringLiteral("fixture")] = data.fixture;
    o[QStringLiteral("frames")] = data.frames;
    o[QStringLiteral("warmupFrames")] = data.warmup.frames;
    o[QStringLiteral("warmup")] = QJsonObject{
        {QStringLiteral("maxRenderIntervalMs"), round3(data.warmup.maxRenderIntervalMs)},
        {QStringLiteral("maxRenderIntervalAt"), data.warmup.maxRenderIntervalAt},
        {QStringLiteral("maxCpuMs"), round3(data.warmup.maxCpuMs)},
        {QStringLiteral("maxCpuAt"), data.warmup.maxCpuAt},
    };
    o[QStringLiteral("vsync")] = data.vsync;
    o[QStringLiteral("screenRefreshHz")] = round3(data.refreshHz);
    o[QStringLiteral("measuredCadenceHz")] = cadenceHz > 0.0 ? QJsonValue(cadenceHz) : QJsonValue();
    o[QStringLiteral("targetHz")] = targetHz;
    o[QStringLiteral("layersMax")] = data.layersMax;
    for (const auto& [name, summary] : m) {
        o[name] = summaryJson(summary);
    }
    o[QStringLiteral("gpuObservations")] = static_cast<int>(data.gpuObservationsMs.size());
    o[QStringLiteral("skippedSubmits")] = skipped ? QJsonValue(*skipped) : QJsonValue();
    const std::optional<double> skippedFraction =
        skipped && data.frames > 0 ? std::optional<double>(static_cast<double>(*skipped) / data.frames) : std::nullopt;
    o[QStringLiteral("skippedSubmitsFraction")] = skippedFraction ? QJsonValue(*skippedFraction) : QJsonValue();
    std::map<QString, std::optional<double>> scalars;
    scalars[QStringLiteral("skippedSubmitsFraction")] = skippedFraction;
    // Every frame with a media layer counts: a missing picture is not correct.
    const std::optional<double> zeroFraction =
        data.mediaFrames > 0 ? std::optional<double>(static_cast<double>(data.correctMediaFrames) / data.mediaFrames)
                             : std::nullopt;
    scalars[QStringLiteral("frameErrorZeroFraction")] = zeroFraction;
    scalars[QStringLiteral("cutMisses")] = data.frames > 0 ? std::optional<double>(data.cutMisses) : std::nullopt;
    scalars[QStringLiteral("missingMediaFrames")] =
        data.mediaFrames > 0 ? std::optional<double>(data.missingMediaFrames) : std::nullopt;
    scalars[QStringLiteral("decoderCloseMs")] = data.decoderCloseMs;
    scalars[QStringLiteral("frameRefCloseMs")] = data.frameRefCloseMs;
    scalars[QStringLiteral("framesReleasedInFlight")] = static_cast<double>(data.framesReleasedInFlight);
    scalars[QStringLiteral("cpuCopies")] =
        data.frames > 0 ? std::optional<double>(static_cast<double>(data.cpuCopies)) : std::nullopt;
    o[QStringLiteral("realtime")] = data.realtime;
    {
        QJsonArray stalls;
        for (const auto& st : data.stalls) {
            if (stalls.size() >= 20) break;
            stalls.append(QJsonObject{{QStringLiteral("frame"), st.frame},
                                      {QStringLiteral("atMs"), round3(st.atMs)},
                                      {QStringLiteral("intervalMs"), round3(st.intervalMs)},
                                      {QStringLiteral("cpuMs"), round3(st.cpuMs)}});
        }
        o[QStringLiteral("stallCount")] = static_cast<int>(data.stalls.size());
        o[QStringLiteral("exposureLosses")] = data.exposureLosses;
        o[QStringLiteral("framesReleasedInFlight")] = data.framesReleasedInFlight;
        o[QStringLiteral("stalls")] = stalls;
        if (!data.scheduling.isEmpty()) o[QStringLiteral("scheduling")] = data.scheduling;
    }
    o[QStringLiteral("decode")] = data.decode;
    o[QStringLiteral("cpuCopies")] = static_cast<double>(data.cpuCopies);
    o[QStringLiteral("hardwareLayerFrames")] = static_cast<double>(data.hardwareLayerFrames);
    o[QStringLiteral("frameRefCloseMs")] = data.frameRefCloseMs ? QJsonValue(round3(*data.frameRefCloseMs)) : QJsonValue();
    if (data.cpuWallMs > 0.0) {
        const auto value = [](const std::optional<double>& v) { return v ? QJsonValue(round3(*v)) : QJsonValue(); };
        const std::optional<double> render = data.guiAndRenderShareThread ? std::optional<double>(0.0) : data.renderCpuPercent;
        std::optional<double> other;
        if (data.processCpuPercent && data.mainCpuPercent && render) {
            other = *data.processCpuPercent - *data.mainCpuPercent - *render;
        }
        o[QStringLiteral("cpu")] = QJsonObject{
            {QStringLiteral("wallMs"), round3(data.cpuWallMs)},
            {QStringLiteral("processPercent"), value(data.processCpuPercent)},
            {QStringLiteral("mainThreadPercent"), value(data.mainCpuPercent)},
            {QStringLiteral("renderThreadPercent"),
             data.guiAndRenderShareThread ? QJsonValue() : value(data.renderCpuPercent)},
            {QStringLiteral("guiAndRenderShareThread"), data.guiAndRenderShareThread},
            {QStringLiteral("decodeAndOtherPercent"), value(other)},
        };
    } else {
        o[QStringLiteral("cpu")] = QJsonValue();
    }
    o[QStringLiteral("frameErrorZeroFraction")] = zeroFraction ? QJsonValue(*zeroFraction) : QJsonValue();
    o[QStringLiteral("heldFrames")] = data.heldFrames;
    o[QStringLiteral("cutMisses")] = data.cutMisses;
    o[QStringLiteral("missingLayerFrames")] = data.missingLayerFrames;
    o[QStringLiteral("mediaFrames")] = data.mediaFrames;
    o[QStringLiteral("missingMediaFrames")] = data.missingMediaFrames;
    o[QStringLiteral("openDecodersMax")] = data.openDecodersMax;
    o[QStringLiteral("decoderCloseMs")] = data.decoderCloseMs ? QJsonValue(round3(*data.decoderCloseMs)) : QJsonValue();
    o[QStringLiteral("window")] = QJsonObject{
        {QStringLiteral("width"), data.windowWidth},
        {QStringLiteral("height"), data.windowHeight},
        {QStringLiteral("devicePixelRatio"), data.devicePixelRatio},
        {QStringLiteral("physicalWidth"), static_cast<int>(std::lround(data.windowWidth * data.devicePixelRatio))},
        {QStringLiteral("physicalHeight"), static_cast<int>(std::lround(data.windowHeight * data.devicePixelRatio))},
    };
    o[QStringLiteral("method")] = QJsonObject{
        {QStringLiteral("cpuMs"), QStringLiteral("render() body, steady clock")},
        {QStringLiteral("gpuMs"),
         QStringLiteral("QRhiCommandBuffer::lastCompletedGpuTime polled per frame: whole window, earlier frame, can repeat")},
        {QStringLiteral("submitIntervalMs"),
         QStringLiteral("QQuickWindow::frameSwapped on the render thread: frame queued, not presented")},
        {QStringLiteral("skippedSubmits"),
         QStringLiteral("submission intervals over 1.5 periods of targetHz (budget, default 60): round(interval / period) - 1 each")},
        {QStringLiteral("cpu"),
         QStringLiteral("getrusage for the process, Mach thread_info for the GUI and render threads; the rest is "
                        "decode workers, FFmpeg/VideoToolbox threads and Qt")},
        {QStringLiteral("frameError"),
         QStringLiteral("per frame, the largest |shown - expected| source frame index over media layers")},
    };
    // The original bench fields, from the render intervals.
    const double wall = std::accumulate(data.renderIntervalMs.begin(), data.renderIntervalMs.end(), 0.0);
    o[QStringLiteral("wall_ms")] = round3(wall);

    if (budget) {
        QJsonArray results;
        for (const auto& [key, limit] : *budget) {
            if (QString::fromStdString(key) == kTargetHz) continue;  // a parameter, not a limit
            BudgetResult br;
            br.key = key;
            br.limit = limit;
            const QString k = QString::fromStdString(key);
            if (kScalars.count(k) > 0) {
                br.value = scalars[k];
                br.pass = br.value && (kScalars.at(k) ? *br.value >= limit : *br.value <= limit);
            } else {
                const QStringList parts = k.split(QLatin1Char('.'));
                br.value = statOf(m[parts[0]], parts[1]);
                br.pass = br.value && (parts[1] == u"count" ? *br.value >= limit : *br.value <= limit);
            }
            r.pass = r.pass && br.pass;
            results.append(QJsonObject{{QStringLiteral("key"), k},
                                       {QStringLiteral("limit"), limit},
                                       {QStringLiteral("value"), br.value ? QJsonValue(round3(*br.value)) : QJsonValue()},
                                       {QStringLiteral("pass"), br.pass},
                                       {QStringLiteral("reason"), br.value ? (br.pass ? QStringLiteral("ok")
                                                                                       : QStringLiteral("over limit"))
                                                                           : QStringLiteral("no samples")}});
            r.budget.push_back(br);
        }
        if (data.exposureLosses > 0) {
            // The window was covered: the run measured the window manager,
            // not the compositor. It fails whatever the numbers say.
            r.pass = false;
            results.append(QJsonObject{{QStringLiteral("key"), QStringLiteral("exposedThroughout")},
                                       {QStringLiteral("limit"), 0},
                                       {QStringLiteral("value"), data.exposureLosses},
                                       {QStringLiteral("pass"), false},
                                       {QStringLiteral("reason"), QStringLiteral("window lost exposure")}});
        }
        o[QStringLiteral("budget")] = QJsonObject{{QStringLiteral("pass"), r.pass}, {QStringLiteral("results"), results}};
    }
    r.json = o;
    return r;
}

}  // namespace nt::bench
