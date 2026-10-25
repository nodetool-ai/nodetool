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

    // The byte budget: free targets go least recently used first.
    void budgetEvictsTheOldestIdleTargetFirst() {
        int live = 0;
        const QSize size(10, 10);  // 400 bytes
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); }, 800);
        FakeTarget* first = pool.acquire(size, 1);
        pool.acquire(size, 1);
        pool.endFrame(1, size);
        QCOMPARE(pool.bytes(), size_t(800));
        QCOMPARE(pool.acquire(size, 2), first);  // reused; the other idles since frame 1
        pool.endFrame(2, size);
        pool.setBudgetBytes(400);
        pool.acquire(size, 3);  // reuses `first`, and the idle one is over the budget
        pool.endFrame(3, size);
        QCOMPARE(pool.size(), 1);
        QCOMPARE(pool.bytes(), size_t(400));
        QCOMPARE(pool.acquire(size, 4), first);
        pool.endFrame(4, size);
        QVERIFY(!pool.lastFrameOverBudget());
    }

    // A frame that alone needs more than the budget still gets its targets,
    // and the pool reports it; the next frame within budget clears it.
    // Review F1 (surfaces): the frame's recorded passes still reference its
    // targets when endFrame() runs, before the frame is submitted, so none of
    // them may be freed then. The trim waits for a later frame, when they
    // were last used in a frame already submitted.
    void frameOverBudgetIsReported() {
        int live = 0;
        const QSize size(10, 10);
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); }, 800);
        FakeTarget* used[3] = {};
        for (FakeTarget*& t : used) QVERIFY((t = pool.acquire(size, 1)));
        QCOMPARE(pool.bytes(), size_t(1200));
        pool.endFrame(1, size);
        QVERIFY(pool.lastFrameOverBudget());
        // Frame 1 is not submitted yet: all three of its targets stay.
        QCOMPARE(live, 3);
        QCOMPARE(pool.size(), 3);
        QCOMPARE(pool.bytes(), size_t(1200));
        QCOMPARE(pool.freed(), 0LL);
        // Frame 2 uses one target. Frame 1 is submitted, so the frame-1-only
        // targets may go; the one frame 2 draws with stays to its end.
        FakeTarget* again = pool.acquire(size, 2);
        QVERIFY(again == used[0] || again == used[1] || again == used[2]);
        pool.endFrame(2, size);
        QVERIFY(!pool.lastFrameOverBudget());
        QCOMPARE(pool.bytes(), size_t(800));  // trimmed to the budget
        QCOMPARE(live, 2);
        QCOMPARE(pool.acquire(size, 3), again);  // the target frame 2 used survived the trim
        pool.endFrame(3, size);
        QCOMPARE(SurfacePool<FakeTarget>::bytesFor(QSize(3840, 2160)), size_t(33177600));  // 31.6 MiB
    }

    // No eviction path frees a target the current frame acquired, whatever
    // the budget: a budget of 0 with one surface a frame.
    void targetsOfTheCurrentFrameAreNeverFreed() {
        int live = 0;
        const QSize size(10, 10);
        SurfacePool<FakeTarget> pool([&](QSize) { return std::make_unique<FakeTarget>(&live); }, 0);
        FakeTarget* previous = nullptr;
        for (long long frame = 1; frame <= 5; ++frame) {
            FakeTarget* t = pool.acquire(size, frame);
            QVERIFY(t);
            if (previous) QCOMPARE(t, previous);  // it served the frame before, too
            pool.endFrame(frame, size);
            QCOMPARE(live, 1);  // this frame's target outlives its endFrame()
            previous = t;
        }
        QCOMPARE(pool.created(), 1LL);
    }

    void failedCreateReturnsNull() {
        SurfacePool<FakeTarget> pool([](QSize) { return std::unique_ptr<FakeTarget>(); });
        QVERIFY(!pool.acquire(QSize(10, 10), 1));
        QCOMPARE(pool.size(), 0);
    }
};

QTEST_APPLESS_MAIN(TestSurfacePool)
#include "tst_surfacepool.moc"
