// Biquad designs and the Direct Form I filter loop. The RBJ design serves the
// streaming filters and the VCF. The Web Audio design is the filter of the
// lib.audio batch filters and of the timeline's audio effects.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <algorithm>
#include <cmath>

namespace {

using nt::kernels::f32;
using nt::kernels::kPi;

void normalize(double b0, double b1, double b2, double a0, double a1, double a2,
               double* coeffs) {
  coeffs[0] = b0 / a0;
  coeffs[1] = b1 / a0;
  coeffs[2] = b2 / a0;
  coeffs[3] = a1 / a0;
  coeffs[4] = a2 / a0;
}

void constant(double value, double* coeffs) {
  coeffs[0] = value;
  coeffs[1] = coeffs[2] = coeffs[3] = coeffs[4] = 0;
}

bool knownType(int type) {
  return type >= NT_BIQUAD_LOWPASS && type <= NT_BIQUAD_PEAKING;
}

// The coefficients of the shelf filters, from A, cos(w0) and the shelf term.
void shelf(int type, double A, double c, double t, double* coeffs) {
  if (type == NT_BIQUAD_LOWSHELF) {
    normalize(A * ((A + 1) - (A - 1) * c + t), 2 * A * ((A - 1) - (A + 1) * c),
              A * ((A + 1) - (A - 1) * c - t), (A + 1) + (A - 1) * c + t,
              -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - t, coeffs);
  } else {
    normalize(A * ((A + 1) + (A - 1) * c + t), -2 * A * ((A - 1) + (A + 1) * c),
              A * ((A + 1) + (A - 1) * c - t), (A + 1) - (A - 1) * c + t,
              2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - t, coeffs);
  }
}

// Runs one channel of a Direct Form I biquad. The state keeps the unrounded
// output in double, as both callers this replaced did.
void filterChannel(const double* k, double* s, const float* in, float* out,
                   size_t frames, uint32_t stride) {
  double x1 = s[0], x2 = s[1], y1 = s[2], y2 = s[3];
  for (size_t i = 0; i < frames; i++) {
    const double x0 = in[i * stride];
    const double y0 = k[0] * x0 + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    out[i * stride] = f32(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  s[0] = x1;
  s[1] = x2;
  s[2] = y1;
  s[3] = y2;
}

}  // namespace

extern "C" {

int nt_biquad_design_rbj(int type, double sample_rate, double frequency,
                         double q, double gain_db, double* coeffs) {
  if (!coeffs || !knownType(type) || type == NT_BIQUAD_BANDPASS || !nt::kernels::validSampleRate(sample_rate)) {
    return NT_ERR_ARGS;
  }
  const double nyquist = sample_rate / 2;
  const double f = std::min(std::max(frequency, 1.0), nyquist * 0.9999);
  const double w0 = (2 * kPi * f) / sample_rate;
  const double c = std::cos(w0);
  const double s = std::sin(w0);
  const double alpha = s / (2 * std::max(q, 1e-4));
  const double A = std::pow(10, gain_db / 40);
  switch (type) {
    case NT_BIQUAD_LOWPASS:
      normalize((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha, coeffs);
      break;
    case NT_BIQUAD_HIGHPASS:
      normalize((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha, coeffs);
      break;
    case NT_BIQUAD_LOWSHELF:
    case NT_BIQUAD_HIGHSHELF:
      shelf(type, A, c, 2 * std::sqrt(A) * alpha, coeffs);
      break;
    default:
      normalize(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c,
                1 - alpha / A, coeffs);
      break;
  }
  return NT_OK;
}

int nt_biquad_design_webaudio(int type, double sample_rate, double frequency,
                              double q, double gain_db, double* coeffs) {
  if (!coeffs || !knownType(type) || !nt::kernels::validSampleRate(sample_rate)) return NT_ERR_ARGS;
  // Web Audio parameters are float32.
  const double nyquist = sample_rate / 2;
  frequency = std::clamp<double>(static_cast<float>(frequency), 0., nyquist);
  q = static_cast<float>(q);
  const double gain = static_cast<float>(gain_db);
  if (frequency == 0 || frequency == nyquist) {
    const bool top = frequency > 0;
    switch (type) {
      case NT_BIQUAD_LOWPASS: constant(top ? 1 : 0, coeffs); break;
      case NT_BIQUAD_HIGHPASS: constant(top ? 0 : 1, coeffs); break;
      case NT_BIQUAD_BANDPASS: constant(0, coeffs); break;
      case NT_BIQUAD_LOWSHELF: constant(top ? std::pow(10., gain / 20) : 1, coeffs); break;
      case NT_BIQUAD_HIGHSHELF: constant(top ? 1 : std::pow(10., gain / 20), coeffs); break;
      default: constant(1, coeffs); break;
    }
    return NT_OK;
  }
  if (q <= 0 && (type == NT_BIQUAD_BANDPASS || type == NT_BIQUAD_PEAKING)) {
    constant(type == NT_BIQUAD_BANDPASS ? 1 : std::pow(10., gain / 20), coeffs);
    return NT_OK;
  }
  const double w = 2 * kPi * frequency / sample_rate;
  const double c = std::cos(w);
  const double s = std::sin(w);
  const double A = std::pow(10., gain / 40.);
  switch (type) {
    case NT_BIQUAD_LOWPASS:
    case NT_BIQUAD_HIGHPASS: {
      const double alpha = s / (2 * std::pow(10., q / 20.));
      const bool low = type == NT_BIQUAD_LOWPASS;
      const double b0 = (1 + (low ? -c : c)) / 2;
      normalize(b0, low ? 1 - c : -(1 + c), b0, 1 + alpha, -2 * c, 1 - alpha, coeffs);
      break;
    }
    case NT_BIQUAD_BANDPASS: {
      const double alpha = s / (2 * std::max(q, 1e-12));
      normalize(alpha, 0, -alpha, 1 + alpha, -2 * c, 1 - alpha, coeffs);
      break;
    }
    case NT_BIQUAD_PEAKING: {
      const double alpha = s / (2 * std::max(q, 1e-12));
      normalize(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c,
                1 - alpha / A, coeffs);
      break;
    }
    default:
      shelf(type, A, c, 2 * std::sqrt(A) * s / std::sqrt(2.), coeffs);
      break;
  }
  return NT_OK;
}

void nt_biquad_process(const double* coeffs, double* state, const float* in,
                       float* out, size_t frames, uint32_t channels) {
  for (uint32_t ch = 0; ch < channels; ch++) {
    filterChannel(coeffs, state + ch * NT_BIQUAD_STATE_LEN, in + ch, out + ch,
                  frames, channels);
  }
}

int nt_vcf_process(double* state, int type, double sample_rate,
                   double cutoff_hz, double q, double cv_amount,
                   const float* cv, const float* in, float* out, size_t frames,
                   uint32_t channels) {
  if (type != NT_BIQUAD_LOWPASS && type != NT_BIQUAD_HIGHPASS) return NT_ERR_ARGS;
  if (!state || !in || !out || channels == 0 || !nt::kernels::validSampleRate(sample_rate)) return NT_ERR_ARGS;
  double coeffs[NT_BIQUAD_COEFFS_LEN];
  for (size_t block = 0; block < frames; block += NT_VCF_CONTROL_BLOCK) {
    const size_t length = std::min<size_t>(NT_VCF_CONTROL_BLOCK, frames - block);
    const double fc = cv ? cutoff_hz * std::pow(2, cv[block] * cv_amount) : cutoff_hz;
    nt_biquad_design_rbj(type, sample_rate, fc, q, 0, coeffs);
    const size_t offset = block * channels;
    nt_biquad_process(coeffs, state, in + offset, out + offset, length, channels);
  }
  return NT_OK;
}

}  // extern "C"
