// CPU counters (src/platform/CpuUsage, M6 review F7): one registration per
// thread however often the thread asks for its handle, so the compositor's
// call on every frame neither grows a table nor leaks a Windows handle, and
// a thread's handle stops answering once the thread is gone.

#include "platform/CpuUsage.h"

#include <QtTest>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <future>
#include <latch>
#if defined(__linux__)
#include <pthread.h>
#endif
#include <thread>
#include <vector>

using namespace nt;

class TstCpuUsage : public QObject {
    Q_OBJECT

private slots:
#if defined(__linux__)
    void exitCleanupWaitsForNativeQuery() {
        using namespace std::chrono_literals;
        std::promise<unsigned> registered;
        std::promise<void> exitWorker;
        auto exitSignal = exitWorker.get_future();
        std::promise<void> exiting;
        auto exitStarted = exiting.get_future();
        std::jthread worker([&] {
            registered.set_value(cpu::currentThread());
            exitSignal.wait();
            exiting.set_value();
        });
        const unsigned handle = registered.get_future().get();
        std::promise<void> entered;
        auto queryEntered = entered.get_future();
        std::promise<void> resume;
        auto queryResume = resume.get_future();
        cpu::testing::setNativeQuery([&](std::uintptr_t) {
            entered.set_value();
            queryResume.wait();
            return int64_t(123);
        });
        int64_t sample = -1;
        std::jthread sampler([&] { sample = cpu::threadNs(handle); });
        const auto enteredStatus = queryEntered.wait_for(2s);
        std::promise<void> joined;
        auto cleanupDone = joined.get_future();
        std::jthread joiner([&] {
            worker.join();
            joined.set_value();
        });
        exitWorker.set_value();
        const auto exitingStatus = exitStarted.wait_for(2s);
        const auto pausedStatus = cleanupDone.wait_for(200ms);
        // Always unblock before asserting, including on a broken implementation.
        resume.set_value();
        sampler.join();
        const auto resumedStatus = cleanupDone.wait_for(2s);
        joiner.join();
        cpu::testing::setNativeQuery({});
        QCOMPARE(enteredStatus, std::future_status::ready);
        QCOMPARE(exitingStatus, std::future_status::ready);
        QCOMPARE(pausedStatus, std::future_status::timeout);
        QCOMPARE(resumedStatus, std::future_status::ready);
        QCOMPARE(sample, int64_t(123));
        QCOMPARE(cpu::threadNs(handle), int64_t(-1));
    }

    void nativeQueryKeepsThreadIdentity() {
        std::latch ready(2);
        unsigned a = 0, b = 0;
        std::uintptr_t nativeA = 0, nativeB = 0;
        const auto registerWorker = [&](unsigned& handle, std::uintptr_t& native, std::stop_token stop) {
            handle = cpu::currentThread();
            native = static_cast<std::uintptr_t>(pthread_self());
            ready.count_down();
            while (!stop.stop_requested()) std::this_thread::sleep_for(std::chrono::milliseconds(1));
        };
        std::jthread workerA([&](std::stop_token stop) { registerWorker(a, nativeA, stop); });
        std::jthread workerB([&](std::stop_token stop) { registerWorker(b, nativeB, stop); });
        ready.wait();
        cpu::testing::setNativeQuery([&](std::uintptr_t native) {
            return native == nativeA ? int64_t(111) : native == nativeB ? int64_t(222) : int64_t(-1);
        });
        const auto sampleA = cpu::threadNs(a);
        const auto sampleB = cpu::threadNs(b);
        cpu::testing::setNativeQuery({});
        QVERIFY(nativeA != nativeB);
        QVERIFY(a != b);
        QCOMPARE(sampleA, int64_t(111));
        QCOMPARE(sampleB, int64_t(222));
    }

    void busyAndSleepingThreadsHaveDistinctCpuTime() {
        using namespace std::chrono_literals;
        std::latch ready(2);
        unsigned busy = 0, sleeping = 0;
        std::jthread busyWorker([&](std::stop_token stop) {
            busy = cpu::currentThread();
            ready.count_down();
            volatile std::uint64_t sink = 1;
            while (!stop.stop_requested()) sink = sink * 6364136223846793005ULL + 1;
        });
        std::jthread sleepingWorker([&](std::stop_token stop) {
            sleeping = cpu::currentThread();
            ready.count_down();
            while (!stop.stop_requested()) std::this_thread::sleep_for(1ms);
        });
        ready.wait();
        const auto busyBefore = cpu::threadNs(busy);
        const auto sleepingBefore = cpu::threadNs(sleeping);
        const auto processBefore = cpu::processNs();
        std::this_thread::sleep_for(300ms);
        const auto busyAfter = cpu::threadNs(busy);
        const auto sleepingAfter = cpu::threadNs(sleeping);
        const auto processAfter = cpu::processNs();
        const auto busyDelta = busyAfter - busyBefore;
        const auto sleepingDelta = sleepingAfter - sleepingBefore;
        qInfo("CPU deltas: busy=%lld sleeping=%lld process=%lld ns",
              static_cast<long long>(busyDelta), static_cast<long long>(sleepingDelta),
              static_cast<long long>(processAfter - processBefore));
        QVERIFY(busyBefore >= 0 && sleepingBefore >= 0);
        QVERIFY(busyDelta >= 20'000'000);
        QVERIFY(sleepingDelta >= 0);
        QVERIFY(sleepingDelta < busyDelta / 4);
        QVERIFY(sleepingDelta < (processAfter - processBefore) / 4);
        QVERIFY(busyAfter < processAfter);
        QVERIFY(sleepingAfter < processAfter);
    }
#endif

    void oneRegistrationPerThread() {
        const unsigned first = cpu::currentThread();
        QVERIFY(first != 0);
        const int before = cpu::registeredThreads();
        for (int i = 0; i < 1000; ++i) QCOMPARE(cpu::currentThread(), first);
        QCOMPARE(cpu::registeredThreads(), before);
    }

    // Review F7 (decode): a live thread's counter answers and advances with
    // the CPU work the thread does. Only NT_PORTABLE_PLATFORM on macOS (a
    // compile check of the Linux and Windows branch) has no thread clock.
    void liveThreadCounterAdvances() {
#if defined(__APPLE__) && defined(NT_PORTABLE_PLATFORM)
        QSKIP("NT_PORTABLE_PLATFORM on macOS has no per-thread CPU clock");
#endif
        const unsigned self = cpu::currentThread();
        const std::int64_t before = cpu::threadNs(self);
        QVERIFY2(before > 0, qPrintable(QStringLiteral("threadNs = %1").arg(before)));
        constexpr std::int64_t kWorkNs = 20'000'000;  // 20 ms of CPU time
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
        volatile std::uint64_t sink = 0;
        std::int64_t now = before;
        while (now - before < kWorkNs && std::chrono::steady_clock::now() < deadline) {
            for (int i = 0; i < 100000; ++i) sink = sink * 6364136223846793005ULL + 1442695040888963407ULL;
            now = cpu::threadNs(self);
            QVERIFY(now >= before);
        }
        QVERIFY2(now - before >= kWorkNs, qPrintable(QStringLiteral("advanced %1 ns").arg(now - before)));
    }

    // Review F2 (decode): one thread samples other threads while they exit.
    // A sample of a live registration reads that thread's own counter, and a
    // finished thread reads -1 (never another thread's time). Run under TSan
    // for the race itself; on macOS the Mach branch has no registry.
    void samplingWhileThreadsExit() {
        std::atomic<bool> stop{false};
        std::atomic<unsigned> latest{0};
        std::atomic<long> samples{0};
        std::thread sampler([&]() {
            while (!stop) {
                const unsigned h = latest.load();
                if (h) {
                    const std::int64_t ns = cpu::threadNs(h);
                    QVERIFY(ns >= -1);
                    ++samples;
                }
            }
        });
        std::vector<unsigned> ended;
        for (int i = 0; i < 200; ++i) {
            unsigned h = 0;
            std::thread worker([&]() {
                h = cpu::currentThread();
                latest = h;
                // Stay alive until the sampler has read this registration.
                const long seen = samples.load();
                const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
                while (samples.load() <= seen + 1 && std::chrono::steady_clock::now() < deadline) {
                }
            });
            worker.join();
            ended.push_back(h);
        }
        stop = true;
        sampler.join();
        QVERIFY(samples.load() > 0);
#if !defined(__APPLE__) || defined(NT_PORTABLE_PLATFORM)
        for (unsigned h : ended) QCOMPARE(cpu::threadNs(h), std::int64_t(-1));
#endif
    }

    void releasedWhenTheThreadEnds() {
        const int before = cpu::registeredThreads();
        unsigned other = 0;
        std::thread t([&]() {
            other = cpu::currentThread();
            QCOMPARE(cpu::currentThread(), other);
        });
        t.join();
        QVERIFY(other != 0);
        QCOMPARE(cpu::registeredThreads(), before);
        QCOMPARE(cpu::threadNs(other), std::int64_t(-1));
    }

    void processTime() {
        QVERIFY(cpu::processNs() > 0);
    }
};

QTEST_APPLESS_MAIN(TstCpuUsage)
#include "tst_cpuusage.moc"
