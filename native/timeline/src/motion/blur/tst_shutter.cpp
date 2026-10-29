#include "motion/blur/Shutter.h"
#include "playback/PlaybackClock.h"
#include "model/TimelineJson.h"
#include "preview/SceneEval.h"
#include "scene/ClipScene.h"
#include "preview/layers/SceneHooks.h"
#include "preview/effects/ClipEffects.h"
#include <QFileInfo>
#include <QDir>
#include <QJsonDocument>
#include <QJsonArray>
#include <QScopeGuard>
#include <algorithm>
#include <QTest>

class TestShutter : public QObject {
    Q_OBJECT
private slots:
    void seekSerial() {
        PlaybackClock clock;
        std::int64_t now = 0;
        clock.setNowSource([&] { return now; });
        clock.setDurationMs(5000);
        const auto initial = clock.seekSerial();
        clock.play(); now += 100000000; clock.tick();
        QCOMPARE(clock.seekSerial(), initial);
        clock.seek(1000);
        QCOMPARE(clock.seekSerial(), initial + 1);
        now += 100000000; clock.tick();
        QCOMPARE(clock.seekSerial(), initial + 1);
        clock.pause(); clock.seek(2000);
        QCOMPARE(clock.seekSerial(), initial + 2);
    }
    void sceneTapClocks() {
        auto loaded = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../fixtures/three-tracks.json"));
        QVERIFY(loaded.timeline.has_value());
        auto timeline = *loaded.timeline;
        timeline.clips.resize(1);
        auto& clip = timeline.clips.front();
        clip.startMs = 1000; clip.durationMs = 5000; clip.inPointMs = 0;
        clip.raw.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
        clip.raw.insert("animations", QJsonArray{QJsonObject{{"id", "fade"}, {"enabled", true}, {"role", "in"},
            {"preset", "fade"}, {"durationMs", 1000}, {"easing", "linear"}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        const QJsonObject before = clip.raw;
        for (double fps : {0.5, 30.0}) {
            timeline.fps = fps;
            const double frameMs = 1000 / fps;
            const double sceneTime = 1000 + 0.5 / 4 * 0.5 * frameMs;
            const auto tapped = nt::evaluateSceneTap(timeline, sceneTime, 1000, 0, 4);
            const auto same = nt::evaluateScene(timeline, sceneTime);
            QCOMPARE(tapped.layers.size(), size_t(1));
            QCOMPARE(same.layers.size(), size_t(1));
            QVERIFY(std::abs(tapped.layers[0].sourceTimeMs - (sceneTime - 1000)) < 1e-8);
            QVERIFY(std::abs(tapped.layers[0].opacity - same.layers[0].opacity) < 1e-8);
            const auto single = nt::evaluateSceneTap(timeline, 1000, 1000, 0, 1);
            const auto original = nt::evaluateScene(timeline, 1000);
            QCOMPARE(single.layers.size(), original.layers.size());
            QCOMPARE(single.layers[0].sourceTimeMs, original.layers[0].sourceTimeMs);
            QCOMPARE(single.layers[0].opacity, original.layers[0].opacity);
            qInfo().noquote() << "SCENE_TIME" << QString::number(fps, 'g', 17)
                              << QString::number(tapped.layers[0].sourceTimeMs, 'g', 17);
        }
        QCOMPARE(clip.raw, before);
        clip.raw.remove("motionBlur"); clip.scene = nt::scene::parseClipScene(clip.raw);
        timeline.fps = 30;
        const auto pinned = nt::evaluateSceneTap(timeline, 1010, 1000, 0, 4);
        const auto base = nt::evaluateScene(timeline, 1000);
        QCOMPARE(pinned.layers.size(), size_t(1));
        QCOMPARE(pinned.layers[0].sourceTimeMs, base.layers[0].sourceTimeMs);
        QCOMPARE(pinned.layers[0].opacity, base.layers[0].opacity);
        clip.raw.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}});
        clip.raw.insert("steppedTime", QJsonObject{{"fps", 6}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        const auto stepped = nt::evaluateSceneTap(timeline, 1052, 1050, 0, 4);
        QCOMPARE(stepped.layers.size(), size_t(1));
        QCOMPARE(stepped.layers[0].sourceTimeMs, 0.0);
        qInfo() << "STEPPED_SOURCE" << stepped.layers[0].sourceTimeMs;
        clip.raw.remove("motionBlur"); clip.raw.remove("steppedTime");
        clip.raw.remove("animations"); clip.scene = nt::scene::parseClipScene(clip.raw);
        clip.fadeInMs = 1000;
        const auto faded = nt::evaluateSceneTap(timeline, 1100, 1000, 0, 4);
        const auto sceneFade = nt::evaluateScene(timeline, 1100);
        QCOMPARE(faded.layers.size(), size_t(1));
        QVERIFY(std::abs(faded.layers[0].opacity - sceneFade.layers[0].opacity) < 1e-8);
        QVERIFY(faded.layers[0].opacity > 0);
        nt::Clip group = clip;
        group.id = "group"; group.mediaType = nt::MediaType::Group;
        group.fadeInMs = 0;
        group.raw = QJsonObject{{"mediaType", "group"}, {"animations", QJsonArray{QJsonObject{
            {"id", "fade"}, {"enabled", true}, {"role", "in"}, {"preset", "fade"},
            {"durationMs", 1000}, {"easing", "linear"}}}}};
        group.scene = nt::scene::parseClipScene(group.raw);
        clip.raw.insert("parentId", "group"); clip.scene = nt::scene::parseClipScene(clip.raw);
        timeline.clips.push_back(group);
        const auto grouped = nt::evaluateSceneTap(timeline, 1100, 1000, 0, 4);
        const auto groupReference = nt::evaluateScene(timeline, 1100);
        QCOMPARE(grouped.layers.size(), size_t(1));
        QCOMPARE(groupReference.layers.size(), size_t(1));
        QVERIFY(std::abs(grouped.layers[0].opacity - groupReference.layers[0].opacity) < 1e-8);
        timeline.clips[0].startMs = 1005;
        QVERIFY(nt::evaluateSceneTap(timeline, 1010, 1000, 0, 4).layers.empty());
    }
    void frameCases() {
        nt::Timeline timeline;
        nt::Track visible; visible.id = "v"; visible.visible = true;
        nt::Track hidden; hidden.id = "h"; hidden.visible = false;
        timeline.tracks = {visible, hidden};
        nt::Clip group; group.id = "g"; group.trackId = "v"; group.mediaType = nt::MediaType::Group;
        group.startMs = 0; group.durationMs = 2000;
        nt::Clip clip; clip.id = "c"; clip.trackId = "v"; clip.startMs = 1000; clip.durationMs = 1000;
        clip.raw = QJsonObject{{"parentId", "g"}, {"motionBlur", QJsonObject{{"samplesPerFrame", 8}, {"shutterAngle", 90}}}};
        timeline.clips = {group, clip};
        const std::vector<const nt::Clip*> expanded{&timeline.clips[0], &timeline.clips[1]};
        auto shutter = nt::motion::frameShutter(timeline, expanded, 1000, 40);
        QCOMPARE(shutter.samples, 8); QCOMPARE(shutter.angle, 90.0);
        QCOMPARE(nt::motion::layerShutterTime(clip.raw, 1000, 0, 8, 40), 1000.625);
        QCOMPARE(nt::motion::layerShutterTime({}, 1000, 0, 8, 40), 1000.0);
        const auto layerTime = nt::motion::layerShutterTime(clip.raw, 1000, 0, 8, 40);
        qInfo().noquote() << "LAYER_TIME" << QString::number(layerTime, 'g', 17);

        timeline.clips[0].durationMs = 500;
        QCOMPARE(nt::motion::frameShutter(timeline, expanded, 1000, 40).samples, 1);
        timeline.clips[0].durationMs = 2000;
        timeline.clips[1].trackId = "h";
        QCOMPARE(nt::motion::frameShutter(timeline, expanded, 1000, 40).samples, 1);
        timeline.clips[0].raw.insert("motionBlur", QJsonObject{{"samplesPerFrame", 6}, {"shutterAngle", 270}});
        const auto groupShutter = nt::motion::frameShutter(timeline, expanded, 1000, 40);
        QCOMPARE(groupShutter.samples, 6);
        QCOMPARE(groupShutter.angle, 270.0);
    }
    void grainClockBoundary() {
        const QJsonArray effects{QJsonObject{{"type", "grain"}, {"enabled", true}, {"animate", true}}};
        QJsonObject clip{{"id", "leaf"}, {"trackId", "v"}, {"mediaType", "video"},
            {"startMs", 0}, {"durationMs", 2000}, {"effects", effects}};
        QJsonObject raw{{"id", "grain-clock"}, {"fps", 30}, {"width", 100}, {"height", 100},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
            {"clips", QJsonArray{clip}}};
        const auto hook = nt::registerContextLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip& input,
                                                               const nt::SceneDecorationContext& context) {
            nt::effects::decorateEffects(layer.ext, input, context);
        });
        const auto cleanup = qScopeGuard([&] { nt::unregisterSceneHook(hook); });
        const auto seed = [&](QJsonObject input) {
            raw.insert("clips", QJsonArray{input});
            const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
            if (!parsed.timeline) return -1.0;
            const auto frame = nt::evaluateSceneTap(*parsed.timeline, 1021.25, 990, 3, 4);
            if (frame.layers.size() != 1) return -1.0;
            return frame.layers[0].ext.value("clipEffects").toArray()[0].toObject().value("seed").toDouble(-1);
        };
        QCOMPARE(seed(clip), 29.0);
        clip.insert("steppedTime", QJsonObject{{"fps", 4}});
        QCOMPARE(seed(clip), 29.0);
        clip.remove("steppedTime");
        clip.insert("motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 360}});
        QCOMPARE(seed(clip), 30.0);
        clip.remove("motionBlur"); clip.insert("parentId", "group");
        const QJsonObject group{{"id", "group"}, {"trackId", "v"}, {"mediaType", "group"},
            {"startMs", 0}, {"durationMs", 2000}, {"effects", effects}};
        const QJsonObject adjustment{{"id", "adjustment"}, {"trackId", "v"}, {"mediaType", "adjustment"},
            {"startMs", 0}, {"durationMs", 2000}, {"effects", effects}};
        const auto groupHook = nt::registerContextGroupDecorator([](nt::PrecompositeLayer& layer, const nt::Clip& input,
                                                                    const nt::SceneDecorationContext& context) {
            nt::effects::decorateEffects(layer.ext, input, context);
        });
        const auto adjustmentHook = nt::registerContextAdjustmentDecorator([](nt::SceneAdjustment& layer, const nt::Clip& input,
                                                                               const nt::SceneDecorationContext& context) {
            nt::effects::decorateEffects(layer.ext, input, context); return true;
        });
        const auto cleanupGroups = qScopeGuard([&] {
            nt::unregisterSceneHook(adjustmentHook);
            nt::unregisterSceneHook(groupHook);
        });
        raw.insert("clips", QJsonArray{group, clip, adjustment});
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        const auto frame = nt::evaluateSceneTap(*parsed.timeline, 1021.25, 990, 3, 4);
        QCOMPARE(frame.precomposites.size(), size_t(1));
        QCOMPARE(frame.adjustments.size(), size_t(1));
        QCOMPARE(frame.precomposites[0].ext.value("clipEffects").toArray()[0].toObject().value("seed").toDouble(), 30.0);
        QCOMPARE(frame.adjustments[0].ext.value("clipEffects").toArray()[0].toObject().value("seed").toDouble(), 30.0);
    }
    void captionClockBoundary() {
        QJsonObject image{{"id", "image"}, {"trackId", "v"}, {"mediaType", "video"},
            {"startMs", 0}, {"durationMs", 2000}, {"inPointMs", 0}};
        QJsonObject caption{{"id", "caption"}, {"trackId", "a"}, {"mediaType", "audio"},
            {"startMs", 0}, {"durationMs", 2000}, {"caption", QJsonObject{{"words", QJsonArray{
                QJsonObject{{"word", "word"}, {"startMs", 1000}, {"endMs", 1500}}}}}}};
        QJsonObject raw{{"id", "caption-clock"}, {"fps", 30}, {"width", 100}, {"height", 100},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}},
                                  QJsonObject{{"id", "a"}, {"type", "audio"}, {"visible", true}}}},
            {"clips", QJsonArray{image, caption}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline.has_value());
        const auto hook = nt::registerLayerDecorator([](nt::ActiveLayer& layer, const nt::Clip&, double time) {
            layer.ext.insert("hookClock", time);
        });
        const auto cleanup = qScopeGuard([&] { nt::unregisterSceneHook(hook); });
        const auto frame = nt::evaluateSceneTap(*parsed.timeline, 1010, 990, 0, 4);
        const auto find = [&](const char* id) {
            return std::find_if(frame.layers.begin(), frame.layers.end(), [&](const auto& layer) { return layer.clipId == id; });
        };
        const auto picture = find("image"), words = find("caption");
        QVERIFY(picture != frame.layers.end()); QVERIFY(words != frame.layers.end());
        QCOMPARE(picture->ext.value("hookClock").toDouble(), 990.0);
        QCOMPARE(picture->sourceTimeMs, 990.0);
        QCOMPARE(words->ext.value("hookClock").toDouble(), 1010.0);
    }
    void repeatedWindow() {
        nt::Timeline timeline;
        nt::Track track; track.id = "v"; timeline.tracks.push_back(track);
        nt::Clip original; original.id = "c"; original.trackId = "v";
        original.startMs = 0; original.durationMs = 100;
        original.raw = QJsonObject{{"motionBlur", QJsonObject{{"samplesPerFrame", 4}, {"shutterAngle", 180}}}};
        nt::Clip repeated = original; repeated.id = "c:repeat:1"; repeated.startMs = 1000;
        timeline.clips.push_back(original);
        const std::vector<const nt::Clip*> expanded{&timeline.clips[0], &repeated};
        const auto shutter = nt::motion::frameShutter(timeline, expanded, 1000, 40);
        QCOMPARE(shutter.samples, 4); QCOMPARE(shutter.angle, 180.0);
        qInfo() << "REPEAT_SHUTTER" << shutter.samples << shutter.angle;
    }
    void samples() {
        const QJsonArray inputs{QJsonObject{}, QJsonObject{{"samplesPerFrame", 8}},
            QJsonObject{{"samplesPerFrame", 2.9}, {"shutterAngle", 360}},
            QJsonObject{{"samplesPerFrame", 50}, {"shutterAngle", -1}},
            QJsonObject{{"samplesPerFrame", 0}, {"shutterAngle", 900}}};
        for (const auto& input : inputs) {
            const auto options = nt::motion::resolveShutter(input.toObject());
            QJsonArray times;
            for (const auto t : nt::motion::shutterTimes(1234, 1000.0 / 30, options)) times.append(t);
            const QJsonObject result{{"options", input}, {"samples", options.samples}, {"angle", options.angle}, {"times", times}};
            qInfo().noquote() << "SHUTTER" << QJsonDocument(result).toJson(QJsonDocument::Compact);
        }
    }
};
QTEST_GUILESS_MAIN(TestShutter)
#include "tst_shutter.moc"
