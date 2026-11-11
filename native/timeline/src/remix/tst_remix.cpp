// Ported from FilmCraft (https://github.com/storytold/filmcraft, crates/audio-dsp/src/remix.rs and fft.rs), MIT OR Apache-2.0, see native/timeline/licenses/FilmCraft-MIT.txt
#include "assets/AssetWav.h"
#include "audio/AudioSource.h"
#include "remix/RemixDsp.h"
#include "remix/RemixFile.h"
#include "platform/SanitizerBuild.h"
#include <QElapsedTimer>
#include <QFile>
#include <QTemporaryDir>
#include <QTest>
#include <QtEndian>
#include <algorithm>
#include <cmath>
#include <complex>
#include <ctime>
#include <limits>
#include <numbers>
#include <vector>

using namespace nt::remix;
namespace {
constexpr double tau = 2 * std::numbers::pi;
// FilmCraft's seeded A A B A B A drums, bass and chord pads, mono.
std::vector<float> music(int sr, double bpm, int bars) {
    const double beat = sr * 60.0 / bpm;
    const auto n = static_cast<int64_t>(std::llround(bars * 4 * beat));
    std::vector<float> x(static_cast<size_t>(n));
    uint32_t rng = 7U * 747796405U + 2891336453U;
    auto noise = [&] {
        rng = rng * 1664525U + 1013904223U;
        return static_cast<float>(rng >> 8) / (1U << 24) * 2 - 1;
    };
    constexpr int roots[6][4] = {{3, 0, 8, 10}, {3, 0, 8, 10}, {5, 10, 7, 0},
                                 {3, 0, 8, 10}, {5, 10, 7, 0}, {3, 0, 8, 10}};
    for (int bar = 0; bar < bars; ++bar) {
        const int root = roots[(bar / 4) % 6][bar % 4];
        const int third = root == 0 || root == 5 || root == 7 ? 3 : 4;
        const auto b0 = static_cast<int64_t>(std::llround(bar * 4 * beat));
        const auto b1 = static_cast<int64_t>(std::llround((bar + 1) * 4 * beat));
        for (auto i = b0; i < std::min(b1, n); ++i) {
            const double t = static_cast<double>(i - b0) / sr;
            double v = 0;
            for (int note : {root, root + third, root + 7}) {
                const double f = 220 * std::pow(2.0, note / 12.0);
                v += std::sin(tau * f * i / sr) + 0.3 * std::sin(tau * 2 * f * i / sr);
            }
            x[static_cast<size_t>(i)] += static_cast<float>(0.06 * (1 - std::exp(-t * 30)) * std::pow(0.9, t) * v);
        }
        for (int q = 0; q < 4; ++q) {
            const auto start = static_cast<int64_t>(std::llround((bar * 4 + q) * beat));
            const double bass = 110 * std::pow(2.0, root / 12.0) / (q % 2 == 0 ? 1 : std::pow(2.0, -7.0 / 12));
            for (int64_t k = 0; k < std::min(static_cast<int64_t>(beat * 0.9), n - start); ++k) {
                const double t = static_cast<double>(k) / sr;
                auto& s = x[static_cast<size_t>(start + k)];
                if (q % 2 == 0) {
                    s += static_cast<float>(0.8 * std::exp(-t * 9) * std::sin(tau * (50 + 90 * std::exp(-t * 25)) * t));
                } else if (t < 0.2) {
                    s += 0.35f * std::exp(-static_cast<float>(t) * 22) * noise();
                }
                s += static_cast<float>(0.15 * std::exp(-t * 3) * std::sin(tau * bass * t));
            }
            for (int h = 0; h < 2; ++h) {
                const auto hs = start + static_cast<int64_t>(h * beat / 2);
                for (int64_t k = 0; k < std::min<int64_t>(sr / 25, n - hs); ++k) {
                    x[static_cast<size_t>(hs + k)] += 0.08f * std::exp(-static_cast<float>(k) / sr * 120) * noise();
                }
            }
        }
    }
    return x;
}
SourceReader reader(const std::vector<float>& mono) {
    return [&](int64_t s, int64_t n, float* dst) {
        for (int64_t i = 0; i < n; ++i) {
            const float v =
                s + i >= 0 && s + i < static_cast<int64_t>(mono.size()) ? mono[static_cast<size_t>(s + i)] : 0;
            dst[i * 2] = v;
            dst[i * 2 + 1] = v;
        }
        return true;
    };
}
float maxStep(std::span<const float> stereo) {
    float result = 0;
    for (size_t i = 2; i < stereo.size(); i += 2) {
        result = std::max(result, std::abs(stereo[i] - stereo[i - 2]));
    }
    return result;
}
int64_t peakKb() {
    QFile f("/proc/self/status");
    if (!f.open(QIODevice::ReadOnly)) {
        return -1;
    }
    for (const auto& line : f.readAll().split('\n')) {
        if (line.startsWith("VmHWM:")) {
            return line.simplified().split(' ')[1].toLongLong();
        }
    }
    return -1;
}
bool writeMusic(const QString& path, const std::vector<float>& pattern, int64_t frames) {
    int64_t pos = 0;
    auto written = nt::assets::writeStereoWavStream(
        path,
        [&](std::span<float> dst) -> qint64 {
            const auto n = std::min<int64_t>(frames - pos, static_cast<int64_t>(dst.size() / 2));
            for (int64_t i = 0; i < n; ++i) {
                const float v = pattern[static_cast<size_t>((pos + i) % static_cast<int64_t>(pattern.size()))] * 0.65f;
                dst[static_cast<size_t>(i * 2)] = v;
                dst[static_cast<size_t>(i * 2 + 1)] = v;
            }
            pos += n;
            return n;
        },
        [] { return false; });
    return written && *written == static_cast<uint64_t>(frames);
}
int64_t wavFrames(const QString& path) {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) {
        return -1;
    }
    const auto header = f.read(44);
    if (header.size() != 44 || header.first(4) != "RIFF" || header.mid(36, 4) != "data") {
        return -1;
    }
    return qFromLittleEndian<quint32>(header.constData() + 40) / 4;
}
} // namespace

class RemixTest : public QObject {
    Q_OBJECT
private slots:
    void streamingTenMinutes();
    void fileTenMinutes();
    void tempoAndBeats();
    void clicks();
    void similarity();
    void plansAndDeterminism();
    void errors();
    void streamingMatchesBuffered();
    void twoPassFeatures();
    void renderer();
    void fadeGains();
    void sineStretch();
    void fileWindow();
};

void RemixTest::tempoAndBeats() {
    for (auto [bpm, sr] :
         {std::pair{100., 22050}, {120., 22050}, {128., 22050}, {120., 48000}, {90., 44100}, {120., 24000}}) {
        const auto x = music(sr, bpm, 16);
        const auto r = analyze(x, sr);
        QVERIFY2(r.analysis.has_value(), describe(r.error));
        const auto& a = *r.analysis;
        QVERIFY(std::abs(a.bpm - bpm) < 1.0); // tempo tolerance: 1 BPM
        double worst = 0;
        for (auto b : a.beats) {
            const double attack = b + std::llround(0.010 * sr);
            const double nearest = std::round(attack / (sr * 60.0 / bpm)) * sr * 60.0 / bpm;
            worst = std::max(worst, std::abs(attack - nearest) * 1000 / sr);
        }
        qInfo("tempo %.3f Hz %d error %.4f BPM beat error %.3f ms beats %zu", a.bpm, sr, std::abs(a.bpm - bpm), worst,
              a.beats.size());
        QVERIFY(worst <= 10.0); // each attack within 10 ms, at most two missed beats
        QVERIFY(a.beats.size() >= 62);
    }
}
void RemixTest::clicks() {
    for (double bpm : {100., 140.}) {
        std::vector<float> x(24000 * 40);
        for (int beat = 0; beat * 60 / bpm < 40; ++beat) {
            x[static_cast<size_t>(std::llround(beat * 24000 * 60 / bpm))] = 1;
        }
        auto r = analyze(x, 24000);
        QVERIFY2(r.analysis.has_value(), describe(r.error));
        QVERIFY(std::abs(r.analysis->bpm - bpm) < 1);
        double worst = 0;
        for (auto b : r.analysis->beats) {
            const double beat = (b + 240) * bpm / (24000.0 * 60);
            worst = std::max(worst, std::abs(beat - std::round(beat)) * 60000 / bpm);
        }
        qInfo("click %.0f detected %.4f worst %.3f ms", bpm, r.analysis->bpm, worst);
        QVERIFY(worst <= 10);
    }
}
void RemixTest::similarity() {
    auto r = analyze(music(24000, 120, 24), 24000);
    QVERIFY(r.analysis);
    const auto& a = *r.analysis;
    auto first = [&](int bar) {
        return static_cast<size_t>(
            std::lower_bound(a.beats.begin(), a.beats.end(), static_cast<int64_t>(bar * 4 * a.period - a.period / 4)) -
            a.beats.begin());
    };
    QVERIFY(a.jumpScore(first(1), first(5)) > a.jumpScore(first(1), first(9)));
}
void RemixTest::plansAndDeterminism() {
    auto x = music(24000, 120, 24);
    auto r = analyze(x, 24000), r2 = analyze(x, 24000);
    QVERIFY(r.analysis && r2.analysis);
    QCOMPARE(*r.analysis, *r2.analysis);
    const auto& a = *r.analysis;
    for (double secs : {20., 30., 40., 47., 60., 75., 100.}) {
        for (double seg : {0., 50., 100.}) {
            for (double var : {0., 50., 100.}) {
                const auto target = static_cast<int64_t>(secs * 24000);
                auto p = plan(a, target, {seg, var});
                QVERIFY2(p.plan.has_value(),
                         qPrintable(QString("%1/%2/%3: %4").arg(secs).arg(seg).arg(var).arg(describe(p.error))));
                QCOMPARE(*p.plan, *plan(a, target, {seg, var}).plan);
                QVERIFY(std::abs(p.plan->length() - target) <= a.period);
                QCOMPARE(p.plan->pieces.front().src, 0);
                QCOMPARE(p.plan->pieces.back().src + p.plan->pieces.back().len, a.len);
                for (const auto& pc : p.plan->pieces) {
                    QVERIFY(pc.len >= static_cast<int64_t>(4 * a.period) - 2);
                }
                for (auto [out, in] : p.plan->cuts()) {
                    QVERIFY(std::binary_search(a.beats.begin(), a.beats.end(), out));
                    QVERIFY(std::binary_search(a.beats.begin(), a.beats.end(), in));
                }
            }
        }
    }
    QVERIFY(plan(a, 720000, {0, 50}).plan->pieces.size() < plan(a, 720000, {100, 50}).plan->pieces.size());
    QCOMPARE(*plan(a, a.len, {}).plan, Plan::identity(a.len, 480));
    QCOMPARE(*plan(a, a.len + static_cast<int64_t>(a.period / 2), {}).plan, Plan::identity(a.len, 480));
    QCOMPARE(plan(a, 24000, {}).error, Error::TargetTooShort);
    const auto infinity = std::numeric_limits<double>::infinity();
    for (auto [value, bounded] :
         {std::pair{infinity, 100.}, {-infinity, 0.}, {std::numeric_limits<double>::quiet_NaN(), 0.}}) {
        const auto actual = plan(a, 720000, {value, value});
        const auto expected = plan(a, 720000, {bounded, bounded});
        QVERIFY(actual.plan && expected.plan);
        QCOMPARE(*actual.plan, *expected.plan);
    }
    const auto p = *plan(a, 720000, {}).plan;
    const auto scaled = p.scaled(2);
    QCOMPARE(scaled.length(), p.length() * 2);
    QCOMPARE(scaled.xfade, p.xfade * 2);
}
void RemixTest::errors() {
    std::vector<float> x(24000 * 20);
    QCOMPARE(analyze(x, 24000).error, Error::NoBeat);
    for (size_t i = 0; i < x.size(); ++i) {
        x[i] = 0.3f * std::sin(static_cast<float>(i) * 0.05f);
    }
    QCOMPARE(analyze(x, 24000).error, Error::NoBeat);
    uint32_t rng = 12345;
    for (auto& v : x) {
        rng = rng * 1664525U + 1013904223U;
        v = static_cast<float>(rng >> 8) / (1U << 24) - 0.5f;
    }
    QCOMPARE(analyze(x, 24000).error, Error::NoBeat);
    QCOMPARE(analyze(x, 0).error, Error::InvalidSampleRate);
    QCOMPARE(analyze(x, 384001).error, Error::InvalidSampleRate);
    QCOMPARE(analyze(MonoReader{}, 24000, 24000 * 601LL).error, Error::TooLong);
    std::vector<float> tooLong(601);
    QCOMPARE(analyze(tooLong, 1).error, Error::TooLong);
    Analysis a;
    a.sampleRate = 24000;
    a.len = 1000000;
    a.period = 100;
    a.beats.resize(2001);
    QCOMPARE(plan(a, 500000, {}).error, Error::TooComplex);
    // A seeded burst train makes the fundamental stronger than its octave.
    // Its ~201 BPM grid exceeds 2,000 beats in ten minutes. Uniform clicks
    // instead favour half tempo under the Rust 120 BPM prior.
    int64_t densePos = 0, nextClick = 0;
    uint32_t denseRng = 7;
    bool active = true;
    const auto dense = analyze(
        [&](std::span<float> dst) -> int64_t {
            const auto n = std::min<int64_t>(24000 * 600LL - densePos, static_cast<int64_t>(dst.size()));
            for (int64_t i = 0; i < n; ++i) {
                dst[static_cast<size_t>(i)] = densePos + i == nextClick && active ? 1.f : 0.f;
                if (densePos + i == nextClick) {
                    denseRng = denseRng * 1664525U + 1013904223U;
                    active = (denseRng >> 24) < static_cast<unsigned>(active ? 128 : 16);
                    nextClick += 7164;
                }
            }
            densePos += n;
            return n;
        },
        24000, 24000 * 600LL);
    QCOMPARE(dense.error, Error::TooComplex);
    QCOMPARE(analyze([](std::span<float>) -> int64_t { return -1; }, 24000).error, Error::ReadFailed);
    QCOMPARE(analyze(music(24000, 120, 2), 24000).error, Error::TooShort);
    bool interrupted = false;
    QCOMPARE(analyze(
                 [&](std::span<float>) -> int64_t {
                     interrupted = true;
                     return 0;
                 },
                 24000, 0, {}, [&] { return interrupted; })
                 .error,
             Error::Cancelled);
    int calls = 0;
    QCOMPARE(analyze(
                 [&](std::span<float> dst) -> int64_t {
                     ++calls;
                     std::fill(dst.begin(), dst.end(), 0);
                     return static_cast<int64_t>(dst.size());
                 },
                 24000, 0, {}, [&] { return calls > 10; })
                 .error,
             Error::Cancelled);
}
void RemixTest::streamingMatchesBuffered() {
    auto x = music(24000, 128, 8);
    const auto want = analyze(x, 24000);
    QVERIFY(want.analysis);
    size_t pos = 0, step = 1;
    double previous = 0;
    const auto got = analyze(
        [&](std::span<float> dst) -> int64_t {
            const auto n = std::min({dst.size(), x.size() - pos, step});
            std::copy_n(x.data() + pos, n, dst.data());
            pos += n;
            step = step * 7 % 4093 + 1;
            return static_cast<int64_t>(n);
        },
        24000, static_cast<int64_t>(x.size()),
        [&](double p) {
            QVERIFY(p >= previous && p <= 1);
            previous = p;
        });
    QVERIFY(got.analysis);
    QCOMPARE(*got.analysis, *want.analysis);
    QCOMPARE(previous, 1.0);
    pos = 0;
    bool reported = false;
    const auto unknownLength = analyze(
        [&](std::span<float> dst) -> int64_t {
            const auto n = std::min(dst.size(), x.size() - pos);
            std::copy_n(x.data() + pos, n, dst.data());
            pos += n;
            return static_cast<int64_t>(n);
        },
        24000, 0, [&](double) { reported = true; });
    QVERIFY(unknownLength.analysis);
    QCOMPARE(*unknownLength.analysis, *want.analysis);
    QVERIFY(!reported);
    // The feature STFT has one zero-padded frame for short input.
    for (int n : {0, 1, 255, 1023, 1024, 2047, 2048, 2049}) {
        QCOMPARE(analyze(std::span(x).first(n), 24000).error, Error::NoBeat);
    }
}
// Independent offline second STFT: dense mel filters and a strided complex
// FFT. This checks that the streaming pass assigns the same frame features as
// FilmCraft's two-pass definition, including its window centres and end rule.
void RemixTest::twoPassFeatures() {
    using Vec = std::array<float, 12>;
    for (int sr : {8000, 24000, 48000}) {
        const auto x = music(sr, 120, 8);
        const auto result = analyze(x, sr);
        QVERIFY(result.analysis);
        const auto& a = *result.analysis;
        const size_t onset = size_t{1} << static_cast<unsigned>(std::round(std::log2(std::max(256., sr * .046))));
        const size_t n = std::max<size_t>(1024, onset * 2), hop = n / 2, m = a.beats.size();
        const size_t frames = x.size() >= n ? (x.size() - n) / hop + 1 : 1;
        std::vector<Vec> chroma(m), cep(m);
        std::vector<float> counts(m);
        for (size_t t = 0; t < frames; ++t) {
            std::vector<std::complex<float>> z(n);
            for (size_t i = 0; i < n; ++i) {
                const float w = .5f - .5f * static_cast<float>(std::cos(tau * i / n));
                z[i] = {(t * hop + i < x.size() ? x[t * hop + i] : 0) * w, 0};
            }
            // In-place bit reversal, independent of the DSP's planned FFT.
            for (size_t i = 1, j = 0; i < n; ++i) {
                size_t bit = n / 2;
                for (; j & bit; bit /= 2) {
                    j ^= bit;
                }
                j ^= bit;
                if (i < j) {
                    std::swap(z[i], z[j]);
                }
            }
            for (size_t width = 2; width <= n; width *= 2) {
                for (size_t start = 0; start < n; start += width) {
                    for (size_t k = 0; k < width / 2; ++k) {
                        const double angle = -tau * k / width;
                        const std::complex<float> w(static_cast<float>(std::cos(angle)),
                                                    static_cast<float>(std::sin(angle)));
                        const auto u = z[start + k], v = z[start + k + width / 2] * w;
                        z[start + k] = u + v;
                        z[start + k + width / 2] = u - v;
                    }
                }
            }
            Vec c{}, q{};
            std::vector<float> mag(n / 2 + 1);
            for (size_t k = 0; k < mag.size(); ++k) {
                mag[k] = std::sqrt(z[k].real() * z[k].real() + z[k].imag() * z[k].imag());
                const double hz = static_cast<double>(k) * sr / n;
                if (hz >= 55 && hz <= 5000) {
                    const int pc = static_cast<int>(std::round(12 * std::log2(hz / 440))) + 9;
                    c[static_cast<size_t>((pc % 12 + 12) % 12)] += mag[k] * mag[k];
                }
            }
            const double low = 2595 * std::log10(1 + 30. / 700),
                         high = 2595 * std::log10(1 + std::min(8000., sr / 2.) / 700);
            std::array<double, 28> edges{};
            for (size_t b = 0; b < 28; ++b) {
                edges[b] = 700 * (std::pow(10., (low + (high - low) * b / 27) / 2595) - 1);
            }
            std::array<double, 26> lb{};
            for (size_t b = 0; b < 26; ++b) {
                double energy = 0;
                for (size_t k = 0; k < mag.size(); ++k) {
                    const double hz = static_cast<double>(k) * sr / n;
                    const double w = hz > edges[b] && hz < edges[b + 1] ? (hz - edges[b]) / (edges[b + 1] - edges[b])
                                     : hz >= edges[b + 1] && hz < edges[b + 2]
                                         ? (edges[b + 2] - hz) / (edges[b + 2] - edges[b + 1])
                                         : 0;
                    energy += w * static_cast<double>(mag[k]) * mag[k];
                }
                lb[b] = std::log(energy + 1e-10);
            }
            for (size_t k = 0; k < 12; ++k) {
                double v = 0;
                for (size_t b = 0; b < 26; ++b) {
                    v += lb[b] * std::cos(std::numbers::pi * (k + 1) * (b + .5) / 26);
                }
                q[k] = static_cast<float>(v);
            }
            const auto centre = static_cast<int64_t>(t * hop + n / 2);
            // Deliberately scan intervals rather than reusing the streaming
            // implementation's advancing frame-to-beat cursor.
            for (size_t i = 0; i < m; ++i) {
                if (centre >= a.beats[i] && centre < (i + 1 < m ? a.beats[i + 1] : a.len)) {
                    for (size_t k = 0; k < 12; ++k) {
                        chroma[i][k] += c[k];
                        cep[i][k] += q[k];
                    }
                    counts[i] += 1;
                }
            }
        }
        auto norm = [](const Vec& v) {
            float n = 0;
            for (float x : v) {
                n += x * x;
            }
            return std::sqrt(n);
        };
        for (size_t i = 0; i < m; ++i) {
            const float n = norm(chroma[i]);
            if (n > 0) {
                for (auto& v : chroma[i]) {
                    v /= n;
                }
            }
            if (counts[i] > 0) {
                for (auto& v : cep[i]) {
                    v /= counts[i];
                }
            }
        }
        for (size_t k = 0; k < 12; ++k) {
            float mean = 0;
            for (auto c : cep) {
                mean += c[k];
            }
            mean /= m;
            float var = 0;
            for (auto c : cep) {
                var += (c[k] - mean) * (c[k] - mean);
            }
            const float sd = std::max(std::sqrt(var / m), 1e-6f);
            for (auto& c : cep) {
                c[k] = (c[k] - mean) / sd;
            }
        }
        auto cosine = [&](const Vec& x, const Vec& y) {
            float dot = 0;
            for (size_t k = 0; k < 12; ++k) {
                dot += x[k] * y[k];
            }
            const float nx = norm(x), ny = norm(y);
            return nx > 0 && ny > 0 ? dot / (nx * ny) : 0;
        };
        for (size_t i = 0; i < m; ++i) {
            for (size_t j = 0; j < m; ++j) {
                const float expected = .6f * cosine(chroma[i], chroma[j]) + .4f * (1 + cosine(cep[i], cep[j])) * .5f;
                QVERIFY(std::abs(a.sim[i * m + j] - expected) < 2e-6f);
            }
        }
    }
}

void RemixTest::renderer() {
    const auto x = music(48000, 120, 24);
    auto a = analyze(music(24000, 120, 24), 24000);
    QVERIFY(a.analysis);
    const auto p = plan(*a.analysis, 30 * 24000, {}).plan->scaled(2);
    std::vector<float> source(x.size() * 2);
    QVERIFY(reader(x)(0, static_cast<int64_t>(x.size()), source.data()));
    const auto sourceStep = maxStep(source);
    for (auto target :
         std::array<int64_t, 8>{p.length(), p.length() - 1, p.length() + 1, 1440000, 1396800, 1483200, 1, 17}) {
        int64_t largestRequest = 0;
        const auto sourceRead = reader(x);
        PlanRenderer render(p, target, [&](int64_t start, int64_t n, float* dst) {
            largestRequest = std::max(largestRequest, n);
            return sourceRead(start, n, dst);
        });
        QCOMPARE(render.frames(), target);
        std::vector<float> whole(static_cast<size_t>(target * 2)), blocks(whole.size());
        QVERIFY(render.read(0, target, whole.data()));
        int64_t pos = 0, step = 1;
        while (pos < target) {
            auto n = std::min(step, target - pos);
            QVERIFY(render.read(pos, n, blocks.data() + pos * 2));
            pos += n;
            step = step * 7 % 4093 + 1;
        }
        QVERIFY(whole == blocks);
        QVERIFY(largestRequest <= 4112); // even a one-frame target keeps staging bounded
        if (target > 1000) {
            std::array<float, 34> revisit{};
            QVERIFY(render.read(123, 17, revisit.data()));
            QVERIFY(std::equal(revisit.begin(), revisit.end(), whole.begin() + 246));
        }
        if (target == p.length()) {
            QCOMPARE(render.stretch(), 1.0);
            int64_t d = 0;
            for (auto pc : p.pieces) {
                for (int64_t k = p.xfade; k < pc.len - p.xfade; k += 97) {
                    QCOMPARE(whole[static_cast<size_t>((d + k) * 2)], x[static_cast<size_t>(pc.src + k)]);
                }
                d += pc.len;
            }
        }
        if (target > 100000) {
            for (auto j : p.joints()) {
                const auto out = static_cast<int64_t>(j / render.stretch());
                const auto from = std::max<int64_t>(0, out - p.xfade), to = std::min(target, out + p.xfade);
                const auto stepAtJoint = maxStep(
                    std::span(whole).subspan(static_cast<size_t>(from * 2), static_cast<size_t>((to - from) * 2)));
                QVERIFY2(stepAtJoint <= sourceStep * 1.1f,
                         qPrintable(QString("joint step %1 source %2").arg(stepAtJoint).arg(sourceStep)));
            }
        }
    }
    for (int64_t target : {9, 11}) {
        PlanRenderer fit(Plan::identity(10, 0), target, [](int64_t start, int64_t n, float* dst) {
            for (int64_t i = 0; i < n; ++i) {
                dst[i * 2] = dst[i * 2 + 1] = static_cast<float>(start + i + 1);
            }
            return true;
        });
        std::vector<float> out(static_cast<size_t>(target * 2));
        QVERIFY(fit.read(0, target, out.data()));
        for (int64_t i = 0; i < target; ++i) {
            QCOMPARE(out[static_cast<size_t>(i * 2)], i < 10 ? static_cast<float>(i + 1) : 0.f);
        }
    }
    PlanRenderer failure(p, p.length(), [](int64_t, int64_t, float*) { return false; });
    float dst[2]{};
    QVERIFY(!failure.read(0, 1, dst));
}
void RemixTest::fadeGains() {
    Plan p{{{0, 100}, {1000, 100}}, 20};
    PlanRenderer render(p, 200, [](int64_t s, int64_t n, float* dst) {
        for (int64_t i = 0; i < n; ++i) {
            dst[2 * i] = s + i < 500 ? 1.f : 0.f;
            dst[2 * i + 1] = s + i >= 500 ? 1.f : 0.f;
        }
        return true;
    });
    std::vector<float> out(40);
    QVERIFY(render.read(90, 20, out.data()));
    for (int i = 0; i < 20; ++i) {
        const double angle = (i + 0.5) / 20 * std::numbers::pi / 2;
        QVERIFY(std::abs(out[2 * i] - std::cos(angle)) < 1e-6);
        QVERIFY(std::abs(out[2 * i + 1] - std::sin(angle)) < 1e-6);
        QVERIFY(std::abs(out[2 * i] * out[2 * i] + out[2 * i + 1] * out[2 * i + 1] - 1) < 1e-6);
    }
}
void RemixTest::sineStretch() {
    for (double ratio : {0.97, 1.03}) {
        const int64_t target = 48000 * 3;
        PlanRenderer render(Plan::identity(static_cast<int64_t>(std::llround(target * ratio)), 960), target,
                            [](int64_t s, int64_t n, float* dst) {
                                for (int64_t i = 0; i < n; ++i) {
                                    dst[2 * i] = dst[2 * i + 1] =
                                        static_cast<float>(0.5 * std::sin(tau * 1000 * (s + i) / 48000));
                                }
                                return true;
                            });
        std::vector<float> out(static_cast<size_t>(target * 2));
        QVERIFY(render.read(0, target, out.data()));
        double energy = 0;
        std::vector<double> crossings;
        for (int64_t i = 100; i < target - 100; ++i) {
            energy += out[static_cast<size_t>(i * 2)] * out[static_cast<size_t>(i * 2)];
            const auto a = out[static_cast<size_t>((i - 1) * 2)], b = out[static_cast<size_t>(i * 2)];
            if (a <= 0 && b > 0) {
                crossings.push_back(i - 1 - static_cast<double>(a) / (b - a));
            }
        }
        const double amplitude = std::sqrt(2 * energy / (target - 200));
        const double freq = (crossings.size() - 1) * 48000 / (crossings.back() - crossings.front());
        QVERIFY(std::abs(20 * std::log10(amplitude / 0.5)) < 1); // 1 dB amplitude tolerance
        QVERIFY(std::abs(freq - 1000 * render.stretch()) < 0.2); // 0.2 Hz frequency tolerance
    }
}
void RemixTest::streamingTenMinutes() {
#ifndef Q_OS_LINUX
    QSKIP("VmHWM requires Linux");
#else
    const auto pattern = music(24000, 120, 4);
    const auto before = peakKb();
    QVERIFY(before > 0);
    int64_t pos = 0;
    double previous = 0;
    QElapsedTimer time;
    time.start();
    const auto cpuStart = std::clock();
    const auto r = analyze(
        [&](std::span<float> dst) -> int64_t {
            const auto n = std::min<int64_t>(24000 * 600LL - pos, static_cast<int64_t>(dst.size()));
            for (int64_t i = 0; i < n; ++i) {
                dst[static_cast<size_t>(i)] =
                    pattern[static_cast<size_t>((pos + i) % static_cast<int64_t>(pattern.size()))];
            }
            pos += n;
            return n;
        },
        24000, 24000 * 600LL,
        [&](double p) {
            QVERIFY(p >= previous && p <= 1);
            previous = p;
        });
    const auto elapsed = time.elapsed();
    const auto after = peakKb();
    QVERIFY2(r.analysis.has_value(), describe(r.error));
    QCOMPARE(previous, 1.0);
    qInfo("10-minute analysis: %lld ms CPU %.3f s peak %lld KiB growth %lld KiB beats %zu",
          static_cast<long long>(elapsed), static_cast<double>(std::clock() - cpuStart) / CLOCKS_PER_SEC,
          static_cast<long long>(after), static_cast<long long>(after - before), r.analysis->beats.size());
    QVERIFY(after - before < 200 * 1024);
#endif
}
void RemixTest::fileWindow() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const auto path = dir.filePath("music.wav"), baked = dir.filePath("remix.wav"), again = dir.filePath("again.wav");
    const auto pattern = music(48000, 120, 24);
    QVERIFY(writeMusic(path, pattern, 48000 * 40));
    FileWindow window{path.toStdString(), 2000, 32000};
    double previous = 0;
    auto a = analyzeFile(window, [&](double p) {
        QVERIFY(p >= previous);
        previous = p;
    });
    QVERIFY2(a.analysis.has_value(), describe(a.error));
    QCOMPARE(a.analysis->len, 24000 * 32);
    QCOMPARE(previous, 1.0);
    auto p = plan(*a.analysis, 24000 * 20, {});
    QVERIFY(p.plan);
    constexpr int64_t target = 48000 * 20 + 137;
    previous = 0;
    QCOMPARE(bakeWav(window, *p.plan, target, baked,
                     [&](double v) {
                         QVERIFY(v >= previous);
                         previous = v;
                     }),
             Error::None);
    QCOMPARE(previous, 1.0);
    QCOMPARE(wavFrames(baked), target);
    std::string error;
    auto audio = nt::audio::AudioSource::open(baked.toStdString(), 48000, &error);
    QVERIFY(audio);
    const auto out = audio->readAll();
    QCOMPARE(out.size(), static_cast<size_t>(target * 2));
    float sourceStep = 0;
    for (size_t i = 1; i < pattern.size(); ++i) {
        sourceStep = std::max(sourceStep, std::abs(pattern[i] - pattern[i - 1]) * 0.65f);
    }
    const double stretch = p.plan->length() * 2.0 / target;
    for (auto joint : p.plan->joints()) {
        const auto j = static_cast<int64_t>(joint * 2 / stretch);
        QVERIFY(maxStep(std::span(out).subspan(static_cast<size_t>((j - 960) * 2), 3840)) <= sourceStep * 1.1f);
    }
    // Read the same offset directly: window-relative source positions must be preserved.
    const auto identity = Plan::identity(24000 * 4, 480);
    const auto identityPath = dir.filePath("identity.wav");
    QCOMPARE(bakeWav(window, identity, 48000 * 4, identityPath), Error::None);
    auto original = nt::audio::AudioSource::open(path.toStdString(), 48000, &error);
    QVERIFY(original && original->seek(96000));
    auto clip = nt::audio::AudioSource::open(identityPath.toStdString(), 48000, &error);
    QVERIFY(clip);
    std::vector<float> expected(4000), actual(4000);
    QCOMPARE(original->read(expected.data(), 2000), 2000);
    QCOMPARE(clip->read(actual.data(), 2000), 2000);
    for (size_t i = 0; i < expected.size(); ++i) {
        // A second 16-bit encoding can round by one PCM unit.
        QVERIFY(std::abs(expected[i] - actual[i]) <= 1.f / 32768 + 1e-7f);
    }
    QCOMPARE(bakeWav(window, *p.plan, target, again), Error::None);
    QFile f(baked), g(again);
    QVERIFY(f.open(QIODevice::ReadOnly) && g.open(QIODevice::ReadOnly));
    QCOMPARE(f.readAll(), g.readAll());
    const auto sentinel = dir.filePath("sentinel.wav");
    QFile keep(sentinel);
    QVERIFY(keep.open(QIODevice::WriteOnly));
    keep.write("untouched");
    keep.close();
    int polls = 0;
    QCOMPARE(bakeWav(window, *p.plan, target, sentinel, {}, [&] { return ++polls > 15; }), Error::Cancelled);
    QVERIFY(keep.open(QIODevice::ReadOnly));
    QCOMPARE(keep.readAll(), QByteArray("untouched"));
    QCOMPARE(analyzeFile({dir.filePath("missing.wav").toStdString(), 0, 1000}).error, Error::ReadFailed);
}
void RemixTest::fileTenMinutes() {
#ifndef Q_OS_LINUX
    QSKIP("VmHWM requires Linux");
#else
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const auto pattern = music(48000, 120, 4);
    const auto before = peakKb();
    QElapsedTimer time;
    time.start();
    const auto cpuStart = std::clock();
    const auto path = dir.filePath("long.wav"), out = dir.filePath("half.wav");
    QVERIFY(writeMusic(path, pattern, 48000 * 600LL));
    const FileWindow window{path.toStdString(), 0, 600000};
    const auto a = analyzeFile(window);
    QVERIFY2(a.analysis.has_value(), describe(a.error));
    const auto p = plan(*a.analysis, 24000 * 300LL, {});
    QVERIFY2(p.plan.has_value(), describe(p.error));
    constexpr int64_t target = 48000 * 300LL;
    QElapsedTimer bakeTime;
    bakeTime.start();
    const auto bakeCpu = std::clock();
    QCOMPARE(bakeWav(window, *p.plan, target, out), Error::None);
    qInfo("5-minute bake: %lld ms CPU %.3f s", static_cast<long long>(bakeTime.elapsed()),
          static_cast<double>(std::clock() - bakeCpu) / CLOCKS_PER_SEC);
    QCOMPARE(wavFrames(out), target);
    std::string error;
    auto audio = nt::audio::AudioSource::open(out.toStdString(), 48000, &error);
    QVERIFY(audio);
    std::vector<float> block(8192);
    int64_t count = 0, n = 0;
    while ((n = audio->read(block.data(), 4096)) > 0) {
        count += n;
    }
    QCOMPARE(count, target);
    const auto after = peakKb();
    qInfo("10-minute file: %lld ms CPU %.3f s peak %lld KiB growth %lld KiB", static_cast<long long>(time.elapsed()),
          static_cast<double>(std::clock() - cpuStart) / CLOCKS_PER_SEC, static_cast<long long>(after),
          static_cast<long long>(after - before));
#ifndef NT_SANITIZED
    // ASan's quarantine and redzones add to the peak, so only the plain build holds this bound.
    QVERIFY(after - before < 250 * 1024);
#endif
#endif
}
QTEST_GUILESS_MAIN(RemixTest)
#include "tst_remix.moc"
