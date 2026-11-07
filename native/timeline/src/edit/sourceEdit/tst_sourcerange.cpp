#include "SourceRange.h"
#include <QtTest>
#include <cmath>
#include <limits>

using namespace nt::sourceedit;
class TestSourceRange : public QObject {
    Q_OBJECT
private slots:
    void rangesSnapAndClamp() {
        for (const double fps : {24000.0 / 1001, 24.0, 25.0, 30000.0 / 1001, 30.0, 50.0, 60000.0 / 1001, 60.0}) {
            const double frame = frameDurationMs(fps);
            const Range range{48 * frame, 96 * frame};
            for (const double delta : {-1e18, -200 * frame, -8 * frame, 0.0, 8 * frame, 200 * frame, 1e18,
                                      -std::numeric_limits<double>::infinity(), std::numeric_limits<double>::infinity()}) {
                for (const auto edge : {RangeEdge::In, RangeEdge::Out, RangeEdge::Move}) {
                    const auto result = adjustRange(240 * frame, range, fps, edge, delta);
                    if (!std::isfinite(delta)) { QVERIFY(!result); continue; }
                    QVERIFY(result);
                    QVERIFY(result->inMs >= 0 && result->outMs <= 240 * frame + 1e-8);
                    QVERIFY(result->outMs - result->inMs >= frame - 1e-8);
                    if (edge == RangeEdge::Move) { QVERIFY(std::abs(result->outMs - result->inMs - 48 * frame) < 1e-8); }
                    if (edge == RangeEdge::In) { QCOMPARE(result->outMs, range.outMs); }
                    if (edge == RangeEdge::Out) { QCOMPARE(result->inMs, range.inMs); }
                    for (const double t : {result->inMs, result->outMs}) {
                        const double index = std::round(t * fps / 1000);
                        QCOMPARE(std::floor(t * fps / 1000 + 1e-6), index);
                    }
                }
            }
            for (int i = 0; i < 10000; ++i) {
                const auto t = frameFloorMs(i * frame, fps);
                QCOMPARE(std::floor(t * fps / 1000 + 1e-6), double(i));
            }
        }
    }
    void hostileRangesAndRates() {
        const double nan = std::numeric_limits<double>::quiet_NaN();
        for (const double fps : {0.0, -30.0, nan}) {
            QCOMPARE(frameDurationMs(fps), 1.0);
            QCOMPARE(frameFloorMs(123.45, fps), 123.45);
            const auto result = adjustRange(10000, {0, 1000}, fps, RangeEdge::Move, 1e18);
            QVERIFY(result); QCOMPARE(result->inMs, 9000.0); QCOMPARE(result->outMs, 10000.0);
        }
        for (const Range range : {Range{-1, 1}, Range{0, -1}, Range{0, 0}, Range{9000, 10001}, Range{nan, 1000}, Range{0, nan}}) {
            QVERIFY(!adjustRange(10000, range, 24, RangeEdge::In, -1e18));
        }
        QVERIFY(!adjustRange(nan, {0, 1}, 24, RangeEdge::In, 0));
        QVERIFY(!adjustRange(0, {0, 1}, 24, RangeEdge::In, 0));
        QVERIFY(!adjustRange(1000, {0, 1}, 24, RangeEdge::In, nan));
        const double infinity = std::numeric_limits<double>::infinity();
        QVERIFY(!adjustRange(infinity, {0, 1}, 24, RangeEdge::In, 0));
        QVERIFY(!adjustRange(1000, {0, infinity}, 24, RangeEdge::In, 0));
    }
    void singleFrameAndPartialEnd() {
        for (const auto edge : {RangeEdge::In, RangeEdge::Out, RangeEdge::Move}) {
            for (const double delta : {-1e18, 0.0, 1e18}) {
                const auto result = adjustRange(1, {0, 1}, 24, edge, delta);
                QVERIFY(result); QCOMPARE(result->inMs, 0.0); QCOMPARE(result->outMs, 1.0);
            }
        }
        const auto last = adjustRange(1010, {0, 1000}, 30, RangeEdge::Out, 1e18);
        QVERIFY(last); QCOMPARE(last->outMs, 1010.0);
        const auto moved = adjustRange(1010, {1000, 1010}, 30, RangeEdge::Move, -1e18);
        QVERIFY(moved); QCOMPARE(moved->inMs, 0.0); QVERIFY(std::abs(moved->outMs - 1000.0 / 30) < 1e-8);
        const auto partial = adjustRange(1010, {1000, 1010}, 30, RangeEdge::In, 1e18);
        QVERIFY(partial); QCOMPARE(partial->inMs, 1000.0); QCOMPARE(partial->outMs, 1010.0);
    }
};
QTEST_GUILESS_MAIN(TestSourceRange)
#include "tst_sourcerange.moc"
