// The surface pool (DESIGN.md D35): render targets are reused frame to
// frame, and freed when idle or when the canvas size changes.

#include "preview/SurfacePool.h"

#include <QTest>

using namespace nt;

namespace {

struct FakeTarget {
    explicit FakeTarget(int* live) : m_live(live) { ++*m_live; }
    ~FakeTarget() { --*m_live; }
    int* m_live;
};

}  // namespace

class TestSurfacePool : public QObject {
    Q_OBJECT

private slots:
    void steadySceneReusesItsTargets() {
        int live = 0;
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); });
        const QSize canvas(1920, 1080);
        for (long long frame = 1; frame <= 100; ++frame) {
            FakeTarget* a = pool.acquire(canvas, frame);
            FakeTarget* b = pool.acquire(canvas, frame);
            QVERIFY(a && b && a != b);  // two surfaces in one frame: two targets
            pool.endFrame(frame, canvas);
        }
        QCOMPARE(pool.created(), 2LL);
        QCOMPARE(pool.size(), 2);
        QCOMPARE(live, 2);
    }

    void idleTargetsAreFreed() {
        int live = 0;
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); });
        const QSize canvas(640, 360);
        pool.acquire(canvas, 1);
        pool.acquire(canvas, 1);
        pool.endFrame(1, canvas);
        // The scene drops to one surface: the second target idles, then goes.
        long long frame = 2;
        for (; frame <= 1 + SurfacePool<FakeTarget>::kIdleFrames; ++frame) {
            pool.acquire(canvas, frame);
            pool.endFrame(frame, canvas);
        }
        QCOMPARE(pool.size(), 2);
        pool.acquire(canvas, frame);
        pool.endFrame(frame, canvas);
        QCOMPARE(pool.size(), 1);
        QCOMPARE(live, 1);
        QCOMPARE(pool.freed(), 1LL);
        QCOMPARE(pool.created(), 2LL);
    }

    void canvasSizeChangeFreesOldTargets() {
        int live = 0;
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); });
        pool.acquire(QSize(1920, 1080), 1);
        pool.endFrame(1, QSize(1920, 1080));
        pool.acquire(QSize(1280, 720), 2);
        pool.endFrame(2, QSize(1280, 720));
        QCOMPARE(pool.size(), 1);
        QCOMPARE(live, 1);
        pool.clear();
        QCOMPARE(live, 0);
    }

    void failedCreateReturnsNull() {
        SurfacePool<FakeTarget> pool([](QSize) { return std::unique_ptr<FakeTarget>(); });
        QVERIFY(!pool.acquire(QSize(10, 10), 1));
        QCOMPARE(pool.size(), 0);
    }
};

QTEST_APPLESS_MAIN(TestSurfacePool)
#include "tst_surfacepool.moc"
