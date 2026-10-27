#include "preview/effects/ClipEffects.h"
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
                                                                {"sharpen", Op::Sharpen},
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
        const auto &v = chain[0].params;
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
            QCOMPARE(v[0], 0.8f);
            QCOMPARE(v[1], 0.f);
        }
        if (type == "chromaKey") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[4], 0.1f);
            QCOMPARE(v[5], 0.5f);
        }
        if (type == "curves") {
            QCOMPARE(v[0], 0.f);
            QCOMPARE(v[1], 1.f);
            QCOMPARE(v[3], 0.f);
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
