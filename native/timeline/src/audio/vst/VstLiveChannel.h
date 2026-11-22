#pragma once

// Lock-free shared-memory + AF_UNIX socket channel for real-time out-of-process
// VST3 audio/MIDI processing in NodeToolVstHost, plus a thread-safe pool of
// active channels shared across MixPlan rebuilds and open editor windows.
//
// Thread affinity:
// - VstLiveChannel::open / close / prepareRate / setAppliedState: control or decode worker thread.
//   close() blocks until an audio callback inside processBlock has finished, so it never
//   unmaps memory the callback still reads.
// - VstLiveChannel::processBlock: real-time audio callback thread (or offline
//   render thread). Lock-free and allocation-free; uses a bounded poll() timeout
//   and detects helper crashes instantly via socket EOF/POLLHUP.
// - VstLivePool: thread-safe via internal mutex; called only from control/worker
//   threads (never from the real-time audio callback).

#include "VstShmProtocol.h"
#include "audio/vst/VstHostClient.h"

#include <QString>

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <span>
#include <string>
#include <unordered_map>

namespace nt::audio::vst {

class VstLiveChannel final {
    struct PrivateTag {};
public:
    explicit VstLiveChannel(PrivateTag) {}
    ~VstLiveChannel();
    VstLiveChannel(const VstLiveChannel&) = delete;
    VstLiveChannel& operator=(const VstLiveChannel&) = delete;

    // Opens a live shared-memory session for `instance` in `client`.
    // Returns shared_ptr because VstLivePool and active MixPlan BlockProcessors
    // share lifetime so audio rendering never sees a destroyed channel during plan swap.
    static std::shared_ptr<VstLiveChannel> open(VstHostClient& client, const QString& instance,
                                                const QString& path, const QString& uid, const QString& state,
                                                double sampleRate, QString* error = nullptr);

    // Real-time safe per-block exchange (interleaved stereo in-place).
    // Returns false without overwriting `stereo` if disconnected, busy, or timed out.
    bool processBlock(std::span<float> stereo, std::span<const vsthost::ShmMidiEvent> midiEvents,
                      double sampleRate, bool reset, int timeoutMs = 25) noexcept;

    // Control thread. Re-prepares the plug-in for `sampleRate` (device or render rate) so the
    // host's live worker never prepares on the audio thread. No-op at the prepared rate.
    bool prepareRate(double sampleRate, QString* error = nullptr);

    // Control thread. Waits until the audio callback has left processBlock, then releases
    // the socket and the shared memory. Safe to call twice and from any non-audio thread.
    void close(VstHostClient* client = nullptr);

    [[nodiscard]] bool connected() const noexcept { return m_connected.load(std::memory_order_acquire); }
    [[nodiscard]] int latencySamples() const noexcept { return m_latencySamples.load(std::memory_order_acquire); }
    [[nodiscard]] std::uint64_t epoch() const noexcept { return m_epoch; }
    [[nodiscard]] const QString& instance() const noexcept { return m_instance; }
    [[nodiscard]] const QString& path() const noexcept { return m_path; }
    [[nodiscard]] const QString& uid() const noexcept { return m_uid; }
    [[nodiscard]] QString appliedState() const;
    void setAppliedState(const QString& state);

private:
    // Owned POSIX handles released in close() / destructor.
    vsthost::ShmBuffer* m_shm = nullptr;
    int m_sockFd = -1;
    std::atomic<bool> m_connected{false};
    std::atomic_flag m_busy = ATOMIC_FLAG_INIT;
    std::uint64_t m_seq = 0;
    std::uint64_t m_epoch = 0;
    std::atomic<int> m_latencySamples{0};
    std::atomic<double> m_preparedRate{0.0};
    // Used by prepareRate() only, on a control thread. The host client is process-wide and
    // outlives every channel it opened.
    VstHostClient* m_client = nullptr;

    QString m_instance;
    QString m_path;
    QString m_uid;
    mutable std::mutex m_stateMutex;
    QString m_appliedState;
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
