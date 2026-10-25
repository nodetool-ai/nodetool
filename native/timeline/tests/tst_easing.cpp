// Native `scene::ease` against the web's `ease` (fixtures/plan/ease-vectors.json,
// written by scripts/ease-vectors.mjs), inside and outside [0, 1].

#include "scene/Animation.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>

#include <cmath>

class TestEasing : public QObject {
    Q_OBJECT

private slots:
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
