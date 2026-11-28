// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/Wavetables.{h,cpp}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "midi/WavetableTables.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>
#include <utility>
#include <vector>

namespace nt::midi {
namespace {

constexpr double kPi = std::numbers::pi;
constexpr double kSinePhase = -kPi * 0.5;  // sin(x) == cos(x - pi/2)

inline double lerp(double a, double b, double t) noexcept {
    return a + (b - a) * t;
}

inline void addHarmonic(double* re, double* im, int k, double amp, double phase) noexcept {
    const double c = amp * std::cos(phase);
    const double s = amp * std::sin(phase);
    re[k] += c;
    im[k] += s;
    re[kWavetableSize - k] += c;
    im[kWavetableSize - k] -= s;
}

void specPrime(double t, double* re, double* im) noexcept {
    const double seg = std::min(2.9999, t * 3.0);
    const int s = static_cast<int>(seg);
    const double f = seg - static_cast<double>(s);
    for (int k = 1; k <= 1024; ++k) {
        const double sine = (k == 1) ? 1.0 : 0.0;
        const double tri = (k % 2 == 1)
            ? ((((k - 1) / 2) % 2 == 0 ? 1.0 : -1.0) / static_cast<double>(k * k))
            : 0.0;
        const double saw = 1.0 / static_cast<double>(k);
        const double sqr = (k % 2 == 1) ? 1.27 / static_cast<double>(k) : 0.0;
        const double shapes[4] = {sine, tri, saw, sqr};
        const double a = lerp(shapes[s], shapes[s + 1], f);
        if (std::fpclassify(a) != FP_ZERO) {
            addHarmonic(re, im, k, a, kSinePhase);
        }
    }
}

void specBloom(double t, double* re, double* im) noexcept {
    const int n = 1 + static_cast<int>(std::floor(t * t * 220.0));
    for (int k = 1; k <= 1024; ++k) {
        const double roll = std::exp(-std::pow(static_cast<double>(k) / static_cast<double>(n), 4.0));
        const double a = roll / std::pow(static_cast<double>(k), 1.25);
        if (a < 1e-5) {
            break;
        }
        const double ph = kSinePhase + std::sin(static_cast<double>(k) * 12.9898) * 0.7 * t;
        addHarmonic(re, im, k, a, ph);
    }
}

void specPulse(double t, double* re, double* im) noexcept {
    const double d = 0.5 - 0.44 * t;
    for (int k = 1; k <= 1024; ++k) {
        const double kd = static_cast<double>(k);
        const double a = (2.0 / (kd * kPi)) * std::sin(kPi * kd * d);
        addHarmonic(re, im, k, a, kSinePhase - kPi * kd * d);
    }
}

void specVox(double t, double* re, double* im) noexcept {
    static constexpr double kFormants[5][3] = {
        {730.0, 1090.0, 2440.0},
        {530.0, 1840.0, 2480.0},
        {390.0, 1990.0, 2550.0},
        {570.0, 840.0, 2410.0},
        {440.0, 1020.0, 2240.0},
    };
    static constexpr double kAmps[3] = {1.0, 0.55, 0.32};
    static constexpr double kBw[3] = {95.0, 120.0, 160.0};

    const double pos = t * 4.0;
    const int v = std::min(3, static_cast<int>(pos));
    const double f = pos - static_cast<double>(v);
    double F[3];
    for (int j = 0; j < 3; ++j) {
        F[j] = lerp(kFormants[v][j], kFormants[v + 1][j], f);
    }
    for (int k = 1; k <= 256; ++k) {
        const double freq = static_cast<double>(k) * 110.0;
        double g = 0.04;
        for (int j = 0; j < 3; ++j) {
            const double d = (freq - F[j]) / kBw[j];
            g += kAmps[j] * std::exp(-0.5 * d * d);
        }
        addHarmonic(re, im, k, g / std::pow(static_cast<double>(k), 0.75), kSinePhase);
    }
}

void specChime(double t, double* re, double* im) noexcept {
    static constexpr int kPartials[10] = {1, 2, 3, 5, 7, 9, 13, 16, 19, 24};
    for (int j = 0; j < 10; ++j) {
        const int k = kPartials[j];
        const double base = 1.0 / std::pow(static_cast<double>(j + 1), 0.8);
        const double a = base * std::pow(std::max(t, 0.001), static_cast<double>(j) * 0.45);
        const double ph = kSinePhase + std::fmod(static_cast<double>(j * j) * 1.7, kPi * 2.0);
        addHarmonic(re, im, k, a, ph);
        if (j > 0 && t > 0.15) {
            addHarmonic(re, im, k + 1, a * 0.28 * t, ph + 1.1);
        }
    }
}

void waveGlitch(double t, double* out) noexcept {
    const double levels = lerp(40.0, 2.4, t);
    const int hold = 1 + static_cast<int>(std::round(t * 40.0));
    double held = 0.0;
    for (int n = 0; n < kWavetableSize; ++n) {
        if (n % hold == 0) {
            const double ang = (2.0 * kPi * static_cast<double>(n)) / static_cast<double>(kWavetableSize);
            const double x = std::sin(ang)
                + 0.45 * t * std::sin(5.0 * ang + 1.3)
                + 0.20 * t * std::sin(9.0 * ang + 2.6);
            held = std::round(x * levels) / levels;
        }
        out[n] = held;
    }
}

void bandlimitFrame(const double* re, const double* im, std::vector<float>& data, int frame,
                    double* wre, double* wim) noexcept {
    double scale = 1.0;
    for (int m = 0; m < kWavetableMips; ++m) {
        const int maxHarm = 1024 >> m;
        for (int i = 0; i < kWavetableSize; ++i) {
            wre[i] = re[i];
            wim[i] = im[i];
        }
        for (int k = maxHarm + 1; k <= kWavetableSize - maxHarm - 1; ++k) {
            wre[k] = 0.0;
            wim[k] = 0.0;
        }
        wavetableFft(wre, wim, kWavetableSize, true);

        if (m == 0) {
            double peak = 1e-9;
            for (int i = 0; i < kWavetableSize; ++i) {
                peak = std::max(peak, std::abs(wre[i]));
            }
            scale = 0.92 / peak;
        }
        const std::size_t off = static_cast<std::size_t>(frame * kWavetableMips + m) * kWavetableSize;
        for (std::size_t i = 0; i < static_cast<std::size_t>(kWavetableSize); ++i) {
            data[off + i] = static_cast<float>(wre[i] * scale);
        }
    }
}

struct TableSpec {
    std::string_view name;
    void (*spectrum)(double, double*, double*) noexcept;
    void (*wave)(double, double*) noexcept;
};

std::array<WavetableData, kWavetableCount> buildFactoryTables() {
    static constexpr std::array<TableSpec, kWavetableCount> kSpecs = {{
        {"prime", specPrime, nullptr},
        {"bloom", specBloom, nullptr},
        {"pulse", specPulse, nullptr},
        {"vox", specVox, nullptr},
        {"chime", specChime, nullptr},
        {"glitch", nullptr, waveGlitch},
    }};

    std::vector<double> re(kWavetableSize);
    std::vector<double> im(kWavetableSize);
    std::vector<double> wre(kWavetableSize);
    std::vector<double> wim(kWavetableSize);
    std::vector<double> tmp(kWavetableSize);
    std::array<WavetableData, kWavetableCount> out{};

    for (std::size_t tIdx = 0; tIdx < kSpecs.size(); ++tIdx) {
        const auto& spec = kSpecs[tIdx];
        WavetableData tbl;
        tbl.name = spec.name;
        tbl.data.assign(static_cast<std::size_t>(kWavetableFrames) * kWavetableMips * kWavetableSize, 0.0f);

        for (int f = 0; f < kWavetableFrames; ++f) {
            const double t = static_cast<double>(f) / static_cast<double>(kWavetableFrames - 1);
            std::fill(re.begin(), re.end(), 0.0);
            std::fill(im.begin(), im.end(), 0.0);
            if (spec.spectrum) {
                spec.spectrum(t, re.data(), im.data());
            } else {
                spec.wave(t, tmp.data());
                for (std::size_t i = 0; i < static_cast<std::size_t>(kWavetableSize); ++i) {
                    re[i] = tmp[i];
                    im[i] = 0.0;
                }
                wavetableFft(re.data(), im.data(), kWavetableSize, false);
            }
            re[0] = 0.0;
            im[0] = 0.0;
            re[kWavetableSize / 2] = 0.0;
            im[kWavetableSize / 2] = 0.0;
            bandlimitFrame(re.data(), im.data(), tbl.data, f, wre.data(), wim.data());
        }
        out[tIdx] = std::move(tbl);
    }
    return out;
}

std::vector<float> buildSubSquareTable() {
    std::vector<double> lut(kSubSquareSize);
    std::vector<double> acc(kSubSquareSize, 0.0);
    for (int j = 0; j < kSubSquareSize; ++j) {
        lut[static_cast<std::size_t>(j)] = std::sin(2.0 * kPi * static_cast<double>(j) / static_cast<double>(kSubSquareSize));
    }
    std::vector<float> out(static_cast<std::size_t>(kWavetableMips) * kSubSquareStride, 0.0f);
    const double coef = 4.0 / kPi;
    int k = 1;
    for (int m = kWavetableMips - 1; m >= 0; --m) {
        const int maxHarm = 1024 >> m;
        for (; k <= maxHarm; k += 2) {
            const double inv = 1.0 / static_cast<double>(k);
            for (int i = 0; i < kSubSquareSize; ++i) {
                acc[static_cast<std::size_t>(i)] +=
                    lut[static_cast<std::size_t>((k * i) & (kSubSquareSize - 1))] * inv;
            }
        }
        float* dst = out.data() + static_cast<std::size_t>(m) * kSubSquareStride;
        for (int i = -1; i < kSubSquareSize + 2; ++i) {
            dst[i + 1] = static_cast<float>(
                acc[static_cast<std::size_t>((i + kSubSquareSize) & (kSubSquareSize - 1))] * coef);
        }
    }
    return out;
}

}  // namespace

void wavetableFft(double* re, double* im, int n, bool inverse) noexcept {
    for (int i = 1, j = 0; i < n; ++i) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        const double ang = ((inverse ? 2.0 : -2.0) * kPi) / static_cast<double>(len);
        const double wr = std::cos(ang);
        const double wi = std::sin(ang);
        const int half = len >> 1;
        for (int i = 0; i < n; i += len) {
            double cr = 1.0;
            double ci = 0.0;
            for (int k = 0; k < half; ++k) {
                const double ur = re[i + k];
                const double ui = im[i + k];
                const double xr = re[i + k + half];
                const double xi = im[i + k + half];
                const double vr = xr * cr - xi * ci;
                const double vi = xr * ci + xi * cr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + half] = ur - vr;
                im[i + k + half] = ui - vi;
                const double ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
    if (inverse) {
        const double invN = 1.0 / static_cast<double>(n);
        for (int i = 0; i < n; ++i) {
            re[i] *= invN;
            im[i] *= invN;
        }
    }
}

const std::array<WavetableData, kWavetableCount>& factoryWavetables() {
    static const std::array<WavetableData, kWavetableCount> kTables = buildFactoryTables();
    return kTables;
}

const float* subSquareTable() {
    static const std::vector<float> kTable = buildSubSquareTable();
    return kTable.data();
}

std::string_view wavetableName(WavetableId id) noexcept {
    switch (id) {
    case WavetableId::Prime: return "prime";
    case WavetableId::Bloom: return "bloom";
    case WavetableId::Pulse: return "pulse";
    case WavetableId::Vox: return "vox";
    case WavetableId::Chime: return "chime";
    case WavetableId::Glitch: return "glitch";
    case WavetableId::Count: break;
    }
    return "prime";
}

WavetableId wavetableIdFromName(std::string_view name) noexcept {
    if (name == "bloom" || name == "BLOOM") return WavetableId::Bloom;
    if (name == "pulse" || name == "PULSE") return WavetableId::Pulse;
    if (name == "vox" || name == "VOX") return WavetableId::Vox;
    if (name == "chime" || name == "CHIME") return WavetableId::Chime;
    if (name == "glitch" || name == "GLITCH") return WavetableId::Glitch;
    return WavetableId::Prime;
}

WavetableId wavetableIdFromIndex(int index) noexcept {
    if (index < 0 || index >= kWavetableCount) {
        return WavetableId::Prime;
    }
    return static_cast<WavetableId>(index);
}

}  // namespace nt::midi
