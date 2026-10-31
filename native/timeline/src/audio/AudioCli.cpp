#include "audio/AudioCli.h"
#include "audio/AvSyncInterpolation.h"

#include "audio/AudioEngine.h"
#include "audio/LoopbackCapture.h"
#include "audio/Mixer.h"
#include "model/TimelineJson.h"
#include "playback/AudioClockFeed.h"
#include "playback/PlaybackClock.h"
#include "server/ServerSource.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <thread>

namespace nt::audio {
namespace {

std::int64_t steadyNowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

void printJson(const QJsonObject& o) {
    std::printf("%s\n", QJsonDocument(o).toJson(QJsonDocument::Compact).constData());
    std::fflush(stdout);
}

// Frames where a click starts: the first frame at or above `threshold` after
// at least `quietFrames` frames below 1e-3 on both channels. Up to two
// frames between them may lie in [1e-3, threshold): a click that starts
// between two samples has an interpolated first sample below the threshold.
std::vector<std::int64_t> detectOnsets(const std::vector<float>& stereo, double threshold, std::int64_t quietFrames) {
    std::vector<std::int64_t> onsets;
    std::int64_t quiet = quietFrames;  // the current run of frames below 1e-3
    std::int64_t quietBefore = 0;      // the run that ended before the current edge
    std::int64_t edge = 0;             // frames in [1e-3, threshold) since it ended
    bool armed = true;                 // no frame at or above the threshold since the quiet run
    const auto frames = static_cast<std::int64_t>(stereo.size() / 2);
    for (std::int64_t f = 0; f < frames; ++f) {
        const double a = std::max(std::abs(stereo[2 * f]), std::abs(stereo[2 * f + 1]));
        if (a < 1e-3) {
            ++quiet;
            edge = 0;
            if (quiet >= quietFrames) armed = true;
            continue;
        }
        if (quiet > 0) quietBefore = quiet;
        quiet = 0;
        if (a < threshold) {
            ++edge;
            continue;
        }
        if (armed && quietBefore >= quietFrames && edge <= 2) onsets.push_back(f);
        armed = false;
        edge = 0;
    }
    return onsets;
}

// Timeline times of the clicks the plan sounds: source time k * period of
// each voice, placed by its start, in-point and source rate, where its fade
// leaves it audible.
std::vector<double> expectedClicks(const MixPlan& plan, double periodMs, double fromMs, double toMs) {
    std::vector<double> out;
    for (const VoicePlan& v : plan.voices) {
        const double srcFrom = v.inPointMs;
        const double srcTo = v.inPointMs + v.durationMs * v.sourceRate;
        for (double k = std::ceil(srcFrom / periodMs); k * periodMs < srcTo; k += 1.0) {
            const double t = v.startMs + (k * periodMs - v.inPointMs) / v.sourceRate;
            if (t < fromMs || t >= toMs) continue;
            if (clipFadeGain(v.fades, v.durationMs, t - v.startMs) * v.clipGain * v.trackGain < 0.2) continue;
            out.push_back(t);
        }
    }
    std::sort(out.begin(), out.end());
    return out;
}

struct Match {
    QJsonArray rows;
    double maxErrorMs = 0.0;
    int matched = 0;
    int missing = 0;
    int extra = 0;
};

// Pairs each expected click with the nearest detected one (both in ms).
Match matchClicks(const std::vector<double>& expected, const std::vector<double>& detected, double toleranceMs) {
    Match m;
    std::vector<bool> used(detected.size(), false);
    for (double e : expected) {
        int best = -1;
        for (std::size_t i = 0; i < detected.size(); ++i) {
            if (used[i]) continue;
            if (best < 0 || std::abs(detected[i] - e) < std::abs(detected[static_cast<std::size_t>(best)] - e)) {
                best = static_cast<int>(i);
            }
        }
        if (best < 0 || std::abs(detected[static_cast<std::size_t>(best)] - e) > 50.0) {
            ++m.missing;
            m.rows.append(QJsonObject{{QStringLiteral("expectedMs"), e}, {QStringLiteral("found"), false}});
            continue;
        }
        used[static_cast<std::size_t>(best)] = true;
        const double err = detected[static_cast<std::size_t>(best)] - e;
        m.maxErrorMs = std::max(m.maxErrorMs, std::abs(err));
        if (std::abs(err) <= toleranceMs) ++m.matched;
        m.rows.append(QJsonObject{{QStringLiteral("expectedMs"), e},
                                  {QStringLiteral("foundMs"), detected[static_cast<std::size_t>(best)]},
                                  {QStringLiteral("errorMs"), err}});
    }
    m.extra = static_cast<int>(std::count(used.begin(), used.end(), false));
    return m;
}

}  // namespace

int renderAudioCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption outOpt(QStringLiteral("render-audio"), QStringLiteral("Raw f32le stereo output"),
                                    QStringLiteral("FILE"));
    const QCommandLineOption fromOpt(QStringLiteral("from"), QStringLiteral("Start in ms"), QStringLiteral("MS"),
                                     QStringLiteral("0"));
    const QCommandLineOption toOpt(QStringLiteral("to"), QStringLiteral("End in ms (default: durationMs)"),
                                   QStringLiteral("MS"));
    const QCommandLineOption rateOpt(QStringLiteral("rate"), QStringLiteral("Sample rate"), QStringLiteral("HZ"),
                                     QStringLiteral("48000"));
    parser.addOptions({outOpt, fromOpt, toOpt, rateOpt});
    parser.process(app);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --render-audio OUT.f32 [--from MS] [--to MS]\n");
        return 2;
    }
    // A fixture file, or the timeline that --server URL --timeline ID names
    // (src/server/ServerSource.h).
    const auto loaded = server::loadTimelineSource(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const Timeline& tl = *loaded.timeline;
    const double from = parser.value(fromOpt).toDouble();
    const double to = parser.isSet(toOpt) ? parser.value(toOpt).toDouble() : tl.durationMs;
    const int rate = parser.value(rateOpt).toInt();
    std::vector<std::string> report;
    const auto pcm = renderOffline(tl, rate, from, to - from, &report);
    QFile out(parser.value(outOpt));
    if (!out.open(QIODevice::WriteOnly) ||
        out.write(reinterpret_cast<const char*>(pcm.data()), static_cast<qint64>(pcm.size() * sizeof(float))) !=
            static_cast<qint64>(pcm.size() * sizeof(float))) {
        std::fprintf(stderr, "error: cannot write %s\n", qPrintable(parser.value(outOpt)));
        return 1;
    }
    QJsonArray voices;
    for (const VoicePlan& v : buildMixPlan(tl).voices) voices.append(QString::fromStdString(v.clipId));
    QJsonArray problems;
    for (const auto& line : report) problems.append(QString::fromStdString(line));
    double peak = 0.0;
    for (float s : pcm) peak = std::max(peak, static_cast<double>(std::abs(s)));
    printJson(QJsonObject{{QStringLiteral("frames"), static_cast<qint64>(pcm.size() / 2)},
                          {QStringLiteral("sampleRate"), rate},
                          {QStringLiteral("fromMs"), from},
                          {QStringLiteral("voices"), voices},
                          {QStringLiteral("problems"), problems},
                          {QStringLiteral("peak"), peak}});
    return problems.isEmpty() ? 0 : 1;
}

int avSyncCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption avOpt(QStringLiteral("av-sync"), QStringLiteral("Run the headless A/V sync check"));
    const QCommandLineOption periodOpt(QStringLiteral("period-ms"), QStringLiteral("Click period in source time"),
                                       QStringLiteral("MS"), QStringLiteral("1000"));
    const QCommandLineOption secondsOpt(QStringLiteral("seconds"), QStringLiteral("Real-time run length"),
                                        QStringLiteral("S"), QStringLiteral("6"));
    const QCommandLineOption latencyOpt(QStringLiteral("latency-ms"),
                                        QStringLiteral("Null device output latency (the second half doubles it)"),
                                        QStringLiteral("MS"), QStringLiteral("25"));
    const QCommandLineOption jsonOpt(QStringLiteral("json"), QStringLiteral("Print JSON (always on)"));
    parser.addOptions({avOpt, periodOpt, secondsOpt, latencyOpt, jsonOpt});
    parser.process(app);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --av-sync [--period-ms MS] [--seconds S]\n");
        return 2;
    }
    const auto loaded = loadTimelineFile(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const auto timeline = std::make_shared<const Timeline>(*loaded.timeline);
    const double periodMs = parser.value(periodOpt).toDouble();
    const double seconds = parser.value(secondsOpt).toDouble();
    const double latencyMs = parser.value(latencyOpt).toDouble();
    constexpr int kRate = 48000;
    constexpr double kToleranceMs = 1.0;
    const MixPlan plan = buildMixPlan(*timeline);

    // 1. Offline.
    const auto offline = renderOffline(*timeline, kRate, 0.0, timeline->durationMs);
    std::vector<double> offlineMs;
    for (std::int64_t f : detectOnsets(offline, 0.05, kRate / 200)) offlineMs.push_back(f * 1000.0 / kRate);
    const auto expectedOffline = expectedClicks(plan, periodMs, 0.0, timeline->durationMs);
    const Match off = matchClicks(expectedOffline, offlineMs, kToleranceMs);

    // 2. Null device in real time.
    AudioEngine engine;
    AudioEngine::Options options;
    options.backend = AudioEngine::Backend::Null;
    options.sampleRate = kRate;
    options.periodFrames = 480;
    options.simulatedLatencySec = latencyMs / 1000.0;
    options.recordSeconds = seconds + 2.0;
    engine.setTimeline(timeline);
    std::string error;
    if (!engine.start(options, &error)) {
        std::fprintf(stderr, "error: %s\n", error.c_str());
        return 1;
    }
    PlaybackClock clock;
    std::int64_t tickNow = steadyNowNs();
    clock.setNowSource([&]() { return tickNow; });
    clock.setDurationMs(timeline->durationMs);
    clock.setLoop(false);
    clock.setAudioFeed(&engine.feed());
    std::vector<AvSyncSample> samples;
    const auto requestNs = steadyNowNs();
    clock.seek(0.0);
    clock.play();
    bool changed = false;
    const std::int64_t endNs = requestNs + static_cast<std::int64_t>(seconds * 1e9);
    std::uint64_t changeGeneration = 0;
    while (steadyNowNs() < endNs) {
        tickNow = steadyNowNs();
        const playback::DeviceInfo dev = engine.feed().device.load();
        const playback::CallbackState cb = engine.feed().callback.load();
        clock.tick();
        const double clockMs = clock.time();
        const playback::CallbackState after = engine.feed().callback.load();
        if (clock.audioMaster()) {
            // time() is cached by tick(). Reject a callback published during
            // that tick so the measured frames use the same buffer.
            if (cb.hostTimeNs == after.hostTimeNs && cb.framesAtStart == after.framesAtStart) {
                const auto reading = playback::audibleTimeline(cb, dev, tickNow);
                const auto command = engine.feed().command.load();
                samples.push_back({reading.audibleFrames, clockMs, dev.generation,
                                   reading.held || cb.cur().seekSeq != command.seekSeq});
            }
        }
        if (!changed && tickNow - requestNs > static_cast<std::int64_t>(seconds * 0.5e9)) {
            changed = true;
            engine.simulateDeviceChange(2.0 * latencyMs / 1000.0);
            changeGeneration = engine.feed().device.load().generation;
        }
        std::this_thread::sleep_for(std::chrono::microseconds(4000));
    }
    clock.pause();
    const AudioEngine::Stats stats = engine.stats();
    engine.stop();
    const auto recording = engine.recording();

    // Each click in the device output: the clock time when that frame was
    // audible, interpolated between the two ticks around it. Samples from
    // before a device change are not mixed with samples after it.
    std::vector<double> liveMs;
    std::vector<double> liveAfterChange;
    for (std::int64_t f : detectOnsets(recording, 0.05, kRate / 200)) {
        if (const auto click = interpolateAvSyncClick(samples, static_cast<double>(f))) {
            liveMs.push_back(click->clockMs);
            if (click->generation == changeGeneration) { liveAfterChange.push_back(click->clockMs); }
        }
    }
    const double lastMs = samples.empty() ? 0.0 : samples.back().clockMs;
    const auto expectedLive = expectedClicks(plan, periodMs, 0.0, lastMs - 20.0);
    const Match live = matchClicks(expectedLive, liveMs, kToleranceMs);

    const bool offlineOk = !expectedOffline.empty() && off.missing == 0 && off.extra == 0 &&
                           off.matched == static_cast<int>(expectedOffline.size());
    const bool liveOk = !expectedLive.empty() && live.missing == 0 && live.matched == static_cast<int>(expectedLive.size()) &&
                        !liveAfterChange.empty();
    const bool statsOk = stats.underruns == 0 && stats.lateStarts == 0 && stats.openFailures == 0 &&
                         stats.decodeErrors == 0 && stats.lastPlayStartMs >= 0.0 &&
                         stats.lastPlayStartMs < 300.0;
    const bool pass = offlineOk && liveOk && statsOk;
    printJson(QJsonObject{
        {QStringLiteral("pass"), pass},
        {QStringLiteral("toleranceMs"), kToleranceMs},
        {QStringLiteral("offline"),
         QJsonObject{{QStringLiteral("pass"), offlineOk},
                     {QStringLiteral("expected"), static_cast<int>(expectedOffline.size())},
                     {QStringLiteral("matched"), off.matched},
                     {QStringLiteral("missing"), off.missing},
                     {QStringLiteral("extra"), off.extra},
                     {QStringLiteral("maxErrorMs"), off.maxErrorMs},
                     {QStringLiteral("clicks"), off.rows}}},
        {QStringLiteral("nullDevice"),
         QJsonObject{{QStringLiteral("pass"), liveOk},
                     {QStringLiteral("expected"), static_cast<int>(expectedLive.size())},
                     {QStringLiteral("matched"), live.matched},
                     {QStringLiteral("missing"), live.missing},
                     {QStringLiteral("maxErrorMs"), live.maxErrorMs},
                     {QStringLiteral("clicksAfterDeviceChange"), static_cast<int>(liveAfterChange.size())},
                     {QStringLiteral("clicks"), live.rows},
                     {QStringLiteral("ticks"), static_cast<qint64>(samples.size())}}},
        {QStringLiteral("engine"),
         QJsonObject{{QStringLiteral("pass"), statsOk},
                     {QStringLiteral("backend"), QString::fromStdString(stats.backend)},
                     {QStringLiteral("underruns"), static_cast<qint64>(stats.underruns)},
                     {QStringLiteral("openFailures"), static_cast<qint64>(stats.openFailures)},
                     {QStringLiteral("decodeErrors"), static_cast<qint64>(stats.decodeErrors)},
                     {QStringLiteral("lateStarts"), static_cast<qint64>(stats.lateStarts)},
                     {QStringLiteral("waitBlocks"), static_cast<qint64>(stats.waitBlocks)},
                     {QStringLiteral("playStartMs"), stats.lastPlayStartMs},
                     {QStringLiteral("callbacks"), static_cast<qint64>(stats.callbacks)},
                     {QStringLiteral("sessions"), static_cast<qint64>(stats.sessions)},
                     {QStringLiteral("latencyMs"), stats.outputLatencySec * 1000.0}}}});
    return pass ? 0 : 1;
}

namespace {
QJsonObject devicesJson(const AudioDeviceList& list) {
    QJsonArray playback, capture;
    for (const auto& n : list.playback) playback.append(QString::fromStdString(n));
    for (const auto& n : list.capture) capture.append(QString::fromStdString(n));
    return QJsonObject{{QStringLiteral("playback"), playback},
                       {QStringLiteral("capture"), capture},
                       {QStringLiteral("defaultPlayback"), QString::fromStdString(list.defaultPlayback)},
                       {QStringLiteral("loopback"), QString::fromStdString(list.loopback)}};
}
}  // namespace

int audioDevicesCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    std::string error;
    const AudioDeviceList list = listAudioDevices(&error);
    QJsonObject o = devicesJson(list);
    if (!error.empty()) o.insert(QStringLiteral("error"), QString::fromStdString(error));
    printJson(o);
    return error.empty() ? 0 : 1;
}

int avSyncLiveCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption liveOpt(QStringLiteral("av-sync-live"), QStringLiteral("Run the live A/V sync check"));
    const QCommandLineOption periodOpt(QStringLiteral("period-ms"), QStringLiteral("Click period in source time"),
                                       QStringLiteral("MS"), QStringLiteral("1000"));
    const QCommandLineOption secondsOpt(QStringLiteral("seconds"), QStringLiteral("Run length"), QStringLiteral("S"),
                                        QStringLiteral("60"));
    const QCommandLineOption toleranceOpt(QStringLiteral("tolerance-ms"), QStringLiteral("Pass band"),
                                          QStringLiteral("MS"), QStringLiteral("33"));
    parser.addOptions({liveOpt, periodOpt, secondsOpt, toleranceOpt});
    parser.process(app);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --av-sync-live [--seconds S]\n");
        return 2;
    }
    std::string error;
    const AudioDeviceList devices = listAudioDevices(&error);
    if (devices.loopback.empty()) {
        // Fail closed: without a loopback nothing can be measured, so no
        // sound is played.
        printJson(QJsonObject{{QStringLiteral("pass"), false},
                              {QStringLiteral("error"),
                               QStringLiteral("no loopback capture device (BlackHole, Loopback, Soundflower, or "
                                              "NT_LOOPBACK_DEVICE)")},
                              {QStringLiteral("devices"), devicesJson(devices)}});
        return 1;
    }
    const auto loaded = loadTimelineFile(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const auto timeline = std::make_shared<const Timeline>(*loaded.timeline);
    const double periodMs = parser.value(periodOpt).toDouble();
    const double seconds = std::min(parser.value(secondsOpt).toDouble(), timeline->durationMs / 1000.0 - 0.5);
    const double toleranceMs = parser.value(toleranceOpt).toDouble();

    LoopbackCapture capture;
    if (!capture.start(devices.loopback, seconds + 3.0, &error)) {
        printJson(QJsonObject{{QStringLiteral("pass"), false}, {QStringLiteral("error"), QString::fromStdString(error)}});
        return 1;
    }
    AudioEngine engine;
    AudioEngine::Options options;
    options.backend = AudioEngine::Backend::System;
    options.sampleRate = 0;
    engine.setTimeline(timeline);
    if (!engine.start(options, &error)) {
        printJson(QJsonObject{{QStringLiteral("pass"), false}, {QStringLiteral("error"), QString::fromStdString(error)}});
        return 1;
    }
    PlaybackClock clock;
    std::int64_t tickNow = steadyNowNs();
    clock.setNowSource([&]() { return tickNow; });
    clock.setDurationMs(timeline->durationMs);
    clock.setLoop(false);
    clock.setAudioFeed(&engine.feed());
    std::vector<std::pair<std::int64_t, double>> samples;  // (monotonic ns, clock ms)
    clock.seek(0.0);
    clock.play();
    const std::int64_t endNs = steadyNowNs() + static_cast<std::int64_t>(seconds * 1e9);
    while (steadyNowNs() < endNs) {
        tickNow = steadyNowNs();
        clock.tick();
        if (clock.audioMaster()) samples.emplace_back(tickNow, clock.time());
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    clock.pause();
    const AudioEngine::Stats stats = engine.stats();
    clock.setAudioFeed(nullptr);
    engine.stop();
    capture.stop();

    // Arrival time of each click on the loopback, and the clock then.
    const auto pcm = capture.samples();
    const auto blocks = capture.blocks();
    std::vector<float> stereo(pcm.size() * 2);
    for (std::size_t i = 0; i < pcm.size(); ++i) stereo[2 * i] = stereo[2 * i + 1] = pcm[i];
    std::vector<double> clockAtArrival;
    for (std::int64_t f : detectOnsets(stereo, 0.02, 240)) {
        auto it = std::upper_bound(blocks.begin(), blocks.end(), f,
                                   [](std::int64_t v, const std::pair<std::int64_t, std::int64_t>& b) { return v < b.first; });
        if (it == blocks.begin()) continue;
        --it;
        const std::int64_t arrivalNs = it->second + static_cast<std::int64_t>((f - it->first) / capture.sampleRate() * 1e9);
        for (std::size_t i = 1; i < samples.size(); ++i) {
            if (samples[i - 1].first <= arrivalNs && arrivalNs < samples[i].first) {
                const double k = static_cast<double>(arrivalNs - samples[i - 1].first) /
                                 static_cast<double>(samples[i].first - samples[i - 1].first);
                clockAtArrival.push_back(samples[i - 1].second + (samples[i].second - samples[i - 1].second) * k);
                break;
            }
        }
    }
    const MixPlan plan = buildMixPlan(*timeline);
    const double lastMs = samples.empty() ? 0.0 : samples.back().second;
    const auto expected = expectedClicks(plan, periodMs, 0.0, lastMs - 50.0);
    const Match m = matchClicks(expected, clockAtArrival, toleranceMs);
    const bool pass = !expected.empty() && m.missing == 0 && m.matched == static_cast<int>(expected.size()) &&
                      stats.underruns == 0;
    printJson(QJsonObject{{QStringLiteral("pass"), pass},
                          {QStringLiteral("toleranceMs"), toleranceMs},
                          {QStringLiteral("note"),
                           QStringLiteral("errorMs = clock at the click's loopback arrival - the click's timeline "
                                          "time; positive means the playhead leads the sound")},
                          {QStringLiteral("expected"), static_cast<int>(expected.size())},
                          {QStringLiteral("matched"), m.matched},
                          {QStringLiteral("missing"), m.missing},
                          {QStringLiteral("maxErrorMs"), m.maxErrorMs},
                          {QStringLiteral("clicks"), m.rows},
                          {QStringLiteral("loopback"), QString::fromStdString(devices.loopback)},
                          {QStringLiteral("output"), QString::fromStdString(stats.deviceName)},
                          {QStringLiteral("outputLatencyMs"), stats.outputLatencySec * 1000.0},
                          {QStringLiteral("underruns"), static_cast<qint64>(stats.underruns)},
                          {QStringLiteral("playStartMs"), stats.lastPlayStartMs}});
    return pass ? 0 : 1;
}

}  // namespace nt::audio
