// The track header's color strip, instrument icon and volume slider, in an
// offscreen window. The slider writes the mixer's `setTrackVolume` edit once
// per drag, and it hides when the header is narrow.
#include "TestAssetCacheRoot.h"
#include "audio/automation/Automation.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QUndoStack>
#include <QtTest>

#include <memory>

class TestTrackHeaderVolume : public QObject {
    Q_OBJECT
    TestAssetCacheRoot m_testCache;
    TimelineModel model;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QQuickWindow> window;
    std::unique_ptr<QObject> header;

    QQuickItem* item(const QString& name) const {
        const auto find = [&](auto&& self, QQuickItem* at) -> QQuickItem* {
            if (at->objectName() == name) { return at; }
            for (auto* child : at->childItems()) {
                if (auto* hit = self(self, child)) { return hit; }
            }
            return nullptr;
        };
        return find(find, window->contentItem());
    }
    double trackDb(const QString& id) const {
        const auto doc = QJsonDocument::fromJson(model.documentJson()).object();
        for (const auto& t : doc["tracks"].toArray()) {
            if (t.toObject()["id"].toString() == id) { return t.toObject()["volumeDb"].toDouble(0); }
        }
        return -999;
    }
    QPoint at(QQuickItem* target, double fx) const {
        return target->mapToScene({target->width() * fx, target->height() / 2}).toPoint();
    }
    void open(const QString& id, const QString& type, double width = 400, double height = 64) {
        header.reset();
        QQmlComponent component(engine.get());
        component.setData(QStringLiteral(R"(import QtQuick
import NodeTool.Timeline
TrackHeader {
    trackId: "%1"; name: "Track"; trackType: "%2"; trackVisible: true; locked: false
    muted: false; solo: false; typedIndex: 1; rowHeight: %4; width: %3
    track: ({id: "%1", type: "%2", color: "%1" === "m" ? "#c04040" : ""})
}
)").arg(id, type).arg(width).arg(height).toUtf8(), QUrl());
        header.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(header, qPrintable(component.errorString()));
        qobject_cast<QQuickItem*>(header.get())->setParentItem(window->contentItem());
    }

  private slots:
    void init() {
        nt::automation::registerEdits();
        const auto parsed = nt::parseTimelineJson(R"({"name":"T","fps":30,"width":640,"height":360,"durationMs":10000,
            "tracks":[{"id":"a","type":"audio","index":0,"name":"Vox","volumeDb":-6},
                      {"id":"m","type":"midi","index":1,"name":"Keys","volumeDb":0}],"clips":[],"master":{"volumeDb":0}})");
        QVERIFY(parsed.timeline);
        model.setTimeline(*parsed.timeline);
        engine = std::make_unique<QQmlEngine>();
        m_testCache.install(*engine);
        window = std::make_unique<QQuickWindow>();
        window->resize(500, 200);
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        window->requestActivate();
    }
    void cleanup() {
        header.reset();
        window.reset();
        engine.reset();
    }

    void stripUsesTheTrackColorOrTheTypeAccent() {
        open("m", "midi");
        QCOMPARE(item("trackColorStrip-m")->property("color").value<QColor>(), QColor("#c04040"));
        open("a", "audio");
        QVERIFY(item("trackColorStrip-a")->property("color").value<QColor>().isValid());
        QVERIFY(item("trackColorStrip-a")->property("color").value<QColor>() != QColor("#c04040"));
        QCOMPARE(item("trackColorStrip-a")->width(), 4.0);
    }
    void iconFollowsTheTrackType() {
        open("m", "midi");
        QCOMPARE(item("trackInstrumentIcon-m")->property("name").toString(), QStringLiteral("piano"));
        open("a", "audio");
        QCOMPARE(item("trackInstrumentIcon-a")->property("name").toString(), QStringLiteral("graphicEq"));
    }
    void dragChangesTheGainAsOneUndoStep() {
        open("a", "audio");
        auto* slider = item("trackVolumeSlider-a");
        QVERIFY(slider && slider->isVisible());
        QCOMPARE(trackDb("a"), -6.0);
        const int steps = model.undoStack()->count();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, at(slider, 0.5));
        for (double f = 0.5; f <= 0.9; f += 0.05) {
            QTest::mouseMove(window.get(), at(slider, f));
        }
        // The drag previews a draft: the document has not changed yet.
        QCOMPARE(model.undoStack()->count(), steps);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, at(slider, 0.9));
        QTRY_VERIFY(trackDb("a") > -6.0);
        QCOMPARE(model.undoStack()->count(), steps + 1);
        model.undoStack()->undo();
        QCOMPARE(trackDb("a"), -6.0);
        QCOMPARE(model.undoStack()->count(), steps + 1);
    }
    void doubleClickResetsToZeroDb() {
        open("a", "audio");
        auto* slider = item("trackVolumeSlider-a");
        QVERIFY(slider);
        const int steps = model.undoStack()->count();
        const QPoint p = at(slider, 0.2);
        QTest::mouseClick(window.get(), Qt::LeftButton, Qt::NoModifier, p);
        QTest::mouseDClick(window.get(), Qt::LeftButton, Qt::NoModifier, p);
        QTRY_COMPARE(trackDb("a"), 0.0);
        QVERIFY(model.undoStack()->count() >= steps + 1);
    }
    void sliderHidesWhenTheHeaderIsNarrow() {
        open("a", "audio", 400);
        QVERIFY(item("trackVolume-a")->isVisible());
        qobject_cast<QQuickItem*>(header.get())->setWidth(110);
        QTRY_VERIFY(!item("trackVolume-a")->isVisible());
        // The other controls stay.
        QVERIFY(item("track-muted-a"));
        qobject_cast<QQuickItem*>(header.get())->setWidth(400);
        QTRY_VERIFY(item("trackVolume-a")->isVisible());
    }
    void sliderHidesOnAShortRow() {
        open("a", "audio", 400, 40);
        QVERIFY(!item("trackVolume-a")->isVisible());
    }
};

QTEST_MAIN(TestTrackHeaderVolume)
#include "tst_trackheadervolume.moc"
