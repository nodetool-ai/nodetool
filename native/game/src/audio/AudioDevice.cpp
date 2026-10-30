#include "Audio.h"
#include <algorithm>
#include <atomic>
#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DECODING
#define MA_NO_ENCODING
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_ENGINE
#include "miniaudio.h"
namespace nodetool::game {
struct AudioDevice::Impl {
  static constexpr std::size_t capacity = 262144;
  std::vector<float> ring = std::vector<float>(capacity);
  std::atomic<std::size_t> read{0}, write{0};
  std::atomic<bool> flush{false};
  ma_device device{};
  bool initialized = false;
  bool active = false;
  Backend backend = Backend::Null;
  std::uint32_t rate = 48000;
  std::string error;
  static void callback(ma_device *device, void *output, const void *,
                       ma_uint32 frames) {
    auto *state = static_cast<Impl *>(device->pUserData);
    auto *out = static_cast<float *>(output);
    if (state->flush.exchange(false, std::memory_order_acq_rel)) {
      state->read.store(state->write.load(std::memory_order_acquire),
                        std::memory_order_release);
      std::fill(out, out + frames * 2, 0.0f);
      return;
    }
    const auto r = state->read.load(std::memory_order_relaxed);
    const auto w = state->write.load(std::memory_order_acquire);
    const auto n = std::min<std::size_t>(frames * 2, w - r);
    for (std::size_t i = 0; i < n; ++i) {
      out[i] = state->ring[(r + i) % capacity];
    }
    std::fill(out + n, out + frames * 2, 0.0f);
    state->read.store(r + n, std::memory_order_release);
  }
  ~Impl() {
    if (initialized) {
      ma_device_uninit(&device);
    }
  }
};
AudioDevice::AudioDevice(Backend backend, std::uint32_t rate)
    : impl_(std::make_unique<Impl>()) {
  impl_->backend = backend;
  impl_->rate = rate;
  if (rate < 8000 || rate > 192000) {
    impl_->error = "Invalid sample rate";
    return;
  }
  if (backend == Backend::Null) {
    impl_->active = true;
    return;
  }
  auto config = ma_device_config_init(ma_device_type_playback);
  config.playback.format = ma_format_f32;
  config.playback.channels = 2;
  config.sampleRate = rate;
  config.dataCallback = &Impl::callback;
  config.pUserData = impl_.get();
  const auto result = ma_device_init(nullptr, &config, &impl_->device);
  if (result != MA_SUCCESS) {
    impl_->error = "Audio output unavailable: " + std::to_string(result);
    return;
  }
  impl_->initialized = true;
  const auto started = ma_device_start(&impl_->device);
  if (started != MA_SUCCESS) {
    impl_->error = "Audio output start failed: " + std::to_string(started);
    return;
  }
  impl_->active = true;
}
AudioDevice::~AudioDevice() = default;
std::size_t AudioDevice::submit(std::span<const float> stereo) {
  if (stereo.size() % 2) {
    return 0;
  }
  if (!impl_->active || impl_->flush.load(std::memory_order_acquire)) {
    return 0;
  }
  if (impl_->backend == Backend::Null) {
    return stereo.size() / 2;
  }
  const auto w = impl_->write.load(std::memory_order_relaxed),
             r = impl_->read.load(std::memory_order_acquire);
  const auto n =
      std::min(stereo.size(), Impl::capacity - (w - r)) & ~std::size_t(1);
  for (std::size_t i = 0; i < n; ++i) {
    impl_->ring[(w + i) % Impl::capacity] = stereo[i];
  }
  impl_->write.store(w + n, std::memory_order_release);
  return n / 2;
}
void AudioDevice::clear() {
  if (impl_->backend == Backend::System) {
    impl_->flush.store(true, std::memory_order_release);
  }
}
nlohmann::json AudioDevice::diagnostic() const {
  return {{"available", impl_->active},
          {"backend", impl_->backend == Backend::Null ? "null" : "system"},
          {"sampleRate", impl_->rate},
          {"error", impl_->error}};
}
} // namespace nodetool::game
