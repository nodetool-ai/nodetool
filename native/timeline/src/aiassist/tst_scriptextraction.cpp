#include "aiassist/ScriptExtraction.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QtTest>
class ScriptExtractionTest : public QObject {
    Q_OBJECT
private slots:
    void webFixture() {
        QFile file(QFileInfo(QString::fromUtf8(__FILE__)).absolutePath() + "/fixtures/extraction-web.json");
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto fixture = QJsonDocument::fromJson(file.readAll()).object();
        QVERIFY(!fixture.isEmpty());
        int count = 0;
        nt::aiassist::ScriptExtractionContext context{[&count](const QString& prefix) { return prefix + "_fixed_" + QString::number(count++, 36); }, "2023-11-14T22:13:20.000Z"};
        QCOMPARE(nt::aiassist::extractScriptFromTimeline(fixture.value("clips").toArray(), context), fixture.value("expected").toObject());
    }
    void emptyTimeline() {
        const auto document = nt::aiassist::extractScriptFromTimeline({});
        QVERIFY(document.value("cast").toArray().isEmpty());
        QCOMPARE(document.value("sections").toArray().size(), 1);
        QVERIFY(document.value("sections").toArray().at(0).toObject().value("lines").toArray().isEmpty());
    }
    void nonContiguousParagraphsStaySeparate() {
        QJsonArray clips;
        for (const auto& id : {"first", "middle", "last"}) {
            clips.append(QJsonObject{{"id", id}, {"paragraphId", QString(id) == "middle" ? "other" : "same"},
                {"startMs", clips.size() * 1000}, {"sourceType", "imported"}, {"caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", id}, {"startMs", 0}, {"endMs", 1000}}}}}}});
        }
        const auto document = nt::aiassist::extractScriptFromTimeline(clips);
        const auto lines = document.value("sections").toArray().at(0).toObject().value("lines").toArray();
        QCOMPARE(lines.size(), 3);
        QCOMPARE(lines.at(0).toObject().value("text").toString(), QString("first"));
        QCOMPARE(lines.at(2).toObject().value("text").toString(), QString("last"));
    }
};
QTEST_GUILESS_MAIN(ScriptExtractionTest)
#include "tst_scriptextraction.moc"
