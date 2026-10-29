#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include "model/TimelineJson.h"
#include "app/EditRegistry.h"
#include <QJsonDocument>
#include <QJSEngine>
#include <QtTest>

namespace {
nt::Timeline document() {
    return *nt::parseTimelineJson(R"({"name":"hooks","fps":30,"width":100,"height":100,"tracks":[{"id":"v","type":"video"}],"clips":[]})").timeline;
}
QJsonObject droppedClip() {
    return {{"id", "new"}, {"trackId", "v"}, {"mediaType", "video"}, {"startMs", 0}, {"durationMs", 1000},
            {"currentAssetId", "asset"}, {"status", "generated"}};
}
}
class TestModelHooks : public QObject {
    Q_OBJECT
private slots:
    void settlementSurvivesUndoRedo() {
        TimelineModel model;
        model.setTimeline(document());
        const auto token = model.commitEdit("Drop", {}, QJsonArray{droppedClip()});
        QVERIFY(token);
        auto settled = model.timeline().raw;
        auto clip = droppedClip();
        clip.insert("name", "settled");
        settled.insert("clips", QJsonArray{clip});
        QVERIFY(model.settleCommand(token, settled));
        model.undoStack()->undo();
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, settled);
        QCOMPARE(model.undoStack()->count(), 1);
    }
    void undoneSettlementDoesNotChangeCurrentDocument() {
        TimelineModel model;
        model.setTimeline(document());
        QVERIFY(nt::app::registerEdit("hooks.drop", [](QJsonObject raw, const QJsonObject&) {
            raw.insert("clips", QJsonArray{droppedClip()}); return raw;
        }));
        const auto token = model.applyEdit("hooks.drop", {});
        QVERIFY(token);
        auto settled = model.timeline().raw;
        settled.insert("name", "settled document");
        model.undoStack()->undo();
        const auto undone = model.timeline().raw;
        QVERIFY(model.settleCommand(token, settled));
        QCOMPARE(model.timeline().raw, undone);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, settled);
    }
    void mergedAndStaleTokens() {
        TimelineModel model;
        model.setTimeline(document());
        const auto first = model.commitEdit("Drop", {}, QJsonArray{droppedClip()}, 42);
        auto moved = droppedClip(); moved.insert("startMs", 100);
        const auto continuation = model.commitEdit("Move", model.clipsJson(), QJsonArray{moved}, 42, true);
        QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(continuation != first);
        const auto current = model.timeline().raw;
        auto rejected = current; rejected.insert("name", "must not apply");
        QVERIFY(!model.settleCommand(first, rejected));
        QCOMPARE(model.timeline().raw, current);
        QVERIFY(!model.settleCommand(0, rejected));
        QCOMPARE(model.timeline().raw, current);
        QVERIFY(!model.settleCommand(9999999, rejected));
        QCOMPARE(model.timeline().raw, current);
        auto invalid = current; invalid.insert("fps", -1);
        QVERIFY(!model.settleCommand(continuation, invalid));
        QCOMPARE(model.timeline().raw, current);
        auto settled = current; settled.insert("name", "merged settled");
        QVERIFY(model.settleCommand(continuation, settled));
        model.undoStack()->undo(); model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, settled);
        model.setTimeline(document());
        QVERIFY(!model.settleCommand(continuation, settled));
        const auto discarded = model.commitEdit("Drop", {}, QJsonArray{droppedClip()});
        model.undoStack()->undo();
        model.addMarker(0, "branch");
        QVERIFY(!model.settleCommand(discarded, settled));
    }
    void laterCommandMakesSettlementStale() {
        TimelineModel model; model.setTimeline(document());
        const auto first = model.commitEdit("Drop", {}, QJsonArray{droppedClip()});
        auto settled = model.timeline().raw; settled.insert("name", "settled");
        auto moved = droppedClip(); moved.insert("startMs", 100);
        QVERIFY(model.commitEdit("Move", model.clipsJson(), QJsonArray{moved}));
        const auto current = model.timeline().raw;
        QVERIFY(!model.settleCommand(first, settled));
        QCOMPARE(model.timeline().raw, current);
        model.undoStack()->undo();
        const auto undone = model.timeline().raw;
        QVERIFY(!model.settleCommand(first, settled));
        QCOMPARE(model.timeline().raw, undone);
    }
    void tokenPreservesCppAndQmlTruthiness() {
        TimelineModel model;
        model.setTimeline(document());
        QVERIFY(nt::app::registerEdit("hooks.rename", [](QJsonObject raw, const QJsonObject& payload) {
            raw.insert("name", payload.value("name")); return raw;
        }));
        bool cppResult = model.applyEdit("hooks.rename", {{"name", "cpp"}});
        QVERIFY(cppResult);
        QJSEngine engine;
        QJSEngine::setObjectOwnership(&model, QJSEngine::CppOwnership);
        engine.globalObject().setProperty("model", engine.newQObject(&model));
        const auto success = engine.evaluate("!!model.applyEdit('hooks.rename', {name:'qml'})");
        QVERIFY2(!success.isError(), qPrintable(success.toString()));
        QVERIFY(success.toBool());
        const auto noChange = engine.evaluate("!!model.applyEdit('hooks.rename', {name:'qml'})");
        QVERIFY(!noChange.isError());
        QVERIFY(!noChange.toBool());
        QVERIFY(!model.applyEdit("missing", {}));
    }
    void mattePathSurvivesReparseWithoutChangingDocument() {
        auto timeline = document();
        auto clip = droppedClip();
        clip.insert("generatedMatte", QJsonObject{{"assetId", "cccccccccccccccccccccccccccccccc"}, {"unknown", 42}});
        timeline.raw.insert("clips", QJsonArray{clip});
        auto parsed = nt::parseTimelineJson(QJsonDocument(timeline.raw).toJson());
        QVERIFY(parsed.timeline);
        parsed.timeline->clips.front().generatedMattePath = "/cache/matte.mp4";
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        const auto before = model.documentJson();
        auto edited = model.clipsJson();
        auto changed = edited[0].toObject();
        changed.insert("name", "edited");
        edited[0] = changed;
        QVERIFY(model.commitEdit("Rename", model.clipsJson(), edited));
        QCOMPARE(model.timeline().clips.front().generatedMattePath, std::string("/cache/matte.mp4"));
        model.undoStack()->undo();
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.timeline().clips.front().generatedMattePath, std::string("/cache/matte.mp4"));
        auto replacement = model.clipsJson();
        auto replacementClip = replacement[0].toObject();
        auto matte = replacementClip.value("generatedMatte").toObject();
        matte.insert("assetId", "dddddddddddddddddddddddddddddddd");
        replacementClip.insert("generatedMatte", matte);
        replacement[0] = replacementClip;
        QVERIFY(model.commitEdit("Replace matte", model.clipsJson(), replacement));
        QVERIFY(model.timeline().clips.front().generatedMattePath.empty());
        const auto replacementDocument = model.documentJson();
        model.registerMatteMedia("dddddddddddddddddddddddddddddddd", "/cache/second.mp4");
        QCOMPARE(model.documentJson(), replacementDocument);
        QCOMPARE(model.timeline().clips.front().generatedMattePath, std::string("/cache/second.mp4"));
        model.undoStack()->undo();
        QCOMPARE(model.timeline().clips.front().generatedMattePath, std::string("/cache/matte.mp4"));
        model.undoStack()->redo();
        QCOMPARE(model.timeline().clips.front().generatedMattePath, std::string("/cache/second.mp4"));
    }
    void registerMediaKeepsHistory() {
        TimelineModel model;
        model.setTimeline(document());
        const auto generation = model.documentGeneration();
        const auto before = model.clipsJson();
        QVERIFY(model.commitEdit("Drop", before, QJsonArray{droppedClip()}));
        QVERIFY(model.snapshot()->clips.front().mediaPath.empty());
        auto media = model.timeline().clips.front();
        media.mediaPath = "/resolved/video.mp4";
        media.audioPath = "/resolved/audio.wav";
        model.registerMedia(media);
        QCOMPARE(model.snapshot()->clips.front().mediaPath, std::string("/resolved/video.mp4"));
        QCOMPARE(model.snapshot()->clips.front().audioPath, std::string("/resolved/audio.wav"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.documentGeneration(), generation);
        model.undoStack()->undo();
        model.undoStack()->redo();
        QCOMPARE(model.snapshot()->clips.front().mediaPath, media.mediaPath);
    }
};
QTEST_GUILESS_MAIN(TestModelHooks)
#include "tst_modelhooks.moc"
