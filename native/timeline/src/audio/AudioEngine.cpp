#include "audio/AudioEngine.h"

#include "audio/AudioSource.h"
#include "audio/hooks/OutputDevice.h"

#include "miniaudio.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <map>
#include <set>
#include <mutex>
#include <thread>
#include <unordered_map>

namespace nt::audio {
namespace {

using playback::AudioAnchor;
using playback::CallbackClockDriver;
using playback::DeviceInfo;

std::int64_t steadyNowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

// How far ahead of the play position the worker opens and fills rings, and
// how much each ring holds.
constexpr double kLookaheadMs = 3000.0;
constexpr double kRingSeconds = 2.0;
// A play or seek starts once every voice near the position holds this much.
constexpr double kPrimeMs = 250.0;
constexpr std::int64_t kChunkFrames = 4096;
// The audible burst of a scrub seek, within the primed span, with short ramps
// at both ends so a burst does not click.
// While a drag scrubs, a new burst starts only after the last one ends, so
// each burst is long enough to hear.
constexpr double kScrubMs = 70.0;
constexpr double kScrubRampMs = 5.0;

std::string voiceKey(const VoicePlan& voice) {
    return voice.segmentId.empty() ? voice.clipId : voice.clipId + '\x1f' + voice.segmentId;
}

// One mix snapshot's PCM: rings are retained across unchanged mappings and
// released by the worker after the callback no longer reads their snapshots.
struct Session {
    std::atomic<std::uint64_t> seekSeq{0};
    double startMs = 0.0;
    std::uint64_t planVersion = 0;
    std::shared_ptr<const MixPlan> plan;
    // Shared only between worker-owned snapshots. The callback never copies
    // or destroys an owner. Old snapshots retain rings until their hazard clears.
    std::vector<std::shared_ptr<PcmRing>> rings;
    std::unique_ptr<std::atomic<PcmRing*>[]> live;         // published to the callback
    std::vector<std::int64_t> endFrame;                     // source frame past the clip end
    std::unique_ptr<std::atomic<bool>[]> failed;            // no PCM for this voice
    std::vector<VoicePcm> pcm;                              // callback scratch
    std::atomic<bool> primed{false};
    std::atomic<bool> consumed{false};
    std::atomic<double> doneMs{-1.0e300};                   // timeline end of the last mixed block
};

}  // namespace

struct AudioEngine::Impl {
    // ---- shared ----
    playback::AudioClockFeed feed;
    Options options;
    std::atomic<bool> running{false};
    std::atomic<Session*> published{nullptr};
    std::atomic<Session*> inUse{nullptr};
    double sampleRate = 48000.0;
    std::atomic<double> latencySec{0.0};
    std::atomic<std::uint64_t> generation{0};

    // ---- callback ----
    std::unique_ptr<CallbackClockDriver> driver;
    std::atomic<std::int64_t> callbacks{0};
    std::atomic<std::int64_t> framesRendered{0};
    std::atomic<std::int64_t> underruns{0};
    std::atomic<std::int64_t> waitBlocks{0};
    std::atomic<std::int64_t> playedFrames{0};  // frames mixed while playing
    std::atomic<std::int64_t> lateStarts{0};
    std::atomic<double> lastPlayStartMs{-1.0};
    std::int64_t seenStartNs = 0;
    // Scrub burst. The worker publishes the seek to audition. Only the
    // callback touches its own progress.
    std::atomic<std::uint64_t> scrubRequest{0};
    std::uint64_t scrubSeq = 0;
    std::int64_t scrubPos = 0;
    std::vector<float> record;
    std::atomic<std::int64_t> recordedFrames{0};

    // ---- worker ----
    std::jthread worker;
    std::mutex mutex;  // guards plan, planVersion, stopWorker
    std::condition_variable wake;
    bool stopWorker = false;
    std::shared_ptr<const MixPlan> plan = std::make_shared<MixPlan>();
    std::uint64_t planVersion = 1;
    std::uint64_t publishedPlanVersion = 0;  // guarded by mutex, caller publication acknowledgement
    std::map<std::string, std::unique_ptr<AudioSource>> sources;  // by clip id and path
    std::vector<std::unique_ptr<Session>> sessions;               // current is last
    std::atomic<std::int64_t> sessionCount{0};
    std::atomic<std::int64_t> ringsRetained{0};
    std::vector<float> chunk = std::vector<float>(static_cast<std::size_t>(kChunkFrames) * 2);

    // ---- device ----
    ma_context context{};
    ma_device device{};
    bool contextReady = false;
    bool deviceReady = false;
    std::string backendName;
    std::string deviceName;
    bool selectedDevice = false;
    // The CoreAudio latency facts, written on device start and on a reroute
    // (a CoreAudio thread) and read by stats().
    mutable std::mutex factsMutex;
    OutputLatency coreAudio;
    // F6: source failures, for the report.
    std::mutex failureMutex;
    std::vector<std::string> failures;
    std::atomic<std::int64_t> openFailures{0};
    std::atomic<std::int64_t> decodeErrors{0};
    std::int64_t evictedDecodeErrors = 0;
    std::atomic<std::int64_t> openSources{0};
    std::atomic<std::int64_t> sourcesOpened{0};
    std::atomic<std::int64_t> sourcesEvicted{0};
    std::atomic<bool> deviceStopped{false};  // a `stopped` notification came while running

    void publishDevice(bool isRunning) {
        DeviceInfo info;
        info.running = isRunning;
        info.sampleRate = sampleRate;
        info.outputLatencySec = latencySec.load();
        info.generation = generation.load();
        feed.device.store(info);
    }

    double queryLatency() {
        if (options.backend == Backend::Null) return options.simulatedLatencySec;
#if defined(MA_SUPPORT_COREAUDIO)
        if (device.pContext->backend == ma_backend_coreaudio) {
            const OutputLatency facts = queryCoreAudioOutputLatency(device.coreaudio.deviceObjectIDPlayback);
            {
                std::lock_guard lock(factsMutex);
                coreAudio = facts;
            }
            if (facts.ok) return facts.seconds;
        }
#endif
        // Elsewhere: the device buffer.
        return static_cast<double>(device.playback.internalPeriodSizeInFrames * device.playback.internalPeriods) /
               sampleRate;
    }

    // ---- callback ----
    Session* acquireSession() {
        Session* s = nullptr;
        do {
            s = published.load(std::memory_order_seq_cst);
            inUse.store(s, std::memory_order_seq_cst);
        } while (s != published.load(std::memory_order_seq_cst));
        return s;
    }

    void render(float* out, std::uint32_t frames) {
        const std::int64_t hostNs = steadyNowNs();
        Session* s = acquireSession();
        const AudioAnchor anchor = driver->beginBlock(hostNs, frames, sampleRate, [s](std::uint64_t seq) {
            return s && s->seekSeq.load(std::memory_order_acquire) == seq && s->primed.load(std::memory_order_acquire);
        });
        const std::int64_t framesAt = driver->framesRendered() - frames;
        if (driver->lastStartNs() != seenStartNs) {
            seenStartNs = driver->lastStartNs();
            lastPlayStartMs.store(static_cast<double>(driver->lastStartNs() - driver->lastStartIssuedNs()) / 1e6 +
                                  latencySec.load(std::memory_order_relaxed) * 1000.0);
            if (driver->lastStartLate()) lateStarts.fetch_add(1, std::memory_order_relaxed);
        }
        const auto silence = [&]() { std::fill(out, out + static_cast<std::size_t>(frames) * 2, 0.0f); };
        if (!anchor.playing) {
            silence();
            renderScrub(s, out, frames);
        } else if (driver->seekPending() || !s || s->seekSeq.load(std::memory_order_acquire) != anchor.seekSeq) {
            silence();
            waitBlocks.fetch_add(1, std::memory_order_relaxed);
        } else {
            const double t0 = CallbackClockDriver::timelineAt(anchor, framesAt, sampleRate);
            const double msPerFrame = 1000.0 / sampleRate * anchor.rate;
            const double tEnd = t0 + msPerFrame * frames;
            const MixPlan& plan = *s->plan;
            bool missing = false;
            for (std::size_t i = 0; i < plan.voices.size(); ++i) {
                const VoicePlan& v = plan.voices[i];
                const bool overlaps = !v.silent && tEnd > v.startMs && t0 < v.startMs + v.durationMs;
                s->pcm[i].ring = overlaps ? s->live[i].load(std::memory_order_acquire) : nullptr;
                if (overlaps && !s->pcm[i].ring && !s->failed[i].load(std::memory_order_relaxed)) missing = true;
            }
            MixStats st;
            mixBlock(plan, s->pcm.data(), sampleRate, t0, msPerFrame, static_cast<int>(frames), out, st);
            if (st.underruns > 0 || missing) underruns.fetch_add(1, std::memory_order_relaxed);
            s->doneMs.store(tEnd, std::memory_order_release);
            playedFrames.fetch_add(frames, std::memory_order_relaxed);
            s->consumed.store(true, std::memory_order_release);
        }
        if (!record.empty()) {
            const std::int64_t cap = static_cast<std::int64_t>(record.size() / 2);
            const std::int64_t n = std::min<std::int64_t>(frames, std::max<std::int64_t>(0, cap - framesAt));
            if (n > 0) {
                std::copy(out, out + n * 2, record.begin() + framesAt * 2);
                recordedFrames.store(framesAt + n, std::memory_order_release);
            }
        }
        callbacks.fetch_add(1, std::memory_order_relaxed);
        framesRendered.store(driver->framesRendered(), std::memory_order_relaxed);
    }

    // While paused, plays kScrubMs of the mix from the start of the primed session.
    void renderScrub(Session* s, float* out, std::uint32_t frames) {
        const std::uint64_t request = scrubRequest.load(std::memory_order_acquire);
        if (request != scrubSeq) {
            scrubSeq = request;
            scrubPos = 0;
        }
        const auto total = static_cast<std::int64_t>(kScrubMs * sampleRate / 1000.0);
        if (!s || scrubSeq == 0 || scrubPos >= total || s->seekSeq.load(std::memory_order_acquire) != scrubSeq ||
            !s->primed.load(std::memory_order_acquire)) {
            return;
        }
        const double msPerFrame = 1000.0 / sampleRate;
        const double t0 = s->startMs + msPerFrame * static_cast<double>(scrubPos);
        const double tEnd = t0 + msPerFrame * frames;
        const MixPlan& plan = *s->plan;
        for (std::size_t i = 0; i < plan.voices.size(); ++i) {
            const VoicePlan& v = plan.voices[i];
            const bool overlaps = !v.silent && tEnd > v.startMs && t0 < v.startMs + v.durationMs;
            s->pcm[i].ring = overlaps ? s->live[i].load(std::memory_order_acquire) : nullptr;
        }
        MixStats st;
        mixBlock(plan, s->pcm.data(), sampleRate, t0, msPerFrame, static_cast<int>(frames), out, st);
        const double ramp = std::max(1.0, kScrubRampMs * sampleRate / 1000.0);
        for (std::uint32_t i = 0; i < frames; ++i) {
            const double at = static_cast<double>(scrubPos + i);
            const double gain = at >= total ? 0.0 : std::min({1.0, (at + 1.0) / ramp, (static_cast<double>(total) - at) / ramp});
            out[2 * i] = static_cast<float>(out[2 * i] * gain);
            out[2 * i + 1] = static_cast<float>(out[2 * i + 1] * gain);
        }
        scrubPos += frames;
    }

    static void dataCallback(ma_device* dev, void* output, const void*, ma_uint32 frames) {
        static_cast<Impl*>(dev->pUserData)->render(static_cast<float*>(output), frames);
    }

    static void notificationCallback(const ma_device_notification* n) {
        static_cast<Impl*>(n->pDevice->pUserData)->onNotification(n->type);
    }

    void onNotification(ma_device_notification_type type) {
        switch (type) {
            case ma_device_notification_type_rerouted:
                // D21 step 3: the latency is queried again; the clock sees a
                // new generation and re-anchors (step 4).
                latencySec.store(queryLatency());
                generation.fetch_add(1);
                publishDevice(true);
                break;
            case ma_device_notification_type_stopped:
                // The device stopped on its own (a suspend, a lost device):
                // the clock falls back to the monotonic clock.
                if (running.load()) {
                    deviceStopped.store(true, std::memory_order_release);
                    publishDevice(false);
                }
                break;
            case ma_device_notification_type_started:
                // A resume after such a stop (PulseAudio suspend and resume
                // send the pair without a reroute). The device facts may have
                // changed: query them again under a new generation, so the
                // clock re-anchors on the device.
                if (running.load() && deviceStopped.exchange(false, std::memory_order_acq_rel)) {
                    latencySec.store(queryLatency());
                    generation.fetch_add(1);
                    publishDevice(true);
                }
                break;
            default:
                break;
        }
    }

    // ---- worker ----
    AudioSource* sourceFor(const VoicePlan& v) {
        const std::string key = v.clipId + '\n' + v.mediaPath;
        auto it = sources.find(key);
        if (it != sources.end()) return it->second.get();
        std::string error;
        auto src = AudioSource::open(v.mediaPath, static_cast<int>(sampleRate), &error);
        AudioSource* raw = src.get();
        if (raw) {
            sourcesOpened.fetch_add(1);
            openSources.fetch_add(1);
        } else {
            openFailures.fetch_add(1);
            std::lock_guard lock(failureMutex);
            if (failures.size() < 64) failures.push_back(v.clipId + ": " + v.mediaPath + ": " + error);
        }
        sources.emplace(key, std::move(src));  // a null entry remembers the failure
        return raw;
    }

    // Closes every decoder whose clip has no ring in the current session:
    // its clip has played out or is beyond the lookahead. A later seek opens
    // it again. Also totals the decode errors.
    void evictSources(const Session* current) {
        std::set<std::string> wanted;
        if (current) {
            for (std::size_t i = 0; i < current->plan->voices.size(); ++i) {
                if (current->rings[i]) {
                    const VoicePlan& v = current->plan->voices[i];
                    wanted.insert(v.clipId + '\n' + v.mediaPath);
                }
            }
        }
        std::int64_t live = 0;
        for (auto it = sources.begin(); it != sources.end();) {
            if (it->second && !wanted.count(it->first)) {
                evictedDecodeErrors += it->second->decodeErrors();
                it = sources.erase(it);
                openSources.fetch_sub(1);
                sourcesEvicted.fetch_add(1);
                continue;
            }
            if (it->second) live += it->second->decodeErrors();
            ++it;
        }
        decodeErrors.store(evictedDecodeErrors + live);
    }

    std::unique_ptr<Session> buildSession(std::uint64_t seekSeq, double startMs, const Session* previous = nullptr) {
        auto s = std::make_unique<Session>();
        {
            std::lock_guard lock(mutex);
            s->plan = plan;
            s->planVersion = planVersion;
        }
        s->seekSeq.store(seekSeq);
        s->startMs = startMs;
        const std::size_t n = s->plan->voices.size();
        s->rings.resize(n);
        s->live = std::make_unique<std::atomic<PcmRing*>[]>(n);
        for (std::size_t i = 0; i < n; ++i) s->live[i].store(nullptr);
        s->endFrame.assign(n, 0);
        s->failed = std::make_unique<std::atomic<bool>[]>(n);
        for (std::size_t i = 0; i < n; ++i) s->failed[i].store(false);
        s->pcm.assign(n, VoicePcm{});
        s->doneMs.store(startMs);
        if (previous) {
            // Identity plus the affine source mapping, not gain, fades, pan or
            // timeline extent, decides whether buffered PCM can continue.
            std::unordered_map<std::string, std::size_t> byId;
            byId.reserve(previous->plan->voices.size());
            for (std::size_t i = 0; i < previous->plan->voices.size(); ++i) {
                byId.emplace(voiceKey(previous->plan->voices[i]), i);
            }
            for (std::size_t i = 0; i < n; ++i) {
                const VoicePlan& v = s->plan->voices[i];
                if (v.silent) { continue; }
                const auto found = byId.find(voiceKey(v));
                if (found == byId.end()) {
                    continue;
                }
                const auto j = found->second;
                const VoicePlan& old = previous->plan->voices[j];
                if (v.mediaPath != old.mediaPath || v.sourceRate != old.sourceRate ||
                    v.inPointMs - v.startMs * v.sourceRate != old.inPointMs - old.startMs * old.sourceRate) {
                    continue;
                }
                s->rings[i] = previous->rings[j];
                if (s->rings[i]) { ringsRetained.fetch_add(1, std::memory_order_relaxed); }
                s->live[i].store(previous->live[j].load(std::memory_order_acquire));
                s->failed[i].store(previous->failed[j].load(std::memory_order_relaxed));
                s->endFrame[i] = static_cast<std::int64_t>(
                    std::ceil(v.sourceFrameAt(v.startMs + v.durationMs, sampleRate))) + 2;
            }
            s->consumed.store(previous->consumed.load(std::memory_order_acquire));
        }
        sessionCount.fetch_add(1);
        return s;
    }

    // Opens, fills and frees the rings of `s`. Returns true when every voice
    // near the start holds kPrimeMs of PCM (or all it will ever have). While
    // paused it fills only that much, so a scrub of paused seeks decodes
    // little.
    bool fill(Session& s, bool playing) {
        const MixPlan& plan = *s.plan;
        const double nowMs = std::max(s.startMs, s.doneMs.load(std::memory_order_acquire));
        bool primed = true;
        for (std::size_t i = 0; i < plan.voices.size(); ++i) {
            const VoicePlan& v = plan.voices[i];
            const double endMs = v.startMs + v.durationMs;
            if (v.silent || s.failed[i].load(std::memory_order_relaxed)) { continue; }
            if (endMs <= nowMs) {
                // The callback has mixed past this clip and never reads its
                // ring again (a block loads a ring only when it overlaps).
                if (s.rings[i] && s.doneMs.load(std::memory_order_acquire) >= endMs) {
                    s.live[i].store(nullptr, std::memory_order_release);
                    s.rings[i].reset();
                }
                continue;
            }
            if (v.startMs > nowMs + (playing ? kLookaheadMs : kPrimeMs)) continue;
            AudioSource* src = sourceFor(v);
            if (!src) {
                s.failed[i].store(true, std::memory_order_relaxed);
                continue;
            }
            if (!s.rings[i]) {
                const double fromMs = std::max(v.startMs, s.startMs);
                const auto first = std::max<std::int64_t>(
                    0, static_cast<std::int64_t>(std::floor(v.sourceFrameAt(fromMs, sampleRate))) - 1);
                const auto cap = static_cast<std::int64_t>(kRingSeconds * sampleRate * std::max(1.0, v.sourceRate)) + 1024;
                s.rings[i] = std::make_shared<PcmRing>(cap, first);
                s.endFrame[i] = static_cast<std::int64_t>(std::ceil(v.sourceFrameAt(endMs, sampleRate))) + 2;
            }
            PcmRing& ring = *s.rings[i];
            const auto primeFrames = static_cast<std::int64_t>(kPrimeMs * sampleRate / 1000.0 * v.sourceRate) + 1024;
            const std::int64_t limit = playing ? s.endFrame[i] : std::min(s.endFrame[i], ring.firstFrame() + primeFrames);
            const double needFrames = std::min(kPrimeMs * sampleRate / 1000.0 * v.sourceRate,
                                              static_cast<double>(s.endFrame[i] - ring.firstFrame()));
            if (ring.writeEnd() < limit && src->position() != ring.writeEnd()) src->seek(ring.writeEnd());
            while (ring.writeEnd() < limit && ring.endFrame() == INT64_MAX) {
                const std::int64_t want = std::min({ring.freeFrames(), kChunkFrames, limit - ring.writeEnd()});
                if (want <= 0) break;
                const std::int64_t got = src->read(chunk.data(), want);
                if (got <= 0) {
                    ring.markEnd(ring.writeEnd());
                    break;
                }
                ring.write(chunk.data(), got);
                if (static_cast<double>(ring.writeEnd() - ring.firstFrame()) >= needFrames - 2.0) {
                    s.live[i].store(s.rings[i].get(), std::memory_order_release);
                }
            }
            // EOF also primes a short source. The callback never sees an
            // empty new ring while its decoder is opening.
            s.live[i].store(s.rings[i].get(), std::memory_order_release);
            // Primed: the voices within kPrimeMs of the start.
            if (v.startMs < s.startMs + kPrimeMs) {
                const bool full = static_cast<double>(ring.writeEnd() - ring.firstFrame()) >= needFrames - 2.0;
                if (!full && ring.endFrame() == INT64_MAX) primed = false;
            }
        }
        return primed;
    }

    void retire() {
        Session* current = published.load();
        Session* used = inUse.load(std::memory_order_seq_cst);
        std::erase_if(sessions, [&](const std::unique_ptr<Session>& s) {
            return s.get() != current && s.get() != used;
        });
    }

    std::uint64_t lastScrubArmed = 0;
    std::chrono::steady_clock::time_point lastScrubBuild{};

    void workerLoop() {
        for (;;) {
            {
                std::unique_lock lock(mutex);
                wake.wait_for(lock, std::chrono::milliseconds(2));
                if (stopWorker) return;
            }
            const playback::TransportCommand cmd = feed.command.load();
            Session* current = published.load();
            const auto now = std::chrono::steady_clock::now();
            const bool scrubWait = cmd.scrub && !cmd.playing && current &&
                std::chrono::duration<double, std::milli>(now - lastScrubBuild).count() < kScrubMs;
            if (cmd.seekSeq != 0 && !scrubWait && (!current || current->seekSeq.load() != cmd.seekSeq)) {
                if (cmd.scrub && !cmd.playing) lastScrubBuild = now;
                std::uint64_t version = 0;
                {
                    std::lock_guard lock(mutex);
                    version = planVersion;
                }
                if (current && !current->consumed.load() && current->startMs == cmd.seekMs &&
                    current->planVersion == version) {
                    // A play at the paused-seek position reuses its rings.
                    current->seekSeq.store(cmd.seekSeq, std::memory_order_release);
                } else {
                    auto s = buildSession(cmd.seekSeq, cmd.seekMs);
                    s->primed.store(fill(*s, cmd.playing), std::memory_order_release);
                    current = s.get();
                    sessions.push_back(std::move(s));
                    published.store(current, std::memory_order_seq_cst);
                }
            }
            std::uint64_t version = 0;
            {
                std::lock_guard lock(mutex);
                version = planVersion;
            }
            if (current && current->planVersion != version) {
                const double liveMs = std::max(current->startMs, current->doneMs.load(std::memory_order_acquire));
                auto replacement = buildSession(current->seekSeq.load(), liveMs, current);
                current = replacement.get();
                sessions.push_back(std::move(replacement));
                // Gain/removal edits are visible immediately. Filling a new
                // voice cannot hold up publication or the continuing voices.
                published.store(current, std::memory_order_seq_cst);
            }
            {
                std::lock_guard lock(mutex);
                publishedPlanVersion = current ? current->planVersion : version;
            }
            wake.notify_all();
            if (current) {
                const bool primed = fill(*current, cmd.playing);
                if (primed) current->primed.store(true, std::memory_order_release);
            }
            if (current && cmd.scrub && !cmd.playing && cmd.seekSeq == current->seekSeq.load() && cmd.seekSeq != lastScrubArmed &&
                current->primed.load(std::memory_order_acquire)) {
                lastScrubArmed = cmd.seekSeq;
                scrubRequest.store(cmd.seekSeq, std::memory_order_release);
            }
            evictSources(current);
            retire();
        }
    }
};

AudioEngine::AudioEngine() : m_impl(std::make_unique<Impl>()) {}

AudioEngine::~AudioEngine() {
    stop();
}

playback::AudioClockFeed& AudioEngine::feed() {
    return m_impl->feed;
}

bool AudioEngine::running() const {
    return m_impl->running.load();
}

void AudioEngine::setTimeline(std::shared_ptr<const Timeline> timeline) {
    auto plan = std::make_shared<MixPlan>(timeline ? buildMixPlan(*timeline) : MixPlan{});
    Impl& d = *m_impl;
    prepareMixPlan(*plan, d.sampleRate);
    std::unique_lock lock(d.mutex);
    d.plan = std::move(plan);
    const auto version = ++d.planVersion;
    d.wake.notify_all();
    // The caller may wait for the worker, never the real-time callback.
    // On return, any callback that starts observes this plan or a newer one.
    d.wake.wait(lock, [&d, version] {
        return !d.running.load() || d.stopWorker || d.publishedPlanVersion >= version;
    });
}

bool AudioEngine::start(const Options& options, std::string* error) {
    Impl& d = *m_impl;
    if (d.running.load()) return true;
    d.options = options;
    d.deviceStopped.store(false, std::memory_order_release);
    const auto fail = [&](const std::string& why) {
        if (error) *error = why;
        stop();
        return false;
    };
    ma_backend nullBackend[] = {ma_backend_null};
    const ma_result ctx = options.backend == Backend::Null ? ma_context_init(nullBackend, 1, nullptr, &d.context)
                                                           : ma_context_init(nullptr, 0, nullptr, &d.context);
    if (ctx != MA_SUCCESS) return fail("cannot create the audio context");
    d.contextReady = true;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_f32;
    config.playback.channels = 2;
    config.sampleRate = static_cast<ma_uint32>(std::max(0, options.sampleRate));
    config.periodSizeInFrames = static_cast<ma_uint32>(std::max(64, options.periodFrames));
    config.dataCallback = &Impl::dataCallback;
    config.notificationCallback = &Impl::notificationCallback;
    config.pUserData = &d;
    config.noPreSilencedOutputBuffer = MA_TRUE;
    config.noClip = MA_TRUE;
    ma_device_info* playbackDevices = nullptr;
    ma_uint32 playbackCount = 0;
    d.selectedDevice = false;
    if (hasOutputDeviceProvider() &&
        ma_context_get_devices(&d.context, &playbackDevices, &playbackCount, nullptr, nullptr) == MA_SUCCESS) {
        std::vector<std::string> names;
        names.reserve(playbackCount);
        for (ma_uint32 i = 0; i < playbackCount; ++i) { names.emplace_back(playbackDevices[i].name); }
        if (const auto selected = selectedOutputDevice(names)) {
            config.playback.pDeviceID = &playbackDevices[*selected].id;
            d.selectedDevice = true;
        }
    }
    if (ma_device_init(&d.context, &config, &d.device) != MA_SUCCESS) return fail("cannot open the audio device");
    d.deviceReady = true;
    d.sampleRate = static_cast<double>(d.device.sampleRate);
    prepareMixPlan(*d.plan, d.sampleRate);
    d.backendName = ma_get_backend_name(d.context.backend);
    d.deviceName = d.device.playback.name;
    d.latencySec.store(d.queryLatency());
    d.driver = std::make_unique<CallbackClockDriver>(d.feed);
    if (options.recordSeconds > 0.0) {
        d.record.assign(static_cast<std::size_t>(options.recordSeconds * d.sampleRate) * 2, 0.0f);
    }
    {
        std::lock_guard lock(d.mutex);
        d.stopWorker = false;
    }
    d.worker = std::jthread([&d]() { d.workerLoop(); });
    d.running.store(true);
    d.generation.fetch_add(1);
    d.publishDevice(true);
    if (ma_device_start(&d.device) != MA_SUCCESS) return fail("cannot start the audio device");
    return true;
}

void AudioEngine::stop() {
    Impl& d = *m_impl;
    const bool wasRunning = d.running.exchange(false);
    d.wake.notify_all();
    if (d.deviceReady) {
        ma_device_uninit(&d.device);
        d.deviceReady = false;
    }
    if (d.contextReady) {
        ma_context_uninit(&d.context);
        d.contextReady = false;
    }
    if (d.worker.joinable()) {
        {
            std::lock_guard lock(d.mutex);
            d.stopWorker = true;
        }
        d.wake.notify_all();
        d.worker.join();
    }
    if (wasRunning) d.publishDevice(false);
    d.published.store(nullptr);
    d.inUse.store(nullptr);
    d.sessions.clear();
    d.sources.clear();
}

void AudioEngine::simulateDeviceChange(double latencySec) {
    Impl& d = *m_impl;
    if (d.options.backend != Backend::Null) return;
    d.options.simulatedLatencySec = latencySec;
    d.latencySec.store(latencySec);
    d.generation.fetch_add(1);
    d.publishDevice(d.running.load());
}

void AudioEngine::simulateDeviceNotification(bool started) {
    Impl& d = *m_impl;
    if (d.options.backend != Backend::Null) return;
    d.onNotification(started ? ma_device_notification_type_started : ma_device_notification_type_stopped);
}

AudioEngine::Stats AudioEngine::stats() const {
    const Impl& d = *m_impl;
    Stats s;
    s.callbacks = d.callbacks.load();
    s.framesRendered = d.framesRendered.load();
    s.underruns = d.underruns.load();
    s.waitBlocks = d.waitBlocks.load();
    s.playedFrames = d.playedFrames.load();
    s.lateStarts = d.lateStarts.load();
    s.lastPlayStartMs = d.lastPlayStartMs.load();
    s.sampleRate = d.sampleRate;
    s.outputLatencySec = d.latencySec.load();
    s.generation = d.generation.load();
    s.sessions = d.sessionCount.load();
    s.ringsRetained = d.ringsRetained.load();
    s.backend = d.backendName;
    s.deviceName = d.deviceName;
    s.selectedDevice = d.selectedDevice;
    {
        std::lock_guard lock(d.factsMutex);
        s.coreAudio = d.coreAudio;
    }
    s.openFailures = d.openFailures.load();
    s.decodeErrors = d.decodeErrors.load();
    s.openSources = d.openSources.load();
    s.sourcesOpened = d.sourcesOpened.load();
    s.sourcesEvicted = d.sourcesEvicted.load();
    {
        std::lock_guard lock(const_cast<Impl&>(d).failureMutex);
        s.failures = d.failures;
    }
    return s;
}

std::vector<float> AudioEngine::recording() const {
    const Impl& d = *m_impl;
    const std::int64_t n = d.recordedFrames.load(std::memory_order_acquire);
    return std::vector<float>(d.record.begin(), d.record.begin() + n * 2);
}

std::vector<float> renderOffline(const Timeline& timeline, int sampleRate, double startMs, double durationMs,
                                 std::vector<std::string>* report, std::function<bool()> cancelled) {
    const auto interrupted = [&] { return cancelled && cancelled(); };
    if (interrupted()) return {};
    const MixPlan plan = buildMixPlan(timeline);
    prepareMixPlan(plan, sampleRate);
    const double sr = sampleRate;
    const auto total = static_cast<std::int64_t>(std::llround(durationMs * sr / 1000.0));
    std::vector<std::vector<float>> spans(plan.voices.size());
    std::vector<VoicePcm> pcm(plan.voices.size());
    for (std::size_t i = 0; i < plan.voices.size(); ++i) {
        if (interrupted()) return {};
        const VoicePlan& v = plan.voices[i];
        const double from = std::max(v.startMs, startMs);
        const double to = std::min(v.startMs + v.durationMs, startMs + durationMs);
        if (v.silent || to <= from) { continue; }
        std::string error;
        auto src = AudioSource::open(v.mediaPath, sampleRate, &error, cancelled);
        if (!src) {
            if (report) report->push_back(v.clipId + ": " + error);
            continue;
        }
        const auto first = std::max<std::int64_t>(0, static_cast<std::int64_t>(std::floor(v.sourceFrameAt(from, sr))) - 1);
        const auto last = static_cast<std::int64_t>(std::ceil(v.sourceFrameAt(to, sr))) + 2;
        spans[i].resize(static_cast<std::size_t>(std::max<std::int64_t>(0, last - first)) * 2);
        src->seek(first);
        const std::int64_t got = src->read(spans[i].data(), last - first);
        pcm[i].linear = spans[i].data();
        pcm[i].linearFirst = first;
        pcm[i].linearCount = got;
    }
    if (interrupted()) return {};
    std::vector<float> out(static_cast<std::size_t>(total) * 2, 0.0f);
    MixStats stats;
    const std::int64_t block = 4096;
    for (std::int64_t at = 0; at < total; at += block) {
        if (interrupted()) return {};
        const int n = static_cast<int>(std::min(block, total - at));
        mixBlock(plan, pcm.data(), sr, startMs + static_cast<double>(at) * 1000.0 / sr, 1000.0 / sr, n,
                 out.data() + at * 2, stats);
    }
    return out;
}

}  // namespace nt::audio
