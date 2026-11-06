#include "scene/Animation.h"
#include "scene/ClipScene.h"
#include "model/TimelineJson.h"
#include "preview/SceneEval.h"
#include "preview/layers/SceneHooks.h"

#include <QTest>
#include <QJsonArray>
#include <QFileInfo>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <algorithm>
#include <cmath>

class TestMotion : public QObject {
    Q_OBJECT
private slots:
    void followPathSupported() {
        nt::scene::AnimationDef animation;
        animation.enabled = true;
        animation.preset = "followPath";
        QVERIFY(nt::scene::unsupportedReason(animation, {}).empty());
    }
    void linkedPositionUsesSourceAuthoredTransform() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& timeline = *result.timeline;
        auto& source = timeline.clips.front();
        auto& follower = timeline.clips[1];
        nt::ClipTransform transform;
        transform.position.y = 25;
        source.transform = transform;
        follower.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target", "positionY"},
            {"sourceClipId", QString::fromStdString(source.id)}, {"source", "positionY"}, {"offset", 10}}});
        follower.scene = nt::scene::parseClipScene(follower.raw);
        const auto layers = nt::activeLayersAt(timeline, follower.startMs + 1);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
        QVERIFY(found != layers.end());
        QVERIFY(found->transform.has_value());
        QCOMPARE(found->transform->position.y, 35.0);
        qInfo().noquote() << "MOTION_LINK" << found->transform->position.y;
    }
    void linkedOpacityKeepsFadeCoverage() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& source = result.timeline->clips[0]; auto& follower = result.timeline->clips[1];
        source.opacity = 1; follower.opacity = 0; follower.fadeInMs = 1000;
        follower.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","opacity"},{"sourceClipId",QString::fromStdString(source.id)},{"source","opacity"}}});
        follower.scene = nt::scene::parseClipScene(follower.raw);
        const auto layers = nt::activeLayersAt(*result.timeline, follower.startMs + 500);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
        QVERIFY(found != layers.end()); QCOMPARE(found->opacity, 0.5);
    }
    void linkedGroupRotationReachesChild() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto group = result.timeline->clips[0]; group.id = "motion-group"; group.mediaType = nt::MediaType::Group;
        group.raw.insert("mediaType", "group");
        group.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","rotation"},{"kind","wiggle"},
            {"amplitude",0.1},{"frequencyHz",1},{"seed",5}}});
        group.scene = nt::scene::parseClipScene(group.raw); result.timeline->clips.push_back(group);
        auto& follower = result.timeline->clips[1]; follower.raw.insert("parentId", "motion-group");
        follower.scene = nt::scene::parseClipScene(follower.raw);
        const auto layers = nt::activeLayersAt(*result.timeline, follower.startMs + 100);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
        QVERIFY(found != layers.end()); QVERIFY(found->parentMatrix.has_value());
        QVERIFY(std::abs((*found->parentMatrix)[1]) > 0.00001);
    }
    void linkedOpacityKeepsParentCoverage() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto group = result.timeline->clips[0]; group.id = "motion-group"; group.mediaType = nt::MediaType::Group; group.opacity = 0.5;
        group.raw.insert("mediaType", "group"); group.scene = nt::scene::parseClipScene(group.raw);
        result.timeline->clips.push_back(group);
        auto& source = result.timeline->clips[0]; auto& follower = result.timeline->clips[1];
        source.opacity = 1; follower.opacity = 0; follower.fadeInMs = 1000;
        follower.raw.insert("parentId", "motion-group");
        follower.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","opacity"},{"sourceClipId",QString::fromStdString(source.id)},{"source","opacity"}}});
        follower.scene = nt::scene::parseClipScene(follower.raw);
        const auto layers = nt::activeLayersAt(*result.timeline, follower.startMs + 500);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
        QVERIFY(found != layers.end()); QCOMPARE(found->opacity, 0.25);
    }
    void wiggleUsesSteppedFollowerTime() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& clip = result.timeline->clips[1];
        clip.raw.insert("steppedTime", QJsonObject{{"fps",2}});
        clip.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","rotation"},{"kind","wiggle"},
            {"amplitude",1},{"frequencyHz",1},{"seed",5}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        const auto rotationAt = [&](double t) {
            const auto layers = nt::activeLayersAt(*result.timeline, t);
            const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
            return found != layers.end() && found->transform ? found->transform->rotation : 0.0;
        };
        qInfo().noquote() << "MOTION_WIGGLE" << QString::number(rotationAt(clip.startMs + 100), 'g', 17);
        QCOMPARE(rotationAt(clip.startMs + 100), rotationAt(clip.startMs + 400));
        QVERIFY(rotationAt(clip.startMs + 100) != rotationAt(clip.startMs + 600));
    }
    void linkSamplesSourceWithoutFollowingItsLinks() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& source = result.timeline->clips[0]; auto& follower = result.timeline->clips[1];
        source.durationMs = 1000;
        source.raw.insert("animations", QJsonArray{QJsonObject{{"id","move"},{"role","emphasis"},{"preset","custom"},{"durationMs",1000},
            {"custom",QJsonObject{{"curves",QJsonArray{QJsonObject{{"property","positionY"},{"keyframes",QJsonArray{
                QJsonObject{{"t",0},{"value",0}},QJsonObject{{"t",1},{"value",100}}}}}}}}}}});
        source.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","positionY"},{"sourceClipId",QString::fromStdString(follower.id)},{"source","positionY"}}});
        source.scene = nt::scene::parseClipScene(source.raw);
        follower.raw.insert("animationLinks", QJsonArray{QJsonObject{{"target","positionY"},{"sourceClipId",QString::fromStdString(source.id)},
            {"source","positionY"},{"loop",true},{"timeOffsetMs",250}}});
        follower.scene = nt::scene::parseClipScene(follower.raw);
        const auto layers = nt::activeLayersAt(*result.timeline, follower.startMs + 250);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == follower.id; });
        QVERIFY(found != layers.end()); QVERIFY(found->transform.has_value());
        QCOMPARE(found->transform->position.y, 50.0);
    }
    void repeatAndEchoKeepEffectsAndIdentity() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& clip = result.timeline->clips.front();
        clip.raw.insert("repeater", QJsonObject{{"count",2}, {"positionStep", QJsonObject{{"x",10},{"y",0}}},
            {"timeStepMs",100}, {"colorStep", QJsonObject{{"hueDegrees",200},{"brightness",0.6}}}});
        clip.raw.insert("temporalEcho", QJsonObject{{"copies",1},{"intervalMs",50},{"opacityDecay",0.5}});
        clip.raw.insert("layout", QJsonObject{{"display","flex"}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        QJsonObject repeated; std::string echoName;
        const auto token = nt::registerLayerDecorator([&](nt::ActiveLayer&, const nt::Clip& c, double) {
            if (c.id == clip.id + ":repeat:1:echo:1") { repeated = c.raw; echoName = c.name; }
        });
        nt::evaluateScene(*result.timeline, 500);
        nt::unregisterSceneHook(token);
        QCOMPARE(QString::fromStdString(echoName), QString::fromStdString(clip.name) + " 2 echo 1");
        QVERIFY(!repeated.contains("layout"));
        const auto effects = repeated.value("effects").toArray();
        QVERIFY(!effects.isEmpty());
        QCOMPARE(effects.last().toObject().value("hue").toDouble(), -160.0);
        QCOMPARE(effects.last().toObject().value("brightness").toDouble(), 0.6);
        qInfo().noquote() << "MOTION_TEMPORAL" << effects.last().toObject().value("hue").toDouble()
                          << effects.last().toObject().value("brightness").toDouble() << QString::fromStdString(echoName);
    }
    void wrappedLineStaggerUsesMeasuredLines() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto& clip = result.timeline->clips.front();
        clip.mediaType = nt::MediaType::Text;
        clip.raw.insert("mediaType", "text");
        clip.raw.insert("textStyle", QJsonObject{{"text","one two three"},{"fontSizePx",40},{"maxWidthFrac",0.1}});
        clip.raw.insert("animations", QJsonArray{QJsonObject{{"id","a"},{"role","in"},{"enabled",true},
            {"preset","custom"},{"durationMs",400},{"stagger",QJsonObject{{"unit","line"},{"offsetMs",100}}},
            {"custom",QJsonObject{{"curves",QJsonArray{QJsonObject{{"property","offsetY"},
                {"keyframes",QJsonArray{QJsonObject{{"t",0},{"value",50}},QJsonObject{{"t",1},{"value",0}}}}}}}}}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        const auto token = nt::registerSceneTextMeasurer([](const QString& text, const nt::scene::TextStyle&) { return text.size()*50.0; });
        const auto layers = nt::activeLayersAt(*result.timeline, 200);
        nt::unregisterSceneHook(token);
        const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
        QVERIFY(found != layers.end());
        QVERIFY(!found->transform || found->transform->position.y == 0);
    }
    void wrappedLineStaggerUsesFlexWidth() {
        auto result = nt::loadTimelineFile(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../fixtures/three-tracks.json"));
        QVERIFY(result.timeline.has_value());
        auto group = result.timeline->clips[0]; group.id = "flex-group"; group.mediaType = nt::MediaType::Group;
        group.raw.insert("mediaType", "group"); group.raw.insert("layout", QJsonObject{{"display","flex"},{"width",100}});
        group.scene = nt::scene::parseClipScene(group.raw); result.timeline->clips.push_back(group);
        auto& clip = result.timeline->clips[1]; clip.mediaType = nt::MediaType::Text;
        clip.raw.insert("mediaType", "text"); clip.raw.insert("parentId", "flex-group");
        clip.raw.insert("flexItem", QJsonObject{{"width",100}});
        clip.raw.insert("textStyle", QJsonObject{{"text","one two three"},{"fontSizePx",40},{"maxWidthFrac",1}});
        clip.raw.insert("animations", QJsonArray{QJsonObject{{"id","a"},{"role","in"},{"preset","custom"},{"durationMs",400},
            {"stagger",QJsonObject{{"unit","line"},{"offsetMs",100}}},{"custom",QJsonObject{{"curves",QJsonArray{
                QJsonObject{{"property","offsetY"},{"keyframes",QJsonArray{QJsonObject{{"t",0},{"value",50}},QJsonObject{{"t",1},{"value",0}}}}}}}}}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        const auto token = nt::registerSceneTextMeasurer([](const QString& text, const nt::scene::TextStyle&) { return text.size()*50.0; });
        const auto position = [&](double t) {
            const auto layers = nt::activeLayersAt(*result.timeline, clip.startMs + t);
            const auto found = std::find_if(layers.begin(), layers.end(), [&](const auto& layer) { return layer.clipId == clip.id; });
            return found != layers.end() && found->transform ? found->transform->position.y : -99999.0;
        };
        const auto first = position(100), second = position(200);
        nt::unregisterSceneHook(token);
        QVERIFY(first != -99999.0); QCOMPARE(first, second);
    }
    void followPathLargeCurveCoordinates() {
        nt::scene::AnimationDef animation; animation.preset = "followPath"; animation.role = "emphasis"; animation.durationMs = 1000;
        animation.params = QJsonObject{{"d","M 0 0 Q 1000000000000 1 1 1"}};
        nt::scene::CompileContext context; context.canvasWidth = 100; context.canvasHeight = 100;
        const auto compiled = nt::scene::compileAnimations({animation}, 1000, context);
        const auto sample = nt::scene::sampleAnimations(compiled, 500, std::nullopt);
        QVERIFY(sample.positionX.has_value()); QVERIFY(std::isfinite(*sample.positionX));
    }
    void followPathOrientsAlongCurvedPath() {
        nt::scene::AnimationDef animation; animation.preset = "followPath"; animation.role = "emphasis"; animation.durationMs = 1000;
        animation.params = QJsonObject{{"d","M 0 0 Q 0 1 1 1"},{"orient",true}};
        nt::scene::CompileContext context; context.canvasWidth = 100; context.canvasHeight = 100;
        const auto compiled = nt::scene::compileAnimations({animation}, 1000, context);
        const auto sample = nt::scene::sampleAnimations(compiled, 500, std::nullopt);
        QVERIFY(sample.positionX.has_value()); QVERIFY(sample.positionY.has_value());
        QVERIFY(*sample.positionX > 20 && *sample.positionX < 30);
        QVERIFY(*sample.positionY > 70 && *sample.positionY < 80);
        QVERIFY(sample.rotation > 0.6 && sample.rotation < 1.0);
    }
    void followPathBoxReverseAndOrientation() {
        nt::scene::AnimationDef animation;
        animation.preset = "followPath"; animation.role = "emphasis"; animation.durationMs = 1000;
        animation.params = QJsonObject{{"d", "M 0 0 L 1 0"}, {"pathX", 0.25}, {"pathY", 0.5},
            {"pathWidth", 0.5}, {"pathHeight", 0.5}, {"startT", 1}, {"endT", 0}, {"orient", true}};
        nt::scene::CompileContext context; context.canvasWidth = 100; context.canvasHeight = 200;
        const auto compiled = nt::scene::compileAnimations({animation}, 1000, context);
        const auto sample = nt::scene::sampleAnimations(compiled, 250, std::nullopt);
        QVERIFY(sample.positionX.has_value()); QVERIFY(sample.positionY.has_value());
        QCOMPARE(*sample.positionX, 62.5); QCOMPARE(*sample.positionY, 100.0); QCOMPARE(sample.rotation, 0.0);
    }
    void shippedExamplesEvaluateUnchanged() {
        const QDir source(QFileInfo(QString::fromUtf8(__FILE__)).dir().filePath("../../../../packages/base-nodes/nodetool/examples/timelines"));
        const auto files = source.entryList({"*.timeline.json"}, QDir::Files);
        QVERIFY(!files.isEmpty());
        int totalLayers = 0;
        for (const auto& fileName : files) {
            QFile file(source.filePath(fileName)); QVERIFY2(file.open(QIODevice::ReadOnly), qPrintable(fileName));
            const auto wrapper = QJsonDocument::fromJson(file.readAll()).object();
            auto document = wrapper.value("document").toObject(); QVERIFY2(!document.isEmpty(), qPrintable(fileName));
            for (const auto* key : {"width", "height", "fps", "durationMs"}) {
                if (!document.contains(key) && wrapper.contains(key)) document.insert(key, wrapper.value(key));
            }
            const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson(QJsonDocument::Compact));
            QVERIFY2(parsed.timeline.has_value(), qPrintable(fileName + ": " + parsed.error));
            const auto originalClips = document.value("clips").toArray();
            QCOMPARE(parsed.timeline->clips.size(), static_cast<std::size_t>(originalClips.size()));
            for (std::size_t i = 0; i < parsed.timeline->clips.size(); ++i) {
                QCOMPARE(parsed.timeline->clips[i].raw, originalClips[static_cast<qsizetype>(i)].toObject());
            }
            const double duration = wrapper.value("durationMs").toDouble();
            for (const double time : {0.0, duration / 4, duration / 2, duration * 0.75}) {
                totalLayers += static_cast<int>(nt::evaluateScene(*parsed.timeline, time).layers.size());
            }
            for (std::size_t i = 0; i < parsed.timeline->clips.size(); ++i) {
                QCOMPARE(parsed.timeline->clips[i].raw, originalClips[static_cast<qsizetype>(i)].toObject());
            }
        }
        QVERIFY(totalLayers > 0);
    }
    void pathOracle() {
        nt::scene::AnimationDef animation;
        animation.preset = "followPath"; animation.role = "emphasis"; animation.durationMs = 1000;
        animation.params = QJsonObject{{"d", "M 0 0 L 1 0 L 1 0.5"}, {"orient", true}};
        nt::scene::CompileContext context; context.canvasWidth = 100; context.canvasHeight = 100;
        const auto compiled = nt::scene::compileAnimations({animation}, 1000, context);
        const auto sample = nt::scene::sampleAnimations(compiled, 500, std::nullopt);
        QVERIFY(sample.positionX.has_value()); QVERIFY(sample.positionY.has_value());
        qInfo().noquote() << "MOTION_ORACLE" << *sample.positionX << *sample.positionY;
    }
    void followPathSamplesArcLength() {
        nt::scene::AnimationDef animation;
        animation.preset = "followPath";
        animation.role = "emphasis";
        animation.durationMs = 1000;
        animation.params = QJsonObject{{"d", "M 0 0 L 1 0 L 1 0.5"}, {"orient", true}};
        nt::scene::CompileContext context;
        context.canvasWidth = 100;
        context.canvasHeight = 100;
        const auto compiled = nt::scene::compileAnimations({animation}, 1000, context);
        const auto sample = nt::scene::sampleAnimations(compiled, 500, std::nullopt);
        QVERIFY(sample.positionX.has_value());
        QVERIFY(sample.positionY.has_value());
        QCOMPARE(*sample.positionX, 75.0);
        QCOMPARE(*sample.positionY, 0.0);
    }
};

QTEST_GUILESS_MAIN(TestMotion)
#include "tst_motion.moc"
