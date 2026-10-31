#include "DockLayoutStore.h"
#include "app/Preferences/PreferencesSettings.h"
#include <QFile>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>

class TestDockStore : public QObject {
    Q_OBJECT
    QTemporaryDir preferences;
private slots:
    void init() {
        QVERIFY(preferences.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(preferences.filePath("dock.ini")));
        QFile::remove(preferences.filePath("dock.ini"));
    }
    void persistsEachWorkspaceAndResets() {
        const QVariantList panels{QVariantMap{{"id", "assets"}, {"defaultRegion", "left"}}};
        QVariantMap script;
        {
            DockLayoutStore store;
            store.registerPanels(panels);
            store.switchWorkspace(1);
            QCOMPARE(store.workspace(), QString("Script"));
            QVERIFY(store.dispatch({{"type", "resize"}, {"region", "left"}, {"size", 610}}));
            QVERIFY(store.dispatch({{"type", "hide"}, {"panelId", "inspector"}}));
            script = store.layout();
            store.switchWorkspace(3);
            QCOMPARE(store.workspace(), QString("Review"));
            QVERIFY(store.dispatch({{"type", "resize"}, {"region", "bottom"}, {"size", 400}}));
        }
        DockLayoutStore restored;
        restored.registerPanels(panels);
        QCOMPARE(restored.workspace(), QString("Review"));
        QCOMPARE(restored.layout().value("sizes").toMap().value("bottom").toInt(), 400);
        restored.switchWorkspace(1);
        QCOMPARE(restored.layout(), script);
        restored.resetWorkspace();
        QCOMPARE(restored.layout().value("sizes").toMap().value("left").toInt(), 480);
        QCOMPARE(restored.layout().value("hidden").toStringList(), QStringList{"source"});
        const auto left = restored.layout().value("regions").toMap().value("left").toList();
        QVERIFY(left.first().toMap().value("panels").toStringList().contains("assets"));
        QVERIFY(nt::app::openTimelinePreferences()->contains("nodetool.timeline-layout.v1"));
    }
    void clampsPresentationAndResizeWithoutOverwritingStoredSize() {
        DockLayoutStore store;
        QCOMPARE(store.displaySizes(900, 200, store.layout().value("sizes").toMap()).value("bottom").toDouble(), 150.0);
        QCOMPARE(store.displaySizes(900, 200, store.layout().value("sizes").toMap()).value("right").toDouble(), 300.0);
        QCOMPARE(store.layout().value("sizes").toMap().value("bottom").toInt(), 300);
        store.resizeRegion("bottom", 800, 900, 200);
        QCOMPARE(store.layout().value("sizes").toMap().value("bottom").toInt(), 150);
        store.resizeRegion("left", -100, 900, 200);
        QCOMPARE(store.layout().value("sizes").toMap().value("left").toInt(), 100);
        QSignalSpy changes(&store, &DockLayoutStore::changed);
        QVERIFY(!store.dispatch({{"type", "hide"}, {"panelId", "program"}}));
        QVERIFY(!store.dispatch({{"type", "hide"}, {"panelId", "tracks"}}));
        QCOMPARE(changes.count(), 0);
    }
    void rejectsCorruptPreferencesAndActions() {
        auto settings = nt::app::openTimelinePreferences();
        settings->setValue("nodetool.timeline-layout.v1", "not json");
        settings->sync();
        DockLayoutStore store;
        QVERIFY(store.layout().contains("regions"));
        const auto before = store.layout();
        QVERIFY(!store.dispatch({{"type", "resize"}, {"region", "left"}, {"size", 99}}));
        QCOMPARE(store.layout(), before);
        store.switchWorkspace(-1);
        store.switchWorkspace(4);
        QCOMPARE(store.layout(), before);
    }
};
QTEST_GUILESS_MAIN(TestDockStore)
#include "tst_dockstore.moc"
