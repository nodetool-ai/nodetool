#include "edit/keyframes/Keyframes.h"
#include "preview/effects/ClipEffects.h"
#include "scene/ClipScene.h"
#include "preview/effects/ClipAnalysis.h"
#include "preview/effects/Stabilization.h"
#include "preview/effects/Denoise.h"
#include "preview/layers/SceneHooks.h"
#include "model/TimelineJson.h"
#include <QJsonDocument>
#include <QScopeGuard>
#include <QtTest>
#include <cmath>
#include <numbers>
using namespace nt::effects;
namespace {
QJsonObject effect(const char *type) { return {{"type", type}, {"enabled", true}}; }
QJsonArray points(std::initializer_list<std::pair<double, double>> values) {
    QJsonArray result;
    for (const auto &[x, y] : values) {
        result.append(QJsonObject{{"x", x}, {"y", y}});
    }
    return result;
}
QJsonArray keyframes(std::initializer_list<std::pair<double, double>> values) {
    QJsonArray result;
    for (const auto &[t, value] : values) { result.append(QJsonObject{{"t", t}, {"value", value}}); }
    return result;
}
QJsonObject adjustmentStyleDocument() {
    return QJsonDocument::fromJson(R"({
            "effects":[{"id":"fill","type":"generator","enabled":true,"mode":"noise","colorA":"#000000"}],
            "mask":{"kind":"path","d":"M 0 0 L 1 0 L 1 1 Z"},
            "animations":[{"id":"style","role":"in","preset":"custom","durationMs":1000,
                "custom":{"curves":[]},"styleTracks":[
                    {"target":"effect.fill.colorA","keyframes":[{"t":0,"value":"#000000"},{"t":1,"value":"#ffffff"}]},
                    {"target":"mask.d","keyframes":[{"t":0,"value":"M 0 0 L 1 0 L 1 1 Z"},
                        {"t":1,"value":"M 0.4 0 L 0.6 0 L 0.6 1 Z"}]}]}]
        })").object();
}
} // namespace
class TestEffectPlan : public QObject {
    Q_OBJECT
  private slots:
    // Every parameter with a stopwatch reaches the plan: its key at two times gives two sets of passes.
    void everyKeyableParamReachesThePlan_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("param");
        for (const auto* type : {"denoise", "stabilize", "deflicker", "deband", "secondaryColor", "exposure", "blur", "glow", "dropShadow",
                                 "sharpen", "chromaKey", "levels", "grain", "pixelate", "posterize", "directionalBlur", "lensDistortion"}) {
            const auto params = nt::keyframes::keyableEffectParams(type);
            QVERIFY2(!params.isEmpty(), type);
            for (const auto& param : params) {
                QTest::newRow(qPrintable(QString(type) + ":" + param)) << QString(type) << param;
            }
        }
    }
    void everyKeyableParamReachesThePlan() {
        QFETCH(QString, type);
        QFETCH(QString, param);
        const auto spec = nt::keyframes::effectParamSpec(type, param);
        QVERIFY(!spec.isEmpty());
        // Values the other parameters need for this one to matter.
        QJsonObject e{{"id", "e"}, {"type", type}, {"enabled", true}};
        const QHash<QString, QJsonObject> settings{
            {"denoise", {{"lumaStrength", .5}, {"chromaStrength", .5}, {"temporalStrength", .5}, {"radius", 2}}},
            {"deband", {{"strength", .5}, {"range", 16}, {"threshold", .02}, {"dither", .5}}},
            {"secondaryColor", {{"hueCenter", 90}, {"hueWidth", 60}, {"hueSoftness", 15}, {"saturationMin", .1}, {"saturationMax", .9}, {"lightnessMin", .1}, {"lightnessMax", .9}, {"rangeSoftness", .1}, {"hueShift", 30}, {"saturation", 1.5}, {"lightness", .1}}},
            {"exposure", {{"exposure", 1}, {"rolloff", .5}, {"whites", .5}}},
            {"blur", {{"radius", 4}}},
            {"glow", {{"radius", 4}, {"intensity", 1}}},
            {"dropShadow", {{"offsetX", 4}, {"offsetY", 4}, {"blur", 4}, {"opacity", .5}, {"color", "#000000"}}},
            {"sharpen", {{"amount", 1}, {"radius", 1}}},
            {"chromaKey", {{"color", "#00ff00"}, {"tolerance", .3}, {"softness", .1}, {"spill", .5}}},
            {"levels", {{"inBlack", .1}, {"inWhite", .9}, {"gamma", 1.2}, {"outBlack", .1}, {"outWhite", .9}}},
            {"grain", {{"amount", .5}, {"size", 2}, {"roughness", .5}, {"softness", .25}, {"colorAmount", .5}}},
            {"pixelate", {{"cellSize", 4}}},
            {"posterize", {{"levels", 8}}},
            {"directionalBlur", {{"radius", 8}, {"angle", 30}}},
            {"lensDistortion", {{"amount", .25}}}};
        const auto chosen = settings.value(type);
        for (auto i = chosen.begin(); i != chosen.end(); ++i) { e.insert(i.key(), i.value()); }
        nt::Clip clip;
        clip.id = "c";
        clip.mediaType = nt::MediaType::Video;
        clip.startMs = 0;
        clip.durationMs = 1000;
        clip.raw.insert("currentAssetId", "source");
        if (type == "stabilize" || type == "deflicker") {
            auto data = analysisKey(clip, e);
            data.insert("version", 1);
            if (type == "stabilize") {
                data.insert("width", 256); data.insert("height", 256); data.insert("requiredZoom", 1.3);
                data.insert("samples", QJsonArray{QJsonObject{{"timeMs", 0}, {"x", .02}, {"y", .01}, {"angle", .02}, {"scale", 1.02}}, QJsonObject{{"timeMs", 1000}, {"x", .02}, {"y", .01}, {"angle", .02}, {"scale", 1.02}}});
            } else {
                data.insert("frameRate", 30);
                data.insert("samples", QJsonArray{QJsonObject{{"timeMs", 0}, {"stops", 1}}, QJsonObject{{"timeMs", 1000}, {"stops", 1}}});
            }
            e.insert("analysis", data);
        }
        // Two values inside the parameter's bounds, and away from its identity.
        const double low = spec.contains("min") ? spec["min"].toDouble() : -8;
        const double high = spec.contains("max") ? spec["max"].toDouble() : 16;
        const double first = low + (high - low) * 0.3, second = low + (high - low) * 0.7;
        clip.raw.insert("effects", QJsonArray{e});
        clip.raw.insert("paramCurves", QJsonArray{QJsonObject{{"property", nt::scene::effectCurveName("e", param)},
            {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", first}}, QJsonObject{{"t", 1}, {"value", second}}}}}});
        clip.scene = nt::scene::parseClipScene(clip.raw);
        nt::Timeline timeline;
        timeline.width = 64;
        timeline.height = 64;
        timeline.fps = 30;
        const auto at = [&](double ms) {
            QJsonObject ext;
            decorateEffects(ext, clip, {timeline, nullptr, ms, ms, 30, 0});
            return ext.value("clipEffects").toArray();
        };
        const auto start = at(0), end = at(1000);
        // Outsets are the plan of an effect that spreads past the layer, so they count too.
        const auto plan = [](const QJsonArray& effects) {
            QStringList words;
            for (const auto& pass : planChain(effects)) {
                words.append(QString::number(int(pass.op)));
                for (const float value : pass.params) { words.append(QString::number(value, 'g', 6)); }
            }
            const auto outset = chainOutset(effects);
            words << QString::number(outset.left()) << QString::number(outset.top()) << QString::number(outset.right()) << QString::number(outset.bottom());
            return words.join(' ');
        };
        QVERIFY2(plan(start) != plan(end), qPrintable(plan(start)));
    }
    // Adjustment clips and group surfaces read their keys as a clip does.
    void keyedEffectsOnAdjustmentAndGroup() {
        const QJsonObject e{{"id", "e"}, {"type", "blur"}, {"enabled", true}, {"radius", 1}};
        const QJsonArray curves{QJsonObject{{"property", "effect:e:radius"},
            {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", 2}}, QJsonObject{{"t", 1}, {"value", 10}}}}}};
        nt::Timeline timeline;
        timeline.width = 64;
        timeline.height = 64;
        timeline.fps = 30;
        for (const auto type : {nt::MediaType::Adjustment, nt::MediaType::Group}) {
            nt::Clip clip;
            clip.id = "c";
            clip.mediaType = type;
            clip.durationMs = 1000;
            clip.raw.insert("effects", QJsonArray{e});
            clip.raw.insert("paramCurves", curves);
            clip.scene = nt::scene::parseClipScene(clip.raw);
            QJsonObject ext;
            decorateEffects(ext, clip, {timeline, nullptr, 500, 500, 30, 15});
            QCOMPARE(ext.value("clipEffects").toArray()[0].toObject().value("radius").toDouble(), 6.0);
            // The static value in the document stays as it was.
            QCOMPARE(clip.raw.value("effects").toArray()[0].toObject().value("radius").toDouble(), 1.0);
        }
    }
    void noiseReductionPlan() {
        auto noise=effect("denoise");QVERIFY(planChain({noise}).empty());
        noise.insert("lumaStrength",.7);noise.insert("chromaStrength",.8);noise.insert("temporalStrength",.9);noise.insert("radius",3);
        auto exposure=effect("exposure");exposure.insert("exposure",1);
        const auto passes=planChain({exposure,noise});QCOMPARE(passes.size(),size_t{3});
        QCOMPARE(passes[0].op,Op::DenoiseTemporal);QCOMPARE(passes[1].op,Op::DenoiseSpatial);QCOMPARE(passes[2].op,Op::Exposure);
        QCOMPARE(passes[1].params[3],3.f);
        nt::Clip clip;clip.mediaType=nt::MediaType::Video;clip.durationMs=1000;clip.inPointMs=200;
        nt::ActiveLayer layer;layer.mediaPath="source.mp4";layer.sourceTimeMs=200;layer.ext.insert("clipEffects",QJsonArray{noise});
        const auto before=denoiseSources(layer,clip);QCOMPARE(before.size(),size_t{2});QCOMPARE(*before[0].sourceTimeMs,200.);
        layer.sourceTimeMs=1190;const auto after=denoiseSources(layer,clip);QVERIFY(std::abs(*after[1].sourceTimeMs-1199.999)<.0001);
        clip.mediaType=nt::MediaType::Image;QVERIFY(denoiseSources(layer,clip).empty());
    }
    void cameraMotion() {
        std::vector<MotionMatch> matches;
        const CameraMotion expected{1.01*std::cos(.03),1.01*std::sin(.03),.02,-.01};
        for (int y=0;y<6;++y) { for (int x=0;x<8;++x) {
            MotionPoint from{(x-3.5)/8,(y-2.5)/8}; auto to=movePoint(expected,from);
            if (x>=2 && x<=5 && y>=2 && y<=4) { to.x-=.08; to.y+=.03; }
            matches.push_back({from,to});
        } }
        const auto fitted=fitCameraMotion(matches,.004,.75); QVERIFY(fitted);
        QVERIFY(std::abs(fitted->a-expected.a)<1e-6); QVERIFY(std::abs(fitted->b-expected.b)<1e-6);
        QVERIFY(std::abs(fitted->x-expected.x)<1e-6); QVERIFY(std::abs(fitted->y-expected.y)<1e-6);
        MotionFrame first{128,96,std::vector<float>(128*96)},second=first;
        uint32_t state=19;
        for (auto& value : first.luma) { state=state*1664525u+1013904223u; value=float(state>>24)/255; }
        for (int y=0;y<96;++y) { for (int x=0;x<128;++x) {
            second.luma[y*128+x]=first.luma[std::clamp(y+1,0,95)*128+std::clamp(x-2,0,127)];
        } }
        const auto tracked=estimateCameraMotion(first,second,.75); QVERIFY(tracked);
        QVERIFY(std::abs(tracked->x-2./128)<.001); QVERIFY(std::abs(tracked->y+1./128)<.001);
        std::fill(second.luma.begin(),second.luma.end(),.5f);
        QVERIFY(!estimateCameraMotion(first,second,.75)); QVERIFY(!estimateCameraMotion(second,second,.75));
    }
    void stabilizationAnalysis() {
        std::vector<CameraPath> path;
        for (int i=0;i<90;++i) { path.push_back({i*1000./30,i*.001,0,0,0,i==45}); }
        for (const auto& sample : stabilizationCurve(path,500,.75).value("samples").toArray()) {
            QCOMPARE(sample.toObject().value("x").toDouble(),0.);
        }
        for (int i=0;i<90;++i) { path[i].x+=i%2 ? .01 : -.01; }
        const auto curve=stabilizationCurve(path,500,.75);
        QVERIFY(curve.value("requiredZoom").toDouble()>1.01);
        const auto samples=curve.value("samples").toArray();
        for (int i=8;i<37;++i) { QVERIFY(std::abs(samples[i].toObject().value("x").toDouble()+(i%2 ? .01 : -.01))<.002); }
        std::vector<CameraPath> reference,shifted;
        for (int i=0;i<90;++i) {
            CameraPath p{i*1000./30,i*.001,0,i%2 ? .02 : -.02,0}; reference.push_back(p);
            p.x+=20*std::cos(p.angle)-10*std::sin(p.angle); p.y+=20*std::sin(p.angle)+10*std::cos(p.angle); shifted.push_back(p);
        }
        const auto original=stabilizationCurve(reference,500,.75).value("samples").toArray();
        const auto moved=stabilizationCurve(shifted,500,.75).value("samples").toArray();
        for (int i=8;i<82;++i) { for (const auto* axis : {"x","y"}) {
            QVERIFY(std::abs(original[i].toObject().value(axis).toDouble()-moved[i].toObject().value(axis).toDouble())<1e-7);
        } }
        nt::Clip clip; clip.mediaType=nt::MediaType::Video; clip.startMs=1000; clip.durationMs=1000;
        clip.raw.insert("currentAssetId","source"); clip.raw.insert("crop",QJsonObject{{"left",.2},{"right",.1},{"top",.1},{"bottom",.15}});
        auto e=effect("stabilize"),data=analysisKey(clip,e);
        data.insert("version",1); data.insert("width",256); data.insert("height",512); data.insert("requiredZoom",1.3);
        data.insert("samples",QJsonArray{QJsonObject{{"timeMs",0},{"x",.07},{"y",.03},{"angle",.1},{"scale",1.02}},
                                       QJsonObject{{"timeMs",40},{"x",-.04},{"y",0},{"angle",0},{"scale",1}}});
        e.insert("analysis",data);
        const auto first=stabilizationMatrix(clip,e,1000),second=stabilizationMatrix(clip,e,1040);
        QVERIFY(stabilizationFits(first)); QVERIFY(stabilizationFits(second)); QVERIFY(first!=second);
        QCOMPARE(stabilizationMatrix(clip,e,1039),first); QCOMPARE(stabilizationMatrix(clip,e,1000),first);
        e.insert("strength",0); QCOMPARE(stabilizationMatrix(clip,e,1000),stabilizationIdentity);
        e.insert("strength",1); clip.raw.insert("effects",QJsonArray{e}); QJsonObject ext; decorateEffects(ext,clip,1000);
        const auto rendered=ext.value("clipEffects").toArray()[0].toObject(); QVERIFY(!rendered.contains("analysis"));
        auto key=effect("chromaKey"); key.insert("tolerance",.2); auto exposure=effect("exposure"); exposure.insert("exposure",1);
        const auto plan=planChain({exposure,rendered},{key}); QCOMPARE(plan.size(),size_t(3));
        QCOMPARE(plan[0].op,Op::Stabilize); QCOMPARE(plan[1].op,Op::ChromaKey); QCOMPARE(plan[2].op,Op::Exposure);
        clip.raw.insert("currentAssetId","changed"); QCOMPARE(stabilizationMatrix(clip,e,1000),stabilizationIdentity);
    }
    void deflickerAnalysis() {
        std::vector<LuminanceSample> samples;
        for (int i=0;i<90;++i) { samples.push_back({i*1000./30,-2+(i%2 ? .5 : -.5)}); }
        const auto curve=deflickerCurve(samples,500,1);
        for (int i=8;i<82;++i) { QVERIFY(std::abs(samples[i].logLuma+curve[i].toObject().value("stops").toDouble()+2)<.05); }
        for (int i=0;i<90;++i) { samples[i].logLuma=-6+4*std::pow(i/89.,2); }
        for (const auto& sample : deflickerCurve(samples,500,1)) { QCOMPARE(sample.toObject().value("stops").toDouble(),0.); }
        for (int i=0;i<90;++i) { samples[i].logLuma=i<45 ? -4 : -1; samples[i].cut=i==45; }
        for (const auto& sample : deflickerCurve(samples,500,1)) { QCOMPARE(sample.toObject().value("stops").toDouble(),0.); }
        nt::Clip clip; clip.mediaType=nt::MediaType::Video; clip.startMs=1000; clip.durationMs=1000;
        clip.raw.insert("currentAssetId","source");
        auto e=effect("deflicker"), data=analysisKey(clip,e);
        data.insert("version",1); data.insert("frameRate",30);
        data.insert("samples",QJsonArray{QJsonObject{{"timeMs",0},{"stops",1}},QJsonObject{{"timeMs",40},{"stops",-1}}});
        e.insert("analysis",data);
        QCOMPARE(deflickerStops(clip,e,1040),-1.); QCOMPARE(deflickerStops(clip,e,1000),1.);
        e.insert("strength",.25); QCOMPARE(deflickerStops(clip,e,1000),.25);
        clip.raw.insert("effects",QJsonArray{e}); QJsonObject ext; decorateEffects(ext,clip,1000);
        QCOMPARE(ext.value("clipEffects").toArray()[0].toObject().value("exposure").toDouble(),.25);
        clip.raw.insert("currentAssetId","new-source"); QCOMPARE(deflickerStops(clip,e,1000),0.);
    }
    void secondaryMatteDecoration() {
        nt::Timeline timeline;
        timeline.matteClipId="picture"; timeline.matteEffectId="secondary";
        nt::Clip clip; clip.id="picture";
        clip.raw.insert("effects",QJsonArray{
            QJsonObject{{"id","grade"},{"type","color"},{"enabled",true},{"brightness",1}},
            QJsonObject{{"id","first"},{"type","exposure"},{"enabled",true},{"exposure",1}},
            QJsonObject{{"id","secondary"},{"type","secondaryColor"},{"enabled",true}},
            QJsonObject{{"id","last"},{"type","vignette"},{"enabled",true},{"amount",1}}});
        QJsonObject ext;
        decorateEffects(ext,clip,{timeline,nullptr,0,0,30,0});
        decorateTrackEffects(ext,nullptr);
        const auto chain=ext.value("clipEffects").toArray();
        QCOMPARE(chain.size(),2); QVERIFY(chain.last().toObject().value("_matte").toBool());
        QVERIFY(ext.value("trackEffects").toArray().isEmpty());
        QCOMPARE(planChain(chain).back().op,Op::SecondaryColor);
        auto withRepair=clip.raw.value("effects").toArray(); withRepair.append(effect("stabilize")); clip.raw.insert("effects",withRepair);
        decorateEffects(ext,clip,{timeline,nullptr,0,0,30,0});
        QCOMPARE(ext.value("clipEffects").toArray().first().toObject().value("type").toString(),QString("stabilize"));
        QVERIFY(planChain({effect("secondaryColor")}).empty());
        const auto table=secondaryCurveTransfer({{"hueCurve",points({{0.2,0.3},{0.8,0.7}})}});
        QCOMPARE(table[0],table[1020]); QVERIFY(std::abs(table[0]-0.5f)<0.00001f);
    }
    void contextDecorators() {
        const QJsonObject raw{{"fps", 23.976}, {"width", 64}, {"height", 32}, {"durationMs", 3000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{
                QJsonObject{{"id", "group"}, {"trackId", "v"}, {"mediaType", "group"},
                    {"startMs", 100}, {"durationMs", 2000}, {"blendMode", "screen"}},
                QJsonObject{{"id", "leaf"}, {"trackId", "v"}, {"mediaType", "shape"},
                    {"startMs", 200}, {"durationMs", 1500}, {"inPointMs", 900}, {"speedMultiplier", 2},
                    {"parentId", "group"}, {"steppedTime", QJsonObject{{"fps", 4}}},
                    {"temporalEcho", QJsonObject{{"copies", 1}, {"intervalMs", 100}, {"opacityDecay", 0.5}}},
                    {"shapeStyle", QJsonObject{{"kind", "rect"}}}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        auto timeline = *parsed.timeline;
        int layers = 0, groups = 0;
        const auto layerToken = nt::registerContextLayerDecorator(
            [&](nt::ActiveLayer &layer, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
                ++layers;
                QCOMPARE(&context.timeline, &timeline);
                QCOMPARE(context.track, &timeline.tracks[0]);
                QCOMPARE(context.track->id, clip.trackId);
                QCOMPARE(context.fps, 23.976);
                QCOMPARE(context.sequenceTimeMs, 735.9);
                QCOMPARE(context.timeMs, clip.id == "leaf" ? 700.0 : 550.0);
                QCOMPARE(context.frameIndex, 17LL);
                QVERIFY(layer.ext.value("legacy").toBool());
            });
        const auto groupToken = nt::registerContextGroupDecorator(
            [&](nt::PrecompositeLayer &layer, const nt::Clip &, const nt::SceneDecorationContext &context) {
                ++groups;
                QCOMPARE(&context.timeline, &timeline);
                QCOMPARE(context.track, &timeline.tracks[0]);
                QCOMPARE(context.fps, 23.976);
                QCOMPARE(context.sequenceTimeMs, 735.9);
                QCOMPARE(context.timeMs, 735.9);
                QCOMPARE(context.frameIndex, 17LL);
                QVERIFY(layer.ext.value("legacy").toBool());
            });
        // Register legacy hooks later: contextual hooks must still follow them.
        const auto legacyLayer = nt::registerLayerDecorator([](nt::ActiveLayer &layer, const nt::Clip &, double) {
            layer.ext.insert("legacy", true);
        });
        const auto legacyGroup = nt::registerGroupDecorator([](nt::PrecompositeLayer &layer, const nt::Clip &, double) {
            layer.ext.insert("legacy", true);
        });
        const auto cleanup = qScopeGuard([&] {
            for (auto token : {layerToken, groupToken, legacyLayer, legacyGroup}) { nt::unregisterSceneHook(token); }
        });
        const auto frame = nt::evaluateScene(timeline, 735.9);
        QCOMPARE(layers, 2);
        QCOMPARE(groups, 1);
        nt::unregisterSceneHook(layerToken);
        nt::unregisterSceneHook(groupToken);
        nt::evaluateScene(timeline, 735.9);
        QCOMPARE(layers, 2);
        QCOMPARE(groups, 1);

        timeline.clips[0].trackId = "missing";
        int missing = 0;
        const auto nullTrack = nt::registerContextGroupDecorator(
            [&](nt::PrecompositeLayer &, const nt::Clip &, const nt::SceneDecorationContext &context) {
                QVERIFY(!context.track);
                ++missing;
            });
        const auto nullCleanup = qScopeGuard([&] { nt::unregisterSceneHook(nullTrack); });
        nt::evaluateScene(timeline, 735.9);
        QCOMPARE(missing, 1);
    }
    void adjustmentHooks() {
        QFile fixture(QString::fromUtf8(__FILE__).replace("tst_effectplan.cpp", "fixtures/adjustment-group.json"));
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto parsed = nt::parseTimelineJson(fixture.readAll()); QVERIFY(parsed.timeline);
        const auto &timeline = *parsed.timeline;
        const auto before = QJsonDocument(nt::framePlanJson(nt::buildFramePlan(timeline, 200))).toJson(QJsonDocument::Compact);
        QVERIFY(nt::evaluateScene(timeline, 200).adjustments.empty());
        int calls = 0;
        const auto token = nt::registerContextAdjustmentDecorator(
            [&](nt::SceneAdjustment &adjustment, const nt::Clip &clip, const nt::SceneDecorationContext &context) {
                ++calls;
                if (&context.timeline != &timeline || context.track != &timeline.tracks[1] ||
                    context.timeMs != 200 || context.sequenceTimeMs != 200 || context.frameIndex != 6) {
                    return false;
                }
                return decorateAdjustment(adjustment, clip, context);
            });
        const auto cleanup = qScopeGuard([&] { nt::unregisterSceneHook(token); });
        const auto frame = nt::evaluateScene(timeline, 200);
        QCOMPARE(calls, 1);
        QCOMPARE(frame.adjustments.size(), size_t{1});
        const auto &adjustment = frame.adjustments[0];
        QCOMPARE(adjustment.z, nt::trackZ(1));
        QCOMPARE(adjustment.opacity, 0.325);
        QCOMPARE(adjustment.precomposeGroupId, std::string("group"));
        const auto after = QJsonDocument(nt::framePlanJson(nt::buildFramePlan(timeline, 200))).toJson(QJsonDocument::Compact);
        QCOMPARE(after, before);
        nt::unregisterSceneHook(token);
        const int previous = calls;
        QVERIFY(nt::evaluateScene(timeline, 200).adjustments.empty());
        QCOMPARE(calls, previous);
    }
    void adjustmentAnimation() {
        QJsonArray curves;
        for (const auto &[name, values] : std::initializer_list<std::pair<const char *, QJsonArray>>{
            {"brightness", keyframes({{0, 0}, {1, 0.4}})}, {"blur", keyframes({{0, 0}, {1, 10}})},
            {"opacity", keyframes({{0, 0.5}, {1, 1}})}, {"wipeProgress", keyframes({{0, 0}, {1, 1}})}}) {
            curves.append(QJsonObject{{"property", name}, {"keyframes", values}});
        }
        const QJsonArray styles{
            QJsonObject{{"target", "mask.x"}, {"keyframes", keyframes({{0, 0}, {1, 0.4}})}},
            QJsonObject{{"target", "effect.grade.contrast"}, {"keyframes", keyframes({{0, 1}, {1, 3}})}}};
        const QJsonObject custom{{"mask", QJsonObject{{"direction", "right"}, {"softness", 0.1}}}, {"curves", curves}};
        const QJsonObject animation{{"id", "knobs"}, {"role", "in"}, {"preset", "custom"}, {"durationMs", 1000},
            {"custom", custom}, {"styleTracks", styles}};
        auto grade = effect("color"); grade.insert("id", "grade"); grade.insert("contrast", 1);
        const QJsonObject raw{{"fps", 24}, {"width", 64}, {"height", 32}, {"durationMs", 2000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "a"}, {"trackId", "v"}, {"mediaType", "adjustment"},
                {"startMs", 0}, {"durationMs", 2000}, {"opacity", 0.6}, {"effects", QJsonArray{grade}},
                {"mask", QJsonObject{{"kind", "rect"}, {"x", 0}, {"width", 0.5}}},
                {"animations", QJsonArray{animation}}}}}};
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        const auto token = nt::registerContextAdjustmentDecorator(decorateAdjustment);
        const auto cleanup = qScopeGuard([&] { nt::unregisterSceneHook(token); });
        const auto frame = nt::evaluateScene(*parsed.timeline, 500);
        QCOMPARE(frame.adjustments.size(), size_t{1});
        const auto &adjustment = frame.adjustments[0];
        QVERIFY(std::abs(adjustment.opacity - 0.45) < 1e-9);
        QVERIFY(adjustment.wipe);
        QCOMPARE(adjustment.wipe->direction, std::string("right"));
        QCOMPARE(adjustment.wipe->progress, 0.5);
        QCOMPARE(adjustment.ext.value("shapeMask").toObject().value("x").toDouble(), 0.2);
        const auto effects = adjustment.ext.value("clipEffects").toArray();
        QCOMPARE(effects.size(), 3);
        QCOMPARE(effects[0].toObject().value("contrast").toDouble(), 2.);
        QCOMPARE(effects[1].toObject().value("brightness").toDouble(), 0.2);
        QCOMPARE(effects[2].toObject().value("radius").toDouble(), 5.);
        auto animationOnly = *parsed.timeline;
        animationOnly.clips[0].raw.insert("effects", QJsonArray{});
        QVERIFY(nt::evaluateScene(animationOnly, 0).adjustments.empty());
        const auto animatedFrame = nt::evaluateScene(animationOnly, 500);
        QCOMPARE(animatedFrame.adjustments.size(), size_t{1});
        QCOMPARE(animatedFrame.adjustments[0].ext.value("clipEffects").toArray().size(), 2);
    }
    void adjustmentStyles() {
        nt::Timeline timeline; timeline.width = 64; timeline.height = 32; timeline.fps = 24;
        nt::Clip clip; clip.durationMs = 1000;
        clip.raw = adjustmentStyleDocument();
        nt::SceneAdjustment adjustment;
        const nt::SceneDecorationContext context{timeline, nullptr, 500, 500, 24, 12};
        QVERIFY(decorateAdjustment(adjustment, clip, context));
        QCOMPARE(adjustment.ext.value("clipEffects").toArray()[0].toObject().value("colorA").toString(), QString("#808080ff"));
        const auto path = adjustment.ext.value("shapeMask").toObject().value("d").toString().split(' ');
        QCOMPARE(path.size(), 10);
        QCOMPARE(path[1].toDouble(), 0.2);
        QCOMPARE(path[4].toDouble(), 0.8);
    }
    void clipAndGroupStyles_data() {
        QTest::addColumn<bool>("group");
        QTest::addColumn<double>("time");
        for (bool group : {false, true}) {
            for (double time : {250., 750.}) {
                QTest::newRow(qPrintable(QString("%1-%2").arg(group ? "group" : "leaf").arg(time))) << group << time;
            }
        }
    }
    void clipAndGroupStyles() {
        QFETCH(bool, group);
        QFETCH(double, time);
        nt::Timeline timeline; timeline.width = 64; timeline.height = 32;
        nt::Clip clip; clip.durationMs = 1000;
        clip.raw = QJsonDocument::fromJson(R"({
            "effects":[{"id":"grade","type":"color","enabled":true,"brightness":0}],
            "mask":{"kind":"rect","x":0,"width":0.5},
            "animations":[{"id":"style","role":"in","preset":"custom","durationMs":1000,
                "custom":{"curves":[]},"styleTracks":[
                    {"target":"effect.grade.brightness","keyframes":[{"t":0,"value":0},{"t":1,"value":1}]},
                    {"target":"mask.x","keyframes":[{"t":0,"value":0},{"t":1,"value":0.4}]}]}]
        })").object();
        const auto authored = clip.raw;
        clip.mediaType = group ? nt::MediaType::Group : nt::MediaType::Video;
        for (bool masksFirst : {false, true}) {
            nt::ActiveLayer layer;
            if (masksFirst) { decorateMasks(layer, clip); }
            decorateEffects(layer.ext, clip, {timeline, nullptr, time, time, 30, 0});
            if (!masksFirst) { decorateMasks(layer, clip); }
            QCOMPARE(layer.ext.value("clipEffects").toArray()[0].toObject().value("brightness").toDouble(), group ? 0. : time / 1000);
            if (group) {
                QVERIFY(!layer.ext.contains("shapeMask"));
            } else {
                QCOMPARE(layer.ext.value("shapeMask").toObject().value("x").toDouble(), time / 1000 * 0.4);
            }
        }
        QCOMPARE(clip.raw, authored);
    }
    void leafAdditiveTreatments() {
        nt::Timeline timeline; timeline.width = 64; timeline.height = 32;
        nt::Clip clip; clip.durationMs = 1000;
        clip.raw = QJsonDocument::fromJson(R"({
            "effects":[{"id":"grade","type":"color","enabled":true,"brightness":0}],
            "animations":[{"id":"color","role":"in","preset":"custom","durationMs":1000,
                "custom":{"curves":[
                    {"property":"brightness","keyframes":[{"t":0,"value":0},{"t":1,"value":0.4}]},
                    {"property":"blur","keyframes":[{"t":0,"value":0},{"t":1,"value":10}]}]},
                "styleTracks":[{"target":"effect.grade.brightness","keyframes":[{"t":0,"value":0},{"t":1,"value":0.6}]}]}]
        })").object();
        QJsonObject ext;
        decorateEffects(ext, clip, {timeline, nullptr, 500, 500, 30, 15});
        const auto effects = ext.value("clipEffects").toArray();
        QCOMPARE(effects.size(), 3);
        QCOMPARE(effects[0].toObject().value("brightness").toDouble(), 0.3);
        QCOMPARE(effects[1].toObject().value("brightness").toDouble(), 0.2);
        QCOMPARE(effects[2].toObject().value("radius").toDouble(), 5.);
        clip.mediaType = nt::MediaType::Group;
        decorateEffects(ext, clip, {timeline, nullptr, 500, 500, 30, 15});
        QCOMPARE(ext.value("clipEffects").toArray().size(), 1);
        QCOMPARE(ext.value("clipEffects").toArray()[0].toObject().value("brightness").toDouble(), 0.);
    }
    void steppedVisualTime() {
        nt::Timeline timeline;
        nt::Clip clip; clip.startMs = 200; clip.durationMs = 1500;
        clip.raw.insert("steppedTime", QJsonObject{{"fps", 4}});
        clip.raw.insert("effects", QJsonArray{
            QJsonObject{{"type", "stylize"}, {"mode", "turbulence"}, {"enabled", true}, {"animate", true}},
            QJsonObject{{"type", "generator"}, {"mode", "fractal"}, {"enabled", true}, {"animate", true}},
            QJsonObject{{"type", "grain"}, {"enabled", true}, {"animate", true}}});
        QJsonObject ext;
        decorateEffects(ext, clip, {timeline, nullptr, 700, 735.9, 24, 17});
        const auto effects = ext.value("clipEffects").toArray();
        QCOMPARE(effects[0].toObject().value("time").toDouble(), 0.7);
        QCOMPARE(effects[1].toObject().value("time").toDouble(), 0.7);
        QCOMPARE(effects[2].toObject().value("seed").toDouble(), 17.);
        clip.mediaType = nt::MediaType::Group;
        decorateEffects(ext, clip, {timeline, nullptr, 735.9, 735.9, 24, 17});
        QCOMPARE(ext.value("clipEffects").toArray()[0].toObject().value("time").toDouble(), 0.7359);
    }
    void hugeBlurRadii() {
        for (const auto *value : {"1e9", "1e300", "1e308"}) {
            const auto raw = QJsonDocument::fromJson(QByteArray("{\"radius\":") + value + ",\"blur\":" + value + "}").object();
            for (const auto *type : {"blur", "glow", "dropShadow", "directionalBlur"}) {
                auto e = raw; e.insert("type", type); e.insert("enabled", true);
                const auto chain = planChain({e});
                QVERIFY(!chain.empty());
                for (const auto &pass : chain) {
                    if (pass.op == Op::Gaussian) {
                        QVERIFY(std::isfinite(pass.params[0]));
                        QVERIFY(pass.params[0] >= 0 && pass.params[0] <= 256);
                    }
                }
                const auto outset = chainOutset({e});
                QVERIFY(outset.left() >= 0);
            }
        }
    }
    void exposureTrackChain() {
        nt::Track track;
        track.raw={{"effects",QJsonArray{QJsonObject{{"id","e"},{"type","colorCorrection"},{"enabled",true},
            {"exposure",1.5},{"rolloff",0.7},{"whites",-0.5},{"brightness",0.1}}}}};
        QJsonObject ext;
        decorateTrackEffects(ext,&track);
        const auto chain=planChain({effect("posterize")},ext["trackEffects"].toArray());
        QCOMPARE(chain.size(),size_t{3});
        QCOMPARE(chain[0].op,Op::Posterize); QCOMPARE(chain[1].op,Op::Exposure); QCOMPARE(chain[2].op,Op::Grade);
        QCOMPARE(chain[1].params[0],1.5f); QCOMPARE(chain[1].params[1],0.7f); QCOMPARE(chain[1].params[2],-0.5f);
    }
    void trackChain() {
        auto color = effect("color"); color.insert("brightness", 0.25); color.insert("contrast", 2);
        auto trackColor = color; trackColor.insert("brightness", 0.5); trackColor.insert("contrast", 3);
        auto blur = effect("blur"); blur.insert("radius", 180);
        auto sharpen = effect("sharpen"); sharpen.insert("amount", 0.8);
        auto vignette = effect("vignette"); vignette.insert("amount", 0.6);
        auto key = effect("chromaKey"); key.insert("tolerance", 0.2);
        auto disabled = sharpen; disabled.insert("enabled", false);
        auto ignored = sharpen; ignored.insert("amount", 4);
        const auto chain = planChain({effect("posterize"), color, blur, effect("sharpen")},
            {disabled, sharpen, ignored, vignette, key, trackColor, blur});
        QCOMPARE(chain.size(), size_t{8});
        QCOMPARE(chain[0].op, Op::ChromaKey);
        QCOMPARE(chain[1].op, Op::Posterize);
        QCOMPARE(chain[2].op, Op::Sharpen);
        QCOMPARE(chain[3].op, Op::Grade);
        QCOMPARE(chain[3].params[0], 0.75f);
        QCOMPARE(chain[3].params[1], 4.f);
        QCOMPARE(chain[4].op, Op::Gaussian);
        QCOMPARE(chain[4].params[0], 256.f);
        QCOMPARE(chain[5].op, Op::Gaussian);
        QCOMPARE(chain[6].op, Op::Sharpen);
        QCOMPARE(chain[6].params[0], 0.8f);
        QCOMPARE(chain[7].op, Op::Vignette);
        QCOMPARE(chain[7].params[0], 0.6f);
        auto zero = sharpen; zero.insert("amount", 0);
        QVERIFY(planChain({}, {zero, ignored}).empty());
        auto cancelled = color; cancelled.insert("brightness", -0.25); cancelled.insert("contrast", 0.5);
        QVERIFY(planChain({color}, {cancelled}).empty());
        QJsonArray many;
        for (int i = 0; i < 10000; ++i) {
            many.append(color);
            many.append(sharpen);
        }
        const auto large = planChain({}, many);
        QCOMPARE(large.size(), size_t{2});
        QCOMPARE(large[0].op, Op::Grade);
        QCOMPARE(large[0].params[0], 1.f);
        QCOMPARE(large[1].op, Op::Sharpen);
        QCOMPARE(large[1].params[0], 0.8f);
    }
    void cube() {
        QCOMPARE(cubeHalfBits(0.f), std::uint16_t{0});
        QCOMPARE(cubeHalfBits(1.f), std::uint16_t{0x3c00});
        QCOMPARE(cubeHalfBits(1.f + 1.f / 2048), std::uint16_t{0x3c01});
        QCOMPARE(cubeHalfBits(-1.f), std::uint16_t{0xbc00});
        QCOMPARE(cubeHalfBits(1e10f), std::uint16_t{0x7bff});
        QString text = "TITLE test\n# red-fastest\nLUT_3D_SIZE 2\nDOMAIN_MIN -1 0 0\nDOMAIN_MAX 1 1 2\n";
        for (int b = 0; b < 2; ++b) {
            for (int g = 0; g < 2; ++g) {
                for (int r = 0; r < 2; ++r) {
                    text += QString("%1 %2 %3\n").arg(r).arg(g).arg(b);
                }
            }
        }
        const auto lut = parseCube(text);
        QVERIFY(lut);
        QCOMPARE(lut->size, 2);
        QCOMPARE(lut->rgb.size(), size_t{24});
        QCOMPARE(lut->minimum[0], -1.f);
        QCOMPARE(lut->maximum[2], 2.f);
        QCOMPARE(lut->rgb[3], 1.f);
        QCOMPARE(lut->rgb[4], 0.f);
        QCOMPARE(lut->rgb[14], 1.f);
        QVERIFY(!parseCube(text + "1 1 1\n"));
        QVERIFY(!parseCube("LUT_3D_SIZE 65\n"));
        QVERIFY(!parseCube("LUT_1D_SIZE 2\n"));
        QVERIFY(!parseCube(QString(text).replace("DOMAIN_MAX 1 1 2", "DOMAIN_MAX -1 1 2")));
        QVERIFY(!parseCube(QString(text).replace("0 0 0\n", "nan 0 0\n")));
    }
    void curves() {
        const auto identity = fitCurve(points({{0, 0}, {1, 1}}));
        QVERIFY(std::abs(identity.midtones) < 1e-12);
        QVERIFY(std::abs(identity.shadows) < 1e-12);
        const auto remap = fitCurve(points({{1, 1}, {0.2, 0}, {0.8, 1}, {0, 0}}));
        QCOMPARE(remap.black, 0.2);
        QCOMPARE(remap.white, 0.8);
        QVERIFY(channelMidtones(points({{0, 0}, {0.5, 0.75}, {1, 1}})) > 1);
        QCOMPARE(fitCurve({}).white, 1.0);
    }
    void orderAndAggregation() {
        auto a = effect("color");
        a.insert("brightness", 0.25);
        a.insert("contrast", 2);
        auto b = a;
        b.insert("brightness", 0.5);
        auto blur = effect("blur");
        blur.insert("radius", 180);
        auto pixel = effect("pixelate");
        pixel.insert("cellSize", 42);
        auto poster = effect("posterize");
        poster.insert("levels", 3);
        auto disabled = effect("lensDistortion");
        disabled.insert("enabled", false);
        const auto chain = planChain({a, blur, pixel, b, poster, disabled, blur});
        QCOMPARE(chain.size(), size_t{5});
        QCOMPARE(chain[0].op, Op::Pixelate);
        QCOMPARE(chain[0].params[0], 42.f);
        QCOMPARE(chain[1].op, Op::Posterize);
        QCOMPARE(chain[2].op, Op::Grade);
        QCOMPARE(chain[2].params[0], 0.75f);
        QCOMPARE(chain[2].params[1], 4.f);
        QCOMPARE(chain[3].op, Op::Gaussian);
        QCOMPARE(chain[3].params[0], 256.f);
        QCOMPARE(chain[3].params[2], 1.f);
        QCOMPARE(chain[4].params[3], 1.f);
        QVERIFY(planChain({effect("color"), disabled}).empty());
    }
    void parameters_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<int>("op");
        for (const auto &[type, op] :
             std::initializer_list<std::pair<const char *, Op>>{{"pixelate", Op::Pixelate},
                                                                {"posterize", Op::Posterize},
                                                                {"directionalBlur", Op::Gaussian},
                                                                {"lensDistortion", Op::Spherize},
                                                                {"vignette", Op::Vignette},
                                                                {"sharpen", Op::Gaussian},
                                                                {"chromaKey", Op::ChromaKey},
                                                                {"curves", Op::Curves},
                                                                {"levels", Op::Levels},
                                                                {"liftGammaGain", Op::LiftGammaGain},
                                                                {"grain", Op::Grain},
                                                                {"lut", Op::Lut},
                                                                {"glow", Op::Threshold},
                                                                {"dropShadow", Op::AlphaMask}}) {
            QTest::newRow(type) << QString(type) << int(op);
        }
    }
    void parameters() {
        QFETCH(QString, type);
        QFETCH(int, op);
        QJsonObject e{{"type", type}, {"enabled", true}, {"radius", 24},    {"angle", 90},    {"amount", 0.8},
                      {"seed", 123},  {"animate", true}, {"outBlack", 0.1}, {"outWhite", 0.8}};
        const auto chain = planChain({e});
        QVERIFY(!chain.empty());
        QCOMPARE(int(chain[0].op), op);
        const auto &v = type == "sharpen" ? chain.back().params : chain[0].params;
        if (type == "pixelate") {
            QCOMPARE(v[0], 8.f);
        }
        if (type == "posterize") {
            QCOMPARE(v[0], 4.f);
        }
        if (type == "lensDistortion") {
            QCOMPARE(v[0], 0.8f);
        }
        if (type == "vignette") {
            QCOMPARE(v[0], 0.8f);
            QCOMPARE(v[1], 24.f);
            QCOMPARE(v[2], 0.5f);
        }
        if (type == "sharpen") {
            QCOMPARE(chain.size(),size_t{3});
            QVERIFY(chain[0].rememberSource); QVERIFY(!chain[1].rememberSource);
            QCOMPARE(chain.back().op,Op::SharpenCombine);
            QCOMPARE(chain[0].params[0],24.f);
            QCOMPARE(v[0], 0.8f);
            QCOMPARE(v[1], 0.f);
        }
        if (type == "chromaKey") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[4], 0.1f);
            QCOMPARE(v[5], 0.5f);
        }
        if (type == "curves") {
            QCOMPARE(chain[0].curve,e);
            const auto table=curveTransfer(chain[0].curve);
            QCOMPARE(table[0],0.f); QCOMPARE(table[255*4],1.f);
            QCOMPARE(table[64*4+1],64.f/255);
        }
        if (type == "levels") {
            QCOMPARE(v[1], 1.f);
            QCOMPARE(v[2], 1.f);
            QCOMPARE(chain[1].params[0], 0.7f);
        }
        if (type == "liftGammaGain") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[4], 1.f);
            QCOMPARE(v[8], 1.f);
        }
        if (type == "lut") {
            QCOMPARE(v[0], 1.f);
        }
        if (type == "glow") {
            QCOMPARE(v[0], 0.7f);
            QCOMPARE(chain[1].params[0], 24.f);
            QCOMPARE(chain[3].op, Op::Add);
        }
        if (type == "dropShadow") {
            QCOMPARE(chain[1].params[0], 0.f);
            QCOMPARE(chain[3].op, Op::Shadow);
        }
        if (type == "grain") {
            QCOMPARE(chain[0].params[3], 123.f);
        }
        if (type == "directionalBlur") {
            QVERIFY(std::abs(chain[0].params[2]) < 1e-6);
            QCOMPARE(chain[0].params[3], 1.f);
        }
        if (type == "levels") {
            QCOMPARE(chain.size(), size_t{2});
            QCOMPARE(chain[1].op, Op::Cdl);
        }
        if (type == "glow" || type == "dropShadow") {
            QCOMPARE(chain.size(), size_t{4});
        }
    }
    void visualFxModes() {
        const std::array stylize{"rgbSplit", "radialBlur", "zoomBlur", "turbulence", "glitch", "halftone",
                                 "dither", "lightRays", "lensFlare", "innerShadow", "innerGlow", "edgeHighlight",
                                 "displacement", "gradientWipe", "lightLeakOverlay"};
        const std::array generator{"noise", "fractal", "conicGradient", "meshGradient", "gradientField",
                                   "particles", "lightLeak", "gridPattern"};
        for (int mode = 0; mode < 23; ++mode) {
            const bool generated = mode >= 15;
            auto e = effect(generated ? "generator" : "stylize");
            e.insert("mode", generated ? generator[mode - 15] : stylize[mode]);
            const auto chain = planChain({effect("posterize"), e, effect("pixelate")});
            QCOMPARE(chain.size(), size_t{3});
            QCOMPARE(int(chain[1].op), 21);
            const auto &p = chain[1].params;
            QCOMPARE(p[0], float(mode));
            QCOMPARE(p[1], generated ? 1.f : 0.5f);
            QCOMPARE(p[2], 8.f);
            QCOMPARE(p[3], 0.f);
            QCOMPARE(p[4], 0.f);
            QCOMPARE(p[5], 0.f);
            QCOMPARE(p[6], 0.1f);
            QCOMPARE(p[8], generated ? 16.f / 255 : 0.f);
            QCOMPARE(p[12], 1.f);
            QCOMPARE(p[13], generated ? 180.f / 255 : 1.f);
            QCOMPARE(p[15], 1.f);
            QCOMPARE(chainOutset({e}), QMargins());
            e.insert("amount", 27);
            e.insert("angle", 90);
            e.insert("time", 1.25);
            e.insert("seed", -4);
            e.insert("scale", 13);
            e.insert("color", "#204080");
            e.insert("colorA", "#204080");
            e.insert("colorB", "invalid");
            const auto configured = planChain({e});
            QCOMPARE(configured[0].params[1], 27.f);
            QVERIFY(std::abs(configured[0].params[3] - (std::numbers::pi_v<float> / 2)) < 1e-6);
            QCOMPARE(configured[0].params[4], 1.25f);
            QCOMPARE(configured[0].params[5], -4.f);
            QCOMPARE(configured[0].params[2], 13.f);
            QCOMPARE(configured[0].params[generated ? 8 : 12], 32.f / 255);
            if (generated) { QCOMPARE(configured[0].params[12], 0.f); }
            e.insert("mode", "unknown");
            QVERIFY(planChain({e}).empty());
        }
    }
    void marginAndCrop() {
        auto glow = effect("glow");
        glow.insert("radius", 10.2);
        auto shadow = effect("dropShadow");
        shadow.insert("blur", 8);
        shadow.insert("offsetX", -16);
        const auto margin = chainOutset({glow, shadow});
        QCOMPARE(margin, QMargins(71, 71, 71, 71));
        shadow.insert("enabled", false);
        QCOMPARE(chainOutset({shadow}), QMargins());
        const QJsonObject ext{{"effectSourceRect", QJsonArray{0.251, 0.2, 0.5, 0.5}}};
        QCOMPARE(cropPixels(ext, {100, 80}), QRect(25, 16, 50, 40));
        QCOMPARE(cropPixels({}, {100, 80}), QRect(0, 0, 100, 80));
        QCOMPARE(cropPixels({{"effectSourceRect", QJsonArray{0.259, 0.209, 0.5, 0.5}}}, {100, 80}),
                 QRect(25, 16, 50, 40));
    }
    void cropPixelOriginsSurviveFloatStorage() {
        // cropRectPx resolves integral pixels before sourceRect stores normalized floats.
        for (const auto size : {QSize(101, 99), QSize(1921, 1081)}) {
            for (int origin = 1; origin < size.width() / 2; ++origin) {
                const int y = std::min(origin, size.height() / 3);
                const QJsonObject ext{{"effectSourceRect", QJsonArray{
                    double(float(origin) / size.width()), double(float(y) / size.height()),
                    double(float(size.width() - origin) / size.width()),
                    double(float(size.height() - y) / size.height())}}};
                QCOMPARE(cropPixels(ext, size), QRect(origin, y, size.width() - origin, size.height() - y));
            }
        }
    }
    void animatedVisualTime() {
        nt::Clip clip;
        auto animated = effect("stylize");
        animated.insert("mode", "turbulence");
        animated.insert("animate", true);
        animated.insert("time", 17);
        auto generator = animated;
        generator.insert("type", "generator");
        generator.insert("mode", "fractal");
        auto fixed = animated;
        fixed.insert("animate", false);
        clip.raw.insert("effects", QJsonArray{animated, generator, fixed});
        for (double time : {0.0, 735.0, 4200.0}) {
            QJsonObject ext;
            decorateEffects(ext, clip, time);
            const auto copied = ext.value("clipEffects").toArray();
            QCOMPARE(copied[0].toObject().value("time").toDouble(), time / 1000);
            QCOMPARE(copied[1].toObject().value("time").toDouble(), time / 1000);
            QCOMPARE(copied[2].toObject().value("time").toDouble(), 17.0);
        }
        QCOMPARE(clip.raw.value("effects").toArray()[0].toObject().value("time").toInt(), 17);
    }
    void decorator() {
        nt::Clip clip;
        auto e = effect("grain");
        e.insert("seed", 19);
        e.insert("animate", true);
        auto disabled = e;
        disabled.insert("enabled", false);
        clip.raw.insert("effects", QJsonArray{e, disabled});
        QJsonObject ext;
        decorateEffects(ext, clip);
        const auto copied = ext.value("clipEffects").toArray();
        QCOMPARE(copied.size(), 1);
        QCOMPARE(copied[0].toObject().value("seed").toInt(), 19);
    }
};
QTEST_GUILESS_MAIN(TestEffectPlan)
#include "tst_effectplan.moc"
