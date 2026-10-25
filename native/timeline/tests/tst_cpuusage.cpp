// CPU counters (src/platform/CpuUsage, M6 review F7): one registration per
// thread however often the thread asks for its handle, so the compositor's
// call on every frame neither grows a table nor leaks a Windows handle, and
// a thread's handle stops answering once the thread is gone.

#include "platform/CpuUsage.h"

#include <QtTest>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <thread>
#include <vector>

using namespace nt;

class TstCpuUsage : public QObject {
    Q_OBJECT

private slots:
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
