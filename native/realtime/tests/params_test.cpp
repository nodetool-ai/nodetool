// WP13 checks: the param table, the synced change of section 15 against a
// simulated audio clock, the D7g fallbacks, rapid dual-plan revisions within
// one ring lead, the event queue, and the staged swap under threads.
#include "nodetool/realtime/live.h"
#include "nodetool/realtime/params.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
using namespace nt::realtime;

void require(bool condition, const std::string& message) {
    if (!condition) { throw std::runtime_error(message); }
}

constexpr std::uint64_t kRate = 48000;
constexpr std::uint64_t kQuantum = 128;
constexpr std::uint64_t kLead = 8 * kQuantum; // frames produced ahead of the audible position
constexpr double kRefresh = 60.0;

// The simulated session clock. The audio thread renders the quantum at
// stream frame S when the audible position is S - kLead. The render thread
// presents frame f at f / 60 s, when the audible position is that time in
// frames. The device runs, and the generation is 0 unless a test changes it.
double productionTime(std::uint64_t streamFrame) {
    return (static_cast<double>(streamFrame) - static_cast<double>(kLead)) / kRate;
}
std::uint64_t audibleAt(double seconds) { return static_cast<std::uint64_t>(std::floor(seconds * kRate)); }

void paramTableWrites() {
    ParamTable table(4);
    const double a[] = {0.5};
    const double b[] = {1, 2, 3};
    const double tooWide[] = {1, 2, 3, 4, 5};
    const auto first = table.write(0, a);
    const auto second = table.write(2, b);
    require(first != 0 && second > first, "revisions must increase across slots");
    require(table.write(4, a) == 0, "an out-of-range slot was written");
    require(table.write(1, tooWide) == 0 && table.write(1, {}) == 0, "a value of 0 or 5 lanes was written");
    require(table.writeIfChanged(0, a) == 0, "an unchanged value took a new revision");
    require(table.writeIfChanged(1, a) != 0, "a first write was skipped");
    ParamValue value;
    require(table.tryLoad(2, value) && value.revision == second && value.width == 3 && value.lanes[2] == 3,
            "the stored value differs");
    require(!table.tryLoad(9, value), "an out-of-range read succeeded");
}

// Section 15, synced change: a synced param changes once. The sound takes it
// at the next quantum start. The picture takes it in the first frame whose
// audible time reaches that quantum, never earlier and never later. An
// immediate param written at the same time shows in the next frame.
void syncedChangeMatchesItsQuantum() {
    constexpr std::uint32_t synced = 0;
    constexpr std::uint32_t immediate = 1;
    ParamTable table(2);
    AudioAppliedTable applied(2);
    applied.setDeviceRunning(true);
    AudioParamReader audio(table, applied);
    RenderParamApplier render(table, applied);
    const ParamRead audioReads[] = {{synced, SyncPolicy::synced}};
    const ParamRead renderReads[] = {{synced, SyncPolicy::synced}, {immediate, SyncPolicy::immediate}};

    const double initial[] = {1.0};
    table.write(synced, initial);
    table.write(immediate, initial);
    const double changed[] = {2.0};
    const double writeTime = 0.2503; // between quanta and between frames

    // Walk audio quanta and render frames in time order.
    std::uint64_t nextQuantum = kLead; // the first quantum rendered at t = 0
    std::uint64_t frame = 0;
    bool written = false;
    std::uint64_t changeFrame = 0; // stream frame of the quantum that took the change
    std::uint64_t syncedShownAt = 0;
    std::uint64_t immediateShownAt = 0;
    while (frame < 60) {
        const double frameTime = static_cast<double>(frame) / kRefresh;
        const double quantumTime = productionTime(nextQuantum);
        const double next = std::min(frameTime, quantumTime);
        if (!written && writeTime <= next) {
            table.write(synced, changed);
            table.write(immediate, changed);
            written = true;
            continue;
        }
        if (quantumTime <= frameTime) {
            audio.beginQuantum(audioReads, nextQuantum, 0);
            if (changeFrame == 0 && audio.value(synced).lanes[0] == 2.0) { changeFrame = nextQuantum; }
            nextQuantum += kQuantum;
            continue;
        }
        const RenderClockView view{audibleAt(frameTime), 0, true};
        render.beginFrame(renderReads, view);
        if (syncedShownAt == 0 && render.value(synced).lanes[0] == 2.0) {
            syncedShownAt = frame;
            require(view.audibleFrame >= changeFrame, "the picture took the synced change before its sound");
        }
        if (immediateShownAt == 0 && render.value(immediate).lanes[0] == 2.0) { immediateShownAt = frame; }
        if (syncedShownAt == 0 && changeFrame != 0) {
            require(view.audibleFrame < changeFrame, "a frame that reached the quantum did not show the change");
        }
        ++frame;
    }
    require(changeFrame != 0 && productionTime(changeFrame) >= writeTime &&
                productionTime(changeFrame - kQuantum) < writeTime,
            "the sound did not take the change at the next quantum start");
    require(syncedShownAt != 0, "the synced change never reached the picture");
    const auto previous = audibleAt(static_cast<double>(syncedShownAt - 1) / kRefresh);
    require(previous < changeFrame, "the change reached the picture one frame late");
    require(immediateShownAt == static_cast<std::uint64_t>(std::ceil(writeTime * kRefresh)),
            "the immediate param did not apply in the next frame");
    require(syncedShownAt > immediateShownAt, "the synced param did not wait for the sound");
    require(audio.syncedApplied() == 2 && audio.failedReads() == 0 && render.failedReads() == 0,
            "unexpected applied or failed read counts");
}

// D7g fallbacks: a changed clock generation or a stopped device applies the
// synced value at once, and a held write counts a failed read and keeps the
// value of the quantum before.
void syncedFallbacks() {
    ParamTable table(1);
    AudioAppliedTable applied(1);
    AudioParamReader audio(table, applied);
    RenderParamApplier render(table, applied);
    const ParamRead reads[] = {{0, SyncPolicy::synced}};
    const double value[] = {3.0};
    table.write(0, value);
    audio.beginQuantum(reads, 100000, 4);
    render.beginFrame(reads, {10, 4, true});
    require(render.value(0).lanes[0] == 0.0, "a synced value applied before its sound");
    render.beginFrame(reads, {10, 5, true});
    require(render.value(0).lanes[0] == 3.0, "a generation change did not apply the value at once");

    const double later[] = {4.0};
    table.write(0, later);
    audio.beginQuantum(reads, 200000, 5);
    render.beginFrame(reads, {10, 5, false});
    require(render.value(0).lanes[0] == 4.0, "a stopped device did not apply the value at once");
    require(syncedDue(5, 1, {5, 1, true}) && !syncedDue(6, 1, {5, 1, true}), "syncedDue boundary is wrong");

    const auto stagedClock = stagedSwapClock({{{{7, 1000, 2}, {6, 10, 1}}}}, {500, 2, true});
    require(stagedClock.find(7) && !stagedClock.find(7)->audible, "a future plan revision counted as audible");
    require(stagedClock.find(6) && stagedClock.find(6)->audible, "an old generation entry did not count as audible");
    require(!stagedClock.swapNow && stagedClock.newest() == 7, "staged clock summary is wrong");
}

// A plan of both domains. Only the prepare thread (here the test thread)
// destroys it.
struct TestPlan final : live::Retirable {
    static inline std::atomic<int> alive{0};
    static inline std::atomic<int> destroyedOffPrepare{0};
    static inline std::atomic<std::thread::id> prepare{};
    std::uint64_t revision;
    bool synced;
    TestPlan(std::uint64_t r, bool s) : revision(r), synced(s) { alive.fetch_add(1); }
    TestPlan(const TestPlan&) = delete;
    TestPlan& operator=(const TestPlan&) = delete;
    TestPlan(TestPlan&&) = delete;
    TestPlan& operator=(TestPlan&&) = delete;
    ~TestPlan() override {
        alive.fetch_sub(1);
        if (std::this_thread::get_id() != prepare.load()) { destroyedOffPrepare.fetch_add(1); }
    }
};

// Section 11.2 with rapid revisions: two synced revisions published within
// one ring lead each reach the picture in the frame where their sound is
// audible. Three within one lead keep the oldest and the newest: the oldest
// shows at its sound, the middle one is replaced before it was due, and the
// newest wins at its sound. A render-only revision swaps at the next frame.
void rapidRevisionsWithinOneLead() {
    TestPlan::prepare = std::this_thread::get_id();
    {
        live::Domain<TestPlan> audio(0);
        live::Domain<TestPlan> render(0, true);
        require(render.retireCapacity() == 5 && audio.retireCapacity() == 3, "staged retire capacity is wrong");
        AudioAppliedTable applied(1);
        applied.setDeviceRunning(true);

        struct Publish { double at; std::uint64_t revision; bool synced; };
        const std::vector<Publish> publishes = {
            {0.1000, 1, true}, {0.1150, 2, true},                     // two within one lead (21.3 ms)
            {0.3000, 3, true},                                        // alone
            {0.5000, 4, true}, {0.5090, 5, true}, {0.5180, 6, true},  // three within one lead
            {0.7000, 7, false},                                       // render only
        };
        std::size_t nextPublish = 0;
        std::uint64_t nextQuantum = kLead;
        std::uint64_t frame = 0;
        std::map<std::uint64_t, std::uint64_t> audioTook;  // revision -> stream frame
        std::map<std::uint64_t, std::uint64_t> renderShow; // revision -> render frame
        while (frame < 60) {
            const double frameTime = static_cast<double>(frame) / kRefresh;
            const double quantumTime = productionTime(nextQuantum);
            const double next = std::min(frameTime, quantumTime);
            if (nextPublish < publishes.size() && publishes[nextPublish].at <= next) {
                const auto& item = publishes[nextPublish++];
                if (item.synced) { (void)audio.publishPlan(std::make_unique<TestPlan>(item.revision, true)); }
                (void)render.publishPlan(std::make_unique<TestPlan>(item.revision, item.synced));
                continue;
            }
            if (quantumTime <= frameTime) {
                if (audio.takePending()) {
                    applied.storePlan({audio.plan()->revision, nextQuantum, 0});
                    audioTook[audio.plan()->revision] = nextQuantum;
                }
                nextQuantum += kQuantum;
                continue;
            }
            AppliedPlans plans;
            require(applied.tryLoadPlans(plans), "the applied plan read failed");
            const auto previous = render.plan() ? render.plan()->revision : 0;
            render.takePendingStaged(stagedSwapClock(plans, {audibleAt(frameTime), 0, true}));
            if (render.plan() && render.plan()->revision != previous) { renderShow[render.plan()->revision] = frame; }
            ++frame;
            render.drain();
            audio.drain();
        }
        const auto firstAudibleFrame = [](std::uint64_t streamFrame) {
            std::uint64_t f = 0;
            while (audibleAt(static_cast<double>(f) / kRefresh) < streamFrame) { ++f; }
            return f;
        };
        for (const std::uint64_t revision : {1, 2, 3, 4, 6}) {
            require(audioTook.contains(revision), "the audio thread did not take revision " + std::to_string(revision));
            require(renderShow.contains(revision), "revision " + std::to_string(revision) + " never reached the picture");
            require(renderShow[revision] == firstAudibleFrame(audioTook[revision]),
                    "revision " + std::to_string(revision) + " reached the picture in frame " +
                        std::to_string(renderShow[revision]) + ", expected " +
                        std::to_string(firstAudibleFrame(audioTook[revision])));
        }
        require(!renderShow.contains(5), "the replaced middle revision was shown");
        require(renderShow.contains(7) && renderShow[7] == static_cast<std::uint64_t>(std::ceil(0.7 * kRefresh)),
                "the render-only revision did not swap at the next frame");
        require(render.plan()->revision == 7 && render.stagedPlans() == 0, "the newest plan did not win");
        require(render.deferredTakes() == 0 && audio.deferredTakes() == 0, "a take was deferred");
        render.reclaim();
        audio.reclaim();
    }
    require(TestPlan::alive == 0 && TestPlan::destroyedOffPrepare == 0, "plans leaked or were destroyed off the prepare thread");
}

// A full stage keeps its oldest plan and replaces the newer one. The newest
// staged plan swaps at once when the record of the oldest is gone after a
// newer audio revision, and when the device stops.
void stageFallbacks() {
    TestPlan::prepare = std::this_thread::get_id();
    {
        live::Domain<TestPlan> render(0, true);
        for (std::uint64_t revision = 1; revision <= 3; ++revision) {
            (void)render.publishPlan(std::make_unique<TestPlan>(revision, true));
            render.takePendingStaged({});
        }
        require(!render.plan() && render.stagedPlans() == 2, "synced plans swapped before their sound");
        live::StagedSwapClock lost;
        lost.recent[0] = {9, false};
        require(render.takePendingStaged(lost) && render.plan()->revision == 3 && render.stagedPlans() == 0,
                "a full stage did not keep the newest plan, or a lost record did not swap to it");
        render.drain();
        require(render.retiredTotal() == 2, "the replaced and the skipped plan were not retired");

        (void)render.publishPlan(std::make_unique<TestPlan>(10, true));
        render.takePendingStaged({});
        (void)render.publishPlan(std::make_unique<TestPlan>(11, true));
        render.takePendingStaged({});
        require(render.plan()->revision == 3 && render.stagedPlans() == 2, "synced plans swapped before their sound");
        live::StagedSwapClock stopped;
        stopped.swapNow = true;
        require(render.takePendingStaged(stopped) && render.plan()->revision == 11 && render.stagedPlans() == 0,
                "a stopped device did not swap to the newest plan");
        render.reclaim();
    }
    require(TestPlan::alive == 0 && TestPlan::destroyedOffPrepare == 0, "plans leaked or were destroyed off the prepare thread");
}

// Events: a full queue drops the newest event and counts it. The pending
// list is sorted by stream frame and keeps events the executor left.
void eventQueue() {
    EventQueue queue(3);
    require(queue.send({300, 0, 0, 1}) && queue.send({100, 0, 0, 2}) && queue.send({200, 0, 0, 3}), "a send failed");
    require(!queue.send({50, 0, 0, 4}) && queue.dropped() == 1, "a full queue did not drop the newest event");
    auto pending = queue.pending();
    require(pending.size() == 3 && pending[0].value == 2 && pending[1].value == 3 && pending[2].value == 1,
            "pending events are not sorted");
    queue.consume(2);
    require(queue.send({250, 0, 0, 5}), "a send after a drain failed");
    pending = queue.pending();
    require(pending.size() == 2 && pending[0].value == 5 && pending[1].value == 1, "the remaining events are wrong");
    queue.consume(5);
    require(queue.pending().empty(), "consume did not empty the list");
}

// Threads: the prepare thread publishes synced plans to both domains, an
// audio thread takes and records them, a render thread swaps through the
// stage. No take is deferred and only the prepare thread destroys plans.
void stagedSwapUnderThreads() {
    TestPlan::prepare = std::this_thread::get_id();
    constexpr std::uint64_t revisions = 5000;
    {
        live::Domain<TestPlan> audio(0);
        live::Domain<TestPlan> render(0, true);
        AudioAppliedTable applied(1);
        applied.setDeviceRunning(true);
        std::atomic<bool> stop{false};
        std::atomic<std::uint64_t> audioFrame{0};
        std::atomic<std::uint64_t> renderNewest{0};
        std::thread audioThread([&] {
            std::uint64_t frame = 0;
            while (!stop.load(std::memory_order_relaxed)) {
                if (audio.takePending()) { applied.storePlan({audio.plan()->revision, frame, 0}); }
                frame += kQuantum;
                audioFrame.store(frame, std::memory_order_relaxed);
                std::this_thread::yield();
            }
        });
        std::thread renderThread([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                AppliedPlans plans;
                if (applied.tryLoadPlans(plans)) {
                    const auto audible = audioFrame.load(std::memory_order_relaxed);
                    render.takePendingStaged(stagedSwapClock(plans, {audible > kLead ? audible - kLead : 0, 0, true}));
                    if (render.plan()) { renderNewest.store(render.plan()->revision, std::memory_order_relaxed); }
                }
                std::this_thread::yield();
            }
        });
        for (std::uint64_t revision = 1; revision <= revisions; ++revision) {
            (void)audio.publishPlan(std::make_unique<TestPlan>(revision, true));
            (void)render.publishPlan(std::make_unique<TestPlan>(revision, true));
            if (revision % 16 == 0) { std::this_thread::yield(); }
        }
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
        while (renderNewest.load() != revisions && std::chrono::steady_clock::now() < deadline) {
            render.drain();
            audio.drain();
            std::this_thread::yield();
        }
        stop = true;
        audioThread.join();
        renderThread.join();
        require(renderNewest.load() == revisions, "the render thread did not reach the newest revision");
        require(render.deferredTakes() == 0 && audio.deferredTakes() == 0, "a take was deferred under threads");
        render.reclaim();
        audio.reclaim();
    }
    require(TestPlan::alive == 0 && TestPlan::destroyedOffPrepare == 0, "plans leaked or were destroyed off the prepare thread");
}

} // namespace

int main() {
    try {
        paramTableWrites();
        syncedChangeMatchesItsQuantum();
        syncedFallbacks();
        rapidRevisionsWithinOneLead();
        stageFallbacks();
        eventQueue();
        stagedSwapUnderThreads();
    } catch (const std::exception& error) {
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
    std::cout << "realtime params tests passed\n";
    return 0;
}
