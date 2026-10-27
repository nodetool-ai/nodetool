#include "preview/compose/ComposeRegistry.h"
#include "preview/layers/TestStill.h"
#include "model/TimelineJson.h"
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtTest>
#include <array>

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
