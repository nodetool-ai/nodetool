// NodeToolVstHost — hosts VST3/AU instruments and effects for NodeTool's timeline in a separate
// process, so a plug-in crash never takes down the editor.
//
// Requests arrive on stdin and replies leave on stdout, one JSON object per
// line. A request carries an "id" that its reply repeats:
//
//   {"id":1,"cmd":"hello"}                     -> {"id":1,"ok":true,"protocol":1,"version":"..."}
//   {"id":2,"cmd":"scan","dirs":[...],"includeEffects":true}
//                                              -> {"id":2,"ok":true,"plugins":[{uid,name,vendor,version,path,format,isInstrument}]}
//   {"id":3,"cmd":"render","instance":"t1","path":P,"uid":U,"state":B64|null,
//    "sampleRate":48000,"frames":N,"events":[{pitch,velocity,startFrame,gateOffFrame}],
//    "out":"/tmp/x.f32"}                       -> {"id":3,"ok":true,"channels":2,"frames":N}
//      (out holds planar float32 LE: every left frame, then every right frame)
//   {"id":8,"cmd":"process","instance":"fx1","path":P,"uid":U,"state":B64|null,
//    "sampleRate":48000,"frames":N,"in":"/tmp/in.f32","out":"/tmp/out.f32"}
//                                              -> {"id":8,"ok":true,"channels":2,"frames":N}
//      (in and out hold planar float32 LE: every left frame, then every right frame)
//   {"id":4,"cmd":"openEditor","instance":"t1","path":P,"uid":U,"state":B64,"title":T}
//                                              -> {"id":4,"ok":true,"hasEditor":true}
//   {"id":5,"cmd":"closeEditor","instance":"t1"} / {"id":6,"cmd":"dispose","instance":"t1"}
//   {"id":7,"cmd":"getState","instance":"t1"}  -> {"id":7,"ok":true,"state":B64}
//   listPresets / selectPreset / getParameters / setParameters also take instance, path, uid and state.
//   listPresets -> {presets:[{index,name}],currentPresetIndex}
//   selectPreset takes presetIndex or presetName -> {preset:{index,name},state:B64}
//   getParameters -> {parameters:[{id,index,name,label,value,displayValue,defaultValue,...}]}
//   setParameters takes changes:[{id|index,value|displayValue}] -> {parameters:[...],state:B64}
//   {"cmd":"quit"}
//
// Failures reply {"id":n,"ok":false,"error":"..."}. Unrequested events:
//   {"event":"state","instance":"t1","state":B64}         the editor changed the sound
//   {"event":"editorClosed","instance":"t1","state":B64}  the user closed the window
//
// While an instance's editor is open the window is the source of truth: a
// render's "state" is not applied over it, so a render cannot undo a tweak the
// caller has not heard about yet. Explicit setState requests restore document
// history even with an editor open. joinLiveState verifies a prior live load,
// restores any mismatch, and advances the editor generation without reloading
// an already matching state.
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <atomic>
#include <cstring>
#include <condition_variable>
#include <cstdlib>
#include <iostream>
#include <thread>
#include "DenormalGuard.h"
#include "VstHost.h"
#include "VstShmProtocol.h"
#if JUCE_WINDOWS
#include <windows.h>
#else
#include <cerrno>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif
#if JUCE_MAC
#include "MacApplication.h"
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <mach/thread_policy.h>
#include <pthread.h>
#include <pthread/qos.h>
#elif !JUCE_WINDOWS
#include <pthread.h>
#include <sched.h>
#endif

using namespace juce;
using namespace vsthost;

static constexpr int PROTOCOL = 1;
static constexpr const char* SCAN_RESULT_PREFIX = "NT_VST_SCAN_RESULT:";
// native-rules #14: process-wide stdout mutex
static std::mutex outMutex;

static void send(const var& message) {
    const auto line = JSON::toString(message, true);
    std::lock_guard<std::mutex> guard(outMutex);
    std::cout << line << std::endl;
}

// native-rules #2: naked new, ownership passes to a JUCE ref-counted var
static var object() { return var(new DynamicObject()); }

static void reply(const var& id, var body) {
    body.getDynamicObject()->setProperty("id", id);
    body.getDynamicObject()->setProperty("ok", true);
    send(body);
}

static void fail(const var& id, const String& error) {
    auto body = object();
    body.getDynamicObject()->setProperty("id", id);
    body.getDynamicObject()->setProperty("ok", false);
    body.getDynamicObject()->setProperty("error", error);
    send(body);
}

static void event(const String& name, const String& instance, const String& state, const var& generation) {
    auto body = object();
    body.getDynamicObject()->setProperty("event", name);
    body.getDynamicObject()->setProperty("generation", generation);
    body.getDynamicObject()->setProperty("instance", instance);
    body.getDynamicObject()->setProperty("state", state);
    send(body);
}

static void latencyEvent(const String& instance, int latencySamples, std::uint64_t latencyGeneration) {
    auto body = object();
    body.getDynamicObject()->setProperty("event", "latencyChanged");
    body.getDynamicObject()->setProperty("instance", instance);
    body.getDynamicObject()->setProperty("latencySamples", std::clamp(latencySamples, 0, kShmMaxLatencySamples));
    body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGeneration));
    send(body);
}

// Scanner main thread owns and joins the monitor. Its state crosses threads under
// the mutex. Parent death ends the entire scanner even when plug-in discovery hangs.
class ScannerParentWatch {
public:
    explicit ScannerParentWatch(const String& parentId) {
#if JUCE_WINDOWS
        state_->parent.reset(OpenProcess(SYNCHRONIZE, FALSE, static_cast<DWORD>(parentId.getLargeIntValue())));
#else
        state_->parent = static_cast<pid_t>(parentId.getLargeIntValue());
#endif
        const std::weak_ptr<State> weak = state_;
        monitor_ = std::thread([weak] {
            const auto state = weak.lock();
            if (!state) { return; }
            std::unique_lock<std::mutex> lock(state->mutex);
            while (!state->finished) {
#if JUCE_WINDOWS
                const bool alive = state->parent && WaitForSingleObject(state->parent.get(), 0) == WAIT_TIMEOUT;
#else
                const bool alive = getppid() == state->parent;
#endif
                if (!alive) { std::_Exit(1); }
                state->changed.wait_for(lock, std::chrono::milliseconds(20), [&state] { return state->finished; });
            }
        });
    }
    ScannerParentWatch(const ScannerParentWatch&) = delete;
    ScannerParentWatch& operator=(const ScannerParentWatch&) = delete;
    ScannerParentWatch(ScannerParentWatch&&) = delete;
    ScannerParentWatch& operator=(ScannerParentWatch&&) = delete;
    ~ScannerParentWatch() {
        {
            std::lock_guard<std::mutex> lock(state_->mutex);
            state_->finished = true;
        }
        state_->changed.notify_one();
        if (monitor_.joinable()) { monitor_.join(); }
    }
private:
    // Shared because the monitor locks a weak handle and retains it until it exits.
    struct State {
        std::mutex mutex;
        std::condition_variable changed;
        bool finished = false;
#if JUCE_WINDOWS
        struct CloseParent {
            void operator()(void* handle) const { CloseHandle(handle); }
        };
        std::unique_ptr<void, CloseParent> parent;
#else
        pid_t parent = 0;
#endif
    };
    std::shared_ptr<State> state_ = std::make_shared<State>();
    std::thread monitor_;
};

// Scanner child main thread only. JUCE formats and discovered plugins die before GUI shutdown.
static var scanResult(const var& req) {
    StringArray dirs;
    if (auto* arr = req["dirs"].getArray()) {
        for (const auto& d : *arr) { dirs.add(d.toString()); }
    }
    Array<var> list;
    for (const auto& p : scan(dirs, !static_cast<bool>(req["includeEffects"]))) {
        auto o = object();
        auto* d = o.getDynamicObject();
        d->setProperty("uid", p.uid);
        d->setProperty("name", p.name);
        d->setProperty("vendor", p.vendor);
        d->setProperty("version", p.version);
        d->setProperty("path", p.path);
        d->setProperty("isInstrument", p.isInstrument);
        d->setProperty("format", p.format);
        list.add(o);
    }
    auto body = object();
    body.getDynamicObject()->setProperty("plugins", list);
    return body;
}

class Host;

#if !JUCE_WINDOWS
// RAII owner for a POSIX file descriptor.
class ScopedFd {
public:
    ScopedFd() = default;
    explicit ScopedFd(int fd) : fd_(fd) {}
    ~ScopedFd() { reset(); }
    ScopedFd(const ScopedFd&) = delete;
    ScopedFd& operator=(const ScopedFd&) = delete;
    ScopedFd(ScopedFd&& o) noexcept : fd_(o.fd_) { o.fd_ = -1; }
    ScopedFd& operator=(ScopedFd&& o) noexcept {
        if (this != &o) { reset(); fd_ = o.fd_; o.fd_ = -1; }
        return *this;
    }
    int get() const noexcept { return fd_; }
    bool valid() const noexcept { return fd_ >= 0; }
    void reset(int fd = -1) noexcept {
        if (fd_ >= 0) ::close(fd_);
        fd_ = fd;
    }
private:
    int fd_ = -1;
};

// RAII owner for a file-backed MAP_SHARED ShmBuffer.
class MappedShm {
public:
    MappedShm() = default;
    ~MappedShm() { reset(); }
    MappedShm(const MappedShm&) = delete;
    MappedShm& operator=(const MappedShm&) = delete;
    MappedShm(MappedShm&& o) noexcept : ptr_(o.ptr_) { o.ptr_ = nullptr; }
    MappedShm& operator=(MappedShm&& o) noexcept {
        if (this != &o) { reset(); ptr_ = o.ptr_; o.ptr_ = nullptr; }
        return *this;
    }
    bool open(const String& path, String& error) {
        reset();
        ScopedFd fd(::open(path.toRawUTF8(), O_RDWR));
        if (!fd.valid()) { error = "Cannot open shared memory " + path; return false; }
        void* raw = ::mmap(nullptr, sizeof(ShmBuffer), PROT_READ | PROT_WRITE, MAP_SHARED, fd.get(), 0);
        if (raw == MAP_FAILED) { error = "Cannot mmap shared memory " + path; return false; }
        auto* buf = static_cast<ShmBuffer*>(raw);
        if (buf->header.magic != kShmMagic || buf->header.version != kShmVersion) {
            ::munmap(raw, sizeof(ShmBuffer));
            error = "Shared memory header mismatch";
            return false;
        }
        ptr_ = buf;
        return true;
    }
    void reset() noexcept {
        if (ptr_) { ::munmap(ptr_, sizeof(ShmBuffer)); ptr_ = nullptr; }
    }
    ShmBuffer* get() const noexcept { return ptr_; }
private:
    ShmBuffer* ptr_ = nullptr;
};

struct RtPolicyStatus {
    bool qosOk = false;
    bool rtPolicyOk = false;
    int qosErr = 0;
    int rtErr = 0;
};

// Configures real-time scheduling policy for `targetThread` derived from the actual render quantum
// (never SHM capacity) and checks every policy return code (C6). Called strictly during quiescent
// startup handshake or control-plane reprepare/scheduling updates — NEVER inside a render block deadline.
static RtPolicyStatus applyHostAudioTimeConstraint(std::thread::native_handle_type targetThread,
                                                   double sampleRate, int renderQuantumFrames,
                                                   bool isCurrentThread) noexcept {
    RtPolicyStatus status;
#if JUCE_MAC
    if (isCurrentThread) {
        status.qosErr = pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
        status.qosOk = (status.qosErr == 0);
    } else {
        status.qosOk = true;
    }
    mach_timebase_info_data_t tb{};
    const kern_return_t tbRes = mach_timebase_info(&tb);
    if (tbRes != KERN_SUCCESS || tb.numer == 0) {
        status.rtErr = static_cast<int>(tbRes);
        return status;
    }
    const double sr = (sampleRate >= 8000.0 && sampleRate <= 384000.0) ? sampleRate : 48000.0;
    const int frames = std::clamp(renderQuantumFrames, 16, static_cast<int>(kShmMaxFrames));
    const double periodNs = (static_cast<double>(frames) / sr) * 1e9;
    const auto nsToMach = [&](double ns) -> uint32_t {
        return static_cast<uint32_t>(std::max(1.0, ns * static_cast<double>(tb.denom) / static_cast<double>(tb.numer)));
    };
    const uint32_t periodMach = nsToMach(periodNs);
    const uint32_t compMach = std::clamp(nsToMach(periodNs * 0.5), uint32_t{1}, periodMach);
    const uint32_t constraintMach = std::clamp(nsToMach(periodNs * 0.85), compMach, periodMach);
    thread_time_constraint_policy_data_t policy{};
    policy.period = periodMach;
    policy.computation = compMach;
    policy.constraint = constraintMach;
    policy.preemptible = 1;
    const kern_return_t kr = thread_policy_set(
        pthread_mach_thread_np(targetThread),
        THREAD_TIME_CONSTRAINT_POLICY,
        reinterpret_cast<thread_policy_t>(&policy),
        THREAD_TIME_CONSTRAINT_POLICY_COUNT);
    status.rtErr = static_cast<int>(kr);
    status.rtPolicyOk = (kr == KERN_SUCCESS);
#elif !JUCE_WINDOWS
    (void)sampleRate;
    (void)renderQuantumFrames;
    (void)isCurrentThread;
    status.qosOk = true;
    sched_param sp{};
    const int maxPrio = sched_get_priority_max(SCHED_FIFO);
    if (maxPrio > 0) {
        sp.sched_priority = std::max(1, maxPrio / 2);
        status.rtErr = pthread_setschedparam(targetThread, SCHED_FIFO, &sp);
        status.rtPolicyOk = (status.rtErr == 0);
    } else {
        status.rtErr = errno;
    }
#else
    (void)targetThread; (void)sampleRate; (void)renderQuantumFrames; (void)isCurrentThread;
#endif
    return status;
}

// Real-time shared-memory audio session for one live plug-in instance.
// Thread affinity: constructed and destroyed on the JUCE message thread;
// owns `worker_` which runs the real-time block loop until `sock_` closes.
// `scratchBlock_` and `scratchMidi_` are preallocated for `inst_->preparedChannels()`
// and worst-case MIDI replay before `worker_` starts, and reallocated only off the worker
// while paused in reprepare(). `liveState_` is owned and touched solely by `worker_`.
class LiveSession {
public:
    LiveSession(std::shared_ptr<Instance> inst, MappedShm shm, ScopedFd sock,
                double sampleRate, int maxFrames, int renderQuantumFrames)
        : inst_(std::move(inst)),
          shm_(std::move(shm)),
          sock_(std::move(sock)),
          rtSampleRate_(sampleRate),
          rtQuantumFrames_(std::clamp(renderQuantumFrames > 0 ? renderQuantumFrames : maxFrames,
                                      16, static_cast<int>(kShmMaxFrames))) {
        // Use setSize() (16-byte-aligned channelListSize) so subsequent avoidReallocating=true
        // shrink/restore calls in processLiveBlock() never reallocate for >=32 channels (D7).
        scratchBlock_.setSize(std::max(2, inst_ ? inst_->preparedChannels() : 2),
                              static_cast<int>(kShmMaxFrames), false, true, false);
        // C4: Preallocate worst-case replay storage (overflow reconciliation + current block)
        // before starting the worker so host render thread never allocates on MIDI replay.
        scratchMidi_.ensureSize(LiveRenderState::kWorstCaseReplayMidiBytes);
        worker_ = std::thread([this] { run(); });
        // C6: Quiescent startup handshake — wait until the worker has applied QoS and
        // real-time thread policy before openLive replies and any render work is accepted.
        std::unique_lock<std::mutex> lk(readyMutex_);
        readyCv_.wait(lk, [this] { return workerReady_; });
    }
    ~LiveSession() {
        stop_.store(true, std::memory_order_release);
        if (sock_.valid()) ::shutdown(sock_.get(), SHUT_RDWR);
        if (worker_.joinable()) worker_.join();
        sock_.reset();
        shm_.reset();
    }
    LiveSession(const LiveSession&) = delete;
    LiveSession& operator=(const LiveSession&) = delete;

    [[nodiscard]] int configuredQuantumFrames() const noexcept { return rtQuantumFrames_; }
    [[nodiscard]] bool rtPolicyApplied() const noexcept { return lastPolicy_.rtPolicyOk; }

    // Message thread only: re-prepares the plug-in, grows scratch for any new bus layout,
    // and updates host worker scheduling off the render thread (C6).
    bool reprepare(double sampleRate, int maxFrames, int renderQuantumFrames, String& error) {
        std::lock_guard<std::mutex> scratchGuard(scratchMutex_);
        if (!inst_->prepareLive(sampleRate, maxFrames, error)) return false;
        const int neededChannels = std::max(2, inst_->preparedChannels());
        if (scratchBlock_.getNumChannels() < neededChannels ||
            scratchBlock_.getNumSamples() < static_cast<int>(kShmMaxFrames)) {
            scratchBlock_.setSize(neededChannels, static_cast<int>(kShmMaxFrames), false, true, false);
        }
        applySchedulingLocked(sampleRate, renderQuantumFrames > 0 ? renderQuantumFrames : maxFrames);
        // D9: Signal the worker to crossfade smoothly from lastOutL/R after prepareLive() resets plugin state.
        reprepared_.store(true, std::memory_order_release);
        return true;
    }

    // Message thread only: updates worker RT scheduling period without resetting the plug-in (C2 + C6).
    void updateScheduling(double sampleRate, int renderQuantumFrames) {
        if (renderQuantumFrames <= 0) return;
        applySchedulingLocked(sampleRate, renderQuantumFrames);
    }

private:
    void applySchedulingLocked(double sampleRate, int renderQuantumFrames) noexcept {
        const int clampedQuantum = std::clamp(renderQuantumFrames, 16, static_cast<int>(kShmMaxFrames));
        rtSampleRate_ = sampleRate;
        rtQuantumFrames_ = clampedQuantum;
        if (worker_.joinable()) {
            lastPolicy_ = applyHostAudioTimeConstraint(worker_.native_handle(), sampleRate, clampedQuantum,
                                                       /*isCurrentThread=*/false);
            if (!lastPolicy_.rtPolicyOk) {
                std::cerr << "NodeToolVstHost: RT thread policy update failed (err=" << lastPolicy_.rtErr
                          << ", rate=" << sampleRate << ", quantum=" << clampedQuantum << ")" << std::endl;
            }
        }
    }

    void run() {
        const RtPolicyStatus startupPolicy =
            applyHostAudioTimeConstraint(pthread_self(), rtSampleRate_, rtQuantumFrames_, /*isCurrentThread=*/true);
        if (!startupPolicy.rtPolicyOk || !startupPolicy.qosOk) {
            std::cerr << "NodeToolVstHost: startup RT thread policy partial/failed (qosErr=" << startupPolicy.qosErr
                      << ", rtErr=" << startupPolicy.rtErr << ", rate=" << rtSampleRate_
                      << ", quantum=" << rtQuantumFrames_ << ")" << std::endl;
        }
        {
            std::lock_guard<std::mutex> lk(readyMutex_);
            lastPolicy_ = startupPolicy;
            workerReady_ = true;
        }
        readyCv_.notify_all();

        auto* shm = shm_.get();
        while (!stop_.load(std::memory_order_acquire)) {
            std::uint8_t ping = 0;
            ssize_t r = 0;
            do { r = ::read(sock_.get(), &ping, 1); } while (r < 0 && errno == EINTR);
            if (r <= 0) break;

            const std::uint64_t seq = shm->header.requestSeq.load(std::memory_order_acquire);
            const std::uint32_t flags = shm->header.flags;
            const std::uint8_t pong = 1;
#ifdef MSG_NOSIGNAL
            constexpr int kSendFlags = MSG_NOSIGNAL;
#else
            constexpr int kSendFlags = 0;
#endif
            if (flags & kShmFlagClose) {
                shm->header.status = 2;
                shm->header.responseSeq.store(seq, std::memory_order_release);
                (void)::send(sock_.get(), &pong, 1, kSendFlags);
                break;
            }
            const int frames = static_cast<int>(std::min<std::uint32_t>(shm->header.numFrames, kShmMaxFrames));
            const int numMidi = static_cast<int>(std::min<std::uint32_t>(shm->header.numMidiEvents, kShmMaxMidiEvents));
            const bool resetFlag = (flags & kShmFlagReset) != 0;
            int latency = 0;
            std::uint64_t latencyGen = 0;
            bool ok = false;
            {
                std::unique_lock<std::mutex> scratchGuard(scratchMutex_, std::try_to_lock);
                if (scratchGuard.owns_lock()) {
                    if (reprepared_.exchange(false, std::memory_order_acq_rel)) {
                        liveState_.paused = true;
                    }
                    // Re-assert FTZ/DAZ each block in case a plug-in alters FP control state.
                    const ScopedDenormalGuard denormalGuard;
                    ok = inst_->processLiveBlock(
                        shm->header.sampleRate, frames, resetFlag,
                        shm->inLeft, shm->inRight, shm->outLeft, shm->outRight,
                        shm->midi, numMidi, scratchBlock_, scratchMidi_, &latency, &latencyGen, &liveState_);
                } else {
                    // D9 + D6: smooth fade-out and MIDI/reset capture while reprepare() holds scratchMutex_.
                    liveState_.writeContendedBlock(frames, resetFlag, shm->midi, numMidi,
                                                   shm->outLeft, shm->outRight);
                    latency = inst_->latencySamples();
                    latencyGen = inst_->latencyGeneration();
                    ok = true;
                }
            }
            // Read under the instance lock inside processLiveBlock: a state load changes it.
            shm->header.latencySamples = latency;
            shm->header.latencyGeneration = latencyGen;
            shm->header.status = ok ? 0u : 1u;
            shm->header.responseSeq.store(seq, std::memory_order_release);
            ssize_t w = 0;
            do { w = ::send(sock_.get(), &pong, 1, kSendFlags); } while (w < 0 && errno == EINTR);
            if (w <= 0) break;
        }
    }

    // Shared with Host::instances_ so an open plugin editor modifies this exact live instance.
    std::shared_ptr<Instance> inst_;
    MappedShm shm_;
    ScopedFd sock_;
    // Guards scratchBlock_/scratchMidi_ against rare prepareLive channel layout changes.
    std::mutex scratchMutex_;
    AudioBuffer<float> scratchBlock_;
    MidiBuffer scratchMidi_;
    // Touched solely by `worker_`.
    LiveRenderState liveState_;
    // Quiescent startup handshake synchronization (message thread waits before openLive replies).
    std::mutex readyMutex_;
    std::condition_variable readyCv_;
    bool workerReady_ = false;
    // Message-thread-only after workerReady_ becomes true.
    double rtSampleRate_ = 48000.0;
    int rtQuantumFrames_ = static_cast<int>(kShmMaxFrames);
    RtPolicyStatus lastPolicy_{};
    std::atomic<bool> reprepared_{false};
    std::atomic<bool> stop_{false};
    std::thread worker_;
};
#endif

class EditorWindow : public DocumentWindow {
public:
    EditorWindow(const String& title, AudioProcessorEditor* editor, std::function<void()> onClose)
        : DocumentWindow(title, Colours::black, DocumentWindow::closeButton | DocumentWindow::minimiseButton),
          onClose_(std::move(onClose)) {
        setUsingNativeTitleBar(true);
        setContentOwned(editor, true);
        setResizable(editor->isResizable(), false);
        centreWithSize(getWidth(), getHeight());
        setVisible(true);
        toFront(true);
    }
    void closeButtonPressed() override { if (onClose_) onClose_(); }

private:
    std::function<void()> onClose_;
};

// Message thread only. Render workers receive shared Instance handles and send static replies.
class Host : private Timer {
public:
    Host() { startTimer(400); }
    ~Host() override {
        stopTimer();
        scans_.clear();
#if !JUCE_WINDOWS
        liveSessions_.clear();
#endif
        editors_.clear();
        for (auto& [_, inst] : instances_) {
            if (inst) inst->setLatencyChangedCallback({});
        }
        instances_.clear();
    }

    // Runs on the message thread.
    void handle(const var& req) {
        const var id = req["id"];
        const String cmd = req["cmd"].toString();
        const String key = req["instance"].toString();
        if (cmd == "hello") {
            auto body = object();
            body.getDynamicObject()->setProperty("protocol", PROTOCOL);
            body.getDynamicObject()->setProperty("version", String(NODETOOL_VSTHOST_VERSION));
            body.getDynamicObject()->setProperty("platform", SystemStats::getOperatingSystemName());
            reply(id, body);
        } else if (cmd == "scan") {
            scanAsync(id, req);
        } else if (cmd == "render") {
            String error;
            auto inst = ensure(key, req, error, false);
            if (!inst) { fail(id, error); return; }
            renderAsync(id, std::move(inst), req, editors_.count(key) == 0);
        } else if (cmd == "process") {
            String error;
            auto inst = ensure(key, req, error, false);
            if (!inst) { fail(id, error); return; }
            processAsync(id, std::move(inst), req, editors_.count(key) == 0);
        } else if (cmd == "openLive") {
#if !JUCE_WINDOWS
            String error;
            auto inst = ensure(key, req, error, editors_.count(key) == 0);
            if (!inst) { fail(id, error); return; }
            const double rate = (double)req["sampleRate"];
            const int maxFrames = std::clamp((int)req["maxBlockFrames"], 64, static_cast<int>(kShmMaxFrames));
            const int quantumFrames = req.hasProperty("renderQuantumFrames")
                ? std::clamp((int)req["renderQuantumFrames"], 16, maxFrames)
                : maxFrames;
            // Stop the old session first: its worker must not run while prepareLive changes the plug-in.
            liveSessions_.erase(key);
            if (!inst->prepareLive(rate, maxFrames, error)) { fail(id, error); return; }
            MappedShm shm;
            if (!shm.open(req["shmPath"].toString(), error)) { fail(id, error); return; }
            const String sockPath = req["sockPath"].toString();
            ScopedFd sock(::socket(AF_UNIX, SOCK_STREAM, 0));
            if (!sock.valid()) { fail(id, "Cannot create unix socket"); return; }
#if JUCE_MAC
            int noSigPipe = 1;
            ::setsockopt(sock.get(), SOL_SOCKET, SO_NOSIGPIPE, &noSigPipe, sizeof(noSigPipe));
#endif
            sockaddr_un addr{};
            addr.sun_family = AF_UNIX;
            const auto utf8 = sockPath.toRawUTF8();
            if (std::strlen(utf8) >= sizeof(addr.sun_path)) { fail(id, "Socket path too long"); return; }
            std::strncpy(addr.sun_path, utf8, sizeof(addr.sun_path) - 1);
            if (::connect(sock.get(), reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
                fail(id, "Cannot connect to live audio socket " + sockPath);
                return;
            }
            std::uint64_t latencyGen = 0;
            const int latency = inst->refreshLatency(&latencyGen);
            auto session = std::make_unique<LiveSession>(std::move(inst), std::move(shm), std::move(sock),
                                                         rate, maxFrames, quantumFrames);
            const int configuredQuantum = session->configuredQuantumFrames();
            const bool policyApplied = session->rtPolicyApplied();
            liveSessions_[key] = std::move(session);
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGen));
            body.getDynamicObject()->setProperty("renderQuantumFrames", configuredQuantum);
            body.getDynamicObject()->setProperty("rtPolicyApplied", policyApplied);
            reply(id, body);
#else
            fail(id, "Live shared-memory VST hosting is not supported on Windows yet");
#endif
        } else if (cmd == "prepareLive") {
#if !JUCE_WINDOWS
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            String error;
            const double rate = (double)req["sampleRate"];
            const int maxFrames = std::clamp((int)req["maxBlockFrames"], 64, static_cast<int>(kShmMaxFrames));
            const int quantumFrames = req.hasProperty("renderQuantumFrames")
                ? std::clamp((int)req["renderQuantumFrames"], 16, maxFrames)
                : maxFrames;
            const bool schedulingOnly = static_cast<bool>(req["schedulingOnly"]);
            int configuredQuantum = quantumFrames;
            bool policyApplied = false;
            if (liveSessions_.count(key) > 0) {
                auto& session = liveSessions_[key];
                if (schedulingOnly) {
                    session->updateScheduling(rate, quantumFrames);
                } else if (!session->reprepare(rate, maxFrames, quantumFrames, error)) {
                    fail(id, error);
                    return;
                }
                configuredQuantum = session->configuredQuantumFrames();
                policyApplied = session->rtPolicyApplied();
            } else if (!schedulingOnly) {
                if (!it->second->prepareLive(rate, maxFrames, error)) {
                    fail(id, error);
                    return;
                }
            }
            std::uint64_t latencyGen = 0;
            const int latency = it->second->refreshLatency(&latencyGen);
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGen));
            body.getDynamicObject()->setProperty("renderQuantumFrames", configuredQuantum);
            body.getDynamicObject()->setProperty("rtPolicyApplied", policyApplied);
            reply(id, body);
#else
            fail(id, "Live shared-memory VST hosting is not supported on Windows yet");
#endif
        } else if (cmd == "getLatency") {
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            int latency = 0;
            std::uint64_t latencyGen = 0;
            String error;
            const double rate = req.hasProperty("sampleRate") ? (double)req["sampleRate"] : 0.0;
            const int maxFrames = req.hasProperty("maxBlockFrames") ? std::max(64, (int)req["maxBlockFrames"]) : 512;
            if (!it->second->probeLiveLatency(rate, maxFrames, latency, error, &latencyGen)) { fail(id, error); return; }
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGen));
            reply(id, body);
        } else if (cmd == "setState" || cmd == "joinLiveState") {
            String error;
            auto inst = ensure(key, req, error, false);
            if (!inst) { fail(id, error); return; }
            // A prior live load may have failed or skipped an open editor.
            // Verify on the host message thread before adopting its generation.
            const auto state = req["state"].toString();
            // Compare and restore on the message thread, where editor gestures run.
            // A knob edit after assistant capture must survive the document commit.
            if (req.hasProperty("expectedState") && inst->getState() != req["expectedState"].toString()) {
                generations_[key] = req["generation"];
                const auto current = inst->getState();
                if (auto editor = editors_.find(key); editor != editors_.end()) {
                    editor->second.lastState = current;
                }
                fail(id, "Editor changed during plugin request. Read its state and retry.");
                event("state", key, current, generations_[key]);
                return;
            }
            if ((cmd != "joinLiveState" || inst->getState() != state)
                && !inst->setState(state, error)) { fail(id, error); return; }
            generations_[key] = req["generation"];
            if (auto editor = editors_.find(key); editor != editors_.end()) {
                editor->second.lastState = inst->getState();
            }
            std::uint64_t latencyGen = 0;
            const int latency = inst->refreshLatency(&latencyGen);
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGen));
            reply(id, body);
        } else if (cmd == "setLiveState") {
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            if (editors_.count(key) == 0) {
                String error;
                if (!it->second->setState(req["state"].toString(), error)) { fail(id, error); return; }
            }
            std::uint64_t latencyGen = 0;
            const int latency = it->second->refreshLatency(&latencyGen);
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            body.getDynamicObject()->setProperty("latencyGeneration", static_cast<juce::int64>(latencyGen));
            reply(id, body);
        } else if (cmd == "closeLive") {
#if !JUCE_WINDOWS
            liveSessions_.erase(key);
#endif
            reply(id, object());
        } else if (cmd == "openEditor") {
            String error;
            auto inst = ensure(key, req, error, true);
            if (!inst) { fail(id, error); return; }
            if (!openEditor(key, *inst, req["title"].toString(), error)) { fail(id, error); return; }
            generations_[key] = req["generation"];
            auto body = object();
            body.getDynamicObject()->setProperty("hasEditor", true);
            reply(id, body);
        } else if (cmd == "closeEditor") {
            closeEditor(key, false);
            reply(id, object());
        } else if (cmd == "listPresets" || cmd == "selectPreset" || cmd == "getParameters" || cmd == "setParameters") {
            String error;
            auto inst = ensure(key, req, error, true);
            if (!inst) { fail(id, error); return; }
            std::lock_guard<std::recursive_mutex> guard(inst->lock);
            if (cmd == "selectPreset" && !inst->selectPreset(req["presetIndex"], req["presetName"].toString(), error)) {
                fail(id, error); return;
            }
            if (cmd == "setParameters" && !inst->setParameters(req["changes"], error)) { fail(id, error); return; }
            auto body = cmd == "listPresets" || cmd == "selectPreset" ? inst->listPresets() : inst->getParameters();
            if (cmd == "selectPreset") {
                const int index = static_cast<int>(body["currentPresetIndex"]);
                body.getDynamicObject()->setProperty("preset", body["presets"][index]);
            }
            if (cmd == "selectPreset" || cmd == "setParameters") {
                body.getDynamicObject()->setProperty("state", inst->getState());
            }
            reply(id, body);
        } else if (cmd == "getState") {
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            auto body = object();
            body.getDynamicObject()->setProperty("state", it->second->getState());
            reply(id, body);
        } else if (cmd == "dispose") {
#if !JUCE_WINDOWS
            liveSessions_.erase(key);
#endif
            closeEditor(key, false);
            if (auto it = instances_.find(key); it != instances_.end() && it->second) {
                it->second->setLatencyChangedCallback({});
            }
            // A render still running keeps its instance until it finishes.
            instances_.erase(key);
            generations_.erase(key);
            reply(id, object());
        } else if (cmd == "quit") {
            MessageManager::getInstance()->stopDispatchLoop();
        } else {
            fail(id, "Unknown command " + cmd);
        }
    }

private:
    // The instance for `key`, loaded with the requested plug-in. `applyState`
    // sets the request's state now; a render applies it on its own thread
    // instead, under the lock, so two queued renders cannot swap states.
    std::shared_ptr<Instance> ensure(const String& key, const var& req, String& error, bool applyState) {
        if (key.isEmpty()) { error = "Missing instance"; return nullptr; }
        const String path = req["path"].toString(), uid = req["uid"].toString();
        auto& slot = instances_[key];
        if (!slot || slot->path() != path || (uid.isNotEmpty() && slot->uid() != uid)) {
#if !JUCE_WINDOWS
            liveSessions_.erase(key);
#endif
            closeEditor(key, false);
            if (slot) slot->setLatencyChangedCallback({});
            auto inst = std::make_shared<Instance>();
            if (!inst->load(path, uid, error)) { instances_.erase(key); return nullptr; }
            inst->setLatencyChangedCallback([key](int lat, std::uint64_t gen) { latencyEvent(key, lat, gen); });
            slot = std::move(inst);
        }
        const bool editing = editors_.count(key) > 0;
        if (applyState && !editing && !slot->setState(req["state"].toString(), error)) return nullptr;
        return slot;
    }

    void scanAsync(const var& id, const var& req) {
        auto job = std::make_unique<ScanJob>();
        job->id = id;
#if JUCE_WINDOWS
        const auto parentId = String(static_cast<int64>(GetCurrentProcessId()));
#else
        const auto parentId = String(static_cast<int64>(getpid()));
#endif
        const StringArray args{File::getSpecialLocation(File::currentExecutableFile).getFullPathName(),
                               "--scan", JSON::toString(req, true), parentId};
        if (!job->output->process.start(args, ChildProcess::wantStdOut)) { fail(id, "Cannot start plugin scanner"); return; }
        const std::weak_ptr<ScanOutput> output = job->output;
        job->reader = std::thread([output] {
            if (const auto state = output.lock()) { state->result = state->process.readAllProcessOutput(); }
        });
        scans_.push_back(std::move(job));
    }

    void renderAsync(const var& id, std::shared_ptr<Instance> inst, const var& req, bool applyState) {
        std::vector<NoteEvent> events;
        if (auto* arr = req["events"].getArray())
            for (auto& e : *arr)
                events.push_back({ (int)e["pitch"], (int)e["velocity"], (int64)e["startFrame"], (int64)e["gateOffFrame"] });
        const double rate = (double)req["sampleRate"];
        const int64 frames = (int64)req["frames"];
        const File out(req["out"].toString());
        if (!File::isAbsolutePath(req["out"].toString())) { fail(id, "Render output must be an absolute path"); return; }
        const String state = req["state"].toString();
        // native-rules #13: detached thread is not joined or cancelled at shutdown
        std::thread([id, inst = std::move(inst), events, rate, frames, out, state, applyState]() mutable {
            [&] {
                AudioBuffer<float> buffer;
                String error;
                std::lock_guard<std::recursive_mutex> guard(inst->lock);
                if (!renderWithState(*inst, applyState, state, rate, frames, events, buffer, error)) { fail(id, error); return; }
                if (!writePlanarF32(buffer, out)) { fail(id, "Cannot write " + out.getFullPathName()); return; }
                auto body = object();
                body.getDynamicObject()->setProperty("channels", 2);
                body.getDynamicObject()->setProperty("frames", frames);
                reply(id, body);
            }();
            // A disposed instance is destroyed here, on the message thread
            // plug-ins expect, rather than on this worker.
            MessageManager::callAsync([keep = std::move(inst)] {});
        }).detach();
    }

    void processAsync(const var& id, std::shared_ptr<Instance> inst, const var& req, bool applyState) {
        const double rate = (double)req["sampleRate"];
        const int64 frames = (int64)req["frames"];
        const String inPath = req["in"].toString();
        const String outPath = req["out"].toString();
        if (!File::isAbsolutePath(inPath)) { fail(id, "Process input must be an absolute path"); return; }
        if (!File::isAbsolutePath(outPath)) { fail(id, "Process output must be an absolute path"); return; }
        const File inFile(inPath), outFile(outPath);
        const String state = req["state"].toString();
        // native-rules #13: detached thread is not joined or cancelled at shutdown
        std::thread([id, inst = std::move(inst), rate, frames, inFile, outFile, state, applyState]() mutable {
            [&] {
                AudioBuffer<float> input, output;
                String error;
                if (!readPlanarF32(inFile, input, frames)) { fail(id, "Cannot read " + inFile.getFullPathName()); return; }
                std::lock_guard<std::recursive_mutex> guard(inst->lock);
                if (!processWithState(*inst, applyState, state, rate, input, output, error)) { fail(id, error); return; }
                if (!writePlanarF32(output, outFile)) { fail(id, "Cannot write " + outFile.getFullPathName()); return; }
                auto body = object();
                body.getDynamicObject()->setProperty("channels", 2);
                body.getDynamicObject()->setProperty("frames", frames);
                reply(id, body);
            }();
            MessageManager::callAsync([keep = std::move(inst)] {});
        }).detach();
    }

    bool openEditor(const String& key, Instance& inst, const String& title, String& error) {
        if (auto it = editors_.find(key); it != editors_.end()) {
            if (it->second.window) { it->second.window->toFront(true); }
            return true;
        }
        auto* plugin = inst.plugin();
        if (!plugin->hasEditor()) { error = plugin->getName() + " has no editor"; return false; }
        // Headless harnesses exercise the editor session and polling without an OS window.
        if (SystemStats::getEnvironmentVariable("QT_QPA_PLATFORM", {}) == "offscreen") {
            Editor session;
            session.lastState = inst.getState();
            editors_[key] = std::move(session);
            return true;
        }
        auto* editor = plugin->createEditorIfNeeded();
        if (!editor) { error = plugin->getName() + " did not create its editor"; return false; }
       #if JUCE_MAC
        Process::setDockIconVisible(true);
       #endif
        Process::makeForegroundProcess();
        Editor e;
        e.window = std::make_unique<EditorWindow>(title.isNotEmpty() ? title : plugin->getName(), editor,
            // native-rules #12: lambdas capture raw this and run later on the message thread
            [this, key] { MessageManager::callAsync([this, key] { closeEditor(key, true); }); });
        e.lastState = inst.getState();
        editors_[key] = std::move(e);
        return true;
    }

    void closeEditor(const String& key, bool announce) {
        auto it = editors_.find(key);
        if (it == editors_.end()) return;
        it->second.window.reset();
        editors_.erase(it);
        if (announce)
            if (auto inst = instances_.find(key); inst != instances_.end())
                event("editorClosed", key, inst->second->getState(), generations_[key]);
    }

    // The editor changes the sound by setting parameters inside the plug-in;
    // poll its state and announce each change.
    void timerCallback() override {
        for (auto it = scans_.begin(); it != scans_.end();) {
            auto& job = **it;
            const bool running = job.output->process.isRunning();
            if (running && Time::getMillisecondCounterHiRes() - job.started < 180000.0) { ++it; continue; }
            if (running) {
                fail(job.id, "Plugin scanner timed out");
            } else {
                if (job.reader.joinable()) { job.reader.join(); }
                const auto offset = job.output->result.lastIndexOf(SCAN_RESULT_PREFIX);
                const auto result = offset < 0 ? var() : JSON::parse(job.output->result.substring(
                    offset + static_cast<int>(std::strlen(SCAN_RESULT_PREFIX))));
                if (job.output->process.getExitCode() != 0 || !result.isObject() || !result["plugins"].isArray()) {
                    fail(job.id, "Plugin scanner failed");
                } else {
                    reply(job.id, result);
                }
            }
            it = scans_.erase(it);
        }
        for (auto& [key, editor] : editors_) {
            auto inst = instances_.find(key);
            if (inst == instances_.end()) continue;
            // C2: tryGetState() holds `lock` only for getStateInformation(), never for Base64/JSON/stdout.
            const auto maybeState = inst->second->tryGetState();
            if (!maybeState.has_value()) continue;
            const auto& state = *maybeState;
            if (state != editor.lastState) {
                editor.lastState = state;
                event("state", key, state, generations_[key]);
            }
        }
    }

    // Start, status, kill and reaping stay on the message thread. Only the pipe
    // reader touches ChildProcess's read handle. The result transfers through join.
    struct ScanOutput {
        ChildProcess process;
        String result;
    };
    // Message thread owns the job and joins its pipe reader after killing/reaping.
    struct ScanJob {
        ~ScanJob() {
            if (output->process.isRunning()) { output->process.kill(); output->process.waitForProcessToFinish(1000); }
            if (reader.joinable()) { reader.join(); }
        }
        var id;
        // Shared because an asynchronous pipe read must retain the process until EOF.
        std::shared_ptr<ScanOutput> output = std::make_shared<ScanOutput>();
        std::thread reader;
        double started = Time::getMillisecondCounterHiRes();
    };
    std::vector<std::unique_ptr<ScanJob>> scans_;
    struct Editor {
        std::unique_ptr<EditorWindow> window;
        String lastState;
    };
    // Render workers and live sessions retain the same plugin while the host owns editors.
    std::map<String, std::shared_ptr<Instance>> instances_;
    std::map<String, Editor> editors_;
    std::map<String, var> generations_;
#if !JUCE_WINDOWS
    std::map<String, std::unique_ptr<LiveSession>> liveSessions_;
#endif
};

int main(int argc, char** argv) {
   #if JUCE_MAC
    initialiseMacApplication();
   #endif
    ScopedJuceInitialiser_GUI init;
    if (argc == 4 && String(argv[1]) == "--scan") {
        ScannerParentWatch parent{String(argv[3])};
        const auto req = JSON::parse(String(argv[2]));
        if (!req.isObject()) { return 1; }
        const auto result = scanResult(req);
        std::cout << '\n' << SCAN_RESULT_PREFIX << JSON::toString(result, true) << std::endl;
        return std::cout.good() ? 0 : 1;
    }
    auto host = std::make_unique<Host>();
    auto* hostPtr = host.get();
    // stdin closing (the caller exited) ends the helper.
    // native-rules #12: lambda captures raw Host pointer and runs on the reader thread
    std::thread reader([hostPtr] {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.empty()) continue;
            const var req = JSON::parse(String::fromUTF8(line.c_str()));
            if (!req.isObject()) { fail(var(), "Request is not a JSON object"); continue; }
            // native-rules #12: lambda captures raw Host pointer and runs later
            MessageManager::callAsync([hostPtr, req] { hostPtr->handle(req); });
            if (req["cmd"].toString() == "quit") return;
        }
        MessageManager::callAsync([] { MessageManager::getInstance()->stopDispatchLoop(); });
    });
    MessageManager::getInstance()->runDispatchLoop();
    host.reset();
    // native-rules #13: detached reader can still call the Host after host.reset()
    reader.detach();
    return 0;
}
