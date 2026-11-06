#include "wiring/WiringFixture.h"
#include "app/PanelRegistry.h"
#include <QAbstractItemModelTester>

class TestWiringRows : public WiringFixture {
    Q_OBJECT
private slots:
    void cleanup() { view.reset(); }
    void absentPanel() {
        open();
        auto* rows = gestures()->rows(); QVERIFY(rows);
        QCOMPARE(rows->rowTops(), std::vector<double>({0, 80, 160}));
        QCOMPARE(rows->rowHeights(), std::vector<double>({80, 80, 80}));
        QCOMPARE(rows->contentHeight(), 240.0);
        const auto before = doc();
        click("clip-c");
        QCOMPARE(gestures()->selection(), QStringList{"c"});
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(item("trackLane-w")->mapToScene({0, 0}).y(), item("trackLane-v")->mapToScene({0, 80}).y());
    }
    void registeredRows() {
        QVERIFY(nt::app::registerPanel({"trackLane", "test-trackLane", QUrl("qrc:/wiring-test/TestTrackLane.qml"), 10}));
        open();
        const auto before = doc();
        auto* rows = gestures()->rows(); QVERIFY(rows);
        QTRY_VERIFY2(item("probe-trackLane-v"), "Registered trackLane row must appear below each production lane");
        QTRY_COMPARE(rows->contentHeight(), 312.0);
        QCOMPARE(gestures()->viewState()->contentHeightPx(), 312.0);
        QCOMPARE(rows->rowTops(), std::vector<double>({0, 104, 208}));
        QCOMPARE(rows->rowHeights(), std::vector<double>({104, 104, 104}));
        for (const auto& id : {"v", "w", "a"}) {
            auto* probe = item("probe-trackLane-" + QString::fromLatin1(id)); QVERIFY(probe);
            auto* lane = item("trackLane-" + QString::fromLatin1(id)); QVERIFY(lane);
            auto* header = item("trackHeader-" + QString::fromLatin1(id)); QVERIFY(header);
            QCOMPARE(probe->property("track").toMap(), track(id).toVariantMap());
            QCOMPARE(probe->property("timeline").value<QObject*>(), &model);
            QCOMPARE(lane->height(), 80.0); QCOMPARE(header->height(), 80.0);
            QCOMPARE(probe->mapToScene({0, 0}).y(), lane->mapToScene({0, lane->height()}).y());
            QCOMPARE(probe->height(), 24.0);
            click(probe->objectName());
            QCOMPARE(probe->property("clicks").toInt(), 1);
        }
        clock.seek(1500);
        const QPoint underPlayhead(qRound(item("playhead")->mapToScene({8, 0}).x()), center(item("probe-trackLane-v")).y());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, underPlayhead);
        QCOMPARE(item("probe-trackLane-v")->property("clicks").toInt(), 2);
        QCOMPARE(clock.time(), 1500.0);
        QCOMPARE(item("trackLane-w")->mapToScene({0, 0}).y(), item("trackLane-v")->mapToScene({0, 104}).y());
        QCOMPARE(doc(), before); QCOMPARE(model.undoStack()->count(), 0);
        QPointer<QQuickItem> retained(item("trackLane-w"));
        gestures()->viewState()->setVerticalZoom(1.5);
        QTRY_COMPARE(rows->contentHeight(), 432.0);
        QCOMPARE(rows->rowTops(), std::vector<double>({0, 144, 288}));
        QCOMPARE(item("trackLane-w"), retained.data());
        QCOMPARE(item("trackLane-w")->height(), 120.0);
        QCOMPARE(item("trackHeader-w")->height(), 120.0);
        QCOMPARE(item("probe-trackLane-w")->mapToScene({0, 0}).y(), retained->mapToScene({0, 120}).y());
    }
    void extraHeightsRelayoutWithoutReset() {
        nt::Timeline timeline;
        for (int i = 0; i < 20; ++i) {
            nt::Track track;
            track.id = "t" + std::to_string(i);
            track.index = i;
            track.raw = QJsonObject{{"heightPx", 80}};
            timeline.tracks.push_back(std::move(track));
        }
        TrackListModel tracks;
        tracks.reset(&timeline);
        TimelineViewState state;
        state.setViewportHeightPx(80);
        TrackWindowModel rows;
        rows.setTracks(&tracks); rows.setViewState(&state);
        QAbstractItemModelTester tester(&rows, QAbstractItemModelTester::FailureReportingMode::QtTest);
        state.setScrollTopPx(800);
        QCOMPARE(rows.windowStart(), 7); QCOMPARE(rows.windowEnd(), 14);
        QSignalSpy reset(&rows, &QAbstractItemModel::modelReset);
        QSignalSpy changed(&rows, &QAbstractItemModel::dataChanged);
        QSignalSpy height(&rows, &TrackWindowModel::contentHeightChanged);
        QVERIFY2(rows.metaObject()->indexOfProperty("extraRowHeights") >= 0, "TrackWindowModel needs notifying extraRowHeights");
        QSignalSpy extras(&rows, SIGNAL(extraRowHeightsChanged()));
        const QVariantMap map{{"t0", 160.0}, {"t9", 40.0}};
        QVERIFY(rows.setProperty("extraRowHeights", map));
        QCOMPARE(rows.property("extraRowHeights").toMap(), map);
        QCOMPARE(rows.contentHeight(), 1800.0); QCOMPARE(state.contentHeightPx(), 1800.0);
        QCOMPARE(rows.rowTops()[1], 240.0); QCOMPARE(rows.rowTops()[10], 1000.0);
        QCOMPARE(rows.windowStart(), 5); QCOMPARE(rows.windowEnd(), 12);
        QCOMPARE(reset.count(), 0); QVERIFY(!changed.isEmpty()); QCOMPARE(extras.count(), 1); QCOMPARE(height.count(), 1);
        const int baseRole = rows.roleNames().key("baseRowHeight", -1);
        QVERIFY(baseRole >= 0);
        const int t9 = 9 - rows.windowStart();
        QCOMPARE(rows.data(rows.index(t9), baseRole).toDouble(), 80.0);
        QCOMPARE(rows.data(rows.index(t9), TrackWindowModel::RowHeightRole).toDouble(), 120.0);
        QCOMPARE(rows.data(rows.index(t9), TrackWindowModel::RowTopRole).toDouble(), 880.0);
        const auto roles = changed.last()[2].value<QList<int>>();
        QVERIFY(roles.contains(TrackWindowModel::RowHeightRole)); QVERIFY(roles.contains(TrackWindowModel::RowTopRole));
        const auto changes = changed.count();
        QVERIFY(rows.setProperty("extraRowHeights", map));
        QCOMPARE(changed.count(), changes); QCOMPARE(extras.count(), 1);
        QVERIFY(rows.setProperty("extraRowHeights", QVariantMap{}));
        QCOMPARE(rows.contentHeight(), 1600.0); QCOMPARE(rows.rowTops()[10], 800.0);
        QCOMPARE(rows.windowStart(), 7); QCOMPARE(rows.windowEnd(), 14); QCOMPARE(reset.count(), 0);
        state.setVerticalZoom(1.5);
        QCOMPARE(rows.data(rows.index(0), baseRole).toDouble(), 120.0);
    }
};
QTEST_MAIN(TestWiringRows)
#include "tst_wiringrows.moc"
