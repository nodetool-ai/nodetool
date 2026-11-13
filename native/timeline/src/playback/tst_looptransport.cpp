// The gapless loop of MUSIC-MODE.md 14.2 (MD19) and its MM4 exit items. The
// device callback crosses the loop end itself, from one primed session to the
// next, so a loop wrap is no seek:
//   - exit 1, 2, 4 on the manual backend (the real callback and worker, on a
//     simulated device time line, with PlaybackClock attached): 1000 wraps of
//     a 0.5 s loop at 48 kHz are exactly 24000 frames apart, with no wait
//     block, underrun or loop miss and no transport seek; a sine with whole
//     periods in the loop has no sample step at a wrap larger than its own
//     largest step plus 1e-4; and the playhead wraps within one display
//     frame of the audible wrap;
//   - exit 3 on the null backend in real time: a 2 s loop over eight clips
//     keeps the three counters at 0 (NT_LOOP_SOAK_SECONDS, default 12 s; the
//     exit asks for 60);
//   - exit 5: a take switch (an edit of the clip's media) during the loop is
//     heard within one pass, with no wait block or loop miss, and the time
//     from the switch to the first frame of the new take is printed (14.4);
//   - exit 6: a null-device recording at 48 kHz equals renderOffline of the
//     loop range within 1e-6 per sample, pass after pass, with the 3 ms fade
//     of the outgoing audio at each wrap modelled from renderOffline as well;
//   - a loop with a fractional number of frames, ending inside the last
//     frame of a block, wraps at frame 0 of the next block on every pass,
//     with no transport seek;
//   - the transport sends the loop range only at rate 1 with the device as
//     the clock, keeps today's seek otherwise, and falls back to it when the
//     device misses a wrap.

#include "audio/AudioEngine.h"
#include "playback/AudioClockFeed.h"
#include "playback/PlaybackClock.h"

#include <QtTest>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <thread>
#include <vector>

using namespace nt;
using namespace nt::audio;
using namespace nt::playback;

namespace {

constexpr double kRate = 48000.0;
constexpr int kPeriod = 480;
constexpr double kLoopIn = 1000.0;
constexpr double kLoopOut = 1500.0;
constexpr std::int64_t kLoopFrames = 24000;
constexpr std::int64_t kFadeFrames = 144;  // 3 ms at 48 kHz

// The stress case's wall time per 10 ms block. TSan slows the worker about
// tenfold, and the case must still wrap to exercise the wrap paths.
#if defined(__SANITIZE_THREAD__)
constexpr int kStressPaceUs = 1500;
#elif defined(__has_feature)
#if __has_feature(thread_sanitizer)
constexpr int kStressPaceUs = 1500;
#else
constexpr int kStressPaceUs = 400;
#endif
#else
constexpr int kStressPaceUs = 400;
#endif

std::int64_t steadyNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

Clip audioClip(const std::string& id, const std::string& track, const char* file, double startMs, double durationMs) {
    Clip c;
    c.id = id;
    c.trackId = track;
    c.mediaType = MediaType::Audio;
    c.status = "generated";
    c.startMs = startMs;
    c.durationMs = durationMs;
    c.mediaPath = std::string(NT_FIXTURES_DIR "/media/") + file;
    return c;
}

Track audioTrack(const std::string& id) {
    Track t;
    t.id = id;
    t.type = TrackType::Audio;
    return t;
}

// One 220 Hz sine track: 110 whole periods in the 0.5 s loop.
std::shared_ptr<Timeline> sineTimeline() {
    auto tl = std::make_shared<Timeline>();
    tl->tracks = {audioTrack("a")};
    tl->clips = {audioClip("sine", "a", "tone-220-48k-mono.wav", 0, 8000)};
    tl->durationMs = 8000;
    return tl;
}

// Clips that cross the loop end, start inside the loop, are panned and faded,
// so both the wrap and the outgoing fade carry audio from several voices.
std::shared_ptr<Timeline> mixTimeline() {
    auto tl = std::make_shared<Timeline>();
    tl->tracks = {audioTrack("a"), audioTrack("b"), audioTrack("c")};
    tl->tracks[0].pan = -0.5;
    tl->tracks[1].volumeDb = -3;
    Clip a = audioClip("a", "a", "tone-220-48k-mono.wav", 0, 8000);
    a.volumeDb = -6;
    Clip b = audioClip("b", "b", "tone-lr-48k-stereo.wav", 1200, 600);
    b.inPointMs = 37;
    b.fadeInMs = 50;
    Clip c = audioClip("c", "c", "clicks-48k.wav", 1100, 300);
    tl->clips = {a, b, c};
    tl->durationMs = 8000;
    return tl;
}

// A paused seek first, so the play reuses primed rings and starts on time,
// then the play with the loop range (seek command 2).
void playLoop(AudioEngine& engine, double fromMs, double loopIn, double loopOut) {
    TransportCommand cmd;
    cmd.seq = 1;
    cmd.seekSeq = 1;
    cmd.rate = 1.0;
    cmd.seekMs = fromMs;
    cmd.seekIssuedNs = steadyNs();
    engine.feed().command.store(cmd);
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    cmd.seq = 2;
    cmd.seekSeq = 2;
    cmd.playing = true;
    cmd.seekIssuedNs = steadyNs();
    cmd.loopStartMs = loopIn;
    cmd.loopEndMs = loopOut;
    engine.feed().command.store(cmd);
}

float maxStep(const std::vector<float>& stereo, std::int64_t from, std::int64_t to) {
    float step = 0;
    for (std::int64_t f = std::max<std::int64_t>(from, 1); f < to; ++f) {
        for (int c = 0; c < 2; ++c) {
            const auto at = static_cast<std::size_t>(f * 2 + c);
            step = std::max(step, std::abs(stereo[at] - stereo[at - 2]));
        }
    }
    return step;
}

// What a wrapped pass sounds like: the loop range from renderOffline, with
// the first kFadeFrames frames faded from the audio past the loop end.
std::vector<float> expectedPass(const std::vector<float>& loop, const std::vector<float>& tail, bool wrapped) {
    std::vector<float> pass = loop;
    if (!wrapped) return pass;
    for (std::int64_t j = 0; j < kFadeFrames; ++j) {
        const double out = 1.0 - static_cast<double>(j) / kFadeFrames;
        for (int c = 0; c < 2; ++c) {
            const auto at = static_cast<std::size_t>(j * 2 + c);
            pass[at] = static_cast<float>(loop[at] * (1.0 - out) + tail[at] * out);
        }
    }
    return pass;
}

// The play-start anchor and the wrap anchors the callback published.
struct Passes {
    std::int64_t start = -1;
    std::vector<std::int64_t> wraps;
};
Passes passesOf(const CallbackState& cb, double loopIn) {
    Passes p;
    for (int i = 0; i < cb.anchorCount; ++i) {
        const AudioAnchor& a = cb.anchors[i];
        if (!a.playing || a.timelineMs != loopIn) continue;
        if (a.seek) {
            p.start = a.frame;
            p.wraps.clear();
        } else if (p.start >= 0) {
            p.wraps.push_back(a.frame);
        }
    }
    return p;
}

}  // namespace

class TstLoopTransport : public QObject {
    Q_OBJECT

private slots:
    // MM4 exit 1, 2 and 4.
    void thousandWrapsAreExact() {
        const auto tl = sineTimeline();
        const std::vector<float> reference = renderOffline(*tl, static_cast<int>(kRate), kLoopIn, 500.0);
        QCOMPARE(reference.size(), static_cast<std::size_t>(kLoopFrames * 2));
        const float sineStep = maxStep(reference, 0, kLoopFrames);
        QVERIFY(sineStep > 0.01f);

        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Manual;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        options.simulatedLatencySec = 0.020;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());

        // The device renders frame F at simulated time t0 + F / rate. The
        // GUI ticks the clock at 60 Hz on the same time line.
        const std::int64_t t0 = 1'000'000'000;
        std::int64_t now = t0;
        PlaybackClock clock;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(8000);
        clock.setRangeIn(kLoopIn);
        clock.setRangeOut(kLoopOut);
        clock.setLoop(true);
        clock.setAudioFeed(&engine.feed());
        // A paused seek primes the rings, so the play starts on time.
        clock.seek(kLoopIn);
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        clock.play();
        QVERIFY(clock.audioMaster());
        const TransportCommand sent = engine.feed().command.load();
        QCOMPARE(sent.loopStartMs, kLoopIn);
        QCOMPARE(sent.loopEndMs, kLoopOut);
        const std::uint64_t seekSeq = sent.seekSeq;

        // Ten times real time, block by block. macOS sleeps far past a 1 ms
        // request, so 50,000 sleeps outrun the test timeout, and catching up
        // after a late sleep sends blocks in bursts the worker cannot fill.
        // There the loop yields until each block's deadline. Elsewhere it
        // sleeps, which leaves the core to the worker under TSan.
        const auto paceUs = qEnvironmentVariableIsSet("NT_LOOP_PACE_US") ? qEnvironmentVariableIntValue("NT_LOOP_PACE_US") : 1000;
        [[maybe_unused]] const auto paceStart = std::chrono::steady_clock::now();
        [[maybe_unused]] std::int64_t pacedBlocks = 0;
        std::vector<float> block(kPeriod * 2);
        float last[2] = {0, 0};
        float worstStep = 0;
        std::int64_t frame = 0;
        std::int64_t playStart = -1;
        std::vector<std::int64_t> wraps;
        std::int64_t seenFrame = -1;
        std::uint64_t seenCommand = 0;
        AudioEngine::Stats started;
        std::int64_t nextTickNs = t0;
        double lastTime = clock.time();
        std::vector<std::int64_t> tickWrapNs;
        double worstError = 0;
        const std::int64_t latencyFrames = static_cast<std::int64_t>(std::llround(options.simulatedLatencySec * kRate));
        while (wraps.size() < 1000) {
            QVERIFY2(frame < 600 * static_cast<std::int64_t>(kRate), "the loop stopped wrapping");
            const std::int64_t blockNs = t0 + static_cast<std::int64_t>(static_cast<double>(frame) / kRate * 1e9);
            while (nextTickNs < blockNs) {
                now = nextTickNs;
                clock.tick();
                const double t = clock.time();
                if (t + 100.0 < lastTime) tickWrapNs.push_back(now);
                lastTime = t;
                // The audible frame now, and the time it carries.
                const double audible = static_cast<double>(now - t0) * 1e-9 * kRate - static_cast<double>(latencyFrames);
                if (playStart >= 0 && audible >= static_cast<double>(playStart)) {
                    const double into = std::fmod(audible - static_cast<double>(playStart), static_cast<double>(kLoopFrames));
                    worstError = std::max(worstError, std::abs(t - (kLoopIn + into / kRate * 1000.0)));
                }
                nextTickNs += static_cast<std::int64_t>(1e9 / 60.0);
            }
            now = blockNs;
            engine.renderManual(block, blockNs);
            const CallbackState cb = engine.feed().callback.load();
            for (int i = 0; i < cb.anchorCount; ++i) {
                const AudioAnchor& a = cb.anchors[i];
                if (a.frame < seenFrame || (a.frame == seenFrame && a.commandSeq <= seenCommand)) continue;
                seenFrame = a.frame;
                seenCommand = a.commandSeq;
                if (a.seek && a.playing) {
                    QCOMPARE(playStart, std::int64_t(-1));
                    playStart = a.frame;
                    started = engine.stats();
                } else if (!a.seek && a.timelineMs == kLoopIn) {
                    wraps.push_back(a.frame);
                }
            }
            if (playStart >= 0) {
                // Every played frame, wraps included: no step above the sine's own.
                for (std::int64_t f = std::max<std::int64_t>(0, playStart + 1 - frame); f < kPeriod; ++f) {
                    for (int c = 0; c < 2; ++c) {
                        const float prev = f == 0 ? last[c] : block[static_cast<std::size_t>((f - 1) * 2 + c)];
                        worstStep = std::max(worstStep, std::abs(block[static_cast<std::size_t>(f * 2 + c)] - prev));
                    }
                }
            }
            last[0] = block[kPeriod * 2 - 2];
            last[1] = block[kPeriod * 2 - 1];
            frame += kPeriod;
            if (paceUs > 0) {
#if defined(__APPLE__)
                const auto deadline = paceStart + std::chrono::microseconds(paceUs) * ++pacedBlocks;
                while (std::chrono::steady_clock::now() < deadline) std::this_thread::yield();
#else
                std::this_thread::sleep_for(std::chrono::microseconds(paceUs));
#endif
            }
        }
        const AudioEngine::Stats s = engine.stats();
        engine.stop();
        qInfo("wraps %zu, sine step %.6f, worst step %.6f, clock error %.4f ms, sessions %lld",
              wraps.size(), sineStep, worstStep, worstError, static_cast<long long>(s.sessions));

        // Exit 1.
        QVERIFY(playStart >= 0);
        QCOMPARE(wraps.front() - playStart, kLoopFrames);
        for (std::size_t i = 1; i < wraps.size(); ++i) {
            QVERIFY2(wraps[i] - wraps[i - 1] == kLoopFrames,
                     qPrintable(QStringLiteral("wrap %1 is %2 frames after the last").arg(i).arg(wraps[i] - wraps[i - 1])));
        }
        QCOMPARE(s.waitBlocks - started.waitBlocks, std::int64_t(0));
        QCOMPARE(s.underruns, std::int64_t(0));
        QCOMPARE(s.loopMisses, std::int64_t(0));
        QCOMPARE(s.loopWraps, static_cast<std::int64_t>(wraps.size()));
        QCOMPARE(engine.feed().command.load().seekSeq, seekSeq);
        // Exit 2.
        QVERIFY2(worstStep <= sineStep + 1e-4f, qPrintable(QStringLiteral("step %1 > %2").arg(worstStep).arg(sineStep)));
        // Exit 4: the clock reads the audible frame's time, and the tick
        // that shows each wrap comes within one 60 Hz frame of hearing it.
        QVERIFY2(worstError < 0.5, qPrintable(QString::number(worstError)));
        QVERIFY(tickWrapNs.size() >= wraps.size() - 1);
        for (std::size_t i = 0; i + 1 < wraps.size(); ++i) {
            const std::int64_t heardNs =
                t0 + static_cast<std::int64_t>(static_cast<double>(wraps[i] + latencyFrames) / kRate * 1e9);
            const double lagMs = static_cast<double>(tickWrapNs[i] - heardNs) / 1e6;
            QVERIFY2(lagMs >= -0.001 && lagMs <= 1000.0 / 60.0 + 0.001,
                     qPrintable(QStringLiteral("wrap %1: playhead %2 ms after the audio").arg(i).arg(lagMs)));
        }
    }

    // A loop whose length is not a whole number of frames, placed so that
    // each pass ends inside the last frame of a block: 22559.5 frames from a
    // block start, with 480-frame blocks. Each pass wraps at frame 0 of the
    // next block, 22560 frames after the last wrap, with no transport seek.
    void nonWholeFrameLoopWraps() {
        const double loopOut = kLoopIn + 22559.5 / kRate * 1000.0;
        const std::int64_t spacing = 22560;
        AudioEngine engine;
        engine.setTimeline(sineTimeline());
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Manual;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        options.simulatedLatencySec = 0.020;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        const std::int64_t t0 = 1'000'000'000;
        std::int64_t now = t0;
        PlaybackClock clock;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(8000);
        clock.setRangeIn(kLoopIn);
        clock.setRangeOut(loopOut);
        clock.setLoop(true);
        clock.setAudioFeed(&engine.feed());
        clock.seek(kLoopIn);
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        clock.play();
        const TransportCommand sent = engine.feed().command.load();
        QCOMPARE(sent.loopEndMs, loopOut);
        const std::uint64_t seekSeq = sent.seekSeq;

        std::vector<float> block(kPeriod * 2);
        std::int64_t frame = 0;
        std::int64_t playStart = -1;
        std::vector<std::int64_t> wraps;
        std::int64_t seenFrame = -1;
        std::uint64_t seenCommand = 0;
        while (wraps.size() < 60) {
            QVERIFY2(frame < 120 * static_cast<std::int64_t>(kRate), "the loop stopped wrapping");
            now = t0 + static_cast<std::int64_t>(static_cast<double>(frame) / kRate * 1e9);
            engine.renderManual(block, now);
            clock.tick();
            QVERIFY2(engine.feed().command.load().seekSeq == seekSeq,
                     qPrintable(QStringLiteral("the transport seeked after %1 wraps").arg(wraps.size())));
            const CallbackState cb = engine.feed().callback.load();
            for (int i = 0; i < cb.anchorCount; ++i) {
                const AudioAnchor& a = cb.anchors[i];
                if (a.frame < seenFrame || (a.frame == seenFrame && a.commandSeq <= seenCommand)) continue;
                seenFrame = a.frame;
                seenCommand = a.commandSeq;
                if (a.seek && a.playing) {
                    playStart = a.frame;
                } else if (!a.seek && a.timelineMs == kLoopIn) {
                    wraps.push_back(a.frame);
                }
            }
            frame += kPeriod;
            std::this_thread::sleep_for(std::chrono::microseconds(1000));
        }
        const AudioEngine::Stats s = engine.stats();
        engine.stop();
        QVERIFY(playStart >= 0);
        QCOMPARE(playStart % kPeriod, std::int64_t(0));
        QCOMPARE(wraps.front() - playStart, spacing);
        for (std::size_t i = 1; i < wraps.size(); ++i) QCOMPARE(wraps[i] - wraps[i - 1], spacing);
        QCOMPARE(s.loopMisses, std::int64_t(0));
        QCOMPARE(s.underruns, std::int64_t(0));
        QCOMPARE(s.loopWraps, static_cast<std::int64_t>(wraps.size()));
    }

    // MM4 exit 6, on the null device in real time.
    void recordingEqualsOfflineRender() {
        const auto tl = mixTimeline();
        const auto loop = renderOffline(*tl, static_cast<int>(kRate), kLoopIn, kLoopOut - kLoopIn);
        const auto tail = renderOffline(*tl, static_cast<int>(kRate), kLoopOut, 3.0);
        QCOMPARE(tail.size(), static_cast<std::size_t>(kFadeFrames * 2));
        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        options.recordSeconds = 3.6;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        playLoop(engine, kLoopIn, kLoopIn, kLoopOut);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= static_cast<std::int64_t>(3.6 * kRate), 8000);
        const CallbackState cb = engine.feed().callback.load();
        const AudioEngine::Stats s = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        const Passes passes = passesOf(cb, kLoopIn);
        QVERIFY(passes.start >= 0);
        QVERIFY2(passes.wraps.size() >= 4, qPrintable(QString::number(passes.wraps.size())));
        QCOMPARE(s.loopMisses, std::int64_t(0));
        QCOMPARE(s.underruns, std::int64_t(0));
        int checked = 0;
        for (std::size_t p = 0; p <= passes.wraps.size(); ++p) {
            const std::int64_t first = p == 0 ? passes.start : passes.wraps[p - 1];
            if (p > 0) QCOMPARE(first - (p == 1 ? passes.start : passes.wraps[p - 2]), kLoopFrames);
            if ((first + kLoopFrames) * 2 > static_cast<std::int64_t>(recording.size())) break;
            const auto expected = expectedPass(loop, tail, p > 0);
            double worst = 0;
            std::int64_t at = -1;
            for (std::int64_t j = 0; j < kLoopFrames * 2; ++j) {
                const double d = std::abs(recording[static_cast<std::size_t>(first * 2 + j)] - expected[static_cast<std::size_t>(j)]);
                if (d > worst) {
                    worst = d;
                    at = j / 2;
                }
            }
            QVERIFY2(worst <= 1e-6, qPrintable(QStringLiteral("pass %1 differs by %2 at frame %3").arg(p).arg(worst).arg(at)));
            ++checked;
        }
        QVERIFY(checked >= 4);
        // The fade has something to fade: clip b sounds past the loop end.
        float tailPeak = 0;
        for (float x : tail) tailPeak = std::max(tailPeak, std::abs(x));
        QVERIFY(tailPeak > 0.05f);
    }

    // MM4 exit 5 and section 14.4: a take switch is an edit. During the loop
    // it reaches the device with no seek and no wait.
    void takeSwitchDuringLoopIsHeard() {
        const auto tl = sineTimeline();
        auto switched = std::make_shared<Timeline>(*tl);
        switched->clips[0].mediaPath = NT_FIXTURES_DIR "/media/tone-lr-48k-stereo.wav";
        const auto oldLoop = renderOffline(*tl, static_cast<int>(kRate), kLoopIn, 500.0);
        const auto newLoop = renderOffline(*switched, static_cast<int>(kRate), kLoopIn, 500.0);
        const auto newTail = renderOffline(*switched, static_cast<int>(kRate), kLoopOut, 3.0);
        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        options.recordSeconds = 4.0;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        playLoop(engine, kLoopIn, kLoopIn, kLoopOut);
        // Mid-pass, after a few wraps.
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().loopWraps >= 3, 4000);
        QTest::qWait(230);
        const AudioEngine::Stats before = engine.stats();
        const std::int64_t editFrame = before.framesRendered;
        engine.setTimelineAsync(switched);
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().framesRendered >= static_cast<std::int64_t>(4.0 * kRate), 6000);
        const CallbackState cb = engine.feed().callback.load();
        const AudioEngine::Stats after = engine.stats();
        engine.stop();
        const auto recording = engine.recording();
        const Passes passes = passesOf(cb, kLoopIn);
        QVERIFY(passes.start >= 0 && !passes.wraps.empty());
        const auto passStart = [&](std::int64_t f) {
            std::int64_t first = passes.start;
            for (std::int64_t w : passes.wraps) {
                if (w <= f) first = w;
            }
            return first;
        };
        // The first frame from which a whole period sounds like the new take.
        std::int64_t heard = -1;
        for (std::int64_t f = editFrame; f + kPeriod < static_cast<std::int64_t>(recording.size() / 2) && heard < 0; ++f) {
            bool match = true;
            for (std::int64_t g = f; g < f + kPeriod && match; ++g) {
                const std::int64_t j = g - passStart(g);
                if (j < kFadeFrames && passStart(g) != passes.start) continue;
                for (int c = 0; c < 2 && match; ++c) {
                    const auto at = static_cast<std::size_t>(j * 2 + c);
                    match = std::abs(recording[static_cast<std::size_t>(g * 2 + c)] - newLoop[at]) <= 1e-6 &&
                            (std::abs(newLoop[at] - oldLoop[at]) > 1e-3 || g > f);
                }
            }
            if (match) heard = f;
        }
        QVERIFY2(heard >= 0, "the new take was never heard");
        const double latencyMs = static_cast<double>(heard - editFrame) / kRate * 1000.0;
        // Device frames rendered when the switch was made, to the first frame
        // of the new take. 0 means the next block after the call has it.
        qInfo("take switch: new take from %.1f ms after the frames rendered at the call", latencyMs);
        QVERIFY2(latencyMs < 500.0, qPrintable(QString::number(latencyMs)));
        // The next whole pass is the new take, fade included.
        std::int64_t next = -1;
        for (std::int64_t w : passes.wraps) {
            if (w > heard) {
                next = w;
                break;
            }
        }
        QVERIFY(next >= 0 && (next + kLoopFrames) * 2 <= static_cast<std::int64_t>(recording.size()));
        const auto expected = expectedPass(newLoop, newTail, true);
        for (std::int64_t j = 0; j < kLoopFrames * 2; ++j) {
            QVERIFY2(std::abs(recording[static_cast<std::size_t>(next * 2 + j)] - expected[static_cast<std::size_t>(j)]) <= 1e-6,
                     qPrintable(QStringLiteral("pass after the switch differs at frame %1").arg(j / 2)));
        }
        QCOMPARE(after.waitBlocks, before.waitBlocks);
        QCOMPARE(after.loopMisses, std::int64_t(0));
        QCOMPARE(engine.feed().command.load().seekSeq, std::uint64_t(2));
    }

    // MM4 exit 3: the null backend in real time, a 2 s loop over eight clips.
    void realTimeLoopOverEightClips() {
        const double seconds = qEnvironmentVariableIsSet("NT_LOOP_SOAK_SECONDS")
                                   ? qEnvironmentVariable("NT_LOOP_SOAK_SECONDS").toDouble()
                                   : 12.0;
        auto tl = std::make_shared<Timeline>();
        const char* files[] = {"tone-220-48k-mono.wav", "tone-lr-48k-stereo.wav", "tone-440-48k-mono.wav",
                               "tone-660-44k-mono.wav"};
        for (int i = 0; i < 8; ++i) {
            const std::string id = std::to_string(i);
            tl->tracks.push_back(audioTrack(id));
            tl->tracks.back().pan = -1.0 + i / 3.5;
            Clip c = audioClip(id, id, files[i % 4], 0, 8000);
            c.inPointMs = 0;
            tl->clips.push_back(c);
        }
        tl->durationMs = 8000;
        AudioEngine engine;
        engine.setTimeline(tl);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Null;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        PlaybackClock clock;
        clock.setDurationMs(8000);
        clock.setRangeIn(1000);
        clock.setRangeOut(3000);
        clock.setLoop(true);
        clock.setAudioFeed(&engine.feed());
        clock.seek(1000);
        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        clock.play();
        const std::uint64_t seekSeq = engine.feed().command.load().seekSeq;
        QTRY_VERIFY_WITH_TIMEOUT(engine.stats().playedFrames > 0, 2000);
        const AudioEngine::Stats started = engine.stats();
        const auto until = std::chrono::steady_clock::now() + std::chrono::milliseconds(static_cast<int>(seconds * 1000));
        double lowest = 1e9, highest = -1e9;
        while (std::chrono::steady_clock::now() < until) {
            clock.tick();
            lowest = std::min(lowest, clock.time());
            highest = std::max(highest, clock.time());
            std::this_thread::sleep_for(std::chrono::milliseconds(16));
        }
        const AudioEngine::Stats s = engine.stats();
        clock.setAudioFeed(nullptr);
        engine.stop();
        qInfo("%.0f s: wraps %lld, misses %lld, underruns %lld, wait blocks %lld, played %.1f s", seconds,
              static_cast<long long>(s.loopWraps), static_cast<long long>(s.loopMisses),
              static_cast<long long>(s.underruns - started.underruns), static_cast<long long>(s.waitBlocks - started.waitBlocks),
              static_cast<double>(s.playedFrames) / kRate);
        QCOMPARE(s.underruns - started.underruns, std::int64_t(0));
        QCOMPARE(s.waitBlocks - started.waitBlocks, std::int64_t(0));
        QCOMPARE(s.loopMisses, std::int64_t(0));
        QVERIFY(s.loopWraps >= static_cast<std::int64_t>(seconds / 2.0) - 1);
        QCOMPARE(engine.feed().command.load().seekSeq, seekSeq);
        QVERIFY(lowest >= 1000.0 && highest <= 3000.0);
    }

    // MR6: the callback reads two sessions, so a mistake in the hazard slots
    // is a use-after-free on the real-time thread. Short loops at 25 times
    // real time (about 7 under TSan), with edits, seeks and range changes,
    // exercise every path
    // that replaces or withdraws a wrap session while the callback may claim
    // it. The sanitizer builds of this test are the check: misses may occur
    // here and fall back to the seek, but nothing may crash or race.
    void editsSeeksAndRangesDuringLoops() {
        const auto base = mixTimeline();
        auto quieter = std::make_shared<Timeline>(*base);
        quieter->clips[1].volumeDb = -12;
        auto other = std::make_shared<Timeline>(*quieter);
        other->clips[0].mediaPath = NT_FIXTURES_DIR "/media/tone-440-48k-mono.wav";
        AudioEngine engine;
        engine.setTimeline(base);
        AudioEngine::Options options;
        options.backend = AudioEngine::Backend::Manual;
        options.sampleRate = static_cast<int>(kRate);
        options.periodFrames = kPeriod;
        std::string error;
        QVERIFY2(engine.start(options, &error), error.c_str());
        const std::int64_t t0 = 1'000'000'000;
        std::int64_t now = t0;
        PlaybackClock clock;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(8000);
        clock.setRangeIn(1000);
        clock.setRangeOut(1250);
        clock.setLoop(true);
        clock.setAudioFeed(&engine.feed());
        clock.seek(1000);
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        clock.play();
        std::vector<float> block(kPeriod * 2);
        std::int64_t nextTickNs = t0;
        const auto until = std::chrono::steady_clock::now() + std::chrono::seconds(4);
        std::int64_t frame = 0;
        int n = 0;
        while (std::chrono::steady_clock::now() < until) {
            const std::int64_t blockNs = t0 + static_cast<std::int64_t>(static_cast<double>(frame) / kRate * 1e9);
            while (nextTickNs < blockNs) {
                now = nextTickNs;
                clock.tick();
                nextTickNs += static_cast<std::int64_t>(1e9 / 60.0);
            }
            now = blockNs;
            engine.renderManual(block, blockNs);
            frame += kPeriod;
            ++n;
            // Gain edits keep every ring. A take switch every tenth edit
            // decodes the new take into both sessions.
            if (n % 7 == 0) engine.setTimelineAsync(n % 70 == 0 ? other : (n % 14 == 0 ? base : quieter));
            if (n % 131 == 0) clock.seek(1000 + (n % 200));
            if (n % 293 == 0) clock.setRangeOut(n % 586 == 0 ? 1250 : 1180);
            std::this_thread::sleep_for(std::chrono::microseconds(kStressPaceUs));
        }
        const AudioEngine::Stats s = engine.stats();
        clock.setAudioFeed(nullptr);
        engine.stop();
        qInfo("%d blocks: wraps %lld, misses %lld, sessions %lld", n, static_cast<long long>(s.loopWraps),
              static_cast<long long>(s.loopMisses), static_cast<long long>(s.sessions));
        QVERIFY(s.loopWraps > 20);
        QVERIFY(clock.time() >= 1000.0 && clock.time() <= 1250.0);
    }

    // The loop range goes to the device only at rate 1 with the device as the
    // clock. Shuttle rates and reverse play keep today's seek.
    void loopRangeOnlyAtRateOne() {
        AudioClockFeed feed;
        feed.device.store(DeviceInfo{true, kRate, 0.0, 1});
        std::int64_t now = 0;
        PlaybackClock clock;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(8000);
        clock.setRangeIn(1000);
        clock.setRangeOut(2000);
        clock.setLoop(true);
        clock.setAudioFeed(&feed);
        clock.seek(1000);
        clock.play();
        QCOMPARE(feed.command.load().loopStartMs, 1000.0);
        QCOMPARE(feed.command.load().loopEndMs, 2000.0);
        clock.setRangeOut(1800);  // a range edit while playing reaches the device
        QCOMPARE(feed.command.load().loopEndMs, 1800.0);
        clock.setRate(2.0);
        QVERIFY(!(feed.command.load().loopEndMs > feed.command.load().loopStartMs));
        clock.setRate(1.0);
        QCOMPARE(feed.command.load().loopEndMs, 1800.0);
        clock.setRate(-1.0);
        QVERIFY(!(feed.command.load().loopEndMs > feed.command.load().loopStartMs));
        clock.setRate(1.0);
        clock.setLoop(false);
        QVERIFY(!(feed.command.load().loopEndMs > feed.command.load().loopStartMs));
        clock.setLoop(true);
        clock.pause();
        QVERIFY(!(feed.command.load().loopEndMs > feed.command.load().loopStartMs));
        // A looping span loops on the device too.
        clock.playSpan(3000, 3500, -1, true);
        QCOMPARE(feed.command.load().loopStartMs, 3000.0);
        QCOMPARE(feed.command.load().loopEndMs, 3500.0);
    }

    // The callback half alone: with wrap PCM ready the driver wraps and the
    // transport issues no seek. With none it reports a miss each pass, and
    // the transport falls back to today's seek at the range end.
    void missFallsBackToSeek_data() {
        QTest::addColumn<bool>("ready");
        QTest::newRow("wraps") << true;
        QTest::newRow("misses") << false;
    }
    void missFallsBackToSeek() {
        QFETCH(bool, ready);
        AudioClockFeed feed;
        feed.device.store(DeviceInfo{true, kRate, 0.0, 1});
        CallbackClockDriver driver(feed);
        std::int64_t now = 1'000'000'000;
        PlaybackClock clock;
        clock.setNowSource([&now] { return now; });
        clock.setDurationMs(8000);
        clock.setRangeIn(1000);
        clock.setRangeOut(1500);
        clock.setLoop(true);
        clock.setAudioFeed(&feed);
        clock.seek(1000);
        clock.play();
        const std::uint64_t firstSeek = feed.command.load().seekSeq;
        int wrapsSeen = 0, misses = 0;
        double lowest = 1e9, highest = -1e9;
        const std::int64_t t0 = now;
        for (std::int64_t frame = 0; frame < static_cast<std::int64_t>(4 * kRate); frame += kPeriod) {
            now = t0 + static_cast<std::int64_t>(static_cast<double>(frame) / kRate * 1e9);
            driver.beginBlock(now, kPeriod, kRate, [](std::uint64_t) { return true; },
                              [ready](std::uint64_t, double) { return ready; });
            if (driver.wrapOffset() >= 0) ++wrapsSeen;
            if (driver.wrapMissed()) ++misses;
            if (frame % 960 == 0) {
                clock.tick();
                lowest = std::min(lowest, clock.time());
                highest = std::max(highest, clock.time());
            }
        }
        QVERIFY(lowest >= 1000.0 && highest <= 1500.0);
        if (ready) {
            QCOMPARE(wrapsSeen, 7);
            QCOMPARE(misses, 0);
            QCOMPARE(feed.command.load().seekSeq, firstSeek);
        } else {
            QCOMPARE(wrapsSeen, 0);
            QVERIFY(misses >= 6);
            QVERIFY(feed.command.load().seekSeq >= firstSeek + 6);
        }
    }
};

QTEST_GUILESS_MAIN(TstLoopTransport)
#include "tst_looptransport.moc"
