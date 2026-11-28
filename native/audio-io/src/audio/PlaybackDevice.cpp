#include "audio/PlaybackDevice.h"

#include "miniaudio.h"

#include <algorithm>
#include <utility>
#include <vector>

namespace nt::audio {

// Owns the miniaudio context and device. Both are self-referential C structs,
// so Impl stays at one heap address. The destructor releases the device, then
// the context.
struct PlaybackDevice::Impl {
    ma_context context{};
    ma_device device{};
    bool contextReady = false;
    bool deviceReady = false;
    Callbacks callbacks;

    Impl() = default;
    Impl(const Impl&) = delete;
    Impl& operator=(const Impl&) = delete;
    ~Impl() { close(); }

    void close() {
        // ma_device_uninit stops the device and waits for its callbacks.
        if (deviceReady) {
            ma_device_uninit(&device);
            deviceReady = false;
        }
        if (contextReady) {
            ma_context_uninit(&context);
            contextReady = false;
        }
    }

    static void dataCallback(ma_device* dev, void* output, const void*, ma_uint32 frames) {
        const auto& callbacks = static_cast<Impl*>(dev->pUserData)->callbacks;
        callbacks.render(callbacks.user, static_cast<float*>(output), frames);
    }

    static void notificationCallback(const ma_device_notification* notification) {
        const auto& callbacks = static_cast<Impl*>(notification->pDevice->pUserData)->callbacks;
        if (!callbacks.notify) return;
        Notification kind = Notification::Other;
        switch (notification->type) {
            case ma_device_notification_type_started: kind = Notification::Started; break;
            case ma_device_notification_type_stopped: kind = Notification::Stopped; break;
            case ma_device_notification_type_rerouted: kind = Notification::Rerouted; break;
            default: break;
        }
        callbacks.notify(callbacks.user, kind);
    }
};

PlaybackDevice::PlaybackDevice(Key, std::unique_ptr<Impl> impl) : m_impl(std::move(impl)) {}

PlaybackDevice::~PlaybackDevice() = default;

std::unique_ptr<PlaybackDevice> PlaybackDevice::open(const Config& config, const Callbacks& callbacks,
                                                     const Selector& select, std::string* error) {
    const auto fail = [error](const char* why) {
        if (error) *error = why;
        return std::unique_ptr<PlaybackDevice>{};
    };
    if (!callbacks.render || config.channels < 1 || config.channels > 2) return fail("invalid playback device configuration");
    auto impl = std::make_unique<Impl>();
    impl->callbacks = callbacks;
    ma_backend nullBackend[] = {ma_backend_null};
    const ma_result context = config.backend == Backend::Null ? ma_context_init(nullBackend, 1, nullptr, &impl->context)
                                                              : ma_context_init(nullptr, 0, nullptr, &impl->context);
    if (context != MA_SUCCESS) return fail("cannot create the audio context");
    impl->contextReady = true;

    ma_device_config device = ma_device_config_init(ma_device_type_playback);
    device.playback.format = ma_format_f32;
    device.playback.channels = static_cast<ma_uint32>(config.channels);
    device.sampleRate = static_cast<ma_uint32>(std::max(0, config.sampleRate));
    device.periodSizeInFrames = static_cast<ma_uint32>(std::max(64, config.periodFrames));
    device.dataCallback = &Impl::dataCallback;
    device.notificationCallback = &Impl::notificationCallback;
    device.pUserData = impl.get();
    device.noPreSilencedOutputBuffer = MA_TRUE;
    device.noClip = MA_TRUE;
    bool selected = false;
    ma_device_info* playbackDevices = nullptr;
    ma_uint32 playbackCount = 0;
    if (select && ma_context_get_devices(&impl->context, &playbackDevices, &playbackCount, nullptr, nullptr) == MA_SUCCESS) {
        std::vector<std::string> names;
        names.reserve(playbackCount);
        for (ma_uint32 i = 0; i < playbackCount; ++i) names.emplace_back(playbackDevices[i].name);
        if (const auto chosen = select(names); chosen && *chosen < names.size()) {
            device.playback.pDeviceID = &playbackDevices[*chosen].id;
            selected = true;
        }
    }
    if (ma_device_init(&impl->context, &device, &impl->device) != MA_SUCCESS) return fail("cannot open the audio device");
    impl->deviceReady = true;

    auto result = std::make_unique<PlaybackDevice>(Key{}, std::move(impl));
    const Impl& d = *result->m_impl;
    result->m_sampleRate = static_cast<double>(d.device.sampleRate);
    result->m_channels = static_cast<int>(d.device.playback.channels);
    result->m_backendName = ma_get_backend_name(d.context.backend);
    result->m_deviceName = d.device.playback.name;
    result->m_selectedDevice = selected;
    return result;
}

bool PlaybackDevice::start() {
    return m_impl->deviceReady && ma_device_start(&m_impl->device) == MA_SUCCESS;
}

void PlaybackDevice::close() {
    m_impl->close();
}

PlaybackDevice::Latency PlaybackDevice::outputLatency() const {
    const Impl& d = *m_impl;
    Latency latency;
    if (!d.deviceReady || m_sampleRate <= 0.0) return latency;
#if defined(MA_SUPPORT_COREAUDIO)
    if (d.device.pContext->backend == ma_backend_coreaudio) {
        latency.coreAudio = queryCoreAudioOutputLatency(d.device.coreaudio.deviceObjectIDPlayback);
        if (latency.coreAudio->ok) {
            latency.seconds = latency.coreAudio->seconds;
            return latency;
        }
    }
#endif
    // Elsewhere: the device buffer.
    latency.seconds = static_cast<double>(d.device.playback.internalPeriodSizeInFrames * d.device.playback.internalPeriods) /
                      m_sampleRate;
    return latency;
}

}  // namespace nt::audio
