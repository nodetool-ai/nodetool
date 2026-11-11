#include "ui/Timecode.h"
#include "ui/TimelineFormat.h"
#include "ui/TimelineFormatQml.h"
#include "ui/TimelineViewState.h"
#include "wiring/RulerProviders.h"
#include <QtTest>
#include <cmath>
#include <limits>
using namespace nt::ui;
class TimecodeTest : public QObject {
    Q_OBJECT
private slots:

    void parseForms_data() {
        QTest::addColumn<QString>("input"); QTest::addColumn<long long>("expected");
        QTest::newRow("fields") << QString("00:00:10:00") << 250LL;
        QTest::newRow("digits") << QString("1000") << 250LL;
        QTest::newRow("digits-frame") << QString("1015") << 265LL;
        QTest::newRow("odd-digits") << QString("12345") << 2120LL;
        QTest::newRow("dot") << QString("1.00") << 25LL;
        QTest::newRow("plus") << QString("+15") << 115LL;
        QTest::newRow("plus10") << QString("+10") << 110LL;
        QTest::newRow("minus") << QString("-5") << 95LL;
        QTest::newRow("minus-fields") << QString("-1.00") << 75LL;
        QTest::newRow("clamp") << QString("-1000") << 0LL;
        QTest::newRow("overflow-frames") << QString("90") << 90LL;
        QTest::newRow("overflow-fields") << QString("99:99:99:99") << 9061074LL;
        QTest::newRow("empty-fields") << QString(" :10: ") << 250LL;
        QTest::newRow("mixed") << QString("00;00,10.00") << 250LL;
        QTest::newRow("saturating-relative") << QString("+9223372036854775807") << std::numeric_limits<long long>::max();
        QTest::newRow("saturating-fields") << QString("9223372036854775807:00:00:00") << std::numeric_limits<long long>::max();
    }
    void parseForms() {
        QFETCH(QString, input); QFETCH(long long, expected);
        const auto value = parseTimecode(input, 25, false, 100);
        QVERIFY(value); QCOMPARE(*value, expected);
    }
    void invalidInput_data() {
        QTest::addColumn<QString>("input");
        int row = 0;
        for (const auto& input : {QString(""), QString("  "), QString("00:00:-5:00"), QString("00:+1:00:00"),
             QString("abc"), QString("1e3"), QString("10f"), QString("1:2:3:4:5"), QString("99999999999999999999"),
             QString("+99999999999999999999"), QString("99999999999999999999:00"), QString("１２"),
             QString("١٢"), QString("+"), QString("-"), QString("++1"), QString("1 0"), QString("1: 2")}) {
            QTest::newRow(qPrintable(QString::number(row++))) << input;
        }
    }
    void invalidInput() {
        QFETCH(QString, input);
        for (const bool df : {false, true}) { QVERIFY(!parseTimecode(input, 29.97, df, 100)); }
        TimelineFormat formatter;
        QVERIFY(std::isnan(formatter.parseTimecode(input, 29.97, false, 100)));
    }
    void droppedLabels() {
        QCOMPARE(parseTimecode(u"00;01;00;00", 29.97, true, 0).value(), 1800LL);
        QCOMPARE(parseTimecode(u"00;01;00;01", 29.97, true, 0).value(), 1800LL);
        QCOMPARE(parseTimecode(u"00;01;00;00", 59.94, true, 0).value(), 3600LL);
        QCOMPARE(parseTimecode(u"00;01;00;04", 59.94, true, 0).value(), 3600LL);
        QCOMPARE(parseTimecode(u"00;10;00;00", 29.97, true, 0).value(), 17982LL);
        QCOMPARE(parseTimecode(u"00;60;00;00", 29.97, true, 0).value(), 108000LL);
        QCOMPARE(parseTimecode(u"00;01;60;00", 29.97, true, 0).value(), 3600LL);
        QCOMPARE(parseTimecode(u"00;01;00;30", 29.97, true, 0).value(), 1830LL);
    }
    void fractionalRoundTrips() {
        TimelineFormat formatter;
        for (const double fps : {23.976, 24.0, 25.0, 29.97, 29.97002997, 30.0, 59.94, 60.0, 119.88}) {
            for (const bool df : {false, true}) {
                const auto check = [&](long long frame) {
                    const auto ms = msAtFrame(frame, fps);
                    if (frameAtMs(ms, fps) != frame) { return false; }
                    const auto label = formatTimecodeFrame(frame, fps, df);
                    if (parseTimecode(label, fps, df, frame) != frame) { return false; }
                    return frameAtMs(formatter.parseTimecode(label, fps, df, ms), fps) == frame;
                };
                for (long long frame = 0; frame <= 200000; frame += 7) { QVERIFY2(check(frame), qPrintable(QString("%1 fps frame %2 df %3").arg(fps).arg(frame).arg(df))); }
                for (int minute = 1; minute <= 120; ++minute) {
                    const auto boundary = frameAtMs(minute*60000.0, fps);
                    for (int delta = -5; delta <= 5; ++delta) { QVERIFY(check(boundary+delta)); }
                }
            }
        }
    }
    void legacyFormattingAndRates() {
        TimelineFormat formatter;
        for (const double fps : {24.0,25.0,30.0,23.976,29.97,59.94}) {
            for (double ms = -500; ms < 7200000; ms += 113.25) {
                QCOMPARE(formatTimecodeMs(ms, fps, false), formatPlayheadTimecode(ms, fps));
            }
            QCOMPARE(formatter.timecode(1500, fps, false), formatTimecodeMs(1500, fps, false));
            QCOMPARE(formatter.frameAt(1500, fps), double(frameAtMs(1500, fps)));
            QCOMPARE(formatter.msAt(100, fps), msAtFrame(100, fps));
        }
        for (const double fps : {0.0, -1.0, std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity()}) {
            QCOMPARE(timecodeBase(fps), 1); QVERIFY(!supportsDropFrame(fps));
            QCOMPARE(formatTimecodeMs(1500, fps, true), QString("00:00:02:00"));
            QCOMPARE(frameAtMs(msAtFrame(100, fps), fps), 100LL);
        }
        QCOMPARE(frameAtMs(500, 1), 1LL); QCOMPARE(frameAtMs(-500, 25), 0LL);
        QCOMPARE(timecodeBase(23.976), 24); QVERIFY(!supportsDropFrame(30));
        QVERIFY(supportsDropFrame(29.97)); QVERIFY(supportsDropFrame(59.94)); QVERIFY(supportsDropFrame(119.88));
        QCOMPARE(frameAtMs(std::numeric_limits<double>::infinity(), 30), std::numeric_limits<long long>::max());
        QCOMPARE(frameAtMs(std::numeric_limits<double>::quiet_NaN(), 30), 0LL);
        QVERIFY(!formatTimecodeFrame(std::numeric_limits<long long>::max(), 29.97, true).isEmpty());
    }
    void timecodeRuler() {
        TimelineViewState view;
        QSignalSpy modeSpy(&view, &TimelineViewState::rulerModeChanged);
        view.setRulerMode("timecode"); QCOMPARE(view.rulerMode(), QString("timecode"));
        view.setRulerMode("timecode"); QCOMPARE(modeSpy.count(), 1);
        for (const double fps : {30.0, 29.97}) {
            for (const double msPerPx : {0.01, 0.5, 1.0, 10.0, 1000.0}) {
                nt::wiring::RulerRequest request{msPerPx, 59000, 120000, fps, {}, {{"dropFrame", true}}};
                const auto ticks = nt::wiring::rulerTicks("timecode", request);
                QVERIFY(!ticks.empty());
                double lastMajor = -1;
                for (const auto& tick : ticks) {
                    QVERIFY(tick.timeMs >= request.fromMs && tick.timeMs <= request.toMs);
                    const auto frame = frameAtMs(tick.timeMs, fps);
                    QVERIFY(std::abs(tick.timeMs-msAtFrame(frame, fps)) < 1e-8);
                    if (tick.major) {
                        QCOMPARE(tick.label, formatTimecodeFrame(frame, fps, true));
                        if (lastMajor >= 0) { QVERIFY((tick.timeMs-lastMajor)/msPerPx >= 90-1e-8); }
                        lastMajor = tick.timeMs;
                    } else { QVERIFY(tick.label.isEmpty()); }
                }
            }
        }
        const auto labelled = nt::wiring::rulerTicks("timecode", {1, 60000, 61000, 30, {}, {}});
        QVERIFY(!labelled.empty()); QCOMPARE(labelled.front().label, QString("00:01:00:00"));
        const auto dropped = nt::wiring::rulerTicks("timecode", {1, 60000, 61000, 29.97, {}, {{"dropFrame", true}}});
        QVERIFY(!dropped.empty());
        const auto capped = nt::wiring::rulerTicks("timecode", {0.001, 0, 1e12, 30, {}, {}});
        QCOMPARE(capped.size(), size_t(10000));
        for (const auto& request : {nt::wiring::RulerRequest{0,0,100,30, {}, {}}, nt::wiring::RulerRequest{-1,0,100,30, {}, {}},
             nt::wiring::RulerRequest{1,10,0,30, {}, {}}, nt::wiring::RulerRequest{1,0,100,0, {}, {}},
             nt::wiring::RulerRequest{1,0,100,-1, {}, {}}, nt::wiring::RulerRequest{1,0,100,std::numeric_limits<double>::quiet_NaN(), {}, {}},
             nt::wiring::RulerRequest{1,0,std::numeric_limits<double>::infinity(),30, {}, {}}}) {
            QVERIFY(nt::wiring::rulerTicks("timecode", request).empty());
        }
    }
    void knownValues_data() {
        QTest::addColumn<long long>("frame");
        QTest::addColumn<double>("fps");
        QTest::addColumn<bool>("df");
        QTest::addColumn<QString>("label");
        QTest::newRow("zero") << 0LL << 29.97 << true << QString("00;00;00;00");
        QTest::newRow("minute-before") << 1799LL << 29.97 << true << QString("00;00;59;29");
        QTest::newRow("minute") << 1800LL << 29.97 << true << QString("00;01;00;02");
        QTest::newRow("ten-minutes") << 17982LL << 29.97 << true << QString("00;10;00;00");
        QTest::newRow("hour") << 107892LL << 29.97 << true << QString("01;00;00;00");
        QTest::newRow("non-drop") << 1800LL << 29.97 << false << QString("00:01:00:00");
        QTest::newRow("double-rate") << 3600LL << 59.94 << true << QString("00;01;00;04");
        QTest::newRow("triple-width") << 7200LL << 119.88 << true << QString("00;01;00;008");
    }
    void knownValues() {
        QFETCH(long long, frame); QFETCH(double, fps); QFETCH(bool, df); QFETCH(QString, label);
        QCOMPARE(formatTimecodeFrame(frame, fps, df), label);
    }
};
QTEST_GUILESS_MAIN(TimecodeTest)
#include "tst_timecode.moc"
