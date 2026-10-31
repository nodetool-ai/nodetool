#pragma once

// Device listing and loopback capture for the live A/V check (PLAN M3
// exit 3, scripts/window-checks.sh). Listing opens no device. A loopback
// device (BlackHole, Loopback, Soundflower, or the name in
// NT_LOOPBACK_DEVICE) records what the system output plays when the user
// routes the output through it, for example with a Multi-Output Device.

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace nt::audio {

struct AudioDeviceList {
    std::vector<std::string> playback;
    std::vector<std::string> capture;
    std::string defaultPlayback;
    std::string loopback;  // the first capture device that is a loopback, or empty
};

AudioDeviceList listAudioDevices(std::string* error);

class LoopbackCapture {
public:
    LoopbackCapture();
    ~LoopbackCapture();
    // Records up to `seconds` of mono float at 48 kHz from the capture device
    // named `name`.
    bool start(const std::string& name, double seconds, std::string* error);
    void stop();
    // The recording, and for each capture callback its first frame and the
    // monotonic time at its start.
    std::vector<float> samples() const;
    std::vector<std::pair<std::int64_t, std::int64_t>> blocks() const;
    double sampleRate() const;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

}  // namespace nt::audio
