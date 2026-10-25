// The editor's clip actions (src/edit/EditActions) on cases the web store
// differential cannot reach: native refusals that must be atomic (a linked
// unit, a group tree) and the media-track ownership guard on drops.
#include "edit/EditActions.h"

#include <QJsonArray>
#include <QTest>

using namespace nt::edit;

namespace {

QJsonObject clip(const QString& id, const QString& track, double start, double duration,
                 const QString& mediaType = QStringLiteral("video")) {
    return {{"id", id},         {"trackId", track},           {"name", id},          {"startMs", start},
            {"durationMs", duration}, {"mediaType", mediaType}, {"sourceType", "imported"}, {"status", "generated"},
            {"versions", QJsonArray()}};
}

EditDoc docOf(ClipList clips) {
    EditDoc doc;
    doc.clips = std::move(clips);
    doc.tracks = {{"v1", "video", false}, {"v2", "video", false}, {"a1", "audio", false}};
    return doc;
}

const QJsonObject* find(const ClipList& clips, const QString& id) {
    for (const auto& c : clips)
        if (clipId(c) == id) return &c;
    return nullptr;
}

QJsonArray sourceAnchoredAnimation() {
    return {QJsonObject{{"id", "anim"},
                        {"role", "emphasis"},
                        {"preset", "custom"},
                        {"custom", QJsonObject{{"timeBase", "source"},
                                               {"curves", QJsonArray{QJsonObject{{"property", "opacity"}}}}}}}};
}

}  // namespace

class TestEditActions : public QObject {
    Q_OBJECT

private slots:
    // F3: a linked unit splits whole or not at all.
    void aLinkedUnitSplitsWholeOrNotAtAll() {
        QJsonObject video = clip("v", "v1", 0, 2000);
        video.insert("linkId", "L");
        QJsonObject audio = clip("a", "a1", 0, 2000, "audio");
        audio.insert("linkId", "L");
        audio.insert("animations", sourceAnchoredAnimation());  // the native split refuses it
        const EditDoc doc = docOf({video, audio});
        QCOMPARE(splitClipAtTime(doc, "v", 1000), doc.clips);
        QCOMPARE(splitSelectedAtPlayhead(doc, 1000, {"v"}).clips, doc.clips);
        QCOMPARE(splitSelectedAtPlayhead(doc, 1000, {}).clips, doc.clips);
        // Without the refusal both halves of the unit split, with fresh links.
        audio.remove("animations");
        const ClipList split = splitClipAtTime(docOf({video, audio}), "v", 1000);
        QCOMPARE(split.size(), size_t(4));
    }

    // F4: a drop never splits or removes a clip that owns a media track (its
    // `mediaTracks[].clipId` would dangle); the drop stays an overlap.
    void dropsKeepMediaTrackOwners() {
        const QJsonObject owner = clip("owner", "v1", 0, 4000);
        const QJsonObject mover = clip("mover", "v1", 1000, 1000);
        EditDoc doc = docOf({owner, mover});
        doc.clipsWithMediaTracks = {"owner"};
        QCOMPARE(resolveDropAction(doc, {"mover"}, "overwrite"), doc.clips);
        QCOMPARE(resolveDropAction(doc, {"mover"}, "insert"), doc.clips);
        // A drop that covers an owner whole would delete it: refused too.
        EditDoc cover = docOf({clip("owner", "v1", 1000, 500), clip("mover", "v1", 900, 1000)});
        cover.clipsWithMediaTracks = {"owner"};
        QCOMPARE(resolveDropAction(cover, {"mover"}, "overwrite"), cover.clips);
        // Without ownership the same drop cuts the clip as the web does.
        doc.clipsWithMediaTracks.clear();
        QCOMPARE(resolveDropAction(doc, {"mover"}, "overwrite").size(), size_t(3));
    }

    // F5: a ripple moves a group and its children together.
    void rippleMovesAGroupTreeTogether() {
        QJsonObject group = clip("g", "v2", 1000, 2000, "group");
        QJsonObject child = clip("child", "v1", 1000, 500);
        child.insert("parentId", "g");
        const QJsonObject before = clip("x", "v1", 0, 1000);
        const EditDoc doc = docOf({before, group, child});
        const ClipList out = rippleTrimClipEnd(doc, "x", 100, std::nullopt, true);
        QCOMPARE(clipStartMs(*find(out, "child")), 1100.0);
        QCOMPARE(clipStartMs(*find(out, "g")), 1100.0);
        const ClipList deleted = rippleDeleteSelected(doc, {"x"});
        QCOMPARE(clipStartMs(*find(deleted, "child")), clipStartMs(*find(deleted, "g")));
        // A group itself is not an edit target natively: refused, unchanged.
        QCOMPARE(moveClip(doc, "g", 500, {}, true), doc.clips);
        QCOMPARE(trimClipEnd(doc, "g", 500, std::nullopt, true), doc.clips);
        QCOMPARE(deleteSelected(doc, {"g"}), doc.clips);
    }
};

QTEST_APPLESS_MAIN(TestEditActions)
#include "tst_editactions.moc"
