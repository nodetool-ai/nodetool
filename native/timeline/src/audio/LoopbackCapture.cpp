#include "audio/LoopbackCapture.h"

#include "miniaudio.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>

namespace nt::audio {
namespace {

std::int64_t steadyNowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

bool isLoopbackName(const std::string& name) {
    if (const char* wanted = std::getenv("NT_LOOPBACK_DEVICE"); wanted && *wanted) {
        return name.find(wanted) != std::string::npos;
    }
    for (const char* key : {"BlackHole", "Loopback", "Soundflower"}) {
        if (name.find(key) != std::string::npos) return true;
    }
    return false;
}

}  // namespace

AudioDeviceList listAudioDevices(std::string* error) {
    AudioDeviceList list;
    ma_context context;
    if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
        if (error) *error = "cannot create the audio context";
        return list;
    }
    ma_device_info* playback = nullptr;
    ma_device_info* capture = nullptr;
    ma_uint32 playbackCount = 0, captureCount = 0;
    if (ma_context_get_devices(&context, &playback, &playbackCount, &capture, &captureCount) == MA_SUCCESS) {
        for (ma_uint32 i = 0; i < playbackCount; ++i) {
            list.playback.emplace_back(playback[i].name);
            if (playback[i].isDefault) list.defaultPlayback = playback[i].name;
        }
        for (ma_uint32 i = 0; i < captureCount; ++i) {
            list.capture.emplace_back(capture[i].name);
            if (list.loopback.empty() && isLoopbackName(capture[i].name)) list.loopback = capture[i].name;
        }
    } else if (error) {
        *error = "cannot list the audio devices";
    }
    ma_context_uninit(&context);
    return list;
}

struct LoopbackCapture::Impl {
    ma_context context{};
    ma_device device{};
    bool contextReady = false;
    bool deviceReady = false;
    std::vector<float> samples;
    std::vector<std::pair<std::int64_t, std::int64_t>> blocks;
    std::atomic<std::int64_t> frames{0};
    std::atomic<std::size_t> blockCount{0};

    static void callback(ma_device* dev, void*, const void* input, ma_uint32 count) {
        auto* self = static_cast<Impl*>(dev->pUserData);
        const std::int64_t at = self->frames.load(std::memory_order_relaxed);
        const std::size_t b = self->blockCount.load(std::memory_order_relaxed);
        if (b < self->blocks.size()) {
            self->blocks[b] = {at, steadyNowNs()};
            self->blockCount.store(b + 1, std::memory_order_release);
        }
        const auto cap = static_cast<std::int64_t>(self->samples.size());
        const std::int64_t n = std::min<std::int64_t>(count, std::max<std::int64_t>(0, cap - at));
        if (n > 0) std::memcpy(self->samples.data() + at, input, static_cast<std::size_t>(n) * sizeof(float));
        self->frames.store(at + count, std::memory_order_release);
    }
};

LoopbackCapture::LoopbackCapture() : m_impl(std::make_unique<Impl>()) {}

LoopbackCapture::~LoopbackCapture() {
    stop();
}

bool LoopbackCapture::start(const std::string& name, double seconds, std::string* error) {
    Impl& d = *m_impl;
    if (ma_context_init(nullptr, 0, nullptr, &d.context) != MA_SUCCESS) {
        if (error) *error = "cannot create the audio context";
        return false;
    }
    d.contextReady = true;
    ma_device_info* playback = nullptr;
    ma_device_info* capture = nullptr;
    ma_uint32 playbackCount = 0, captureCount = 0;
    const ma_device_id* id = nullptr;
    if (ma_context_get_devices(&d.context, &playback, &playbackCount, &capture, &captureCount) == MA_SUCCESS) {
        for (ma_uint32 i = 0; i < captureCount; ++i) {
            if (name == capture[i].name) id = &capture[i].id;
        }
    }
    if (!id) {
        if (error) *error = "no capture device named " + name;
        return false;
    }
    d.samples.assign(static_cast<std::size_t>(seconds * 48000.0), 0.0f);
    d.blocks.assign(static_cast<std::size_t>(seconds * 1000.0) + 64, {0, 0});
    ma_device_config config = ma_device_config_init(ma_device_type_capture);
    config.capture.pDeviceID = id;
    config.capture.format = ma_format_f32;
    config.capture.channels = 1;
    config.sampleRate = 48000;
    config.dataCallback = &Impl::callback;
    config.pUserData = &d;
    if (ma_device_init(&d.context, &config, &d.device) != MA_SUCCESS) {
        if (error) *error = "cannot open the capture device";
        return false;
    }
    d.deviceReady = true;
    if (ma_device_start(&d.device) != MA_SUCCESS) {
        if (error) *error = "cannot start the capture device";
        return false;
    }
    return true;
}

void LoopbackCapture::stop() {
    Impl& d = *m_impl;
    if (d.deviceReady) {
        ma_device_uninit(&d.device);
        d.deviceReady = false;
    }
    if (d.contextReady) {
        ma_context_uninit(&d.context);
        d.contextReady = false;
    }
}

std::vector<float> LoopbackCapture::samples() const {
    const auto n = std::min<std::int64_t>(m_impl->frames.load(), static_cast<std::int64_t>(m_impl->samples.size()));
    return {m_impl->samples.begin(), m_impl->samples.begin() + n};
}

std::vector<std::pair<std::int64_t, std::int64_t>> LoopbackCapture::blocks() const {
    const std::size_t n = m_impl->blockCount.load();
    return {m_impl->blocks.begin(), m_impl->blocks.begin() + static_cast<std::ptrdiff_t>(n)};
}

double LoopbackCapture::sampleRate() const {
    return 48000.0;
}

}  // namespace nt::audio
