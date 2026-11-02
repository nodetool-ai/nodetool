// Ported from FilmCraft (https://github.com/storytold/filmcraft, crates/audio-dsp/src/remix.rs and fft.rs), MIT OR Apache-2.0, see native/timeline/licenses/FilmCraft-MIT.txt
#include "remix/RemixDsp.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>
#include <numeric>

namespace nt::remix {
namespace {
constexpr double pi = std::numbers::pi;
constexpr size_t maxSimilarityCells = 4000000;
constexpr int maxSampleRate = 384000;
using Feature = std::array<float, 12>;

class Fft {
public:
    explicit Fft(size_t n) : m_n(n), m_rev(n) {
        for (size_t i = 0; i < n; ++i) {
            size_t x = i, r = 0;
            for (size_t bit = 1; bit < n; bit <<= 1) {
                r = (r << 1) | (x & 1);
                x >>= 1;
            }
            m_rev[i] = r;
        }
        for (size_t half = 1; half < n; half <<= 1) {
            const auto stride = n / (2 * half);
            for (size_t k = 0; k < half; ++k) {
                const double a = -2 * pi * (k * stride) / n;
                m_wr.push_back(static_cast<float>(std::cos(a)));
                m_wi.push_back(static_cast<float>(std::sin(a)));
            }
        }
    }
    void forward(std::vector<float>& re, std::vector<float>& im) const {
        for (size_t i = 0; i < m_n; ++i) {
            if (m_rev[i] > i) {
                std::swap(re[i], re[m_rev[i]]);
                std::swap(im[i], im[m_rev[i]]);
            }
        }
        for (size_t half = 1; half < m_n; half <<= 1) {
            for (size_t start = 0; start < m_n; start += 2 * half) {
                for (size_t k = 0; k < half; ++k) {
                    const auto a = start + k, b = a + half, w = half - 1 + k;
                    const float xr = re[b] * m_wr[w] - im[b] * m_wi[w];
                    const float xi = re[b] * m_wi[w] + im[b] * m_wr[w];
                    re[b] = re[a] - xr;
                    im[b] = im[a] - xi;
                    re[a] += xr;
                    im[a] += xi;
                }
            }
        }
    }

private:
    size_t m_n;
    std::vector<size_t> m_rev;
    std::vector<float> m_wr, m_wi;
};

size_t onsetFrame(int sr) {
    return size_t{1} << static_cast<unsigned>(std::round(std::log2(std::max(sr * 0.046, 256.0))));
}
struct Spectrum {
    size_t n;
    Fft fft;
    std::vector<float> window, re, im, mag;
    explicit Spectrum(size_t size) : n(size), fft(size), window(size), re(size), im(size), mag(size / 2 + 1) {
        for (size_t i = 0; i < n; ++i) {
            window[i] = 0.5f - 0.5f * static_cast<float>(std::cos(2 * pi * i / n));
        }
    }
    void compute(const std::vector<float>& ring, int64_t start, int64_t available) {
        for (size_t i = 0; i < n; ++i) {
            const auto pos = start + static_cast<int64_t>(i);
            re[i] = (pos < available ? ring[static_cast<size_t>(pos) % ring.size()] : 0.f) * window[i];
            im[i] = 0;
        }
        fft.forward(re, im);
        for (size_t k = 0; k < mag.size(); ++k) {
            mag[k] = std::sqrt(re[k] * re[k] + im[k] * im[k]);
        }
    }
};
struct FrameFeatures {
    std::vector<int> chromaMap;
    std::array<std::vector<std::pair<size_t, double>>, 26> mel;
    std::array<std::array<double, 26>, 12> dct{};
    FrameFeatures(int sr, size_t n) : chromaMap(n / 2 + 1, -1) {
        auto hzToMel = [](double f) { return 2595 * std::log10(1 + f / 700); };
        const double m0 = hzToMel(30), m1 = hzToMel(std::min(sr / 2.0, 8000.0));
        std::array<double, 28> edges{};
        for (size_t i = 0; i < 28; ++i) {
            edges[i] = 700 * (std::pow(10.0, (m0 + (m1 - m0) * i / 27) / 2595) - 1);
        }
        for (size_t k = 0; k < chromaMap.size(); ++k) {
            const double f = static_cast<double>(k) * sr / n;
            if (f >= 55 && f <= 5000) {
                const auto pc = static_cast<int64_t>(std::round(12 * std::log2(f / 440))) + 9;
                chromaMap[k] = static_cast<int>((pc % 12 + 12) % 12);
            }
            for (size_t b = 0; b < 26; ++b) {
                const double l = edges[b], c = edges[b + 1], r = edges[b + 2];
                if (f > l && f < c) {
                    mel[b].emplace_back(k, (f - l) / (c - l));
                } else if (f >= c && f < r) {
                    mel[b].emplace_back(k, (r - f) / (r - c));
                }
            }
        }
        for (size_t q = 0; q < 12; ++q) {
            for (size_t b = 0; b < 26; ++b) {
                dct[q][b] = std::cos(pi * (q + 1) * (b + 0.5) / 26);
            }
        }
    }
    std::pair<Feature, Feature> compute(std::span<const float> mag) const {
        Feature c{}, cep{};
        for (size_t k = 0; k < mag.size(); ++k) {
            if (chromaMap[k] >= 0) {
                c[static_cast<size_t>(chromaMap[k])] += mag[k] * mag[k];
            }
        }
        std::array<double, 26> lb{};
        for (size_t b = 0; b < 26; ++b) {
            double e = 0;
            for (auto [k, w] : mel[b]) {
                const double v = mag[k];
                e += w * v * v;
            }
            lb[b] = std::log(e + 1e-10);
        }
        for (size_t q = 0; q < 12; ++q) {
            double sum = 0;
            for (size_t b = 0; b < 26; ++b) {
                sum += lb[b] * dct[q][b];
            }
            cep[q] = static_cast<float>(sum);
        }
        return {c, cep};
    }
};
std::optional<double> tempo(const std::vector<float>& env, double frameRate) {
    const float mean = std::accumulate(env.begin(), env.end(), 0.f) / std::max<size_t>(1, env.size());
    std::vector<float> e(env.size());
    std::transform(env.begin(), env.end(), e.begin(), [&](float v) { return v - mean; });
    const auto lo = static_cast<size_t>(std::max(std::floor(frameRate * 60 / 200), 2.0));
    const auto hi = std::min(static_cast<size_t>(std::ceil(frameRate * 60 / 50)), e.size() / 2);
    if (hi <= lo + 2) {
        return {};
    }
    auto ac = [&](size_t lag) {
        double s = 0;
        for (size_t i = 0; i < e.size() - lag; ++i) {
            s += static_cast<double>(e[i]) * e[i + lag];
        }
        return s / (e.size() - lag);
    };
    std::vector<double> raw;
    for (size_t lag = lo - 1; lag <= hi + 1; ++lag) {
        raw.push_back(ac(lag));
    }
    double best = std::numeric_limits<double>::lowest();
    size_t bk = 0;
    for (size_t k = 1; k + 1 < raw.size(); ++k) {
        const double bpm = 60 * frameRate / (lo - 1 + k);
        const double prior = std::log2(bpm / 120);
        const double w = raw[k] * std::exp(-0.5 * prior * prior);
        if (w > best) {
            best = w;
            bk = k;
        }
    }
    if (best <= 0 || raw[bk] <= 0.1 * ac(0)) {
        return {};
    }
    const double a = raw[bk - 1], b = raw[bk], c = raw[bk + 1], den = a - 2 * b + c;
    const double d = den < 0 ? std::clamp(0.5 * (a - c) / den, -0.5, 0.5) : 0;
    return lo - 1 + bk + d;
}
std::vector<size_t> trackBeats(const std::vector<float>& env, double period) {
    const auto n = env.size(), none = std::numeric_limits<size_t>::max();
    std::vector<double> score(n);
    std::vector<size_t> back(n, none);
    const auto lo = static_cast<size_t>(std::max(std::round(period * 0.5), 1.0)),
               hi = static_cast<size_t>(std::round(period * 2));
    std::vector<double> penalty(hi + 1);
    for (size_t d = lo; d <= hi; ++d) {
        const double r = std::log(d / period);
        penalty[d] = 100 * r * r;
    }
    for (size_t t = 0; t < n; ++t) {
        double best = 0;
        size_t arg = none;
        if (t >= lo) {
            for (size_t prev = t > hi ? t - hi : 0; prev <= t - lo; ++prev) {
                const double v = score[prev] - penalty[t - prev];
                if (arg == none || v > best) {
                    best = v;
                    arg = prev;
                }
            }
        }
        score[t] = env[t] + (arg == none ? 0 : std::max(best, 0.0));
        if (arg != none && best > 0) {
            back[t] = arg;
        }
    }
    const auto tail = static_cast<size_t>(std::ceil(period)) + 1;
    size_t t = n > tail ? n - tail : 0;
    for (size_t i = t + 1; i < n; ++i) {
        if (score[i] > score[t]) {
            t = i;
        }
    }
    std::vector<size_t> beats{t};
    while (back[t] != none) {
        t = back[t];
        beats.push_back(t);
    }
    std::reverse(beats.begin(), beats.end());
    return beats;
}
float localMax(const std::vector<float>& env, size_t t) {
    return *std::max_element(env.begin() + static_cast<ptrdiff_t>(t > 2 ? t - 2 : 0),
                             env.begin() + static_cast<ptrdiff_t>(std::min(t + 3, env.size())));
}
float norm(const Feature& a) {
    float sum = 0;
    for (float v : a) {
        sum += v * v;
    }
    return std::sqrt(sum);
}
float cosine(const Feature& a, float na, const Feature& b, float nb) {
    float sum = 0;
    for (size_t k = 0; k < 12; ++k) {
        sum += a[k] * b[k];
    }
    return na > 0 && nb > 0 ? sum / (na * nb) : 0;
}
bool stopped(const std::function<bool()>& cancelled) { return cancelled && cancelled(); }
} // namespace

const char* describe(Error error) {
    switch (error) {
    case Error::None:
        return "";
    case Error::InvalidSampleRate:
        return "This audio sample rate is not supported.";
    case Error::TooLong:
        return "The music is too long to remix (the limit is 10 minutes).";
    case Error::TooComplex:
        return "The music has too many beats to remix.";
    case Error::NoBeat:
        return "No beat found in the audio.";
    case Error::TooShort:
        return "The music is too short to remix.";
    case Error::TargetTooShort:
        return "The target duration is too short for this music.";
    case Error::Cancelled:
        return "The remix was cancelled.";
    case Error::ReadFailed:
        return "The audio could not be read or saved.";
    }
    return "The music could not be remixed.";
}
int64_t Plan::length() const {
    int64_t n = 0;
    for (auto p : pieces) {
        n += p.len;
    }
    return n;
}
std::vector<int64_t> Plan::joints() const {
    std::vector<int64_t> out;
    int64_t d = 0;
    for (size_t i = 0; i + 1 < pieces.size(); ++i) {
        d += pieces[i].len;
        out.push_back(d);
    }
    return out;
}
std::vector<std::pair<int64_t, int64_t>> Plan::cuts() const {
    std::vector<std::pair<int64_t, int64_t>> out;
    for (size_t i = 1; i < pieces.size(); ++i) {
        out.emplace_back(pieces[i - 1].src + pieces[i - 1].len, pieces[i].src);
    }
    return out;
}
Plan Plan::identity(int64_t len, int64_t fade) { return {{{0, len}}, fade}; }
Plan Plan::scaled(int64_t factor) const {
    Plan p = *this;
    p.xfade *= factor;
    for (auto& piece : p.pieces) {
        piece.src *= factor;
        piece.len *= factor;
    }
    return p;
}
float Analysis::jumpScore(size_t i, size_t j) const {
    const auto m = beats.size();
    float s = 0, n = 0;
    for (size_t k = 0; k < kContextBeats; ++k) {
        if (i + k < m && j + k < m) {
            s += sim[(i + k) * m + j + k];
            n += 1;
        }
        if (i > k && j > k) {
            s += sim[(i - 1 - k) * m + j - 1 - k];
            n += 1;
        }
    }
    return n > 0 ? s / n : 0;
}
AnalysisResult analyze(const MonoReader& read, int sampleRate, int64_t expectedSamples,
                       const std::function<void(double)>& progress, const std::function<bool()>& cancelled) {
    if (sampleRate <= 0 || sampleRate > maxSampleRate) {
        return {{}, Error::InvalidSampleRate};
    }
    const int64_t limit = sampleRate * kMaxAnalysisSeconds;
    if (expectedSamples > limit) {
        return {{}, Error::TooLong};
    }
    if (stopped(cancelled)) {
        return {{}, Error::Cancelled};
    }
    if (!read) {
        return {{}, Error::ReadFailed};
    }
    const size_t n = onsetFrame(sampleRate), hop = n / 4, fn = std::max<size_t>(n * 2, 1024), fh = fn / 2;
    Spectrum onset(n), features(fn);
    FrameFeatures extractor(sampleRate, fn);
    // Audio storage is a fixed ring. Only scalar onset and 24 feature values per
    // frame survive the streaming pass, never the signal or full spectra.
    std::vector<float> ring(fn), input(hop), env, previous(n / 2 + 1);
    std::vector<std::pair<Feature, Feature>> frameFeatures;
    int64_t len = 0, nextOnset = static_cast<int64_t>(n), nextFeature = static_cast<int64_t>(fn);
    auto addOnset = [&](int64_t start) {
        onset.compute(ring, start, len);
        float flux = 0;
        for (size_t k = 0; k < previous.size(); ++k) {
            const float lg = std::log(1.f + 1000.f * onset.mag[k]);
            if (!env.empty()) {
                flux += std::max(lg - previous[k], 0.f);
            }
            previous[k] = lg;
        }
        env.push_back(flux);
    };
    auto addFeature = [&](int64_t start) {
        features.compute(ring, start, len);
        frameFeatures.push_back(extractor.compute(features.mag));
    };
    if (progress && expectedSamples > 0) {
        progress(0);
    }
    for (;;) {
        if (stopped(cancelled)) {
            return {{}, Error::Cancelled};
        }
        const int64_t count = read(input);
        if (stopped(cancelled)) {
            return {{}, Error::Cancelled};
        }
        if (count < 0 || count > static_cast<int64_t>(input.size())) {
            return {{}, Error::ReadFailed};
        }
        if (count == 0) {
            break;
        }
        if (count > limit - len) {
            return {{}, Error::TooLong};
        }
        for (int64_t i = 0; i < count; ++i) {
            ring[static_cast<size_t>(len) % fn] = input[static_cast<size_t>(i)];
            ++len;
            if (len == nextOnset) {
                if (stopped(cancelled)) {
                    return {{}, Error::Cancelled};
                }
                addOnset(len - static_cast<int64_t>(n));
                nextOnset += static_cast<int64_t>(hop);
            }
            if (len == nextFeature) {
                if (stopped(cancelled)) {
                    return {{}, Error::Cancelled};
                }
                addFeature(len - static_cast<int64_t>(fn));
                nextFeature += static_cast<int64_t>(fh);
            }
        }
        if (progress && expectedSamples > 0) {
            progress(0.8 * std::min(1.0, static_cast<double>(len) / expectedSamples));
        }
    }
    if (env.empty()) {
        addOnset(0);
    }
    if (frameFeatures.empty()) {
        addFeature(0);
    }
    const float mean = std::accumulate(env.begin(), env.end(), 0.f) / env.size();
    float variance = 0;
    for (float v : env) {
        variance += (v - mean) * (v - mean);
    }
    const float sd = std::sqrt(variance / env.size());
    if (sd > 0) {
        for (auto& v : env) {
            v /= sd;
        }
    }
    const auto period = tempo(env, static_cast<double>(sampleRate) / hop);
    if (!period) {
        return {{}, Error::NoBeat};
    }
    auto frames = trackBeats(env, *period);
    if (stopped(cancelled)) {
        return {{}, Error::Cancelled};
    }
    std::vector<float> strengths;
    for (auto t : frames) {
        strengths.push_back(localMax(env, t));
    }
    std::sort(strengths.begin(), strengths.end());
    const float median = strengths.empty() ? 0 : strengths[strengths.size() / 2];
    size_t first = 0, last = frames.size();
    while (first < last && localMax(env, frames[first]) < 0.3f * median) {
        ++first;
    }
    while (last > first && localMax(env, frames[last - 1]) < 0.3f * median) {
        --last;
    }
    auto offGrid = [&](size_t a, size_t b) { return std::abs((b - a) / *period - 1) > 0.05; };
    while (last - first > 2 && offGrid(frames[last - 2], frames[last - 1])) {
        --last;
    }
    while (last - first > 2 && offGrid(frames[first], frames[first + 1])) {
        ++first;
    }
    Analysis a;
    a.sampleRate = sampleRate;
    a.len = len;
    a.period = *period * hop;
    a.bpm = 60 * sampleRate / a.period;
    const auto lead = static_cast<int64_t>(std::llround(kCrossfadeSeconds * 0.5 * sampleRate));
    for (size_t i = first; i < last; ++i) {
        const auto b = static_cast<int64_t>(frames[i] * hop + n) - 3 * static_cast<int64_t>(hop) / 4 - lead;
        if (b > 0 && b < len && (a.beats.empty() || a.beats.back() != b)) {
            a.beats.push_back(b);
        }
    }
    const auto m = a.beats.size();
    if (m < 2 * kMinPieceBeats + 2) {
        return {{}, m < 4 ? Error::NoBeat : Error::TooShort};
    }
    if (m > maxSimilarityCells / m) {
        return {{}, Error::TooComplex};
    }
    std::vector<Feature> chroma(m), cep(m);
    std::vector<float> counts(m);
    size_t beat = 0;
    for (size_t t = 0; t < frameFeatures.size(); ++t) {
        const auto centre = static_cast<int64_t>(t * fh + fn / 2);
        while (beat + 1 < m && centre >= a.beats[beat + 1]) {
            ++beat;
        }
        if (centre >= a.beats[beat] && centre < len) {
            for (size_t k = 0; k < 12; ++k) {
                chroma[beat][k] += frameFeatures[t].first[k];
                cep[beat][k] += frameFeatures[t].second[k];
            }
            counts[beat] += 1;
        }
    }
    for (size_t i = 0; i < m; ++i) {
        if (counts[i] > 0) {
            for (auto& v : cep[i]) {
                v /= counts[i];
            }
        }
        const float length = norm(chroma[i]);
        if (length > 0) {
            for (auto& v : chroma[i]) {
                v /= length;
            }
        }
    }
    for (size_t k = 0; k < 12; ++k) {
        float sum = 0;
        for (const auto& c : cep) {
            sum += c[k];
        }
        const float avg = sum / m;
        float var = 0;
        for (const auto& c : cep) {
            var += (c[k] - avg) * (c[k] - avg);
        }
        const float dev = std::max(std::sqrt(var / m), 1e-6f);
        for (auto& c : cep) {
            c[k] = (c[k] - avg) / dev;
        }
    }
    std::vector<float> cn(m), qn(m);
    for (size_t i = 0; i < m; ++i) {
        cn[i] = norm(chroma[i]);
        qn[i] = norm(cep[i]);
    }
    a.sim.resize(m * m);
    for (size_t i = 0; i < m; ++i) {
        if (stopped(cancelled)) {
            return {{}, Error::Cancelled};
        }
        for (size_t j = i; j < m; ++j) {
            const float s = 0.6f * cosine(chroma[i], cn[i], chroma[j], cn[j]) +
                            0.4f * (1.f + cosine(cep[i], qn[i], cep[j], qn[j])) * 0.5f;
            a.sim[i * m + j] = s;
            a.sim[j * m + i] = s;
        }
        if (progress && expectedSamples > 0) {
            progress(0.8 + 0.2 * (i + 1) / m);
        }
    }
    if (stopped(cancelled)) {
        return {{}, Error::Cancelled};
    }
    return {std::move(a), Error::None};
}
AnalysisResult analyze(std::span<const float> mono, int sampleRate) {
    size_t pos = 0;
    return analyze(
        [&](std::span<float> dst) -> int64_t {
            const auto n = std::min(dst.size(), mono.size() - pos);
            std::copy_n(mono.data() + pos, n, dst.data());
            pos += n;
            return static_cast<int64_t>(n);
        },
        sampleRate, static_cast<int64_t>(mono.size()));
}

PlanResult plan(const Analysis& a, int64_t target, Params params) {
    const auto m = a.beats.size();
    if (m && m > maxSimilarityCells / m) {
        return {{}, Error::TooComplex};
    }
    if (a.sampleRate <= 0 || a.sampleRate > maxSampleRate) {
        return {{}, Error::InvalidSampleRate};
    }
    if (!std::isfinite(a.period) || a.period <= 0 || a.len <= 0 || m < 2) {
        return {{}, Error::NoBeat};
    }
    if (target <= 0) {
        return {{}, Error::TargetTooShort};
    }
    const auto xfade = static_cast<int64_t>(std::llround(kCrossfadeSeconds * a.sampleRate));
    const auto len = a.len, half = static_cast<int64_t>(a.period / 2);
    if (std::abs(target - len) <= half) {
        return {Plan::identity(len, xfade), Error::None};
    }
    if (a.sim.size() != m * m) {
        return {{}, Error::NoBeat};
    }
    const auto& b = a.beats;
    const auto minPiece = static_cast<int64_t>(kMinPieceBeats * a.period);
    if (target < 2 * minPiece) {
        return {{}, Error::TargetTooShort};
    }
    const double segments = std::isnan(params.segments) ? 0 : std::clamp(params.segments, 0.0, 100.0);
    const double variations = std::isnan(params.variations) ? 0 : std::clamp(params.variations, 0.0, 100.0);
    const auto window = 1 + static_cast<size_t>(std::round(7 * variations / 100));
    size_t k = std::min(1 + static_cast<size_t>(std::floor(segments / 34)),
                        static_cast<size_t>(std::max(std::round(std::abs(target - len) / a.period), 1.0)));
    while (k > 1 && target / static_cast<int64_t>(k + 1) < minPiece) {
        --k;
    }
    if (target > len) {
        const auto maxSpan = std::max(len - 2 * minPiece, static_cast<int64_t>(a.period));
        while ((target - len) / static_cast<double>(k) > maxSpan * 0.9 &&
               target / static_cast<int64_t>(k + 2) >= minPiece) {
            ++k;
        }
    }
    auto closest = [&](int64_t x) {
        const auto i = std::min(static_cast<size_t>(std::lower_bound(b.begin(), b.end(), x) - b.begin()), m - 1);
        return i > 0 && std::abs(x - b[i - 1]) <= std::abs(b[i] - x) ? i - 1 : i;
    };
    Plan p;
    p.xfade = xfade;
    int64_t src = 0, out = 0;
    for (size_t jn = 0; jn < k; ++jn) {
        const auto left = static_cast<int64_t>(k - jn), outLeft = target - out, piece = outLeft / (left + 1),
                   srcLeft = len - src, span = (srcLeft - outLeft) / left;
        const auto ni = closest(src + piece);
        const bool last = jn + 1 == k;
        struct Candidate {
            float score;
            int64_t error;
            size_t i, j;
        };
        std::optional<Candidate> best;
        for (size_t i = ni > window ? ni - window : 0; i <= std::min(ni + window, m - 1); ++i) {
            if (b[i] - src < minPiece) {
                continue;
            }
            const auto nj = closest(b[i] + span);
            for (size_t j = nj > window ? nj - window : 0; j <= std::min(nj + window, m - 1); ++j) {
                if (j == i || len - b[j] < minPiece || (b[j] > b[i]) != (target < len)) {
                    continue;
                }
                const auto newOut = out + (b[i] - src), restSrc = len - b[j], err = (target - newOut) - restSrc;
                if (last) {
                    if (std::abs(err) > std::max<int64_t>(half, 1) * 2) {
                        continue;
                    }
                } else {
                    const auto remOut = target - newOut;
                    if (remOut < left * minPiece) {
                        continue;
                    }
                    const auto rem = restSrc - remOut;
                    auto sign = [](int64_t x) { return (x > 0) - (x < 0); };
                    if (sign(rem) != sign(len - target) || std::abs(rem) < (left - 1) * a.period * 0.75) {
                        continue;
                    }
                }
                const auto score = a.jumpScore(i, j);
                const int64_t keyError = last ? std::abs(err) / std::max<int64_t>(half, 1) : 0;
                if (!best || keyError < best->error ||
                    (keyError == best->error &&
                     (score > best->score ||
                      (score == best->score && std::pair{i, j} < std::pair{best->i, best->j})))) {
                    best = Candidate{score, keyError, i, j};
                }
            }
        }
        if (!best) {
            return {{}, Error::TargetTooShort};
        }
        p.pieces.push_back({src, b[best->i] - src});
        out += b[best->i] - src;
        src = b[best->j];
    }
    p.pieces.push_back({src, len - src});
    return {std::move(p), Error::None};
}

namespace {
// Modified Bessel I0, used only to construct the Kaiser table.
double bessel0(double x) {
    double sum = 1, term = 1;
    for (int k = 1; k < 40; ++k) {
        term *= x * x / (4.0 * k * k);
        sum += term;
        if (term < sum * 1e-16) {
            break;
        }
    }
    return sum;
}
} // namespace
PlanRenderer::PlanRenderer(Plan p, int64_t targetFrames, SourceReader source)
    : m_plan(std::move(p)), m_target(targetFrames), m_source(std::move(source)) {
    const auto length = m_plan.length();
    m_step = m_target > 0 ? static_cast<double>(length) / m_target : 1;
    m_resample = m_target > 0 && length > 0 && std::abs(length - m_target) > 1;
    if (!m_resample) {
        return;
    }
    const double cutoff = std::min(1.0, 1 / m_step), beta = 8.6, den = bessel0(beta);
    for (size_t phase = 0; phase <= 256; ++phase) {
        const double frac = phase / 256.0;
        double sum = 0;
        for (int tap = 0; tap < 16; ++tap) {
            const double offset = tap - 7 - frac, z = offset / 8, a = pi * offset * cutoff;
            const double window = std::abs(z) <= 1 ? bessel0(beta * std::sqrt(std::max(0.0, 1 - z * z))) / den : 0;
            const double weight = cutoff * (std::abs(a) < 1e-15 ? 1 : std::sin(a) / a) * window;
            m_kernel[phase][static_cast<size_t>(tap)] = weight;
            sum += weight;
        }
        for (auto& weight : m_kernel[phase]) {
            weight /= sum;
        }
    }
}
int64_t PlanRenderer::frames() const { return m_target; }
double PlanRenderer::stretch() const { return m_step; }
bool PlanRenderer::readPlan(int64_t first, int64_t count, float* dst) {
    std::fill_n(dst, static_cast<size_t>(count) * 2, 0.f);
    const int64_t x = std::max<int64_t>(0, m_plan.xfade), h0 = x / 2, h1 = x - h0;
    int64_t d = 0;
    for (size_t piIndex = 0; piIndex < m_plan.pieces.size(); ++piIndex) {
        const auto& p = m_plan.pieces[piIndex];
        const auto ds = d, de = d + p.len;
        d = de;
        const bool fadeIn = piIndex > 0 && x > 0, fadeOut = piIndex + 1 < m_plan.pieces.size() && x > 0;
        const auto a = std::max(fadeIn ? ds - h0 : ds, first), z = std::min(fadeOut ? de + h1 : de, first + count);
        if (z <= a) {
            continue;
        }
        m_sourceBuffer.resize(static_cast<size_t>(z - a) * 2);
        if (!m_source || !m_source(p.src + (a - ds), z - a, m_sourceBuffer.data())) {
            return false;
        }
        for (auto o = a; o < z; ++o) {
            double gain = 1;
            if (fadeIn && o < ds + h1) {
                gain *= std::sin((o - (ds - h0) + 0.5) / x * pi / 2);
            }
            if (fadeOut && o >= de - h0) {
                gain *= std::cos((o - (de - h0) + 0.5) / x * pi / 2);
            }
            const auto g = static_cast<float>(gain);
            for (size_t c = 0; c < 2; ++c) {
                dst[static_cast<size_t>(o - first) * 2 + c] += m_sourceBuffer[static_cast<size_t>(o - a) * 2 + c] * g;
            }
        }
    }
    return true;
}
bool PlanRenderer::read(int64_t outFrame, int64_t count, float* dst) {
    if (count < 0 || (count > 0 && !dst) || outFrame < 0 || outFrame > m_target || count > m_target - outFrame) {
        return false;
    }
    int64_t done = 0;
    while (done < count) {
        // Bound both the raw plan and source staging buffers, including when
        // a very short target needs a large resampling step.
        const auto block = std::min<int64_t>(
            count - done, m_resample ? std::max<int64_t>(1, static_cast<int64_t>(4096 / std::max(1.0, m_step))) : 4096);
        auto* output = dst + done * 2;
        if (!m_resample) {
            if (!readPlan(outFrame + done, block, output)) {
                return false;
            }
        } else {
            const auto start = static_cast<int64_t>(std::floor(static_cast<double>(outFrame + done) * m_step)) - 7;
            const auto end =
                static_cast<int64_t>(std::floor(static_cast<double>(outFrame + done + block - 1) * m_step)) + 9;
            m_planBuffer.resize(static_cast<size_t>(end - start) * 2);
            if (!readPlan(start, end - start, m_planBuffer.data())) {
                return false;
            }
            for (int64_t i = 0; i < block; ++i) {
                const double position = static_cast<double>(outFrame + done + i) * m_step;
                const auto base = static_cast<int64_t>(std::floor(position));
                const double phase = (position - base) * 256;
                const auto index = static_cast<size_t>(phase);
                const double fraction = phase - index;
                for (size_t c = 0; c < 2; ++c) {
                    double sum = 0;
                    for (size_t tap = 0; tap < 16; ++tap) {
                        const double weight =
                            m_kernel[index][tap] + fraction * (m_kernel[index + 1][tap] - m_kernel[index][tap]);
                        sum += weight *
                               m_planBuffer[static_cast<size_t>(base - 7 - start + static_cast<int64_t>(tap)) * 2 + c];
                    }
                    output[i * 2 + static_cast<int64_t>(c)] = static_cast<float>(sum);
                }
            }
        }
        done += block;
    }
    return true;
}
} // namespace nt::remix
