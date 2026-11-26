// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7 (juce/source/dsp/{Fx.h,Fx.cpp,ParametricEq.h}).
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).

#include "audio/effects/fable/FableDsp.h"

#include <algorithm>
#include <cmath>

namespace nt::audio::effects::fable {
namespace {

double safeRate(double sr) noexcept {
    return (std::isfinite(sr) && sr > 0.0) ? sr : 48000.0;
}

double besselI0(double x) noexcept {
    double sum = 1.0;
    double term = 1.0;
    for (int k = 1; k < 64; ++k) {
        term *= x * x / (4.0 * static_cast<double>(k) * static_cast<double>(k));
        sum += term;
        if (term < 1.0e-16 * sum) {
            break;
        }
    }
    return sum;
}

}  // namespace

// ---------------- Biquad designs (RBJ cookbook) ----------------

void Biquad::lowpass(double freq, double q, double sr) noexcept {
    const double rate = safeRate(sr);
    const double w0 = 2.0 * kPi * std::min(std::max(1.0, freq), rate * 0.49) / rate;
    const double cw = std::cos(w0);
    const double sw = std::sin(w0);
    const double alpha = sw / (2.0 * std::max(1.0e-4, q));
    const double a0 = 1.0 + alpha;
    b0 = (1.0 - cw) / 2.0 / a0;
    b1 = (1.0 - cw) / a0;
    b2 = b0;
    a1 = (-2.0 * cw) / a0;
    a2 = (1.0 - alpha) / a0;
}

void Biquad::highpass(double freq, double q, double sr) noexcept {
    const double rate = safeRate(sr);
    const double w0 = 2.0 * kPi * std::min(std::max(1.0, freq), rate * 0.49) / rate;
    const double cw = std::cos(w0);
    const double sw = std::sin(w0);
    const double alpha = sw / (2.0 * std::max(1.0e-4, q));
    const double a0 = 1.0 + alpha;
    b0 = (1.0 + cw) / 2.0 / a0;
    b1 = -(1.0 + cw) / a0;
    b2 = b0;
    a1 = (-2.0 * cw) / a0;
    a2 = (1.0 - alpha) / a0;
}

void Biquad::lowShelf(double freq, double gainDb, double sr, double q) noexcept {
    const double rate = safeRate(sr);
    const double A = std::pow(10.0, gainDb / 40.0);
    const double w0 = 2.0 * kPi * std::min(std::max(1.0, freq), rate * 0.49) / rate;
    const double cw = std::cos(w0);
    const double sw = std::sin(w0);
    const double alpha = sw / (2.0 * std::max(1.0e-4, q));
    const double tsa = 2.0 * std::sqrt(A) * alpha;
    const double a0 = (A + 1.0) + (A - 1.0) * cw + tsa;
    b0 = A * ((A + 1.0) - (A - 1.0) * cw + tsa) / a0;
    b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cw) / a0;
    b2 = A * ((A + 1.0) - (A - 1.0) * cw - tsa) / a0;
    a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cw) / a0;
    a2 = ((A + 1.0) + (A - 1.0) * cw - tsa) / a0;
}

void Biquad::highShelf(double freq, double gainDb, double sr, double q) noexcept {
    const double rate = safeRate(sr);
    const double A = std::pow(10.0, gainDb / 40.0);
    const double w0 = 2.0 * kPi * std::min(std::max(1.0, freq), rate * 0.49) / rate;
    const double cw = std::cos(w0);
    const double sw = std::sin(w0);
    const double alpha = sw / (2.0 * std::max(1.0e-4, q));
    const double tsa = 2.0 * std::sqrt(A) * alpha;
    const double a0 = (A + 1.0) - (A - 1.0) * cw + tsa;
    b0 = A * ((A + 1.0) + (A - 1.0) * cw + tsa) / a0;
    b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cw) / a0;
    b2 = A * ((A + 1.0) + (A - 1.0) * cw - tsa) / a0;
    a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cw) / a0;
    a2 = ((A + 1.0) - (A - 1.0) * cw - tsa) / a0;
}

void Biquad::peaking(double freq, double q, double gainDb, double sr) noexcept {
    const double rate = safeRate(sr);
    const double A = std::pow(10.0, gainDb / 40.0);
    const double w0 = 2.0 * kPi * std::min(std::max(1.0, freq), rate * 0.49) / rate;
    const double cw = std::cos(w0);
    const double sw = std::sin(w0);
    const double alpha = sw / (2.0 * std::max(1.0e-4, q));
    const double a0 = 1.0 + alpha / A;
    b0 = (1.0 + alpha * A) / a0;
    b1 = (-2.0 * cw) / a0;
    b2 = (1.0 - alpha * A) / a0;
    a1 = (-2.0 * cw) / a0;
    a2 = (1.0 - alpha / A) / a0;
}

// ---------------- AutoGain ----------------

void AutoGain::prepare(double sampleRate) noexcept {
    const double rate = safeRate(sampleRate);
    energyCoef_ = 1.0 - std::exp(-1.0 / (0.3 * rate));
    gainCoef_ = 1.0 - std::exp(-1.0 / (0.15 * rate));
    reset();
}

void AutoGain::reset() noexcept {
    input_ = 0.0;
    wet_ = 0.0;
    gain = 1.0;
    target_ = 1.0;
    tick_ = 0;
}

double AutoGain::next(double inL, double inR, double wetL, double wetR) noexcept {
    const double input = 0.5 * (inL * inL + inR * inR);
    const double wet = 0.5 * (wetL * wetL + wetR * wetR);
    input_ = flushDenormal(input_ + (input - input_) * energyCoef_);
    wet_ = flushDenormal(wet_ + (wet - wet_) * energyCoef_);
    if (tick_ == 0 && input > 1.0e-12 && input_ > 1.0e-12 && wet_ > 1.0e-16) {
        target_ = std::max(0.003981071706, std::min(15.848931925, std::sqrt(input_ / wet_)));
    }
    tick_ = (tick_ + 1) & 15;
    gain = flushDenormal(gain + (target_ - gain) * gainCoef_);
    return gain;
}

// ---------------- PeakGuard ----------------

void PeakGuard::prepare(double sampleRate) noexcept {
    const double rate = safeRate(sampleRate);
    release_ = 1.0 - std::exp(-1.0 / (0.08 * rate));
    reset();
}

double PeakGuard::gainFor(double l, double r) noexcept {
    const double peak = std::max(std::abs(l), std::abs(r));
    const double required = peak > kCeiling ? kCeiling / peak : 1.0;
    gain = std::min(required, gain + (1.0 - gain) * release_);
    if (required == 1.0 && 1.0 - gain < 1.0e-8) {
        gain = 1.0;
    }
    return gain;
}

void PeakGuard::process(float* L, float* R, int n) noexcept {
    for (int i = 0; i < n; ++i) {
        const double l = L[i];
        const double r = R[i];
        if (!std::isfinite(l) || !std::isfinite(r)) {
            L[i] = 0.0f;
            R[i] = 0.0f;
            continue;
        }
        const double g = gainFor(l, r);
        L[i] = static_cast<float>(l * g);
        R[i] = static_cast<float>(r * g);
    }
}

// ---------------- HalfBandFir ----------------

void HalfBandFir::design(int taps, double beta) {
    if (taps < 3) {
        taps = 3;
    }
    h_.assign(static_cast<std::size_t>(taps), 0.0);
    const double M = static_cast<double>(taps - 1);
    const double ib = besselI0(beta);
    for (int i = 0; i < taps; ++i) {
        const double m = static_cast<double>(i) - M * 0.5;
        const double sinc = std::fpclassify(m) == FP_ZERO ? 0.5 : std::sin(kPi * 0.5 * m) / (kPi * m);
        const double t = 2.0 * m / M;
        h_[static_cast<std::size_t>(i)] =
            sinc * besselI0(beta * std::sqrt(std::max(0.0, 1.0 - t * t))) / ib;
    }
    if (taps % 2 == 1) {
        const int c = (taps - 1) / 2;
        for (int i = 0; i < taps; ++i) {
            if (i != c && ((i - c) % 2) == 0) {
                h_[static_cast<std::size_t>(i)] = 0.0;
            }
        }
    }

    nzTap_.clear();
    nzOff_.clear();
    for (int i = 0; i < taps; ++i) {
        if (h_[static_cast<std::size_t>(i)] != 0.0) {
            nzTap_.push_back(h_[static_cast<std::size_t>(i)]);
            nzOff_.push_back(i);
        }
    }

    pe_.assign(static_cast<std::size_t>((taps + 1) / 2), 0.0);
    po_.assign(static_cast<std::size_t>(taps / 2), 0.0);
    for (std::size_t j = 0; j < pe_.size(); ++j) {
        pe_[j] = h_[2 * j];
    }
    for (std::size_t j = 0; j < po_.size(); ++j) {
        po_[j] = h_[2 * j + 1];
    }
    const auto range = [](const std::vector<double>& v, int& a, int& b) {
        a = 0;
        b = -1;
        for (int j = 0; j < static_cast<int>(v.size()); ++j) {
            if (v[static_cast<std::size_t>(j)] != 0.0) {
                if (b < 0) {
                    a = j;
                }
                b = j;
            }
        }
    };
    range(pe_, peA_, peB_);
    range(po_, poA_, poB_);

    np_ = static_cast<int>(std::max(pe_.size(), po_.size() + 1));
    hx_.assign(static_cast<std::size_t>(2 * np_), 0.0);
    he_.assign(static_cast<std::size_t>(2 * np_), 0.0);
    ho_.assign(static_cast<std::size_t>(2 * np_), 0.0);
    px_ = 0;
    pd_ = 0;

    z_.assign(static_cast<std::size_t>(taps), 0.0);
    pos_ = 0;
}

void HalfBandFir::reset() noexcept {
    std::ranges::fill(z_, 0.0);
    pos_ = 0;
    std::ranges::fill(hx_, 0.0);
    std::ranges::fill(he_, 0.0);
    std::ranges::fill(ho_, 0.0);
    px_ = 0;
    pd_ = 0;
}

double HalfBandFir::process(double x) noexcept {
    if (h_.empty()) {
        return x;
    }
    z_[static_cast<std::size_t>(pos_)] = x;
    double acc = 0.0;
    const int n = static_cast<int>(h_.size());
    const std::size_t nz = nzTap_.size();
    for (std::size_t k = 0; k < nz; ++k) {
        int idx = pos_ - nzOff_[k];
        if (idx < 0) {
            idx += n;
        }
        acc += nzTap_[k] * z_[static_cast<std::size_t>(idx)];
    }
    if (++pos_ >= n) {
        pos_ = 0;
    }
    return acc;
}

void HalfBandFir::interpolate(double x, double& y0, double& y1) noexcept {
    if (hx_.empty()) {
        y0 = x;
        y1 = x;
        return;
    }
    if (--px_ < 0) {
        px_ = np_ - 1;
    }
    hx_[static_cast<std::size_t>(px_)] = x;
    hx_[static_cast<std::size_t>(px_ + np_)] = x;
    const double* b = hx_.data() + px_;
    double a0 = 0.0;
    double a1 = 0.0;
    for (int j = peA_; j <= peB_; ++j) {
        a0 += pe_[static_cast<std::size_t>(j)] * b[j];
    }
    for (int j = poA_; j <= poB_; ++j) {
        a1 += po_[static_cast<std::size_t>(j)] * b[j];
    }
    y0 = 2.0 * a0;
    y1 = 2.0 * a1;
}

double HalfBandFir::decimate(double x0, double x1) noexcept {
    if (he_.empty()) {
        return x0;
    }
    if (--pd_ < 0) {
        pd_ = np_ - 1;
    }
    he_[static_cast<std::size_t>(pd_)] = x0;
    he_[static_cast<std::size_t>(pd_ + np_)] = x0;
    ho_[static_cast<std::size_t>(pd_)] = x1;
    ho_[static_cast<std::size_t>(pd_ + np_)] = x1;
    const double* be = he_.data() + pd_;
    const double* bo = ho_.data() + pd_;
    double acc = 0.0;
    for (int j = peA_; j <= peB_; ++j) {
        acc += pe_[static_cast<std::size_t>(j)] * be[j];
    }
    for (int j = poA_; j <= poB_; ++j) {
        acc += po_[static_cast<std::size_t>(j)] * bo[j + 1];
    }
    return acc;
}

}  // namespace nt::audio::effects::fable
