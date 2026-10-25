// The pure parts of the flex layout port against values from the
// TypeScript sources (Node): `toFixed`, the thousands grouping, the SVG path
// parser and bounds, the text block box, and one Yoga row. The whole layout is
// checked against the web by scripts/plan-conformance.mjs (fixtures/scene-flex.json).
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "preview/SceneEval.h"
#include "scene/ClipScene.h"
#include "scene/FlexLayout.h"
#include "scene/SvgPath.h"
#include "scene/TextAnimation.h"
#include "scene/TextBlock.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QUndoStack>
#include <QtTest>

#include <cmath>
#include <stdexcept>

using namespace nt;
using namespace nt::scene;

namespace {

// A clip as the layout reads it: its raw JSON, media type and parent.
Clip flexClip(const char* id, const char* json) {
    Clip c;
    c.id = id;
    c.raw = QJsonDocument::fromJson(QByteArray(json)).object();
    const QString type = c.raw.value(u"mediaType").toString();
    c.mediaType = type == u"group" ? MediaType::Group : type == u"text" ? MediaType::Text : MediaType::Shape;
    auto scene = std::make_shared<ClipScene>();
    scene->parentId = c.raw.value(u"parentId").toString().toStdString();
    c.scene = scene;
    return c;
}

// A row: a 50 px rect "a", a rect "b", and a ticker "t" counting to 1e6.
const QByteArray kFlexDoc = R"({"id":"s","name":"flex","fps":30,"width":400,"height":200,"durationMs":1000,
  "tracks":[{"id":"t0","name":"t0","type":"video","index":0}],
  "clips":[
    {"id":"r","trackId":"t0","startMs":0,"durationMs":1000,"mediaType":"group","layout":{"display":"flex"}},
    {"id":"a","trackId":"t0","startMs":0,"durationMs":1000,"mediaType":"shape","parentId":"r",
     "shapeStyle":{"kind":"rect"},"flexItem":{"width":50,"height":20}},
    {"id":"t","trackId":"t0","startMs":0,"durationMs":1000,"mediaType":"text","parentId":"r",
     "textStyle":{"text":"0","fontSizePx":10,"color":"#fff"},
     "animations":[{"id":"k","role":"in","preset":"custom","durationMs":800,"custom":{"curves":[]},
                    "textAnimator":{"kind":"ticker","from":0,"to":1000000}}]},
    {"id":"b","trackId":"t0","startMs":0,"durationMs":1000,"mediaType":"shape","parentId":"r",
     "shapeStyle":{"kind":"rect"},"flexItem":{"width":50,"height":20}}]})";

}  // namespace

class TestFlexLayout : public QObject {
    Q_OBJECT
private slots:
    void toFixedMatchesJavaScript() {
        // (x).toFixed(f) in Node.
        QCOMPARE(jsToFixed(2.5, 0), QStringLiteral("3"));
        QCOMPARE(jsToFixed(1.005, 2), QStringLiteral("1.00"));
        QCOMPARE(jsToFixed(-0.001, 2), QStringLiteral("-0.00"));
        QCOMPARE(jsToFixed(0.5, 0), QStringLiteral("1"));
        QCOMPARE(jsToFixed(1234.5678, 3), QStringLiteral("1234.568"));
        QCOMPARE(jsToFixed(-2.345, 2), QStringLiteral("-2.35"));
        QCOMPARE(jsToFixed(0, 6), QStringLiteral("0.000000"));
        QCOMPARE(jsToFixed(999.995, 2), QStringLiteral("1000.00"));
    }

    // Codex review F1 (flex): JavaScript rounds the product and the sum
    // separately. A fused multiply-add gives -2^-104 here, which formats as
    // "-0" and changes the text width.
    void tickerRoundsLikeJavaScript() {
        const QJsonObject animator{{QStringLiteral("kind"), QStringLiteral("ticker")},
                                   {QStringLiteral("from"), -1.0},
                                   {QStringLiteral("to"), std::ldexp(1.0, -52)}};
        QCOMPARE(tickerText(animator, 1 - std::ldexp(1.0, -52)), QStringLiteral("0"));
    }

    // Codex review F2 (flex): above 1e21 `toFixed` is `String(x)`, the
    // shortest round trip with JavaScript's exponent form.
    void toFixedAbove1e21IsTheShortestForm() {
        QCOMPARE(jsToFixed(1e23, 2), QStringLiteral("1e+23"));
        QCOMPARE(jsToFixed(-1e23, 0), QStringLiteral("-1e+23"));
        QCOMPARE(jsToFixed(1.5e21, 0), QStringLiteral("1.5e+21"));
        QCOMPARE(jsToFixed(1.2345678901234567e300, 1), QStringLiteral("1.2345678901234567e+300"));
    }

    void groupingMatchesTheRegex() {
        const QString sep = QStringLiteral(",");
        QCOMPARE(groupThousands(QStringLiteral("-1234567"), sep), QStringLiteral("-1,234,567"));
        QCOMPARE(groupThousands(QStringLiteral("0001234"), sep), QStringLiteral("0,001,234"));
        QCOMPARE(groupThousands(QStringLiteral("-123456"), sep), QStringLiteral("-123,456"));  // `\B` after the sign
        QCOMPARE(groupThousands(QStringLiteral("12"), sep), QStringLiteral("12"));
        QCOMPARE(groupThousands(QStringLiteral("123"), sep), QStringLiteral("123"));
    }

    void svgPathBoundsMatchTheWeb() {
        QVERIFY(!parseSvgPath(QStringLiteral("Z")));
        QVERIFY(!parseSvgPath(QStringLiteral("M 0 0 L 1")));
        QVERIFY(!parseSvgPath(QStringLiteral("M0 0 A1 1 0 2 1 1 1")));
        struct Case {
            const char* d;
            double minX, minY, maxX, maxY;
            int segments;
        };
        const Case cases[] = {
            {"M0,0 1,1", 0, 0, 1, 1, 2},
            {"M0.1 0.1 L0.3 0.12 Q0.4 0.3 0.25 0.35 A0.05 0.08 30 1 0 0.12 0.2 Z", 0.1, 0.1, 0.4, 0.35, 6},
            {"m 0.5 0.5 h 0.1 v 0.1 c 0.02 0.05 -0.05 0.05 -0.1 0 s -0.02 -0.1 0 -0.1 t 0.05 0.02 z", 0.45000000000000007, 0.5,
             0.62, 0.65, 7},
            {"M1 1 A 0 1 0 0 1 2 2", 1, 1, 2, 2, 2},
            {"  M.5.5L1e-1-2e-1  ", 0.1, -0.2, 0.5, 0.5, 2},
            {"M0 0 A0.5 0.3 20 0 1 0.9 0.7", 0, -0.11386030155728977, 1.1128464573662165, 0.7, 3},
            {"M0.2 0.1 A0.3 0.3 0 1 1 0.21 0.1", -0.09636221267270632, -0.49995833043941323, 0.5063622126727055, 0.1, 5},
        };
        for (const Case& c : cases) {
            const auto segments = parseSvgPath(QString::fromLatin1(c.d));
            QVERIFY2(segments, c.d);
            QCOMPARE(static_cast<int>(segments->size()), c.segments);
            const auto b = pathSegmentBounds(*segments);
            QVERIFY(b);
            QCOMPARE(b->minX, c.minX);
            QCOMPARE(b->minY, c.minY);
            QCOMPARE(b->maxX, c.maxX);
            QCOMPARE(b->maxY, c.maxY);
        }
        // An arc's last point is the path data's own, not the trigonometry's.
        const auto arc = parseSvgPath(QStringLiteral("M0 0 A0.5 0.3 20 0 1 0.9 0.7"));
        QCOMPARE(arc->back().x, 0.9);
        QCOMPARE(arc->back().y, 0.7);
    }

    void textBoxUsesTheFallbackMeasure() {
        // layoutTextBlock with `text.length * fontSizePx * 0.6`: "ab cd" at
        // 10 px wraps at 0.05 * 200 = 10 px into two lines of 12 px.
        TextStyle s;
        s.text = QStringLiteral("ab cd");
        s.fontSizePx = 10;
        s.maxWidthFrac = 0.05;
        const TextBox b = textBlockBox({}, s, 200, 100);
        QCOMPARE(b.width, 12.0);
        QCOMPARE(b.height, 24.0);
        QCOMPARE(b.x, 94.0);
        QCOMPARE(b.y, 38.0);
    }

    // Codex review F3 (flex): `Number("50 ")` trims ECMAScript whitespace, so
    // a root width "50 %" is half the canvas (layout.ts `rootDimensionPx`).
    void aRootPercentWithSpacesResolves() {
        const Clip root = flexClip("r", R"({"mediaType":"group","layout":{"display":"flex","width":"50 %","height":"\u00a0 25%\t"}})");
        const FlexResult r = resolveClipLayouts({&root}, 400, 200);
        QCOMPARE(r.resolvedBoxes.at("r").width, 200.0);
        QCOMPARE(r.resolvedBoxes.at("r").height, 50.0);
    }

    // Codex review F4 (flex): a measure callback that throws leaves no Yoga
    // node behind.
    void aThrowingMeasureFreesEveryNode() {
        const Clip root = flexClip("r", R"({"mediaType":"group","layout":{"display":"flex"}})");
        const Clip nested = flexClip("n", R"({"mediaType":"group","parentId":"r","layout":{"display":"flex"}})");
        const Clip a = flexClip("a", R"({"mediaType":"shape","parentId":"n","shapeStyle":{"kind":"rect"}})");
        const Clip t = flexClip("t", R"({"mediaType":"text","parentId":"n","textStyle":{"text":"x","fontSizePx":10}})");
        const MeasureText throwing = [](const QString&, const TextStyle&) -> double { throw std::runtime_error("measure"); };
        QCOMPARE(flexLiveNodeCount(), 0);
        QVERIFY_THROWS_EXCEPTION(std::runtime_error, resolveClipLayouts({&root, &nested, &a, &t}, 400, 200, {}, throwing));
        QCOMPARE(flexLiveNodeCount(), 0);
        resolveClipLayouts({&root, &nested, &a, &t}, 400, 200);
        QCOMPARE(flexLiveNodeCount(), 0);
    }

    // Codex review F7 (flex): every new snapshot of the document gets a new
    // revision, so a layout cached by revision is never stale.
    void everyEditMakesANewRevision() {
        TimelineModel model;
        const auto parsed = parseTimelineJson(kFlexDoc);
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        const quint64 r1 = model.timeline().revision;
        QVERIFY(r1 > 0);
        QJsonArray clips = model.clipsJson();
        QJsonObject a = clips[1].toObject();
        a.insert(QStringLiteral("flexItem"), QJsonObject{{QStringLiteral("width"), 120}, {QStringLiteral("height"), 20}});
        clips.replace(1, a);
        QVERIFY(model.commitEdit(QStringLiteral("resize"), model.clipsJson(), clips));
        const quint64 r2 = model.timeline().revision;
        QVERIFY(r2 > r1);
        QVERIFY(!model.replaceClips(model.clipsJson()));  // no change, no revision
        QCOMPARE(model.timeline().revision, r2);
        model.undoStack()->undo();
        const quint64 r3 = model.timeline().revision;
        QVERIFY(r3 > r2);
        QVERIFY(model.replaceMarkers(QJsonArray{QJsonObject{{QStringLiteral("id"), QStringLiteral("m")}, {QStringLiteral("timeMs"), 0}}}));
        QVERIFY(model.timeline().revision > r3);
        model.close();
        QVERIFY(model.timeline().revision > r3);
    }

    // The layout is computed once per revision, canvas and animated text,
    // and a new revision lays out again.
    void theLayoutIsCachedByRevision() {
        auto parsed = parseTimelineJson(kFlexDoc);
        QVERIFY(parsed.timeline);
        Timeline tl = *parsed.timeline;
        tl.revision = nextTimelineRevision();
        const FlexCacheStats s0 = flexLayoutCacheStats();
        const auto bX = [](const SceneFrame& f) {
            for (const ActiveLayer& l : f.layers) {
                if (l.clipId == "b") return l.transform->position.x;
            }
            return std::nan("");
        };
        // After the ticker's window its text stays "1000000": one layout.
        const double x0 = bX(evaluateScene(tl, 900));
        QCOMPARE(bX(evaluateScene(tl, 950)), x0);
        const FlexCacheStats s1 = flexLayoutCacheStats();
        QCOMPARE(s1.misses - s0.misses, quint64(1));
        QCOMPARE(s1.hits - s0.hits, quint64(1));
        // An edit: a first child 70 px wider moves the second 70 px right in a
        // row that grows by 70 px about its centre: 35 px.
        Timeline edited = tl;
        QJsonObject raw = edited.clips[1].raw;
        raw.insert(QStringLiteral("flexItem"), QJsonObject{{QStringLiteral("width"), 120}, {QStringLiteral("height"), 20}});
        edited.clips[1].raw = raw;
        edited.revision = nextTimelineRevision();
        QCOMPARE(bX(evaluateScene(edited, 900)), x0 + 35);
        // Revision 0 (a document no model owns) is never cached.
        Timeline unowned = *parsed.timeline;
        const FlexCacheStats s2 = flexLayoutCacheStats();
        evaluateScene(unowned, 0);
        evaluateScene(unowned, 0);
        QCOMPARE(flexLayoutCacheStats().hits, s2.hits);
        // An animated ticker re-lays the row out under one revision.
        const double tick0 = bX(evaluateScene(tl, 0));
        const double tickEnd = bX(evaluateScene(tl, 900));
        QVERIFY(tickEnd > tick0);
    }

    void aRowPlacesItsChildren() {
        // A 200 px row with two 50 px rects at 0.5 scale: the second sits 50
        // px right of the first (parent-local, canvas-centre-relative).
        const auto clip = flexClip;
        const Clip root = clip("r", R"({"mediaType":"group","layout":{"display":"flex","width":200}})");
        const Clip a = clip("a", R"({"mediaType":"shape","parentId":"r","shapeStyle":{"kind":"rect"},"flexItem":{"width":50,"height":20}})");
        const Clip b = clip("b", R"({"mediaType":"shape","parentId":"r","shapeStyle":{"kind":"rect"},"flexItem":{"width":50,"height":20}})");
        const FlexResult r = resolveClipLayouts({&root, &a, &b}, 400, 200);
        QCOMPARE(r.resolvedBoxes.at("r").width, 200.0);
        QCOMPARE(r.resolvedBoxes.at("a").x, -100.0);
        QCOMPARE(r.resolvedBoxes.at("b").x, -50.0);
        QCOMPARE(r.sizes.at("b").width, 50.0);
        QVERIFY(!r.transforms.count("r"));  // the root keeps its own
        // The rect is resized to 50 x 20 at the top-left, then moved: its
        // centre goes from (-175, -90) to the box centre (-25, 0).
        QCOMPARE(r.transforms.at("b").position.x, 150.0);
        QCOMPARE(r.transforms.at("b").position.y, 90.0);
    }
};

QTEST_GUILESS_MAIN(TestFlexLayout)
#include "tst_flexlayout.moc"
