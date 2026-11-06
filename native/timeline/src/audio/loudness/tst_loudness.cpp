// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/loudness.rs, MIT. See licenses/FilmCraft-MIT.txt.
// Ported from FilmCraft (https://github.com/storytold/filmcraft), crates/audio-dsp/src/oversample.rs, MIT. See licenses/FilmCraft-MIT.txt.
#include "audio/loudness/Loudness.h"
#include "audio/loudness/LiveLoudness.h"
#include "audio/TestAllocationCounter.h"

#include <QDir>
#include <QFile>
#include <QtTest>
#include <algorithm>
#include <bit>
#include <cmath>
#include <memory>
#include <numbers>

namespace {
using nt::testing::allocations;
using nt::testing::countAllocations;
constexpr double pi = std::numbers::pi;
constexpr double none = -std::numeric_limits<double>::infinity();
double gain(double db) {
    return std::pow(10.0, db / 20.0);
}
std::vector<float> sine(double sr, double frequency, double seconds, double level, double phase = 0) {
    std::vector<float> x(static_cast<std::size_t>(std::llround(sr * seconds)));
    for (std::size_t i = 0; i < x.size(); ++i) {
        x[i] = static_cast<float>(gain(level) * std::sin(2 * pi * frequency * i / sr + phase));
    }
    return x;
}
std::vector<float> segments(std::initializer_list<std::pair<double, double>> parts, double sr = 48000) {
    std::vector<float> x;
    for (auto [seconds, level] : parts) {
        auto part = sine(sr, 1000, seconds, level);
        x.insert(x.end(), part.begin(), part.end());
    }
    return x;
}
void stereo(nt::audio::LoudnessMeter& meter, const std::vector<float>& x, int block = 1237) {
    for (int i = 0; i < static_cast<int>(x.size()); i += block) {
        const float* p[] = {x.data() + i, x.data() + i};
        meter.processPlanar(p, std::min(block, static_cast<int>(x.size()) - i));
    }
}
double kPower(double f, double sr) {
    const double h = nt::audio::loudness_detail::kPrefilter(sr).magnitude(f, sr) *
                     nt::audio::loudness_detail::kRlb(sr).magnitude(f, sr);
    return h * h;
}
void same(const nt::audio::LoudnessMeter& a, const nt::audio::LoudnessMeter& b) {
    const std::array av{a.momentary(),    a.shortTerm(),     a.integrated(), a.maxMomentary(),
                        a.maxShortTerm(), a.loudnessRange(), a.samplePeak(), a.truePeak()};
    const std::array bv{b.momentary(),    b.shortTerm(),     b.integrated(), b.maxMomentary(),
                        b.maxShortTerm(), b.loudnessRange(), b.samplePeak(), b.truePeak()};
    for (std::size_t i = 0; i < av.size(); ++i) {
        QCOMPARE(std::bit_cast<std::uint64_t>(av[i]), std::bit_cast<std::uint64_t>(bv[i]));
    }
}
struct Signal {
    const char* name;
    int sr, channels;
    std::vector<float> data;
};
Signal referenceSignal(int id) {
    const int sr = id == 2 ? 44100 : id == 4 ? 96000 : 48000;
    const int channels = id == 3 ? 1 : 2;
    const int seconds = id == 1 ? 30 : id == 3 ? 15 : 20;
    const char* names[] = {"sine997", "gated-noise", "modulated-tones", "mono440", "speech"};
    Signal s{names[id], sr, channels, std::vector<float>(static_cast<std::size_t>(sr * seconds * channels))};
    std::uint64_t rng = 9;
    double phase = 0;
    for (int i = 0; i < sr * seconds; ++i) {
        const double t = static_cast<double>(i) / sr;
        double value = 0;
        if (id == 0) {
            value = 0.0707946 * std::sin(2 * pi * 997 * t);
        } else if (id == 2) {
            value = 0.1 * (std::sin(2 * pi * 220 * t) + 0.5 * std::sin(2 * pi * 1500 * t)) *
                    (0.6 + 0.4 * std::sin(2 * pi * 4 * t));
        } else if (id == 3) {
            value = gain(-18) * std::sin(2 * pi * 440 * t);
        } else if (id == 4) {
            // essential_sound_tests.rs speech(), adapted to the fixture's sample rate.
            const double f0 = 135 + 25 * std::sin(2 * pi * 0.7 * t);
            phase += f0 / sr;
            for (int k = 1; k * f0 < 4000; ++k) {
                value += std::sin(2 * pi * phase * k) / k;
            }
            value = static_cast<float>(value * (0.6 - 0.4 * std::cos(2 * pi * 4.5 * t)) * 0.5) * 0.2f;
        }
        for (int ch = 0; ch < channels; ++ch) {
            if (id == 1) {
                rng ^= rng << 13;
                rng ^= rng >> 7;
                rng ^= rng << 17;
                value = static_cast<float>(rng >> 40) / 16777216.f * 2.f - 1.f;
            }
            s.data[static_cast<std::size_t>(i * channels + ch)] = static_cast<float>(value);
        }
    }
    if (id == 1) {
        for (int part = 0; part < 3; ++part) {
            const double level[] = {-20, -40, -30};
            const int begin = part * 10 * sr * 2, end = begin + 10 * sr * 2;
            double sum = 0;
            for (int i = begin; i < end; ++i) {
                sum += static_cast<double>(s.data[i]) * s.data[i];
            }
            const double scale = gain(level[part]) / std::sqrt(sum / (end - begin));
            for (int i = begin; i < end; ++i) {
                s.data[i] = static_cast<float>(s.data[i] * scale);
            }
        }
    }
    return s;
}
void writeWav(const QString& dir, const Signal& s) {
    QDir().mkpath(dir);
    QFile f(dir + '/' + s.name + ".wav");
    QVERIFY(f.open(QIODevice::WriteOnly));
    const auto u16 = [&f](std::uint16_t v) {
        const char b[] = {char(v), char(v >> 8)};
        f.write(b, 2);
    };
    const auto u32 = [&f](std::uint32_t v) {
        const char b[] = {char(v), char(v >> 8), char(v >> 16), char(v >> 24)};
        f.write(b, 4);
    };
    const auto bytes = static_cast<std::uint32_t>(s.data.size() * sizeof(float));
    f.write("RIFF", 4);
    u32(36 + bytes);
    f.write("WAVEfmt ", 8);
    u32(16);
    u16(3);
    u16(s.channels);
    u32(s.sr);
    u32(s.sr * s.channels * 4);
    u16(s.channels * 4);
    u16(32);
    f.write("data", 4);
    u32(bytes);
    for (float v : s.data) {
        u32(std::bit_cast<std::uint32_t>(v));
    }
    QCOMPARE(f.error(), QFileDevice::NoError);
}
}

using nt::audio::LoudnessMeter;
class TestLoudness : public QObject {
    Q_OBJECT
private slots:
    void kWeightingTable() {
        const auto p = nt::audio::loudness_detail::kPrefilter(48000);
        const auto r = nt::audio::loudness_detail::kRlb(48000);
        QVERIFY(std::abs(p.b0 - 1.53512485958697) < 1e-8);
        QVERIFY(std::abs(p.b1 + 2.69169618940638) < 1e-8);
        QVERIFY(std::abs(p.b2 - 1.19839281085285) < 1e-8);
        QVERIFY(std::abs(p.a1 + 1.69065929318241) < 1e-8);
        QVERIFY(std::abs(p.a2 - 0.73248077421585) < 1e-8);
        QCOMPARE(r.b0, 1.0);
        QCOMPARE(r.b1, -2.0);
        QCOMPARE(r.b2, 1.0);
        QVERIFY(std::abs(r.a1 + 1.99004745483398) < 1e-8);
        QVERIFY(std::abs(r.a2 - 0.99007225036621) < 1e-8);
        for (double sr : {32000., 44100., 48000., 96000., 192000.}) {
            QVERIFY(std::abs(10 * std::log10(kPower(1000, sr)) - 0.691) < 0.03);
            QVERIFY(std::abs(10 * std::log10(kPower(10000, sr)) - 4) < 0.3);
            QVERIFY(10 * std::log10(kPower(20, sr)) < -10);
        }
    }
    void tech3341Sines() {
        for (double sr : {44100., 48000., 96000.}) {
            for (double level : {-23., -33.}) {
                const auto x = sine(sr, sr == 44100 ? 997 : 1000, 20, level);
                LoudnessMeter m(sr, 2);
                stereo(m, x);
                QCOMPARE(m.sampleRate(), sr);
                QCOMPARE(m.channels(), 2);
                for (double v : {m.integrated(), m.momentary(), m.shortTerm(), m.maxMomentary(), m.maxShortTerm()}) {
                    QVERIFY(std::abs(v - level) < 0.1);
                }
                QVERIFY(m.loudnessRange() < 0.1);
            }
        }
    }
    void gating() {
        for (const auto& x : {segments({{10, -36}, {60, -23}, {10, -36}}),
                              segments({{10, -72}, {10, -36}, {60, -23}, {10, -36}, {10, -72}}),
                              segments({{20, -26}, {20.1, -20}, {20, -26}})}) {
            LoudnessMeter m(48000, 2);
            stereo(m, x);
            QVERIFY2(std::abs(m.integrated() + 23) < 0.1, qPrintable(QString::number(m.integrated())));
        }
        LoudnessMeter m(48000, 2);
        stereo(m, std::vector<float>(96000));
        QCOMPARE(m.integrated(), none);
        QCOMPARE(m.loudnessRange(), 0.0);
        stereo(m, sine(48000, 1000, 5, -80));
        QCOMPARE(m.integrated(), none);
    }
    void range() {
        const std::array cases{std::pair{segments({{20, -20}, {20, -30}}), 10.0},
                               std::pair{segments({{20, -20}, {20, -15}}), 5.0},
                               std::pair{segments({{20, -40}, {20, -20}}), 20.0},
                               std::pair{segments({{20, -50}, {20, -35}, {20, -20}, {20, -35}, {20, -50}}), 15.0}};
        for (const auto& [x, expected] : cases) {
            LoudnessMeter m(48000, 2);
            stereo(m, x);
            QVERIFY(std::abs(m.loudnessRange() - expected) < 1);
        }
    }
    void sweep() {
        auto x = sine(48000, 1, 20, -20);
        double phase = 0, energy = 0;
        for (std::size_t i = 0; i < x.size(); ++i) {
            const double f = 20 * std::exp(std::log(1000.) * i / x.size());
            x[i] = static_cast<float>(0.1 * std::sin(phase));
            phase += 2 * pi * f / 48000;
            energy += 0.01 * kPower(f, 48000);
        }
        const double expected = -0.691 + 10 * std::log10(energy / x.size());
        LoudnessMeter m(48000, 2);
        stereo(m, x);
        QVERIFY(m.integrated() >= expected - 0.1 && m.integrated() - expected < 0.6);
    }
    void layouts() {
        auto x = sine(48000, 1000, 4, -30);
        std::vector<float> z(x.size());
        for (int nch : {5, 6, 8}) {
            LoudnessMeter front(48000, nch), surround(48000, nch), lfe(48000, nch);
            std::vector<const float*> p(nch, z.data());
            p[0] = x.data();
            front.processPlanar(p.data(), x.size());
            p[0] = z.data();
            const int ls = nch == 5 ? 3 : 4;
            p[ls] = x.data();
            surround.processPlanar(p.data(), x.size());
            p[ls] = z.data();
            QVERIFY(std::abs(surround.integrated() - front.integrated() - 10 * std::log10(1.41)) < 0.01);
            if (nch != 5) {
                p[3] = x.data();
                lfe.processPlanar(p.data(), x.size());
                QCOMPARE(lfe.integrated(), none);
                const std::array weights{1., 1., 1., 1.};
                lfe.setChannelWeights(weights);
                lfe.reset();
                lfe.processPlanar(p.data(), x.size());
                QCOMPARE(lfe.integrated(), front.integrated());
            }
        }
    }
    void truePeaks() {
        for (double sr : {44100., 48000., 96000., 192000.}) {
            LoudnessMeter m(sr, 2);
            stereo(m, sine(sr, sr / 4, 1, 0, pi / 4));
            QVERIFY(std::abs(20 * std::log10(m.samplePeak()) + 3.0103) < 0.01);
            if (sr < 176400) {
                QVERIFY2(m.truePeakDb() >= -0.4 && m.truePeakDb() <= 0.2,
                         qPrintable(QString("sr %1 TP %2").arg(sr).arg(m.truePeakDb())));
            } else {
                QCOMPARE(m.truePeak(), m.samplePeak());
            }
        }
        for (auto [sr, frequency, level, phase] :
             {std::array{48000., 997., -6., 0.3}, std::array{44100., 11025., 0., 0.}}) {
            LoudnessMeter m(sr, 2);
            stereo(m, sine(sr, frequency, 1, level, phase));
            QVERIFY(std::abs(m.truePeakDb() - level) < 0.2);
        }
    }
    void blockAndLayoutEquality() {
        const auto s = referenceSignal(2);
        // A meter holds about 290 KB of histograms, so these go on the heap: five of them would overflow Windows' 1 MB stack.
        const auto bigOwner = std::make_unique<LoudnessMeter>(s.sr, 2);
        const auto planarOwner = std::make_unique<LoudnessMeter>(s.sr, 2);
        const auto tinyOwner = std::make_unique<LoudnessMeter>(s.sr, 2);
        LoudnessMeter& big = *bigOwner;
        LoudnessMeter& planar = *planarOwner;
        LoudnessMeter& tiny = *tinyOwner;
        std::vector<float> left(s.data.size() / 2), right(left.size());
        for (std::size_t i = 0; i < left.size(); ++i) {
            left[i] = s.data[2 * i];
            right[i] = s.data[2 * i + 1] * 0.7f;
        }
        auto interleaved = s.data;
        for (std::size_t i = 0; i < right.size(); ++i) {
            interleaved[2 * i + 1] = right[i];
        }
        big.processInterleaved(interleaved.data(), left.size());
        const float* p[] = {left.data(), right.data()};
        planar.processPlanar(p, left.size());
        tiny.processInterleaved(nullptr, 0);
        for (std::size_t i = 0; i < left.size(); ++i) {
            tiny.processInterleaved(interleaved.data() + 2 * i, 1);
        }
        same(big, planar);
        same(big, tiny);
        for (double sr : {44100., 48000., 96000.}) {
            const auto x = sine(sr, 440, 4, -18);
            const auto monoOwner = std::make_unique<LoudnessMeter>(sr, 1);
            const auto smallOwner = std::make_unique<LoudnessMeter>(sr, 1);
            LoudnessMeter& mono = *monoOwner;
            LoudnessMeter& small = *smallOwner;
            mono.processInterleaved(x.data(), x.size());
            for (const float& v : x) {
                small.processInterleaved(&v, 1);
            }
            same(mono, small);
            const double expected = -0.691 - 18 - 10 * std::log10(2.) + 10 * std::log10(kPower(440, sr));
            QVERIFY(std::abs(mono.integrated() - expected) < 0.1);
        }
    }
    void resetAndNormalize() {
        LoudnessMeter m(48000, 2);
        stereo(m, sine(48000, 1000, 5, -20));
        m.reset();
        QCOMPARE(m.integrated(), none);
        QCOMPARE(m.truePeak(), 0.0);
        QCOMPARE(m.samplePeak(), 0.0);
        QCOMPARE(m.momentary(), none);
        QCOMPARE(m.shortTerm(), none);
        QCOMPARE(m.maxMomentary(), none);
        QCOMPARE(m.maxShortTerm(), none);
        QCOMPARE(m.loudnessRange(), 0.0);
        auto x = sine(48000, 1000, 5, -31.3);
        stereo(m, x);
        const double g = gain(nt::audio::normalizeGainDb(m.integrated(), -16));
        for (float& v : x) {
            v = static_cast<float>(v * g);
        }
        m.reset();
        stereo(m, x);
        QVERIFY(std::abs(m.integrated() + 16) < 0.02);
        QCOMPARE(nt::audio::normalizeGainDb(-30, -23), 7.0);
        QCOMPARE(nt::audio::normalizeGainDb(none, -23), 0.0);
        QCOMPARE(nt::audio::normalizeGainDb(-30, none), 0.0);
        QCOMPARE(nt::audio::normalizeGainDb(std::numeric_limits<double>::quiet_NaN(), -23), 0.0);
    }
    void zeroAllocations() {
        QVERIFY(nt::testing::countsAnAllocation());
        LoudnessMeter meter(48000, 2);
        nt::audio::LoudnessReadout out;
        nt::audio::LiveLoudness live(out);
        live.prepare(48000);
        auto s = referenceSignal(0);
        const float* p[] = {s.data.data(), s.data.data()};
        allocations = 0;
        countAllocations = true;
        meter.processInterleaved(s.data.data(), s.data.size() / 2);
        meter.reset();
        meter.processPlanar(p, 48000);
        volatile double reading = meter.integrated() + meter.loudnessRange();
        (void)reading;
        meter.reset();
        live.process(s.data.data(), 48000);
        live.discontinuity();
        out.requestReset();
        live.process(s.data.data(), 480);
        (void)out.read();
        countAllocations = false;
        QCOMPARE(std::size_t{allocations}, std::size_t{0});
    }
    void ffmpegReferences_data() {
        QTest::addColumn<int>("id");
        for (int i = 0; i < 5; ++i) {
            QTest::newRow(std::to_string(i).c_str()) << i;
        }
    }
    void ffmpegReferences() {
        QFETCH(int, id);
        auto s = referenceSignal(id);
        const QString dir = qEnvironmentVariable("NT_LOUDNESS_WRITE_DIR");
        if (!dir.isEmpty()) {
            writeWav(dir, s);
        }
        LoudnessMeter m(s.sr, s.channels);
        m.processInterleaved(s.data.data(), s.data.size() / s.channels);
        // ffmpeg n9.0.2 ebur128=peak=true on sine997 (48 kHz, 20 s, amplitude 0.0707946).
        // ffmpeg n9.0.2 ebur128=peak=true on gated-noise (48 kHz, 30 s, seed 9).
        // ffmpeg n9.0.2 ebur128=peak=true on modulated-tones (44.1 kHz, 20 s).
        // ffmpeg n9.0.2 ebur128=peak=true on mono440 (48 kHz mono, 15 s, -18 dBFS peak).
        // ffmpeg n9.0.2 ebur128=peak=true on speech (96 kHz, 20 s, amplitude 0.2).
        constexpr double integrated[] = {-23.0, -16.5, -22.9, -21.7, -22.4};
        constexpr double momentary[] = {-23.0, -23.8, -23.9, -21.7, -22.1};
        constexpr double shortTerm[] = {-23.0, -23.8, -22.9, -21.7, -22.4};
        constexpr double truePeak[] = {-23.0, -9.6, -16.5, -18.0, -14.9};
        qInfo("%s I %.4f M %.4f S %.4f LRA %.4f TP %.4f", s.name, m.integrated(), m.momentary(), m.shortTerm(),
              m.loudnessRange(), m.truePeakDb());
        QVERIFY(std::abs(m.integrated() - integrated[id]) <= 0.1);
        QVERIFY(std::abs(m.momentary() - momentary[id]) <= 0.1);
        QVERIFY(std::abs(m.shortTerm() - shortTerm[id]) <= 0.1);
        QVERIFY(std::abs(m.truePeakDb() - truePeak[id]) <= 0.1);
    }
};
QTEST_GUILESS_MAIN(TestLoudness)
#include "tst_loudness.moc"
