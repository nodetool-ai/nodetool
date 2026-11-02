#include "ui/MonitorViewMath.h"
#include "ui/MonitorViewState.h"
#include <QtTest>
#include <QLineF>
#include <cmath>
#include <limits>
#include <memory>
#include <vector>
using namespace nt::ui::monitor;
class MonitorViewTest : public QObject {
    Q_OBJECT
private slots:

    void stateGeometry() {
        MonitorViewState state;
        state.setViewportSize({656, 376}); state.setCanvasSize({1920, 1080});
        QCOMPARE(state.pictureRect(), QRectF(8, 8, 640, 360));
        QVERIFY(state.fit()); QCOMPARE(state.pan(), QPointF());
        QCOMPARE(state.visibleCanvasRect(), QRectF(0, 0, 1, 1));
        QCOMPARE(state.visibleItemRect(), QRectF(0, 0, 640, 360));
        state.panBy({100, 100}); QCOMPARE(state.pan(), QPointF());
        state.setDevicePixelRatio(2); state.setZoomPercent(100);
        QCOMPARE(state.zoom(), 1); QCOMPARE(state.pictureRect().width(), 960);
        QVERIFY(state.canPan());
        state.panBy({1e6, -1e6}); QCOMPARE(state.pan(), QPointF(152, -82));
        state.panBy({-2e6, 2e6}); QCOMPARE(state.pan(), QPointF(-152, 82));
        state.setZoomPercent(100); QCOMPARE(state.pan(), QPointF());
        state.panBy({100, 100}); state.setFit();
        QVERIFY(state.fit()); QCOMPARE(state.pan(), QPointF());
        QCOMPARE(state.pictureRect(), QRectF(8, 8, 640, 360));
        state.setZoomPercent(1); QCOMPARE(state.zoom(), kMinZoom);
        state.setZoomPercent(1e9); QCOMPARE(state.zoom(), kMaxZoom);
        QVERIFY(state.visibleItemRect().width() <= 657);
        QVERIFY(state.visibleItemRect().height() <= 377);
        state.panBy({1e6, 1e6}); state.setViewportSize({1000, 1000});
        const auto bounds = (state.pictureRect().size() - state.viewportSize()) / 2;
        QVERIFY(std::abs(state.pan().x()) <= bounds.width());
        QVERIFY(std::abs(state.pan().y()) <= bounds.height());
        state.setCanvasSize({20, 20}); QCOMPARE(state.pan(), QPointF());
        state.setDevicePixelRatio(1); QCOMPARE(state.pictureRect().size(), QSizeF(320, 320));
    }
    void anchoredZoom_data() {
        QTest::addColumn<QPointF>("pointer"); QTest::addColumn<double>("percent");
        int row = 0;
        for (const double z : {100.0, 200.0, 800.0}) {
            for (const QPointF point : {QPointF(200, 150), QPointF(0, 0), QPointF(400, 300), QPointF(0, 300), QPointF(400, 0)}) {
                QTest::newRow(qPrintable(QString::number(row++))) << point << z;
            }
        }
    }
    void anchoredZoom() {
        QFETCH(QPointF, pointer); QFETCH(double, percent);
        MonitorViewState state;
        state.setViewportSize({400, 300}); state.setCanvasSize({1920, 1080}); state.setZoomPercent(percent);
        const QRectF before = state.pictureRect();
        const QPointF point((pointer.x()-before.x())/before.width(), (pointer.y()-before.y())/before.height());
        state.zoomAt(pointer, 1.1);
        const auto after = state.pictureRect();
        const QPointF mapped = after.topLeft() + QPointF(point.x()*after.width(), point.y()*after.height());
        QVERIFY(QLineF(pointer, mapped).length() <= 0.5);
        state.setZoomPercent(percent);
        const auto originalZoom = state.zoom();
        state.zoomByWheelNotches(pointer, 1); state.zoomByWheelNotches(pointer, -1);
        QVERIFY(std::abs(state.zoom()/originalZoom - 1) < 1e-9);
        QVERIFY(QLineF(state.pictureRect().topLeft(), before.topLeft()).length() <= 0.5);
    }
    void zoomLimitsAndFitAnchor() {
        MonitorViewState state;
        state.setViewportSize({656, 376}); state.setCanvasSize({1920, 1080});
        const auto old = state.pictureRect();
        state.zoomAt({328, 188}, 2);
        QVERIFY(!state.fit()); QCOMPARE(state.pictureRect().center(), old.center());
        QCOMPARE(state.pictureRect().width(), old.width()*2);
        state.setZoomPercent(100); state.zoomAt({328, 188}, 1e100); QCOMPARE(state.zoom(), 2);
        state.zoomAt({328, 188}, 1e-100); QCOMPARE(state.zoom(), 1);
        state.setZoomPercent(1600); state.zoomAt({328, 188}, 2); QCOMPARE(state.zoom(), kMaxZoom);
        state.setZoomPercent(10); state.zoomAt({328, 188}, 0.5); QCOMPARE(state.zoom(), kMinZoom);
    }
    void guides() {
        MonitorViewState state; state.setCanvasSize({100, 80});
        QVERIFY(state.guidesVisible()); state.setGuidesVisible(false);
        QCOMPARE(state.addGuide(true, 10.5), 0); QVERIFY(state.guidesVisible());
        QCOMPARE(state.guides().at(0).toMap().value("position").toDouble(), 11);
        QCOMPARE(state.addGuide(false, -100), 1);
        QCOMPARE(state.guides().at(1).toMap().value("position").toDouble(), 0);
        QCOMPARE(state.addGuide(true, 999), 2);
        QCOMPARE(state.guides().at(2).toMap().value("position").toDouble(), 100);
        state.moveGuide(0, 23.5); QCOMPARE(state.guides().at(0).toMap().value("position").toDouble(), 24);
        state.setGuidesLocked(true); const auto locked = state.guides();
        state.moveGuide(0, 50); state.removeGuide(0); QCOMPARE(state.guides(), locked);
        state.setGuidesLocked(false);
        state.moveGuide(-1, 1); state.removeGuide(99); QCOMPARE(state.guides(), locked);
        state.moveGuide(1, 200); QCOMPARE(state.guides().at(1).toMap().value("position").toDouble(), 80);
        state.setCanvasSize({50, 50}); QCOMPARE(state.guides().size(), 1);
        state.removeGuide(0); QVERIFY(state.guides().isEmpty());
        state.addGuide(false, 1); state.clearGuides(); QVERIFY(state.guides().isEmpty());
    }
    void currentLifetime() {
        QCOMPARE(MonitorViewState::current(), nullptr);
        auto first = std::make_unique<MonitorViewState>(); QCOMPARE(MonitorViewState::current(), first.get());
        auto second = std::make_unique<MonitorViewState>(); QCOMPARE(MonitorViewState::current(), second.get());
        second.reset(); QCOMPARE(MonitorViewState::current(), first.get());
        second = std::make_unique<MonitorViewState>(); first.reset(); QCOMPARE(MonitorViewState::current(), second.get());
        second.reset(); QCOMPARE(MonitorViewState::current(), nullptr);
    }
    void optionsAndSignals() {
        MonitorViewState state;
        QCOMPARE(state.playbackResolution(), 1); QCOMPARE(state.pausedResolution(), 1);
        QVERIFY(state.showControls()); QVERIFY(!state.safeMargins()); QVERIFY(!state.rulers());
        QVERIFY(!state.guidesLocked()); QVERIFY(!state.transparencyGrid()); QCOMPARE(state.displayMode(), QString("composite"));
        for (const int resolution : {1, 2, 4, 8}) {
            state.setPlaybackResolution(resolution); state.setPausedResolution(resolution);
            QCOMPARE(state.playbackResolution(), resolution); QCOMPARE(state.pausedResolution(), resolution);
        }
        for (const int resolution : {-1, 0, 3, 16}) {
            state.setPlaybackResolution(resolution); state.setPausedResolution(resolution);
            QCOMPARE(state.playbackResolution(), 8); QCOMPARE(state.pausedResolution(), 8);
        }
        const auto meta = state.metaObject();
        for (const char* name : {"safeMargins", "rulers", "guidesVisible", "guidesLocked", "transparencyGrid", "showControls"}) {
            const auto property = meta->property(meta->indexOfProperty(name));
            QSignalSpy spy(&state, property.notifySignal());
            const auto initial = property.read(&state);
            QVERIFY(property.write(&state, initial)); QCOMPARE(spy.count(), 0);
            QVERIFY(property.write(&state, !initial.toBool())); QCOMPARE(spy.count(), 1);
            QVERIFY(property.write(&state, !initial.toBool())); QCOMPARE(spy.count(), 1);
        }
        QSignalSpy mode(&state, &MonitorViewState::displayModeChanged);
        state.setDisplayMode("alpha"); state.setDisplayMode("alpha"); QCOMPARE(mode.count(), 1);
        state.setDisplayMode("registered-view"); QCOMPARE(state.displayMode(), QString("registered-view"));
        state.setViewportSize({400, 300}); state.setCanvasSize({1920, 1080}); state.setZoomPercent(100);
        // Every notify signal is checked, including derived geometry.
        std::vector<std::unique_ptr<QSignalSpy>> watchers;
        for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
            if (meta->method(i).methodType() == QMetaMethod::Signal) { watchers.push_back(std::make_unique<QSignalSpy>(&state, meta->method(i))); }
        }
        state.setViewportSize(state.viewportSize()); state.setCanvasSize(state.canvasSize());
        state.setDevicePixelRatio(state.devicePixelRatio()); state.setFitInset(state.fitInset());
        state.setPlaybackResolution(8); state.setPausedResolution(8);
        state.setZoomPercent(100); state.panBy({0, 0}); state.zoomAt({200, 150}, 1);
        for (const auto& spy : watchers) { QCOMPARE(spy->count(), 0); }
        QSignalSpy picture(&state, &MonitorViewState::pictureRectChanged);
        state.panBy({10, 10}); QCOMPARE(picture.count(), 1);
        state.panBy({0, 0}); QCOMPARE(picture.count(), 1);
    }
    void badInput() {
        MonitorViewState state; state.setViewportSize({400, 300}); state.setCanvasSize({1920, 1080}); state.setZoomPercent(100);
        const auto rect = state.pictureRect(); const auto zoom = state.zoom();
        for (const double value : {std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity(), 0.0, -1.0}) {
            state.setZoomPercent(value); state.zoomAt({200,150}, value);
            state.setDevicePixelRatio(value); state.setViewportSize({value, 300}); state.setCanvasSize({1920, value});
            QCOMPARE(state.pictureRect(), rect); QCOMPARE(state.zoom(), zoom);
        }
        for (const double value : {std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity()}) {
            state.zoomAt({value, 0}, 1.1); state.panBy({value, 0}); state.zoomByWheelNotches({0,0}, value);
            QCOMPARE(state.addGuide(true, value), -1);
            state.moveGuide(0, value); state.setFitInset(value);
            QCOMPARE(state.pictureRect(), rect); QCOMPARE(state.zoom(), zoom);
        }
        state.zoomByWheelNotches({200,150}, 0); QCOMPARE(state.pictureRect(), rect);
        state.setFitInset(-1); QCOMPARE(state.fitInset(), 8);
        state.setDisplayMode(""); QCOMPARE(state.displayMode(), QString("composite"));
        state.addGuide(true, 10); const auto guides = state.guides();
        state.moveGuide(0, std::numeric_limits<double>::quiet_NaN()); QCOMPARE(state.guides(), guides);
    }
    void rulerStep() {
        QCOMPARE(niceRulerStep(50), 1); QCOMPARE(niceRulerStep(25), 2);
        QCOMPARE(niceRulerStep(10), 5); QCOMPARE(niceRulerStep(1), 50);
        QCOMPARE(niceRulerStep(0.001), 5000);
    }
    void fittedGeometry_data() {
        QTest::addColumn<QSizeF>("viewport"); QTest::addColumn<QSizeF>("canvas"); QTest::addColumn<QRectF>("expected");
        QTest::newRow("landscape") << QSizeF(656, 376) << QSizeF(1920, 1080) << QRectF(8, 8, 640, 360);
        QTest::newRow("wide") << QSizeF(816, 316) << QSizeF(1920, 1080) << QRectF((816-300*16.0/9)/2, 8, 300*16.0/9, 300);
        QTest::newRow("portrait") << QSizeF(416, 816) << QSizeF(1080, 1920) << QRectF(8, (816-400*16.0/9)/2, 400, 400*16.0/9);
        QTest::newRow("tiny") << QSizeF(10, 10) << QSizeF(1920, 1080) << QRectF();
        QTest::newRow("empty") << QSizeF(0, 0) << QSizeF(0, 0) << QRectF();
    }
    void fittedGeometry() {
        QFETCH(QSizeF, viewport); QFETCH(QSizeF, canvas); QFETCH(QRectF, expected);
        QCOMPARE(fitRect(viewport, canvas, 8), expected);
        // The picture starts on a device pixel, here half a logical pixel at ratio 2.
        const QRectF snapped(QPointF(std::round(expected.x() * 2) / 2, std::round(expected.y() * 2) / 2), expected.size());
        QCOMPARE(pictureRect(viewport, canvas, std::nullopt, {100, -100}, 2, 8), snapped);
        if (!expected.isEmpty()) {
            const auto visible = visibleRegion(expected, viewport, 2);
            QCOMPARE(visible.item, QRectF(QPointF(), expected.size()));
            QCOMPARE(visible.canvas, QRectF(0, 0, 1, 1));
        }
    }
};
QTEST_GUILESS_MAIN(MonitorViewTest)
#include "tst_monitorview.moc"
