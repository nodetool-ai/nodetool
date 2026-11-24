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
// history even with an editor open.
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <atomic>
#include <cstring>
#include <condition_variable>
#include <cstdlib>
#include <iostream>
#include <thread>
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

// Real-time shared-memory audio session for one live plug-in instance.
// Thread affinity: constructed and destroyed on the JUCE message thread;
// owns `worker_` which runs the real-time block loop until `sock_` closes.
class LiveSession {
public:
    LiveSession(std::shared_ptr<Instance> inst, MappedShm shm, ScopedFd sock)
        : inst_(std::move(inst)), shm_(std::move(shm)), sock_(std::move(sock)) {
        worker_ = std::thread([this] { run(); });
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

private:
    void run() {
        // Pre-allocate scratch buffers once so processBlock performs zero allocations.
        AudioBuffer<float> scratchBlock(4, static_cast<int>(kShmMaxFrames));
        MidiBuffer scratchMidi;
        scratchMidi.ensureSize(4096);
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
            int latency = 0;
            const bool ok = inst_->processLiveBlock(
                shm->header.sampleRate, frames, (flags & kShmFlagReset) != 0,
                shm->inLeft, shm->inRight, shm->outLeft, shm->outRight,
                shm->midi, numMidi, scratchBlock, scratchMidi, &latency);
            // Read under the instance lock inside processLiveBlock: a state load changes it.
            shm->header.latencySamples = latency;
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
            const int maxFrames = std::max(64, (int)req["maxBlockFrames"]);
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
            const int latency = inst->plugin() ? std::max(0, inst->plugin()->getLatencySamples()) : 0;
            liveSessions_[key] = std::make_unique<LiveSession>(std::move(inst), std::move(shm), std::move(sock));
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            reply(id, body);
#else
            fail(id, "Live shared-memory VST hosting is not supported on Windows yet");
#endif
        } else if (cmd == "prepareLive") {
#if !JUCE_WINDOWS
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            String error;
            if (!it->second->prepareLive((double)req["sampleRate"], std::max(64, (int)req["maxBlockFrames"]), error)) {
                fail(id, error);
                return;
            }
            const int latency = it->second->plugin() ? std::max(0, it->second->plugin()->getLatencySamples()) : 0;
            auto body = object();
            body.getDynamicObject()->setProperty("latencySamples", latency);
            reply(id, body);
#else
            fail(id, "Live shared-memory VST hosting is not supported on Windows yet");
#endif
        } else if (cmd == "setState") {
            String error;
            auto inst = ensure(key, req, error, false);
            if (!inst || !inst->setState(req["state"].toString(), error)) { fail(id, error); return; }
            generations_[key] = req["generation"];
            if (auto editor = editors_.find(key); editor != editors_.end()) {
                editor->second.lastState = inst->getState();
            }
            reply(id, object());
        } else if (cmd == "setLiveState") {
            auto it = instances_.find(key);
            if (it == instances_.end()) { fail(id, "Unknown instance " + key); return; }
            if (editors_.count(key) == 0) {
                String error;
                if (!it->second->setState(req["state"].toString(), error)) { fail(id, error); return; }
            }
            reply(id, object());
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
            auto inst = std::make_shared<Instance>();
            if (!inst->load(path, uid, error)) { instances_.erase(key); return nullptr; }
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
            std::unique_lock<std::recursive_mutex> guard(inst->second->lock, std::try_to_lock);
            if (!guard.owns_lock()) continue;
            const auto state = inst->second->getState();
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
