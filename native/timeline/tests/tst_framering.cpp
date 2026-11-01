#include "preview/FrameRing.h"

#include <QTest>

using namespace nt;

namespace {

struct F {
    double ptsSec;
    long long generation = 1;
};

std::vector<double> cfr(int n, double fps) {
    std::vector<double> pts;
    for (int i = 0; i < n; ++i) pts.push_back(i / fps);
    return pts;
}

}  // namespace

class TestFrameRing : public QObject {
    Q_OBJECT

private slots:
    void targetBetweenTwoFrames() {
        // D17: a seek to 50 ms in 30 fps footage shows the frame at 33.3 ms.
        QCOMPARE(selectFrameIndex(cfr(10, 30), 0.050), 1);
    }

    void exactFrameTimeAndEpsilon() {
        const auto pts = cfr(10, 30);
        QCOMPARE(selectFrameIndex(pts, 2.0 / 30.0), 2);
        // A time computed an ulp below the frame still picks it.
        QCOMPARE(selectFrameIndex(pts, 2.0 / 30.0 - 1e-9), 2);
        // A time a microsecond-plus below does not.
        QCOMPARE(selectFrameIndex(pts, 2.0 / 30.0 - 2e-6), 1);
    }

    void beforeFirstAndAfterLast() {
        QCOMPARE(selectFrameIndex({0.1, 0.2}, 0.05), -1);
        QCOMPARE(selectFrameIndex(cfr(10, 30), 100.0), 9);  // end of stream keeps the last
    }

    void variableFrameRateReadsOnlyPts() {
        // Frame n at n/30 for n < 30, then (2n - 30)/30: 1.5 s falls between
        // frame 37 (44/30) and frame 38 (46/30).
        std::vector<double> pts;
        for (int n = 0; n < 60; ++n) pts.push_back((n < 30 ? n : 2 * n - 30) / 30.0);
        QCOMPARE(selectFrameIndex(pts, 1.5), 37);
    }

    void pruneKeepsPredecessorUntilALaterFrameQualifies() {
        const std::vector<double> pts{0.0, 1 / 30.0, 2 / 30.0};
        QCOMPARE(framesBehindTarget(pts, 0.040), 1);   // frame 1 qualifies: drop frame 0
        QCOMPARE(framesBehindTarget(pts, 0.020), 0);   // frame 1 does not: keep frame 0
        QCOMPARE(framesBehindTarget(pts, 5.0), 2);     // the last frame always stays
        QCOMPARE(framesBehindTarget({}, 1.0), 0);
    }

    void restartRule() {
        QVERIFY(needsDecodeRestart(2.0, 1.9));             // backward
        QVERIFY(!needsDecodeRestart(2.0, 2.0 - 5e-7));     // within epsilon
        QVERIFY(!needsDecodeRestart(2.0, 3.0));            // 1 s forward decodes through
        QVERIFY(needsDecodeRestart(2.0, 3.01));            // further seeks
    }

    void decodeAheadLimits() {
        QVERIFY(wantsMoreFrames(0, -1e300, 1.0));
        QVERIFY(wantsMoreFrames(3, 1.2, 1.0));
        QVERIFY(!wantsMoreFrames(3, 1.25, 1.0));  // 250 ms ahead
        QVERIFY(!wantsMoreFrames(8, 1.0, 1.0));   // 8 frames
    }

    void ringSnapshot() {
        FrameRing<F> ring;
        ring.reset(1);
        for (int i = 0; i < 4; ++i) QVERIFY(ring.push(std::make_shared<F>(F{i / 30.0, 1})));
        QVERIFY(!ring.push(std::make_shared<F>(F{5 / 30.0, 0})));  // a stale generation is dropped
        auto s = ring.pick(0.07);
        QVERIFY(s.front);
        QCOMPARE(s.front->ptsSec, 2 / 30.0);
        QCOMPARE(s.size, 2);
        QVERIFY(s.frameAfter);
        QVERIFY(!s.eof);
        QCOMPARE(s.generation, 1LL);
        s = ring.pick(0.2);
        QVERIFY(!s.frameAfter);
        ring.setEof(1);
        QVERIFY(ring.pick(0.2).eof);
        ring.reset(2);
        s = ring.pick(0.2);
        QVERIFY(!s.front);
        QVERIFY(!s.eof);
        QCOMPARE(s.generation, 2LL);
    }
};

QTEST_APPLESS_MAIN(TestFrameRing)
#include "tst_framering.moc"
