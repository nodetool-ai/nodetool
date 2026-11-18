// The Files dock in the production timeline editor: it registers in the left
// slot, shows the shared FilesPanel without its own close button, and follows
// the editor's project folder.
#include "projectfiles/TimelineProjectFiles.h"
#include "server/projectfolder/ProjectFolderState.h"
#include "wiring/WiringFixture.h"
#include "aiassist/CandidatePreview.h"

#include <QTemporaryDir>
#include <QtEndian>

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
    void theDockGivesThePanelThePreviewPlayer() {
        auto* dock = qobject_cast<DockLayoutStore*>(view->rootObject()->property("dockStore").value<QObject*>());
        QVERIFY(dock);
        reveal(dock);
        QTRY_VERIFY(item("projectFilesDock"));
        QQuickItem* panel = nullptr;
        for (auto* child : item("projectFilesDock")->childItems()) {
            if (child->property("previewDelegate").isValid()) { panel = child; }
        }
        QVERIFY(panel);
        QVERIFY(panel->property("previewDelegate").value<QObject*>());
        QCOMPARE(panel->property("previewDelegateKinds").toStringList(), (QStringList{"video", "audio"}));
    }
    // The preview plays a project folder file through the timeline decoder.
    void aReviewPlaysALocalFile() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        // One second of 16-bit mono silence at 8 kHz.
        const int rate = 8000, samples = rate;
        QByteArray wav("RIFF");
        const auto u32 = [&wav](quint32 v) { char b[4]; qToLittleEndian(v, b); wav.append(b, 4); };
        const auto u16 = [&wav](quint16 v) { char b[2]; qToLittleEndian(v, b); wav.append(b, 2); };
        u32(36 + samples * 2); wav.append("WAVEfmt "); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16);
        wav.append("data"); u32(samples * 2); wav.append(QByteArray(samples * 2, '\0'));
        QFile file(dir.filePath("tone.wav"));
        QVERIFY(file.open(QIODevice::WriteOnly));
        file.write(wav);
        file.close();
        CandidatePreview review;
        review.setTimeline(view->rootObject()->property("timeline").value<TimelineModel*>());
        QVERIFY(review.timeline());
        QVERIFY(!review.previewFile(dir.filePath("missing.wav"), "audio"));
        QVERIFY(review.previewFile(file.fileName(), "audio"));
        QTRY_VERIFY2_WITH_TIMEOUT(review.ready() || !review.error().isEmpty(), "no result", 10000);
        QVERIFY2(review.ready(), qPrintable(review.error()));
        QVERIFY(review.previewClock()->durationMs() > 900);
        review.close();
    }
};
QTEST_MAIN(TestProjectFiles)
#include "tst_projectfiles.moc"
