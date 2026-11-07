#pragma once

// The output latency of a playback device (DESIGN.md D21 step 3): the time
// from the start of a buffer the callback renders to the moment its first
// frame is heard. On CoreAudio: the device latency, the safety offset and
// the stream latency of the output scope, plus the device buffer size.

#include <cstdint>

namespace nt::audio {

struct OutputLatency {
    bool ok = false;
    double seconds = 0.0;
    std::uint32_t deviceFrames = 0;
    std::uint32_t safetyFrames = 0;
    std::uint32_t streamFrames = 0;
    std::uint32_t bufferFrames = 0;
    double deviceRate = 0.0;
};

// `deviceId` is a CoreAudio AudioObjectID. Returns ok = false elsewhere or
// when a property cannot be read.
OutputLatency queryCoreAudioOutputLatency(std::uint32_t deviceId);

}  // namespace nt::audio
