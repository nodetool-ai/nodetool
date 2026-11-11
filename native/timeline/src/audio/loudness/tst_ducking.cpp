// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/ducking.rs, MIT. See licenses/FilmCraft-MIT.txt.
// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/essential_sound.rs, MIT. See licenses/FilmCraft-MIT.txt.
#include "audio/loudness/Ducking.h"
#include <QtTest>
#include <algorithm>
#include <cmath>
#include <numbers>

using namespace nt::audio::ducking;
namespace {
void checkKeys(const std::vector<Keyframe>& actual, std::initializer_list<Keyframe> expected, double tolerance = 1e-9) {
    QCOMPARE(actual.size(), expected.size());
    std::size_t i = 0;
    for (auto e : expected) {
        QVERIFY2(std::abs(actual[i].timeS - e.timeS) <= tolerance,
                 qPrintable(QString("time %1 vs %2").arg(actual[i].timeS).arg(e.timeS)));
        QVERIFY(std::abs(actual[i].valueDb - e.valueDb) < 1e-9);
        if (i) {
            QVERIFY(actual[i].timeS > actual[i - 1].timeS);
        }
        ++i;
    }
}
std::vector<Keyframe> keys(std::initializer_list<Region> regions, double base = 0, double reduce = 10,
                           double fade = 0.5) {
    return duckKeyframes(std::span(regions.begin(), regions.size()), 0, 10, base, reduce, fade);
}
}
class TestDucking : public QObject {
    Q_OBJECT
private slots:
    void envelopeLevels() {
        std::vector<float> x(2000);
        for (int i = 1000; i < 2000; ++i) {
            x[i] = i % 2 ? -0.1f : 0.1f;
        }
        const std::array<std::span<const float>, 2> channels{x, x};
        const auto e = envelopeDb(channels, 1000, 0.01, 0.02);
        QCOMPARE(e.size(), std::size_t{200});
        QCOMPARE(e[10], kFloorDb);
        QVERIFY(std::abs(e[150] + 20) < 0.01);
        QVERIFY(e[100] < -20 && e[100] > -30);
        QVERIFY(envelopeDb({}, 1000, 0.01, 0.02).empty());
        const std::array<std::span<const float>, 2> unequal{std::span(x).first(123), x};
        QCOMPARE(envelopeDb(unequal, 1000, 0.01, 0.02).size(), std::size_t{13});
        std::fill(x.begin(), x.end(), 0.1f);
        std::vector<float> z(2000);
        const std::array<std::span<const float>, 2> oneSilent{x, z};
        QVERIFY(std::abs(envelopeDb(oneSilent, 1000, 0.01, 0.02)[100] + 23.0103) < 0.001);
    }
    void bridgesThenDropsBlips() {
        std::vector<float> env(300, -80);
        for (auto [a, b] : {std::pair{50, 100}, {110, 150}, {200, 203}}) {
            std::fill(env.begin() + a, env.begin() + b, -20);
        }
        const auto r = activity(env, 0.01, -40, 0.1, 0.2);
        QCOMPARE(r.size(), std::size_t{1});
        QCOMPARE(r[0].startS, 0.5);
        QCOMPARE(r[0].endS, 1.5);
        QCOMPARE(activity(env, 0.01, -40, 0.1, 0).size(), std::size_t{2});
        std::vector<float> tail(10, -80);
        std::fill(tail.begin() + 5, tail.end(), 0);
        const auto end = activity(tail, 0.1, -40, 0, 0);
        QCOMPARE(end.size(), std::size_t{1});
        QCOMPARE(end[0].startS, 0.5);
        QCOMPARE(end[0].endS, 1.0);
        const auto rounded = activity(tail, static_cast<double>(0.01f), -40, 0, 0);
        QCOMPARE(rounded[0].startS, 0.05);
        QCOMPARE(rounded[0].endS, 0.1);
        std::vector<float> boundary(40, -40);
        QVERIFY(activity(boundary, 0.01, -40, 0, 1).empty());
        std::fill(boundary.begin(), boundary.begin() + 10, -20);
        std::fill(boundary.begin() + 30, boundary.end(), -20);
        QCOMPARE(activity(boundary, 0.01, -40, 0.1, 0.2).size(), std::size_t{2});
        QCOMPARE(activity(boundary, 0.01, -40, 0.1, 0.201).size(), std::size_t{1});
    }
    void sensitivityMapping() {
        QCOMPARE(sensitivityThresholdDb(5), -40.0);
        QCOMPARE(sensitivityThresholdDb(0), -20.0);
        QCOMPARE(sensitivityThresholdDb(10), -60.0);
        QCOMPARE(sensitivityThresholdDb(99), -60.0);
        QCOMPARE(sensitivityThresholdDb(-3), -20.0);
    }
    void basicAndMerge() {
        checkKeys(keys({{2, 4}}, 0, 15), {{1.5, 0}, {2, -15}, {4, -15}, {4.5, 0}});
        checkKeys(keys({{2, 4}, {4.8, 6}}, -3, 12), {{1.5, -3}, {2, -15}, {6, -15}, {6.5, -3}});
        checkKeys(keys({{5, 6}, {1, 2}}, 0, 10, 0.25),
                  {{0.75, 0}, {1, -10}, {2, -10}, {2.25, 0}, {4.75, 0}, {5, -10}, {6, -10}, {6.25, 0}});
        checkKeys(keys({{2, 4}, {5, 6}}, 0, -15), {{1.5, 0}, {2, -15}, {6, -15}, {6.5, 0}});
        QVERIFY(keys({}).empty());
        QVERIFY(keys({{3, 2}, {1, 1}}).empty());
    }
    void clipEdges() {
        checkKeys(keys({{-1, 2}}), {{0, -10}, {2, -10}, {2.5, 0}});
        checkKeys(keys({{0.25, 2}}), {{0, -5}, {0.25, -10}, {2, -10}, {2.5, 0}});
        checkKeys(keys({{8, 12}}), {{7.5, 0}, {8, -10}, {10, -10}});
        checkKeys(keys({{8, 9.75}}), {{7.5, 0}, {8, -10}, {9.75, -10}, {10, -5}});
        QVERIFY(keys({{11, 12}, {-3, -1}}).empty());
        checkKeys(keys({{2, 3}}, 0, 10, 0), {{1.999, 0}, {2, -10}, {3, -10}, {3.001, 0}});
        checkKeys(keys({{-1, 12}}), {{0, -10}, {10, -10}});
    }
    void streamedEnvelope() {
        const int sr = 44100, n = sr * 2 + 137;
        std::vector<float> x(n * 2);
        for (int i = 0; i < n; ++i) {
            x[2 * i] = static_cast<float>(0.2 * std::sin(2 * std::numbers::pi * 220 * i / sr));
            x[2 * i + 1] = static_cast<float>(0.13 * std::cos(2 * std::numbers::pi * 337 * i / sr));
        }
        EnvelopeBuilder big(sr);
        big.feed(x.data(), n);
        const auto expected = big.finish();
        QCOMPARE(expected.size(), static_cast<std::size_t>((n + 440) / 441));
        QCOMPARE(big.hopS(), 0.01);
        QVERIFY(big.finish().empty());
        // Independent direct trigger_envelope calculation, including the short final hop.
        std::vector<double> power;
        for (int i = 0; i < n; i += 441) {
            double sum = 0;
            const int end = std::min(i + 441, n);
            for (int j = i; j < end; ++j) {
                const double l = x[2 * j], r = x[2 * j + 1];
                sum += 0.5 * (l * l + r * r);
            }
            power.push_back(sum / (end - i));
        }
        for (std::size_t k = 0; k < power.size(); ++k) {
            double sum = 0;
            const auto lo = k < 2 ? 0 : k - 2, hi = std::min(k + 3, power.size());
            for (auto j = lo; j < hi; ++j) {
                sum += power[j];
            }
            const float value = static_cast<float>(std::max(-120., 10 * std::log10(std::max(1e-12, sum / (hi - lo)))));
            QCOMPARE(expected[k], value);
        }
        for (int block : {1, 100, 7777}) {
            EnvelopeBuilder b(sr);
            b.feed(nullptr, 0);
            for (int i = 0; i < n; i += block) {
                b.feed(x.data() + 2 * i, std::min(block, n - i));
            }
            QCOMPARE(b.finish(), expected);
            b.feed(x.data(), n);
            QCOMPARE(b.finish(), expected);
        }
        EnvelopeBuilder partial(1000, 0.01, 1);
        const float sample[] = {0.1f, 0.1f};
        partial.feed(sample, 1);
        const auto one = partial.finish();
        QCOMPARE(one.size(), std::size_t{1});
        QVERIFY(std::abs(one[0] + 20) < 0.001);
    }
    void speechFixture() {
        constexpr int sr = 48000;
        std::vector<float> data(sr * 10 * 2);
        for (int i = 0; i < sr * 10; ++i) {
            const double t = static_cast<double>(i) / sr;
            const float x =
                (t >= 2 && t < 4) || (t >= 6 && t < 7.5)
                    ? static_cast<float>(std::pow(10., -12. / 20) * std::sin(2 * std::numbers::pi * 220 * t))
                    : 0;
            data[2 * i] = data[2 * i + 1] = x;
        }
        EnvelopeBuilder b(sr);
        b.feed(data.data(), sr * 10);
        const auto r = activity(b.finish(), kHopS, sensitivityThresholdDb(6), kMinOnS, kBridgeS);
        QCOMPARE(r.size(), std::size_t{2});
        QVERIFY(std::abs(r[0].startS - 2) <= 0.020001);
        QVERIFY(std::abs(r[0].endS - 4) <= 0.020001);
        QVERIFY(std::abs(r[1].startS - 6) <= 0.020001);
        QVERIFY(std::abs(r[1].endS - 7.5) <= 0.020001);
        checkKeys(duckKeyframes(r, 0, 10, 0, 15, 0.8),
                  {{1.2, 0}, {2, -15}, {4, -15}, {4.8, 0}, {5.2, 0}, {6, -15}, {7.5, -15}, {8.3, 0}}, 0.06);
    }
};
QTEST_GUILESS_MAIN(TestDucking)
#include "tst_ducking.moc"
