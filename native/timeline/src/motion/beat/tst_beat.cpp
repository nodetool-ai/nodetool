#include "model/TimelineJson.h"
#include "preview/SceneEval.h"
#include "scene/ClipScene.h"
#include "motion/beat/Beat.h"
#include <QTest>
#include <QFileInfo>
#include <QDir>
#include <QJsonArray>
#include <algorithm>

class TestBeat : public QObject {
    Q_OBJECT
private slots:
    void delayCases() {
        const QJsonArray input{QJsonObject{{"delayMs", 20}, {"beat", QJsonObject{{"scope", "clip"}, {"index", 3}, {"offsetMs", -10}}}},
                               QJsonObject{{"beat", QJsonObject{{"scope", "sequence"}, {"index", 2}}}},
                               QJsonObject{{"delayMs", 42}, {"extra", "preserved"}}};
        const auto output = nt::motion::resolveBeatAnimations(input, 250, {});
        QCOMPARE(output[0].toObject().value("delayMs").toDouble(), 1010.0);
        QCOMPARE(output[1].toObject().value("delayMs").toDouble(), 250.0);
        QCOMPARE(output[2], input[2]);
        QCOMPARE(input[0].toObject().value("delayMs").toDouble(), 20.0);
        const auto slow = nt::motion::resolveBeatAnimations(input, 250, QJsonObject{{"bpm", 0}});
        QCOMPARE(slow[1].toObject().value("delayMs").toDouble(), 59750.0);
    }
    void cacheIdentity() {
        const QJsonArray input{QJsonObject{{"beat", QJsonObject{{"scope", "sequence"}, {"index", 2}}}}};
        const auto source = std::make_shared<const std::vector<nt::scene::AnimationDef>>(nt::scene::parseAnimations(input));
        const auto first = nt::motion::resolvedBeatDefinitions(source, input, 100, {});
        QCOMPARE(nt::motion::resolvedBeatDefinitions(source, input, 100, {}), first);
        QVERIFY(nt::motion::resolvedBeatDefinitions(source, input, 200, {}) != first);
        QVERIFY(nt::motion::resolvedBeatDefinitions(source, input, 100, QJsonObject{{"bpm", 60}}) != first);
        QVERIFY(nt::motion::resolvedBeatDefinitions(source, input, 100, QJsonObject{{"offsetMs", 1}}) != first);
        QCOMPARE(nt::motion::resolvedBeatDefinitions(source, input, 100, {}), first);
    }
    void linkedSource() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& timeline = *result.timeline;
        auto& source = timeline.clips[0];
        auto& follower = timeline.clips[1];
        source.startMs = 1000; source.durationMs = 4000; source.opacity = 1;
        source.raw.insert("animations", QJsonArray{QJsonObject{{"id", "beat"}, {"enabled", true}, {"role", "in"},
            {"preset", "fade"}, {"durationMs", 1000}, {"delayMs", 100},
            {"beat", QJsonObject{{"scope", "sequence"}, {"index", 4}, {"offsetMs", 50}}}}});
        source.scene = nt::scene::parseClipScene(source.raw);
        follower.startMs = 1000; follower.durationMs = 4000;
        follower.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target", "opacity"},
            {"sourceClipId", QString::fromStdString(source.id)}, {"source", "opacity"}}});
        follower.scene = nt::scene::parseClipScene(follower.raw);
        timeline.raw.insert("tempo", QJsonObject{{"bpm", 60}, {"offsetMs", 200}});
        for (int i = 0; i < 3; ++i) {
            const auto layers = nt::activeLayersAt(timeline, 3500);
            const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
            QVERIFY(found != layers.end());
            QVERIFY(std::abs(found->opacity - 0.385875) < 1e-9);
        }
    }
    void expandedCopiesAndGroup() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& timeline = *result.timeline;
        auto& clip = timeline.clips.front();
        clip.startMs = 0; clip.durationMs = 4000;
        clip.raw.insert("repeater", QJsonObject{{"count", 2}, {"timeStepMs", 100}});
        clip.raw.insert("temporalEcho", QJsonObject{{"copies", 1}, {"intervalMs", 50}, {"opacityDecay", 1}});
        const auto animation = [](const char* scope) {
            return QJsonObject{{"id", "beat"}, {"enabled", true}, {"role", "in"}, {"preset", "slide"},
                {"durationMs", 1000}, {"easing", "linear"}, {"beat", QJsonObject{{"scope", scope}, {"index", 2}}}};
        };
        for (const char* scope : {"sequence", "clip"}) {
            clip.raw.insert("animations", QJsonArray{animation(scope)});
            clip.scene = nt::scene::parseClipScene(clip.raw);
            const auto layers = nt::activeLayersAt(timeline, 750);
            const auto x = [&](const std::string& suffix) {
                const auto it = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == clip.id + suffix; });
                return it == layers.end() || !it->transform ? 99999.0 : it->transform->position.x;
            };
            const double original = x("");
            const double repeated = x(":repeat:1");
            const double echo = x(":echo:1");
            QVERIFY(original != 99999.0 && repeated != 99999.0 && echo != 99999.0);
            if (std::string(scope) == "sequence") {
                QVERIFY(std::abs(original - repeated) < 1e-9);
                QVERIFY(std::abs(original - echo) < 1e-9);
            } else {
                QVERIFY(std::abs(original - repeated) > 1);
                QVERIFY(std::abs(original - echo) > 1);
            }
            qInfo().noquote() << "BEAT_COPIES" << scope << original << repeated << echo;
        }
        auto group = clip;
        group.id = "beat-group"; group.mediaType = nt::MediaType::Group;
        group.raw.remove("repeater"); group.raw.remove("temporalEcho");
        group.raw.insert("mediaType", "group"); group.raw.insert("animations", QJsonArray{animation("sequence")});
        group.scene = nt::scene::parseClipScene(group.raw);
        timeline.clips.push_back(group);
        auto& child = timeline.clips[1];
        child.startMs = 0; child.durationMs = 4000;
        child.raw.insert("parentId", "beat-group");
        child.scene = nt::scene::parseClipScene(child.raw);
        const auto layers = nt::activeLayersAt(timeline, 750);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == child.id; });
        QVERIFY(found != layers.end());
        QVERIFY(found->parentMatrix.has_value());
        qInfo().noquote() << "BEAT_GROUP" << (*found->parentMatrix)[12];
        QVERIFY(std::abs((*found->parentMatrix)[12] + 0.45) < 1e-6);
    }
    void samples() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& timeline = *result.timeline;
        auto& clip = timeline.clips.front();
        clip.startMs = 1000; clip.durationMs = 4000;
        clip.raw.insert("animations", QJsonArray{QJsonObject{{"id", "beat"}, {"enabled", true}, {"role", "in"},
            {"preset", "fade"}, {"durationMs", 1000}, {"delayMs", 100},
            {"beat", QJsonObject{{"scope", "sequence"}, {"index", 4}, {"offsetMs", 50}}}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        timeline.raw.insert("tempo", QJsonObject{{"bpm", 60}, {"offsetMs", 200}});
        const auto original = clip.raw;
        const auto layers = nt::activeLayersAt(timeline, 3500);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
        QVERIFY(found != layers.end());
        qInfo().noquote() << "BEAT_SAMPLE" << found->opacity;
        QVERIFY(std::abs(found->opacity - 0.385875) < 1e-9);
        const auto defs = clip.scene->animations;
        const auto animations = clip.raw.value("animations").toArray();
        const auto tempo = timeline.raw.value("tempo").toObject();
        const auto originalDefs = nt::motion::resolvedBeatDefinitions(defs, animations, 1000, tempo);
        const auto repeatedDefs = nt::motion::resolvedBeatDefinitions(defs, animations, 1500, tempo);
        const auto originalCompiled = nt::scene::compileAnimations(*originalDefs, 4000, {});
        const auto repeatedCompiled = nt::scene::compileAnimations(*repeatedDefs, 4000, {});
        const auto originalSample = nt::scene::sampleAnimations(originalCompiled, 2500, {});
        const auto repeatedSample = nt::scene::sampleAnimations(repeatedCompiled, 2000, {});
        QVERIFY(std::abs(originalSample.opacity - repeatedSample.opacity) < 1e-9);
        QCOMPARE(clip.raw, original);
    }
};
QTEST_GUILESS_MAIN(TestBeat)
#include "tst_beat.moc"
