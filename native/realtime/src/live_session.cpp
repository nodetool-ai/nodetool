#include "nodetool/realtime/live_session.h"

#include "nodetool/realtime/audio.h"
#include "nodetool/realtime/control.h"
#include "nodetool/realtime/live.h"

#include "audio/PcmRing.h"
#include "playback/AudioClockFeed.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <deque>
#include <limits>
#include <mutex>
#include <span>
#include <stop_token>
#include <thread>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#include <avrt.h>
#elif defined(__APPLE__)
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <mach/thread_policy.h>
#include <pthread.h>
#else
#include <pthread.h>
#include <sched.h>
#endif

namespace nt::realtime {
namespace {
using namespace std::chrono_literals;
constexpr std::size_t kQuantum = 128;
constexpr std::int64_t kQuantumFrames = 128; // ring arithmetic is signed

// An audio plan built on the prepare thread. Its structure does not change
// after construction. The audio render thread that takes it owns its executor
// state and the snapshot scratch until it retires the plan. Only the prepare
// thread destroys it.
class AudioPlan final : public live::Retirable {
public:
    struct Binding { unsigned parameter; unsigned control; };
    struct Result { bool controlAccepted = true; std::uint64_t nonFinite = 0; };

    std::uint64_t revision = 0;
    unsigned sampleRate = 0;
    unsigned channels = 2;
    unsigned width = 1;
    unsigned height = 1;
    std::unique_ptr<AudioExecutor> audio;
    std::unique_ptr<ControlExecutor> control;
    std::vector<float> snapshot;
    std::vector<Binding> bindings;
    std::vector<unsigned> deviceSinks;

    // Audio render thread. Renders one quantum into interleaved stereo.
    Result process(std::uint64_t streamFrame, std::span<float, kQuantum * 2> out) noexcept {
        Result result;
        const double rate = sampleRate;
        const double seconds = static_cast<double>(streamFrame + kQuantum) / rate;
        const TickContext context{seconds, seconds * 2, kQuantum / rate, 2, streamFrame / kQuantum + 1, width, height};
        result.controlAccepted = control->tick(context).accepted;
        const auto registers = control->registers();
        for (const auto& binding : bindings) {
            const double value = registers[binding.control].lanes[0];
            if (std::isfinite(value) && std::abs(value) <= std::numeric_limits<float>::max()) {
                snapshot[binding.parameter] = static_cast<float>(value);
            } else {
                ++result.nonFinite; // keeps the value of the quantum before
            }
        }
        const auto processed = audio->process({snapshot, true});
        result.nonFinite += processed.nonFiniteSamples;
        std::fill(out.begin(), out.end(), 0.0f);
        for (const auto index : deviceSinks) {
            const auto pcm = audio->sink(index);
            const std::size_t right = channels == 1 ? 0 : kQuantum;
            for (std::size_t frame = 0; frame < kQuantum; ++frame) {
                out[frame * 2] += pcm[frame];
                out[frame * 2 + 1] += pcm[right + frame];
            }
        }
        return result;
    }
};

// Prepare thread. Loads, validates and lowers a plan for the audio domain.
std::unique_ptr<AudioPlan> buildAudioPlan(std::string_view json, const Registry& registry,
                                          const LiveConfig& config, Diagnostic& error) {
    try {
        auto loaded = loadPlan(json, registry);
        if (!loaded.plan) {
            error = loaded.error.value_or(Diagnostic{"$plan", "structure", "Rejected without a diagnostic"});
            return {};
        }
        const auto& plan = *loaded.plan;
        const auto& session = plan["session"];
        if (session["sampleRate"].get<unsigned>() != config.sampleRate || session["quantum"].get<unsigned>() != kQuantum) {
            error = {"$session", "session", "The plan's sample rate or quantum does not match the live session"};
            return {};
        }
        auto result = std::make_unique<AudioPlan>();
        result->revision = plan["revision"].get<std::uint64_t>();
        result->sampleRate = config.sampleRate;
        result->channels = session["channels"] == "mono" ? 1u : 2u;
        result->width = session["width"].get<unsigned>();
        result->height = session["height"].get<unsigned>();
        auto audio = AudioExecutor::prepare(plan);
        if (!audio.executor) {
            error = audio.error.value_or(Diagnostic{"$plan", "structure", "Rejected without a diagnostic"});
            return {};
        }
        auto control = ControlExecutor::prepare(plan, ControlDomain::audio);
        if (!control.executor) {
            error = control.error.value_or(Diagnostic{"$plan", "structure", "Rejected without a diagnostic"});
            return {};
        }
        result->audio = std::move(audio.executor);
        result->control = std::move(control.executor);
        std::vector<const Plan*> bySlot;
        for (const auto& parameter : plan["params"]) {
            const auto slot = parameter["slot"].get<unsigned>();
            if (bySlot.size() <= slot) { bySlot.resize(slot + 1, nullptr); }
            bySlot[slot] = &parameter;
        }
        for (const auto slot : result->audio->parameterSlots()) {
            const auto& parameter = *bySlot.at(slot);
            if (parameter.contains("audioControl")) {
                const auto index = parameter["audioControl"].get<unsigned>();
                if (result->control->registers()[index].width != 1) {
                    error = {parameter["node"].get<std::string>(), "control_width", "Audio parameters require scalar control registers"};
                    return {};
                }
                result->bindings.push_back({static_cast<unsigned>(result->snapshot.size()), index});
            }
            const auto& value = parameter["value"];
            result->snapshot.push_back(value.is_boolean() ? (value.get<bool>() ? 1.0f : 0.0f) : value.get<float>());
        }
        const auto& sinks = plan["audio"]["sinks"];
        for (unsigned i = 0; i < sinks.size(); ++i) {
            if (sinks[i]["kind"] == "device") { result->deviceSinks.push_back(i); }
        }
        return result;
    } catch (const std::exception& failure) {
        error = {"$plan", "structure", failure.what()};
        return {};
    }
}

// Audio render thread only. Requests the platform's realtime class for the
// calling thread (section 10.2) and reverts it in the destructor where the
// platform needs that. A refusal leaves the thread at its normal priority.
class RealtimeClass {
public:
    RealtimeClass(bool request, unsigned sampleRate) {
        if (!request) { return; }
#if defined(_WIN32)
        (void)sampleRate;
        DWORD index = 0;
        m_task = AvSetMmThreadCharacteristicsW(L"Pro Audio", &index);
        m_granted = m_task != nullptr;
#elif defined(__APPLE__)
        mach_timebase_info_data_t timebase{};
        if (mach_timebase_info(&timebase) != KERN_SUCCESS || timebase.numer == 0) { return; }
        const double ticksPerNs = static_cast<double>(timebase.denom) / timebase.numer;
        const double periodNs = 1e9 * kQuantum / sampleRate;
        thread_time_constraint_policy_data_t policy{};
        policy.period = static_cast<uint32_t>(periodNs * ticksPerNs);
        policy.computation = static_cast<uint32_t>(periodNs * 0.5 * ticksPerNs);
        policy.constraint = static_cast<uint32_t>(periodNs * ticksPerNs);
        policy.preemptible = 1;
        m_granted = thread_policy_set(pthread_mach_thread_np(pthread_self()), THREAD_TIME_CONSTRAINT_POLICY,
                                      reinterpret_cast<thread_policy_t>(&policy),
                                      THREAD_TIME_CONSTRAINT_POLICY_COUNT) == KERN_SUCCESS;
#else
        (void)sampleRate;
        const int low = sched_get_priority_min(SCHED_FIFO);
        const int high = sched_get_priority_max(SCHED_FIFO);
        sched_param parameter{};
        parameter.sched_priority = std::min(high, low + 10);
        m_granted = pthread_setschedparam(pthread_self(), SCHED_FIFO, &parameter) == 0;
#endif
    }
    ~RealtimeClass() {
#if defined(_WIN32)
        if (m_task) { AvRevertMmThreadCharacteristics(m_task); }
#endif
    }
    RealtimeClass(const RealtimeClass&) = delete;
    RealtimeClass& operator=(const RealtimeClass&) = delete;
    bool granted() const { return m_granted; }

private:
    bool m_granted = false;
#if defined(_WIN32)
    HANDLE m_task = nullptr;
#endif
};

#if defined(_WIN32)
// Audio render thread only. Closes the waitable timer handle.
struct CloseTimer {
    void operator()(void* timer) const { CloseHandle(timer); }
};
#endif

// Audio render thread only. Waits about 100 us while the ring holds its lead,
// without a lock. Set up before the steady-state loop starts.
class ProducerWait {
public:
    bool ready() const {
#if defined(_WIN32)
        return m_timer != nullptr;
#else
        return true;
#endif
    }
    void pause() {
#if defined(_WIN32)
        LARGE_INTEGER due;
        due.QuadPart = -1000; // relative 100 us, in 100 ns units
        if (SetWaitableTimerEx(m_timer.get(), &due, 0, nullptr, nullptr, nullptr, 0)) {
            WaitForSingleObject(m_timer.get(), INFINITE);
        }
#else
        std::this_thread::sleep_for(100us);
#endif
    }

private:
#if defined(_WIN32)
    std::unique_ptr<void, CloseTimer> m_timer{
        CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS)};
#endif
};

// Value published by the audio render thread.
struct AudioStats {
    std::uint64_t quanta = 0;
    std::uint64_t streamFrame = 0;
    std::uint64_t planRevision = 0;
    std::uint64_t planSwaps = 0;
    std::uint64_t nonFiniteSamples = 0;
    std::uint64_t controlRejections = 0;
    std::uint64_t deferredTakes = 0;
    bool realtimeRequested = false;
    bool realtimeGranted = false;
};
// Value published by the device callback.
struct CallbackStats {
    std::uint64_t callbackFrames = 0;
    std::uint64_t underruns = 0;
    std::uint64_t missingFrames = 0;
    std::uint64_t flushedFrames = 0;
    std::uint64_t clockGeneration = 0;
    std::int64_t leadFrames = 0;
};
} // namespace

// Shared by the session, its prepare thread and its audio render thread. Each
// field names the threads that touch it. The device callback borrows it as
// user data until PlaybackDevice::close returns.
struct LiveSession::Impl {
    LiveConfig config;
    LiveAudioThreadHooks hooks;
    Registry registry; // prepare thread after open

    live::Domain<AudioPlan> audio;
    // Audio render thread writes, device callback reads.
    std::unique_ptr<nt::audio::PcmRing> ring;
    // Device callback raises it after an underrun, the audio thread reads it.
    std::atomic<std::int64_t> lead{0};
    std::int64_t maxLead = 0;
    // Set by the device notification thread, taken by the device callback.
    std::atomic<bool> flushRequested{false};
    std::atomic<std::uint64_t> deviceChanges{0};

    playback::SeqLock<AudioStats> audioStats;
    playback::SeqLock<CallbackStats> callbackStats;
    CallbackStats callback; // device callback only

    // Guards jobs, stopPrepare and rejection. The prepare thread waits on cv.
    mutable std::mutex mutex;
    std::condition_variable cv;
    std::deque<std::string> jobs;
    bool stopPrepare = false;
    std::optional<Diagnostic> rejection;
    // Written by the prepare thread, read by stats().
    std::atomic<std::uint64_t> publishedPlans{0};
    std::atomic<std::uint64_t> rejectedPlans{0};
    std::atomic<std::uint64_t> unconsumedPlans{0};
    std::atomic<std::uint64_t> retiredObjects{0};

    std::unique_ptr<audio::PlaybackDevice> device; // GUI thread
    std::jthread audioThread;                      // GUI thread
    std::jthread prepareThread;                    // GUI thread

    explicit Impl(const LiveConfig& c) : config(c), audio(c.maxSlots) {}

    // ---- device callback ----
    static void render(void* user, float* interleaved, std::uint32_t frames) {
        static_cast<Impl*>(user)->renderDevice(std::span<float>(interleaved, static_cast<std::size_t>(frames) * 2));
    }
    void renderDevice(std::span<float> out) {
        const auto frames = static_cast<std::int64_t>(out.size() / 2);
        if (flushRequested.exchange(false, std::memory_order_acq_rel)) {
            // Section 17: a device change flushes the ring and starts a new clock anchor.
            const auto end = ring->readableEnd();
            callback.flushedFrames += static_cast<std::uint64_t>(end - ring->readFloor());
            ring->release(end);
            ++callback.clockGeneration;
        }
        const auto begin = ring->readFloor();
        const auto count = std::min(frames, ring->readableEnd() - begin);
        for (std::int64_t frame = 0; frame < count; ++frame) {
            const auto at = static_cast<std::size_t>(frame) * 2;
            ring->get(begin + frame, out[at], out[at + 1]);
        }
        std::fill(out.begin() + count * 2, out.end(), 0.0f);
        ring->release(begin + count);
        if (count != frames) {
            // Section 17: silence, a count and one quantum more lead up to the limit.
            ++callback.underruns;
            callback.missingFrames += static_cast<std::uint64_t>(frames - count);
            const auto raised = std::min(lead.load(std::memory_order_relaxed) + kQuantumFrames, maxLead);
            lead.store(raised, std::memory_order_relaxed);
        }
        callback.callbackFrames += static_cast<std::uint64_t>(frames);
        callback.leadFrames = lead.load(std::memory_order_relaxed);
        callbackStats.store(callback);
    }
    // ---- device notification thread ----
    static void notify(void* user, audio::PlaybackDevice::Notification notification) {
        auto& self = *static_cast<Impl*>(user);
        if (notification == audio::PlaybackDevice::Notification::Rerouted) { self.deviceChanged(); }
    }
    void deviceChanged() {
        deviceChanges.fetch_add(1, std::memory_order_relaxed);
        flushRequested.store(true, std::memory_order_release);
    }

    // ---- audio render thread ----
    void audioLoop(const std::stop_token& stop) {
        const RealtimeClass realtime(config.requestRealtimeClass, config.sampleRate);
        ProducerWait wait;
        AudioStats stats;
        stats.realtimeRequested = config.requestRealtimeClass;
        stats.realtimeGranted = realtime.granted();
        std::array<float, kQuantum * 2> block{};
        audioStats.store(stats);
        if (hooks.loopEnter) { hooks.loopEnter(hooks.user); }
        while (wait.ready() && !stop.stop_requested()) {
            if (ring->writeEnd() - ring->readFloor() >= lead.load(std::memory_order_relaxed)) {
                wait.pause();
                continue;
            }
            if (audio.takePending()) { ++stats.planSwaps; }
            if (auto* plan = audio.plan()) {
                const auto result = plan->process(stats.streamFrame, block);
                if (!result.controlAccepted) { ++stats.controlRejections; }
                stats.nonFiniteSamples += result.nonFinite;
                stats.planRevision = plan->revision;
            } else {
                block.fill(0.0f);
            }
            ring->write(block.data(), kQuantumFrames);
            stats.streamFrame += kQuantum;
            ++stats.quanta;
            stats.deferredTakes = audio.deferredTakes();
            audioStats.store(stats);
        }
        if (hooks.loopExit) { hooks.loopExit(hooks.user); }
    }

    // ---- prepare thread ----
    void prepareLoop() {
        for (;;) {
            std::optional<std::string> job;
            {
                std::unique_lock lock(mutex);
                cv.wait_for(lock, 5ms, [this] { return stopPrepare || !jobs.empty(); });
                if (stopPrepare) { break; }
                if (!jobs.empty()) {
                    job = std::move(jobs.front());
                    jobs.pop_front();
                }
            }
            audio.drain();
            if (job) { publish(*job); }
            retiredObjects.store(audio.retiredTotal(), std::memory_order_relaxed);
        }
        // The audio render thread has stopped: destroy its plans here.
        audio.reclaim();
        retiredObjects.store(audio.retiredTotal(), std::memory_order_relaxed);
    }
    void publish(const std::string& json) {
        Diagnostic error;
        auto plan = buildAudioPlan(json, registry, config, error);
        if (!plan) {
            rejectedPlans.fetch_add(1, std::memory_order_relaxed);
            const std::lock_guard lock(mutex);
            rejection = std::move(error);
            return;
        }
        if (audio.publishPlan(std::move(plan))) { unconsumedPlans.fetch_add(1, std::memory_order_relaxed); }
        publishedPlans.fetch_add(1, std::memory_order_relaxed);
    }
};

LiveSession::LiveSession(Key, std::shared_ptr<Impl> impl) : m_impl(std::move(impl)) {}

std::unique_ptr<LiveSession> LiveSession::open(const LiveConfig& config, std::string* error, LiveAudioThreadHooks hooks) {
    const auto fail = [error](const char* why) {
        if (error) { *error = why; }
        return std::unique_ptr<LiveSession>{};
    };
    if ((config.sampleRate != 44100 && config.sampleRate != 48000) || config.periodFrames == 0 ||
        config.periodFrames > 8192 || config.minLeadQuanta == 0 || config.maxLeadQuanta < config.minLeadQuanta ||
        config.maxLeadQuanta > 256 || config.maxSlots > 256) {
        return fail("invalid live session configuration");
    }
    auto impl = std::make_shared<Impl>(config);
    impl->hooks = hooks;
    registerControlOperations(impl->registry);
    registerAudioKernels(impl->registry);
    const std::int64_t lead = std::max<std::int64_t>(std::int64_t{2} * config.periodFrames,
                                                     std::int64_t{config.minLeadQuanta} * kQuantumFrames);
    impl->maxLead = std::max<std::int64_t>(lead, std::int64_t{config.maxLeadQuanta} * kQuantumFrames);
    impl->lead.store(lead);
    // Room for the largest lead, one quantum the producer writes past it and
    // one device period.
    impl->ring = std::make_unique<nt::audio::PcmRing>(impl->maxLead + kQuantumFrames + config.periodFrames, 0);

    std::string deviceError;
    impl->device = audio::PlaybackDevice::open(
        {config.backend, static_cast<int>(config.sampleRate), static_cast<int>(config.periodFrames), 2},
        {&Impl::render, &Impl::notify, impl.get()}, {}, &deviceError);
    if (!impl->device) {
        if (error) { *error = deviceError; }
        return {};
    }
    const std::weak_ptr<Impl> weak = impl;
    impl->prepareThread = std::jthread([weak] {
        if (const auto self = weak.lock()) { self->prepareLoop(); }
    });
    impl->audioThread = std::jthread([weak](const std::stop_token& stop) {
        if (const auto self = weak.lock()) { self->audioLoop(stop); }
    });
    auto session = std::make_unique<LiveSession>(Key{}, impl);
    // Prefill the ring with its lead before the device starts.
    const auto deadline = std::chrono::steady_clock::now() + 2s;
    while (impl->ring->readableEnd() < lead && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(1ms);
    }
    if (impl->ring->readableEnd() < lead) { return fail("the audio render thread did not fill the ring"); }
    if (!impl->device->start()) { return fail("cannot start the audio device"); }
    return session;
}

LiveSession::~LiveSession() {
    // Section 7: stop the device, then join the audio render thread, then the
    // prepare thread, which destroys the plans before it returns.
    m_impl->device->close();
    m_impl->audioThread.request_stop();
    if (m_impl->audioThread.joinable()) { m_impl->audioThread.join(); }
    {
        const std::lock_guard lock(m_impl->mutex);
        m_impl->stopPrepare = true;
    }
    m_impl->cv.notify_one();
    if (m_impl->prepareThread.joinable()) { m_impl->prepareThread.join(); }
}

void LiveSession::update(std::string planJson) {
    {
        const std::lock_guard lock(m_impl->mutex);
        m_impl->jobs.push_back(std::move(planJson));
    }
    m_impl->cv.notify_one();
}

LiveStats LiveSession::stats() const {
    const auto audio = m_impl->audioStats.load();
    const auto callback = m_impl->callbackStats.load();
    LiveStats result;
    result.quanta = audio.quanta;
    result.streamFrame = audio.streamFrame;
    result.planRevision = audio.planRevision;
    result.planSwaps = audio.planSwaps;
    result.nonFiniteSamples = audio.nonFiniteSamples;
    result.controlRejections = audio.controlRejections;
    result.deferredTakes = audio.deferredTakes;
    result.realtimeRequested = audio.realtimeRequested;
    result.realtimeGranted = audio.realtimeGranted;
    result.callbackFrames = callback.callbackFrames;
    result.underruns = callback.underruns;
    result.missingFrames = callback.missingFrames;
    result.flushedFrames = callback.flushedFrames;
    result.clockGeneration = callback.clockGeneration;
    result.leadFrames = callback.leadFrames;
    result.publishedPlans = m_impl->publishedPlans.load(std::memory_order_relaxed);
    result.rejectedPlans = m_impl->rejectedPlans.load(std::memory_order_relaxed);
    result.unconsumedPlans = m_impl->unconsumedPlans.load(std::memory_order_relaxed);
    result.retiredObjects = m_impl->retiredObjects.load(std::memory_order_relaxed);
    result.deviceChanges = m_impl->deviceChanges.load(std::memory_order_relaxed);
    return result;
}

std::optional<Diagnostic> LiveSession::lastRejection() const {
    const std::lock_guard lock(m_impl->mutex);
    return m_impl->rejection;
}

bool LiveSession::waitForRevision(std::uint64_t revision, std::chrono::milliseconds timeout) const {
    const auto deadline = std::chrono::steady_clock::now() + timeout;
    while (m_impl->audioStats.load().planRevision < revision) {
        if (std::chrono::steady_clock::now() >= deadline) { return false; }
        std::this_thread::sleep_for(1ms);
    }
    return true;
}

void LiveSession::simulateDeviceChangeForTest() { m_impl->deviceChanged(); }

} // namespace nt::realtime
