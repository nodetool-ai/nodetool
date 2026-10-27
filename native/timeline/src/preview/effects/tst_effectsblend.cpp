#include "preview/compose/ComposeRegistry.h"
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
    void clipDocuments() {
        auto raw=QJsonObject{{"fps",30},{"width",64},{"height",32},{"durationMs",1000},
            {"tracks",QJsonArray{QJsonObject{{"id","v"},{"type","video"}}}},
            {"clips",QJsonArray{
                QJsonObject{{"id","g"},{"trackId","v"},{"mediaType","group"},{"startMs",0},{"durationMs",1000},
                    {"effects",QJsonArray{effect("blur",{{"radius",8}})}}},
                QJsonObject{{"id","a"},{"trackId","v"},{"mediaType","shape"},{"parentId","g"},{"startMs",0},{"durationMs",1000},
                    {"width",64},{"height",32},{"shapeStyle",QJsonObject{{"kind","rect"}}},{"crop",QJsonObject{{"left",0.25},{"right",0.25},{"top",0},{"bottom",0}}},
                    {"effects",QJsonArray{effect("grain",{{"seed",27},{"animate",true}}),
                        QJsonObject{{"id","disabled"},{"type","vignette"},{"enabled",false}}}}}}}};
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        const auto frame=nt::evaluateScene(*parsed.timeline,500);
        QCOMPARE(frame.layers.size(),size_t{1}); QCOMPARE(frame.precomposites.size(),size_t{1});
        const auto& layer=frame.layers[0];
        QCOMPARE(layer.sourceRect,(std::array<float,4>{0.25f,0,0.5f,1}));
        QCOMPARE(layer.ext.value("effectSourceRect").toArray(),(QJsonArray{0.25,0,0.5,1}));
        const auto copied=layer.ext.value("clipEffects").toArray(); QCOMPARE(copied.size(),1);
        QCOMPARE(copied[0].toObject().value("seed").toInt(),27);
        const auto& group=frame.precomposites[0];
        QVERIFY(group.ext.value("effectGroupSurface").toBool());
        QCOMPARE(group.ext.value("clipEffects").toArray().size(),1);
        auto stages=nt::registeredEffectStages(); QVERIFY(!stages.empty());
        QVERIFY(stages[0]->applies(layer.ext)); QVERIFY(stages[0]->applies(group.ext));
        QVERIFY(!stages[0]->applies({}));
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
        QVERIFY(!poster.isNull()); QCOMPARE(poster.pixelColor(32,16),QColor(0,128,255));
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
