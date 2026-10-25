// CPU counters (src/platform/CpuUsage, M6 review F7): one registration per
// thread however often the thread asks for its handle, so the compositor's
// call on every frame neither grows a table nor leaks a Windows handle, and
// a thread's handle stops answering once the thread is gone.

#include "platform/CpuUsage.h"

#include <QtTest>

#include <thread>

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
        QVERIFY(cpu::threadNs(first) >= 0 || cpu::threadNs(first) == -1);
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
