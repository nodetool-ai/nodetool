#include "audio/OutputLatency.h"

#if defined(__APPLE__)
#include <CoreAudio/CoreAudio.h>
#endif

namespace nt::audio {

#if defined(__APPLE__)
namespace {
template <typename T>
bool readProperty(AudioObjectID object, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope, T& out) {
    const AudioObjectPropertyAddress address{selector, scope, kAudioObjectPropertyElementMain};
    UInt32 size = sizeof(T);
    return AudioObjectGetPropertyData(object, &address, 0, nullptr, &size, &out) == noErr;
}
}  // namespace

OutputLatency queryCoreAudioOutputLatency(std::uint32_t deviceId) {
    OutputLatency r;
    const AudioObjectID device = deviceId;
    UInt32 latency = 0, safety = 0, buffer = 0;
    Float64 rate = 0.0;
    if (!readProperty(device, kAudioDevicePropertyLatency, kAudioObjectPropertyScopeOutput, latency) ||
        !readProperty(device, kAudioDevicePropertySafetyOffset, kAudioObjectPropertyScopeOutput, safety) ||
        !readProperty(device, kAudioDevicePropertyBufferFrameSize, kAudioObjectPropertyScopeOutput, buffer) ||
        !readProperty(device, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeOutput, rate) ||
        rate <= 0.0) {
        return r;
    }
    // The first output stream's own latency.
    UInt32 stream = 0;
    {
        const AudioObjectPropertyAddress address{kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput,
                                                 kAudioObjectPropertyElementMain};
        UInt32 size = 0;
        if (AudioObjectGetPropertyDataSize(device, &address, 0, nullptr, &size) == noErr && size >= sizeof(AudioStreamID)) {
            AudioStreamID first = 0;
            UInt32 one = sizeof(AudioStreamID);
            AudioStreamID ids[16];
            UInt32 bytes = size < sizeof(ids) ? size : static_cast<UInt32>(sizeof(ids));
            if (AudioObjectGetPropertyData(device, &address, 0, nullptr, &bytes, ids) == noErr && bytes >= one) {
                first = ids[0];
                readProperty(first, kAudioStreamPropertyLatency, kAudioObjectPropertyScopeGlobal, stream);
            }
        }
    }
    r.ok = true;
    r.deviceFrames = latency;
    r.safetyFrames = safety;
    r.streamFrames = stream;
    r.bufferFrames = buffer;
    r.deviceRate = rate;
    r.seconds = static_cast<double>(latency + safety + stream + buffer) / rate;
    return r;
}
#else
OutputLatency queryCoreAudioOutputLatency(std::uint32_t) {
    return {};
}
#endif

}  // namespace nt::audio
