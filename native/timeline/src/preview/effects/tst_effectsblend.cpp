#include "preview/compose/ComposeRegistry.h"
#include "preview/effects/ClipEffects.h"
#include "preview/layers/SceneHooks.h"
#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <array>
#include <QScopeGuard>

namespace {
struct Sample {
    const char* mode;
    QColor opaque, faded, transparentBackdrop;
    QColor foldedOpaque, foldedFaded, foldedTransparentBackdrop;
};
// Export oracle: packages/gpu/src/blend/wgsl.ts and compositor/shaders.ts
// fs_blend, with Cs=(192,64,128)/255 and Cd=(128,192,64)/255.
// Over transparency: P=as*(1-ad)*Cs+as*ad*B(Cs,Cd)+(1-as)*ad*Cd.
// A surface resolves to straight RGB, then its opacity scales P once when
// composited over the opaque black canvas (frameCompositor.ts).
// An opacity-only group instead folds 0.8 into each child (sceneModel.ts):
// the bottom over black is D=ad*Cd with alpha 1, then
// P=as*B(Cs,D)+(1-as)*D. Folded columns use (ad,as)=(.8,.8),
// (.8,.4), (.4,.4). Add uses min(1,as*Cs+ad*Cd), including additive alpha.
// Byte rounding here and in intermediate textures is covered by near().
const std::array<Sample, 12> samples{{
    {"multiply", {96,48,32}, {112,120,48}, {104,76,56}, {82,62,31}, {92,108,41}, {46,54,21}},
    {"screen", {224,208,160}, {176,200,112}, {136,116,88}, {194,174,133}, {148,164,92}, {113,95,72}},
    {"overlay", {192,161,64}, {160,176,64}, {128,104,64}, {144,113,51}, {123,133,51}, {62,62,26}},
    {"darken", {128,64,64}, {128,128,64}, {112,80,64}, {102,82,51}, {102,118,51}, {51,72,26}},
    {"lighten", {192,192,128}, {160,192,96}, {128,112,80}, {174,154,113}, {138,154,82}, {108,77,67}},
    {"color-dodge", {255,255,129}, {192,224,96}, {144,128,80}, {224,195,92}, {163,174,72}, {114,87,36}},
    {"color-burn", {86,4,0}, {107,98,32}, {102,65,48}, {62,31,10}, {82,92,31}, {31,46,15}},
    {"hard-light", {192,96,65}, {160,144,64}, {128,88,64}, {164,92,52}, {133,123,52}, {92,62,26}},
    {"soft-light", {155,168,64}, {141,180,64}, {119,106,64}, {126,129,51}, {114,141,51}, {64,66,26}},
    {"difference", {64,128,64}, {96,160,64}, {96,96,64}, {92,102,72}, {97,128,61}, {87,51,56}},
    {"exclusion", {127,160,128}, {128,176,96}, {112,104,80}, {133,143,112}, {118,148,82}, {97,87,67}},
    {"add", {255,255,192}, {224,224,128}, {160,128,96}, {255,205,154}, {179,179,102}, {128,102,77}}
}};

nt::Timeline document(const QString& mode, int placement, double opacity) {
    QJsonObject a{{"id","a"},{"trackId","v"},{"mediaType","shape"},{"startMs",0},
        {"durationMs",1000},{"width",64},{"height",32},{"shapeStyle",QJsonObject{{"kind","rect"}}}};
    auto b = a;
    b.insert("id","b");
    b.insert("transform", QJsonObject{{"scale",QJsonObject{{"x",0.75},{"y",0.75}}}});
    b.insert("opacity",opacity);
    b.insert("blendMode",mode);
    QJsonArray clips;
    if (placement == 1) {
        // The export stacks the surface at the group's own position, so a
        // group before the opaque backdrop would be drawn and then hidden.
        b.insert("parentId","g");
        b.insert("blendMode","normal");
        b.insert("opacity",1);
        clips.append(QJsonObject{{"id","g"},{"trackId","v"},{"mediaType","group"},
            {"startMs",0},{"durationMs",1000},{"blendMode",mode},{"opacity",opacity}});
    } else if (placement >= 2) {
        a.insert("parentId","g");
        b.insert("parentId","g");
        if (placement == 3 || placement == 5) { a.insert("opacity",0.5); }
        QJsonObject group{{"id","g"},{"trackId","v"},{"mediaType","group"},
            {"startMs",0},{"durationMs",1000},{"opacity",0.8}};
        if (placement <= 3) {
            // Export groupNeedsPrecomposite requires a blend, enabled effect,
            // adjustment or transition. Opacity alone folds into the children.
            // An enabled identity color effect forces a surface without
            // changing pixels in either the export or this blend-only test.
            group.insert("effects",QJsonArray{QJsonObject{{"id","identity"},
                {"type","color"},{"enabled",true},{"brightness",0}}});
        }
        clips.append(group);
    }
    if (placement == 1) { clips.insert(0,a); }
    else { clips.append(a); }
    clips.append(b);
    const QJsonObject raw{{"fps",30},{"width",64},{"height",32},{"durationMs",1000},
        {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}},{"clips",clips}};
    return *nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline;
}
QImage effectStill(const QJsonArray& effects, const QImage& source, bool group=false,
                   const QJsonObject& crop={}, double scale=1) {
    const auto token=nt::registerLayerSource("shape",[source](const nt::ActiveLayer&) {
        return std::make_unique<nt::test::PaintSource>(source);
    });
    const auto registration=qScopeGuard([token] { nt::unregisterLayerSource(token); });
    QJsonObject leaf{{"id","source"},{"trackId","v"},{"mediaType","shape"},{"startMs",0},{"durationMs",1000},
        {"width",source.width()},{"height",source.height()},{"shapeStyle",QJsonObject{{"kind","rect"}}}};
    if (!crop.isEmpty()) { leaf.insert("crop",crop); }
    if (scale!=1) { leaf.insert("transform",QJsonObject{{"scale",QJsonObject{{"x",scale},{"y",scale}}}}); }
    QJsonArray clips;
    if (group) {
        clips.append(QJsonObject{{"id","group"},{"trackId","v"},{"mediaType","group"},{"startMs",0},
            {"durationMs",1000},{"effects",effects},{"opacity",0.8}});
        leaf.insert("parentId","group"); leaf.insert("opacity",0.5);
    } else { leaf.insert("effects",effects); }
    clips.append(leaf);
    const QJsonObject raw{{"fps",30},{"width",source.width()},{"height",source.height()},{"durationMs",1000},
        {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}},{"clips",clips}};
    const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) { return {}; }
    TimelineModel model; model.setTimeline(*parsed.timeline);
    nt::test::Still still;
    return still.initialize(model) ? still.capture() : QImage{};
}
QJsonObject effect(const char* type, QJsonObject values={}) {
    values.insert("id",QString::fromLatin1(type)); values.insert("type",QString::fromLatin1(type)); values.insert("enabled",true);
    return values;
}

QImage matteStill(const QString &mode, bool invert, double strength=1, double feather=0) {
    const auto sourceToken=nt::registerLayerSource("shape",[](const nt::ActiveLayer &layer) {
        QImage image(64,32,QImage::Format_RGBA8888_Premultiplied);
        image.fill(layer.clipId=="background" ? QColor(32,64,96) : QColor(192,128,64));
        if (layer.clipId=="keyhole") {
            image.fill(Qt::transparent);
            for (int y=0;y<32;++y) { for (int x=0;x<32;++x) { image.setPixelColor(x,y,QColor(128,128,128,128)); } }
        }
        return std::make_unique<nt::test::PaintSource>(std::move(image));
    });
    const auto sourceGuard=qScopeGuard([sourceToken] { nt::unregisterLayerSource(sourceToken); });
    // Track documents do not carry these options on the web. Exercise the S4
    // contract directly, including feathering the keyhole rather than picture.
    const auto hook=nt::registerLayerDecorator([strength,feather](nt::ActiveLayer &layer,const nt::Clip &,double) {
        if (layer.matte) { layer.matte->strength=strength; layer.matte->featherPx=feather; }
    });
    const auto hookGuard=qScopeGuard([hook] { nt::unregisterSceneHook(hook); });
    const auto leaf=[](const char *id,const char *track) { return QJsonObject{{"id",id},{"trackId",track},{"mediaType","shape"},
        {"startMs",0},{"durationMs",1000},{"width",64},{"height",32},{"shapeStyle",QJsonObject{{"kind","rect"}}}}; };
    auto keyhole=leaf("keyhole","top"); keyhole.insert("hidden",true); keyhole.insert("opacity",0.5);
    auto picture=leaf("picture","top"); picture.insert("opacity",0.5); picture.insert("blendMode","screen");
    picture.insert("matte",QJsonObject{{"sourceClipId","keyhole"},{"mode",mode},{"invert",invert}});
    const QJsonObject raw{{"fps",30},{"width",64},{"height",32},{"durationMs",1000},
        {"tracks",QJsonArray{QJsonObject{{"id","top"},{"type","video"},{"index",0}},QJsonObject{{"id","bottom"},{"type","video"},{"index",1}}}},
        {"clips",QJsonArray{leaf("background","bottom"),keyhole,picture}}};
    const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
    if (!parsed.timeline) { return {}; }
    TimelineModel model; model.setTimeline(*parsed.timeline); nt::test::Still still;
    return still.initialize(model) ? still.capture() : QImage{};
}

}

class TestEffectsBlend : public QObject {
    Q_OBJECT
private slots:
    void registeredModes() {
        const auto handlers = nt::registeredBlendHandlers();
        QCOMPARE(handlers.size(),samples.size());
        for (const auto& sample : samples) { QVERIFY2(handlers.contains(sample.mode),sample.mode); }
        QVERIFY(!handlers.contains("normal"));
    }
    void documents_data() {
        QTest::addColumn<int>("placement");
        for (int placement = 0; placement < 6; ++placement) {
            QTest::newRow(qPrintable(QString::number(placement))) << placement;
        }
    }
    void documents() {
        QFETCH(int,placement);
        const auto frame = nt::evaluateScene(document("multiply",placement,0.5),0);
        QCOMPARE(frame.layers.size(),size_t{2});
        const bool surface = placement >= 1 && placement <= 3;
        QCOMPARE(frame.precomposites.size(),surface ? size_t{1} : size_t{0});
        const auto& a = frame.layers[0];
        const auto& b = frame.layers[1];
        QCOMPARE(a.clipId,std::string("a"));
        QCOMPARE(b.clipId,std::string("b"));
        QCOMPARE(b.sourceWidth,64);
        QCOMPARE(b.sourceHeight,32);
        const double folded = placement >= 4 ? 0.8 : 1;
        const bool translucent = placement == 3 || placement == 5;
        QCOMPARE(a.opacity,(translucent ? 0.5 : 1)*folded);
        QCOMPARE(b.opacity,(placement == 1 ? 1 : 0.5)*folded);
        QCOMPARE(a.precomposeGroupId,std::string(placement == 2 || placement == 3 ? "g" : ""));
        QCOMPARE(b.precomposeGroupId,std::string(surface ? "g" : ""));
        if (surface) {
            const auto& group = frame.precomposites[0];
            QCOMPARE(group.opacity,placement == 1 ? 0.5 : 0.8);
            QCOMPARE(group.blendMode,std::string(placement == 1 ? "multiply" : "normal"));
            QCOMPARE(group.children.size(),placement == 1 ? size_t{1} : size_t{2});
            if (placement == 1) {
                QVERIFY(group.stackOrder.has_value());
                QVERIFY(a.stackOrder.has_value());
                QVERIFY(*group.stackOrder > *a.stackOrder);
            }
        }
    }
    void trackDocuments() {
        for (const auto type : {"colorCorrection", "videoBlur", "sharpen", "vignette", "chromaKey"}) {
            auto timeline = document("normal", 2, 1);
            auto active = effect(type, {{"brightness", 0.3}, {"radius", 18}, {"amount", 1.5},
                {"intensity", 0.8}, {"keyColor", "#c02040"}, {"tolerance", 0.15}});
            auto disabled = active;
            disabled.insert("enabled", false);
            timeline.tracks[0].raw.insert("effects", QJsonArray{disabled, effect("gain"), active});
            const auto frame = nt::evaluateScene(timeline, 500);
            QCOMPARE(frame.layers.size(), size_t{2});
            QCOMPARE(frame.precomposites.size(), size_t{1});
            auto stages = nt::registeredEffectStages();
            for (const auto &layer : frame.layers) {
                const auto converted = layer.ext.value("trackEffects").toArray();
                QCOMPARE(converted.size(), 1);
                const auto e = converted[0].toObject();
                const QString expected = QString(type) == "colorCorrection" ? "color" :
                    QString(type) == "videoBlur" ? "blur" : type;
                QCOMPARE(e.value("type").toString(), expected);
                if (QString(type) == "vignette") { QCOMPARE(e.value("amount").toDouble(), 0.8); }
                if (QString(type) == "chromaKey") { QCOMPARE(e.value("color").toString(), QString("#c02040")); }
                QVERIFY(stages[1]->applies(layer.ext));
            }
            QVERIFY(frame.precomposites[0].ext.value("trackEffects").toArray().isEmpty());
        }
    }
    void clipDocuments() {
        auto raw=QJsonObject{{"fps",30},{"width",64},{"height",32},{"durationMs",1000},
            {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}},
            {"clips",QJsonArray{
                QJsonObject{{"id","g"},{"trackId","v"},{"mediaType","group"},{"startMs",0},{"durationMs",1000},
                    {"effects",QJsonArray{effect("blur",{{"radius",8}}),
                        effect("generator",{{"mode","fractal"},{"animate",true},{"time",17}})}}},
                QJsonObject{{"id","a"},{"trackId","v"},{"mediaType","shape"},{"parentId","g"},{"startMs",0},{"durationMs",1000},
                    {"width",64},{"height",32},{"shapeStyle",QJsonObject{{"kind","rect"}}},{"crop",QJsonObject{{"left",0.25},{"right",0.25},{"top",0},{"bottom",0}}},
                    {"effects",QJsonArray{effect("grain",{{"seed",27},{"animate",true}}),
                        effect("stylize",{{"mode","glitch"},{"animate",true},{"time",17}}),
                        QJsonObject{{"id","disabled"},{"type","vignette"},{"enabled",false}}}}}}}};
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        const auto frame=nt::evaluateScene(*parsed.timeline,500);
        QCOMPARE(frame.layers.size(),size_t{1}); QCOMPARE(frame.precomposites.size(),size_t{1});
        const auto& layer=frame.layers[0];
        QCOMPARE(layer.sourceRect,(std::array<float,4>{0.25f,0,0.5f,1}));
        QCOMPARE(layer.ext.value("effectSourceRect").toArray(),(QJsonArray{0.25,0,0.5,1}));
        const auto copied=layer.ext.value("clipEffects").toArray(); QCOMPARE(copied.size(),2);
        QCOMPARE(copied[0].toObject().value("seed").toInt(),15);
        QCOMPARE(copied[1].toObject().value("time").toDouble(),0.5);
        const auto& group=frame.precomposites[0];
        QVERIFY(group.ext.value("effectGroupSurface").toBool());
        QCOMPARE(group.ext.value("clipEffects").toArray().size(),2);
        QCOMPARE(group.ext.value("clipEffects").toArray()[1].toObject().value("time").toDouble(),0.5);
        auto stages=nt::registeredEffectStages(); QVERIFY(!stages.empty());
        QVERIFY(stages[1]->applies(layer.ext)); QVERIFY(stages[1]->applies(group.ext));
        QVERIFY(!stages[0]->applies({}));
    }
    void animatedGrain_data() {
        QTest::addColumn<double>("fps");
        QTest::addColumn<double>("timeMs");
        QTest::addColumn<int>("seed");
        QTest::newRow("24-first") << 24.0 << 735.9 << 17;
        QTest::newRow("24-next") << 24.0 << 775.9 << 18;
        QTest::newRow("24-same-frame") << 24.0 << 740.0 << 17;
        QTest::newRow("fractional-fps") << 23.976 << 1000.0 << 23;
        QTest::newRow("missing-fps-first") << 0.0 << 735.9 << 22;
        QTest::newRow("missing-fps-next") << 0.0 << 775.9 << 23;
    }
    void animatedGrain() {
        QFETCH(double, fps);
        QFETCH(double, timeMs);
        QFETCH(int, seed);
        const QJsonArray effects{effect("grain", {{"amount", 1}, {"seed", 101}, {"animate", true}}),
            effect("grain", {{"amount", 1}, {"seed", -7}, {"animate", false}}),
            effect("grain", {{"amount", 1}, {"seed", 81}}),
            QJsonObject{{"type", "grain"}, {"enabled", false}, {"seed", 19}, {"animate", true}}};
        const QJsonObject group{{"id", "g"}, {"trackId", "v"}, {"mediaType", "group"},
            {"startMs", 100}, {"durationMs", 2000}, {"effects", effects}};
        const QJsonObject leaf{{"id", "a"}, {"trackId", "v"}, {"mediaType", "shape"},
            {"parentId", "g"}, {"startMs", 200}, {"durationMs", 1500},
            {"width", 64}, {"height", 32}, {"shapeStyle", QJsonObject{{"kind", "rect"}}},
            {"inPointMs", 900}, {"speedMultiplier", 2}, {"steppedTime", QJsonObject{{"fps", 4}}},
            {"temporalEcho", QJsonObject{{"copies", 1}, {"intervalMs", 100}, {"opacityDecay", 0.5}}},
            {"effects", effects}};
        QJsonObject raw{{"width", 64}, {"height", 32}, {"durationMs", 3000},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{group, leaf}}};
        if (fps > 0) { raw.insert("fps", fps); }
        const auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        QCOMPARE(parsed.timeline->fps, fps > 0 ? fps : 30.0);
        const auto frame = nt::evaluateScene(*parsed.timeline, timeMs);
        QCOMPARE(frame.layers.size(), size_t{2});
        QCOMPARE(frame.precomposites.size(), size_t{1});
        const auto checkSeeds = [&](const QJsonObject &ext) {
            const auto copied = ext.value("clipEffects").toArray();
            QCOMPARE(copied.size(), 3);
            QCOMPARE(copied[0].toObject().value("seed").toInt(), seed);
            QCOMPARE(copied[1].toObject().value("seed").toInt(), -7);
            QCOMPARE(copied[2].toObject().value("seed").toInt(), 81);
            const auto passes = nt::effects::planChain(copied);
            QCOMPARE(passes.size(), size_t{3});
            QCOMPARE(passes[0].op, nt::effects::Op::Grain);
            QCOMPARE(passes[0].params[3], static_cast<float>(seed));
        };
        for (const auto &layer : frame.layers) { checkSeeds(layer.ext); }
        for (const auto &surface : frame.precomposites) { checkSeeds(surface.ext); }
        for (const auto &clip : parsed.timeline->clips) { QCOMPARE(clip.raw.value("effects").toArray(), effects); }
    }
    void mattePixels_data() {
        QTest::addColumn<QString>("mode"); QTest::addColumn<bool>("invert");
        for (const auto mode : {"alpha","luma"}) { for (const bool invert : {false,true}) {
            QTest::newRow(qPrintable(QString("%1-%2").arg(mode).arg(invert))) << QString(mode) << invert;
        } }
    }
    void mattePixels() {
        QFETCH(QString,mode); QFETCH(bool,invert);
        const auto image=matteStill(mode,invert); QVERIFY(!image.isNull());
        const double coverage=mode=="alpha" ? 0.25 : 0.125;
        const auto expected=[](double coverage) {
            const double alpha=0.5*coverage;
            return QColor(qRound(32+alpha*192*(1-32./255)),qRound(64+alpha*128*(1-64./255)),qRound(96+alpha*64*(1-96./255)));
        };
        const auto near=[](QColor a,QColor b) { return std::abs(a.red()-b.red())<=2 && std::abs(a.green()-b.green())<=2 && std::abs(a.blue()-b.blue())<=2; };
        QVERIFY2(near(image.pixelColor(16,16),expected(invert ? 1-coverage : coverage)),qPrintable(image.pixelColor(16,16).name()));
        QVERIFY2(near(image.pixelColor(48,16),expected(invert ? 1 : 0)),qPrintable(image.pixelColor(48,16).name()));
    }
    void matteStrengthAndFeather() {
        const auto sharp=matteStill("alpha",false), weak=matteStill("alpha",false,0.5), soft=matteStill("alpha",false,1,9);
        QVERIFY(!sharp.isNull()); QVERIFY(!weak.isNull()); QVERIFY(!soft.isNull());
        QVERIFY(weak.pixelColor(16,16).red()<sharp.pixelColor(16,16).red());
        QVERIFY(std::abs(weak.pixelColor(16,16).red()-43)<=2);
        QCOMPARE(weak.pixelColor(48,16),QColor(32,64,96));
        QVERIFY(soft.pixelColor(32,16).red()>sharp.pixelColor(32,16).red());
        QVERIFY(soft.pixelColor(30,16).red()<sharp.pixelColor(30,16).red());
        QCOMPARE(soft.pixelColor(16,16),sharp.pixelColor(16,16));
    }
    void maskPixels() {
        QImage source(64,32,QImage::Format_RGBA8888_Premultiplied); source.fill(Qt::white);
        const auto token=nt::registerLayerDecorator([](nt::ActiveLayer &layer,const nt::Clip &,double) {
            layer.ext.insert("shapeMask",QJsonObject{{"kind","rect"},{"width",0.5}});
        });
        const auto guard=qScopeGuard([token] { nt::unregisterSceneHook(token); });
        const auto image=effectStill({effect("color",{{"brightness",-0.5}})},source);
        QVERIFY(!image.isNull()); QVERIFY(std::abs(image.pixelColor(16,16).red()-128)<=1);
        QCOMPARE(image.pixelColor(48,16),QColor(Qt::black));
    }
    void clipPixels() {
        QImage source(64,32,QImage::Format_RGBA8888_Premultiplied); source.fill(QColor(64,128,192));
        const auto grade=effectStill({effect("color",{{"brightness",0.2}})},source);
        QVERIFY(!grade.isNull());
        const auto c=grade.pixelColor(32,16);
        QVERIFY2(std::abs(c.red()-115)<=1,qPrintable(c.name(QColor::HexArgb))); QVERIFY(std::abs(c.green()-179)<=1); QVERIFY(std::abs(c.blue()-243)<=1);
        const auto levels=effectStill({effect("levels",{{"inBlack",0},{"inWhite",1},{"gamma",1},{"outBlack",0.2},{"outWhite",0.8}})},source);
        QVERIFY(!levels.isNull()); QVERIFY(std::abs(levels.pixelColor(32,16).red()-89)<=1);
        const auto key=effectStill({effect("chromaKey",{{"color","#4080c0"},{"tolerance",0.1},{"softness",0.1}})},source);
        QVERIFY(!key.isNull()); QCOMPARE(key.pixelColor(32,16),QColor(Qt::black));
        const auto poster=effectStill({effect("posterize",{{"levels",3}})},source);
        // clip-posterize-midpoint golden is identical to step 2 at byte 127.
        QVERIFY(!poster.isNull()); QCOMPARE(poster.pixelColor(32,16),QColor(0,127,255));
    }
    void cropPixelsOnClip() {
        QImage source(64,32,QImage::Format_RGBA8888_Premultiplied); source.fill(Qt::green);
        for (int y=0;y<32;++y) { for (int x=16;x<48;++x) { source.setPixelColor(x,y,Qt::red); } }
        const auto image=effectStill({effect("blur",{{"radius",12}}),effect("vignette",{{"amount",0.8},{"radius",1},{"softness",0.7}})},
            source,false,{{"left",0.25},{"right",0.25},{"top",0},{"bottom",0}});
        QVERIFY(!image.isNull()); const auto center=image.pixelColor(32,16);
        QVERIFY2(std::abs(center.red()-240)<=1,qPrintable(center.name(QColor::HexArgb))); QCOMPARE(center.green(),0);
        const auto edge=image.pixelColor(17,1); QVERIFY(edge.red()<80); QCOMPARE(edge.green(),0);
        QCOMPARE(image.pixelColor(1,16),QColor(Qt::black));
    }
    void spreadPixels() {
        QImage source(64,32,QImage::Format_RGBA8888_Premultiplied); source.fill(QColor(220,220,220));
        const auto glow=effectStill({effect("glow",{{"radius",10},{"intensity",1.5}})},source,false,{},0.5);
        QVERIFY(!glow.isNull()); QVERIFY2(glow.pixelColor(14,16).red()>10,qPrintable(glow.pixelColor(14,16).name(QColor::HexArgb)));
        const auto shadow=effectStill({effect("dropShadow",{{"offsetX",12},{"offsetY",0},{"blur",0},{"color","#ff0000"},{"opacity",1}})},source,false,{},0.5);
        QVERIFY(!shadow.isNull()); QVERIFY(shadow.pixelColor(51,16).red()>245); QCOMPARE(shadow.pixelColor(51,16).green(),0);
        QCOMPARE(shadow.pixelColor(10,16),QColor(Qt::black));
    }
    void groupEffectAlpha() {
        QImage source(64,32,QImage::Format_RGBA8888_Premultiplied); source.fill(QColor(64,128,192));
        const auto image=effectStill({effect("color",{{"brightness",0.2}})},source,true);
        QVERIFY(!image.isNull()); const auto c=image.pixelColor(32,16);
        QVERIFY2(std::abs(c.red()-46)<=2,qPrintable(c.name(QColor::HexArgb))); QVERIFY(std::abs(c.green()-72)<=2); QVERIFY(std::abs(c.blue()-97)<=2);
    }
    void blendPixels_data() {
        QTest::addColumn<QString>("mode");
        QTest::addColumn<int>("placement");
        QTest::addColumn<double>("opacity");
        QTest::addColumn<QColor>("expected");
        for (const auto& sample : samples) {
            for (int placement = 0; placement < 6; ++placement) {
                for (const double opacity : {1.0, 0.5}) {
                    if ((placement == 3 || placement == 5) && opacity == 1.0) { continue; }
                    // Placements 4/5 retain the original opacity-only documents.
                    // Their export math differs from the real surfaces in 2/3.
                    const auto value = placement == 3 ? sample.transparentBackdrop
                        : placement == 5 ? sample.foldedTransparentBackdrop
                        : placement == 4 ? (opacity == 1.0 ? sample.foldedOpaque : sample.foldedFaded)
                        : opacity == 1.0 ? sample.opaque : sample.faded;
                    const double groupOpacity = placement == 2 || placement == 3 ? 0.8 : 1.0;
                    const QColor expected(qRound(value.red()*groupOpacity), qRound(value.green()*groupOpacity),
                                          qRound(value.blue()*groupOpacity));
                    const auto name = QString("%1-placement%2-opacity%3").arg(sample.mode).arg(placement).arg(opacity);
                    QTest::newRow(qPrintable(name)) << QString::fromLatin1(sample.mode) << placement << opacity << expected;
                }
            }
        }
    }
    void blendPixels() {
        QFETCH(QString,mode);
        QFETCH(int,placement);
        QFETCH(double,opacity);
        QFETCH(QColor,expected);
        // The newest source registration wins. These solid pixels bypass
        // package I's raster shape source entirely.
        const auto token = nt::registerLayerSource("shape", [](const nt::ActiveLayer& layer) {
            QImage image(layer.sourceWidth,layer.sourceHeight,QImage::Format_RGBA8888_Premultiplied);
            image.fill(layer.clipId == "b" ? QColor(192,64,128) : QColor(128,192,64));
            return std::make_unique<nt::test::PaintSource>(std::move(image));
        });
        QImage image;
        {
            TimelineModel model;
            model.setTimeline(document(mode,placement,opacity));
            nt::test::Still still;
            const bool initialized = still.initialize(model);
            if (initialized) { image = still.capture(); }
        }
        nt::unregisterLayerSource(token);
        QVERIFY(!image.isNull());
        const auto near = [](const QColor& actual, const QColor& target) {
            return std::abs(actual.red()-target.red()) <= 2 && std::abs(actual.green()-target.green()) <= 2 &&
                std::abs(actual.blue()-target.blue()) <= 2 && actual.alpha() == 255;
        };
        const auto actual = image.pixelColor(32,16);
        QVERIFY2(near(actual,expected),qPrintable(QString("actual %1 expected %2")
            .arg(actual.name(QColor::HexArgb),expected.name(QColor::HexArgb))));
        const double outsideOpacity = placement == 3 || placement == 5 ? 0.4
            : placement == 2 || placement == 4 ? 0.8 : 1.0;
        QVERIFY(near(image.pixelColor(1,1), QColor(qRound(128*outsideOpacity),qRound(192*outsideOpacity),qRound(64*outsideOpacity))));
    }
};
QTEST_MAIN(TestEffectsBlend)
#include "tst_effectsblend.moc"
