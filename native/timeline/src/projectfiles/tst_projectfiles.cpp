// The Files dock in the production timeline editor: it registers in the left
// slot, shows the shared FilesPanel without its own close button, and follows
// the editor's project folder.
#include "projectfiles/TimelineProjectFiles.h"
#include "server/projectfolder/ProjectFolderState.h"
#include "wiring/WiringFixture.h"

class TestProjectFiles : public WiringFixture {
    Q_OBJECT
    // Shows the Files tab in its left group. The dock places a registered left
    // panel there, so the reveal needs no layout of its own.
    static void reveal(DockLayoutStore* dock) {
        dock->dispatch({{"type", "reveal"}, {"panelId", "files"}});  // false when the layout already shows it
        QCoreApplication::processEvents();
        const auto layout = dock->layout();
        QVERIFY(!layout.value("hidden").toStringList().contains("files"));
        bool active = false;
        for (const auto& group : layout.value("regions").toMap().value("left").toList()) {
            active = active || group.toMap().value("activePanelId").toString() == "files";
        }
        QVERIFY(active);
    }
private slots:
    void init() { open(); }
    void cleanup() { view.reset(); }
    void theFilesDockOpensFromTheLeftSlot() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        auto* host = item("projectFilesDock");
        QVERIFY(host);
        QTRY_VERIFY(host->isVisible());
        QVERIFY(host->width() > 0 && host->height() > 0);
        QVERIFY(item("files-header"));
        // The dock tab closes the panel, so the panel has no close button.
        auto* close = item("files-close");
        QVERIFY(close);
        QVERIFY(!close->isVisible());
        // A local timeline has no project folder.
        QTRY_VERIFY(item("files-no-folder") && item("files-no-folder")->isVisible());
        QVERIFY(!item("files-refresh")->isVisible());
    }
    void theDockFollowsTheEditorsProjectFolder() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        // The dock host owns the panel, so it is found under the panel item.
        auto* source = item("projectFilesDock")->findChild<TimelineProjectFiles*>();
        QVERIFY(source);
        QTRY_VERIFY(source->folder());
        QCOMPARE(source->folder(), view->rootObject()->property("projectFolder").value<ProjectFolderState*>());
        QVERIFY(!source->model().hasFolder());
    }
};
QTEST_MAIN(TestProjectFiles)
#include "tst_projectfiles.moc"
