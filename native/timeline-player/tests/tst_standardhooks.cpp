// The standard preview hooks reach every host that renders timelines.
// tst_standardhooks links the startup registrars, as the timeline app does.
// tst_standardhooks_explicit links none and calls registerStandardHooks(), as
// another host may. A missing effect, blend mode, matte, text source or
// decorator fails one of them.
#include "model/TimelineJson.h"
#include "preview/SceneEval.h"
#include "preview/StandardHooks.h"
#include "preview/layers/SceneHooks.h"
#include "preview/effects/BlendModes.h"
#include <QJsonArray>
#include <QtTest>
#include <algorithm>
#include <string>

using namespace Qt::StringLiterals;

namespace {
// A video clip with a caption and a group with an effect: the effect
// decorators mark the video layer and the group surface, and the render2d
// decorator gives the caption layer its words.
nt::Timeline probeDocument() {
    return *nt::parseTimelineJson(R"({"fps":30,"width":64,"height":32,"durationMs":1000,
      "tracks":[{"id":"v","type":"video"}],"clips":[
        {"id":"g","trackId":"v","mediaType":"group","startMs":0,"durationMs":1000,
         "effects":[{"enabled":true,"type":"invert"}]},
        {"id":"a","trackId":"v","parentId":"g","mediaType":"video","status":"generated",
         "currentAssetId":"fixture","startMs":0,"durationMs":1000,"width":64,"height":32,
         "caption":{"words":[{"text":"hello","startMs":0,"endMs":1000}]}}]})")
                .timeline;
}

// The decorators cannot be listed from the registries, so evaluate a scene.
QStringList missingDecorators() {
    QStringList missing;
    const auto frame = nt::evaluateScene(probeDocument(), 0);
    const auto layer = [&frame](const char* kind) {
        return std::ranges::find_if(frame.layers, [kind](const nt::ActiveLayer& item) { return item.kind == kind; });
    };
    if (const auto video = layer("video"); video == frame.layers.end() || !video->ext.contains("effectSourceRect")) {
        missing.append(QStringLiteral("decorator:effects-layer"));
    }
    if (const auto caption = layer("caption"); caption == frame.layers.end() || !caption->ext.contains("caption")) {
        missing.append(QStringLiteral("decorator:render2d-layer"));
    }
    if (std::ranges::none_of(frame.precomposites, [](const nt::PrecompositeLayer& group) {
            return group.ext.value("effectGroupSurface").toBool();
        })) {
        missing.append(QStringLiteral("decorator:effects-group"));
    }
    return missing;
}

QStringList allMissing() { return nt::missingStandardHooks() + missingDecorators(); }
}

class TestStandardHooks : public QObject {
    Q_OBJECT
private slots:
#ifdef NT_STARTUP_REGISTRARS
    void registrarsRegisterEveryHook() {
        const auto missing = allMissing();
        QVERIFY2(missing.isEmpty(), qPrintable(u"missing: "_s + missing.join(u", ")));
    }
    void explicitCallDoesNotRegisterTwice() {
        const auto layers = nt::sceneHooks().layers.size();
        const auto registrations = nt::registerStandardHooks();
        QVERIFY(registrations.empty());
        QCOMPARE(nt::sceneHooks().layers.size(), layers);
    }
#else
    void nothingRegisteredWithoutRegistrars() {
        const auto missing = allMissing();
        for (const auto mode : nt::effects::blendModes) {
            QVERIFY(missing.contains(QStringLiteral("blend:") + QLatin1StringView(mode.data(), qsizetype(mode.size()))));
        }
        QVERIFY(missing.contains(QStringLiteral("layer-source:text")));
        QVERIFY(missing.contains(QStringLiteral("decorator:effects-layer")));
        QVERIFY(missing.contains(QStringLiteral("decorator:render2d-layer")));
    }
    void explicitCallRegistersEveryHook() {
        const auto missingBefore = allMissing();
        const auto layersBefore = nt::sceneHooks().layers.size();
        {
            const auto registrations = nt::registerStandardHooks();
            QVERIFY(!registrations.empty());
            const auto missing = allMissing();
            QVERIFY2(missing.isEmpty(), qPrintable(u"missing: "_s + missing.join(u", ")));
            // A second call while the first holds the hooks adds nothing.
            QVERIFY(nt::registerStandardHooks().empty());
        }
        // Destroying the registrations removes every hook again.
        QCOMPARE(allMissing(), missingBefore);
        QCOMPARE(nt::sceneHooks().layers.size(), layersBefore);
    }
#endif
};

QTEST_MAIN(TestStandardHooks)
#include "tst_standardhooks.moc"
