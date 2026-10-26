#include "app/PanelRegistry.h"
#include "app/MenuRegistry.h"
#include "wiring/KeyActions.h"
#include "wiring/SnapProviders.h"
#include "wiring/RulerProviders.h"
#include "edit/ClipGestureController.h"
#include "edit/tracks/TrackHeaderActions.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "preview/gizmo/TransformGizmoController.h"
#include <QJsonDocument>
#include <QQuickView>
#include <QtTest>
#include <memory>

namespace {
QQuickItem* named(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = named(child, name)) { return found; }
    }
    return nullptr;
}
}
class TestWiring : public QObject {
    Q_OBJECT
    nt::wiring::RulerRequest lastRulerRequest;
    nt::wiring::SnapRequest lastSnapRequest;
    int snapCalls = 0;
    int keyRuns = 0;
    QVariantMap actionContext;
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQuickView> view;
    QQuickItem* item(const QString& name) const { return named(view->contentItem(), name); }
    void click(QQuickItem* target, Qt::MouseButton button = Qt::LeftButton) {
        QVERIFY(target);
        QTest::mouseClick(view.get(), button, Qt::NoModifier,
            target->mapToScene({target->width() / 2, target->height() / 2}).toPoint());
    }
private slots:
    void initTestCase() {
        const QPointer<TestWiring> self(this);
        QVERIFY(nt::wiring::registerRulerProvider("bars", [self](const nt::wiring::RulerRequest& request) {
            if (self) { self->lastRulerRequest = request; }
            return std::vector<nt::wiring::RulerTick>{{0, true, "Bar 1"}, {500, false, "Beat 2"}};
        }));
        QVERIFY(nt::wiring::registerSnapProvider("test.snap", [self](const nt::wiring::SnapRequest& request) {
            if (self) { ++self->snapCalls; self->lastSnapRequest = request; }
            return std::vector<double>{2640};
        }));
        QVERIFY(nt::wiring::registerKeyAction({"test.key", "Test registered key", {QKeySequence(Qt::Key_F8)},
            [self](ClipGestureController&, const QVariantMap& context) {
                if (!self) { return false; }
                ++self->keyRuns;
                self->actionContext = context;
                return true;
            }}));
        QVERIFY(nt::wiring::registerKeyAction({"sourceAppend", "Registered source action", {},
            [self](ClipGestureController&, const QVariantMap&) {
                if (!self) { return false; }
                ++self->keyRuns;
                return true;
            }}));
        for (const auto& kind : {"clip", "track", "lane", "ruler"}) {
            QVERIFY(nt::app::registerMenuItem({QString::fromLatin1(kind), "test.key", "Test registered action", "F8",
                [](const QVariantMap& context) { return context.value("editable").toBool(); }}));
            QVERIFY(nt::app::registerMenuItem({QString::fromLatin1(kind), "test.disabled", "Disabled action", {},
                [](const QVariantMap&) { return false; }}));
            QVERIFY(nt::app::registerMenuItem({QString::fromLatin1(kind), "selectAll", "Select all clips", "Ctrl+A", {}}));
        }
        for (const auto& slot : {"clipBody", "toolbar", "documentBar", "preview"}) {
            QString type = QString::fromLatin1(slot);
            type[0] = type[0].toUpper();
            QVERIFY(nt::app::registerPanel({QString::fromLatin1(slot), "test-" + QString::fromLatin1(slot),
                QUrl("qrc:/wiring-test/Test" + type + ".qml"), 100}));
        }
        QVERIFY(nt::tracks::registerHeaderAction({"wiringHeader", QUrl("qrc:/wiring-test/TestHeaderActions.qml"), 100}));
    }
    void init() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0}],
          "clips":[{"id":"c","trackId":"v","name":"Still","mediaType":"image","startMs":1000,"durationMs":2000,"width":640,"height":360,"transform":{"scale":{"x":3,"y":3}}}]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.setDurationMs(10000);
        clock.seek(1500);
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        view->resize(1500, 900);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    }
    void cleanup() { view.reset(); }
    void registeredKey() {
        const int before = keyRuns;
        click(item("timeRuler"));
        QTest::keyClick(view.get(), Qt::Key_F8);
        QCOMPARE(keyRuns, before + 1);
        QVERIFY(ClipGestureController::availableActions().contains("test.key"));
        auto* gestures = qobject_cast<ClipGestureController*>(item("clipGestures"));
        QVERIFY(gestures);
        bool listed = false;
        for (const auto& group : gestures->shortcutSheet().value("groups").toList()) {
            for (const auto& row : group.toMap().value("rows").toList()) {
                const auto data = row.toMap();
                if (data.value("id") == "test.key") {
                    listed = data.value("available").toBool();
                }
            }
        }
        QVERIFY(listed);
        QTest::keyClick(view.get(), Qt::Key_E, Qt::ShiftModifier);
        QCOMPARE(keyRuns, before + 2);
        QVERIFY(ClipGestureController::availableActions().contains("sourceAppend"));
    }
    void rulerProvider() {
        auto* state = item("tracksRegion")->property("viewState").value<QObject*>();
        QVERIFY(state);
        const auto initialMode = state->property("rulerMode").toString();
        const auto initialGrid = state->property("gridDivision").toString();
        auto* canvas = item("rulerCanvas");
        QVERIFY(canvas);
        const auto timeTicks = canvas->property("ticks").toList();
        QSignalSpy modeChanges(state, SIGNAL(rulerModeChanged()));
        QSignalSpy gridChanges(state, SIGNAL(gridDivisionChanged()));
        QTRY_VERIFY(item("probe-toolbar"));
        auto* toggle = item("probe-toolbar");
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, toggle->mapToScene({14, 14}).toPoint());
        QCOMPARE(state->property("rulerMode").toString(), QString("bars"));
        QCOMPARE(initialMode, QString("time"));
        QCOMPARE(initialGrid, QString("beat"));
        QCOMPARE(state->property("gridDivision").toString(), QString("eighth"));
        QCOMPARE(modeChanges.count(), 1);
        QCOMPARE(gridChanges.count(), 1);
        const auto barTicks = canvas->property("ticks").toList();
        QVERIFY(barTicks != timeTicks);
        QVERIFY(!timeTicks.isEmpty());
        QCOMPARE(timeTicks[0].toMap(), QVariantMap({{"timeMs", 0.0}, {"major", true}, {"label", "0:00"}}));
        QCOMPARE(barTicks.size(), 2);
        QCOMPARE(barTicks[0].toMap().value("label").toString(), QString("Bar 1"));
        QCOMPARE(barTicks[1].toMap().value("timeMs").toDouble(), 500.0);
        QCOMPARE(lastRulerRequest.gridDivision, QString("eighth"));
        QCOMPARE(lastRulerRequest.document.value("name").toString(), QString("Fixture"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, toggle->mapToScene({14, 14}).toPoint());
        QCOMPARE(canvas->property("ticks").toList(), timeTicks);
        QCOMPARE(modeChanges.count(), 2);
        QCOMPARE(gridChanges.count(), 1);
    }
    void snapProvider_data() {
        QTest::addColumn<bool>("enabled");
        QTest::addColumn<bool>("bypass");
        QTest::newRow("on") << true << false;
        QTest::newRow("off") << false << false;
        QTest::newRow("alt-bypass") << true << true;
    }
    void snapProvider() {
        QFETCH(bool, enabled);
        QFETCH(bool, bypass);
        const auto modifiers = bypass ? Qt::AltModifier : Qt::NoModifier;
        const int calls = snapCalls;
        auto* gestures = qobject_cast<ClipGestureController*>(item("clipGestures"));
        QVERIFY(gestures);
        gestures->viewState()->zoomTo(10, 0);
        gestures->viewState()->setScrollLeftPx(0);
        gestures->viewState()->flush();
        QCoreApplication::processEvents();
        if (!enabled) { click(item("snapToggle")); }
        auto* clip = item("clip-c");
        QVERIFY(clip);
        const auto start = clip->mapToScene({clip->width() / 2, clip->height() / 2}).toPoint();
        const auto end = start + QPoint(160, 0);
        QTest::mousePress(view.get(), Qt::LeftButton, modifiers, start);
        QTest::mouseMove(view.get(), end, 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, modifiers, end);
        QCOMPARE(model.clipsJson()[0].toObject().value("startMs").toDouble(), enabled && !bypass ? 2640.0 : 2600.0);
        QCOMPARE(model.undoStack()->count(), 1);
        if (enabled && !bypass) {
            QCOMPARE(snapCalls, calls + 1);
            QCOMPARE(lastSnapRequest.excludedClipIds, QStringList{"c"});
            QCOMPARE(lastSnapRequest.gridDivision, QString("beat"));
            QCOMPARE(lastSnapRequest.document.value("name").toString(), QString("Fixture"));
        }
        else { QCOMPARE(snapCalls, calls); }
        click(item("undoButton"));
        QCOMPARE(model.clipsJson()[0].toObject().value("startMs").toDouble(), 1000.0);
    }
    void contextMenus_data() {
        QTest::addColumn<QString>("kind");
        QTest::addColumn<QString>("target");
        QTest::newRow("clip") << QString("clip") << QString("clip-c");
        QTest::newRow("track") << QString("track") << QString("trackHeader-v");
        QTest::newRow("lane") << QString("lane") << QString("trackLane-v");
        QTest::newRow("ruler") << QString("ruler") << QString("timeRuler");
    }
    void contextMenus() {
        QFETCH(QString, kind);
        QFETCH(QString, target);
        const auto open = [&]() {
            auto* surface = item(target);
            QVERIFY(surface);
            const auto point = kind == "lane" ? QPointF(550, surface->height() / 2)
                                               : QPointF(surface->width() / 2, surface->height() / 2);
            QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, surface->mapToScene(point).toPoint());
        };
        const auto before = keyRuns;
        open();
        const auto entry = "registryMenu-" + kind + "-test.key";
        QTRY_VERIFY_WITH_TIMEOUT(item(entry), 1000);
        QVERIFY(item(entry)->isVisible());
        QVERIFY(!item("registryMenu-" + kind + "-test.disabled")->isEnabled());
        if (kind == "track") { QVERIFY(item("trackMenu-rename")->isVisible()); }
        click(item(entry));
        QCOMPARE(keyRuns, before + 1);
        QCOMPARE(actionContext.value("kind").toString(), kind);
        if (kind == "clip") { QCOMPARE(actionContext.value("clipId").toString(), QString("c")); }
        if (kind == "track" || kind == "lane") { QCOMPARE(actionContext.value("trackId").toString(), QString("v")); }
        auto* gestures = qobject_cast<ClipGestureController*>(item("clipGestures"));
        QVERIFY(gestures);
        // Both the registered menu item and Ctrl+A use the built-in dispatcher.
        open();
        click(item("registryMenu-" + kind + "-selectAll"));
        QCOMPARE(gestures->selection(), QStringList{"c"});
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier | Qt::ShiftModifier);
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        QCOMPARE(gestures->selection(), QStringList{"c"});
        QCOMPARE(model.undoStack()->count(), 0);
    }
    void clipBodySlot() {
        QTRY_VERIFY_WITH_TIMEOUT(item("probe-clipBody"), 1000);
        auto* probe = item("probe-clipBody");
        QCOMPARE(probe->property("clip").toMap().value("id").toString(), QString("c"));
        QCOMPARE(probe->property("timeline").value<QObject*>(), &model);
        QCOMPARE(probe->property("gestures").value<QObject*>(), item("clipGestures"));
        QCOMPARE(probe->property("viewState").value<QObject*>(), item("tracksRegion")->property("viewState").value<QObject*>());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, probe->mapToScene({14, 14}).toPoint());
        QCOMPARE(probe->property("clicks").toInt(), 1);
        click(item("clip-c"));
        auto* gestures = qobject_cast<ClipGestureController*>(item("clipGestures"));
        QVERIFY(gestures);
        QCOMPARE(gestures->selection(), QStringList{"c"});
        QTest::keyClick(view.get(), Qt::Key_Right);
        QVERIFY(model.clipsJson()[0].toObject().value("startMs").toDouble() != 1000);
        QCOMPARE(probe->property("clip").toMap(), model.clipsJson()[0].toObject().toVariantMap());
        click(item("undoButton"));
        QCOMPARE(probe->property("clip").toMap().value("startMs").toDouble(), 1000.0);
    }
    void manyClipBodies() {
        auto fixture = QJsonDocument::fromJson(model.documentJson()).object();
        const auto base = model.clipsJson()[0].toObject();
        QJsonArray clips;
        for (int index = 0; index < 20000; ++index) {
            auto clip = base;
            clip.insert("id", "many" + QString::number(index));
            clip.insert("startMs", index * 5000.0);
            clips.append(clip);
        }
        fixture.insert("clips", clips);
        fixture.insert("durationMs", 100000000);
        auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QTRY_VERIFY(item("clip-many0"));
        QTRY_VERIFY(named(item("clip-many0"), "probe-clipBody"));
        auto* probe = named(item("clip-many0"), "probe-clipBody");
        QCOMPARE(probe->property("clip").toMap().value("id").toString(), QString("many0"));
        click(item("clip-many0"));
        QTest::keyClick(view.get(), Qt::Key_Right);
        QVERIFY(model.clipsJson()[0].toObject().value("startMs").toDouble() > 0);
        QCOMPARE(probe->property("clip").toMap(), model.clipsJson()[0].toObject().toVariantMap());
        QCOMPARE(model.undoStack()->count(), 1);
        click(item("undoButton"));
        QCOMPARE(probe->property("clip").toMap().value("startMs").toDouble(), 0.0);
    }
    void toolbarSlot() {
        QTRY_VERIFY_WITH_TIMEOUT(item("probe-toolbar"), 1000);
        auto* probe = item("probe-toolbar");
        const auto snapEnd = item("snapToggle")->mapToScene({item("snapToggle")->width(), 0});
        QVERIFY(probe->mapToScene({0, 0}).x() >= snapEnd.x());
        QCOMPARE(probe->property("gestures").value<QObject*>(), item("clipGestures"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, probe->mapToScene({14, 14}).toPoint());
        QCOMPARE(probe->property("clicks").toInt(), 1);
    }
    void documentBarSlot() {
        QTRY_VERIFY_WITH_TIMEOUT(item("probe-documentBar"), 1000);
        auto* probe = item("probe-documentBar");
        const auto redoEnd = item("redoButton")->mapToScene({item("redoButton")->width(), 0});
        QVERIFY(probe->mapToScene({0, 0}).x() >= redoEnd.x());
        QCOMPARE(probe->property("timeline").value<QObject*>(), &model);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, probe->mapToScene({14, 14}).toPoint());
        QCOMPARE(probe->property("clicks").toInt(), 1);
    }
    void previewSlot() {
        QTRY_VERIFY_WITH_TIMEOUT(item("probe-preview"), 1000);
        auto* probe = item("probe-preview");
        auto* frame = item("previewFrame");
        QVERIFY(frame);
        QVERIFY(frame->clip());
        QVERIFY(frame->isAncestorOf(probe));
        QCOMPARE(probe->property("timeline").value<QObject*>(), &model);
        QCOMPARE(probe->property("clock").value<QObject*>(), &clock);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, probe->mapToScene({14, 14}).toPoint());
        QCOMPARE(probe->property("clicks").toInt(), 1);
    }
    void gizmoOutsideFrame() {
        click(item("clip-c"));
        auto* gizmo = qobject_cast<TransformGizmoController*>(item("transformGizmo"));
        QVERIFY(gizmo);
        QTRY_VERIFY(gizmo->available());
        const auto before = model.documentJson();
        const auto oldTime = clock.time();
        click(item("timeRuler"));
        QVERIFY2(clock.time() != oldTime, "Scaled gizmo stole the ruler click outside the preview frame");
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        const auto outside = item("timeRuler")->mapToItem(gizmo, {item("timeRuler")->width() / 2, 10});
        QVERIFY(!gizmo->contains(outside));
    }
    void addTrack_data() {
        QTest::addColumn<QString>("type");
        for (const auto& type : {"video", "audio", "overlay", "subtitle", "midi", "chord"}) {
            QTest::newRow(type) << QString::fromLatin1(type);
        }
    }
    void addTrack() {
        QFETCH(QString, type);
        const auto before = model.documentJson();
        click(item("addTrackButton"));
        QTRY_VERIFY(item("addTrack-" + type));
        click(item("addTrack-" + type));
        QTRY_COMPARE(model.tracks()->rowCount(), 2);
        QCOMPARE(model.undoStack()->count(), 1);
        click(item("undoButton"));
        QTRY_COMPARE(model.documentJson(), before);
    }
    void headerActions() {
        QTRY_VERIFY(item("probe-headerActions"));
        click(item("probe-headerActions"));
        QCOMPARE(item("probe-headerActions")->property("clicks").toInt(), 1);
    }
    void panelNames() {
        for (const auto& slot : {"bad-slot", "Upper", "clipBody\n", "", "_slot"}) {
            QTest::ignoreMessage(QtWarningMsg, "Refused panel badPanel: invalid slot, id, source or duplicate id");
            QVERIFY(!nt::app::registerPanel({QString::fromLatin1(slot), "badPanel", QUrl("qrc:/test.qml")}));
        }
        QVERIFY(nt::app::registerPanel({"clipBody", "camelCasePanel", QUrl("qrc:/test.qml")}));
        QTest::ignoreMessage(QtWarningMsg, "Refused panel camelCasePanel: invalid slot, id, source or duplicate id");
        QVERIFY(!nt::app::registerPanel({"clipBody", "camelCasePanel", QUrl("qrc:/test.qml")}));
    }
};
QTEST_MAIN(TestWiring)
#include "tst_wiring.moc"
