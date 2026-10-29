#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "app/EditRegistry.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtTest>
#include <QFile>
#include <QTemporaryDir>
#include <QSignalSpy>
#include "app/startup/LocalDocumentSaver.h"

class TestPreviewModel : public QObject {
    Q_OBJECT
  private slots:
    void localSaverIgnoresPreview() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Preview","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,"motionBlur":{"samplesPerFrame":4,"shutterAngle":180}}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("document.json");
        nt::app::LocalDocumentSaver saver(model,path,60000);
        auto before = model.clipsJson();
        auto after = before;
        auto clip = after[0].toObject();
        clip.insert("externalUnknown",42);
        after[0] = clip;
        QVERIFY(model.commitEdit("metadata",before,after));
        auto preview = model.clipsJson();
        clip = preview[0].toObject();
        auto blur = clip["motionBlur"].toObject();
        blur.insert("samplesPerFrame",8);
        clip.insert("motionBlur",blur);
        preview[0] = clip;
        QVERIFY(model.replaceClips(preview));
        QVERIFY(saver.flush());
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto stored = QJsonDocument::fromJson(file.readAll()).object()["clips"].toArray()[0].toObject();
        QCOMPARE(stored["externalUnknown"].toInt(),42);
        QCOMPARE(stored["motionBlur"].toObject()["samplesPerFrame"].toInt(),4);
        file.close();
        QVERIFY(model.replaceClips(after));
        model.undoStack()->undo();
        QVERIFY(saver.flush());
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto undone = QJsonDocument::fromJson(file.readAll()).object()["clips"].toArray()[0].toObject();
        QVERIFY(!undone.contains("externalUnknown"));
        QCOMPARE(undone["motionBlur"].toObject()["samplesPerFrame"].toInt(),4);
        file.close();
        model.undoStack()->redo();
        QVERIFY(saver.flush());
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto redone = QJsonDocument::fromJson(file.readAll()).object()["clips"].toArray()[0].toObject();
        QCOMPARE(redone["externalUnknown"].toInt(),42);
        QCOMPARE(redone["motionBlur"].toObject()["samplesPerFrame"].toInt(),4);
    }
    void markerAndSettlementDuringPreview() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Preview","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,"value":4}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        QTemporaryDir dir; QVERIFY(dir.isValid());
        const auto path = dir.filePath("marker.json");
        nt::app::LocalDocumentSaver saver(model,path,60000);
        const auto committed = model.clipsJson();
        auto preview = committed;
        auto clip = preview[0].toObject(); clip.insert("value",8); preview[0] = clip;
        bool gesturing = false;
        QObject::connect(&model,&TimelineModel::beforeCommand,&model,[&] {
            if (gesturing) { gesturing = false; model.replaceClips(committed); }
        });
        gesturing = true; QVERIFY(model.replaceClips(preview));
        QVERIFY(!model.addMarker(200,"Mark").isEmpty());
        QVERIFY(!gesturing);
        QVERIFY(saver.flush());
        QFile file(path); QVERIFY(file.open(QIODevice::ReadOnly));
        auto disk = QJsonDocument::fromJson(file.readAll()).object(); file.close();
        QCOMPARE(disk["clips"].toArray()[0].toObject()["value"].toInt(),4);
        QCOMPARE(disk["markers"].toArray().size(),1);
        gesturing = true; QVERIFY(model.replaceClips(preview));
        model.undoStack()->undo();
        QVERIFY(!gesturing);
        QCOMPARE(model.clipsJson(),committed);
        model.undoStack()->redo();
        gesturing = true; QVERIFY(model.replaceClips(preview));
        auto incoming = QJsonDocument::fromJson(model.documentJson()).object();
        auto invalid = incoming; invalid.insert("fps", 0);
        QVERIFY(!model.settleDocument(invalid));
        QVERIFY(gesturing);
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),8);
        incoming.insert("externalUnknown",42);
        QVERIFY(model.settleDocument(incoming));
        QVERIFY(!gesturing);
        QVERIFY(saver.flush());
        QVERIFY(file.open(QIODevice::ReadOnly));
        disk = QJsonDocument::fromJson(file.readAll()).object();
        QCOMPARE(disk["externalUnknown"].toInt(),42);
        QCOMPARE(disk["clips"].toArray()[0].toObject()["value"].toInt(),4);
    }
    void settleCurrentAndInactiveCommand() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Preview","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,"value":4}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model; model.setTimeline(std::move(*parsed.timeline));
        auto base = model.clipsJson();
        auto after = base; auto clip = after[0].toObject(); clip.insert("marker",1); after[0] = clip;
        const auto token = model.commitEdit("edit",base,after); QVERIFY(token);
        auto preview = after; clip.insert("value",8); preview[0] = clip;
        auto restore = after;
        bool gesturing = false;
        QObject::connect(&model,&TimelineModel::beforeCommand,&model,[&] {
            if (gesturing) { gesturing = false; model.replaceClips(restore); }
        });
        gesturing = true; QVERIFY(model.replaceClips(preview));
        auto settled = QJsonDocument::fromJson(model.documentJson()).object(); settled.insert("unknown",42);
        QVERIFY(model.settleCommand(token,settled));
        QVERIFY(!gesturing);
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        QCOMPARE(QJsonDocument::fromJson(model.documentJson()).object()["unknown"].toInt(),42);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        model.undoStack()->redo();
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        const auto committedAfter = QJsonDocument::fromJson(model.documentJson()).object();
        model.undoStack()->undo();
        restore = base;
        auto inactivePreview = base; auto inactiveClip = inactivePreview[0].toObject();
        inactiveClip.insert("value",8); inactivePreview[0] = inactiveClip;
        gesturing = true; QVERIFY(model.replaceClips(inactivePreview));
        QVERIFY(model.settleCommand(token,committedAfter));
        QVERIFY(gesturing);
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),8);
        model.undoStack()->redo();
        QVERIFY(!gesturing);
        QCOMPARE(QJsonDocument::fromJson(model.documentJson()).object(),committedAfter);
    }
    void precomputedDeltaAndNoop() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Preview","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,"value":4}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto committed = model.clipsJson();
        auto preview = committed;
        auto clip = preview[0].toObject();
        clip.insert("value",8);
        preview[0] = clip;
        QVERIFY(model.replaceClips(preview));
        int cancellations = 0;
        bool gesturing = true;
        QObject::connect(&model,&TimelineModel::beforeCommand,&model,[&] {
            if (gesturing) { gesturing = false; ++cancellations; model.replaceClips(committed); }
        });
        QSignalSpy preparations(&model,&TimelineModel::beforeCommand);
        QVERIFY(nt::app::registerEdit("test.preview.noop",[](QJsonObject raw, QJsonObject) { return raw; }));
        QVERIFY(!model.applyEdit("test.preview.noop",{}));
        QVERIFY(!model.commitEdit("noop",preview,preview));
        QCOMPARE(cancellations,0);
        QCOMPARE(preparations.count(),0);
        auto after = preview;
        clip.insert("externalUnknown",42);
        after[0] = clip;
        QVERIFY(model.commitEdit("external",preview,after));
        QCOMPARE(cancellations,1);
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        QCOMPARE(model.clipsJson()[0].toObject()["externalUnknown"].toInt(),42);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(),committed);
        model.undoStack()->redo();
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        QCOMPARE(model.clipsJson()[0].toObject()["externalUnknown"].toInt(),42);
    }
    void relativeEditUsesCommittedState() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Preview","width":640,"height":360,"fps":30,"durationMs":1000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[{"id":"c","trackId":"v","mediaType":"image","startMs":0,"durationMs":1000,"value":4}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(std::move(*parsed.timeline));
        const auto committed = model.clipsJson();
        auto preview = committed;
        auto clip = preview[0].toObject();
        clip.insert("value",8);
        preview[0] = clip;
        QVERIFY(model.replaceClips(preview));
        QObject::connect(&model,&TimelineModel::beforeCommand,&model,[&] { model.replaceClips(committed); });
        QVERIFY(nt::app::registerEdit("test.preview.increment",[](QJsonObject raw, QJsonObject) {
            auto clips = raw["clips"].toArray();
            auto first = clips[0].toObject();
            first.insert("value",first["value"].toInt()+1);
            clips[0] = first;
            raw.insert("clips",clips);
            return raw;
        }));
        QVERIFY(model.applyEdit("test.preview.increment",{}));
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),5);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),4);
        model.undoStack()->redo();
        QCOMPARE(model.clipsJson()[0].toObject()["value"].toInt(),5);
    }
};
QTEST_APPLESS_MAIN(TestPreviewModel)
#include "tst_previewmodel.moc"
