#include "DockLayoutStore.h"
#include "app/Preferences/PreferencesSettings.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
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
    void nativeWorkspacesFollowTheWebList() {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        DockLayoutStore store;
        QCOMPARE(store.workspaces(), QStringList({"Editing", "Script", "Assistant", "Review", "Color", "Audio"}));
        // A saved panel layout survives switching away and back, and a saved
        // Color workspace is restored at startup.
        store.switchWorkspace(4);
        QCOMPARE(store.workspace(), QString("Color"));
        QVERIFY(store.layout().value("hidden").toStringList().contains("storyboard"));
        QVERIFY(store.dispatch({{"type", "resize"}, {"region", "right"}, {"size", 500}}));
        store.switchWorkspace(5);
        QCOMPARE(store.workspace(), QString("Audio"));
        QCOMPARE(store.layout().value("sizes").toMap().value("right").toDouble(), 400.0);
        store.switchWorkspace(4);
        QCOMPARE(store.layout().value("sizes").toMap().value("right").toDouble(), 500.0);
        DockLayoutStore restored;
        QCOMPARE(restored.workspace(), QString("Color"));
        QCOMPARE(restored.layout().value("sizes").toMap().value("right").toDouble(), 500.0);
        restored.resetWorkspace();
        QCOMPARE(restored.layout().value("sizes").toMap().value("right").toDouble(), 400.0);
    }
    void panelsMoveBetweenWebAndNativeWorkspaces() {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        DockLayoutStore store;
        const QVariantList panels{
            QVariantMap{{"id", "program"}, {"title", "Program"}, {"defaultRegion", "viewport"}},
            QVariantMap{{"id", "tracks"}, {"title", "Timeline"}, {"defaultRegion", "bottom"}},
            QVariantMap{{"id", "mixer"}, {"title", "Mixer"}, {"defaultRegion", "bottom"}},
            QVariantMap{{"id", "script"}, {"title", "Scripts"}, {"defaultRegion", "left"}},
            QVariantMap{{"id", "extra"}, {"title", "Extra"}, {"defaultRegion", "left"}}};
        store.registerPanels(panels);
        store.switchWorkspace(5);
        const auto groupOf = [&store](const QString& id) {
            for (const QString region : {"left", "right", "bottom", "viewport"}) {
                for (const auto& value : store.layout().value("regions").toMap().value(region).toList()) {
                    if (value.toMap().value("panels").toStringList().contains(id)) { return value.toMap().value("id").toString(); }
                }
            }
            return QString();
        };
        // The mixer moves up beside the Program monitor and is not in two places.
        QCOMPARE(groupOf("mixer"), QString("viewport-source"));
        QVERIFY(store.layout().value("hidden").toStringList().contains("script"));
        // A panel the preset does not list keeps its group and stays shown.
        QCOMPARE(groupOf("extra"), QString("left-main"));
        QVERIFY(!store.layout().value("hidden").toStringList().contains("extra"));
        store.switchWorkspace(0);
        QCOMPARE(groupOf("mixer"), QString("bottom-main"));
        QVERIFY(!store.layout().value("hidden").toStringList().contains("script"));
        // A hidden built-in panel does not end up in `hidden` twice, which would invalidate the layout.
        QVERIFY(store.dispatch({{"type", "hide"}, {"panelId", "script"}}));
        store.switchWorkspace(4);
        QCOMPARE(store.layout().value("hidden").toStringList().count("script"), 1);
        store.resetWorkspace();
        QCOMPARE(store.layout().value("hidden").toStringList().count("script"), 1);
    }
    void nativePresetHidingEndsWithItsWorkspace() {
        QFile::remove(qEnvironmentVariable("NODETOOL_TIMELINE_PREFERENCES"));
        {
            DockLayoutStore store;
            store.registerPanels({QVariantMap{{"id", "script"}, {"defaultRegion", "left"}}});
            store.switchWorkspace(4);
        }
        // The next run starts in Color with Editing never saved. Editing must not inherit Color's hidden list.
        auto settings = nt::app::openTimelinePreferences();
        auto saved = QJsonDocument::fromJson(settings->value("nodetool.timeline-layout.v1").toByteArray()).object();
        auto workspaces = saved.value("workspaces").toObject();
        workspaces.remove("Editing");
        saved.insert("workspaces", workspaces);
        settings->setValue("nodetool.timeline-layout.v1", QJsonDocument(saved).toJson(QJsonDocument::Compact));
        settings->sync();
        DockLayoutStore store;
        QCOMPARE(store.workspace(), QString("Color"));
        store.registerPanels({QVariantMap{{"id", "script"}, {"defaultRegion", "left"}}});
        store.switchWorkspace(0);
        QVERIFY(store.layout().value("hidden").toStringList().isEmpty());
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
        store.switchWorkspace(store.workspaces().size());
        QCOMPARE(store.layout(), before);
    }
};
QTEST_GUILESS_MAIN(TestDockStore)
#include "tst_dockstore.moc"
