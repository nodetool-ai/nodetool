#include "audio/ShuttleStretch.h"
#include "audio/TestAllocationCounter.h"
#include <QtTest>
#include <array>
#include <cmath>
#include <ctime>
#include <limits>
#include <numbers>
#include <vector>

// Test cases adapted from FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/shuttle.rs, MIT. See licenses/FilmCraft-MIT.txt.
using namespace nt::audio;
using nt::testing::allocations;
using nt::testing::countAllocations;
namespace {
struct Tone : ShuttleSource {
    double sr = 48000, hz = 440, anchor = 0, last = -1e300, lastEnd = -1e300;
    bool burst = false, nan = false, valid = true;
    void mix(double ms, int frames, float* out) override {
        valid &= ms >= anchor && ms >= last && ms + 1e-7 >= lastEnd && frames <= kShuttleMaxRequestFrames;
        lastEnd = ms + frames * 1000 / sr;
        last = ms;
        for (int i = 0; i < frames; ++i) {
            const double t = (std::llround(ms * sr / 1000) + i) / sr;
            const float x = nan ? std::numeric_limits<float>::quiet_NaN() :
                (!burst || (t >= .5 && t < .6) ? std::sin(2 * std::numbers::pi * hz * t) : 0);
            out[2*i] = out[2*i+1] = x;
        }
    }
};
double amplitude(const std::vector<float>& out, int first, int count, double hz, double sr) {
    double re = 0, im = 0;
    for (int i = 0; i < count; ++i) {
        const double phase = 2 * std::numbers::pi * hz * i / sr;
        re += out[2*(first+i)] * std::cos(phase);
        im += out[2*(first+i)] * std::sin(phase);
    }
    return 2 * std::hypot(re, im) / count;
}
}
class TstShuttleStretch : public QObject {
    Q_OBJECT
private slots:
    void tones_data() {
        QTest::addColumn<int>("sr"); QTest::addColumn<double>("rate"); QTest::addColumn<double>("hz");
        for (int sr : {44100, 48000, 96000}) for (double r : {.25, .5, .75, 1.5, 2., 4., 8.})
            for (double hz : {440., 660., 1000., 6300., 9000., 18000.})
                QTest::newRow(qPrintable(QString("%1-%2-%3").arg(sr).arg(r).arg(hz))) << sr << r << hz;
    }
    void tones() {
        QFETCH(int, sr); QFETCH(double, rate); QFETCH(double, hz);
        Tone source; source.sr = sr; source.hz = hz;
        ShuttleStretcher stretch(sr); stretch.begin(rate, 0);
        std::vector<float> out(sr);
        stretch.render(source, 0, sr/2, out.data());
        const int first = sr/10, count = sr*3/10;
        const double own = amplitude(out, first, count, hz, sr);
        QVERIFY2(own > .5, qPrintable(QString("original amplitude %1").arg(own)));
        if (hz*rate < sr/2.) QVERIFY(amplitude(out, first, count, hz*rate, sr) < .15*own);
        double best = 0, peak = 0;
        // Candidate bins include the expected tone, its resampled pitch and nearby sidebands.
        for (double f = hz*.95; f <= hz*1.05; f += hz*.0025) {
            const double a = amplitude(out, first, count, f, sr);
            if (a > best) { best = a; peak = f; }
        }
        QVERIFY(std::abs(peak/hz-1) < .01);
        QVERIFY(source.valid);
    }
    void chunking() {
        for (double rate : {.1, .25, 2., 8.}) {
            Tone a, b; ShuttleStretcher x(48000), y(48000);
            x.begin(rate, 0); y.begin(rate, 0);
            std::vector<float> whole(48000), cut(48000);
            x.render(a, 0, 24000, whole.data());
            const std::array sizes{1, 7, 333, 1024, 4096};
            for (int at = 0, i = 0; at < 24000; ++i) {
                const int n = std::min(sizes[i % sizes.size()], 24000-at);
                y.render(b, at, n, cut.data()+2*at); at += n;
            }
            QVERIFY(whole == cut); QVERIFY(a.valid); QVERIFY(b.valid);
            Tone fresh; ShuttleStretcher z(48000); z.begin(rate, 0);
            y.render(b, 48000, 12000, cut.data()); z.render(fresh, 48000, 12000, whole.data());
            QVERIFY2(std::equal(cut.begin()+4000, cut.begin()+24000, whole.begin()+4000),
                     qPrintable(QString("skip restart at %1x").arg(rate)));
            QVERIFY(b.valid);
        }
    }
    void latency() {
        for (double rate : {.5, 2., 4., 8.}) {
            Tone source; source.burst = true;
            ShuttleStretcher stretch(48000); stretch.begin(rate, 0);
            const int n = static_cast<int>(48000*1.4/rate);
            std::vector<float> out(n*2); stretch.render(source, 0, n, out.data());
            double energy = 0, centroid = 0, early = 0;
            for (int i = 0; i < n; ++i) {
                const double e = out[2*i]*out[2*i], timeline = i/48000.*rate;
                energy += e; centroid += e*timeline;
                if (timeline < .475) early = std::max(early, std::abs(double(out[2*i])));
            }
            QVERIFY(energy > 1);
            QVERIFY2(std::abs(centroid/energy-.55) < .025,
                     qPrintable(QString("%1x centroid %2").arg(rate).arg(centroid/energy)));
            QVERIFY2(early < 1e-4, qPrintable(QString("%1x early %2").arg(rate).arg(early)));
        }
    }
    void hostile() {
        QVERIFY(!shuttleKeepsPitch(1)); QVERIFY(!shuttleKeepsPitch(-1));
        QVERIFY(shuttleKeepsPitch(.1)); QVERIFY(shuttleKeepsPitch(8));
        for (double r : {std::nan(""), std::numeric_limits<double>::infinity(), -1., 0., 1e300}) {
            Tone source; source.nan = true;
            ShuttleStretcher stretch(48000); stretch.begin(r, 10);
            std::array<float, 8192> out{};
            for (auto at : {INT64_MIN, INT64_MAX, std::int64_t(-1), std::int64_t(0), std::int64_t(48000)}) {
                stretch.render(source, at, 4096, out.data());
                QVERIFY(std::all_of(out.begin(), out.end(), [](float v) { return std::isfinite(v); }));
            }
            stretch.render(source, 0, 1, out.data()); QVERIFY(std::isfinite(out[0]));
        }
    }
    void noAllocation() {
        QVERIFY(nt::testing::countsAnAllocation());
        for (int sr : {48000, 96000}) for (double rate : {.1, .25, 2., 8.}) {
            Tone source; source.anchor = 123; source.sr = sr;
            ShuttleStretcher stretch(sr); std::array<float, 1024> out{};
            const auto started = std::clock();
            allocations = 0; countAllocations = true;
            stretch.begin(rate, 123);
            for (int i = 0; i < 2 * sr; i += 512) stretch.render(source, i, 512, out.data());
            countAllocations = false;
            const double cpuMs = double(std::clock() - started) * 1000 / CLOCKS_PER_SEC;
            qInfo("%d Hz, %gx: 2 s output, %.2f ms CPU (%.2f%% core), %zu allocations", sr, rate, cpuMs, cpuMs / 20, std::size_t{allocations});
            QVERIFY(source.valid);
            QCOMPARE(std::size_t{allocations}, std::size_t{0});
            // A sanitizer's slowdown says nothing about the plain build.
#ifndef NT_SANITIZED
            QVERIFY2(cpuMs < 200, "stretcher exceeds 10% of one core");
#endif
        }
    }
};
QTEST_GUILESS_MAIN(TstShuttleStretch)
#include "tst_shuttlestretch.moc"
