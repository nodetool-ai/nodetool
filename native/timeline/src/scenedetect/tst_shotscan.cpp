#include "scenedetect/SceneDetect.h"
#include "scenedetect/ShotScan.h"

#include <QDebug>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QTemporaryDir>
#include <QTest>

#include <algorithm>
#include <cmath>

using namespace nt::shots;

namespace {
std::string media(const char* name) { return std::string(NT_FIXTURES_DIR) + "/media/" + name; }
std::vector<double> times(int count, double step = 1000.0 / 30.0) {
    std::vector<double> result;
    for (int i = 0; i < count; ++i) {
        result.push_back(i * step);
    }
    return result;
}
qint64 highWaterKb() {
    QFile file(QStringLiteral("/proc/self/status"));
    if (!file.open(QIODevice::ReadOnly)) { return -1; }
    const auto lines = file.readAll().split('\n');
    for (const auto& line : lines) {
        if (line.startsWith("VmHWM:")) { return line.simplified().split(' ')[1].toLongLong(); }
    }
    return -1;
}
}

class TestShotScan : public QObject {
    Q_OBJECT
private slots:
    void cutsMatchLayout() {
        QFile file(QStringLiteral(NT_FIXTURES_DIR "/video-cuts.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QJsonParseError error;
        const auto doc = QJsonDocument::fromJson(file.readAll(), &error);
        QCOMPARE(error.error, QJsonParseError::NoError);
        const auto layout = doc.object();
        const double period = 1000.0 / layout.value("fps").toDouble();
        std::vector<int> expected;
        for (const auto& value : layout.value("clips").toArray()) {
            const double start = value.toObject().value("startMs").toDouble();
            if (start > 0.0) { expected.push_back(static_cast<int>(std::lround(start / period))); }
        }
        QCOMPARE(expected, (std::vector<int>{60, 120, 180}));
        const auto result = scanShots({media("scene-cuts-360p30.mp4"), times(240)});
        QVERIFY2(result.error.empty(), result.error.c_str());
        QCOMPARE(result.diffs.size(), std::size_t{240});
        const auto cuts = detectCuts(result.diffs, {});
        QCOMPARE(cuts, expected);
        auto offByOne = expected;
        ++offByOne.front();
        QVERIFY(cuts != offByOne);
    }
    void continuousShots_data() {
        QTest::addColumn<QString>("name");
        QTest::newRow("motion") << QStringLiteral("scene-motion-360p30.mp4");
        QTest::newRow("lighting") << QStringLiteral("scene-lighting-360p30.mp4");
    }
    void continuousShots() {
        QFETCH(QString, name);
        const auto result = scanShots({media(qPrintable(name)), times(300)});
        QVERIFY2(result.error.empty(), result.error.c_str());
        QCOMPARE(result.diffs.size(), std::size_t{300});
        qInfo() << name << "maximum difference" << *std::max_element(result.diffs.begin(), result.diffs.end());
        QVERIFY(detectCuts(result.diffs, {}).empty());
        if (name.contains("motion")) {
            qDebug() << "Motion cuts at sensitivity 100:" << detectCuts(result.diffs, {.sensitivity = 100.0F});
            // The bars shot carries only the numbered overlay and encoder variation.
            auto staticTimes = times(59);
            for (auto& t : staticTimes) { t += 2000.0; }
            const auto bars = scanShots({media("scene-cuts-360p30.mp4"), staticTimes});
            QVERIFY2(bars.error.empty(), bars.error.c_str());
            const auto maximum = *std::max_element(bars.diffs.begin(), bars.diffs.end());
            qInfo() << "Static numbered bars maximum difference" << maximum;
            QVERIFY(*std::max_element(result.diffs.begin(), result.diffs.end()) > 2.0F * maximum);
        }
    }
    void speedAndReverse() {
        const auto fast = scanShots({media("scene-cuts-360p30.mp4"), times(120, 2000.0 / 30.0)});
        QVERIFY2(fast.error.empty(), fast.error.c_str());
        QCOMPARE(detectCuts(fast.diffs, {}), (std::vector<int>{30, 60, 90}));
        const auto slow = scanShots({media("scene-cuts-360p30.mp4"), times(480, 500.0 / 30.0)});
        QVERIFY2(slow.error.empty(), slow.error.c_str());
        const auto slowCuts = detectCuts(slow.diffs, {});
        QCOMPARE(slowCuts.size(), std::size_t{3});
        for (std::size_t i = 0; i < slowCuts.size(); ++i) {
            QVERIFY(std::abs(slowCuts[i] - static_cast<int>(120 * (i + 1))) <= 1);
        }
        auto reversed = times(240);
        std::reverse(reversed.begin(), reversed.end());
        const auto reverse = scanShots({media("scene-cuts-360p30.mp4"), reversed});
        QVERIFY2(reverse.error.empty(), reverse.error.c_str());
        const auto reverseCuts = detectCuts(reverse.diffs, {});
        const auto forward = scanShots({media("scene-cuts-360p30.mp4"), times(240)});
        QVERIFY2(forward.error.empty(), forward.error.c_str());
        auto mirrored = detectCuts(forward.diffs, {});
        for (auto& cut : mirrored) { cut = 240 - cut; }
        std::reverse(mirrored.begin(), mirrored.end());
        QCOMPARE(reverseCuts.size(), mirrored.size());
        QCOMPARE(mirrored.size(), std::size_t{3});
        for (std::size_t i = 0; i < mirrored.size(); ++i) { QVERIFY(std::abs(reverseCuts[i] - mirrored[i]) <= 1); }
    }
    void cancel() {
        std::size_t last = 0;
        bool ordered = true;
        const auto result = scanShots({media("scene-cuts-360p30.mp4"), times(240)}, [&](std::size_t done) {
            ordered = ordered && done == last + 1;
            last = done;
            return done < 10;
        });
        QVERIFY(result.cancelled);
        QVERIFY(result.error.empty());
        QVERIFY(ordered);
        QCOMPARE(last, std::size_t{10});
        QCOMPARE(result.diffs.size(), std::size_t{10});
    }
    void errors() {
        const auto missing = scanShots({media("missing-scene-file.mp4"), times(1)});
        QVERIFY(!missing.error.empty());
        QVERIFY(missing.diffs.empty());
        const auto audio = scanShots({media("tone-440-48k-mono.wav"), times(1)});
        QVERIFY(QString::fromStdString(audio.error).contains("no video stream"));
        const auto empty = scanShots({media("missing-scene-file.mp4"), {}});
        QVERIFY(empty.error.empty());
        QVERIFY(empty.diffs.empty());
    }
    void seekingAndRepeatedPicks() {
        const auto result = scanShots({media("scene-cuts-360p30.mp4"),
                                      {0, 3000, 3033.333333, 3066.666667, 166.666667, 6666.666667}});
        QVERIFY2(result.error.empty(), result.error.c_str());
        QCOMPARE(result.diffs.size(), std::size_t{6});
        QCOMPARE(result.diffs[0], 0.0F);
        QVERIFY(result.diffs[1] > SceneOptions{}.threshold());
        QVERIFY(result.diffs[2] < SceneOptions{}.threshold());
        QVERIFY(result.diffs[3] < SceneOptions{}.threshold());
        QVERIFY(result.diffs[4] > SceneOptions{}.threshold());
        // Frames 5 and 200 are both shot A, so a large difference is not required.
        const auto repeat = scanShots({media("scene-cuts-360p30.mp4"), {-100, 0, 1, 2, 3000, 3000, 3001, 9000, 10000}});
        QVERIFY2(repeat.error.empty(), repeat.error.c_str());
        QCOMPARE(repeat.diffs.size(), std::size_t{9});
        for (const int i : {0, 1, 2, 3, 5, 6, 8}) { QCOMPARE(repeat.diffs[i], 0.0F); }
        QVERIFY(repeat.diffs[4] > SceneOptions{}.threshold());
    }
    void longClipMemory() {
        if (qEnvironmentVariableIntValue("NT_SCENE_LONG") != 1) {
            QSKIP("Run NT_SCENE_LONG=1 nttest F19 '^tst_shotscan$' for the 10 minute memory scan.");
        }
#ifndef Q_OS_LINUX
        QSKIP("VmHWM is measured through /proc/self/status on Linux.");
#else
        const QString root = qEnvironmentVariable("TMPDIR");
        QVERIFY(!root.isEmpty());
        QTemporaryDir dir(root + QStringLiteral("/scene-long-XXXXXX"));
        QVERIFY(dir.isValid());
        const QString path = dir.filePath(QStringLiteral("long.mp4"));
        QProcess encoder;
        encoder.setProcessChannelMode(QProcess::ForwardedErrorChannel);
        encoder.start(QStringLiteral("ffmpeg"), {"-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
            "testsrc2=size=1920x1080:rate=30:duration=600", "-c:v", "libx264", "-threads", "4",
            "-preset", "ultrafast", "-crf", "30", "-g", "60", path});
        QVERIFY(encoder.waitForStarted());
        QVERIFY(encoder.waitForFinished(240000));
        QCOMPARE(encoder.exitStatus(), QProcess::NormalExit);
        QCOMPARE(encoder.exitCode(), 0);
        const auto sourceTimes = times(18000);
        const auto before = highWaterKb();
        QVERIFY(before > 0);
        QElapsedTimer timer;
        timer.start();
        const auto result = scanShots({path.toStdString(), sourceTimes});
        const auto elapsed = timer.elapsed();
        const auto after = highWaterKb();
        qInfo() << "Long scan ms" << elapsed << "frames/s" << 18000.0 * 1000.0 / elapsed
                << "VmHWM KiB before" << before << "after" << after << "growth" << after - before;
        QVERIFY(QFile::remove(path));
        QVERIFY2(result.error.empty(), result.error.c_str());
        QCOMPARE(result.diffs.size(), std::size_t{18000});
        QVERIFY(after >= before);
        QVERIFY(after - before < 300 * 1024);
#endif
    }
};
QTEST_GUILESS_MAIN(TestShotScan)
#include "tst_shotscan.moc"
