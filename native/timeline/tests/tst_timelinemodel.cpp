// TimelineModel change notification costs: which edits reset the track rows,
// bump the takes revision or mark every clip changed.
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QJsonArray>
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

    // F13: moveClip finds the clip by id and makes one undo entry.
    void moveClipIsOneEdit() {
        TimelineModel model;
        load(model);
        QVERIFY(model.moveClip(QStringLiteral("clip-1-1"), 4000));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.findClip(QStringLiteral("clip-1-1"))->startMs, 4000.0);
        QVERIFY(!model.moveClip(QStringLiteral("missing"), 0));
    }
};

QTEST_GUILESS_MAIN(TestTimelineModel)
#include "tst_timelinemodel.moc"
