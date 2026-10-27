#include "audio/automation/Automation.h"
#include "audio/Mixer.h"
#include "audio/automation/Meters.h"
#include "model/TimelineJson.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QtTest>
#include <array>
using namespace nt::automation;
namespace {
QJsonObject document() {
    return QJsonDocument::fromJson(R"({"fps":30,"durationMs":1000,"tracks":[{"id":"a","type":"audio","index":0,"custom":12}],"clips":[{"id":"c","trackId":"a","mediaType":"audio","status":"generated","mediaPath":"memory.wav","startMs":0,"durationMs":1000}]})").object();
}
QJsonObject lane(QString kind, QString param, QJsonArray points) {
    return {{"id","lane"},{"target",QJsonObject{{"kind",kind},{"param",param}}},{"points",points}};
}
}
class TestAutomation : public QObject {
    Q_OBJECT
private slots:
    void valuesAndBreakpoints() {
        const QJsonArray points{QJsonObject{{"timeMs",0},{"value",-20}},QJsonObject{{"timeMs",100},{"value",0},{"easing","hold"}}};
        QCOMPARE(automationValueAt(points, 50), -20.);
        QCOMPARE(automationBreakpoints(points, 0).size(), 3);
        QCOMPARE(automationValueAt({}, 10, 17), 17.);
    }
    void pointEdits() {
        const auto added = addAutomationPoint({}, {{"timeMs",-2},{"value",3},{"easing","linear"}});
        QCOMPARE(added.value("index").toInt(-1), 0);
        QCOMPARE(added.value("points").toArray()[0].toObject(), (QJsonObject{{"timeMs",0},{"value",3}}));
    }
    void mixerEdits() {
        auto doc = edit(document(), "setTrackVolume", {{"trackId","a"},{"db",99}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["volumeDb"].toDouble(), 24.);
        doc = edit(doc, "setTrackPan", {{"trackId","a"},{"pan",-8}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["pan"].toDouble(), -1.);
        doc = edit(doc, "setMasterVolume", {{"db",-200}});
        QCOMPARE(doc["master"].toObject()["volumeDb"].toDouble(), -120.);
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["custom"].toInt(), 12);
    }
    void insertEdits() {
        auto doc = edit(document(), "addTrackEffect", {{"trackId","a"},{"effect","filter"}});
        auto fx = doc["tracks"].toArray()[0].toObject()["effects"].toArray();
        QCOMPARE(fx.size(), 1);
        const auto id = fx[0].toObject()["id"].toString();
        QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
        QCOMPARE(fx[0].toObject()["frequency"].toDouble(), 1000.);
        doc = edit(doc, "updateTrackEffect", {{"trackId","a"},{"effectId",id},{"patch",QJsonObject{{"q",4}}}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["effects"].toArray()[0].toObject()["q"].toDouble(), 4.);
        doc = edit(doc, "removeTrackEffect", {{"trackId","a"},{"effectId",id}});
        QVERIFY(doc["tracks"].toArray()[0].toObject()["effects"].toArray().empty());
        doc = edit(doc, "addMasterEffect", {{"effect",QJsonObject{{"id","kept"},{"type","gain"},{"gainDb",3}}}});
        QCOMPARE(doc["master"].toObject()["effects"].toArray()[0].toObject()["id"].toString(), "kept");
        doc = edit(doc, "updateMasterEffect", {{"effectId","kept"},{"patch",QJsonObject{{"enabled",false}}}});
        QCOMPARE(doc["master"].toObject()["effects"].toArray()[0].toObject()["enabled"].toBool(true), false);
        doc = edit(doc, "removeMasterEffect", {{"effectId","kept"}});
        QVERIFY(doc["master"].toObject()["effects"].toArray().empty());
    }
    void automationEdits() {
        const QJsonArray lanes{lane("mixer","pan",{QJsonObject{{"timeMs",0},{"value",1}}})};
        auto doc = edit(document(), "setTrackAutomation", {{"trackId","a"},{"automation",lanes}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["automation"].toArray(), lanes);
        doc = edit(doc, "setTrackAutomation", {{"trackId","a"},{"automation",QJsonArray{}}});
        QVERIFY(!doc["tracks"].toArray()[0].toObject().contains("automation"));
        auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject(); track["locked"] = true; tracks[0] = track; doc["tracks"] = tracks;
        QCOMPARE(edit(doc, "setTrackAutomation", {{"trackId","a"},{"automation",lanes}}), doc);
    }
    void meterTap() {
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QVERIFY(!plan.tracks[0].processors.empty());
        QCOMPARE(plan.tracks[0].processors.back()->id, std::string("p2-meter:a"));
        std::array<float,4> signal{.5f,-.25f,-.8f,.1f};
        const auto before=signal;
        plan.tracks[0].processors.back()->process(signal,{48000,0,1000./48000});
        QCOMPARE(signal,before);
        QCOMPARE(nt::automation::takeMeter("a"),(std::array<float,2>{.8f,.25f}));
        QCOMPARE(nt::automation::takeMeter("a"),(std::array<float,2>{0,0}));
        QCOMPARE(plan.processors.back()->id,std::string("p2-meter:master"));
    }
    void mixFollowsAutomation() {
        auto doc = document(); auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject();
        track["automation"] = QJsonArray{lane("mixer","volumeDb",{QJsonObject{{"timeMs",0},{"value",-20}},QJsonObject{{"timeMs",100},{"value",0}}})};
        tracks[0] = track; doc["tracks"] = tracks;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline); QCOMPARE(plan.tracks.size(), std::size_t(1));
        QVERIFY(plan.tracks[0].gainSource);
        QVERIFY(std::abs(plan.tracks[0].gainSource->valueAt(5,1) - (0.1 + std::pow(10.,-18./20))/2) < 1e-12);
    }
};
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv); ensureRegistered();
    if (app.arguments().contains("--json")) {
        QFile in; if (!in.open(stdin,QIODevice::ReadOnly)) return 2;
        QJsonArray out;
        for (const auto& v : QJsonDocument::fromJson(in.readAll()).array()) {
            const auto a = v.toArray();
            if (a[0]=="panSamples") {
                const auto args=a[1].toArray();
                auto doc=document(); auto tracks=doc["tracks"].toArray(); auto track=tracks[0].toObject();
                track["automation"]=QJsonArray{lane("mixer","pan",args[0].toArray())}; tracks[0]=track; doc["tracks"]=tracks;
                const auto parsed=nt::parseTimelineJson(QJsonDocument(doc).toJson());
                if (!parsed.timeline) { return 2; }
                const auto plan=nt::audio::buildMixPlan(*parsed.timeline);
                QJsonArray values;
                for (int i=0;i<args[1].toInt();++i) { values.append(plan.tracks[0].panSource->valueAt(i*1000./args[2].toDouble(),0)); }
                out.append(values);
            } else { out.append(call(a[0].toString(),a[1].toArray())); }
        }
        QFile output; if (!output.open(stdout,QIODevice::WriteOnly)) return 2;
        output.write(QJsonDocument(out).toJson(QJsonDocument::Compact)); return 0;
    }
    TestAutomation test; return QTest::qExec(&test,argc,argv);
}
#include "tst_automation.moc"
