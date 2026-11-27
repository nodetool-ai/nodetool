// TimelineModel change notification costs: which edits reset the track rows,
// bump the takes revision or mark every clip changed.
#include "model/TimelineJson.h"
#include "app/EditRegistry.h"
#include "model/TimelineModel.h"
#include "midi/PianoRollController.h"
#include "music/MusicPanelModel.h"
#include <QAbstractItemModelTester>

#include <QJsonArray>
#include <QFile>
#include <QDir>
#include <QFileInfo>
#include <QJSEngine>
#include <QJsonObject>
#include <QSignalSpy>
#include <QtTest>

namespace {

QJsonObject document() {
    QJsonArray tracks;
    QJsonArray clips;
    for (int t = 0; t < 2; ++t) {
        const QString track = QStringLiteral("track-%1").arg(t);
        tracks.append(QJsonObject{{"id", track}, {"name", track}, {"type", "video"}, {"index", t}});
        for (int c = 0; c < 3; ++c) {
            clips.append(QJsonObject{{"id", QStringLiteral("clip-%1-%2").arg(t).arg(c)}, {"trackId", track},
                                     {"mediaType", "video"}, {"startMs", c * 1000}, {"durationMs", 1000},
                                     {"currentAssetId", QStringLiteral("asset-%1-%2").arg(t).arg(c)}});
        }
    }
    return QJsonObject{{"id", "seq"}, {"name", "seq"}, {"fps", 30}, {"width", 1920}, {"height", 1080},
                       {"tracks", tracks}, {"clips", clips}, {"markers", QJsonArray{}}};
}

void load(TimelineModel& model) {
    auto parsed = nt::parseTimeline(document());
    QVERIFY(parsed.timeline);
    model.setTimeline(std::move(*parsed.timeline));
}

}  // namespace

class TestTimelineModel : public QObject {
    Q_OBJECT
private slots:
    void metadataNotificationDoesNotScanClipEnds() {
        TimelineModel model;
        load(model);
        const auto visits = model.notificationClipVisits();
        QSignalSpy ends(&model, &TimelineModel::contentEndMsChanged);
        auto raw = model.timeline().raw;
        raw["name"] = "Metadata edit";
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(model.notificationClipVisits(), visits);
        QCOMPARE(ends.size(), 0);
        auto clip = model.findClip("clip-0-2")->raw;
        clip["durationMs"] = 2000;
        QVERIFY(model.patchClips({clip}));
        QCOMPARE(model.contentEndMs(), 4000.0);
        QCOMPARE(model.notificationClipVisits(), visits + 6);
        QCOMPARE(ends.size(), 1);
        clip["durationMs"] = 500;
        QVERIFY(model.patchClips({clip}));
        QCOMPARE(model.contentEndMs(), 3000.0);
        QCOMPARE(model.notificationClipVisits(), visits + 12);
        QCOMPARE(ends.size(), 2);
        raw = model.timeline().raw;
        raw["durationMs"] = 6000;
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(model.contentEndMs(), 6000.0);
        QCOMPARE(ends.size(), 3);
    }

    void transientIdsAndStructuralFlagsMatchTheDocument() {
        TimelineModel model;
        load(model);
        auto first = model.findClip("clip-0-0")->raw;
        auto second = model.findClip("clip-1-0")->raw;
        first["startMs"] = 50;
        second["startMs"] = 100;
        QVERIFY(model.previewClips({first}));
        QVERIFY(model.previewClips({second}));
        QSignalSpy notifications(&model, &TimelineModel::changed);
        model.settleTransient();
        QCOMPARE(notifications.size(), 1);
        auto changes = qvariant_cast<ChangeSet>(notifications.takeFirst()[0]);
        QCOMPARE(changes.clips.size(), 2);
        QVERIFY(changes.clipChanged("clip-0-0"));
        QVERIFY(changes.clipChanged("clip-1-0"));
        QVERIFY(!changes.clipsStructural);
        auto clips = model.clipsJson();
        const QJsonValue saved = clips[0];
        clips[0] = clips[1];
        clips[1] = saved;
        QVERIFY(model.replaceClips(clips));
        changes = qvariant_cast<ChangeSet>(notifications.takeFirst()[0]);
        QVERIFY(changes.clipsStructural);
        QVERIFY(changes.clips.isEmpty());
        clips.removeAt(0);
        QVERIFY(model.replaceClips(clips));
        notifications.clear();
        QVERIFY(!model.addMarker(100, "Cue").isEmpty());
        changes = qvariant_cast<ChangeSet>(notifications.takeFirst()[0]);
        QVERIFY(!changes.clipsStructural);
        QVERIFY(changes.clips.isEmpty());
    }

    void duplicateClipCachePreservesParsedValues() {
        TimelineModel model;
        load(model);
        QVERIFY(model.applyEdit("duplicate-cache-test", {}, [](QJsonObject raw, const QJsonObject&) {
            auto clips = raw["clips"].toArray();
            auto clip = clips[0].toObject();
            clip["name"] = "Duplicate";
            clips[0] = clip;
            clips.append(clip);
            raw["clips"] = clips;
            return raw;
        }));
        const auto raw = model.timeline().raw;
        auto parsed = nt::parseTimeline(raw);
        if (!parsed.timeline) { QFAIL("Fixture must parse"); }
        QCOMPARE(model.timeline().clips.size(), parsed.timeline->clips.size());
        for (size_t i = 0; i < parsed.timeline->clips.size(); ++i) {
            QCOMPARE(model.timeline().clips[i].raw, parsed.timeline->clips[i].raw);
            QCOMPARE(model.timeline().clips[i].id, parsed.timeline->clips[i].id);
        }
    }

    void scalarReentryNotifiesChangesInMutationOrder() {
        TimelineModel model;
        load(model);
        QSignalSpy notifications(&model, &TimelineModel::changed);
        connect(&model, &TimelineModel::nameChanged, &model, [&model] {
            auto clip = model.findClip("clip-0-0")->raw;
            clip["name"] = "Nested";
            QVERIFY(model.patchClips({clip}));
        });
        auto raw = model.timeline().raw;
        raw["name"] = "Outer";
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(notifications.size(), 2);
        const auto outer = qvariant_cast<ChangeSet>(notifications[0][0]);
        const auto inner = qvariant_cast<ChangeSet>(notifications[1][0]);
        QCOMPARE(outer.documentFields, QSet<QString>{"name"});
        QVERIFY(outer.clips.isEmpty());
        QCOMPARE(inner.documentFields, QSet<QString>{"clips"});
        QCOMPARE(inner.clips.value("clip-0-0"), QSet<QString>{"name"});
        notifications.clear();
        model.addMarker(100, "Cue");
        const auto marker = qvariant_cast<ChangeSet>(notifications[0][0]);
        QCOMPARE(marker.documentFields, QSet<QString>{"markers"});
        QVERIFY(marker.clips.isEmpty());
    }

    void resolvedMatteNotifiesItsClip() {
        TimelineModel model;
        auto raw = document();
        auto clips = raw["clips"].toArray();
        auto clip = clips[0].toObject();
        clip["generatedMatte"] = QJsonObject{{"assetId", "matte"}};
        clips[0] = clip;
        raw["clips"] = clips;
        auto parsed = nt::parseTimeline(raw);
        if (!parsed.timeline) { QFAIL("Fixture must parse"); }
        model.setTimeline(std::move(*parsed.timeline));
        QSignalSpy notifications(&model, &TimelineModel::changed);
        model.registerMatteMedia("matte", "/resolved/matte.png");
        QCOMPARE(notifications.size(), 1);
        const auto changes = qvariant_cast<ChangeSet>(notifications.first().first());
        QVERIFY(changes.clipChanged("clip-0-0"));
        QVERIFY(changes.clips.value("clip-0-0").contains("generatedMattePath"));
        QVERIFY(!changes.clipsStructural);
    }

    void registeredEditsMatchFullReload() {
        TimelineModel model;
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("mediaType", "midi");
        clip.insert("notes", QJsonArray{});
        clips[0] = clip;
        raw.insert("clips", clips);
        auto parsed = nt::parseTimeline(raw);
        if (parsed.timeline) {
            model.setTimeline(std::move(*parsed.timeline));
        } else {
            QFAIL("Invalid differential fixture");
        }
        const QJsonArray notes{QJsonObject{{"id", "note"}, {"pitch", 60}, {"velocity", 90},
                                          {"startTick", 0}, {"durationTick", 480}}};
        const QJsonArray controllers{QJsonObject{{"id", "lane"}, {"kind", "cc"}, {"cc", 7},
                                                {"points", QJsonArray{}}}};
        const QList<QPair<QString, QJsonObject>> fixtures{
            {"midi.setNotes", {{"clipId", "clip-0-0"}, {"notes", notes}}},
            {"midi.setControllers", {{"clipId", "clip-0-0"}, {"controllers", controllers}}},
            {"midi.setEvents", {{"clipId", "clip-0-0"}, {"notes", QJsonArray{}}, {"controllers", QJsonArray{}}}},
            {"set_clip_params", {{"clipId", "clip-0-0"}, {"patch", QJsonObject{{"name", "Renamed"}}}}},
            {"move_clip", {{"clipId", "clip-0-0"}, {"startMs", 100}}},
            {"trim_clip", {{"clipId", "clip-0-0"}, {"durationMs", 800}}}
        };
        const auto equivalent = [&model](const QJsonObject& expected) {
            auto parsed = nt::parseTimeline(expected);
            QVERIFY(parsed.timeline);
            TimelineModel reload;
            reload.setTimeline(std::move(*parsed.timeline));
            QCOMPARE(model.documentJson(), reload.documentJson());
            QCOMPARE(model.clipCount(), reload.clipCount());
            for (size_t i = 0; i < reload.timeline().clips.size(); ++i) {
                const auto& clip = reload.timeline().clips[i];
                const auto* actual = &model.timeline().clips[i];
                QCOMPARE(actual->id, clip.id);
                QCOMPARE(actual->name, clip.name);
                QCOMPARE(actual->raw, clip.raw);
                QCOMPARE(actual->startMs, clip.startMs);
                QCOMPARE(actual->durationMs, clip.durationMs);
            }
            const auto roles = reload.tracks()->roleNames();
            QCOMPARE(model.tracks()->rowCount(), reload.tracks()->rowCount());
            for (int row = 0; row < reload.tracks()->rowCount(); ++row) {
                for (auto it = roles.cbegin(); it != roles.cend(); ++it) {
                    QCOMPARE(model.tracks()->data(model.tracks()->index(row), it.key()),
                             reload.tracks()->data(reload.tracks()->index(row), it.key()));
                }
            }
        };
        for (const auto& fixture : fixtures) {
            const auto edit = nt::app::findEdit(fixture.first);
            QVERIFY2(edit, qPrintable(fixture.first));
            const auto before = model.timeline().raw;
            const auto expected = edit(before, fixture.second);
            QVERIFY2(expected != before, qPrintable(fixture.first));
            QSignalSpy notifications(&model, &TimelineModel::changed);
            QVERIFY(model.applyEdit(fixture.first, fixture.second));
            QCOMPARE(notifications.size(), 1);
            const auto changes = qvariant_cast<ChangeSet>(notifications.first().first());
            QVERIFY(changes.clipChanged("clip-0-0"));
            QVERIFY(!changes.clipChanged("clip-1-0"));
            QVERIFY(!changes.clipsStructural);
            const auto oldClip = before.value("clips").toArray()[0].toObject();
            const auto newClip = expected.value("clips").toArray()[0].toObject();
            QSet<QString> fields;
            for (auto it = oldClip.begin(); it != oldClip.end(); ++it) {
                if (newClip.value(it.key()) != it.value()) { fields.insert(it.key()); }
            }
            for (auto it = newClip.begin(); it != newClip.end(); ++it) {
                if (oldClip.value(it.key()) != it.value()) { fields.insert(it.key()); }
            }
            QCOMPARE(changes.clips.value("clip-0-0"), fields);
            QCOMPARE(changes.noteClipIds.contains("clip-0-0"), fields.contains("notes"));
            equivalent(expected);
            notifications.clear();
            model.undoStack()->undo();
            QCOMPARE(notifications.size(), 1);
            const auto undone = qvariant_cast<ChangeSet>(notifications[0][0]);
            QCOMPARE(undone.clips, changes.clips);
            QCOMPARE(undone.noteClipIds, changes.noteClipIds);
            QCOMPARE(undone.documentFields, changes.documentFields);
            QCOMPARE(undone.clipsStructural, changes.clipsStructural);
            equivalent(before);
            notifications.clear();
            model.undoStack()->redo();
            QCOMPARE(notifications.size(), 1);
            const auto redone = qvariant_cast<ChangeSet>(notifications[0][0]);
            QCOMPARE(redone.clips, changes.clips);
            QCOMPARE(redone.noteClipIds, changes.noteClipIds);
            QCOMPARE(redone.documentFields, changes.documentFields);
            QCOMPARE(redone.clipsStructural, changes.clipsStructural);
            equivalent(expected);
        }
    }

    void takeInputsFollowDocumentAndSelection() {
        TimelineModel model;
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("mediaType", "audio");
        clip.insert("durationMs", 8000);
        clip.insert("versions", QJsonArray{QJsonObject{{"id", "take"}, {"label", "Take"},
            {"musicGeneration", QJsonObject{{"task", "repaint"}, {"contextStartFrame", 0},
                {"contextEndFrame", 384000}, {"alignment", QJsonObject{{"drifting", true}, {"lastBeatErrorMs", 42}}}}}}});
        clips[0] = clip;
        raw.insert("clips", clips);
        raw.insert("tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}});
        auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        MusicSelection selection;
        selection.set("track-0", 0, 48000);
        MusicPanelModel panel;
        panel.setTimeline(&model);
        panel.setSelection(&selection);
        QCOMPARE(panel.takes().size(), 1);
        const auto takes = panel.takes();
        QVERIFY(takes[0].toMap().value("drifting").toBool());
        selection.set("track-0", 48000, 96000);
        QCOMPARE(panel.takes(), takes);
        raw.insert("fps", 60);
        raw.insert("sections", QJsonArray{QJsonObject{{"name", "Verse"}}});
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(panel.takes(), takes);
        raw.insert("tempo", QJsonObject{{"bpm", 60}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}});
        QVERIFY(model.settleDocument(raw));
        QVERIFY(panel.takes()[0].toMap().value("contextLabel") != takes[0].toMap().value("contextLabel"));
        auto tracks = raw.value("tracks").toArray();
        auto track = tracks[0].toObject();
        track.insert("name", "Renamed");
        tracks[0] = track;
        raw.insert("tracks", tracks);
        QVERIFY(model.settleDocument(raw));
        QVERIFY(panel.takeClipTitle().startsWith("Renamed"));
        selection.set("track-0", 480000, 528000);
        QVERIFY(panel.takes().isEmpty());
        QCOMPARE(panel.takeRows()->rowCount(), 0);
    }

    void takeRowsShrinkDuplicateIds() {
        MusicTakeModel rows;
        QAbstractItemModelTester tester(&rows, QAbstractItemModelTester::FailureReportingMode::QtTest);
        for (const auto& id : {QString(), QStringLiteral("duplicate")}) {
            const QVariantMap take{{"id", id}, {"label", "Take"}};
            rows.apply({take, take, take});
            rows.apply({take});
            QCOMPARE(rows.rowCount(), 1);
            QCOMPARE(rows.data(rows.index(0), Qt::UserRole).toMap(), take);
        }
    }

    void takeRowsPreserveUnchangedRows() {
        MusicTakeModel rows;
        QAbstractItemModelTester tester(&rows, QAbstractItemModelTester::FailureReportingMode::QtTest);
        QVariantList takes;
        for (int i = 0; i < 1000; ++i) {
            takes.append(QVariantMap{{"id", QString::number(i)}, {"label", "Take"}, {"active", i == 0}});
        }
        rows.apply(takes);
        QSignalSpy reset(&rows, &QAbstractItemModel::modelReset);
        QSignalSpy changed(&rows, &QAbstractItemModel::dataChanged);
        QSignalSpy inserted(&rows, &QAbstractItemModel::rowsInserted);
        QSignalSpy removed(&rows, &QAbstractItemModel::rowsRemoved);
        rows.apply(takes);
        QCOMPARE(changed.count(), 0);
        QCOMPARE(reset.count(), 0);
        auto first = takes[0].toMap();
        first.insert("active", false);
        takes[0] = first;
        auto second = takes[1].toMap();
        second.insert("active", true);
        takes[1] = second;
        rows.apply(takes);
        QCOMPARE(changed.count(), 2);
        QCOMPARE(inserted.count(), 0);
        QCOMPARE(removed.count(), 0);
        takes.removeAt(10);
        rows.apply(takes);
        QCOMPARE(removed.count(), 1);
        QCOMPARE(reset.count(), 0);
        QCOMPARE(rows.rowCount(), 999);
        qInfo() << "Take active switch: 1000 replaced rows ->" << changed.count() << "changed rows";
    }

    void stepEditorIndexesEventsOnceForAllLanes() {
        QFile file(QDir(QFileInfo(QStringLiteral(__FILE__)).absolutePath()).filePath("../qml/pianoroll/StepEditorModel.js"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        auto source = QString::fromUtf8(file.readAll());
        source.remove(".pragma library");
        QJSEngine js;
        QVERIFY2(!js.evaluate(source).isError(), "Step Editor module must load");
        const auto result = js.evaluate(R"(
            var visits=0;
            var notes=Array.from({length:4096}, (_,i)=>({id:String(i),get pitch(){++visits;return i%128;},startTick:i,durationTick:1}));
            var index=eventIndex(notes,[],[],0,4096);
            var count=0;
            for(var p=0;p<128;++p) count+=index['note:'+p].length;
            count===4096 && visits===4096;
        )");
        QVERIFY2(!result.isError(), qPrintable(result.toString()));
        QVERIFY(result.toBool());
        qInfo() << "Step lane pitch visits: 524288 ->" << js.globalObject().property("visits").toInt();
    }

    void pianoRollIgnoresUnrelatedEdits() {
        TimelineModel model;
        auto raw = document();
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("mediaType", "midi");
        QJsonArray notes;
        for (int i = 0; i < 4096; ++i) {
            notes.append(QJsonObject{{"id", QString::number(i)}, {"pitch", 60},
                                     {"velocity", 100}, {"startTick", i * 120}, {"durationTick", 120}});
        }
        clip.insert("notes", notes);
        clips.replace(0, clip);
        raw.insert("clips", clips);
        auto parsed = nt::parseTimeline(raw);
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PianoRollController controller;
        controller.setTimeline(&model);
        controller.setClipId("clip-0-0");
        QCOMPARE(controller.notes().size(), 4096);
        QSignalSpy changed(&controller, &PianoRollController::clipChanged);
        QSignalSpy noteChanges(&controller, &PianoRollController::notesChanged);
        QSignalSpy controllerChanges(&controller, &PianoRollController::controllersChanged);
        raw.insert("name", "Another sequence name");
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(changed.count(), 0);
        auto other = clips[1].toObject();
        other.insert("name", "Another clip name");
        clips.replace(1, other);
        raw.insert("clips", clips);
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(changed.count(), 0);
        clip.insert("name", "Renamed MIDI");
        clips.replace(0, clip);
        raw.insert("clips", clips);
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(changed.count(), 1);
        QCOMPARE(controller.clipName(), QStringLiteral("Renamed MIDI"));
        QCOMPARE(noteChanges.count(), 0);
        QCOMPARE(controllerChanges.count(), 0);
        QCOMPARE(controller.notes().size(), 4096);
        changed.clear();
        model.setReadOnly(true);
        QCOMPARE(changed.count(), 1);
        QVERIFY(!controller.editable());
        model.setReadOnly(false);
        QCOMPARE(changed.count(), 2);
        QVERIFY(controller.editable());
        raw.insert("tempo", QJsonObject{{"bpm", 120}, {"key", QJsonObject{{"tonic", "F#"}}}});
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(controller.keyTonic(), QStringLiteral("F#"));
        TimelineModel readOnly;
        auto replacement = nt::parseTimeline(raw);
        QVERIFY(replacement.timeline);
        readOnly.setTimeline(std::move(*replacement.timeline));
        readOnly.setReadOnly(true);
        changed.clear();
        controller.setTimeline(&readOnly);
        QCOMPARE(changed.count(), 1);
        QVERIFY(!controller.editable());
    }

    // F7: muting a track updates one row; no reset, no clip re-parse, no takes change.
    void trackEditUpdatesOnlyItsRow() {
        TimelineModel model;
        load(model);
        const auto takes = model.takesRevision();
        const QJsonObject before = model.snapshot()->clips.front().raw;
        QSignalSpy reset(model.tracks(), &QAbstractItemModel::modelReset);
        QSignalSpy rows(model.tracks(), &QAbstractItemModel::dataChanged);
        QSignalSpy clips(&model, &TimelineModel::clipsChanged);
        auto raw = model.timeline().raw;
        auto tracks = raw.value("tracks").toArray();
        auto track = tracks.at(1).toObject();
        track.insert("muted", true);
        tracks.replace(1, track);
        raw.insert("tracks", tracks);
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(reset.count(), 0);
        QCOMPARE(rows.count(), 1);
        QCOMPARE(rows.front().at(0).value<QModelIndex>().row(), 1);
        QCOMPARE(clips.count(), 1);
        QCOMPARE(model.takesRevision(), takes);
        QVERIFY(!model.clipTouched(QStringLiteral("clip-0-0")));
        QVERIFY(!model.trackTouched(QStringLiteral("track-1")));
        QVERIFY(model.timeline().tracks[1].muted);
        QCOMPARE(model.snapshot()->clips.front().raw, before);
        QCOMPARE(model.timeline().raw, raw);
    }

    // A new track still resets the rows.
    void addedTrackResetsTheRows() {
        TimelineModel model;
        load(model);
        QSignalSpy reset(model.tracks(), &QAbstractItemModel::modelReset);
        auto raw = model.timeline().raw;
        auto tracks = raw.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "track-2"}, {"name", "track-2"}, {"type", "audio"}, {"index", 2}});
        raw.insert("tracks", tracks);
        QVERIFY(model.settleDocument(raw));
        QCOMPARE(reset.count(), 1);
        QCOMPARE(model.tracks()->rowCount(), 3);
    }

    // F12: a marker edit leaves the clip change state and the takes alone.
    void markerEditTouchesNoClip() {
        TimelineModel model;
        load(model);
        auto clips = model.clipsJson();
        auto clip = clips.at(0).toObject();
        clip.insert("startMs", 50);
        QVERIFY(model.patchClips(QJsonArray{clip}));
        const auto takes = model.takesRevision();
        QSignalSpy markers(&model, &TimelineModel::markersChanged);
        model.addMarker(100, QStringLiteral("m"));
        QCOMPARE(markers.count(), 1);
        QCOMPARE(model.takesRevision(), takes);
        QVERIFY(model.clipTouched(QStringLiteral("clip-0-0")));
        QVERIFY(!model.clipTouched(QStringLiteral("clip-1-0")));
    }

    // F9: resolved media marks only its clip and track, and no takes change.
    void registeredMediaTouchesOnlyItsClip() {
        TimelineModel model;
        load(model);
        const auto takes = model.takesRevision();
        nt::Clip media = *model.findClip(QStringLiteral("clip-1-2"));
        media.mediaPath = "/resolved/clip.mp4";
        QSignalSpy clips(&model, &TimelineModel::clipsChanged);
        model.registerMedia(media);
        QCOMPARE(clips.count(), 1);
        QCOMPARE(model.takesRevision(), takes);
        QVERIFY(model.clipTouched(QStringLiteral("clip-1-2")));
        QVERIFY(!model.clipTouched(QStringLiteral("clip-1-0")));
        QVERIFY(model.trackTouched(QStringLiteral("track-1")));
        QVERIFY(!model.trackTouched(QStringLiteral("track-0")));
        QCOMPARE(model.findClip(QStringLiteral("clip-1-2"))->mediaPath, std::string("/resolved/clip.mp4"));
    }

    void clipParamsIsOneUndoCommand() {
        TimelineModel model;
        load(model);
        const auto before = model.timeline().raw;
        QVERIFY(model.applyEdit("set_clip_params", {{"target", "clip-0-0"}, {"startMs", 100},
            {"durationMs", 500}, {"inPointMs", 250}, {"outPointMs", 750},
            {"transform", QJsonObject{{"rotation", 30}}}, {"borderRadius", 8}}));
        QCOMPARE(model.undoStack()->count(), 1);
        const auto after = model.timeline().raw;
        QJsonObject edited;
        for (const auto& value : after.value("clips").toArray()) {
            if (value.toObject().value("id").toString() == u"clip-0-0") { edited = value.toObject(); }
        }
        QCOMPARE(edited.value("startMs").toDouble(), 100.0);
        QCOMPARE(edited.value("durationMs").toDouble(), 500.0);
        QCOMPARE(edited.value("inPointMs").toDouble(), 250.0);
        QCOMPARE(edited.value("outPointMs").toDouble(), 750.0);
        QCOMPARE(edited.value("transform").toObject().value("rotation").toDouble(), 30.0);
        QCOMPARE(edited.value("borderRadius").toDouble(), 8.0);
        model.undoStack()->undo();
        QCOMPARE(model.timeline().raw, before);
        model.undoStack()->redo();
        QCOMPARE(model.timeline().raw, after);
    }
    // F13: moveClip finds the clip by id and makes one undo entry.
    void moveClipIsOneEdit() {
        TimelineModel model;
        load(model);
        QVERIFY(model.moveClip(QStringLiteral("clip-1-1"), 4000));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.findClip(QStringLiteral("clip-1-1"))->startMs, 4000.0);
        QVERIFY(!model.moveClip(QStringLiteral("missing"), 0));
    }

    // A read-only document (a viewer's cloud timeline) takes no edit, and
    // its cleared history cannot change it either.
    void readOnlyTakesNoEdit() {
        TimelineModel model;
        load(model);
        QVERIFY(model.moveClip(QStringLiteral("clip-1-1"), 4000));
        QSignalSpy changed(&model, &TimelineModel::readOnlyChanged);
        model.setReadOnly(true);
        QCOMPARE(changed.count(), 1);
        QVERIFY(model.readOnly());
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(!model.moveClip(QStringLiteral("clip-1-1"), 0));
        QVERIFY(model.addMarker(100, QStringLiteral("m")).isEmpty());
        QCOMPARE(model.applyEdit(QStringLiteral("restoreDocument"), QJsonObject{{"document", document()}}), 0u);
        QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(model.findClip(QStringLiteral("clip-1-1"))->startMs, 4000.0);
        QVERIFY(model.markersJson().isEmpty());
        model.setReadOnly(false);
        QVERIFY(model.moveClip(QStringLiteral("clip-1-1"), 0));
    }

    void markerChangesNotifyTimelineSource() {
        TimelineModel model;
        load(model);
        QSignalSpy changed(&model, &TimelineSource::sourceChanged);
        const auto before = model.snapshot();
        QVERIFY(!model.addMarker(1000, QStringLiteral("Cue")).isEmpty());
        QVERIFY(model.snapshot() != before);
        QCOMPARE(changed.count(), 1);
        model.undoStack()->undo();
        QVERIFY(model.markersJson().isEmpty());
        QCOMPARE(changed.count(), 2);
    }

    // The preview and the audio read the model as a TimelineSource: each
    // timelineChanged and previewChanged reaches them as sourceChanged.
    void sourceForwardsEveryChange() {
        TimelineModel model;
        TimelineSource& source = model;
        QSignalSpy sourceChanged(&source, &TimelineSource::sourceChanged);
        QSignalSpy timelineChanged(&model, &TimelineModel::timelineChanged);
        QSignalSpy previewChanged(&model, &TimelineModel::previewChanged);
        load(model);
        QCOMPARE(sourceChanged.count(), 1);
        QCOMPARE(source.documentGeneration(), model.documentGeneration());
        QVERIFY(model.moveClip(QStringLiteral("clip-1-1"), 4000));
        QCOMPARE(sourceChanged.count(), 2);
        QCOMPARE(source.snapshot(), model.snapshot());
        QJsonObject clip = model.findClip(QStringLiteral("clip-0-0"))->raw;
        clip["startMs"] = 500;
        QVERIFY(model.previewClips(QJsonArray{clip}));
        QCOMPARE(previewChanged.count(), 1);
        QCOMPARE(sourceChanged.count(), 3);
        QCOMPARE(source.snapshot()->findClip("clip-0-0")->startMs, 500.0);
        QCOMPARE(sourceChanged.count(), timelineChanged.count() + previewChanged.count());
    }
};

QTEST_GUILESS_MAIN(TestTimelineModel)
#include "tst_timelinemodel.moc"
