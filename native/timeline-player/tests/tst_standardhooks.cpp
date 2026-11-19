// The standard preview hooks reach every host that renders timelines.
// tst_standardhooks links the startup registrars, as the timeline app does.
// tst_standardhooks_explicit links none and calls registerStandardHooks(), as
// another host may. A missing effect, blend mode, matte, text source or
// decorator fails one of them.
#include "audio/Mixer.h"
#include "model/TimelineJson.h"
#include "preview/SceneEval.h"
#include "preview/StandardHooks.h"
#include "preview/layers/SceneHooks.h"
#include "preview/effects/BlendModes.h"
#include <QJsonArray>
#include <QtTest>
#include <algorithm>
#include <array>
#include <string>
#include <type_traits>

using namespace Qt::StringLiterals;

static_assert(!std::is_move_assignable_v<nt::HookRegistrations>);

namespace {
#ifndef NT_EFFECTS_STARTUP_ONLY
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

#endif

// Synthetic audio PCM and a square output with a two-to-one source.
nt::Timeline playbackDocument() {
    return *nt::parseTimelineJson(R"({"fps":30,"width":64,"height":64,"durationMs":1000,
      "tracks":[{"id":"v","type":"video","automation":[{"target":{"kind":"clip","property":"opacity"},
        "points":[{"timeMs":0,"value":1},{"timeMs":1000,"value":0}]}]},
        {"id":"a","type":"audio","automation":[{"target":{"kind":"mixer","param":"volumeDb"},
        "points":[{"timeMs":0,"value":0},{"timeMs":500,"value":-20}]}]}],
      "clips":[{"id":"v1","trackId":"v","mediaType":"video","status":"generated","currentAssetId":"video",
        "startMs":0,"durationMs":1000,"width":128,"height":64,
        "reframe":{"mode":"center","keyframes":[{"sourceMs":0,"x":0.25,"y":0.5},
                                                {"sourceMs":1000,"x":0.75,"y":0.5}]}},
        {"id":"a1","trackId":"a","mediaType":"audio","status":"generated","audioPath":"synthetic",
         "startMs":0,"durationMs":1000,"timeRemap":{"keyframes":[{"t":0,"sourceMs":0},{"t":1,"sourceMs":2000}]}}]})")
                .timeline;
}

#ifndef NT_EFFECTS_STARTUP_ONLY
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
#endif
}

class TestStandardHooks : public QObject {
    Q_OBJECT
private slots:
    void timeRemapAndMixerAutomation() {
        const auto hooks = nt::registerStandardHooks();
        const auto plan = nt::audio::buildMixPlan(playbackDocument());
        QCOMPARE(plan.voices.size(), std::size_t{1});
        QCOMPARE(plan.voices[0].sourceRate, 2.0);
        // At 500 ms the remap reads source frame 48,000. The track gain
        // is -20 dB, so the impulse arrives at a tenth of its PCM value.
        std::array<float, 2> input{1, -1}, output{};
        nt::audio::VoicePcm pcm{.linear = input.data(), .linearFirst = 48000, .linearCount = 1};
        nt::audio::MixStats stats;
        nt::audio::mixBlock(plan, &pcm, 48000, 500, 1000.0 / 48000, 1, output.data(), stats);
        QCOMPARE(output[0], 0.1f);
        QCOMPARE(output[1], -0.1f);
    }

    void pictureAutomation() {
        const auto hooks = nt::registerStandardHooks();
        const auto frame = nt::evaluateScene(playbackDocument(), 500);
        QCOMPARE(frame.layers.size(), std::size_t{1});
        QCOMPARE(frame.layers[0].opacity, 0.5);
    }

    void dynamicReframe() {
        const auto hooks = nt::registerStandardHooks();
        const auto document = playbackDocument();
        const auto first = nt::evaluateScene(document, 0);
        const auto middle = nt::evaluateScene(document, 500);
        QCOMPARE(first.layers.size(), std::size_t{1});
        QCOMPARE(middle.layers.size(), std::size_t{1});
        const std::array<float, 4> firstCrop{0, 0, 0.5f, 1};
        const std::array<float, 4> middleCrop{0.25f, 0, 0.5f, 1};
        QCOMPARE(first.layers[0].sourceRect, firstCrop);
        QCOMPARE(middle.layers[0].sourceRect, middleCrop);
    }
    void effectsUseTheCroppedSourceRectangle() {
        const auto hooks = nt::registerStandardHooks();
        auto document = playbackDocument();
        document.clips.front().raw.insert("effects", QJsonArray{QJsonObject{{"enabled", true}, {"type", "invert"}}});
        const auto frame = nt::evaluateScene(document, 500);
        QCOMPARE(frame.layers.size(), std::size_t{1});
        QCOMPARE(frame.layers[0].ext.value("effectSourceRect").toArray(), (QJsonArray{0.25, 0, 0.5, 1}));
    }
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
#elif !defined(NT_EFFECTS_STARTUP_ONLY)
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
        }
        // Destroying the registrations removes every hook again.
        QCOMPARE(allMissing(), missingBefore);
        QCOMPARE(nt::sceneHooks().layers.size(), layersBefore);
    }
    void singleApplicationOwner() {
        const auto missingBefore = allMissing();
        {
            auto owner = nt::registerStandardHooks();
            const auto layers = nt::sceneHooks().layers.size();
            const auto redundant = nt::registerStandardHooks();
            QVERIFY(redundant.empty());
            const auto moved = std::move(owner);
            QVERIFY(owner.empty());
            QVERIFY(!moved.empty());
            QCOMPARE(nt::sceneHooks().layers.size(), layers);
            QVERIFY(allMissing().isEmpty());
        }
        QCOMPARE(allMissing(), missingBefore);
    }
#endif
};

QTEST_MAIN(TestStandardHooks)
#include "tst_standardhooks.moc"
