#pragma once

// Audio playback on miniaudio (DESIGN.md D21 to D26). Three threads:
//   - the device callback (real time) mixes the PCM rings with `mixBlock`
//     and runs the callback half of the audio-master clock
//     (`CallbackClockDriver`). It never locks, allocates or decodes.
//   - the audio decode worker turns each seek command into a session: one
//     PCM ring per clip near the play position, filled from an
//     `AudioSource`, and keeps the rings full while the clips play.
//   - the caller (GUI thread) starts and stops the device and hands in
//     timeline snapshots.
// PlaybackClock talks to the engine only through `feed()`.
//
// The null backend renders in real time to no device at all: every
// automated check uses it, so no test makes a sound. The system backend is
// the default output device and is used only by the interactive app and by
// scripts/window-checks.sh.

#include "audio/Mixer.h"
#include "audio/OutputLatency.h"
#include "model/TimelineTypes.h"
#include "playback/AudioClockFeed.h"

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace nt::audio {

class AudioEngine {
public:
    enum class Backend { Null, System };
    struct Options {
        Backend backend = Backend::Null;
        int sampleRate = 48000;  // 0: the device's own rate (system backend)
        int periodFrames = 480;
        // Null backend: the output latency the device reports, so the clock
        // arithmetic of D21 step 2 runs with a non-zero latency.
        double simulatedLatencySec = 0.0;
        // Keep this many seconds of the device output, from the first
        // callback on (null backend checks).
        double recordSeconds = 0.0;
    };
    struct Stats {
        std::int64_t callbacks = 0;
        std::int64_t framesRendered = 0;
        // Blocks in which a playing voice needed PCM its ring did not hold.
        std::int64_t underruns = 0;
        // Blocks of silence while a play or seek waited for its PCM.
        std::int64_t waitBlocks = 0;
        // Frames the callback mixed while playing: the played length.
        std::int64_t playedFrames = 0;
        // Play starts that passed the 300 ms deadline before the PCM was ready.
        std::int64_t lateStarts = 0;
        // Command to the first frame of the last play start, plus the output
        // latency: the time until that frame is heard.
        double lastPlayStartMs = -1.0;
        double sampleRate = 0.0;
        double outputLatencySec = 0.0;
        std::uint64_t generation = 0;
        std::int64_t sessions = 0;
        std::string backend;
        std::string deviceName;
        OutputLatency coreAudio;
        // Sources that could not be opened (no PCM for that clip), the
        // packets and frames the decoders rejected, and the decoder count.
        std::int64_t openFailures = 0;
        std::int64_t decodeErrors = 0;
        std::int64_t openSources = 0;
        std::int64_t sourcesOpened = 0;
        std::int64_t sourcesEvicted = 0;
        std::vector<std::string> failures;  // "clip: path: reason", at most 64
    };

    AudioEngine();
    ~AudioEngine();
    AudioEngine(const AudioEngine&) = delete;
    AudioEngine& operator=(const AudioEngine&) = delete;

    bool start(const Options& options, std::string* error);
    void stop();
    bool running() const;

    // A new snapshot applies from the next play or seek.
    void setTimeline(std::shared_ptr<const Timeline> timeline);

    playback::AudioClockFeed& feed();
    Stats stats() const;

    // Null backend only: a device change with a new output latency. The
    // device facts get a new generation, as a reroute gives them.
    void simulateDeviceChange(double latencySec);
    // Null backend only: run the handler of miniaudio's `started` (true) or
    // `stopped` (false) notification.
    void simulateDeviceNotification(bool started);

    // The recorded device output (interleaved stereo); frame 0 is the first
    // frame the device rendered. Read it after stop().
    std::vector<float> recording() const;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

// Renders the mix of `timeline` from `startMs` for `durationMs` at
// `sampleRate`, with the same plan and `mixBlock` as the device, reading
// each source in full. `report` gets one line per voice that has no PCM.
std::vector<float> renderOffline(const Timeline& timeline, int sampleRate, double startMs, double durationMs,
                                 std::vector<std::string>* report = nullptr);

}  // namespace nt::audio
