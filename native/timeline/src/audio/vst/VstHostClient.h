#pragma once

// Thread-safe client for the out-of-process NodeToolVstHost helper
// (native/vst-host). Third-party VST3 plug-ins never load into this process:
// a crashing plug-in ends only the helper, which restarts on the next request.
//
// Thread affinity: thread-safe public API. Internally owns a dedicated QThread
// (m_thread) and a HostWorker QObject living on that thread that owns the
// QProcess. Async methods (scanAsync, openEditorAsync, closeEditorAsync,
// disposeAsync) may be called from the UI thread and emit Qt signals.
// Synchronous methods (scanSync, renderInstrument, processAudio) block on a
// condition variable and must be called only from worker/offline threads,
// never from the UI thread or the real-time audio callback.

#include <QJsonObject>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QThread>
#include <QVariantList>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <span>
#include <stop_token>
#include <string>
#include <unordered_map>
#include <vector>

namespace nt::audio::vst {

// Packed (generation << 32) | latencySamples atomic shared between VstLiveChannel
// and VstHostClient's LatencyTargetRegistry so older SHM/RPC latency replies never
// overwrite a newer `latencyChanged` event.
using VstLatencyTarget = std::atomic<std::uint64_t>;
inline constexpr int kMaxVstLatencySamples = 960000;

inline constexpr std::uint64_t packVstLatency(std::uint64_t generation, int latencySamples) noexcept {
    const int clamped = latencySamples < 0 ? 0 : (latencySamples > kMaxVstLatencySamples ? kMaxVstLatencySamples : latencySamples);
    return (static_cast<std::uint64_t>(static_cast<std::uint32_t>(generation)) << 32) |
           static_cast<std::uint32_t>(clamped);
}

inline constexpr int unpackVstLatencySamples(std::uint64_t packed) noexcept {
    return static_cast<int>(static_cast<std::uint32_t>(packed & 0xFFFFFFFFu));
}

inline constexpr std::uint64_t unpackVstLatencyGeneration(std::uint64_t packed) noexcept {
    return static_cast<std::uint64_t>(packed >> 32);
}

// Lock-free monotonic update: applies (generation, latencySamples) iff generation >= current generation.
inline bool updateMonotonicVstLatency(VstLatencyTarget& target, int latencySamples,
                                      std::uint64_t generation) noexcept {
    const std::uint32_t nextGen = static_cast<std::uint32_t>(generation);
    const std::uint64_t nextPacked = packVstLatency(nextGen, latencySamples);
    std::uint64_t cur = target.load(std::memory_order_acquire);
    for (;;) {
        const std::uint32_t curGen = static_cast<std::uint32_t>(cur >> 32);
        if (nextGen < curGen) {
            return false;
        }
        if (cur == nextPacked) {
            return true;
        }
        if (target.compare_exchange_weak(cur, nextPacked, std::memory_order_acq_rel, std::memory_order_acquire)) {
            return true;
        }
    }
}

struct VstPluginInfo {
    QString uid;
    QString name;
    QString vendor;
    QString version;
    QString path;
    bool isInstrument = false;
    QString format = QStringLiteral("vst3");
};

struct VstNoteEvent {
    int pitch = 60;
    int velocity = 100;
    std::int64_t startFrame = 0;
    std::int64_t gateOffFrame = 1;
};

// Locates the NodeToolVstHost executable from overridePath, NODETOOL_VST_HOST,
// bundled/app-relative paths, dev build outputs, or user data dir.
[[nodiscard]] QString findVstHostExecutable(const QString& overridePath = {});

// Helper converting VstPluginInfo to a QVariantMap for QML.
[[nodiscard]] QVariantMap pluginInfoToVariant(const VstPluginInfo& info);

class VstHostClient final : public QObject {
    Q_OBJECT
public:
    explicit VstHostClient(QObject* parent = nullptr);
    ~VstHostClient() override;
    VstHostClient(const VstHostClient&) = delete;
    VstHostClient& operator=(const VstHostClient&) = delete;

    // Stops the child process and worker thread cleanly. Safe to call multiple times.
    void shutdown();

    void setOverrideExecutable(const QString& path);
    void setExtraScanDirs(const QStringList& dirs);

    [[nodiscard]] QString executablePath() const;
    [[nodiscard]] bool available() const;
    [[nodiscard]] QString unavailableReason() const;

    // Scans VST3 instruments and audio effects. Caches results until rescan == true.
    bool scanSync(bool rescan, std::vector<VstPluginInfo>* out, QString* error = nullptr, int timeoutMs = 180000, std::stop_token stop = {});
    void scanAsync(bool rescan = false);

    // Renders MIDI note events through a VST3 instrument to interleaved stereo float32 PCM.
    bool renderInstrument(const QString& path, const QString& uid, const QString& state,
                          double sampleRate, std::int64_t frames, const std::vector<VstNoteEvent>& events,
                          std::vector<float>* interleavedOut, QString* error = nullptr, int timeoutMs = 120000);

    // Processes interleaved stereo float32 PCM through a VST3 audio effect plug-in.
    bool processAudio(const QString& path, const QString& uid, const QString& state,
                      double sampleRate, std::span<const float> interleavedIn,
                      std::vector<float>* interleavedOut, QString* error = nullptr, int timeoutMs = 120000);

    // Worker/offline threads only. Requests use the Electron JSON-line shapes.
    bool listPresets(const QJsonObject& target, QJsonObject* reply, QString* error = nullptr, std::stop_token stop = {});
    bool selectPreset(const QJsonObject& target, QJsonObject* reply, QString* error = nullptr, std::stop_token stop = {});
    bool getParameters(const QJsonObject& target, QJsonObject* reply, QString* error = nullptr, std::stop_token stop = {});
    bool setParameters(const QJsonObject& target, QJsonObject* reply, QString* error = nullptr, std::stop_token stop = {});

    // Live shared-memory session control (used by VstLiveChannel / VstLivePool).
    bool openLive(const QString& instance, const QString& path, const QString& uid, const QString& state,
                  double sampleRate, int maxBlockFrames, const QString& shmPath, const QString& sockPath,
                  int* latencySamples = nullptr, QString* error = nullptr, int timeoutMs = 30000,
                  std::uint64_t* latencyGeneration = nullptr);
    // Re-prepares an open live instance for `sampleRate` on the host's message thread,
    // so the live worker never has to (processLiveBlock refuses a mismatched rate).
    bool prepareLive(const QString& instance, double sampleRate, int maxBlockFrames, int* latencySamples = nullptr,
                     QString* error = nullptr, int timeoutMs = 15000,
                     std::uint64_t* latencyGeneration = nullptr);
    bool probeLiveLatency(const QString& instance, double sampleRate, int maxBlockFrames, int* latencySamples,
                          QString* error = nullptr, int timeoutMs = 15000,
                          std::uint64_t* latencyGeneration = nullptr);
    bool setLiveState(const QString& instance, const QString& state, QString* error = nullptr, int timeoutMs = 15000,
                      int* latencySamples = nullptr, std::uint64_t* latencyGeneration = nullptr);
    void closeLiveAsync(const QString& instance);

    // Registers a weak packed atomic latency sink updated immediately on HostWorker's thread
    // when NodeToolVstHost emits a `latencyChanged` event (e.g. VST3 kLatencyChanged).
    void registerLatencyTarget(const QString& instance, std::weak_ptr<VstLatencyTarget> target);
    // Removes `instance` only if its stored target is expired or matches `target`, so closing an
    // older channel never clobbers a replacement channel registered under the same key.
    // Returns true if `target` was the active registration (or none remained), false if a newer target owns `instance`.
    bool unregisterLatencyTarget(const QString& instance, const VstLatencyTarget* target);

    // Increments each time the helper process exits/restarts, allowing live pools to drop stale channels.
    [[nodiscard]] std::uint64_t hostEpoch() const noexcept { return m_hostEpoch.load(std::memory_order_acquire); }

    // Terminates the child process immediately (for crash-isolation testing).
    void terminateHostForTest();
    [[nodiscard]] std::size_t editorRequestCountForTest();

    void openEditorAsync(const QString& instance, const QString& path, const QString& uid,
                         const QString& state, const QString& title, quint64 generation = 0);
    // UI thread only. Explicit document restoration also updates open editors.
    void restoreStateAsync(const QString& instance, const QJsonObject& slot, quint64 generation = 0);
    void closeEditorAsync(const QString& instance);
    void disposeAsync(const QString& instance);

signals:
    void stateRestored(const QString& instance, const QString& state, const QString& error, quint64 generation = 0);
    void scanFinished(const QVariantList& plugins, const QString& error);
    void editorOpened(const QString& instance, const QString& error);
    void editorClosedReply(const QString& instance);
    void pluginStateChanged(const QString& instance, const QString& state, quint64 generation = 0);
    void pluginEditorClosed(const QString& instance, const QString& state, quint64 generation = 0);
    void pluginLatencyChanged(const QString& instance, int latencySamples);
    void hostExited();

private:
    class HostWorker;
    struct LatencyTargetRegistry;

    bool sendSync(const QJsonObject& request, QJsonObject* reply, QString* error, int timeoutMs, std::stop_token stop = {});

    mutable std::mutex m_configMutex;
    QString m_overrideExecutable;
    QStringList m_extraScanDirs;
    bool m_hasScanned = false;
    std::vector<VstPluginInfo> m_cachedPlugins;

    // Shared with HostWorker so m_thread updates latency sinks directly without dereferencing VstHostClient.
    std::shared_ptr<LatencyTargetRegistry> m_latencyRegistry;

    QThread m_thread;
    std::unique_ptr<HostWorker> m_worker;
    std::atomic<std::uint64_t> m_hostEpoch{1};
    bool m_shutDown = false;
};

// Shared process-level client instance, shut down automatically on QCoreApplication::aboutToQuit.
// Returns a shared_ptr so mix plan stages and QML models share lifetime cleanly without dangling pointers.
[[nodiscard]] std::shared_ptr<VstHostClient> sharedVstHostClient();

}  // namespace nt::audio::vst
