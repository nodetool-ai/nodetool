#include "model/TimelineJson.h"
#include "preview/SceneEval.h"

#include <QTest>

#include <algorithm>
#include <cmath>

namespace {

nt::Timeline loadFixture() {
    const auto r = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/three-tracks.json"));
    if (!r.timeline) {
        qFatal("fixture: %s", qPrintable(r.error));
    }
    return *r.timeline;
}

const nt::ActiveLayer* find(const std::vector<nt::ActiveLayer>& layers, const char* id) {
    for (const auto& l : layers) {
        if (l.clipId == id) return &l;
    }
    return nullptr;
}

double opacityAt(const nt::Timeline& tl, double t, const char* id) {
    const auto layers = nt::activeLayersAt(tl, t);
    const nt::ActiveLayer* l = find(layers, id);
    if (!l) qFatal("%s not active at %f", id, t);
    return l->opacity;
}

nt::Clip& clipById(nt::Timeline& tl, const char* id) {
    for (auto& c : tl.clips) {
        if (c.id == id) return c;
    }
    qFatal("no clip %s", id);
}

QStringList ids(const std::vector<nt::ActiveLayer>& layers) {
    QStringList out;
    for (const auto& l : layers) out << QString::fromStdString(l.clipId);
    return out;
}

}  // namespace

class TestSceneEval : public QObject {
    Q_OBJECT

private slots:
    void activeSetAndOrder_data() {
        QTest::addColumn<double>("timeMs");
        QTest::addColumn<QStringList>("expected");  // bottom to top
        QTest::newRow("t=0 background only") << 0.0 << QStringList{"clip-background"};
        QTest::newRow("t=1500 title over background") << 1500.0 << QStringList{"clip-background", "clip-title"};
        QTest::newRow("t=8500 four layers")
            << 8500.0 << QStringList{"clip-background", "clip-pip-a", "clip-pip-b", "clip-square"};
        QTest::newRow("t=9000 pip-a end is exclusive")
            << 9000.0 << QStringList{"clip-background", "clip-pip-b", "clip-square"};
        QTest::newRow("t=19999") << 19999.0 << QStringList{"clip-background"};
        QTest::newRow("t=20000 past the end") << 20000.0 << QStringList{};
    }
    void activeSetAndOrder() {
        QFETCH(double, timeMs);
        QFETCH(QStringList, expected);
        QCOMPARE(ids(nt::activeLayersAt(loadFixture(), timeMs)), expected);
    }

    // PiP A [2000, 9000) and PiP B [8000, 16000) overlap for 1 s on one track.
    // With no transitionIn, B dissolves in across the overlap (web
    // `resolveTransition` auto cross-fade); A stays opaque.
    void autoDissolve_data() {
        QTest::addColumn<double>("timeMs");
        QTest::addColumn<double>("pipA");  // < 0: not active
        QTest::addColumn<double>("pipB");
        QTest::newRow("overlap start") << 8000.0 << 1.0 << 0.0;
        QTest::newRow("overlap middle") << 8500.0 << 1.0 << 0.85 * 0.5;
        QTest::newRow("last overlap ms") << 8999.0 << 1.0 << 0.85 * 0.999;
        QTest::newRow("overlap end") << 9000.0 << -1.0 << 0.85;
    }
    void autoDissolve() {
        QFETCH(double, timeMs);
        QFETCH(double, pipA);
        QFETCH(double, pipB);
        const nt::Timeline tl = loadFixture();
        const auto layers = nt::activeLayersAt(tl, timeMs);
        const nt::ActiveLayer* a = find(layers, "clip-pip-a");
        if (pipA < 0) {
            QVERIFY(!a);
        } else {
            QVERIFY(a);
            QVERIFY(std::abs(a->opacity - pipA) < 1e-12);
        }
        QVERIFY(std::abs(opacityAt(tl, timeMs, "clip-pip-b") - pipB) < 1e-12);
    }

    void hardCutOptsOut() {
        nt::Timeline tl = loadFixture();
        clipById(tl, "clip-pip-b").transitionIn = nt::ClipTransitionIn{"crossfade", 0.0, {}};
        QCOMPARE(opacityAt(tl, 8000.0, "clip-pip-b"), 0.85);
        QCOMPARE(opacityAt(tl, 8500.0, "clip-pip-b"), 0.85);
        QCOMPARE(opacityAt(tl, 8500.0, "clip-pip-a"), 1.0);
    }

    void authoredDurationReplacesOverlap() {
        nt::Timeline tl = loadFixture();
        clipById(tl, "clip-pip-b").transitionIn = nt::ClipTransitionIn{"crossfade", 500.0, {}};
        QVERIFY(std::abs(opacityAt(tl, 8250.0, "clip-pip-b") - 0.85 * 0.5) < 1e-12);
        QCOMPARE(opacityAt(tl, 8500.0, "clip-pip-b"), 0.85);
    }

    void dipToColorFadesBothSides() {
        nt::Timeline tl = loadFixture();
        clipById(tl, "clip-pip-b").transitionIn = nt::ClipTransitionIn{"dipToColor", 1000.0, {}};
        QVERIFY(std::abs(opacityAt(tl, 8250.0, "clip-pip-a") - 0.5) < 1e-12);  // 1 - 2p
        QVERIFY(std::abs(opacityAt(tl, 8250.0, "clip-pip-b") - 0.0) < 1e-12);  // 2p - 1, clamped
        QVERIFY(std::abs(opacityAt(tl, 8750.0, "clip-pip-b") - 0.85 * 0.5) < 1e-12);
    }

    void topTrackHasHighestZ() {
        const auto layers = nt::activeLayersAt(loadFixture(), 8500.0);
        for (size_t i = 1; i < layers.size(); ++i) {
            QVERIFY(layers[i - 1].z <= layers[i].z);
        }
        QCOMPARE(layers.back().z, nt::trackZ(0));
    }

    void sourceTimeAddsInPoint() {
        const auto layers = nt::activeLayersAt(loadFixture(), 10000.0);
        const auto it = std::find_if(layers.begin(), layers.end(), [](const auto& l) { return l.clipId == "clip-pip-b"; });
        QVERIFY(it != layers.end());
        QCOMPARE(it->clipTimeMs, 2000.0);
        QCOMPARE(it->sourceTimeMs, 3500.0);
        QCOMPARE(it->opacity, 0.85);
    }

    void hiddenClipAndInvisibleTrackAreSkipped() {
        nt::Timeline tl = loadFixture();
        for (auto& c : tl.clips) {
            if (c.id == "clip-pip-a") c.hidden = true;
        }
        for (auto& t : tl.tracks) {
            if (t.id == "track-v1") t.visible = false;
        }
        QCOMPARE(ids(nt::activeLayersAt(tl, 8500.0)), (QStringList{"clip-background", "clip-pip-b"}));
    }

    void sameTrackLaterStartDrawsOnTop() {
        nt::Timeline tl = loadFixture();
        nt::Clip extra = tl.clips.front();
        extra.id = "clip-late";
        extra.startMs = 500.0;
        extra.durationMs = 1000.0;
        tl.clips.insert(tl.clips.begin(), extra);  // earlier in document order
        QCOMPARE(ids(nt::activeLayersAt(tl, 600.0)), (QStringList{"clip-background", "clip-late"}));
    }

    void containFitMatrix() {
        // A full-canvas 16:9 source on a 16:9 canvas at scale 1 is the identity.
        const auto m = nt::layerMatrix(nt::ClipTransform{}, 1920, 1080, 1920, 1080);
        QCOMPARE(m[0], 1.0f);
        QCOMPARE(m[5], 1.0f);
        QCOMPARE(m[12], 0.0f);
        QCOMPARE(m[13], 0.0f);
        // A square source contains to the canvas height.
        const auto sq = nt::layerMatrix(nt::ClipTransform{}, 800, 800, 1920, 1080);
        QVERIFY(std::abs(sq[0] - 1080.0f / 1920.0f) < 1e-6f);
        QCOMPARE(sq[5], 1.0f);
        // Position is canvas pixels from the centre with y down.
        nt::ClipTransform t;
        t.position = {480.0, 270.0};
        const auto moved = nt::layerMatrix(t, 1920, 1080, 1920, 1080);
        QCOMPARE(moved[12], 0.5f);
        QCOMPARE(moved[13], -0.5f);
    }
};

QTEST_APPLESS_MAIN(TestSceneEval)
#include "tst_sceneeval.moc"
