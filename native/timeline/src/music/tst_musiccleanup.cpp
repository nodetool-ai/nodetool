// The clean-up command (MUSIC-MODE.md TK-5, MR8, MR10): which unused takes
// and context bounces it lists, which it keeps and why, the take-removal
// edit, and deletion on the server only once the autosave holds the edit.
// The scripted server answers with the tRPC shapes of packages/websocket:
// `assets.search` pages ({assets, next_cursor}), `assets.get` rows with
// `size`, `assets.delete`, and `timeline.update` ({updatedAt}), as
// tests/tst_autosave.cpp serves them.

#include "../../tests/TestHttpServer.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "music/MusicCleanup.h"
#include "music/MusicCleanupPlan.h"
#include "server/AutosaveController.h"

#include <QElapsedTimer>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QUndoStack>
#include <QUrlQuery>
#include <QtTest>

using namespace nt::music;

namespace {

const QString kSequence = QStringLiteral("99999999999900000000000000000009");

QString hex(int n) { return QStringLiteral("%1").arg(n, 32, 16, QLatin1Char('0')); }

QJsonObject record(const QString& context = {}, const QString& spliceParent = {}) {
    QJsonObject r{{"task", spliceParent.isEmpty() ? "text2music" : "repaint"}, {"backend", "acestep.cpp@07abf07"}, {"steps", 8},
                  {"bpm", 120}, {"beatsPerBar", 4}, {"beatUnit", 4}, {"seed", 1}, {"candidateIndex", 0}, {"segmentIndex", 0},
                  {"targetStartFrame", 0}, {"targetEndFrame", 96000}, {"requestFrames", 480000}};
    if (!context.isEmpty()) r.insert("contextAssetId", context);
    if (!spliceParent.isEmpty()) {
        r.insert("splice", QJsonObject{{"parentAssetId", spliceParent}, {"startFrame", 0}, {"endFrame", 96000}, {"crossfadeFrames", 960}});
    }
    return r;
}

QJsonObject take(const QString& id, const QString& asset, const QJsonObject& generation = record()) {
    QJsonObject t{{"id", id}, {"assetId", asset}, {"status", "success"}, {"createdAt", "2026-11-12T00:00:00.000Z"},
                  {"label", "Take " + id}, {"source", "generated"}};
    if (!generation.isEmpty()) t.insert("musicGeneration", generation);
    return t;
}

QJsonObject clip(const QString& id, const QString& trackId, double startMs, const QString& current, const QString& active,
                 const QJsonArray& versions) {
    QJsonObject c{{"id", id}, {"trackId", trackId}, {"name", "clip " + id}, {"mediaType", "audio"}, {"sourceType", "generated"},
                  {"startMs", startMs}, {"durationMs", 2000}, {"inPointMs", 0}, {"outPointMs", 2000}, {"status", "generated"},
                  {"locked", false}, {"currentAssetId", current}, {"versions", versions}};
    if (!active.isEmpty()) c.insert("activeTakeId", active);
    return c;
}

QJsonObject track(const QString& id, int index, bool locked = false) {
    return {{"id", id}, {"name", id}, {"type", "audio"}, {"index", index}, {"visible", true}, {"locked", locked}};
}

QJsonObject sequence(const QJsonArray& clips) {
    return {{"id", kSequence}, {"name", "Song"}, {"fps", 30}, {"width", 1920}, {"height", 1080}, {"durationMs", 0},
            {"tempo", QJsonObject{{"bpm", 120}, {"offsetMs", 0}, {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}}}},
            {"music", QJsonObject{}},
            {"tracks", QJsonArray{track("a", 0), track("locked", 1, true)}},
            {"clips", clips},
            {"markers", QJsonArray{}}};
}

QJsonObject contextRow(const QString& id, const QString& sequenceId, qint64 size, bool marked = true) {
    QJsonObject metadata{{"sequence_id", sequenceId}, {"bounce", "mix"}};
    if (marked) metadata.insert("generation_context", "music");
    return {{"id", id}, {"name", "music-mix-context-" + id.right(2) + ".wav"}, {"content_type", "audio/wav"}, {"size", size},
            {"metadata", metadata}};
}

// a1 .. a13 are take audio, c1 .. c6 context bounces.
const QString a1 = hex(0xa1), a2 = hex(0xa2), a3 = hex(0xa3), a4 = hex(0xa4), a5 = hex(0xa5), a7 = hex(0xa7), a8 = hex(0xa8),
              a9 = hex(0xa9), a10 = hex(0xaa), a11 = hex(0xab), a12 = hex(0xac);
const QString c1 = hex(0xc1), c2 = hex(0xc2), c3 = hex(0xc3), c4 = hex(0xc4), c5 = hex(0xc5), c6 = hex(0xc6);

// Every case the plan decides, in one document.
QJsonObject fixture() {
    return sequence({
        // t1 is active; its record names context c1 and splice parent a3, so t3 stays.
        clip("k1", "a", 0, a1, "t1",
             {take("t1", a1, record(c1, a3)), take("t2", a2, record(c2)), take("t3", a3), take("t4", a4, {})}),
        // t6 holds the audio of k1's active take; t7's audio is held by a job, and its record names a8, so t8 stays too.
        clip("k2", "a", 2000, a5, "t5",
             {take("t5", a5), take("t6", a1), take("t7", a7, record({}, a8)), take("t8", a8)}),
        clip("k3", "locked", 0, hex(0xb0), "", {take("t9", a9)}),
        // No activeTakeId: the current asset marks the active take. t11 and t12 share a11.
        clip("k4", "a", 4000, a10, "", {take("t10", a10), take("t11", a11), take("t13", a12)}),
        clip("k5", "a", 6000, hex(0xb1), "", {take("t12", a11)}),
        // A clip that names a12 outside any take.
        QJsonObject{{"id", "k6"}, {"trackId", "a"}, {"name", "ref"}, {"mediaType", "audio"}, {"startMs", 8000}, {"durationMs", 1000},
                    {"mediaUrl", "asset://" + a12}},
    });
}

QJsonArray contextRows() {
    return {contextRow(c1, kSequence, 10), contextRow(c2, kSequence, 20), contextRow(c3, kSequence, 30),
            contextRow(c4, "other-sequence", 40), contextRow(c5, kSequence, 50, false), contextRow(c6, kSequence, 60)};
}

QHash<QString, QString> keptByTake(const CleanupPlan& plan) {
    QHash<QString, QString> out;
    for (const auto& t : plan.takes) out.insert(t.takeId, t.keptReason);
    return out;
}

std::unique_ptr<TimelineModel> model(const QJsonObject& document) {
    const auto parsed = nt::parseTimelineJson(QJsonDocument(document).toJson(QJsonDocument::Compact));
    if (!parsed.timeline) qFatal("%s", qPrintable(parsed.error));
    auto timeline = std::make_unique<TimelineModel>();
    timeline->setTimeline(*parsed.timeline);
    return timeline;
}

QJsonObject clipIn(const QJsonObject& raw, const QString& id) {
    for (const auto& value : raw.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == id) return value.toObject();
    }
    return {};
}

QStringList takeIds(const QJsonObject& clip) {
    QStringList ids;
    for (const auto& value : clip.value("versions").toArray()) ids.append(value.toObject().value("id").toString());
    return ids;
}

}  // namespace

class TestMusicCleanup : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;

private slots:
    void initTestCase() {
        QVERIFY(m_dir.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", m_dir.filePath("preferences.ini").toUtf8());
    }

    void listsAndProtects() {
        const auto plan = planTakeCleanup(fixture(), contextRows(), {a7, c3});
        const auto kept = keptByTake(plan);
        // Active takes and takes with no music record are never listed.
        QCOMPARE(QSet<QString>(kept.keyBegin(), kept.keyEnd()),
                 QSet<QString>({"t2", "t3", "t6", "t7", "t8", "t9", "t11", "t12", "t13"}));
        for (const auto* removed : {"t2", "t11", "t12"}) QVERIFY2(kept.value(removed).isEmpty(), removed);
        QCOMPARE(kept.value("t3"), QString("Another clip or take still uses this audio."));
        QCOMPARE(kept.value("t6"), QString("Another clip or take still uses this audio."));
        QCOMPARE(kept.value("t7"), QString("A music job still holds this audio."));
        QCOMPARE(kept.value("t8"), QString("Another clip or take still uses this audio."));
        QCOMPARE(kept.value("t9"), QString("Its clip or track is locked."));
        QCOMPARE(kept.value("t13"), QString("Another clip or take still uses this audio."));

        // Contexts of this sequence only, and only marked ones.
        QHash<QString, QString> contexts;
        for (const auto& context : plan.contexts) contexts.insert(context.assetId, context.keptReason);
        QCOMPARE(QSet<QString>(contexts.keyBegin(), contexts.keyEnd()), QSet<QString>({c1, c2, c3, c6}));
        QCOMPARE(contexts.value(c1), QString("A take that stays names it as its context."));
        QCOMPARE(contexts.value(c3), QString("A music job still needs it."));
        QVERIFY(contexts.value(c2).isEmpty());
        QVERIFY(contexts.value(c6).isEmpty());

        // Shared audio is deleted once; take audio first.
        QCOMPARE(plan.deleteAssetIds, QStringList({a2, a11, c2, c6}));
        QCOMPARE(plan.removal().value("takes").toArray().size(), 3);
    }

    void keptTakeKeepsWhatItsRecordNames() {
        // t1 stays (locked clip) and names t2's audio as its splice parent and c1 as context.
        auto raw = sequence({clip("k1", "locked", 0, hex(0xb0), "", {take("t1", a1, record(c1, a2))}),
                             clip("k2", "a", 0, hex(0xb1), "", {take("t2", a2)})});
        auto plan = planTakeCleanup(raw, {contextRow(c1, kSequence, 1)}, {});
        QCOMPARE(keptByTake(plan).value("t2"), QString("Another clip or take still uses this audio."));
        QVERIFY(plan.deleteAssetIds.isEmpty());
        // Unlocked, both go, and so does the context only their records named.
        auto tracks = raw.value("tracks").toArray();
        tracks[1] = track("locked", 1, false);
        raw.insert("tracks", tracks);
        plan = planTakeCleanup(raw, {contextRow(c1, kSequence, 1)}, {});
        QCOMPARE(plan.deleteAssetIds, QStringList({a1, a2, c1}));
    }

    void namedIdsInsideText() {
        const QJsonObject doc{{"url", "https://host/api/storage/" + a1 + ".wav"}, {"list", QJsonArray{a2}},
                              {"longer", a3 + "0"}, {"prefix", a4.left(12)}};
        QCOMPARE(namedAssetIds(doc, {a1, a2, a3, a4}), QSet<QString>({a1, a2}));
    }

    void removeTakesEdit() {
        auto timeline = model(fixture());
        const QJsonObject payload{{"takes", QJsonArray{QJsonObject{{"clipId", "k1"}, {"takeId", "t2"}},
                                                       QJsonObject{{"clipId", "k1"}, {"takeId", "t1"}},  // active
                                                       QJsonObject{{"clipId", "k3"}, {"takeId", "t9"}},  // locked track
                                                       QJsonObject{{"clipId", "k4"}, {"takeId", "t10"}}, // current asset
                                                       QJsonObject{{"clipId", "k5"}, {"takeId", "t12"}}}}};
        QVERIFY(timeline->applyEdit("music.removeTakes", payload));
        QCOMPARE(timeline->undoStack()->count(), 1);
        const auto& raw = timeline->timeline().raw;
        QCOMPARE(takeIds(clipIn(raw, "k1")), QStringList({"t1", "t3", "t4"}));
        QCOMPARE(takeIds(clipIn(raw, "k3")), QStringList({"t9"}));
        QCOMPARE(takeIds(clipIn(raw, "k4")), QStringList({"t10", "t11", "t13"}));
        QCOMPARE(takeIds(clipIn(raw, "k5")), QStringList());
        QCOMPARE(clipIn(raw, "k1").value("activeTakeId").toString(), QString("t1"));
        timeline->undoStack()->undo();
        QCOMPARE(takeIds(clipIn(timeline->timeline().raw, "k1")), QStringList({"t1", "t2", "t3", "t4"}));
        // Nothing to remove is no edit.
        QVERIFY(!timeline->applyEdit("music.removeTakes", {{"takes", QJsonArray{QJsonObject{{"clipId", "k1"}, {"takeId", "t1"}}}}}));
        QVERIFY(!timeline->applyEdit("music.removeTakes", {}));
    }

    // A long chain of splice parents and many clips: the plan stays linear.
    void largeDocument() {
        QJsonArray clips;
        constexpr int kClips = 3000;
        for (int i = 0; i < kClips; ++i) {
            const auto base = 0x100000 + i * 4;
            // Take i-1 is the splice parent of take i, so keeping the last keeps them all.
            const auto generation = i == 0 ? record(hex(0x900000)) : record(hex(0x900000 + i), hex(0x100000 + (i - 1) * 4 + 1));
            clips.append(clip(QString::number(i), i == kClips - 1 ? "locked" : "a", i * 2000.0, hex(base), "",
                              {take("x" + QString::number(i), hex(base + 1), generation),
                               take("y" + QString::number(i), hex(base + 2))}));
        }
        QJsonArray contexts;
        for (int i = 0; i < kClips; ++i) contexts.append(contextRow(hex(0x900000 + i), kSequence, 1));
        QElapsedTimer timer;
        timer.start();
        const auto plan = planTakeCleanup(sequence(clips), contexts, {});
        QVERIFY2(timer.elapsed() < 5000, qPrintable(QString::number(timer.elapsed())));
        int kept = 0;
        for (const auto& t : plan.takes) kept += t.keptReason.isEmpty() ? 0 : 1;
        QCOMPARE(plan.takes.size(), 2 * kClips);
        QCOMPARE(kept, kClips + 1);  // every x take through the chain, and the locked clip's y take
        QCOMPARE(plan.deleteAssetIds.size(), kClips - 1);  // the other y takes; every context is named by a kept x take
    }

    // The whole command: scan with sizes, the edit, nothing deleted before the
    // save, the deletions after it, and nothing deleted after an undo.
    void deletesOnlyAfterTheSave_data() {
        QTest::addColumn<bool>("undoFirst");
        QTest::newRow("saved") << false;
        QTest::newRow("undone before the save") << true;
    }
    void deletesOnlyAfterTheSave() {
        QFETCH(bool, undoFirst);
        TestHttpServer http;
        QStringList deletes;
        int saves = 0;
        const auto rows = contextRows();
        http.setJson([&](const QByteArray& path, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            QJsonValue result;
            if (path == "/trpc/assets.search") {
                result = QJsonObject{{"assets", rows}, {"next_cursor", QJsonValue::Null}};
            } else if (path == "/trpc/assets.get") {
                result = QJsonObject{{"id", input.value("id")}, {"name", "take.wav"}, {"content_type", "audio/wav"}, {"size", 1048576}};
            }
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", result}}}}).toJson();
        });
        http.setPost([&](const QByteArray& path, const QByteArray& body) {
            const auto input = QJsonDocument::fromJson(body).object();
            if (path == "/trpc/assets.delete") {
                deletes.append(input.value("id").toString());
                return QByteArray(R"({"result":{"data":{"deleted_asset_ids":[]}}})");
            }
            if (path == "/trpc/timeline.update") {
                ++saves;
                return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", QJsonObject{{"updatedAt", QString("u%1").arg(saves)}}}}}}).toJson();
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
        auto timeline = model(fixture());
        const nt::server::SaveTarget target{http.base(), {}, kSequence, m_dir.path(), {}};
        nt::server::AutosaveController save(target, timeline->undoStack(), [&timeline] { return timeline->timeline().raw; }, "u0");
        save.setQuitFallbackDirs({m_dir.filePath("fallback")});
        save.setExternalSync(false);
        save.setAutosave(false);
        connect(timeline.get(), &TimelineModel::commandSettled, &save, &nt::server::AutosaveController::documentChanged);

        MusicCleanup cleanup;
        cleanup.setTimeline(timeline.get());
        cleanup.setServerTarget(target);
        cleanup.setAutosave(&save);
        QVERIFY(cleanup.scan());
        QTRY_COMPARE(cleanup.state(), QString("ready"));
        // No job holds anything here, so t7 and t8 go too (compare listsAndProtects).
        QCOMPARE(cleanup.removeCount(), 5);
        QCOMPARE(cleanup.deleteCount(), 7);
        // Take audio at 1 MiB each from assets.get, the contexts from the search rows.
        QCOMPARE(cleanup.deleteBytes(), 4.0 * 1048576 + 20 + 30 + 60);
        QCOMPARE(cleanup.takes().size(), 9);
        QCOMPARE(cleanup.contexts().size(), 4);
        for (const auto& value : cleanup.takes()) {
            const auto row = value.toMap();
            QCOMPARE(row.value("sizeBytes").toDouble(), 1048576.0);
            QCOMPARE(row.value("kept").toBool(), !row.value("reason").toString().isEmpty());
        }

        QVERIFY(cleanup.confirm());
        QCOMPARE(cleanup.state(), QString("saving"));
        QCOMPARE(timeline->undoStack()->count(), 1);
        QCOMPARE(takeIds(clipIn(timeline->timeline().raw, "k1")), QStringList({"t1", "t3", "t4"}));
        QVERIFY(save.dirty());
        QTest::qWait(100);
        QVERIFY(deletes.isEmpty());

        if (undoFirst) timeline->undoStack()->undo();
        QVERIFY(save.saveNow().ok);
        QTRY_COMPARE(cleanup.state(), QString("done"));
        if (undoFirst) {
            QVERIFY(deletes.isEmpty());
            QVERIFY2(cleanup.message().contains("undone"), qPrintable(cleanup.message()));
        } else {
            QCOMPARE(QSet<QString>(deletes.cbegin(), deletes.cend()), QSet<QString>({a2, a7, a8, a11, c2, c3, c6}));
            QCOMPARE(deletes.size(), 7);
            QVERIFY2(cleanup.message().startsWith("Deleted 7 audio files"), qPrintable(cleanup.message()));
        }
    }

    void refusesAChangedSequence() {
        TestHttpServer http;
        http.setJson([](const QByteArray& path, const QUrl&) {
            const QJsonValue result = path == "/trpc/assets.search" ? QJsonValue(QJsonObject{{"assets", QJsonArray{}}, {"next_cursor", QJsonValue::Null}})
                                                                    : QJsonValue(QJsonObject{{"size", 1}});
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", result}}}}).toJson();
        });
        auto timeline = model(fixture());
        const nt::server::SaveTarget target{http.base(), {}, kSequence, m_dir.path(), {}};
        nt::server::AutosaveController save(target, timeline->undoStack(), [&timeline] { return timeline->timeline().raw; }, "u0");
        save.setExternalSync(false);
        save.setAutosave(false);
        MusicCleanup cleanup;
        cleanup.setTimeline(timeline.get());
        cleanup.setServerTarget(target);
        cleanup.setAutosave(&save);
        QVERIFY(cleanup.scan());
        QTRY_COMPARE(cleanup.state(), QString("ready"));
        QCOMPARE(cleanup.removeCount(), 5);
        // Another take becomes unused after the listing: confirm shows the new list and changes nothing.
        QVERIFY(timeline->applyEdit("music.removeTakes", {{"takes", QJsonArray{QJsonObject{{"clipId", "k5"}, {"takeId", "t12"}}}}}));
        const auto before = timeline->timeline().raw;
        QVERIFY(!cleanup.confirm());
        QCOMPARE(cleanup.state(), QString("ready"));
        QVERIFY(cleanup.message().contains("changed"));
        QCOMPARE(timeline->timeline().raw, before);
        QCOMPARE(cleanup.removeCount(), 4);
        // Without an autosave nothing is removed.
        cleanup.setAutosave(nullptr);
        QVERIFY(!cleanup.confirm());
        QCOMPARE(timeline->timeline().raw, before);
    }
};

QTEST_MAIN(TestMusicCleanup)
#include "tst_musiccleanup.moc"
