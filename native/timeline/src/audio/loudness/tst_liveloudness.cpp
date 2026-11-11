#include "audio/loudness/LiveLoudness.h"
#include <QtTest>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <numbers>
#include <thread>

using namespace nt::audio;
namespace {
constexpr double none = -std::numeric_limits<double>::infinity();
std::array<float, 960> signal() {
    std::array<float, 960> x{};
    for (int i = 0; i < 480; ++i) {
        x[2 * i] = x[2 * i + 1] =
            static_cast<float>(std::pow(10., -23. / 20) * std::sin(2 * std::numbers::pi * 997 * i / 48000));
    }
    return x;
}
void feed(LiveLoudness& live, int blocks, std::uint64_t& position) {
    std::array<float, 960> x{};
    for (int b = 0; b < blocks; ++b) {
        for (int i = 0; i < 480; ++i, ++position) {
            x[2 * i] = x[2 * i + 1] =
                static_cast<float>(std::pow(10., -23. / 20) * std::sin(2 * std::numbers::pi * 997 * position / 48000));
        }
        live.process(x.data(), 480);
    }
}
}
class TestLiveLoudness : public QObject {
    Q_OBJECT
private slots:
    void stereoSine() {
        LoudnessReadout out;
        LiveLoudness live(out);
        live.prepare(48000);
        QCOMPARE(out.read().blocks, std::uint64_t{0});
        QCOMPARE(out.read().integrated, none);
        std::uint64_t pos = 0;
        feed(live, 100, pos);
        QVERIFY(std::abs(out.read().momentary + 23) < 0.1);
        feed(live, 1900, pos);
        const auto r = out.read();
        QVERIFY(std::abs(r.integrated + 23) < 0.1);
        QVERIFY(std::abs(r.shortTerm + 23) < 0.1);
        QCOMPARE(r.blocks, std::uint64_t{2000});
        QVERIFY(std::abs(r.truePeakDb + 23) < 0.1);
        QVERIFY(r.loudnessRange < 0.1);
    }
    void resetAndDiscontinuity() {
        LoudnessReadout out;
        LiveLoudness live(out);
        live.prepare(48000);
        std::uint64_t pos = 0;
        feed(live, 400, pos);
        const auto before = out.read();
        QVERIFY(std::isfinite(before.integrated));
        live.discontinuity();
        const auto cut = out.read();
        QCOMPARE(cut.integrated, before.integrated);
        QCOMPARE(cut.truePeakDb, before.truePeakDb);
        QCOMPARE(cut.momentary, none);
        QCOMPARE(cut.shortTerm, none);
        QCOMPARE(cut.blocks, before.blocks);
        feed(live, 10, pos);
        QVERIFY(std::isfinite(out.read().momentary));
        std::jthread requester([&] {
            out.requestReset();
            out.requestReset();
        });
        requester.join();
        // The readings clear at once, so Reset works while paused, when the audio thread processes nothing.
        QCOMPARE(out.read().integrated, none);
        QCOMPARE(out.read().truePeakDb, none);
        QCOMPARE(out.read().blocks, before.blocks + 10);
        std::array<float, 960> silence{};
        live.process(silence.data(), 480);
        const auto cleared = out.read();
        QCOMPARE(cleared.integrated, none);
        QCOMPARE(cleared.truePeakDb, none);
        QCOMPARE(cleared.momentary, none);
        QCOMPARE(cleared.maxMomentary, none);
        QCOMPARE(cleared.maxShortTerm, none);
        QCOMPARE(cleared.blocks, std::uint64_t{411});
        feed(live, 29, pos);
        QCOMPARE(out.read().integrated, none);
        feed(live, 11, pos);
        QVERIFY(std::abs(out.read().integrated + 23) < 0.2);
    }
    void blockSizesAndPreparation() {
        LoudnessReadout a, b;
        LiveLoudness large(a), small(b);
        large.prepare(44100);
        small.prepare(44100);
        std::vector<float> x(44100 * 4 * 2);
        for (std::size_t i = 0; i < x.size() / 2; ++i) {
            x[2 * i] = x[2 * i + 1] = static_cast<float>(0.1 * std::sin(2 * std::numbers::pi * 997 * i / 44100));
        }
        large.process(x.data(), x.size() / 2);
        for (std::size_t i = 0; i < x.size() / 2; ++i) {
            small.process(x.data() + 2 * i, 1);
        }
        QCOMPARE(a.read().integrated, b.read().integrated);
        QCOMPARE(a.read().truePeakDb, b.read().truePeakDb);
        const auto blocks = a.read().blocks;
        large.prepare(96000);
        QCOMPARE(a.read().integrated, none);
        QCOMPARE(a.read().blocks, blocks);
        large.process(nullptr, 0);
        QCOMPARE(a.read().blocks, blocks + 1);
    }
    void threadStress() {
        LoudnessReadout out;
        LiveLoudness live(out);
        live.prepare(48000);
        const auto x = signal();
        std::atomic<bool> done{false}, valid{true};
        std::atomic<std::uint64_t> reads{0}, resets{0};
        const auto reader = [&] {
            std::uint64_t previous = 0;
            do {
                const auto r = out.read();
                if (r.blocks < previous) {
                    valid.store(false);
                }
                previous = r.blocks;
                for (double v : {r.momentary, r.shortTerm, r.integrated, r.maxMomentary, r.maxShortTerm}) {
                    if (std::isnan(v) || v > 10 || (std::isfinite(v) && v < -200)) {
                        valid.store(false);
                    }
                }
                if (std::isnan(r.truePeakDb) || r.truePeakDb > 30 || std::isnan(r.loudnessRange) ||
                    r.loudnessRange > 90 || (std::isfinite(r.loudnessRange) && r.loudnessRange < 0)) {
                    valid.store(false);
                }
                reads.fetch_add(1, std::memory_order_relaxed);
            } while (!done.load());
        };
        std::jthread r1(reader), r2(reader);
        std::jthread resetter([&] {
            do {
                out.requestReset();
                resets.fetch_add(1);
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
            } while (!done.load());
        });
        std::jthread audio([&] {
            for (int i = 0; i < 600; ++i) {
                live.process(x.data(), 480);
            }
            done.store(true);
        });
        audio.join();
        r1.join();
        r2.join();
        resetter.join();
        QVERIFY(valid.load());
        QVERIFY(reads.load() > 0);
        QVERIFY(resets.load() > 0);
        QCOMPARE(out.read().blocks, std::uint64_t{600});
    }
};
QTEST_GUILESS_MAIN(TestLiveLoudness)
#include "tst_liveloudness.moc"
