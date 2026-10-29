#include "SourceEdit.h"
#include "SourceViewerState.h"
#include "wiring/WiringFixture.h"
#include <QFile>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <cmath>

class TestSourceViewer : public WiringFixture {
    Q_OBJECT
    SourceViewerState* state = nullptr;
    QJsonObject asset{{"id", "source"}, {"name", "Take"}, {"content_type", "video/mp4"}, {"duration", 10}};
    static QJsonObject normalize(QJsonObject document, const QJsonObject& before) {
        QSet<QString> known;
        for (const auto& c : before.value("clips").toArray()) { known.insert(c.toObject().value("id").toString()); }
        QHash<QString, QString> names;
        QJsonArray clips;
        for (const auto& value : document.value("clips").toArray()) {
            auto c = value.toObject();
            const auto id = c.value("id").toString();
            if (!known.contains(id)) {
                if (!names.contains(id)) { names.insert(id, "new" + QString::number(names.size())); }
                c.insert("id", names.value(id));
            }
            clips.append(c);
        }
        document.insert("clips", clips);
        return document;
    }
    void scrub(double fraction) {
        auto* bar = item("sourceScrub"); QVERIFY(bar);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier,
                          bar->mapToScene({bar->width() * fraction, bar->height() / 2}).toPoint());
    }
    void type(const QString& name, const QString& value) {
        auto* pill = item(name); QVERIFY(pill);
        QQuickItem* input = nullptr;
        for (auto* child : pill->childItems()) {
            if (child->inherits("QQuickTextInput")) { input = child; break; }
        }
        QVERIFY(input);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(input));
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const auto c : value) {
            QTest::keyClick(view.get(), c == '.' ? Qt::Key_Period : static_cast<Qt::Key>(Qt::Key_0 + c.digitValue()));
        }
        QTest::keyClick(view.get(), Qt::Key_Return);
    }
private slots:
    void initTestCase() {
        const auto path = qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES");
        QVERIFY2(!path.isEmpty(),
                 "NODETOOL_TIMELINE_PREFERENCES must be set and non-empty: the test must not write the user's real Timeline.conf");
        QVERIFY2(!QFile::exists(path) || QFile::remove(path), "Could not remove the test preferences file");
    }
    void init() {
        open(300);
        view->resize(1800, 1200);
        state = view->engine()->singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(state);
        QCoreApplication::processEvents();
        state->setAsset(asset.toVariantMap());
        QCoreApplication::processEvents();
        auto* panel = item("sourceViewer"); QVERIFY(panel);
        QTRY_VERIFY(panel->isVisible() && panel->height() > 0 &&
                    panel->mapToScene({panel->width(), panel->height()}).y() <= view->height());
    }
    void cleanup() { state = nullptr; view.reset(); }
    void mediaResolutionBrowserSurvivesHiddenLibrary() {
        QTRY_VERIFY(state->mediaBrowser());
        auto* browser = state->mediaBrowser();
        QCOMPARE(browser->timeline(), &model);
        auto* library = item("assetExplorer");
        QVERIFY(library);
        library->setVisible(false);
        QVERIFY(QMetaObject::invokeMethod(item("sourceViewer"), "attach"));
        QCoreApplication::processEvents();
        QCOMPARE(state->mediaBrowser(), browser);
    }
    void marking() {
        const auto before = doc();
        QSignalSpy modelChanges(&model, &TimelineModel::clipsChanged);
        QSignalSpy trackChanges(model.tracks(), &QAbstractItemModel::modelReset);
        auto* lane = item("trackLane-v"); QVERIFY(lane);
        auto* laneModel = lane->property("clipModel").value<QObject*>(); QVERIFY(laneModel);
        QSignalSpy laneChanges(laneModel, SIGNAL(recomputed()));
        auto* delegate = item("clip-c"); QVERIFY(delegate);
        QVERIFY(item("sourceMarkIn"));
        scrub(0.25); click("sourceMarkIn");
        QCOMPARE(state->inMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        QVERIFY(state->inMs() > 1000);
        scrub(0.75); click("sourceMarkOut");
        QCOMPARE(state->outMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        QVERIFY(state->outMs() > 6000);
        scrub(0.3); item("sourceViewer")->forceActiveFocus(); QTest::keyClick(view.get(), Qt::Key_I);
        QCOMPARE(state->inMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        scrub(0.6); item("sourceViewer")->forceActiveFocus(); QTest::keyClick(view.get(), Qt::Key_O);
        QCOMPARE(state->outMs(), item("sourceViewer")->property("playerTimeMs").toDouble());
        const auto marks = state->sourceRange();
        for (const auto modifier : {Qt::ShiftModifier, Qt::ControlModifier, Qt::AltModifier, Qt::MetaModifier}) {
            QTest::keyClick(view.get(), Qt::Key_I, modifier);
            QTest::keyClick(view.get(), Qt::Key_O, modifier);
            QCOMPARE(state->sourceRange(), marks);
        }
        // Ctrl+O opens the modal timeline list and takes focus from the source viewer.
        auto* actions = item("TimelineDocumentActions");
        QVERIFY(actions);
        auto* popup = actions->findChild<QObject*>("timelineListPopup");
        QVERIFY(popup);
        QTRY_VERIFY(popup->property("visible").toBool());
        QTest::keyClick(view.get(), Qt::Key_Escape);
        QTRY_VERIFY(!popup->property("visible").toBool());
        type("sourceIn", "1.25"); type("sourceOut", "4.50");
        QCOMPARE(state->inMs(), 1250.0); QCOMPARE(state->outMs(), 4500.0);
        type("sourceIn", "9.00"); QCOMPARE(state->inMs(), 4500.0);
        type("sourceOut", "99.00"); QCOMPARE(state->outMs(), 10000.0);
        state->setIn("bad"); state->setOut("-1");
        QCOMPARE(state->inMs(), 4500.0); QCOMPARE(state->outMs(), 10000.0);
        state->setAsset(asset.toVariantMap()); QCOMPARE(state->inMs(), 4500.0);
        auto other = asset; other.insert("id", "another"); state->setAsset(other.toVariantMap());
        QCOMPARE(state->inMs(), 0.0); QCOMPARE(state->outMs(), 10000.0);
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(modelChanges.count(), 0); QCOMPARE(trackChanges.count(), 0);
        QCOMPARE(laneChanges.count(), 0); QCOMPARE(item("clip-c"), delegate);
    }
    void mediaAndEmptyState() {
        const auto before = doc();
        state->setAsset({});
        QTRY_VERIFY(!item("sourceViewer")->isVisible());
        QVERIFY(item("sourceEmptyState"));
        QCOMPARE(item("sourceEmptyState")->property("text").toString(),
                 QString("Select an asset in the library to view it here"));
        for (const auto& type : {"audio/wav", "image/png", "text/plain"}) {
            auto next = asset;
            next.insert("content_type", type);
            state->setAsset(next.toVariantMap());
            QTRY_VERIFY(item("sourceViewer")->isVisible());
            QVERIFY(!item("sourceMarkIn")->isVisible());
            QVERIFY(!item("sourceMarkOut")->isVisible());
            QCOMPARE(item("sourceScrub")->isVisible(), QString(type) == "audio/wav");
            QCOMPARE(item("sourcePoster")->isVisible(), QString(type) == "image/png");
            item("sourceViewer")->setProperty("playerTimeMs", 3000);
            item("sourceViewer")->forceActiveFocus();
            const auto marks = state->sourceRange();
            QTest::keyClick(view.get(), Qt::Key_I);
            QTest::keyClick(view.get(), Qt::Key_O);
            QCOMPARE(state->sourceRange(), marks);
            for (const auto& name : {"sourceAppend", "sourceInsert", "sourceOverwrite"}) {
                QCOMPARE(item(name)->isEnabled(), QString(type) != "text/plain");
            }
        }
        QCOMPARE(doc(), before);
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void edits_data() {
        QTest::addColumn<QString>("kind"); QTest::addColumn<QString>("preset"); QTest::addColumn<bool>("keyboard");
        for (const auto& kind : {"append", "insert", "overwrite"}) {
            QTest::newRow(qPrintable(QString(kind) + "-pointer")) << QString(kind) << QString("nodetool") << false;
            for (const auto& preset : {"nodetool", "premiere", "fcp"}) {
                QTest::newRow(qPrintable(QString(kind) + "-" + preset)) << QString(kind) << QString(preset) << true;
            }
        }
    }
    void edits() {
        QFETCH(QString, kind); QFETCH(QString, preset); QFETCH(bool, keyboard);
        state->markIn(1000); state->markOut(3000);
        nt::targeting::TrackTargeting::current().setTrackTargeted("v", false);
        nt::targeting::TrackTargeting::current().setTrackSyncLocked("a", false);
        clock.seek(1500);
        const auto before = doc();
        const auto expected = nt::sourceedit::performSourceEdit(kind, before, nt::targeting::TrackTargeting::current().state(),
            QJsonObject::fromVariantMap(state->sourceRange()), clock.time(), asset);
        QVERIFY(expected);
        gestures()->setKeyboardPreset(preset);
        if (keyboard) {
            click("timeRuler"); clock.seek(1500);
            const auto key = state->shortcut(kind, preset);
            QVERIFY(!key.isEmpty());
            QTest::keySequence(view.get(), QKeySequence(key));
        } else { click("source" + kind.first(1).toUpper() + kind.sliced(1)); }
        QTRY_COMPARE(model.undoStack()->count(), 1);
        QCOMPARE(normalize(doc(), before), normalize(expected->doc, before));
        QCOMPARE(gestures()->selection().size(), 1);
        const auto selectedId = gestures()->selection().first();
        QVERIFY(!clip(selectedId).isEmpty());
        for (const auto& old : before.value("clips").toArray()) {
            QVERIFY(old.toObject().value("id").toString() != selectedId);
        }
        const auto selected = clip(selectedId);
        QCOMPARE(selected.value("currentAssetId").toString(), QString("source"));
        QCOMPARE(selected.value("inPointMs").toDouble(), 1000.0);
        model.undoStack()->undo(); QCOMPARE(doc(), before);
        model.undoStack()->redo(); QCOMPARE(normalize(doc(), before), normalize(expected->doc, before));
    }
    void libraryDiscovery() {
        state->setAsset({});
        QQmlComponent component(view->engine());
        component.setData(R"(import QtQuick
Item {
    objectName: "assetExplorer"
    Item {
        objectName: "testLibraryGrid"
        property string selectedId: "from-library"
        property QtObject browser: QtObject {
            property var assets: [{id:"from-library", name:"Library take", content_type:"video/mp4", duration:8}]
        }
    }
})", QUrl("qrc:/SourceLibrary.qml"));
        std::unique_ptr<QObject> tree(component.create());
        QVERIFY2(tree, qPrintable(component.errorString()));
        auto* visual = qobject_cast<QQuickItem*>(tree.get()); QVERIFY(visual);
        visual->setParentItem(view->rootObject());
        tree->setParent(view->rootObject()); tree.release();
        QVERIFY(QMetaObject::invokeMethod(item("sourceViewer"), "attach"));
        QTRY_COMPARE(state->asset().value("id").toString(), QString("from-library"));
        QVERIFY(item("sourceViewer")->isVisible());
        auto* grid = item("testLibraryGrid"); QVERIFY(grid);
        state->markIn(2000);
        grid->setProperty("selectedId", "");
        QTRY_VERIFY(!item("sourceViewer")->isVisible());
        grid->setProperty("selectedId", "from-library");
        QTRY_VERIFY(item("sourceViewer")->isVisible());
        QCOMPARE(state->inMs(), 2000.0);
        auto fields = asset.toVariantMap(); fields.insert("content_type", "text/plain");
        state->setAsset(fields); QCoreApplication::processEvents();
        QVERIFY(!item("sourceAppend")->isEnabled());
    }
};
QTEST_MAIN(TestSourceViewer)
#include "tst_sourceviewer.moc"
