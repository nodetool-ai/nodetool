#pragma once

// A stereo or mono float32 playback device on miniaudio, with the null
// backend for automated checks (realtime design 14.4, F11). The device owns
// its miniaudio context and device and releases both in `close()` or in the
// destructor.
//
// Thread affinity: `open`, `start`, `close`, the accessors and
// `outputLatency` run on one control thread. The render callback runs on the
// device's realtime thread and must not lock, allocate or block. The
// notification callback runs on a miniaudio or backend thread. Both callbacks
// receive the `user` pointer of `Callbacks`, which must outlive the device:
// `close()` returns only after the device has stopped calling them.

#include "audio/OutputLatency.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <span>
#include <string>

namespace nt::audio {

class PlaybackDevice {
public:
    enum class Backend { Null, System };
    enum class Notification { Started, Stopped, Rerouted, Other };

    struct Config {
        Backend backend = Backend::Null;
        int sampleRate = 48000;  // 0: the device's own rate
        int periodFrames = 480;
        int channels = 2;
    };
    // The output buffer is not silenced before the render callback runs, so
    // the callback writes every one of `frames * channels` samples.
    struct Callbacks {
        void (*render)(void* user, float* interleaved, std::uint32_t frames) = nullptr;
        void (*notify)(void* user, Notification notification) = nullptr;
        void* user = nullptr;
    };
    // Picks an output device by name, or none for the default device. Called
    // once, on the control thread, inside `open`.
    using Selector = std::function<std::optional<std::size_t>(std::span<const std::string> names)>;

    // The device after `open` has not started. Returns null and sets `error`
    // when the context or the device cannot be created.
    static std::unique_ptr<PlaybackDevice> open(const Config& config, const Callbacks& callbacks,
                                                const Selector& select, std::string* error);

    ~PlaybackDevice();
    PlaybackDevice(const PlaybackDevice&) = delete;
    PlaybackDevice& operator=(const PlaybackDevice&) = delete;

    bool start();
    // Stops the device and releases it, then the context. Idempotent.
    void close();

    double sampleRate() const { return m_sampleRate; }
    int channels() const { return m_channels; }
    const std::string& backendName() const { return m_backendName; }
    const std::string& deviceName() const { return m_deviceName; }
    bool selectedDevice() const { return m_selectedDevice; }

    struct Latency {
        double seconds = 0.0;
        // Set on CoreAudio, where the facts come from the device properties.
        std::optional<OutputLatency> coreAudio;
    };
    // The output latency of D21 step 3: the CoreAudio facts when they can be
    // read, else the device buffer.
    Latency outputLatency() const;

private:
    struct Impl;
    // Restricts construction to `open`, while letting it use std::make_unique.
    struct Key {
        explicit Key() = default;
    };

public:
    PlaybackDevice(Key, std::unique_ptr<Impl> impl);

private:
    std::unique_ptr<Impl> m_impl;
    double m_sampleRate = 0.0;
    int m_channels = 0;
    std::string m_backendName;
    std::string m_deviceName;
    bool m_selectedDevice = false;
};

}  // namespace nt::audio
