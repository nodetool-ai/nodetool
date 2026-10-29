#include "aiassist/ScriptVoicingPlan.h"
#include <QJsonArray>
#include <QtTest>
class ScriptVoicingTest : public QObject {
    Q_OBJECT
private:
    static QJsonObject script() {
        const QJsonObject voice{{"provider", "openai"}, {"model", "tts-1"}, {"voice", "alloy"}};
        const QJsonObject speaker{{"id", "speaker"}, {"voice", voice}};
        const QJsonObject line{{"id", "line"}, {"speakerId", "speaker"}, {"text", " Hello "}, {"direction", " quietly "}, {"takes", QJsonArray{}}};
        const QJsonObject section{{"id", "section"}, {"lines", QJsonArray{line}}};
        const QJsonObject document{{"cast", QJsonArray{speaker}}, {"setup", QJsonObject{{"pace", "slow"}}}, {"sections", QJsonArray{section}}};
        return {{"id", "script"}, {"updatedAt", "revision"}, {"document", document}};
    }
private slots:
    void requestMatchesWeb() {
        const auto plan = nt::aiassist::planScriptVoice(script(), "line");
        QVERIFY(plan.error.isEmpty());
        QCOMPARE(plan.scriptId, QString("script"));
        QCOMPARE(plan.request, (QJsonObject{{"mode", "audio"}, {"provider", "openai"}, {"model", "tts-1"},
            {"voice", "alloy"}, {"speed", 0.85}, {"prompt", "Hello"}, {"instructions", "quietly"}}));
        QVERIFY(!nt::aiassist::planScriptVoice(script(), "missing").error.isEmpty());
    }
    void takeRetainsSnapshotsAndRejectsMalformedWords() {
        const auto plan = nt::aiassist::planScriptVoice(script(), "line");
        const auto take = nt::aiassist::scriptVoiceTake(plan, "asset", 2000,
            {{"words", QJsonArray{QJsonObject{{"word", "Hello"}, {"startMs", 0}, {"endMs", 1000}}, QJsonObject{{"word", "bad"}, {"startMs", "wrong"}, {"endMs", 100}}}}},
            "take", "2020-01-01T00:00:00Z", {{"cost_credits", 3}});
        QCOMPARE(take.value("textSnapshot").toString(), QString(" Hello "));
        QCOMPARE(take.value("voiceSnapshot"), QJsonValue(plan.voice));
        QCOMPARE(take.value("directionSnapshot").toString(), QString("quietly"));
        QCOMPARE(take.value("speedSnapshot").toDouble(), 0.85);
        QCOMPARE(take.value("words").toArray().size(), 1);
        QCOMPARE(take.value("costCredits").toInt(), 3);
        const auto updated = nt::aiassist::appendScriptTake(script(), "line", take);
        const auto line = updated.value("document").toObject().value("sections").toArray().at(0).toObject().value("lines").toArray().at(0).toObject();
        QCOMPARE(line.value("currentTakeId").toString(), QString("take"));
        QCOMPARE(line.value("takes").toArray().size(), 1);
        QCOMPARE(updated.value("updatedAt").toString(), QString("revision"));
        QCOMPARE(nt::aiassist::appendScriptTake(updated, "line", take), updated);
        QCOMPARE(nt::aiassist::appendScriptTake(script(), "missing", take), script());
    }
    void voiceOverrideAndNormalPace() {
        auto input = script();
        auto doc = input.value("document").toObject();
        doc.insert("setup", QJsonObject{{"pace", "normal"}});
        auto sections = doc.value("sections").toArray();
        auto section = sections.at(0).toObject();
        auto lines = section.value("lines").toArray();
        auto line = lines.at(0).toObject();
        line.insert("voiceOverride", QJsonObject{{"provider", "gemini"}, {"model", "voice-model"}, {"voice", "voice-name"}});
        lines[0] = line;
        section.insert("lines", lines); sections[0] = section; doc.insert("sections", sections); input.insert("document", doc);
        const auto plan = nt::aiassist::planScriptVoice(input, "line");
        QCOMPARE(plan.request.value("provider").toString(), QString("gemini"));
        QVERIFY(!plan.request.contains("speed"));
        const auto take = nt::aiassist::scriptVoiceTake(plan, "asset", 1000, {}, "take", "date", {});
        QVERIFY(!take.contains("speedSnapshot"));
    }
};
QTEST_GUILESS_MAIN(ScriptVoicingTest)
#include "tst_scriptvoicing.moc"
