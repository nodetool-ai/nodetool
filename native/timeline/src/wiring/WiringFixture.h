#pragma once
#include "edit/ClipGestureController.h"
#include "edit/targeting/TrackTargeting.h"
#include "edit/clipboard/ClipboardOps.h"
#include "model/TimelineJson.h"
#include <QJsonDocument>
#include <QQuickView>
#include <QtTest>
#include <memory>

// Production editor setup and pointer helpers shared with the step 1 fixture.
class WiringFixture : public QObject {
protected:
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQuickView> view;
    static QQuickItem* named(QQuickItem* root, const QString& name) {
        if (root->objectName() == name) { return root; }
        for (auto* child : root->childItems()) {
            if (auto* found = named(child, name)) { return found; }
        }
        return nullptr;
    }
    QQuickItem* item(const QString& name) const { return named(view->contentItem(), name); }
    ClipGestureController* gestures() const { return qobject_cast<ClipGestureController*>(item("clipGestures")); }
    QPoint center(QQuickItem* target) const {
        return target->mapToScene({target->width() / 2, target->height() / 2}).toPoint();
    }
    void click(const QString& name, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        auto* target = item(name);
        QVERIFY2(target, qPrintable("Missing production item: " + name));
        QTest::mouseClick(view.get(), Qt::LeftButton, mods, center(target));
        QCoreApplication::processEvents();
    }
    QJsonObject doc() const { return QJsonDocument::fromJson(model.documentJson()).object(); }
    QJsonObject clip(const QString& id) const {
        for (const auto& c : model.clipsJson()) {
            if (c.toObject().value("id") == id) { return c.toObject(); }
        }
        return {};
    }
    QJsonObject track(const QString& id) const {
        for (const auto& t : doc().value("tracks").toArray()) {
            if (t.toObject().value("id") == id) { return t.toObject(); }
        }
        return {};
    }
    void drag(QPoint from, QPoint to, Qt::KeyboardModifiers mods = Qt::NoModifier) {
        QTest::mousePress(view.get(), Qt::LeftButton, mods, from);
        QTest::mouseMove(view.get(), to, 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, mods, to);
        QCoreApplication::processEvents();
    }
    void open() {
        nt::edit::clipboard::clearClipClipboard();
        auto& targets = nt::targeting::TrackTargeting::current();
        const auto state = targets.state();
        for (const auto& id : state.untargetedTrackIds) { targets.setTrackTargeted(id, true); }
        for (const auto& id : state.syncLockOffTrackIds) { targets.setTrackSyncLocked(id, true); }
        auto parsed = nt::parseTimelineJson(R"({"name":"Fixture","fps":30,"width":640,"height":360,"durationMs":10000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0,"heightPx":80,"visible":true,"locked":false},
                    {"id":"w","name":"Video 2","type":"video","index":1,"heightPx":80,"visible":true,"locked":false},
                    {"id":"a","name":"Audio","type":"audio","index":2,"heightPx":80,"visible":true,"locked":false,"muted":false,"solo":false}],
          "clips":[{"id":"c","trackId":"v","name":"Still","mediaType":"image","startMs":1000,"durationMs":2000,"opacity":0.4},
                   {"id":"d","trackId":"v","name":"Later","mediaType":"image","startMs":5000,"durationMs":1000},
                   {"id":"e","trackId":"w","name":"Other","mediaType":"image","startMs":1000,"durationMs":2000},
                   {"id":"f","trackId":"w","name":"Later 2","mediaType":"image","startMs":5000,"durationMs":1000},
                   {"id":"s","trackId":"a","name":"Sound","mediaType":"audio","startMs":5000,"durationMs":1000}]})");
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        clock.setDurationMs(10000);
        clock.seek(1500);
        view = std::make_unique<QQuickView>();
        view->setInitialProperties({{"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}});
        view->loadFromModule("NodeTool.Timeline", "TimelineEditor");
        QVERIFY2(view->status() == QQuickView::Ready, qPrintable(view->errors().isEmpty() ? QString() : view->errors().first().toString()));
        view->setResizeMode(QQuickView::SizeRootObjectToView);
        // Keep the fixture's lane targets visible beside the Library and Inspector.
        view->resize(1800, 900);
        view->show();
        QVERIFY(QTest::qWaitForWindowExposed(view.get()));
        QVERIFY(gestures());
        gestures()->viewState()->zoomTo(10, 0);
        gestures()->viewState()->setScrollLeftPx(0);
        gestures()->viewState()->flush();
        QCoreApplication::processEvents();
    }
};
