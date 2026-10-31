#include "storyworkspace/StoryDrafts.h"
#include <QJsonArray>
#include <QtTest>

using namespace nt::storyworkspace;
namespace {
const QString shotId = "123456789abc123456789abc12345678";
const QString entityId = "abcdef123456abcdef123456abcdef12";
QJsonObject board() {
    return {{"id", "board"}, {"updatedAt", "revision"}, {"document", QJsonObject{
        {"entityIds", QJsonArray{entityId}},
        {"screenplay", QJsonObject{{"shots", QJsonArray{QJsonObject{{"id", shotId}, {"action", "Original direction"}}}}}},
        {"shots", QJsonArray{QJsonObject{{"id", shotId}, {"action", "A person walks"}, {"entity_ids", QJsonArray{entityId}},
            {"camera", QJsonObject{{"angle", "low"}, {"future", true}}},
            {"clip_versions", QJsonArray{QJsonObject{{"asset_id", "take"}}}}, {"future", "retained"}}}}}}};
}
QJsonObject shot(const QJsonObject& resource) { return resource.value("document").toObject().value("shots").toArray().first().toObject(); }
}
class StoryDraftTest : public QObject {
    Q_OBJECT
private slots:
    void largeBoardEditsKeepOrderAndRemoveAssociations() {
        QJsonArray ids, shots;
        for (int i = 0; i < 10000; ++i) {
            const auto id = QString("%1").arg(i + 1, 32, 16, QChar('0'));
            ids.append(id); shots.append(QJsonObject{{"id", id}, {"action", "Original"}, {"entity_ids", QJsonArray{id}}});
        }
        const QJsonObject source{{"id", "large-board"}, {"updatedAt", "base"}, {"document", QJsonObject{{"shots", shots}, {"entityIds", ids}}}};
        const auto edited = patchShot(source, ids.last().toString(), "action", "Last shot");
        QVERIFY(edited.ok());
        const auto updatedShots = edited.resource.value("document").toObject().value("shots").toArray();
        QCOMPARE(updatedShots.size(), 10000); QCOMPARE(updatedShots.first(), shots.first());
        QCOMPARE(updatedShots.last().toObject().value("action").toString(), QString("Last shot"));
        const auto removed = patchDocument(edited.resource, "entityIds", QJsonArray{});
        QVERIFY(removed.ok());
        for (const auto& shot : removed.resource.value("document").toObject().value("shots").toArray()) { QVERIFY(shot.toObject().value("entity_ids").toArray().isEmpty()); }
    }
    void shotEditsRetainMediaAndOriginalScreenplay() {
        const auto source = board();
        const auto updated = patchShot(source, shotId.left(12), "camera.framing", "wide");
        QVERIFY2(updated.ok(), qPrintable(updated.error));
        auto expected = source;
        auto document = expected.value("document").toObject(); auto shots = document.value("shots").toArray();
        auto first = shots.first().toObject(); auto camera = first.value("camera").toObject(); camera.insert("framing", "wide");
        first.insert("camera", camera); shots[0] = first; document.insert("shots", shots); expected.insert("document", document);
        QCOMPARE(updated.resource, expected);
        const auto timed = patchShot(updated.resource, shotId, "duration_seconds", 3.25);
        QVERIFY(timed.ok()); QCOMPARE(shot(timed.resource).value("duration_source").toString(), QString("manual"));
    }
    void rejectsUnsupportedInvalidAndAmbiguousEdits() {
        for (const auto& field : {"id", "clip", "clip_versions", "status", "future"}) { QVERIFY(!patchShot(board(), shotId, field, "overwrite").ok()); }
        for (const auto& value : {QJsonValue(0), QJsonValue(-1), QJsonValue("4"), QJsonValue(QJsonValue::Null)}) { QVERIFY(!patchShot(board(), shotId, "duration_seconds", value).ok()); }
        QVERIFY(!patchShot(board(), "missing", "action", "text").ok());
        auto source = board(); auto document = source.value("document").toObject(); auto shots = document.value("shots").toArray();
        shots.append(QJsonObject{{"id", "123456789abcffffffffffffffffffff"}}); document.insert("shots", shots); source.insert("document", document);
        QVERIFY(!patchShot(source, shotId.left(12), "action", "text").ok());
        QVERIFY(!patchShot(board(), shotId, "entity_ids", QJsonArray{entityId.left(12)}).ok());
        QVERIFY(!patchShot(board(), shotId, "entity_ids", QJsonArray{entityId, entityId}).ok());
    }
    void referenceShapesAreValidatedWithoutDroppingUnknownFields() {
        const QJsonArray refs{QJsonObject{{"uri", "asset://" + entityId}, {"name", "Costume"}, {"revision", "v2"}, {"future", true}}};
        const auto result = patchShot(board(), shotId, "production.references", refs);
        QVERIFY(result.ok()); QCOMPARE(shot(result.resource).value("production").toObject().value("references").toArray(), refs);
        const auto production = shot(result.resource).value("production").toObject();
        QCOMPARE(production.value("schema_version").toInt(), 1);
        QCOMPARE(production.value("speech_mode").toString(), QString("none"));
        QCOMPARE(production.value("requested_take_count").toInt(), 1);
        QVERIFY(!patchShot(board(), shotId, "production.references", QJsonArray{QJsonObject{{"uri", " "}}}).ok());
        QVERIFY(!patchShot(board(), shotId, "production.references", QJsonArray{QJsonObject{{"uri", "asset://" + entityId.left(12)}}}).ok());
        QVERIFY(!patchShot(board(), shotId, "production.references", QJsonArray{QJsonObject{{"uri", "asset://a"}, {"revision", 7}}}).ok());
        QVERIFY(!patchShot(board(), shotId, "production.reference_bindings", QJsonArray{QJsonObject{{"asset_id", entityId}, {"kind", "prop"}}}).ok());
        const QJsonArray bindings{QJsonObject{{"asset_id", entityId}, {"kind", "character"}, {"entity_id", entityId}}};
        QVERIFY(patchShot(board(), shotId, "production.reference_bindings", bindings).ok());
    }
    void speakerLinksPreserveVoiceAndLines() {
        const QJsonObject source{{"id", "script"}, {"updatedAt", "rev"}, {"document", QJsonObject{{"cast", QJsonArray{QJsonObject{
            {"id", "speaker"}, {"name", "Alice"}, {"voice", QJsonObject{{"voice", "alloy"}}}, {"future", true}}}}, {"sections", QJsonArray{}}}}};
        auto result = patchSpeaker(source, "speaker", "entityId", entityId);
        QVERIFY(result.ok());
        auto speaker = result.resource.value("document").toObject().value("cast").toArray().first().toObject();
        QCOMPARE(speaker.value("entityId").toString(), entityId); QVERIFY(speaker.value("future").toBool()); QVERIFY(speaker.value("voice").isObject());
        QVERIFY(!patchSpeaker(source, "speaker", "entityId", entityId.left(12)).ok());
        QVERIFY(!patchSpeaker(source, "speaker", "voice", "replace").ok());
    }
    void entityEditPreservesAssetIdentityAndMetadata() {
        const QJsonObject source{{"id", entityId}, {"metadata", QJsonObject{{"other", true}, {"nodetool_entity", QJsonObject{
            {"kind", "character"}, {"descriptor", "Old"}, {"future", true}, {"reference_asset_id", "reference"}}}}}};
        const auto result = patchEntity(source, "descriptor", "New");
        QVERIFY(result.ok()); QCOMPARE(result.resource.value("id").toString(), entityId);
        const auto metadata = result.resource.value("metadata").toObject(); QVERIFY(metadata.value("other").toBool());
        const auto marker = metadata.value("nodetool_entity").toObject(); QVERIFY(marker.value("future").toBool()); QCOMPARE(marker.value("reference_asset_id").toString(), QString("reference"));
        QVERIFY(!patchEntity(source, "kind", "style").ok());
        QVERIFY(!patchEntity({}, "name", "Alice").ok());
        const auto reset = patchEntity(source, "reference_asset_id", QJsonValue::Null);
        QVERIFY(reset.ok()); QVERIFY(!reset.resource.value("metadata").toObject().value("nodetool_entity").toObject().contains("reference_asset_id"));
    }
    void removingBoardEntityAlsoRemovesShotAssociation() {
        const auto result = patchDocument(board(), "entityIds", QJsonArray{});
        QVERIFY(result.ok()); QCOMPARE(shot(result.resource).value("entity_ids").toArray(), QJsonArray{});
        QCOMPARE(result.resource.value("document").toObject().value("screenplay"), board().value("document").toObject().value("screenplay"));
        QVERIFY(!patchDocument(board(), "entityIds", QJsonArray{entityId.left(12)}).ok());
    }
    void shotDraftSetsAndClearsFieldsInOneEdit() {
        const auto result = applyShotDraft(board(), shotId, QJsonObject{{"action", "A person runs"}, {"slug", "Run"}, {"duration_seconds", 4.5},
            {"duration_source", "manual"}, {"camera", QJsonObject{{"framing", "wide"}}}, {"render_mode", "direct"}, {"notes", QJsonValue::Null}});
        QVERIFY2(result.ok(), qPrintable(result.error));
        const auto edited = shot(result.resource);
        QCOMPARE(edited.value("action").toString(), QString("A person runs")); QCOMPARE(edited.value("slug").toString(), QString("Run"));
        QCOMPARE(edited.value("camera").toObject(), (QJsonObject{{"framing", "wide"}})); QCOMPARE(edited.value("render_mode").toString(), QString("direct"));
        QCOMPARE(edited.value("future").toString(), QString("retained")); QVERIFY(!edited.contains("notes"));
        const auto cleared = applyShotDraft(result.resource, shotId, QJsonObject{{"camera", QJsonValue::Null}, {"slug", QJsonValue::Null}});
        QVERIFY(cleared.ok()); QVERIFY(!shot(cleared.resource).contains("camera")); QVERIFY(!shot(cleared.resource).contains("slug"));
        QVERIFY(!applyShotDraft(board(), shotId, QJsonObject{{"status", "rendered"}}).ok());
        QVERIFY(!applyShotDraft(board(), shotId, QJsonObject{{"duration_seconds", -1}}).ok());
        QVERIFY(!applyShotDraft(board(), shotId, QJsonObject{{"render_mode", "other"}}).ok());
    }
    void nudgeSwapsWithinSceneAndRenumbers() {
        QJsonArray shots;
        for (const auto& [id, scene] : {std::pair{"a", "one"}, {"b", "one"}, {"c", "two"}}) { shots.append(QJsonObject{{"id", id}, {"scene_id", scene}, {"index", int(shots.size())}}); }
        const QJsonObject source{{"id", "board"}, {"document", QJsonObject{{"shots", shots}}}};
        const auto order = [](const QJsonObject& resource) { QStringList ids; for (const auto& value : resource.value("document").toObject().value("shots").toArray()) { ids.append(value.toObject().value("id").toString() + QString::number(value.toObject().value("index").toInt())); } return ids; };
        const auto later = nudgeShot(source, "a", 1);
        QVERIFY(later.ok()); QCOMPARE(order(later.resource), (QStringList{"b0", "a1", "c2"}));
        QVERIFY(!nudgeShot(later.resource, "a", 1).ok());
        QVERIFY(!nudgeShot(source, "c", -1).ok());
    }
    void removingSelectedTakePromotesTheNextOne() {
        const QJsonObject source{{"id", "board"}, {"document", QJsonObject{{"shots", QJsonArray{QJsonObject{{"id", "s"}, {"status", "keyframe_ready"},
            {"keyframe", QJsonObject{{"asset_id", "one"}}}, {"keyframe_versions", QJsonArray{QJsonObject{{"asset_id", "one"}}, QJsonObject{{"asset_id", "two"}}}}}}}}}};
        const auto promoted = removeShotVersion(source, "s", "image", 0);
        QVERIFY(promoted.ok());
        QCOMPARE(shot(promoted.resource).value("keyframe").toObject().value("asset_id").toString(), QString("two"));
        const auto empty = removeShotVersion(promoted.resource, "s", "image", 0);
        QVERIFY(empty.ok()); QVERIFY(shot(empty.resource).value("keyframe").isNull());
        QCOMPARE(shot(empty.resource).value("status").toString(), QString("planned"));
        QVERIFY(!removeShotVersion(empty.resource, "s", "image", 0).ok());
        const QJsonObject clips{{"id", "board"}, {"document", QJsonObject{{"shots", QJsonArray{QJsonObject{{"id", "s"}, {"status", "rendered"}, {"keyframe", QJsonObject{{"asset_id", "k"}}},
            {"clip", QJsonObject{{"asset_id", "v"}}}}}}}}};
        const auto noClip = removeShotVersion(clips, "s", "video", 0);
        QVERIFY(noClip.ok()); QCOMPARE(shot(noClip.resource).value("status").toString(), QString("keyframe_ready"));
        QCOMPARE(shot(noClip.resource).value("clip_versions").toArray(), QJsonArray{});
    }
    void boardEditsInsertDuplicateRemoveAndMoveShots() {
        QJsonArray shots;
        for (const auto& [id, scene] : {std::pair{"a", "one"}, {"b", "one"}, {"c", "two"}}) { shots.append(QJsonObject{{"id", id}, {"scene_id", scene}, {"index", int(shots.size())}, {"action", QString(id).toUpper()}}); }
        const QJsonObject source{{"id", "board"}, {"name", "Film"}, {"document", QJsonObject{{"shots", shots}}}};
        const auto order = [](const QJsonObject& resource) { QStringList ids; for (const auto& value : resource.value("document").toObject().value("shots").toArray()) { const auto shot = value.toObject(); ids.append(shot.value("id").toString() + ":" + shot.value("scene_id").toString() + QString::number(shot.value("index").toInt())); } return ids; };
        const auto inserted = insertShot(source, "a", "n");
        QVERIFY(inserted.ok()); QCOMPARE(order(inserted.resource), (QStringList{"a:one0", "n:one1", "b:one2", "c:two3"}));
        QCOMPARE(insertShot(source, "", "z").resource.value("document").toObject().value("shots").toArray().last().toObject().value("scene_id").toString(), QString("two"));
        auto annotated = source; auto document = annotated.value("document").toObject(); auto list = document.value("shots").toArray();
        auto first = list.first().toObject(); first.insert("script_line_ids", QJsonArray{"line"}); first.insert("covered_by", QJsonObject{{"shot_id", "x"}}); list[0] = first;
        document.insert("shots", list); annotated.insert("document", document);
        const auto copied = duplicateShot(annotated, "a", "copy");
        QVERIFY(copied.ok()); QCOMPARE(order(copied.resource), (QStringList{"a:one0", "copy:one1", "b:one2", "c:two3"}));
        const auto copy = copied.resource.value("document").toObject().value("shots").toArray().at(1).toObject();
        QCOMPARE(copy.value("action").toString(), QString("A")); QVERIFY(!copy.contains("script_line_ids")); QVERIFY(!copy.contains("covered_by"));
        QCOMPARE(copy.value("duration_source").toString(), QString("manual"));
        const auto removed = removeShot(copied.resource, "a");
        QVERIFY(removed.ok()); QCOMPARE(order(removed.resource), (QStringList{"copy:one0", "b:one1", "c:two2"}));
        const auto moved = moveShot(source, "a", "two", 1);
        QVERIFY(moved.ok()); QCOMPARE(order(moved.resource), (QStringList{"b:one0", "c:two1", "a:two2"}));
        QVERIFY(!removeShot(source, "missing").ok());
    }
    void boardSettingsChangeNameAndDocumentFields() {
        const QJsonObject source{{"id", "board"}, {"name", "Film"}, {"document", QJsonObject{{"shots", QJsonArray{}}, {"brief", ""}}}};
        const auto named = patchBoard(source, "name", "New film");
        QVERIFY(named.ok()); QCOMPARE(named.resource.value("name").toString(), QString("New film"));
        QVERIFY(!patchBoard(source, "name", "  ").ok());
        const auto styled = patchBoard(source, "style", "noir");
        QVERIFY(styled.ok()); QCOMPARE(styled.resource.value("document").toObject().value("style").toString(), QString("noir"));
        QVERIFY(patchBoard(source, "aspectRatio", "9:16").ok());
        QVERIFY(!patchBoard(source, "aspectRatio", "wide").ok());
        QVERIFY(!patchBoard(source, "shots", QJsonArray{}).ok());
    }
};
QTEST_GUILESS_MAIN(StoryDraftTest)
#include "tst_storydrafts.moc"
