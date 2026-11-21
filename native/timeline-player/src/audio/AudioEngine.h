#pragma once

// Audio playback on miniaudio (DESIGN.md D21 to D26). Three threads:
//   - the device callback (real time) copies the shuttle ring or mixes
//     the normal-rate PCM rings with `mixBlock`
//     and runs the callback half of the audio-master clock
//     (`CallbackClockDriver`). It never locks, allocates or decodes.
//   - the audio decode worker publishes mix snapshots for seeks and edits.
//     It owns the PCM rings, retaining unchanged mappings across edits,
//     and fills them from AudioSource while the clips play. Pitch-kept
//     shuttle runs mixBlock and ShuttleStretcher on this worker.
//   - the caller (GUI thread) starts and stops the device and hands in
//     timeline snapshots.
// PlaybackClock talks to the engine only through `feed()`.
//
// The null backend renders in real time to no device at all: every
// automated check uses it, so no test makes a sound. The system backend is
// the default output device and is used only by the interactive app and by
// scripts/window-checks.sh. The manual backend opens no device either: the
// caller runs the device callback with `renderManual`, on a time line of its
// own, so a check can play hours of audio in seconds.
//
// A loop at rate 1 (TransportCommand::loopStartMs, MUSIC-MODE.md MD19) is
// crossed in the callback with no seek. The worker keeps a second session,
// primed from the loop start, in a second slot. At the loop end the callback
// mixes the frames before the wrap from the current session and the frames
// after it from the wrap session, and fades out the current session past the
// loop end over 3 ms. The worker then makes the wrap session current and
// primes the next one.

#include "audio/Mixer.h"
#include "audio/OutputLatency.h"
#include "model/TimelineTypes.h"
#include "playback/AudioClockFeed.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <vector>

namespace nt::audio {

class LoudnessReadout;

// Thread affinity: one control thread (the GUI thread in the app) calls
// start, stop, setTimeline, stats, recording and the simulate calls. The
// device callback and the decode worker are the engine's own threads and
// meet only through atomics and the plan mutex (Impl). On the manual
// backend, one thread stands in for the device and calls renderManual.
class AudioEngine {
public:
    enum class Backend { Null, System, Manual };
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
        // Where the loudness of the played mix goes (LUFS meter). Null: no metering. The readout must
        // outlive the engine. The callback writes it without allocating or locking.
        LoudnessReadout* loudness = nullptr;
    };
    struct Stats {
        std::int64_t shuttleFrames = 0;
        std::int64_t shuttleSkipped = 0;
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
        // Loop ends the callback crossed to the loop start with no seek, and
        // loop ends it reached with no wrap PCM primed (the transport then seeks).
        std::int64_t loopWraps = 0;
        std::int64_t loopMisses = 0;
        // Command to the first frame of the last play start, plus the output
        // latency: the time until that frame is heard.
        double lastPlayStartMs = -1.0;
        double sampleRate = 0.0;
        double outputLatencySec = 0.0;
        std::uint64_t generation = 0;
        // Mix snapshots allocated for seeks, timeline edits and loop wraps.
        std::int64_t sessions = 0;
        // Mix plans built by setTimeline, and worker loop iterations.
        std::int64_t planBuilds = 0;
        std::int64_t workerWakes = 0;
        std::int64_t ringsRetained = 0;
        std::string backend;
        std::string deviceName;
        bool selectedDevice = false;
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

    // Publishes the mix before returning, so the next device block uses it.
    // Unchanged PCM mappings retain their rings. New/remapped voices become
    // audible as the worker primes them, without a transport seek.
    // native-rules #1: takes std::shared_ptr with no comment on why unique ownership is impossible
    void setTimeline(std::shared_ptr<const Timeline> timeline);
    // The same, without waiting for the worker to publish. Edit-driven updates use it.
    void setTimelineAsync(std::shared_ptr<const Timeline> timeline);

    playback::AudioClockFeed& feed();
    Stats stats() const;

    // Null and manual backends only: a device change with a new output latency. The
    // device facts get a new generation, as a reroute gives them.
    void simulateDeviceChange(double latencySec);
    // Null and manual backends only: run the handler of miniaudio's `started` (true) or
    // `stopped` (false) notification.
    void simulateDeviceNotification(bool started);

    // The recorded device output (interleaved stereo); frame 0 is the first
    // frame the device rendered. Read it after stop().
    std::vector<float> recording() const;

    // Manual backend only: run the device callback once to fill `out`
    // (interleaved stereo, out.size() / 2 frames), as a device would at
    // monotonic time `hostNs`. Calls come from one thread and never overlap.
    void renderManual(std::span<float> out, std::int64_t hostNs);

private:
    std::uint64_t publishPlan(std::shared_ptr<const Timeline> timeline);
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

// Renders the mix of `timeline` from `startMs` for `durationMs` at
// `sampleRate`, with the same plan and `mixBlock` as the device, reading
// each source in full. `report` gets one line per voice that has no PCM.
std::vector<float> renderOffline(const Timeline& timeline, int sampleRate, double startMs, double durationMs,
                                 std::vector<std::string>* report = nullptr,
                                 std::function<bool()> cancelled = {});

}  // namespace nt::audio
