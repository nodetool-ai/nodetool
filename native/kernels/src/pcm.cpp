// PCM sample codecs of the WAV reader and writer in
// packages/audio-nodes/src/lib/audio-wav.ts. The arithmetic is the
// DataView loop it replaced: the integer over the format's full scale in
// double, stored as float32. WAV data is little-endian, so the bytes are
// assembled explicitly and the result does not depend on the host's order.
#include "nodetool/kernels.h"

#include "js_math.h"

#include <cstring>

namespace {

using nt::kernels::f32;
using nt::kernels::jsRound;

int32_t s24(const uint8_t* p) {
  const int32_t v = p[0] | (p[1] << 8) | (p[2] << 16);
  return (v & 0x800000) ? v - 0x1000000 : v;
}

uint32_t u32le(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

}  // namespace

extern "C" {

size_t nt_pcm_sample_bytes(int format) {
  switch (format) {
    case NT_PCM_U8: return 1;
    case NT_PCM_S16: return 2;
    case NT_PCM_S24: return 3;
    case NT_PCM_S32:
    case NT_PCM_F32: return 4;
    default: return 0;
  }
}

int nt_pcm_decode(const uint8_t* in, float* out, size_t count, int format) {
  if (!in || !out || nt_pcm_sample_bytes(format) == 0) return NT_ERR_ARGS;
  switch (format) {
    case NT_PCM_U8:
      for (size_t i = 0; i < count; i++) out[i] = f32((in[i] - 128) / 128.0);
      break;
    case NT_PCM_S16:
      for (size_t i = 0; i < count; i++) {
        const auto v = static_cast<int16_t>(in[2 * i] | (in[2 * i + 1] << 8));
        out[i] = f32(v / 32767.0);
      }
      break;
    case NT_PCM_S24:
      for (size_t i = 0; i < count; i++) out[i] = f32(s24(in + 3 * i) / 8388607.0);
      break;
    case NT_PCM_S32:
      for (size_t i = 0; i < count; i++) {
        out[i] = f32(static_cast<int32_t>(u32le(in + 4 * i)) / 2147483647.0);
      }
      break;
    case NT_PCM_F32:
      for (size_t i = 0; i < count; i++) {
        uint32_t bits = u32le(in + 4 * i);
        // DataView.getFloat32 widens to a double, which quiets a signaling
        // NaN: it sets the quiet bit and keeps the payload.
        if ((bits & 0x7f800000) == 0x7f800000 && (bits & 0x007fffff) != 0) bits |= 0x00400000;
        std::memcpy(&out[i], &bits, sizeof bits);
      }
      break;
  }
  return NT_OK;
}

void nt_pcm16_encode(const float* in, uint8_t* out, size_t count) {
  for (size_t i = 0; i < count; i++) {
    const double x = in[i];
    // Math.max(-1, Math.min(1, NaN)) is NaN, and setInt16 stores NaN as 0.
    int v = 0;
    if (x == x) v = static_cast<int>(jsRound((x < -1 ? -1 : x > 1 ? 1 : x) * 32767));
    out[2 * i] = static_cast<uint8_t>(v & 0xff);
    out[2 * i + 1] = static_cast<uint8_t>((v >> 8) & 0xff);
  }
}

}  // extern "C"
