#include "aiassist/ProductionReview.h"
#include "aiassist/ShotPlacement.h"
#include "model/TimelineJson.h"
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>
#include <atomic>
class ProductionReviewTest : public QObject {
    Q_OBJECT
    static QJsonObject board(bool linked = false) {
        QJsonObject shot{{"id", "123456789abc123456789abc12345678"}, {"type", "shot"}, {"index", 0}, {"slug", "  Runner  "}, {"action", "A runner"}, {"render_mode", "direct"},
            {"duration_seconds", 4}, {"clip", QJsonObject{{"type", "video"}, {"asset_id", "footage"}, {"duration", 2}}}};
        if (linked) { shot.insert("script_line_ids", QJsonArray{"line"}); }
        return {{"id", "board"}, {"updatedAt", "v1"}, {"document", QJsonObject{{"shots", QJsonArray{shot}}, {"screenplay", linked ? QJsonObject{{"script_id", "script"}} : QJsonObject{}}, {"aspectRatio", "16:9"}}}};
    }
    static nt::Timeline timeline() {
        nt::Timeline result; result.raw = {{"id", "sequence"}, {"tracks", QJsonArray{}}, {"clips", QJsonArray{}}, {"durationMs", 0}}; return result;
    }
private slots:
    void placementCreatesOneLinkedPairAndPreservesTracks() {
        const QJsonObject existing{{"id", "sequence"}, {"durationMs", 0}, {"tracks", QJsonArray{QJsonObject{{"id", "video"}, {"type", "video"}, {"index", 0}, {"locked", false}}, QJsonObject{{"id", "audio"}, {"type", "audio"}, {"index", 1}}}}, {"clips", QJsonArray{
            QJsonObject{{"id", "music"}, {"trackId", "audio"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 10000}}
        }}};
        const auto result = nt::aiassist::placeStoryboardShot(existing, board(), "123456789abc", 5000);
        QVERIFY2(result.error.isEmpty(), qPrintable(result.error));
        QCOMPARE(result.addedClips.size(), 2);
        QCOMPARE(result.document.value("tracks").toArray().size(), 3);
        const auto picture = result.addedClips.at(0).toObject(); const auto audio = result.addedClips.at(1).toObject();
        QCOMPARE(picture.value("name").toString(), QString("Runner"));
        QCOMPARE(picture.value("startMs").toDouble(), 5000.0);
        QCOMPARE(picture.value("durationMs").toDouble(), 2000.0);
        QCOMPARE(picture.value("storyboardShotId").toString(), QString("123456789abc123456789abc12345678"));
        QCOMPARE(picture.value("linkId"), audio.value("linkId"));
        QCOMPARE(audio.value("mediaType").toString(), QString("audio"));
        QVERIFY(audio.value("trackId").toString() != "audio");
        QCOMPARE(result.document.value("durationMs"), existing.value("durationMs"));
        auto locked = existing; auto tracks = locked.value("tracks").toArray(); auto video = tracks.at(0).toObject(); video.insert("locked", true); tracks[0] = video; locked.insert("tracks", tracks);
        const auto refused = nt::aiassist::placeStoryboardShot(locked, board(), "123456789abc", 0, "video");
        QVERIFY(!refused.error.isEmpty()); QCOMPARE(refused.document, locked);
    }
    void readOnlyReviewShowsUnknownPriceAndExactCommitment() {
        TimelineModel model; model.setTimeline(timeline()); ProductionReview review; review.setTimeline(&model);
        std::atomic<int> reads{0};
        review.setReadCall([&reads](const QString& procedure, const QJsonObject& input) {
            ++reads;
            if (procedure != "scripts.get" || input.value("id") != "script") { return nt::server::QueryResult{{}, {"Unexpected read", "BAD_REQUEST", {}, 400}}; }
            return nt::server::QueryResult{QJsonObject{{"id", "script"}, {"updatedAt", "s1"}, {"document", QJsonObject{{"sections", QJsonArray{QJsonObject{{"lines", QJsonArray{QJsonObject{{"id", "line"}, {"currentTakeId", "take"}, {"pauseAfterMs", 500}, {"takes", QJsonArray{QJsonObject{{"id", "take"}, {"assetId", "speech"}, {"durationMs", 6500}}}}}}}}}}}}}, {}};
        });
        const QJsonObject selected{{"id", "model"}, {"provider", "provider"}};
        const auto source = board(true);
        QVERIFY(review.reviewShot(source, "123456789abc", "video", selected));
        QTRY_VERIFY(!review.busy());
        QVERIFY2(review.error().isEmpty(), qPrintable(review.error()));
        QCOMPARE(reads.load(), 1);
        const auto summary = review.summary();
        QCOMPARE(summary.value("requestCount").toInt(), 1);
        QCOMPARE(summary.value("durationSeconds").toDouble(), 7.0);
        QCOMPARE(summary.value("priceState").toString(), QString("unavailable"));
        QCOMPARE(summary.value("unpricedCount").toInt(), 1);
        QVERIFY(!summary.contains("total"));
        QCOMPARE(model.undoStack()->count(), 0);
        QVERIFY(review.approve()); QVERIFY(review.consume(source, "123456789abc", "video", selected));
        QVERIFY(!review.consume(source, "123456789abc", "video", selected));
        QVERIFY(review.reviewShot(source, "123456789abc", "video", selected)); QTRY_VERIFY(!review.busy()); QVERIFY(review.approve());
        QVERIFY(!review.consume(source, "123456789abc", "video", {{"id", "other-model"}, {"provider", "provider"}}));
        QVERIFY(review.reviewShot(source, "123456789abc", "video", selected)); model.setTimeline(timeline()); QTRY_VERIFY(!review.busy()); QVERIFY(review.summary().isEmpty()); QVERIFY(!review.approved());
    }
    void reviewApprovesEveryCompiledTake_data() {
        QTest::addColumn<int>("takeCount");
        QTest::newRow("one") << 1;
        QTest::newRow("two") << 2;
        QTest::newRow("three") << 3;
    }
    void reviewApprovesEveryCompiledTake() {
        QFETCH(int, takeCount);
        TimelineModel model; model.setTimeline(timeline()); ProductionReview review; review.setTimeline(&model);
        auto source = board(); auto document = source.value("document").toObject(); auto shots = document.value("shots").toArray(); auto shot = shots.at(0).toObject();
        shot.insert("production", QJsonObject{{"schema_version", 1}, {"speech_mode", "none"}, {"requested_take_count", takeCount}, {"duration_ms", 5500}});
        shots[0] = shot; document.insert("shots", shots); source.insert("document", document);
        const QJsonObject selected{{"id", "model"}, {"provider", "provider"}};
        QVERIFY2(review.reviewShot(source, "123456789abc", "video", selected), qPrintable(review.error()));
        const auto summary = review.summary(); const auto requests = summary.value("requests").toList();
        QCOMPARE(summary.value("requestCount").toInt(), takeCount);
        QCOMPARE(summary.value("unpricedCount").toInt(), takeCount);
        QCOMPARE(summary.value("pricedCount").toInt(), 0);
        QCOMPARE(requests.size(), takeCount);
        QCOMPARE(summary.value("requestSummaries").toList().size(), takeCount);
        for (const auto& value : requests) {
            const auto request = value.toMap(); QCOMPARE(request.value("provider").toString(), QString("provider"));
            QCOMPARE(request.value("model").toString(), QString("model")); QCOMPARE(request.value("duration").toDouble(), 5.5);
            QCOMPARE(request.value("variations").toInt(), 1);
        }
        QVERIFY(review.approve()); QVERIFY(review.consume(source, "123456789abc", "video", selected));
        QVERIFY2(review.reviewShot(source, "123456789abc", "video", selected), qPrintable(review.error())); QVERIFY(review.approve());
        auto changed = source; document = changed.value("document").toObject(); shots = document.value("shots").toArray(); shot = shots.at(0).toObject();
        auto production = shot.value("production").toObject(); production.insert("requested_take_count", takeCount == 3 ? 1 : takeCount + 1);
        shot.insert("production", production); shots[0] = shot; document.insert("shots", shots); changed.insert("document", document);
        QVERIFY(!review.consume(changed, "123456789abc", "video", selected));
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void mediaPlacementIsOneUndoAndRegistersResolvedPaths() {
        QTemporaryDir folder; QFile file(folder.filePath("media.bin")); QVERIFY(file.open(QIODevice::WriteOnly)); file.write("fixture"); file.close();
        TimelineModel model; model.setTimeline(timeline()); ProductionReview review; review.setTimeline(&model);
        review.setReadCall([](const QString& procedure, const QJsonObject& input) {
            if (procedure == "assets.get") { return nt::server::QueryResult{QJsonObject{{"id", input.value("id")}}, {}}; }
            return nt::server::QueryResult{{}, {"Unexpected read", "BAD_REQUEST", {}, 400}};
        });
        review.setMediaResolver([path = file.fileName()](nt::server::ServerClient&, const QString&, const QJsonObject&, const QJsonObject& raw, nt::assets::MediaProtection&, quint64) {
            nt::Clip result; result.raw = raw; result.mediaType = raw.value("mediaType") == "audio" ? nt::MediaType::Audio : nt::MediaType::Video;
            if (result.mediaType == nt::MediaType::Audio) { result.audioPath = path.toStdString(); } else { result.mediaPath = path.toStdString(); } return result;
        });
        QVERIFY(review.placeShot(board(), "123456789abc", 5000)); QTRY_VERIFY(!review.busy());
        QVERIFY2(review.error().isEmpty(), qPrintable(review.error()));
        QCOMPARE(model.clipCount(), 2); QCOMPARE(model.undoStack()->count(), 1);
        QVERIFY(!model.timeline().clips.at(0).mediaPath.empty()); QVERIFY(!model.timeline().clips.at(1).audioPath.empty());
        model.undoStack()->undo(); QCOMPARE(model.clipCount(), 0); QCOMPARE(model.tracks()->rowCount(), 0);
    }
};
QTEST_GUILESS_MAIN(ProductionReviewTest)
#include "tst_productionreview.moc"
