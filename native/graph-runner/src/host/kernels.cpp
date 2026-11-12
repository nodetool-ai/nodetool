// Capability "kernels": the native half of @nodetool-ai/kernels
// (packages/kernels/src/index.ts, nativeKernelBackend). It runs the
// functions of native/kernels (nodetool/kernels.h) on the worker thread, so
// a node's sample and pixel loops run as native code inside the runner.
//
//   call(name, args, modes, outputs) -> number
//     name     a function of nodetool/kernels.h
//     args     its arguments in declaration order
//     modes    one letter per argument: n number, z null, i input bytes,
//              o output bytes, x input and output bytes
//     outputs  an empty array. It receives a Uint8Array for each o and x
//              argument, in argument order.
//   The result is the function's return value, or 0 for a void function.
//
// The guest is not trusted to size its buffers. Each kernel has an adapter
// that checks every buffer against the elements the kernel reads or writes,
// and every integer argument against its C type, before it calls the kernel.
// A mismatch throws. Buffers are copied in and out: a guest array cannot be
// written in place (Engine::viewBytes is read-only).
#include "host/capabilities.h"
#include "nodetool/kernels.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <variant>
#include <vector>

namespace gr::host {

namespace {

using Args = const std::vector<js::Value>&;

// The largest integer a double holds exactly, which bounds every count.
constexpr double kMaxSafeInteger = 9007199254740991.0;

// a * b, or a throw when the product does not fit size_t.
size_t product(size_t a, size_t b) {
  if (b != 0 && a > std::numeric_limits<size_t>::max() / b) {
    throw std::runtime_error("kernels.call: a buffer size overflows");
  }
  return a * b;
}

// One kernel call: the arguments read from the guest, a copy of each
// buffer, and the outputs to return.
//
// Thread affinity: the runner's worker thread. One exists for each call()
// and is destroyed when it returns. It holds js::Values, so it never
// outlives the engine.
class KernelCall {
 public:
  KernelCall(js::Engine& engine, Args a) : engine_(engine) {
    if (a.size() < 4 || !engine.isString(a[0]) || !engine.isObject(a[1]) ||
        !engine.isString(a[2]) || !engine.isObject(a[3])) {
      throw std::runtime_error("kernels.call: expected (name, args, modes, outputs)");
    }
    name_ = engine.toString(a[0]);
    modes_ = engine.toString(a[2]);
    outputs_ = a[3];
    if (modes_.size() > kMaxArgs) throw std::runtime_error("kernels.call: too many arguments");
    // Every guest read happens here, before any byte view is taken: a
    // getter on `args` may run JavaScript, which would end a view's life.
    const js::Value args = a[1];
    for (size_t i = 0; i < modes_.size(); i++) values_.push_back(engine.get(args, std::to_string(i)));
    slots_.resize(modes_.size());
  }

  const std::string& name() const { return name_; }

  // Throws unless the call has exactly `count` arguments.
  void arity(size_t count) const {
    if (modes_.size() != count) {
      throw std::runtime_error("kernels.call: " + name_ + " takes " + std::to_string(count) +
                               " arguments, got " + std::to_string(modes_.size()));
    }
  }

  double number(size_t i) {
    expect(i, 'n');
    return engine_.toNumber(values_[i]);
  }

  // An integer argument in [lo, hi]. A double outside it cannot be cast
  // without UB, so it throws.
  double integer(size_t i, double lo, double hi) {
    const double value = number(i);
    if (!(value >= lo && value <= hi) || std::floor(value) != value) {
      throw std::runtime_error("kernels.call: argument " + std::to_string(i) + " of " + name_ +
                               " must be an integer in its C type's range");
    }
    return value;
  }
  uint32_t u32(size_t i) { return static_cast<uint32_t>(integer(i, 0, 4294967295.0)); }
  int i32(size_t i) { return static_cast<int>(integer(i, -2147483648.0, 2147483647.0)); }
  size_t count(size_t i) {
    const double max = std::min(kMaxSafeInteger, static_cast<double>(std::numeric_limits<size_t>::max()));
    return static_cast<size_t>(integer(i, 0, max));
  }

  // A buffer the kernel reads `n` elements of.
  template <typename T>
  const T* in(size_t i, size_t n) {
    expect(i, 'i');
    return copyIn<T>(i, n);
  }

  // As `in`, or null when the argument is null.
  template <typename T>
  const T* optionalIn(size_t i, size_t n) {
    if (i < modes_.size() && modes_[i] == 'z') {
      if (!engine_.isNull(values_[i])) throw std::runtime_error("kernels.call: mode z needs null");
      return nullptr;
    }
    return in<T>(i, n);
  }

  // A buffer the kernel writes `n` elements of, returned to the guest.
  template <typename T>
  T* out(size_t i, size_t n) {
    expect(i, 'o');
    checkSize(i, product(n, sizeof(T)));
    return storage<T>(i, n);
  }

  // A buffer the kernel reads and writes `n` elements of.
  template <typename T>
  T* inout(size_t i, size_t n) {
    expect(i, 'x');
    return copyIn<T>(i, n);
  }

  // Appends each o and x buffer to the guest's outputs array.
  void returnOutputs() {
    size_t next = 0;
    for (size_t i = 0; i < modes_.size(); i++) {
      if (modes_[i] != 'o' && modes_[i] != 'x') continue;
      const auto [data, size] = bytesOf(slots_[i]);
      engine_.set(outputs_, std::to_string(next++), engine_.bytes(data, size));
    }
  }

 private:
  static constexpr size_t kMaxArgs = 16;

  // A typed copy of one buffer argument. It holds at least one element, so
  // an empty buffer still passes a valid pointer, as the WebAssembly host
  // does.
  struct Slot {
    std::variant<std::monostate, std::vector<uint8_t>, std::vector<float>, std::vector<double>> data;
    size_t bytes = 0;
  };

  void expect(size_t i, char mode) const {
    if (i >= modes_.size() || modes_[i] != mode) {
      throw std::runtime_error("kernels.call: argument " + std::to_string(i) + " of " + name_ +
                               " must have mode " + std::string(1, mode));
    }
    const js::Value& v = values_[i];
    const bool ok = mode == 'n' ? engine_.isNumber(v) : engine_.isBytes(v);
    if (!ok) {
      throw std::runtime_error("kernels.call: argument " + std::to_string(i) + " of " + name_ +
                               (mode == 'n' ? " must be a number" : " must be a typed array"));
    }
  }

  // Throws unless the guest buffer holds at least `bytes` bytes.
  std::span<const uint8_t> checkSize(size_t i, size_t bytes) {
    const auto view = engine_.viewBytes(values_[i]);
    if (view.size() < bytes) {
      throw std::runtime_error("kernels.call: argument " + std::to_string(i) + " of " + name_ +
                               " holds " + std::to_string(view.size()) + " bytes, " +
                               std::to_string(bytes) + " required");
    }
    return view;
  }

  template <typename T>
  T* storage(size_t i, size_t n) {
    auto& vec = slots_[i].data.template emplace<std::vector<T>>(std::max<size_t>(1, n));
    slots_[i].bytes = n * sizeof(T);
    return vec.data();
  }

  template <typename T>
  T* copyIn(size_t i, size_t n) {
    const size_t bytes = product(n, sizeof(T));
    const auto view = checkSize(i, bytes);
    T* data = storage<T>(i, n);
    if (bytes) std::memcpy(data, view.data(), bytes);
    return data;
  }

  static std::pair<const uint8_t*, size_t> bytesOf(const Slot& slot) {
    return std::visit(
        [&](const auto& vec) -> std::pair<const uint8_t*, size_t> {
          if constexpr (std::is_same_v<std::decay_t<decltype(vec)>, std::monostate>) {
            return {nullptr, 0};
          } else {
            return {reinterpret_cast<const uint8_t*>(vec.data()), slot.bytes};
          }
        },
        slot.data);
  }

  js::Engine& engine_;
  std::string name_;
  std::string modes_;
  js::Value outputs_;
  std::vector<js::Value> values_;
  std::vector<Slot> slots_;
};

using Adapter = double (*)(KernelCall&);

// RGBA8 bytes of a width x height image.
size_t rgbaBytes(uint32_t width, uint32_t height) { return product(product(width, height), 4); }

double imageAutoContrast(KernelCall& c) {
  c.arity(5);
  const uint32_t w = c.u32(2), h = c.u32(3);
  const size_t n = rgbaBytes(w, h);
  return nt_image_auto_contrast(c.in<uint8_t>(0, n), c.out<uint8_t>(1, n), w, h, c.number(4));
}

double imageEqualize(KernelCall& c) {
  c.arity(4);
  const uint32_t w = c.u32(2), h = c.u32(3);
  const size_t n = rgbaBytes(w, h);
  return nt_image_equalize(c.in<uint8_t>(0, n), c.out<uint8_t>(1, n), w, h);
}

double imageAdaptiveContrast(KernelCall& c) {
  c.arity(6);
  const uint32_t w = c.u32(2), h = c.u32(3);
  const size_t n = rgbaBytes(w, h);
  return nt_image_adaptive_contrast(c.in<uint8_t>(0, n), c.out<uint8_t>(1, n), w, h, c.number(4), c.u32(5));
}

double imageRankFilter(KernelCall& c) {
  c.arity(6);
  const uint32_t w = c.u32(2), h = c.u32(3);
  const size_t n = rgbaBytes(w, h);
  return nt_image_rank_filter(c.in<uint8_t>(0, n), c.out<uint8_t>(1, n), w, h, c.u32(4), c.u32(5));
}

double signalScaleOffset(KernelCall& c) {
  c.arity(5);
  const size_t n = c.count(2);
  nt_signal_scale_offset(c.in<float>(0, n), c.out<float>(1, n), n, c.number(3), c.number(4));
  return 0;
}

double signalMixAdd(KernelCall& c) {
  c.arity(4);
  const size_t n = c.count(2);
  nt_signal_mix_add(c.inout<float>(0, n), c.in<float>(1, n), n, c.number(3));
  return 0;
}

double signalExtractChannel(KernelCall& c) {
  c.arity(5);
  const size_t frames = c.count(2);
  const uint32_t channels = c.u32(3);
  return nt_signal_extract_channel(c.in<float>(0, product(frames, channels)), c.out<float>(1, frames),
                                   frames, channels, c.u32(4));
}

double pcmSampleBytes(KernelCall& c) {
  c.arity(1);
  return static_cast<double>(nt_pcm_sample_bytes(c.i32(0)));
}

double pcmDecode(KernelCall& c) {
  c.arity(4);
  const size_t n = c.count(2);
  const int format = c.i32(3);
  // An unknown format has 0 bytes a sample; the kernel then refuses it.
  return nt_pcm_decode(c.in<uint8_t>(0, product(n, nt_pcm_sample_bytes(format))), c.out<float>(1, n), n,
                       format);
}

double pcm16Encode(KernelCall& c) {
  c.arity(3);
  const size_t n = c.count(2);
  nt_pcm16_encode(c.in<float>(0, n), c.out<uint8_t>(1, product(n, 2)), n);
  return 0;
}

// The interleaved input and output of an effect: arguments 0 and 1, with
// frames and channels at 2 and 3.
struct Effect {
  const float* in;
  float* out;
  size_t frames;
  uint32_t channels;
};

Effect effect(KernelCall& c) {
  const size_t frames = c.count(2);
  const uint32_t channels = c.u32(3);
  const size_t n = product(frames, channels);
  return {c.in<float>(0, n), c.out<float>(1, n), frames, channels};
}

double audioBitcrush(KernelCall& c) {
  c.arity(6);
  const Effect e = effect(c);
  return nt_audio_bitcrush(e.in, e.out, e.frames, e.channels, c.number(4), c.u32(5));
}

double audioCompress(KernelCall& c) {
  c.arity(10);
  const Effect e = effect(c);
  return nt_audio_compress(e.in, e.out, e.frames, e.channels, c.number(4), c.number(5), c.number(6),
                           c.number(7), c.number(8), c.i32(9));
}

double audioDistortion(KernelCall& c) {
  c.arity(4);
  const size_t n = c.count(2);
  nt_audio_distortion(c.in<float>(0, n), c.out<float>(1, n), n, c.number(3));
  return 0;
}

double audioLimiter(KernelCall& c) {
  c.arity(8);
  const Effect e = effect(c);
  return nt_audio_limiter(e.in, e.out, e.frames, e.channels, c.number(4), c.number(5), c.number(6), c.i32(7));
}

double audioReverb(KernelCall& c) {
  c.arity(9);
  const Effect e = effect(c);
  return nt_audio_reverb(e.in, e.out, e.frames, e.channels, c.number(4), c.number(5), c.number(6),
                         c.number(7), c.number(8));
}

double audioNoiseGate(KernelCall& c) {
  c.arity(8);
  const Effect e = effect(c);
  return nt_audio_noise_gate(e.in, e.out, e.frames, e.channels, c.number(4), c.number(5), c.number(6),
                             c.number(7));
}

double audioPhaser(KernelCall& c) {
  c.arity(10);
  const Effect e = effect(c);
  return nt_audio_phaser(e.in, e.out, e.frames, e.channels, c.number(4), c.number(5), c.number(6),
                         c.number(7), c.number(8), c.number(9));
}

double audioDelayOutputFrames(KernelCall& c) {
  c.arity(3);
  return static_cast<double>(nt_audio_delay_output_frames(c.count(0), c.number(1), c.number(2)));
}

double audioDelay(KernelCall& c) {
  c.arity(8);
  const size_t frames = c.count(2);
  const uint32_t channels = c.u32(3);
  const double rate = c.number(4), seconds = c.number(5);
  const float* in = c.in<float>(0, product(frames, channels));
  const size_t outFrames = nt_audio_delay_output_frames(frames, rate, seconds);
  return nt_audio_delay(in, c.out<float>(1, product(outFrames, channels)), frames, channels, rate, seconds,
                        c.number(6), c.number(7));
}

template <int (*Design)(int, double, double, double, double, double*)>
double biquadDesign(KernelCall& c) {
  c.arity(6);
  return Design(c.i32(0), c.number(1), c.number(2), c.number(3), c.number(4),
                c.out<double>(5, NT_BIQUAD_COEFFS_LEN));
}

double biquadProcess(KernelCall& c) {
  c.arity(6);
  const size_t frames = c.count(4);
  const uint32_t channels = c.u32(5);
  const size_t n = product(frames, channels);
  nt_biquad_process(c.in<double>(0, NT_BIQUAD_COEFFS_LEN),
                    c.inout<double>(1, product(NT_BIQUAD_STATE_LEN, channels)), c.in<float>(2, n),
                    c.out<float>(3, n), frames, channels);
  return 0;
}

double vcfProcess(KernelCall& c) {
  c.arity(11);
  const size_t frames = c.count(9);
  const uint32_t channels = c.u32(10);
  const size_t n = product(frames, channels);
  return nt_vcf_process(c.inout<double>(0, product(NT_BIQUAD_STATE_LEN, channels)), c.i32(1), c.number(2),
                        c.number(3), c.number(4), c.number(5), c.optionalIn<float>(6, frames),
                        c.in<float>(7, n), c.out<float>(8, n), frames, channels);
}

double oscProcess(KernelCall& c) {
  c.arity(11);
  const size_t n = c.count(10);
  nt_osc_process(c.inout<double>(0, NT_OSC_STATE_LEN), c.i32(1), c.number(2), c.number(3), c.number(4),
                 c.number(5), c.number(6), c.optionalIn<float>(7, n), c.optionalIn<float>(8, n),
                 c.out<float>(9, n), n);
  return 0;
}

double lfoProcess(KernelCall& c) {
  c.arity(9);
  const size_t n = c.count(8);
  nt_lfo_process(c.inout<double>(0, NT_LFO_STATE_LEN), c.i32(1), c.number(2), c.number(3), c.number(4),
                 c.number(5), c.optionalIn<float>(6, n), c.out<float>(7, n), n);
  return 0;
}

double adsrProcess(KernelCall& c) {
  c.arity(9);
  const size_t n = c.count(8);
  nt_adsr_process(c.inout<double>(0, NT_ADSR_STATE_LEN), c.number(1), c.number(2), c.number(3),
                  c.number(4), c.number(5), c.in<float>(6, n), c.out<float>(7, n), n);
  return 0;
}

double gateProcess(KernelCall& c) {
  c.arity(7);
  const size_t n = c.count(6);
  nt_gate_process(c.number(0), c.number(1), c.number(2), c.number(3), c.number(4), c.out<float>(5, n), n);
  return 0;
}

double vcaProcess(KernelCall& c) {
  c.arity(6);
  const size_t frames = c.count(3);
  const uint32_t channels = c.u32(4);
  const size_t n = product(frames, channels);
  nt_vca_process(c.in<float>(0, n), c.optionalIn<float>(1, frames), c.out<float>(2, n), frames, channels,
                 c.number(5));
  return 0;
}

double sampleHoldProcess(KernelCall& c) {
  c.arity(5);
  const size_t n = c.count(4);
  nt_sample_hold_process(c.inout<double>(0, NT_SAMPLE_HOLD_STATE_LEN), c.in<float>(1, n),
                         c.optionalIn<float>(2, n), c.out<float>(3, n), n);
  return 0;
}

// Every function of kernels.h. Immutable after its first use.
const std::unordered_map<std::string_view, Adapter>& adapters() {
  static const std::unordered_map<std::string_view, Adapter> table = {
      {"nt_image_auto_contrast", imageAutoContrast},
      {"nt_image_equalize", imageEqualize},
      {"nt_image_adaptive_contrast", imageAdaptiveContrast},
      {"nt_image_rank_filter", imageRankFilter},
      {"nt_signal_scale_offset", signalScaleOffset},
      {"nt_signal_mix_add", signalMixAdd},
      {"nt_signal_extract_channel", signalExtractChannel},
      {"nt_pcm_sample_bytes", pcmSampleBytes},
      {"nt_pcm_decode", pcmDecode},
      {"nt_pcm16_encode", pcm16Encode},
      {"nt_audio_bitcrush", audioBitcrush},
      {"nt_audio_compress", audioCompress},
      {"nt_audio_distortion", audioDistortion},
      {"nt_audio_limiter", audioLimiter},
      {"nt_audio_reverb", audioReverb},
      {"nt_audio_noise_gate", audioNoiseGate},
      {"nt_audio_phaser", audioPhaser},
      {"nt_audio_delay_output_frames", audioDelayOutputFrames},
      {"nt_audio_delay", audioDelay},
      {"nt_biquad_design_rbj", biquadDesign<nt_biquad_design_rbj>},
      {"nt_biquad_design_webaudio", biquadDesign<nt_biquad_design_webaudio>},
      {"nt_biquad_process", biquadProcess},
      {"nt_vcf_process", vcfProcess},
      {"nt_osc_process", oscProcess},
      {"nt_lfo_process", lfoProcess},
      {"nt_adsr_process", adsrProcess},
      {"nt_gate_process", gateProcess},
      {"nt_vca_process", vcaProcess},
      {"nt_sample_hold_process", sampleHoldProcess},
  };
  return table;
}

}  // namespace

void installKernels(js::Engine& engine, const js::Value& object, const HostOptions&) {
  engine.set(object, "call", engine.function("call", 4, [](js::Engine& e, Args a) {
    KernelCall call(e, a);
    const auto& table = adapters();
    const auto it = table.find(call.name());
    if (it == table.end()) throw std::runtime_error("kernels.call: no kernel " + call.name());
    const double result = it->second(call);
    call.returnOutputs();
    return e.number(result);
  }));
}

}  // namespace gr::host
