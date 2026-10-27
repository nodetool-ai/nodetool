#include "edit/tracks/TrackHeaderActions.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QJsonDocument>
#include <QPointer>
#include <QQuickItem>
#include <QQuickView>
#include <QtTest>
#include <memory>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) {
            return found;
        }
    }
    return nullptr;
}
}
class TestTracksRegion : public QObject {
    Q_OBJECT
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQuickView> view;
    QJsonObject before;

    QJsonObject doc() const { return QJsonDocument::fromJson(model.documentJson()).object(); }
    QQuickItem* item(const QString& name) const { return findItem(view->contentItem(), name); }
    void click(QQuickItem* target, Qt::MouseButton button = Qt::LeftButton) {
        QVERIFY(target);
        QTest::mouseClick(view.get(), button, Qt::NoModifier,
            target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint());
    }
    QObject* menu() const { return view->rootObject()->findChild<QObject*>("trackHeaderMenu"); }
    void openHeader() {
        auto* header = item("trackHeader-v");
        QVERIFY(header);
        click(header, Qt::RightButton);
        QTRY_VERIFY(menu());
        QTRY_VERIFY(menu()->property("opened").toBool());
    }
private slots:
    void initTestCase() {
        QVERIFY(nt::tracks::registerHeaderAction({"testHeaderAction", QUrl("qrc:/tracks-test/TestHeaderAction.qml"), 0}));
    }
    void init() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":1000,
            "tracks":[{"id":"v","name":"Video","type":"video","index":0,"visible":true,"locked":false},
                      {"id":"a","name":"Audio","type":"audio","index":1,"visible":true,"locked":false}],
            "clips":[],"mediaTracks":[]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        before = doc();
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TracksRegion");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(1100, 600);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    }
    void cleanup() { view.reset(); }
    void addButton_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<int>("position");
        QTest::newRow("video-top") << QString("video") << 0;
        QTest::newRow("audio-end") << QString("audio") << 2;
        QTest::newRow("overlay-top") << QString("overlay") << 0;
        QTest::newRow("subtitle-end") << QString("subtitle") << 2;
        QTest::newRow("midi-end") << QString("midi") << 2;
        QTest::newRow("chord-end") << QString("chord") << 2;
    }
    void addButton() {
        QFETCH(QString, type);
        QFETCH(int, position);
        auto* add = item("addTrackButton");
        QVERIFY2(add, "TRACKS + has no AddTrackButton insertion hook");
        click(add);
        auto* popup = add->findChild<QObject*>("addTrackMenu");
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("opened").toBool());
        QCOMPARE(popup->property("count").toInt(), 6);
        for (const auto& name : {"video", "audio", "overlay", "subtitle", "midi", "chord"}) {
            QTRY_VERIFY(item("addTrack-" + QString::fromLatin1(name)));
        }
        click(item("addTrack-" + type));
        QTRY_COMPARE(doc().value("tracks").toArray().size(), 3);
        QCOMPARE(doc().value("tracks").toArray()[position].toObject().value("type").toString(), type);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void headerActionsSlot() {
        QTRY_VERIFY2(item("trackHeaderAction-testHeaderAction"), "Registered header action did not appear in TRACKS header");
        QCOMPARE(item("trackHeaderAction-testHeaderAction")->property("label").toString(), QString("Test action"));
    }
    void contextLabels_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("label");
        QTest::newRow("video") << QString("video") << QString("video");
        QTest::newRow("audio") << QString("audio") << QString("audio");
        QTest::newRow("overlay") << QString("overlay") << QString("overlay");
        QTest::newRow("subtitle") << QString("subtitle") << QString("text");
        QTest::newRow("midi") << QString("midi") << QString("MIDI");
        QTest::newRow("chord") << QString("chord") << QString("chords");
    }
    void contextLabels() {
        QFETCH(QString, type);
        QFETCH(QString, label);
        auto fixture = before;
        auto tracks = fixture.value("tracks").toArray();
        auto track = tracks[0].toObject();
        track.insert("type", type);
        tracks.replace(0, track);
        fixture.insert("tracks", tracks);
        auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        openHeader();
        QCOMPARE(item("trackMenu-rename")->property("text").toString(), QString("Rename"));
        QCOMPARE(item("trackMenu-duplicate")->property("text").toString(), QString("Duplicate track"));
        QCOMPARE(item("trackMenu-insertAbove")->property("text").toString(), "Insert " + label + " track above");
        QCOMPARE(item("trackMenu-insertBelow")->property("text").toString(), "Insert " + label + " track below");
        QCOMPARE(item("trackMenu-remove")->property("text").toString(), QString("Delete track"));
    }
    void contextInsert_data() {
        QTest::addColumn<QString>("action");
        QTest::addColumn<int>("position");
        QTest::newRow("above") << QString("insertAbove") << 0;
        QTest::newRow("below") << QString("insertBelow") << 1;
    }
    void contextInsert() {
        QFETCH(QString, action);
        QFETCH(int, position);
        openHeader();
        for (const auto& name : {"rename", "duplicate", "insertAbove", "insertBelow", "remove"}) {
            QTRY_VERIFY(item("trackMenu-" + QString::fromLatin1(name)));
        }
        QCOMPARE(item("trackMenu-insertAbove")->property("text").toString(), QString("Insert video track above"));
        click(item("trackMenu-" + action));
        QTRY_COMPARE(doc().value("tracks").toArray().size(), 3);
        const auto track = doc().value("tracks").toArray()[position].toObject();
        QCOMPARE(track.value("type").toString(), QString("video"));
        QVERIFY(track.value("id") != "v");
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void duplicate() {
        openHeader();
        click(item("trackMenu-duplicate"));
        QTRY_COMPARE(doc().value("tracks").toArray().size(), 3);
        QCOMPARE(doc().value("tracks").toArray()[1].toObject().value("name").toString(), QString("Video copy"));
        model.undoStack()->undo();
        QCOMPARE(doc(), before);
    }
    void deleteConfirmation_data() {
        QTest::addColumn<bool>("locked");
        QTest::newRow("delete") << false;
        QTest::newRow("refused") << true;
    }
    void deleteConfirmation() {
        QFETCH(bool, locked);
        if (locked) {
            QVERIFY(model.applyEdit("setTrackLocked", {{"trackId", "v"}, {"locked", true}}));
            model.undoStack()->clear();
            before = doc();
        }
        openHeader();
        click(item("trackMenu-remove"));
        auto* confirm = view->rootObject()->findChild<QObject*>("deleteTrackDialog");
        QVERIFY(confirm);
        QTRY_VERIFY(confirm->property("opened").toBool());
        QCOMPARE(confirm->property("title").toString(), QString("Delete track?"));
        QCOMPARE(item("deleteTrackContent")->property("text").toString(), QString("Track \"Video\" and all its clips are deleted."));
        QCOMPARE(doc(), before);
        click(item("confirmDeleteTrack"));
        if (locked) {
            QCOMPARE(doc(), before);
            QCOMPARE(model.undoStack()->count(), 0);
            QTRY_VERIFY(item("trackDeleteWarning"));
            QCOMPARE(item("trackDeleteWarning")->property("text").toString(), QString("Unlock track \"Video\" and its clips to delete it"));
        } else {
            QTRY_COMPARE(doc().value("tracks").toArray().size(), 1);
            QCOMPARE(model.undoStack()->count(), 1);
            model.undoStack()->undo();
            QCOMPARE(doc(), before);
        }
    }
    void rename_data() {
        QTest::addColumn<bool>("cancel");
        QTest::newRow("commit") << false;
        QTest::newRow("escape") << true;
    }
    void rename() {
        QFETCH(bool, cancel);
        openHeader();
        click(item("trackMenu-rename"));
        QTRY_VERIFY(item("trackRename-v"));
        auto* input = item("trackRename-v");
        QTRY_VERIFY(input->hasActiveFocus());
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const char key : std::string("  Renamed  ")) {
            QTest::keyClick(view.get(), key);
        }
        QTest::keyClick(view.get(), cancel ? Qt::Key_Escape : Qt::Key_Return);
        if (cancel) {
            QCOMPARE(doc(), before);
            QCOMPARE(model.undoStack()->count(), 0);
        } else {
            QTRY_COMPARE(doc().value("tracks").toArray()[0].toObject().value("name").toString(), QString("Renamed"));
            QCOMPARE(model.undoStack()->count(), 1);
            model.undoStack()->undo();
            QCOMPARE(doc(), before);
        }
    }
};
QTEST_MAIN(TestTracksRegion)
#include "tst_tracksregion.moc"
