// Native `scene::ease` against the web's `ease` (fixtures/plan/ease-vectors.json,
// written by scripts/ease-vectors.mjs), inside and outside [0, 1].

#include "scene/Animation.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>

#include <atomic>
#include <cmath>
#include <string>
#include <thread>
#include <vector>

class TestEasing : public QObject {
    Q_OBJECT

private slots:
    // Codex review F3 (M5b): the easing cache clears at 512 entries while
    // another thread evaluates an easing it looked up. Run under ASan.
    void cacheSurvivesClearsFromAnotherThread() {
        std::atomic<bool> stop{false};
        std::atomic<long> bad{0};
        std::vector<std::thread> readers;
        for (int r = 0; r < 4; ++r) {
            readers.emplace_back([&]() {
                while (!stop) {
                    const double v = nt::scene::ease("spring(190,18,1)", 0.5);
                    if (!(v > 0.5 && v < 1.5)) ++bad;
                }
            });
        }
        std::thread writer([&]() {
            for (int round = 0; round < 300; ++round) {
                for (int i = 0; i < 600; ++i) {
                    nt::scene::ease("cubic-bezier(0." + std::to_string(i % 97) + ",0,0.5," + std::to_string(round + i) + ")", 0.3);
                }
            }
            stop = true;
        });
        writer.join();
        for (auto& t : readers) t.join();
        QCOMPARE(bad.load(), 0L);
    }

    void matchesTheWeb() {
        QFile f(QStringLiteral(NT_FIXTURES_DIR "/plan/ease-vectors.json"));
        QVERIFY(f.open(QIODevice::ReadOnly));
        const QJsonObject all = QJsonDocument::fromJson(f.readAll()).object();
        QVERIFY(all.size() >= 30);
        int compared = 0;
        for (auto it = all.begin(); it != all.end(); ++it) {
            for (const QJsonValue& p : it.value().toArray()) {
                const double t = p.toArray().at(0).toDouble();
                const QJsonValue want = p.toArray().at(1);
                const double got = nt::scene::ease(it.key().toStdString(), t);
                // JSON has no NaN: the web's NaN arrives as null.
                if (want.isNull()) {
                    QVERIFY2(std::isnan(got), qPrintable(QStringLiteral("%1 at %2: web NaN, native %3").arg(it.key()).arg(t).arg(got)));
                } else {
                    QVERIFY2(std::abs(got - want.toDouble()) <= 1e-9,
                             qPrintable(QStringLiteral("%1 at %2: web %3 native %4").arg(it.key()).arg(t).arg(want.toDouble()).arg(got)));
                }
                ++compared;
            }
        }
        qInfo("ease: %d values compared", compared);
        QVERIFY(compared > 2000);
    }
};

QTEST_GUILESS_MAIN(TestEasing)
#include "tst_easing.moc"
