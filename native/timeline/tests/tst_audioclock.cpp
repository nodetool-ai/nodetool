// The audio-master clock (PLAN M3 exit 2, DESIGN.md D21): PlaybackClock with
// a fake device that runs the real callback half (CallbackClockDriver) on a
// simulated time line. The fake device plays frames continuously at its true
// rate from T0; its callback for the block at frame F arrives up to 2 ms
// early, as a real device asks ahead. A GUI tick every 16.67 ms reads the
// clock. Checks:
//   - every transition (play, seek, rate change, device change, fallback to
//     the monotonic clock and back) moves the playhead by no more than one
//     frame (33.3 ms at 30 fps) beyond its wall-clock advance between ticks;
//   - while audio plays, the playhead is the timeline time of the frame that
//     is audible at that moment, within the callback jitter;
//   - over an hour on a device 100 ppm fast, that error does not grow
//     (drift 0), while the monotonic clock would be off by 360 ms.

#include "playback/AudioClockFeed.h"
#include "playback/PlaybackClock.h"

#include <QtTest>

#include <cmath>
#include <deque>
#include <random>

using namespace nt::playback;

namespace {

constexpr double kNominalRate = 48000.0;
constexpr std::int64_t kBlock = 480;  // 10 ms
constexpr double kFrameMs = 1000.0 / 30.0;
constexpr std::int64_t kMs = 1'000'000;

struct Block {
    std::int64_t frame = 0;
    AudioAnchor anchor;
    bool sounding = false;
};

class FakeDevice {
public:
    explicit FakeDevice(AudioClockFeed& feed) : feed(feed), driver(std::make_unique<CallbackClockDriver>(feed)) {}

    AudioClockFeed& feed;
    std::unique_ptr<CallbackClockDriver> driver;
    double trueRate = kNominalRate;
    double latencySec = 0.010;
    std::int64_t t0 = 0;  // monotonic time the device frame 0 was rendered
    std::int64_t frameBase = 0;  // device frames before the current start
    bool running = false;
    std::uint64_t generation = 0;
    bool pcmReady = true;
    std::mt19937 rng{7};
    std::deque<Block> blocks;  // the mapping each rendered block used

    void start(std::int64_t nowNs, double latency) {
        latencySec = latency;
        // A new device continues the callback's frame counter (the engine
        // keeps one driver), so frame F of the new device is driver frame
        // frameBase + F.
        frameBase = driver->framesRendered();
        t0 = nowNs;
        running = true;
        generation += 1;
        feed.device.store(DeviceInfo{true, kNominalRate, latencySec, generation});
    }
    void stop() {
        running = false;
        feed.device.store(DeviceInfo{false, kNominalRate, latencySec, generation});
    }
    // Monotonic time of the next callback.
    std::int64_t nextCallbackNs() {
        const std::int64_t f = driver->framesRendered() - frameBase;
        std::uniform_int_distribution<std::int64_t> jitter(0, 2 * kMs);
        return t0 + static_cast<std::int64_t>(static_cast<double>(f) / trueRate * 1e9) - jitter(rng);
    }
    void callback(std::int64_t nowNs) {
        const AudioAnchor a = driver->beginBlock(nowNs, kBlock, kNominalRate, [this](std::uint64_t) { return pcmReady; });
        blocks.push_back({driver->framesRendered() - kBlock, a, a.playing && !driver->seekPending()});
        if (blocks.size() > 4000) blocks.pop_front();
    }
    // The timeline time of the frame audible at `nowNs`, or NaN when none
    // sounds (silence or the device stopped).
    double audibleTruth(std::int64_t nowNs) const {
        if (!running) return std::nan("");
        const double heard = static_cast<double>(nowNs - t0) * 1e-9 * trueRate - latencySec * trueRate;
        if (heard < 0) return std::nan("");
        const auto frame = frameBase + static_cast<std::int64_t>(std::floor(heard));
        for (auto it = blocks.rbegin(); it != blocks.rend(); ++it) {
            if (frame >= it->frame && frame < it->frame + kBlock) {
                // Frames of an earlier seek still in the device buffer are
                // heard, but the playhead already shows the new target.
                if (!it->sounding || it->anchor.seekSeq != blocks.back().anchor.seekSeq) return std::nan("");
                const double frac = heard - std::floor(heard);
                return CallbackClockDriver::timelineAt(it->anchor, frame, kNominalRate) +
                       frac / kNominalRate * 1000.0 * it->anchor.rate;
            }
        }
        return std::nan("");
    }
};

// Runs the device and the GUI ticks on simulated time, and records the
// largest playhead jump and the largest error against the audible frame.
struct Sim {
    std::int64_t now = 1'000'000'000;
    AudioClockFeed feed;
    FakeDevice device{feed};
    PlaybackClock clock;
    std::int64_t nextTickNs = 0;
    double lastTickMs = std::nan("");
    std::int64_t lastTickNs = 0;
    double maxJumpMs = 0.0;
    double maxErrorMs = 0.0;
    int errorSamples = 0;
    std::vector<double> times;

    Sim() {
        clock.setNowSource([this]() { return now; });
        clock.setDurationMs(4.0 * 3600.0 * 1000.0);
        clock.setLoop(false);
        clock.setAudioFeed(&feed);
        nextTickNs = now;
    }
    // Advance simulated time by `ms`, running callbacks and ticks in order.
    void run(double ms) {
        const std::int64_t until = now + static_cast<std::int64_t>(ms * 1e6);
        for (;;) {
            const std::int64_t cb = device.running ? device.nextCallbackNs() : INT64_MAX;
            const std::int64_t next = std::min(cb, nextTickNs);
            if (next > until) break;
            now = std::max(now, next);
            if (next == cb) {
                device.callback(now);
            } else {
                tick();
                nextTickNs += static_cast<std::int64_t>(1e9 / 60.0);
            }
        }
        now = until;
    }
    void tick() {
        clock.tick();
        const double t = clock.time();
        if (!std::isnan(lastTickMs) && clock.playing()) {
            const double wallMs = static_cast<double>(now - lastTickNs) / 1e6 * clock.rate();
            maxJumpMs = std::max(maxJumpMs, std::abs((t - lastTickMs) - wallMs));
        }
        lastTickMs = t;
        lastTickNs = now;
        times.push_back(t);
        const double truth = device.audibleTruth(now);
        if (clock.playing() && clock.audioMaster() && !std::isnan(truth)) {
            maxErrorMs = std::max(maxErrorMs, std::abs(t - truth));
            ++errorSamples;
        }
    }
    // A user action between ticks: the jump check restarts after it.
    void resetJump() { lastTickMs = std::nan(""); }
    void resetError() {
        maxErrorMs = 0.0;
        errorSamples = 0;
    }
};

}  // namespace

class TstAudioClock : public QObject {
    Q_OBJECT

private slots:
    void audibleTimelineMath() {
        CallbackState cb;
        cb.framesAtStart = 48000;
        cb.hostTimeNs = 10 * kMs;
        cb.bufferFrames = 480;
        cb.anchorCount = 1;
        cb.anchors[0] = AudioAnchor{1, 1, 0, 2000.0, 1.0, true, true};
        DeviceInfo dev{true, 48000.0, 0.0, 1};
        // Interpolated between callbacks: 5 ms after the pair.
        auto r = audibleTimeline(cb, dev, 15 * kMs);
        QCOMPARE(r.timelineMs, 2000.0 + 1000.0 + 5.0);
        // Never past the end of the published buffer (10 ms).
        r = audibleTimeline(cb, dev, 40 * kMs);
        QCOMPARE(r.timelineMs, 3010.0);
        // The latency is subtracted.
        dev.outputLatencySec = 0.020;
        r = audibleTimeline(cb, dev, 15 * kMs);
        QCOMPARE(r.timelineMs, 2985.0);
        // A seek anchor not audible yet holds at its target.
        cb.anchorCount = 2;
        cb.anchors[1] = AudioAnchor{2, 2, 48300, 9000.0, 1.0, true, true};
        r = audibleTimeline(cb, dev, 15 * kMs);
        QVERIFY(r.held);
        QCOMPARE(r.timelineMs, 9000.0);
        // A rate change not audible yet still sounds the previous anchor.
        cb.anchors[1] = AudioAnchor{3, 1, 48300, 3006.25, 2.0, true, false};
        r = audibleTimeline(cb, dev, 15 * kMs);
        QCOMPARE(r.timelineMs, 2985.0);
    }

    // A transport writer descheduled in the middle of a write must not stall
    // the device callback: the block runs with the last coherent command,
    // and the new command applies once the write completes.
    void callbackNeverWaitsForTheTransport() {
        AudioClockFeed feed;
        CallbackClockDriver driver(feed);
        TransportCommand cmd;
        cmd.seq = 1;
        cmd.playing = true;
        cmd.seekSeq = 1;
        cmd.seekMs = 500.0;
        feed.command.store(cmd);
        const auto ready = [](std::uint64_t) { return true; };
        AudioAnchor a = driver.beginBlock(0, kBlock, kNominalRate, ready);
        QCOMPARE(a.commandSeq, std::uint64_t(1));
        cmd.seq = 2;
        cmd.rate = 2.0;
        feed.command.store(cmd);
        feed.command.holdWriteForTest();
        a = driver.beginBlock(10 * kMs, kBlock, kNominalRate, ready);  // returns at once
        QCOMPARE(a.commandSeq, std::uint64_t(1));
        QCOMPARE(a.rate, 1.0);
        feed.command.releaseWriteForTest();
        a = driver.beginBlock(20 * kMs, kBlock, kNominalRate, ready);
        QCOMPARE(a.commandSeq, std::uint64_t(2));
        QCOMPARE(a.rate, 2.0);
    }

    // Rate changes closer together than the output latency: the frame that
    // is audible now was rendered under an anchor two or more changes back.
    void rateChangesInsideTheLatency() {
        AudioClockFeed feed;
        CallbackClockDriver driver(feed);
        const DeviceInfo dev{true, kNominalRate, 0.100, 1};
        TransportCommand cmd;
        const auto send = [&](bool seek, double rate) {
            cmd.seq += 1;
            cmd.playing = true;
            cmd.rate = rate;
            if (seek) {
                cmd.seekSeq += 1;
                cmd.seekMs = 0.0;
            }
            feed.command.store(cmd);
        };
        send(true, 1.0);
        std::int64_t host = 0;
        const auto block = [&]() {
            driver.beginBlock(host, kBlock, kNominalRate, [](std::uint64_t) { return true; });
            host += kBlock * 1'000'000'000 / 48000;
        };
        // Frame f is rendered at host f / 48 kHz, heard 100 ms later.
        while (driver.framesRendered() < 48000) block();
        send(false, 2.0);  // starts at frame 48000
        block();
        send(false, 1.0);  // starts at frame 48480
        block();
        send(false, 3.0);  // starts at frame 48960
        block();
        // Now = the start of the block at frame 48960: audible frame 44160,
        // still under the first anchor (rate 1 from frame 0): 920 ms.
        const CallbackState cb = feed.callback.load();
        QCOMPARE(cb.framesAtStart, std::int64_t(48960));
        const double nowNs = static_cast<double>(host - kBlock * 1'000'000'000 / 48000);
        AudioReading r = audibleTimeline(cb, dev, static_cast<std::int64_t>(nowNs));
        QVERIFY2(std::abs(r.timelineMs - 920.0) < 1e-6, qPrintable(QString::number(r.timelineMs)));
        // Through the rest of that buffer the audible frames stay under the
        // first anchor.
        for (double extraMs = 0.0; extraMs <= 10.0; extraMs += 2.5) {
            const double audible = 48960 - 4800 + extraMs * 48.0;
            const double expected = audible / 48.0;  // all under the rate-1 anchor
            r = audibleTimeline(cb, dev, static_cast<std::int64_t>(nowNs + extraMs * 1e6));
            QVERIFY2(std::abs(r.timelineMs - expected) < 1e-6, qPrintable(QString::number(r.timelineMs)));
        }
        // Later, each changed anchor is heard in turn: 1000 ms at frame 48000
        // at rate 2, 1020 ms at 48480 at rate 1, 1030 ms at 48960 at rate 3.
        // Run the device on until the frame is in the newest buffer, then
        // read the clock when that frame is audible.
        const auto at = [&](double audible) {
            const double rendered = audible + 4800;
            while (static_cast<double>(driver.framesRendered()) <= rendered) block();
            const CallbackState c = feed.callback.load();
            const double hostNs =
                static_cast<double>(c.hostTimeNs) + (rendered - static_cast<double>(c.framesAtStart)) / 48000.0 * 1e9;
            return audibleTimeline(c, dev, static_cast<std::int64_t>(hostNs)).timelineMs;
        };
        QVERIFY2(std::abs(at(47990) - 47990.0 / 48.0) < 1e-3, qPrintable(QString::number(at(47990))));  // rate 1
        QVERIFY2(std::abs(at(48240) - 1010.0) < 1e-3, qPrintable(QString::number(at(48240))));  // rate 2
        QVERIFY2(std::abs(at(48720) - 1025.0) < 1e-3, qPrintable(QString::number(at(48720))));  // rate 1
        QVERIFY2(std::abs(at(49200) - 1045.0) < 1e-3, qPrintable(QString::number(at(49200))));  // rate 3
    }

    void playSeekRatePause() {
        Sim sim;
        sim.device.start(sim.now, 0.015);
        sim.run(100);
        QVERIFY(!sim.clock.audioMaster());
        sim.clock.seek(5000.0);
        sim.clock.play();
        QVERIFY(sim.clock.audioMaster());
        sim.resetJump();
        sim.run(2000);
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        QVERIFY(sim.errorSamples > 100);
        QVERIFY2(sim.maxErrorMs <= 2.5, qPrintable(QString::number(sim.maxErrorMs)));
        QVERIFY(std::abs(sim.clock.time() - 7000.0) < 30.0);

        // Seek while playing: the playhead goes to the target, holds until
        // the target is audible, then follows the audio.
        sim.clock.seek(20000.0);
        QCOMPARE(sim.clock.currentTimeMs(), 20000.0);
        sim.resetJump();
        sim.resetError();
        sim.run(1000);
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        QVERIFY2(sim.maxErrorMs <= 2.5, qPrintable(QString::number(sim.maxErrorMs)));
        QVERIFY(sim.clock.time() >= 20000.0 && sim.clock.time() < 21000.0);

        // Rate change: no re-seek, the timeline continues at the new slope.
        sim.resetError();
        const double before = sim.clock.currentTimeMs();
        sim.clock.setRate(2.0);
        QVERIFY(std::abs(sim.clock.currentTimeMs() - before) < 1e-9);
        sim.run(1000);
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        QVERIFY2(sim.maxErrorMs <= 5.0, qPrintable(QString::number(sim.maxErrorMs)));
        const double t1 = sim.clock.time();
        sim.run(500);
        QVERIFY(std::abs((sim.clock.time() - t1) - 1000.0) < 20.0);

        // Pause: the playhead stops.
        sim.clock.pause();
        const double paused = sim.clock.time();
        sim.run(500);
        QCOMPARE(sim.clock.currentTimeMs(), paused);
    }

    void deviceChange() {
        Sim sim;
        sim.device.start(sim.now, 0.010);
        sim.clock.play();
        sim.run(1000);
        sim.resetError();
        // A reroute: a new device with 40 ms latency. The engine keeps its
        // frame counter; the clock re-anchors on the new generation.
        sim.device.start(sim.now, 0.040);
        sim.run(2000);
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        QVERIFY2(sim.maxErrorMs <= 2.5, qPrintable(QString::number(sim.maxErrorMs)));
        QVERIFY(sim.clock.audioMaster());
    }

    void fallbackToMonotonicAndBack() {
        Sim sim;
        sim.device.start(sim.now, 0.010);
        sim.clock.play();
        sim.run(1000);
        sim.device.stop();
        sim.run(1000);
        QVERIFY(!sim.clock.audioMaster());
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        // The monotonic clock keeps the playhead moving.
        QVERIFY(std::abs(sim.clock.time() - 2000.0) < 40.0);
        sim.device.start(sim.now, 0.020);
        sim.resetError();
        sim.run(1000);
        QVERIFY(sim.clock.audioMaster());
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        QVERIFY2(sim.maxErrorMs <= 2.5, qPrintable(QString::number(sim.maxErrorMs)));
    }

    // A play whose PCM is late starts at the 300 ms deadline, held at its
    // target until then.
    void playStartDeadline() {
        Sim sim;
        sim.device.start(sim.now, 0.0);
        sim.device.pcmReady = false;
        sim.clock.seek(1000.0);
        sim.clock.play();
        sim.run(250);
        QCOMPARE(sim.clock.time(), 1000.0);
        sim.run(200);
        QVERIFY(sim.clock.time() > 1000.0);
        QVERIFY(sim.clock.time() < 1000.0 + 160.0);
        QVERIFY(sim.device.driver->lastStartLate());
    }

    // An hour on a device 100 ppm fast. The playhead follows the device, so
    // the error against the audible frame stays at the jitter.
    void noDriftOverAnHour() {
        Sim sim;
        sim.device.trueRate = kNominalRate * 1.0001;
        sim.device.start(sim.now, 0.012);
        sim.clock.play();
        sim.run(60'000);
        const double firstMinute = sim.maxErrorMs;
        sim.resetError();
        sim.run(58.0 * 60'000);
        sim.resetError();
        sim.run(60'000);
        const double lastMinute = sim.maxErrorMs;
        qInfo("error vs audible frame: first minute %.3f ms, last minute %.3f ms, jump max %.3f ms", firstMinute,
              lastMinute, sim.maxJumpMs);
        QVERIFY(sim.errorSamples > 3000);
        QVERIFY2(lastMinute <= 2.5, qPrintable(QString::number(lastMinute)));
        QVERIFY(lastMinute <= firstMinute + 0.5);
        QVERIFY2(sim.maxJumpMs <= kFrameMs, qPrintable(QString::number(sim.maxJumpMs)));
        // The timeline advanced by the frames the device played: 100 ppm more
        // than the wall clock.
        const double expected = 3600.0 * 1000.0 * 1.0001;
        QVERIFY2(std::abs(sim.clock.time() - expected) < 30.0, qPrintable(QString::number(sim.clock.time() - expected)));
    }

    // With no device the monotonic clock runs, as before M3.
    void monotonicOnly() {
        PlaybackClock clock;
        std::int64_t now = 0;
        clock.setNowSource([&]() { return now; });
        clock.setDurationMs(10000.0);
        clock.setLoop(false);
        clock.play();
        now = 1500 * kMs;
        clock.tick();
        QCOMPARE(clock.time(), 1500.0);
        clock.setRate(-1.0);
        now = 2000 * kMs;
        QCOMPARE(clock.currentTimeMs(), 1000.0);
        now = 20000 * kMs;
        clock.tick();
        QCOMPARE(clock.time(), 0.0);
    }
};

QTEST_APPLESS_MAIN(TstAudioClock)
#include "tst_audioclock.moc"
