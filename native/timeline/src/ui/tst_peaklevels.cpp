// Peaks at more than one resolution (docs/MUSIC-MODE.md AU-7).
#include "ui/MediaPreviews.h"
#include "ui/PeakLevels.h"
#include <QtTest>
#include <algorithm>
#include <cmath>
#include <vector>

using namespace nt::ui;

namespace {
constexpr double kFourMinutesMs = 240000;

// A deterministic fine level, none of it equal to the poison value.
std::vector<float> fineLevel(int count) {
    std::vector<float> peaks(static_cast<size_t>(count));
    for (int i = 0; i < count; ++i) peaks[static_cast<size_t>(i)] = float((i * 37) % 91) / 100.0f;
    return peaks;
}
AudioPeaks takeOf(double durationMs) {
    AudioPeaks take;
    take.durationMs = durationMs;
    take.peaks = fineLevel(finePeakCount(durationMs));
    take.coarse = reducePeakLevels(take.peaks, durationMs);
    return take;
}
// The bars a widget of `bars` bars draws for the window, through the chosen level.
std::vector<float> drawBars(const AudioPeaks& take, double inMs, double outMs, int bars, size_t* level) {
    *level = choosePeakLevel(take, inMs, outMs, bars);
    return samplePeaksWindow(take.level(*level), take.durationMs, inMs, outMs, bars);
}
}  // namespace

class PeakLevelsTest : public QObject {
    Q_OBJECT
private slots:
    void aTakeUpToAMinuteKeepsTheOneLevel() {
        QCOMPARE(finePeakCount(0), FULL_ASSET_PEAK_COUNT);
        QCOMPARE(finePeakCount(LONG_TAKE_MS), FULL_ASSET_PEAK_COUNT);
        QVERIFY(reducePeakLevels(fineLevel(FULL_ASSET_PEAK_COUNT), LONG_TAKE_MS).empty());
        const auto take = takeOf(45000);
        QCOMPARE(take.levelCount(), size_t(1));
        QCOMPARE(choosePeakLevel(take, 0, 45000, 100), size_t(0));
    }
    void aLongTakeHasFinePeaksPerMinuteAndCoarserLevels() {
        QCOMPARE(finePeakCount(LONG_TAKE_MS + 1), 4000);
        QCOMPARE(finePeakCount(kFourMinutesMs), 8000);
        QCOMPARE(finePeakCount(3600000), MAX_FINE_PEAKS);
        const auto take = takeOf(kFourMinutesMs);
        QCOMPARE(take.peaks.size(), size_t(8000));
        QCOMPARE(take.levelCount(), size_t(2));
        QCOMPARE(take.level(1).size(), size_t(1000));
        QCOMPARE(takeOf(1800000).levelCount(), size_t(3));  // 24000, 3000, 375
    }
    void coarsePeaksAreTheMaximumOfTheFineOnes() {
        const auto take = takeOf(1800000);
        for (size_t l = 1; l < take.levelCount(); ++l) {
            const auto& below = take.level(l - 1);
            const auto& level = take.level(l);
            QCOMPARE(level.size() * PEAK_LEVEL_FACTOR, below.size());
            for (size_t j = 0; j < level.size(); ++j) {
                float expected = 0;
                for (size_t k = 0; k < size_t(PEAK_LEVEL_FACTOR); ++k) expected = std::max(expected, below[j * PEAK_LEVEL_FACTOR + k]);
                QCOMPARE(level[j], expected);
            }
        }
    }
    void theLevelFollowsTheZoom() {
        const auto take = takeOf(kFourMinutesMs);
        // 500 bars: the whole take has 1000 coarse peaks, 8 s has 33 coarse and 267 fine.
        QCOMPARE(choosePeakLevel(take, 0, kFourMinutesMs, 500), size_t(1));
        QCOMPARE(choosePeakLevel(take, 0, kFourMinutesMs / 2, 500), size_t(1));
        QCOMPARE(choosePeakLevel(take, 0, kFourMinutesMs / 2 - 1, 500), size_t(0));
        QCOMPARE(choosePeakLevel(take, 60000, 68000, 500), size_t(0));
        QCOMPARE(choosePeakLevel(take, 0, kFourMinutesMs, 2000), size_t(0));
    }
    void aFourMinuteTakeAtTheWidestZoomReadsOnlyTheCoarseLevel() {
        auto take = takeOf(kFourMinutesMs);
        size_t level = 99;
        // The result through the fine level is what the coarse level must give.
        const auto viaFine = samplePeaksWindow(take.peaks, take.durationMs, 0, take.durationMs, 500);
        std::fill(take.peaks.begin(), take.peaks.end(), 99.0f);  // anything that reads it shows
        const auto bars = drawBars(take, 0, take.durationMs, 500, &level);
        QCOMPARE(level, size_t(1));
        QCOMPARE(bars.size(), size_t(500));
        QVERIFY(std::none_of(bars.begin(), bars.end(), [](float v) { return v == 99.0f; }));
        QCOMPARE(bars, viaFine);
        // Zoomed in on eight seconds the fine level is read.
        const auto zoomed = drawBars(take, 60000, 68000, 500, &level);
        QCOMPARE(level, size_t(0));
        QVERIFY(std::all_of(zoomed.begin(), zoomed.end(), [](float v) { return v == 99.0f; }));
    }
};

QTEST_MAIN(PeakLevelsTest)
#include "tst_peaklevels.moc"
