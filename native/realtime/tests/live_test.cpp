// WP12 live session core checks: the handoffs and retire queues of section
// 11.4 under load, slot values shared by two domains, and a session on the
// null device with plan swaps, a rejected plan, underruns and a device change.
#include "nodetool/realtime/live.h"
#include "nodetool/realtime/live_session.h"
#include "audio/SanitizerBuild.h"
#ifndef NT_SANITIZED
#include "audio/TestAllocationCounter.h"
#endif

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

namespace {
using namespace std::chrono_literals;
using namespace nt::realtime;

void require(bool condition, const std::string& message) {
    if (!condition) { throw std::runtime_error(message); }
}

// Counts live instances, so a test can prove every object was destroyed and
// on which thread.
struct Counted final : live::Retirable {
    static inline std::atomic<int> alive{0};
    static inline std::atomic<int> destroyedOffPrepare{0};
    static inline std::atomic<std::thread::id> prepare{};
    std::uint64_t revision;
    explicit Counted(std::uint64_t r) : revision(r) { alive.fetch_add(1); }
    Counted(const Counted&) = delete;
    Counted& operator=(const Counted&) = delete;
    Counted(Counted&&) = delete;
    Counted& operator=(Counted&&) = delete;
    ~Counted() override {
        alive.fetch_sub(1);
        if (std::this_thread::get_id() != prepare.load()) { destroyedOffPrepare.fetch_add(1); }
    }
};

// Many plan and slot swaps against a realtime thread that takes at a fixed
// cadence. The retire queue (capacity maxSlots + 3) carries far more objects
// than its capacity without a deferred take, and only the prepare thread
// destroys them.
void domainSwapsUnderLoad() {
    constexpr std::size_t maxSlots = 2;
    constexpr int swaps = 20000;
    Counted::prepare = std::this_thread::get_id();
    std::uint64_t retired = 0;
    {
        live::Domain<Counted> domain(maxSlots);
        std::atomic<bool> stop{false};
        std::atomic<std::uint64_t> taken{0};
        std::atomic<std::uint64_t> seen{0};
        std::thread realtime([&] {
            std::uint64_t last = 0;
            while (!stop.load(std::memory_order_acquire)) {
                if (domain.takePending()) { taken.fetch_add(1, std::memory_order_relaxed); }
                if (const auto* plan = domain.plan()) {
                    require(plan->revision >= last, "plan revisions run in publication order");
                    last = plan->revision;
                    seen.store(last, std::memory_order_relaxed);
                }
                for (std::size_t i = 0; i < maxSlots; ++i) {
                    if (const auto* slot = domain.slot(i)) { (void)slot->value().samples.size(); }
                }
            }
        });
        for (int i = 1; i <= swaps; ++i) {
            domain.publishPlan(std::make_unique<Counted>(i));
            auto value = std::make_shared<const live::SlotValue>(live::SlotValue{"pcm", static_cast<std::uint64_t>(i), {0.0f, 1.0f}});
            domain.publishSlot(static_cast<std::size_t>(i) % maxSlots, std::move(value));
            if (i % 64 == 0) { std::this_thread::yield(); }
        }
        const auto deadline = std::chrono::steady_clock::now() + 5s;
        while (seen.load() != swaps && std::chrono::steady_clock::now() < deadline) { std::this_thread::sleep_for(1ms); }
        stop.store(true, std::memory_order_release);
        realtime.join();
        require(seen.load() == swaps, "the realtime thread reaches the newest plan");
        require(domain.deferredTakes() == 0, "section 11.4: the retire queue never lacks room");
        domain.reclaim();
        retired = domain.retiredTotal();
        require(retired > domain.retireCapacity() * 10, "the retire queue carried many times its capacity: " + std::to_string(retired));
        require(taken.load() > domain.retireCapacity(), "the realtime thread took more plans than the queue holds");
    }
    require(Counted::alive.load() == 0, "every plan is destroyed");
    require(Counted::destroyedOffPrepare.load() == 0, "only the prepare thread destroys plans");
}

// A full retire queue refuses a push and leaves the object with the caller.
// This is the positive control for the room check behind deferredTakes.
void fullRetireQueueRefuses() {
    live::RetireQueue queue(2);
    std::unique_ptr<live::Retirable> a = std::make_unique<Counted>(10);
    std::unique_ptr<live::Retirable> b = std::make_unique<Counted>(11);
    std::unique_ptr<live::Retirable> c = std::make_unique<Counted>(12);
    require(queue.push(a) && queue.push(b), "the queue accepts its capacity");
    require(!queue.hasRoom() && !queue.push(c) && c, "a full queue refuses and leaves the object with the caller");
    require(queue.drain() == 2 && queue.hasRoom(), "drain frees the queue");
    c.reset();
    require(Counted::alive.load() == 0, "all queue objects destroyed");
}

// A slot value read by both domains has one reference per domain, and the
// prepare thread drops the last one.
void slotValueSharedByTwoDomains() {
    Counted::prepare = std::this_thread::get_id();
    live::Domain<Counted> render(1);
    live::Domain<Counted> audio(1);
    std::weak_ptr<const live::SlotValue> first;
    std::atomic<bool> stop{false};
    std::atomic<long> maxRefs{0};
    const auto consume = [&](live::Domain<Counted>& domain) {
        while (!stop.load(std::memory_order_acquire)) {
            domain.takePending();
            if (const auto* slot = domain.slot(0)) {
                const long refs = slot->useCount();
                long seen = maxRefs.load();
                while (refs > seen && !maxRefs.compare_exchange_weak(seen, refs)) {}
            }
        }
    };
    std::thread renderThread(consume, std::ref(render));
    std::thread audioThread(consume, std::ref(audio));
    for (int i = 0; i < 5000; ++i) {
        auto value = std::make_shared<const live::SlotValue>(live::SlotValue{"pcm", static_cast<std::uint64_t>(i), {}});
        if (i == 0) { first = value; }
        render.publishSlot(0, value);
        audio.publishSlot(0, std::move(value));
    }
    std::this_thread::sleep_for(20ms);
    stop.store(true);
    renderThread.join();
    audioThread.join();
    require(maxRefs.load() <= 2, "a slot value has at most one reference per domain");
    require(render.slot(0) && audio.slot(0) && render.slot(0)->value().version == 4999 &&
                audio.slot(0)->value().version == 4999, "both domains hold the newest value");
    require(render.slot(0)->useCount() == 2, "the newest value is referenced by both domains");
    render.reclaim();
    audio.reclaim();
    require(first.expired(), "the prepare thread released the first value");
}

std::string tonePlan(std::uint64_t revision, double gain, double frequency = 440, const char* sync = "audio",
                     unsigned gainSlot = 1) {
    nlohmann::json plan = {
        {"schemaVersion", 1}, {"revision", revision},
        {"session", {{"sampleRate", 48000}, {"quantum", 128}, {"channels", "stereo"}, {"width", 64}, {"height", 64}, {"seed", 1}}},
        {"params", nlohmann::json::array({
            {{"slot", 0}, {"node", "tone"}, {"field", "frequency"}, {"smooth", "none"}, {"sync", "audio"}, {"value", frequency}},
            {{"slot", gainSlot}, {"node", "tone"}, {"field", "amplitude"}, {"smooth", "none"}, {"sync", sync}, {"value", gain}}})},
        {"slots", nlohmann::json::array()},
        {"control", {{"registers", 0}, {"ops", nlohmann::json::array()}, {"stateful", nlohmann::json::array()}}},
        {"render", {{"passes", nlohmann::json::array()}}},
        {"audio", {
            {"buffers", nlohmann::json::array({{{"id", 0}, {"channels", "stereo"}}})},
            {"nodes", nlohmann::json::array({{{"node", "tone"}, {"kernel", "oscillator"}, {"stateVersion", 1},
                {"in", nlohmann::json::array()}, {"out", {0}}, {"params", {0, gainSlot}}}})},
            {"sinks", nlohmann::json::array({{{"node", "out"}, {"buffer", 0}, {"kind", "device"}, {"subgraphHash", "00000001"}}})}}}};
    return plan.dump();
}

struct AudioThreadProbe {
    std::atomic<bool> entered{false};
    std::atomic<bool> counterWorks{false};
    std::atomic<std::int64_t> allocations{-1};
};

void sessionOnNullDevice() {
    AudioThreadProbe probe;
    LiveAudioThreadHooks hooks;
    hooks.user = &probe;
    hooks.loopEnter = [](void* user) {
#ifndef NT_SANITIZED
        // The counter is per thread, so its control runs on the audio thread.
        static_cast<AudioThreadProbe*>(user)->counterWorks.store(nt::testing::countsAnAllocation());
        nt::testing::allocations = 0;
        nt::testing::countAllocations = true;
#endif
        static_cast<AudioThreadProbe*>(user)->entered.store(true);
    };
    hooks.loopExit = [](void* user) {
#ifndef NT_SANITIZED
        nt::testing::countAllocations = false;
        static_cast<AudioThreadProbe*>(user)->allocations.store(static_cast<std::int64_t>(nt::testing::allocations));
#else
        static_cast<AudioThreadProbe*>(user)->allocations.store(0);
        static_cast<AudioThreadProbe*>(user)->counterWorks.store(true);
#endif
    };

    std::string error;
    LiveConfig bad;
    bad.sampleRate = 22050;
    require(!LiveSession::open(bad, &error) && !error.empty(), "an unsupported session rate is rejected");

    LiveConfig config;
    config.sampleRate = 48000;
    config.requestRealtimeClass = true;
    {
        auto session = LiveSession::open(config, &error, hooks);
        require(session != nullptr, "the session opens on the null device: " + error);
        require(probe.entered.load(), "the audio render thread runs");
        auto stats = session->stats();
        require(stats.realtimeRequested, "the realtime class is requested");
        // Linux grants SCHED_FIFO only with CAP_SYS_NICE: either answer is valid,
        // and the stats report it.
        std::cout << "realtime class granted: " << (stats.realtimeGranted ? "yes" : "no") << '\n';
        require(stats.leadFrames >= std::int64_t{8} * 128 || stats.callbackFrames == 0, "the ring lead is at least 8 quanta");

        session->update(tonePlan(1, 0.25));
        require(session->waitForRevision(1, 2s), "the first plan runs");
        session->update("{\"schemaVersion\": 1}");
        auto mismatch = nlohmann::json::parse(tonePlan(2, 0.25));
        mismatch["session"]["sampleRate"] = 44100;
        session->update(mismatch.dump());
        // Many swaps, faster than the audio thread takes them.
        for (std::uint64_t revision = 3; revision <= 400; ++revision) {
            session->update(tonePlan(revision, revision % 2 ? 0.2 : 0.3, 220 + static_cast<double>(revision)));
        }
        require(session->waitForRevision(400, 5s), "the newest plan runs after many swaps");
        stats = session->stats();
        require(stats.rejectedPlans == 2, "both invalid plans are rejected");
        const auto rejection = session->lastRejection();
        require(rejection && rejection->reason == "session", "the last rejection names the session mismatch");
        require(stats.planRevision == 400, "a rejected plan leaves the active plan running");
        require(stats.publishedPlans == 399, "every valid plan is published");
        require(stats.planSwaps + stats.unconsumedPlans == stats.publishedPlans, "each published plan is taken or replaced unconsumed");
        require(stats.deferredTakes == 0, "the retire queue never lacked room");

        // Device change: the ring is flushed and the clock gets a new generation.
        const auto generation = stats.clockGeneration;
        session->simulateDeviceChangeForTest();
        const auto deadline = std::chrono::steady_clock::now() + 2s;
        while (session->stats().clockGeneration == generation && std::chrono::steady_clock::now() < deadline) {
            std::this_thread::sleep_for(1ms);
        }
        stats = session->stats();
        require(stats.clockGeneration == generation + 1 && stats.deviceChanges == 1, "a device change starts a new clock generation");
        require(stats.flushedFrames > 0, "a device change flushes the ring");
        require(stats.underruns >= 1 && stats.missingFrames > 0, "the flushed ring underruns once");
        require(stats.leadFrames > std::int64_t{8} * 128, "an underrun raises the ring lead");
        std::this_thread::sleep_for(200ms);
        stats = session->stats();
        require(stats.callbackFrames > 9600, "the device keeps playing after the change");
        require(stats.nonFiniteSamples == 0 && stats.controlRejections == 0, "the tone renders cleanly");
    }
    require(probe.counterWorks.load(), "the allocation counter counts on the audio render thread (control)");
    require(probe.allocations.load() == 0,
            "the audio render thread allocates nothing: " + std::to_string(probe.allocations.load()));
}
} // namespace

// WP13 on the null device: plan values enter the param table, a host write
// of a synced param reaches the audio-applied table with its quantum, the
// applied plan state names the running revision, a plan slot outside the
// table is rejected, and an event the plan cannot take is dropped without
// stopping the sound.
void sessionParamsAndEvents() {
    LiveConfig config;
    config.sampleRate = 48000;
    config.maxParams = 4;
    std::string error;
    auto session = LiveSession::open(config, &error);
    require(session != nullptr, "open failed: " + error);
    session->update(tonePlan(1, 0.25, 440, "synced"));
    require(session->waitForRevision(1, 5s), "the synced plan never ran");
    ParamValue frequency;
    require(session->params().tryLoad(0, frequency) && frequency.lanes[0] == 440, "plan values did not enter the table");
    AppliedPlans plans;
    require(session->audioApplied().tryLoadPlans(plans) && plans.recent[0].planRevision == 1,
            "the applied plan state does not name the running revision");

    const double gain[] = {0.5};
    require(session->setParam(1, gain), "a param write failed");
    require(!session->setParam(4, gain), "a write outside the table succeeded");
    const auto deadline = std::chrono::steady_clock::now() + 5s;
    AppliedParam applied;
    while (std::chrono::steady_clock::now() < deadline &&
           !(session->audioApplied().tryLoadParam(1, applied) && applied.lanes[0] == 0.5)) {
        std::this_thread::sleep_for(1ms);
    }
    require(applied.lanes[0] == 0.5 && applied.revision != 0 && applied.streamFrame > 0,
            "the synced write did not reach the audio-applied table");
    require(applied.streamFrame % 128 == 0, "the applied stream frame is not a quantum start");

    ParamValue before;
    require(session->params().tryLoad(1, before), "param read failed");
    session->update(tonePlan(2, 0.5, 440, "synced"));
    require(session->waitForRevision(2, 5s), "the second plan never ran");
    ParamValue after;
    require(session->params().tryLoad(1, after) && after.revision == before.revision,
            "a plan with the same value replaced the host write");

    session->update(tonePlan(3, 0.25, 440, "synced", 4));
    const auto rejectDeadline = std::chrono::steady_clock::now() + 5s;
    while (session->stats().rejectedPlans == 0 && std::chrono::steady_clock::now() < rejectDeadline) {
        std::this_thread::sleep_for(1ms);
    }
    const auto rejection = session->lastRejection();
    require(rejection && rejection->reason == "param_slot", "a slot outside the table was not rejected");

    const auto quanta = session->stats().quanta;
    require(session->sendEvent({0, 999, 0, 0}), "the event was not queued");
    const auto eventDeadline = std::chrono::steady_clock::now() + 5s;
    while (session->stats().rejectedEvents == 0 && std::chrono::steady_clock::now() < eventDeadline) {
        std::this_thread::sleep_for(1ms);
    }
    std::this_thread::sleep_for(50ms);
    const auto stats = session->stats();
    require(stats.rejectedEvents == 1 && stats.quanta > quanta + 4, "a rejected event stopped the sound");
    require(stats.syncedParamsApplied >= 1 && stats.paramReadFailures == 0, "unexpected param counters");
}

int main() {
    try {
#ifndef NT_SANITIZED
        require(nt::testing::countsAnAllocation(), "the allocation counter counts (control)");
#endif
        domainSwapsUnderLoad();
        fullRetireQueueRefuses();
        slotValueSharedByTwoDomains();
        sessionOnNullDevice();
        sessionParamsAndEvents();
        std::cout << "realtime-live: all checks passed\n";
        return 0;
    } catch (const std::exception& failure) {
        std::cerr << "FAIL: " << failure.what() << '\n';
        return 1;
    }
}
