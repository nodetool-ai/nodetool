// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/render/src/color_match.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#include "color/ColorMatch.h"
#include "color/ColorMatchMath.h"
#include <QElapsedTimer>
#include <QJsonObject>
#include <QTest>
#include <algorithm>
#include <cmath>
#include <numbers>
using namespace nt::color;
namespace {
QJsonObject lgg(QJsonArray lift = {0,0,0}, QJsonArray gamma = {1,1,1}, QJsonArray gain = {1,1,1}) {
    return {{"id","lgg"},{"type","liftGammaGain"},{"enabled",true},{"lift",lift},{"gamma",gamma},{"gain",gain}};
}
QImage frame(bool skin = false) {
    QImage out(192,108,QImage::Format_RGBA8888);
    const auto encode = [](double v) { return v <= .0031308 ? v * 12.92 : 1.055 * std::pow(v,1/2.4) - .055; };
    for (int y = 0; y < out.height(); ++y) {
        auto *row = out.scanLine(y);
        for (int x = 0; x < out.width(); ++x) {
            const double t = x / 192.0;
            std::array c{t*t,t*t*.9+.02,t*t*.8+.03};
            if (y < 36) { c = {c[0]*.6,c[1]*1.1,c[2]*.7}; }
            else if (y > 72) { c = {c[0]*.8,c[1]*.85,c[2]*1.2}; }
            if (skin && x >= 60 && x < 120 && y >= 40 && y < 70) { c = {.55,.32,.22}; }
            for (int k = 0; k < 3; ++k) { row[x*4+k] = std::lround(std::clamp(encode(c[k]),0.0,1.0)*255); }
            row[x*4+3] = 255;
        }
    }
    return out;
}
QImage rendered(const QImage &f, const QJsonArray &effects, const MatchResult &r) {
    return applyGrade(f,applyMatchToEffects(effects,r,"new"));
}
double hue(const QImage &f) {
    const auto sk = detail::statistics(f,true).skin;
    return std::atan2(sk[1],sk[0])*180/std::numbers::pi;
}
double hueDistance(double a, double b) { return std::abs(std::remainder(a-b,360)); }
}
class ColorMatchTest : public QObject {
    Q_OBJECT
private slots:
    void oklabWeights() {
        const auto w = detail::oklab({1,1,1});
        QVERIFY(std::abs(w[0]-1)<.001 && std::abs(w[1])<.001 && std::abs(w[2])<.001);
        const auto r = detail::oklab({1,0,0});
        QVERIFY(std::abs(r[0]-.6279)<.002 && std::abs(r[1]-.2249)<.002 && std::abs(r[2]-.1258)<.002);
        QCOMPARE(detail::tonalWeights(.1), (detail::Triple{1,0,0}));
        QCOMPARE(detail::tonalWeights(.9), (detail::Triple{0,0,1}));
        const auto mid = detail::tonalWeights(.5);
        QVERIFY(std::abs(mid[0]-.04296875)<1e-8);
        QVERIFY(std::abs(mid[1]-.9140625)<1e-8);
        QVERIFY(detail::skinWeight(detail::oklab({.55,.32,.22}))>.9);
        QCOMPARE(detail::skinWeight(detail::oklab({.2,.3,.8})),0.0);
        QCOMPARE(detail::skinWeight({.2,.08,.08}),0.0);
    }
    void identity() {
        const auto f = frame();
        const auto r = solveMatch({f,f,{},false,{}});
        QVERIFY2(r.ok,qPrintable(r.error)); QVERIFY(r.before < 1e-6);
        for (int c = 0; c < 3; ++c) {
            QVERIFY(std::abs(r.lift[c])<1e-5); QVERIFY(std::abs(r.gamma[c]-1)<1e-5); QVERIFY(std::abs(r.gain[c]-1)<1e-5);
        }
        QVERIFY(std::abs(r.saturationScale-1)<1e-5);
        QVERIFY(r.differenceBefore < 1e-9 && r.differenceAfter < 1e-9);
    }
    void knownGrade() {
        const auto f = frame();
        const auto ref = applyGrade(f,{lgg({.025,-.012,.018},{1.07,.96,1.03},{1.06,1.01,.94})});
        const auto r = solveMatch({f,ref,{},false,{}});
        QVERIFY2(r.ok,qPrintable(r.error));
        qInfo("known grade residual %.6f -> %.6f",r.before,r.after);
        QVERIFY(r.after < r.before*.15);
        const auto out = detail::statistics(rendered(f,{},r),false);
        const auto want = detail::statistics(ref,false);
        for (int k = 0; k < 3; ++k) {
            for (int c = 1; c < 4; ++c) { QVERIFY(std::abs(out.bands[k][c]-want.bands[k][c]) < .02); }
        }
    }
    void colourOffset() {
        const auto f = frame(); auto ref = f.copy();
        for (int y = 0; y < ref.height(); ++y) {
            auto *p = ref.scanLine(y);
            for (int x = 0; x < ref.width(); ++x) { p[x*4] = std::min(255,p[x*4]+20); p[x*4+2] = std::max(0,p[x*4+2]-15); }
        }
        const auto r = solveMatch({f,ref,{},false,{}});
        QVERIFY2(r.ok,qPrintable(r.error));
        qInfo("colour offset difference %.6f -> %.6f",r.differenceBefore,r.differenceAfter);
        QVERIFY(r.differenceBefore > .02);
        QVERIFY(r.differenceAfter <= r.differenceBefore*.25);
        QVERIFY(std::abs(meanColorDifference(rendered(f,{},r),ref)-r.differenceAfter)<.002);
    }
    void skinProtection() {
        const auto f = frame(true);
        const auto ref = applyGrade(f,{lgg({-.035,.08,.035},{.95,1.1,1.05},{.85,1.15,1.1})});
        const auto free = solveMatch({f,ref,{},false,{}});
        const auto safe = solveMatch({f,ref,{},true,{}});
        QVERIFY(free.ok && safe.ok);
        const double a = hueDistance(hue(rendered(f,{},free)),hue(f));
        const double b = hueDistance(hue(rendered(f,{},safe)),hue(f));
        qInfo("skin hue shift free %.3f protected %.3f degrees",a,b);
        QVERIFY(b <= 8.5); QVERIFY(a > b);
    }
    void pixels_data() {
        QTest::addColumn<QColor>("input"); QTest::addColumn<QJsonArray>("effects"); QTest::addColumn<QColor>("expected");
        // LGG: sqrt((64/255+.1)*1.2)=.6489811. Others stay neutral.
        QTest::newRow("lgg") << QColor(64,128,192) << QJsonArray{lgg({.1,0,0},{2,1,1},{1.2,1,1})} << QColor(165,128,192);
        // Fitted straight master .25->.75 remaps [64,128,192] to [0,128.5,255].
        const QJsonArray master{QJsonObject{{"x",.25},{"y",0}},QJsonObject{{"x",.75},{"y",1}}};
        QTest::newRow("curves") << QColor(64,128,192) << QJsonArray{QJsonObject{{"type","curves"},{"enabled",true},{"master",master}}} << QColor(1,129,255);
        // Levels gamma 2: sqrt(code/255), rounded to 8-bit.
        QTest::newRow("levels") << QColor(64,128,192) << QJsonArray{QJsonObject{{"type","levels"},{"enabled",true},{"gamma",2}}} << QColor(128,181,221);
        // CDL is Levels' output remap, .5*x+.2 after a neutral Levels pass.
        QTest::newRow("cdl") << QColor(64,128,192) << QJsonArray{QJsonObject{{"type","levels"},{"enabled",true},{"outBlack",.2},{"outWhite",.7}}} << QColor(83,115,147);
        QTest::newRow("grade") << QColor(64,128,192) << QJsonArray{QJsonObject{{"type","color"},{"enabled",true},{"brightness",.1},{"contrast",1.2},{"saturation",.5},{"temperature",.2},{"tint",-.1}}} << QColor(121,162,177);
        QTest::newRow("hue") << QColor(255,0,0) << QJsonArray{QJsonObject{{"type","color"},{"enabled",true},{"hue",120}}} << QColor(0,255,0);
        QTest::newRow("threshold") << QColor(64,128,192) << QJsonArray{QJsonObject{{"type","color"},{"enabled",true},{"brightness",.0009}}} << QColor(64,128,192);
    }
    void pixels() {
        QFETCH(QColor,input); QFETCH(QJsonArray,effects); QFETCH(QColor,expected);
        QImage f(1,1,QImage::Format_RGBA8888); f.fill(input);
        QCOMPARE(applyGrade(f,effects).pixelColor(0,0),expected);
    }
    void barsAndDifference() {
        QImage black(20,12,QImage::Format_RGB32); black.fill(Qt::black);
        QCOMPARE(trimBlackBars(black),black);
        QImage f = black.copy();
        for (int y = 3; y < 9; ++y) { for (int x = 2; x < 18; ++x) { f.setPixelColor(x,y,QColor(90,120,180)); } }
        QCOMPARE(trimBlackBars(f).size(),QSize(16,6));
        QCOMPARE(meanColorDifference(f,trimBlackBars(f)),0.0);
        QVERIFY(trimBlackBars({}).isNull());
        const auto bad = solveMatch({{},f,{},false,{}}); QVERIFY(!bad.ok && !bad.error.isEmpty());
        QVERIFY(!solveMatch({f,{}, {},false,{}}).ok);
    }
    void effectLists() {
        MatchResult r; r.ok = true; r.lift = {.012345,0,-.1}; r.gamma = {1.1,1,1}; r.gain = {1,1.05,1};
        const QJsonObject blur{{"id","blur"},{"type","blur"},{"enabled",true},{"radius",3}};
        const QJsonObject colour{{"id","inspector:color"},{"type","color"},{"enabled",false},{"saturation",1.5},{"brightness",.2}};
        const auto created = applyMatchToEffects({blur,colour},r,"created");
        QCOMPARE(created.size(),3); QCOMPARE(created[0].toObject()["id"].toString(),QString("created"));
        QCOMPARE(created[0].toObject()["lift"].toArray()[0].toDouble(),.0123);
        QCOMPARE(created[1].toObject(),blur);
        // The search ran with the color effect on. Its values stay, and it has to be on for the result to hold.
        auto enabledColour = colour; enabledColour["enabled"] = true;
        QCOMPARE(created[2].toObject(),enabledColour);
        auto existing = lgg(); existing["enabled"] = false; existing["custom"] = "keep";
        auto second = lgg({.2,.2,.2}); second["id"] = "second";
        r.saturationScale = 1.2;
        const auto updated = applyMatchToEffects({blur,existing,colour,second},r,"unused");
        QCOMPARE(updated.size(),4); QCOMPARE(updated[0].toObject(),blur);
        QCOMPARE(updated[1].toObject()["id"].toString(),QString("lgg"));
        QCOMPARE(updated[1].toObject()["custom"].toString(),QString("keep"));
        QVERIFY(updated[1].toObject()["enabled"].toBool()); QCOMPARE(updated[3].toObject(),second);
        QCOMPARE(updated[2].toObject()["saturation"].toDouble(),1.8);
        QCOMPARE(updated[2].toObject()["brightness"].toDouble(),.2); QVERIFY(updated[2].toObject()["enabled"].toBool());
        const auto added = applyMatchToEffects({blur},r,"new");
        QCOMPARE(added.last().toObject()["id"].toString(),QString("inspector:color"));
        const QJsonArray effects{blur,existing,colour,second,QJsonObject{{"type","curves"},{"enabled",true}},QJsonObject{{"type","levels"},{"enabled",true}}};
        const auto probe = probeEffects(effects);
        QCOMPARE(probe[0],effects[0]);
        for (int i = 1; i < probe.size(); ++i) { QVERIFY(!probe[i].toObject()["enabled"].toBool()); }
    }
    void cancellation() {
        const auto f = frame(); int polls = 0;
        QElapsedTimer t; t.start();
        const auto r = solveMatch({f,f,{},false,[&]{ ++polls; return true; }});
        QVERIFY(!r.ok && r.wasCancelled); QVERIFY(polls > 0); QVERIFY(t.elapsed()<1000);
    }
    void chain() {
        const auto f = frame();
        const QJsonArray effects{lgg(),QJsonObject{{"type","curves"},{"enabled",true},{"master",QJsonArray{
            QJsonObject{{"x",0},{"y",0}},QJsonObject{{"x",.5},{"y",.6}},QJsonObject{{"x",1},{"y",1}}}}},
            QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",false},{"saturation",.8},{"brightness",.025}}};
        auto truth = effects; truth[0] = lgg({.02,-.015,.01},{1.05,.96,1.02},{1.04,1,.95});
        auto col = truth[2].toObject(); col["enabled"] = true; truth[2] = col;
        const auto ref = applyGrade(f,truth);
        const auto r = solveMatch({f,ref,effects,false,{}});
        QVERIFY2(r.ok,qPrintable(r.error));
        qInfo("chain residual %.6f -> %.6f difference %.6f -> %.6f",r.before,r.after,r.differenceBefore,r.differenceAfter);
        QVERIFY(r.after < r.before*.3);
        QVERIFY(meanColorDifference(rendered(f,effects,r),ref) < meanColorDifference(f,ref)*.3);
    }
};
QTEST_GUILESS_MAIN(ColorMatchTest)
#include "tst_colormatch.moc"
