#include "bench/BenchReport.h"

#include <QJsonArray>
#include <QTest>

using namespace nt::bench;

namespace {

BenchData sampleData() {
    BenchData d;
    d.frames = 20;
    d.vsync = true;
    d.refreshHz = 60.0;
    for (int i = 1; i <= 20; ++i) {
        d.cpuMs.push_back(i * 0.1);  // 0.1 .. 2.0
        d.gpuObservationsMs.push_back(0.5);
        d.renderIntervalMs.push_back(16.6);
        d.submitIntervalMs.push_back(16.6);
    }
    return d;
}

}  // namespace

class TestBenchReport : public QObject {
    Q_OBJECT

private slots:
    void percentilesAreNearestRank() {
        const Summary s = summarize({5, 1, 4, 2, 3, 6, 7, 8, 9, 10});
        QCOMPARE(s.count, 10);
        QCOMPARE(s.p50, 5.0);
        QCOMPARE(s.p95, 10.0);
        QCOMPARE(s.max, 10.0);
        QCOMPARE(summarize({}).count, 0);
    }

    void skippedSubmitsCountsMissedVsyncs() {
        QCOMPARE(skippedSubmits({16.7, 33.3, 16.7, 50.0}, 60.0, true), std::optional<int>(3));
        QCOMPARE(skippedSubmits({16.7, 20.0}, 60.0, true), std::optional<int>(0));
        QVERIFY(!skippedSubmits({16.7}, 60.0, false).has_value());
        QVERIFY(!skippedSubmits({16.7}, 0.0, true).has_value());
    }

    void parsesInlineAndJsonBudgets() {
        const auto inl = parseBudget(QStringLiteral("cpuMs.p95=2,renderIntervalMs.p95=20,skippedSubmitsFraction=0.01"));
        QVERIFY2(inl.budget.has_value(), qPrintable(inl.error));
        QCOMPARE(inl.budget->size(), size_t(3));
        const auto json = parseBudget(QStringLiteral(R"({"submitIntervalMs.p95": 17.5, "cpuMs.count": 10})"));
        QVERIFY2(json.budget.has_value(), qPrintable(json.error));
        QCOMPARE(json.budget->at("submitIntervalMs.p95"), 17.5);
    }

    // A platform budget file (bench/budgets-<platform>-*.json, PLAN M6) names
    // its machine under keys that start with "_"; they are not budgets.
    void ignoresMachineMetadata() {
        const auto r = parseBudget(QStringLiteral(
            R"({"_machine": {"name": "ref-linux", "gpu": "x", "displayHz": 60}, "_note": "text", "cpuMs.p95": 8})"));
        QVERIFY2(r.budget.has_value(), qPrintable(r.error));
        QCOMPARE(r.budget->size(), size_t(1));
        QCOMPARE(r.budget->at("cpuMs.p95"), 8.0);
    }

    void rejectsBadBudgets_data() {
        QTest::addColumn<QString>("text");
        QTest::newRow("unknown measurement") << QStringLiteral("fooMs.p95=2");
        QTest::newRow("unknown stat") << QStringLiteral("cpuMs.p99=2");
        QTest::newRow("not a number") << QStringLiteral("cpuMs.p95=fast");
        QTest::newRow("empty") << QStringLiteral("");
        QTest::newRow("json string value") << QStringLiteral(R"({"cpuMs.p95": "2"})");
        QTest::newRow("gpu is information only") << QStringLiteral("gpuMs.p95=2");
        QTest::newRow("old count key") << QStringLiteral("skippedSubmits=0");
    }
    void rejectsBadBudgets() {
        QFETCH(QString, text);
        const auto r = parseBudget(text);
        QVERIFY(!r.budget.has_value());
        QVERIFY(!r.error.isEmpty());
    }

    void passesWithinBudget() {
        const Report r = buildReport(sampleData(), Budget{{"cpuMs.p95", 2.0},
                                                          {"submitIntervalMs.p95", 17.5},
                                                          {"skippedSubmitsFraction", 0.01}});
        QVERIFY(r.pass);
        QCOMPARE(r.json.value(u"cpuMs").toObject().value(u"count").toInt(), 20);
        QCOMPARE(r.json.value(u"budget").toObject().value(u"pass").toBool(), true);
    }

    void failsOverLimit() {
        const Report r = buildReport(sampleData(), Budget{{"cpuMs.p95", 1.0}});
        QVERIFY(!r.pass);
        QCOMPARE(r.budget.front().value.value(), 1.9);
    }

    void failsClosedWithoutSamples() {
        BenchData d = sampleData();
        d.gpuObservationsMs.resize(17);  // under 90% of 20 frames: gpuMs is null
        QVERIFY(buildReport(d, std::nullopt).json.value(u"gpuMs").isNull());
        d.cpuMs.clear();
        const Report r = buildReport(d, Budget{{"cpuMs.p95", 100.0}});
        QVERIFY(!r.pass);
        QVERIFY(!r.budget.front().value.has_value());

        BenchData noVsync = sampleData();
        noVsync.vsync = false;
        QVERIFY(!buildReport(noVsync, Budget{{"skippedSubmitsFraction", 1.0}}).pass);

        BenchData noPresents = sampleData();
        noPresents.submitIntervalMs.clear();
        QVERIFY(!buildReport(noPresents, Budget{{"submitIntervalMs.p95", 100.0}}).pass);
    }

    void skippedFractionLimit() {
        BenchData d = sampleData();  // 20 frames
        d.submitIntervalMs[3] = 33.3;  // one missed vsync at 60 Hz
        QVERIFY(!buildReport(d, Budget{{"skippedSubmitsFraction", 0.01}}).pass);  // 1/20 = 5%
        QVERIFY(buildReport(d, Budget{{"skippedSubmitsFraction", 0.05}}).pass);
    }

    // F7: a frame whose media layer had no picture is not a correct frame.
    void missingPicturesFail() {
        BenchData d = sampleData();
        d.mediaFrames = 20;
        d.correctMediaFrames = 18;
        d.missingMediaFrames = 2;
        d.frameError.assign(18, 0.0);  // the drawn frames were all exact
        const Report r = buildReport(d, Budget{{"frameErrorZeroFraction", 0.95}, {"missingMediaFrames", 0.0}});
        QVERIFY(!r.pass);
        QCOMPARE(r.json.value(u"frameErrorZeroFraction").toDouble(), 0.9);
        for (const auto& b : r.budget) QVERIFY2(!b.pass, b.key.c_str());
    }

    // A window that runs at a steady 60 Hz on a screen that reports 120 Hz
    // (ProMotion, a throttled background window) skips nothing: the period
    // comes from the measured cadence, not from QScreen.
    void steady60HzOnA120HzScreenHasNoSkips() {
        BenchData d = sampleData();
        d.refreshHz = 120.0;
        d.submitIntervalMs.assign(600, 16.67);
        d.frames = 600;
        const Report r = buildReport(d, Budget{{"skippedSubmitsFraction", 0.01}});
        QCOMPARE(r.json.value(u"skippedSubmits").toInt(), 0);
        QCOMPARE(r.json.value(u"measuredCadenceHz").toDouble(), 60.0);
        QCOMPARE(r.json.value(u"screenRefreshHz").toDouble(), 120.0);
        QVERIFY(r.pass);
    }

    // At the measured 60 Hz, a 33 ms interval is one skip and 50 ms two.
    void skipsCountAgainstTheMeasuredPeriod() {
        BenchData d = sampleData();
        d.refreshHz = 120.0;
        d.submitIntervalMs.assign(100, 16.67);
        d.submitIntervalMs[10] = 33.3;
        d.submitIntervalMs[20] = 50.0;
        d.submitIntervalMs[30] = 24.0;  // under 1.5 periods: no skip
        QCOMPARE(buildReport(d, std::nullopt).json.value(u"skippedSubmits").toInt(), 3);
    }

    // M1c F5: with the basic render loop the GUI and render threads are one
    // thread; its CPU time is subtracted once, not twice.
    void sharedGuiAndRenderThreadCountsOnce() {
        BenchData d = sampleData();
        d.cpuWallMs = 1000.0;
        d.processCpuPercent = 50.0;
        d.mainCpuPercent = 20.0;
        d.renderCpuPercent = 20.0;  // the same thread as main
        d.guiAndRenderShareThread = true;
        const QJsonObject cpu = buildReport(d, std::nullopt).json.value(u"cpu").toObject();
        QCOMPARE(cpu.value(u"decodeAndOtherPercent").toDouble(), 30.0);
        QVERIFY(cpu.value(u"renderThreadPercent").isNull());
        QCOMPARE(cpu.value(u"guiAndRenderShareThread").toBool(), true);
    }

    // F5: a CPU query that failed is unavailable, not 0.
    void failedCpuQueryIsUnavailable() {
        BenchData d = sampleData();
        d.cpuWallMs = 1000.0;
        d.processCpuPercent = 50.0;
        d.mainCpuPercent = 5.0;
        d.renderCpuPercent = std::nullopt;  // thread_info failed
        const QJsonObject cpu = buildReport(d, std::nullopt).json.value(u"cpu").toObject();
        QVERIFY(cpu.value(u"renderThreadPercent").isNull());
        QVERIFY(cpu.value(u"decodeAndOtherPercent").isNull());
        QCOMPARE(cpu.value(u"processPercent").toDouble(), 50.0);
    }

    // M1c F6: skips count against the explicit target rate (60 Hz in the
    // budgets), so a steady 30 Hz run fails although its cadence is even.
    void steady30HzFailsA60HzTarget() {
        BenchData d = sampleData();
        d.refreshHz = 120.0;
        d.frames = 300;
        d.submitIntervalMs.assign(299, 33.33);
        const Report r = buildReport(d, Budget{{"targetHz", 60.0}, {"skippedSubmitsFraction", 0.01}});
        QCOMPARE(r.json.value(u"measuredCadenceHz").toDouble(), 30.0);
        QCOMPARE(r.json.value(u"targetHz").toDouble(), 60.0);
        QCOMPARE(r.json.value(u"skippedSubmits").toInt(), 299);
        QVERIFY(!r.pass);
    }

    // targetHz is a parameter of the budget, not a limit.
    void targetHzIsNotALimit() {
        const auto b = parseBudget(QStringLiteral("targetHz=60,skippedSubmitsFraction=0.01"));
        QVERIFY2(b.budget.has_value(), qPrintable(b.error));
        const Report r = buildReport(sampleData(), b.budget);
        for (const auto& result : r.budget) QVERIFY(result.key != "targetHz");
    }

    // F7: a run whose window lost exposure (Qt stops rendering it) fails.
    void exposureLossFailsTheRun() {
        BenchData d = sampleData();
        d.exposureLosses = 1;
        const Report r = buildReport(d, Budget{{"cpuMs.p95", 100.0}});
        QVERIFY(!r.pass);
        QCOMPARE(r.json.value(u"exposureLosses").toInt(), 1);
    }

    void noBudgetPasses() {
        QVERIFY(buildReport(sampleData(), std::nullopt).pass);
    }
};

QTEST_APPLESS_MAIN(TestBenchReport)
#include "tst_benchreport.moc"
