#include "preview/FfmpegSource.h"
#include "preview/FrameCache.h"

#include <QTest>

using namespace nt;

namespace {

std::shared_ptr<DecodedFrame> frameAt(double pts) {
    auto f = std::make_shared<DecodedFrame>();
    f->ptsSec = pts;
    return f;
}

}  // namespace

class TestFrameCache : public QObject {
    Q_OBJECT

private slots:
    void doesNotPinWindowsDecoderSurfaces() {
#ifdef _WIN32
        FrameCache cache;
        auto hardware = frameAt(0.0);
        hardware->hardware = true;
        std::weak_ptr<DecodedFrame> surface = hardware;
        cache.insert("gpu", 0.0, hardware, 640 * 360 * 3 / 2, -1.0);
        hardware.reset();
        QVERIFY(surface.expired());
        QCOMPARE(cache.bytes(), size_t(0));
        cache.insert("software", 0.0, frameAt(0.0), 100, -1.0);
        cache.insert("software", 1.0, frameAt(1.0), 100, 0.0);
        QVERIFY(cache.lookup("software", 0.5));
#else
        QSKIP("Windows D3D11 surface lifetime");
#endif
    }
    // Only a successor from the same decode run proves a pick (review F1:
    // a header frame rate proves no interval).
    void hitNeedsProof() {
        FrameCache c(1 << 20);
        c.insert("a", 1.0, frameAt(1.0), 100, -1.0);
        QVERIFY(!c.lookup("a", 1.02));  // no successor: unknown, at any header rate
        c.insert("a", 1.5, frameAt(1.5), 100, 1.0);
        QVERIFY(c.lookup("a", 1.4));
        QCOMPARE(c.lookup("a", 1.4)->ptsSec, 1.0);
        QVERIFY(!c.lookup("a", 1.6));  // 1.5 has no successor
    }

    void targetBeforeFirstCachedFrameMisses() {
        FrameCache c(1 << 20);
        c.insert("a", 2.0, frameAt(2.0), 100, -1.0);
        c.insert("a", 2.1, frameAt(2.1), 100, 2.0);
        QVERIFY(!c.lookup("a", 1.9));
        QVERIFY(!c.lookup("b", 2.0));
    }

    void evictsLeastRecentlyUsedWithinBudget() {
        FrameCache c(300);
        c.insert("a", 0.0, frameAt(0.0), 100, -1.0);
        c.insert("a", 1.0, frameAt(1.0), 100, 0.0);
        c.insert("a", 2.0, frameAt(2.0), 100, 1.0);
        QVERIFY(c.lookup("a", 0.0));  // 0.0 is now most recent
        c.insert("a", 3.0, frameAt(3.0), 100, 2.0);  // evicts 1.0, which also unlinks 0.0
        QVERIFY(c.bytes() <= 300);
        QVERIFY(c.peakBytes() <= 300);
        QVERIFY(!c.lookup("a", 1.0));
        QVERIFY(!c.lookup("a", 0.0));  // its successor 1.0 is gone
        QVERIFY(c.lookup("a", 2.0));
    }

    void evictedSuccessorNoLongerProves() {
        FrameCache c(200);
        c.insert("a", 1.0, frameAt(1.0), 100, -1.0);
        c.insert("a", 1.5, frameAt(1.5), 100, 1.0);
        QVERIFY(c.lookup("a", 1.4));         // 1.0 proven by its successor; 1.0 now newest
        c.insert("a", 9.0, frameAt(9.0), 100, -1.0);  // evicts 1.5, the least recently used
        QVERIFY(!c.lookup("a", 1.4));
    }

    // Review F3: the peak counts the moment before eviction, and a frame the
    // cache evicted while another owner holds it is reported as pinned
    // elsewhere, not as freed.
    void reportsPeakBeforeEvictionAndPinnedMemory() {
        FrameCache c(200);
        auto held = frameAt(0.0);
        c.insert("a", 0.0, held, 100, -1.0);
        c.insert("a", 1.0, frameAt(1.0), 100, 0.0);
        c.insert("a", 2.0, frameAt(2.0), 100, 1.0);  // 300 for a moment, then 0.0 goes
        QCOMPARE(c.bytes(), size_t(200));
        QCOMPARE(c.peakBytes(), size_t(200));
        QCOMPARE(c.peakBeforeEvictionBytes(), size_t(300));
        QCOMPARE(c.pinnedElsewhereBytes(), size_t(100));  // `held` keeps frame 0.0
        held.reset();
        QCOMPARE(c.pinnedElsewhereBytes(), size_t(0));
    }

    void eraseSourceDropsItsFrames() {
        FrameCache c(1 << 20);
        c.insert("a", 1.0, frameAt(1.0), 100, -1.0);
        c.insert("a", 1.5, frameAt(1.5), 100, 1.0);
        c.insert("b", 1.0, frameAt(1.0), 100, -1.0);
        c.eraseSource("a");
        QCOMPARE(c.bytes(), size_t(100));
        QVERIFY(!c.lookup("a", 1.2));
    }
};

QTEST_APPLESS_MAIN(TestFrameCache)
#include "tst_framecache.moc"
