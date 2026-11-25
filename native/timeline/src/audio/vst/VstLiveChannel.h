#pragma once

// Lock-free shared-memory + AF_UNIX socket channel for real-time out-of-process
// VST3 audio/MIDI processing in NodeToolVstHost, plus a thread-safe pool of
// active channels shared across MixPlan rebuilds and open editor windows.
//
// Thread affinity & ownership:
// - VstLiveChannel owns its IPC render worker (`m_worker`), bounded lock-free SPSC
//   request/response queues (`m_reqSlots`, `m_respSlots`), and POSIX SHM/socket handles.
// - `m_worker` is the sole thread that touches `m_shm` and `m_sockFd` while active
//   (except during `recoverIfNeeded()` while `m_worker` is parked on `m_peerDead`,
//   and during `close()` after `m_worker` is joined).
// - VstLiveChannel::processBlockAsync: real-time audio callback thread only.
//   Strictly lock-free, allocation-free, and zero-syscall: publishes requests via
//   pure atomic handoff into `m_reqSlots` (never entering kernel synchronization),
//   reads finished blocks from `m_respSlots` (covering the requested look-ahead and
//   submitted block size), applies fade-out/fade-in underrun concealment on late
//   blocks without disconnecting, and counts underruns atomically. The worker takes
//   a bounded spin followed by a timed sleep sized to the callback period.
// - VstLiveChannel::processBlock: offline/control/test threads only (synchronous
//   round-trip routed through `m_worker` so `m_shm`/`m_sockFd` stay single-owner).
// - VstLiveChannel::open / close / prepareRate / probeLatency / recoverIfNeeded /
//   armForPlayback / setAppliedState / setAsyncLatencyFrames: control or decode
//   worker thread. `armForPlayback()` wakes `m_worker` from deep idle via an owned
//   non-blocking self-pipe (`m_wakeReadFd`/`m_wakeWriteFd`, write end guarded by
//   `m_wakeMutex`) and extends `m_armedUntilNs` before RT callbacks begin.
//   `close()` wakes, stops, and joins `m_worker`, drains sync and async callers,
//   then releases socket, SHM, and wake-pipe handles.
// - VstLivePool: thread-safe via internal mutex; called only from control/worker
//   threads (never from the real-time audio callback).

#include "VstShmProtocol.h"
#include "audio/vst/VstHostClient.h"

#include <QString>

#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <span>
#include <string>
#include <thread>
#include <unordered_map>

namespace nt::audio::vst {

class VstLiveChannel final {
    struct PrivateTag {};
public:
    // Default playback look-ahead latency added by the asynchronous IPC render worker
    // (one full SHM block = 512 frames = 10.67 ms at 48 kHz), reported to PDC.
    static constexpr int kPlaybackAsyncLatencyFrames = static_cast<int>(vsthost::kShmMaxFrames);
    static constexpr int kAsyncLatencyFrames = kPlaybackAsyncLatencyFrames;
    // Upper bound on configurable async look-ahead depth (covers large device callbacks).
    static constexpr int kMaxAsyncLatencyFrames = 4096;
    // Default render quantum passed to the host RT worker when no device block size is known yet.
    static constexpr int kDefaultRenderQuantumFrames = 128;
    // Short fade-out / fade-in length for underrun concealment (~1.33 ms at 48 kHz).
    static constexpr int kConcealFadeFrames = 64;
    // Window during which an armed worker stays on its active polling cadence before
    // decaying back to deep idle if no callbacks arrive.
    static constexpr auto kDefaultArmWindow = std::chrono::milliseconds(200);

    struct AsyncBlockResult {
        bool submitted = false;    // input audio + MIDI were queued to the RT IPC worker
        bool outputReady = false;  // finished output (or initial latency zeros) returned; false = underrun concealed
        bool peerDead = false;     // host socket died; control thread recovery needed
        bool recovered = false;    // dead-peer recovery completed since previous callback; re-chase state
    };

    explicit VstLiveChannel(PrivateTag) {}
    ~VstLiveChannel();
    VstLiveChannel(const VstLiveChannel&) = delete;
    VstLiveChannel& operator=(const VstLiveChannel&) = delete;

    // Opens a live shared-memory session for `instance` in `client` and starts its
    // real-time-priority IPC render worker.
    // Returns shared_ptr because VstLivePool and active MixPlan BlockProcessors
    // share lifetime so audio rendering never sees a destroyed channel during plan swap.
    static std::shared_ptr<VstLiveChannel> open(VstHostClient& client, const QString& instance,
                                                const QString& path, const QString& uid, const QString& state,
                                                double sampleRate, QString* error = nullptr,
                                                int renderQuantumFrames = kDefaultRenderQuantumFrames);

    // Real-time audio callback exchange (interleaved stereo in-place).
    // Strictly non-blocking, lock-free, allocation-free, and zero-syscall: pure atomic handoff.
    // When `desiredLatencyFrames > 0`, activates that look-ahead depth on the audio thread
    // (avoiding control-thread mutation of an active plan's pooled channel).
    // Look-ahead is always at least `frames` so large callbacks never enter a permanent debt cycle.
    // On a late block, conceals the underrun with a short fade-out/fade-in and increments
    // `underrunCount()` without setting `connected() = false`.
    AsyncBlockResult processBlockAsync(std::span<float> stereo,
                                       std::span<const vsthost::ShmMidiEvent> midiEvents,
                                       double sampleRate, bool reset,
                                       int desiredLatencyFrames = -1) noexcept;

    // Synchronous per-block exchange for offline rendering and synchronous tests
    // (interleaved stereo in-place). Never call on the real-time audio device callback.
    bool processBlock(std::span<float> stereo, std::span<const vsthost::ShmMidiEvent> midiEvents,
                      double sampleRate, bool reset, int timeoutMs = 25) noexcept;

    // Control thread. Re-prepares the plug-in for `sampleRate` (device or render rate) and/or
    // updates the host RT worker's scheduling quantum (`renderQuantumFrames`) off the render thread.
    // If only `renderQuantumFrames` changed, updates host scheduling without resetting the plug-in.
    bool prepareRate(double sampleRate, QString* error = nullptr, int renderQuantumFrames = 0);

    // Control/offline thread. Always queries NodeToolVstHost for the plug-in's current
    // effective latency at `sampleRate` (used before offline export even when reusing a pooled channel).
    bool probeLatency(double sampleRate, QString* error = nullptr);

    // Control thread. If the host peer died (`peerDead()`), opens a fresh SHM/socket session
    // via `VstHostClient` and swaps transport handles while the IPC worker is parked.
    // Returns true if recovery succeeded.
    bool recoverIfNeeded();

    // Control thread. Wakes the IPC worker from deep idle via the non-blocking self-pipe
    // and arms its active polling cadence for `window` before real-time callbacks begin.
    // Never call on the real-time audio callback thread.
    void armForPlayback(std::chrono::milliseconds window = kDefaultArmWindow) noexcept;

    // Control thread. Stops and joins the IPC worker, waits until the audio callback has left
    // processBlockAsync, then releases the socket and shared memory. Safe to call twice.
    void close(VstHostClient* client = nullptr);

    // Configures default per-channel async look-ahead depth (clamped to [1, kMaxAsyncLatencyFrames])
    // used when callers omit `desiredLatencyFrames` in `processBlockAsync()`.
    void setAsyncLatencyFrames(int frames) noexcept {
        const int clamped = std::clamp(frames, 1, kMaxAsyncLatencyFrames);
        m_asyncLatencyFrames.store(clamped, std::memory_order_release);
    }
    [[nodiscard]] int asyncLatencyFrames() const noexcept {
        return m_asyncLatencyFrames.load(std::memory_order_acquire);
    }
    [[nodiscard]] int effectiveAsyncLatencyFrames() const noexcept {
        return m_effectiveAsyncLatency.load(std::memory_order_acquire);
    }
    [[nodiscard]] int configuredRenderQuantumFrames() const noexcept {
        return m_renderQuantumFrames.load(std::memory_order_acquire);
    }

    [[nodiscard]] bool connected() const noexcept {
        return m_connected.load(std::memory_order_acquire) && !m_peerDead.load(std::memory_order_acquire);
    }
    [[nodiscard]] bool closed() const noexcept { return m_closed.load(std::memory_order_acquire); }
    [[nodiscard]] bool peerDead() const noexcept { return m_peerDead.load(std::memory_order_acquire); }
    [[nodiscard]] std::uint64_t underrunCount() const noexcept {
        return m_underrunCount.load(std::memory_order_acquire);
    }
    [[nodiscard]] std::uint64_t recoveryCount() const noexcept {
        return m_recoveryCount.load(std::memory_order_acquire);
    }
    // Control/test thread: returns cumulative OS user+system CPU microseconds consumed by
    // `m_worker`, or -1 if the worker is closed/unsupported. Zero overhead in workerLoop().
    [[nodiscard]] std::int64_t workerCpuTimeUs() noexcept;
    // Test seam: optional deterministic checkpoint invoked inside recoverIfNeeded() while
    // holding m_controlMutex, right before (afterOpen=false) and right after (afterOpen=true)
    // openTransportSession() returns.
    void setRecoveryHookForTest(std::function<void(bool afterOpen)> hook);
    [[nodiscard]] int latencySamples() const noexcept {
        return unpackVstLatencySamples(m_latencyState->load(std::memory_order_acquire));
    }
    [[nodiscard]] std::uint64_t latencyGeneration() const noexcept {
        return unpackVstLatencyGeneration(m_latencyState->load(std::memory_order_acquire));
    }
    bool updateLatency(int latency, std::uint64_t generation) noexcept {
        return updateMonotonicVstLatency(*m_latencyState, latency, generation);
    }
    // Resets cached latency and generation (e.g., to force a fresh re-probe in tests).
    void setLatencySamples(int latency) noexcept {
        m_latencyState->store(packVstLatency(0, latency), std::memory_order_release);
    }
    [[nodiscard]] std::uint64_t epoch() const noexcept { return m_epoch.load(std::memory_order_acquire); }
    [[nodiscard]] const QString& instance() const noexcept { return m_instance; }
    [[nodiscard]] const QString& path() const noexcept { return m_path; }
    [[nodiscard]] const QString& uid() const noexcept { return m_uid; }
    [[nodiscard]] QString appliedState() const;
    void setAppliedState(const QString& state);

private:
    static constexpr std::size_t kQueueCapacity = 32;
    static constexpr std::size_t kQueueMask = kQueueCapacity - 1;
    static_assert((kQueueCapacity & kQueueMask) == 0, "kQueueCapacity must be a power of two");

    struct AsyncRequest {
        std::uint64_t gen = 0;
        std::uint64_t seq = 0;
        double sampleRate = 48000.0;
        std::uint32_t numFrames = 0;
        std::uint32_t numMidiEvents = 0;
        bool reset = false;
        std::array<float, static_cast<std::size_t>(vsthost::kShmMaxFrames) * 2> stereo{};
        std::array<vsthost::ShmMidiEvent, vsthost::kShmMaxMidiEvents> midi{};
    };

    struct AsyncResponse {
        std::uint64_t gen = 0;
        std::uint64_t seq = 0;
        std::uint32_t numFrames = 0;
        bool ok = false;
        std::array<float, static_cast<std::size_t>(vsthost::kShmMaxFrames) * 2> stereo{};
    };

    enum class ExchangeStatus { Ok, BlockError, Timeout, PeerDead };

    void workerLoop();
    void wakeWorker() noexcept;
    void drainWakePipe() noexcept;
    ExchangeStatus exchangeOnShm(const AsyncRequest& req, AsyncResponse& resp,
                                 int timeoutMs, bool isSync) noexcept;
    void waitWorkerIdle(std::chrono::steady_clock::time_point lastJobTime, bool& spinAfterHandoff) noexcept;
    bool hasPendingWorkerJobs() const noexcept;
    void skipStaleResponses() noexcept;
    void discardDebtFrames() noexcept;
    [[nodiscard]] std::size_t availableCurrentGenFrames() const noexcept;
    void consumeResponseFrames(float* dstStereo, std::size_t count) noexcept;

    // Owned POSIX handles: touched only by `m_worker` while active, or by control thread
    // while `m_worker` is parked (`m_peerDead`) or joined (`close()`).
    vsthost::ShmBuffer* m_shm = nullptr;
    int m_sockFd = -1;
    // Owned non-blocking self-pipe: `m_wakeReadFd` is read solely by `m_worker` (closed in
    // close() after m_worker.join()); `m_wakeWriteFd` is written by control threads under
    // `m_wakeMutex` (never touched on the RT audio callback).
    int m_wakeReadFd = -1;
    int m_wakeWriteFd = -1;
    std::mutex m_wakeMutex;
#ifdef Q_OS_MACOS
    // Owned macOS kqueue fd: created in open(), touched only by `m_worker`, closed in close()
    // after m_worker.join(). Uses NOTE_CRITICAL one-shot timers while armed/active to avoid
    // macOS select() timer coalescing on 64-frame/48 kHz (1.33 ms) deadlines.
    int m_kqueueFd = -1;
    int m_kqueueSockFd = -1;
    bool m_kqueueTimerArmed = false;
#endif
    std::uint64_t m_shmSeq = 0;  // worker thread only

    // Bounded lock-free SPSC queues allocated once in open().
    std::unique_ptr<AsyncRequest[]> m_reqSlots;
    std::unique_ptr<AsyncResponse[]> m_respSlots;
    alignas(64) std::atomic<std::uint64_t> m_reqWrite{0};
    alignas(64) std::atomic<std::uint64_t> m_reqRead{0};
    alignas(64) std::atomic<std::uint64_t> m_respWrite{0};
    alignas(64) std::atomic<std::uint64_t> m_respRead{0};
    alignas(64) std::atomic<std::uint64_t> m_workerSkipped{0};
    alignas(64) std::atomic<std::uint64_t> m_streamGen{0};
    alignas(64) std::atomic<int> m_callbackPeriodUs{2667};
    alignas(64) std::atomic<int> m_asyncLatencyFrames{kPlaybackAsyncLatencyFrames};
    alignas(64) std::atomic<int> m_effectiveAsyncLatency{kPlaybackAsyncLatencyFrames};
    alignas(64) std::atomic<std::int64_t> m_armedUntilNs{0};

    // Audio-callback-only async pipeline & underrun concealment state (guarded by m_asyncBusy).
    std::atomic_flag m_asyncBusy = ATOMIC_FLAG_INIT;
    std::uint64_t m_activeGen = 0;
    std::uint64_t m_asyncSeq = 0;
    std::uint64_t m_lastSeenRecoveryCount = 0;
    int m_lastRequestedLatency = kPlaybackAsyncLatencyFrames;
    int m_activeAsyncLatency = kPlaybackAsyncLatencyFrames;
    bool m_asyncPrimed = false;
    std::size_t m_seedZeroFrames = 0;
    std::size_t m_debtFrames = 0;
    std::size_t m_curRespOffset = 0;
    float m_lastOutL = 0.0f;
    float m_lastOutR = 0.0f;
    float m_fadeOutStartL = 0.0f;
    float m_fadeOutStartR = 0.0f;
    int m_fadeOutPos = 0;
    bool m_inUnderrun = false;
    float m_fadeInFromL = 0.0f;
    float m_fadeInFromR = 0.0f;
    int m_fadeInPos = 0;
    bool m_fadingIn = false;

    // Lifecycle & diagnostic atomics (readable from any thread).
    std::atomic<bool> m_connected{false};
    std::atomic<bool> m_closed{false};
    std::atomic<bool> m_stop{false};
    std::atomic<bool> m_peerDead{false};
    std::atomic<bool> m_recoveryResetPending{false};
    std::atomic<std::uint64_t> m_underrunCount{0};
    std::atomic<std::uint64_t> m_recoveryCount{0};
    std::atomic<std::uint64_t> m_epoch{0};

    // Offline/sync call handoff to m_worker (never touched by processBlockAsync).
    std::mutex m_syncMutex;
    std::mutex m_syncWaitMutex;
    std::condition_variable m_syncCv;
    std::atomic<bool> m_syncPending{false};
    bool m_syncInFlight = false;
    bool m_syncDone = false;
    int m_syncTimeoutMs = 25;
    AsyncRequest m_syncReq;
    AsyncResponse m_syncResp;

    // Control-thread serialization & worker parking for dead-peer recovery and close().
    std::mutex m_controlMutex;
    std::mutex m_workerParkMutex;
    std::condition_variable m_workerParkCv;
    bool m_workerParked = false;
    std::chrono::steady_clock::time_point m_lastRecoveryAttempt{};

    // Real-time-priority IPC render worker owned by VstLiveChannel; joined in close().
    std::jthread m_worker;

    // Shared as std::weak_ptr with VstHostClient's LatencyTargetRegistry so host `latencyChanged`
    // events update latency monotonically without holding channel ownership.
    std::shared_ptr<VstLatencyTarget> m_latencyState = std::make_shared<VstLatencyTarget>(0);
    std::atomic<double> m_preparedRate{0.0};
    std::atomic<int> m_renderQuantumFrames{kDefaultRenderQuantumFrames};
    // Used by prepareRate()/probeLatency()/recoverIfNeeded() on a control thread.
    // The host client outlives every channel it opened.
    VstHostClient* m_client = nullptr;

    QString m_instance;
    QString m_path;
    QString m_uid;
    mutable std::mutex m_stateMutex;
    QString m_appliedState;
    std::atomic<bool> m_hasRecoveryHookForTest{false};
    std::function<void(bool)> m_recoveryHookForTest;
};

class VstLivePool final {
public:
    VstLivePool() = default;
    ~VstLivePool();
    VstLivePool(const VstLivePool&) = delete;
    VstLivePool& operator=(const VstLivePool&) = delete;

    // Reuses an existing healthy live channel for `instance` matching `(path, uid)`,
    // syncing state if changed (unless an editor is open), or opens a new one.
    std::shared_ptr<VstLiveChannel> acquire(VstHostClient& client, const QString& instance,
                                            const QString& path, const QString& uid, const QString& state,
                                            double sampleRate, QString* error = nullptr);

    // Records state pushed by an open editor so the next MixPlan rebuild does not re-apply it.
    void noteStateFromEditor(const QString& instance, const QString& state);
    void setEditorOpen(const QString& instance, bool open);
    void evictAll(VstHostClient* client = nullptr);
    void closeInstance(const QString& instance, VstHostClient* client = nullptr);

private:
    std::mutex m_mutex;
    std::unordered_map<std::string, std::shared_ptr<VstLiveChannel>> m_channels;
    std::unordered_map<std::string, bool> m_openEditors;
};

[[nodiscard]] VstLivePool& sharedVstLivePool();

}  // namespace nt::audio::vst
