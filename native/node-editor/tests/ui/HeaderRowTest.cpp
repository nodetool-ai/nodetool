#include "FakeRunServer.h"
#include "ui/EditorWindow.h"
#include <QFile>
#include <QGraphicsView>
#include "EntryMenuSupport.h"
#include <QQuickItem>
#include <QQuickWidget>
#include <QSettings>
#include <QStandardPaths>
#include <QToolTip>
#include <QtTest>
#include <cmath>

using namespace nodetool;

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}

QQuickItem *find(QQuickItem *root, const QString &name) {
    if (!root) {
        return nullptr;
    }
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = find(child, name)) {
            return found;
        }
    }
    return nullptr;
}

// Panels and their layout follow in the next two event-loop passes.
void settle() {
    QCoreApplication::processEvents();
    QCoreApplication::processEvents();
    QTest::qWait(50);
}

bool near(double actual, double expected, double tolerance = 1) {
    return std::abs(actual - expected) <= tolerance;
}

QString describe(double actual, double expected) {
    return QStringLiteral("%1, web %2").arg(actual).arg(expected);
}
} // namespace

class HeaderRowTest final : public QObject {
    Q_OBJECT

    static QQuickWidget *panel(EditorWindow &window, const QString &file) {
        for (auto *widget : window.findChildren<QQuickWidget *>()) {
            if (widget->isVisible() && widget->source().fileName() == file) {
                return widget;
            }
        }
        return nullptr;
    }

    static QQuickItem *item(QQuickWidget *widget, const QString &name) {
        return widget ? find(widget->rootObject(), name) : nullptr;
    }

    // The item's bounds in the widget, which a SizeRootObjectToView panel shares with its scene.
    static QRectF bounds(QQuickItem *item) {
        return item->mapRectToScene(QRectF(0, 0, item->width(), item->height()));
    }

    static QPoint center(QQuickItem *item) {
        return bounds(item).center().toPoint();
    }

    static void click(QQuickWidget *widget, const QString &name) {
        settle();
        auto *control = item(widget, name);
        QVERIFY2(control, qPrintable(name));
        QVERIFY2(control->isVisible(), qPrintable(name));
        QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, center(control));
        settle();
    }

    static QString hover(QQuickWidget *widget, const QString &name) {
        settle();
        auto *control = item(widget, name);
        if (!control) {
            return {};
        }
        // Leave first, so a retry hovers again.
        QTest::mouseMove(widget, QPoint(widget->width() - 1, widget->height() - 1));
        settle();
        // The first move into a panel only enters it. The second one hovers the control.
        QTest::mouseMove(widget, center(control) - QPoint(1, 0));
        QTest::mouseMove(widget, center(control));
        settle();
        return QToolTip::isVisible() ? QToolTip::text() : QString();
    }

    static void leave(QQuickWidget *widget) {
        QTest::mouseMove(widget, QPoint(widget->width() - 1, widget->height() - 1));
        settle();
    }

    void open(EditorWindow &window) {
        window.setDarkTheme(true);
        window.resize(1440, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto data = fixture();
        window.setCatalog(data["metadata"].toArray());
        QVERIFY(window.document()->load(data["workflow"].toObject()));
        if (window.catalogVisible()) {
            window.action(QStringLiteral("Toggle nodes"));
        }
        settle();
    }

    static FakeRunServer *serve(QObject *parent, const QJsonObject &data) {
        // native-rules #2: naked new, parent set on the next line instead of in the statement
        auto *server = new FakeRunServer;
        server->setParent(parent);
        server->metadata = data["metadata"].toArray();
        server->workflow = data["workflow"].toObject();
        server->workflow["updated_at"] = QStringLiteral("r1");
        return server;
    }

private slots:
    void initTestCase() {
        QStandardPaths::setTestModeEnabled(true);
        QVERIFY(!fixture().isEmpty());
    }

    void init() {
        // The web keeps the chat and mini-map choices across workflows. Start each case closed.
        QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true);
        QSettings().remove(QStringLiteral("minimap/visible"));
    }

    // Web references are DOM measurements of the fixture at 1440x900 in
    // the A1 web captures. See W13 and W14 in docs/parity.md.
    void geometryFollowsWeb() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        auto *tabs = panel(window, QStringLiteral("TabBar.qml"));
        QVERIFY(tabs);
        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(view);
        // The bar is 40 tall with its 1 px rule, right under the tab bar and over the canvas.
        QCOMPARE(header->height(), 40);
        QCOMPARE(header->mapTo(&window, QPoint()).y(), tabs->mapTo(&window, QPoint(0, tabs->height())).y());
        QCOMPARE(header->mapTo(&window, QPoint()).x(), 50);
        QVERIFY(header->mapTo(&window, QPoint(0, header->height())).y() <= view->mapTo(&window, QPoint()).y());
        const auto title = bounds(item(header, QStringLiteral("header-title")));
        QVERIFY2(near(title.left(), 8), qPrintable(describe(title.left(), 8)));
        QVERIFY2(near(title.center().y(), 19.5), qPrintable(describe(title.center().y(), 19.5)));
        const auto undo = bounds(item(header, QStringLiteral("header-undo")));
        const auto redo = bounds(item(header, QStringLiteral("header-redo")));
        QCOMPARE(undo.size(), QSizeF(28, 28));
        QVERIFY2(near(redo.left() - undo.left(), 32), qPrintable(describe(redo.left() - undo.left(), 32)));
        const auto mode = bounds(item(header, QStringLiteral("header-mode")));
        QCOMPARE(mode.height(), 28.0);
        QVERIFY2(near(mode.top(), 5.5, 0.5), qPrintable(describe(mode.top(), 5.5)));
        // Web Graph and Chain: 71 and 69 wide, 140 together. Text widths differ by font hinting.
        QVERIFY2(near(mode.width(), 140, 8), qPrintable(describe(mode.width(), 140)));
        // Undo to the mode switch: 28 + 4 + 28, then 8, a 1 px rule and 8.
        QVERIFY2(near(mode.left() - undo.left(), 77), qPrintable(describe(mode.left() - undo.left(), 77)));
        const auto chat = bounds(item(header, QStringLiteral("header-chat")));
        const auto map = bounds(item(header, QStringLiteral("header-mini-map")));
        const auto inspector = bounds(item(header, QStringLiteral("header-inspector")));
        QVERIFY2(near(chat.left() - mode.right(), 17), qPrintable(describe(chat.left() - mode.right(), 17)));
        QCOMPARE(map.left() - chat.left(), 32.0);
        QCOMPARE(inspector.left() - map.left(), 32.0);
        const auto more = bounds(item(header, QStringLiteral("header-more")));
        QVERIFY2(near(header->width() - more.right(), 8), qPrintable(describe(header->width() - more.right(), 8)));
        // The web save dot is 8 px and sits 8 px after the title.
        const auto dot = bounds(item(header, QStringLiteral("header-save-dot")));
        QCOMPARE(dot.size(), QSizeF(8, 8));
        QVERIFY2(near(dot.left() - title.right(), 8), qPrintable(describe(dot.left() - title.right(), 8)));

        auto *toolbar = panel(window, QStringLiteral("Toolbar.qml"));
        QVERIFY(toolbar);
        // Web: a 46 px dock with a 1 px border, 4 px padding, 28 px buttons and a 36 px Run pill.
        QCOMPARE(toolbar->height(), 46);
        const auto add = bounds(item(toolbar, QStringLiteral("toolbar-add-node")));
        const auto layout = bounds(item(toolbar, QStringLiteral("toolbar-auto-layout")));
        const auto run = bounds(item(toolbar, QStringLiteral("run-workflow")));
        const auto actions = bounds(item(toolbar, QStringLiteral("toolbar-more")));
        QCOMPARE(add.topLeft(), QPointF(5, 9));
        QCOMPARE(add.size(), QSizeF(28, 28));
        QCOMPARE(layout.left() - add.right(), 4.0);
        QCOMPARE(run.left() - layout.right(), 8.0);
        QCOMPARE(run.height(), 36.0);
        QCOMPARE(actions.left() - run.right(), 4.0);
        QCOMPARE(toolbar->width() - actions.right(), 5.0);
        // The header owns history, chat and the document menu, so the toolbar repeats none of it.
        for (const auto *name : {"toolbar-undo", "toolbar-redo", "toolbar-open", "toolbar-save", "toggleEditorChat"}) {
            QVERIFY2(!item(toolbar, QString::fromLatin1(name)), name);
        }
    }

    void renamesInline() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        QCOMPARE(item(header, QStringLiteral("header-title"))->property("text").toString(), QStringLiteral("Window parity fixture"));
        QTRY_COMPARE(hover(header, QStringLiteral("header-title")), QStringLiteral("Double-click to rename"));
        QTest::mouseDClick(header, Qt::LeftButton, Qt::NoModifier, center(item(header, QStringLiteral("header-title"))));
        settle();
        auto *field = item(header, QStringLiteral("header-rename"));
        QVERIFY(field);
        QTRY_VERIFY(field->isVisible());
        QVERIFY(!item(header, QStringLiteral("header-title"))->isVisible());
        // Escape keeps the name.
        QTest::keyClicks(header, QStringLiteral("Discarded"));
        QTest::keyClick(header, Qt::Key_Escape);
        settle();
        QTRY_VERIFY(!field->isVisible());
        QCOMPARE(window.workflowName(), QStringLiteral("Window parity fixture"));
        QTest::mouseDClick(header, Qt::LeftButton, Qt::NoModifier, center(item(header, QStringLiteral("header-title"))));
        settle();
        QTRY_VERIFY(field->isVisible());
        QTest::keyClick(header, Qt::Key_A, Qt::ControlModifier);
        QTest::keyClicks(header, QStringLiteral("Renamed flow"));
        QTest::keyClick(header, Qt::Key_Return);
        settle();
        QTRY_COMPARE(window.workflowName(), QStringLiteral("Renamed flow"));
        QTRY_COMPARE(item(header, QStringLiteral("header-title"))->property("text").toString(), QStringLiteral("Renamed flow"));
        QVERIFY(!field->isVisible());
        // The tab shows the same name.
        QTRY_COMPARE(window.workflowTabs().value(window.activeTab()).toMap()["title"].toString(), QStringLiteral("Renamed flow"));
        // After a double-click the offscreen platform delivers no hover to the
        // next window until another click, so end with one on the bar's edge.
        QTest::mouseClick(header, Qt::LeftButton, Qt::NoModifier, QPoint(header->width() - 1, header->height() - 1));
    }

    void undoRedoFollowHistory() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        auto *undo = item(header, QStringLiteral("header-undo"));
        auto *redo = item(header, QStringLiteral("header-redo"));
        QVERIFY(!undo->isEnabled());
        QVERIFY(!redo->isEnabled());
        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(view);
        QVERIFY(window.selectNode(QStringLiteral("subject")));
        settle();
        view->setFocus();
        QTest::keyClick(view->viewport(), Qt::Key_Delete);
        settle();
        QVERIFY(window.document()->node(QStringLiteral("subject")).isEmpty());
        QTRY_VERIFY(undo->isEnabled());
        QVERIFY(!redo->isEnabled());
        QTRY_COMPARE(hover(header, QStringLiteral("header-undo")), QStringLiteral("Undo"));
        click(header, QStringLiteral("header-undo"));
        QVERIFY(!window.document()->node(QStringLiteral("subject")).isEmpty());
        QTRY_VERIFY(redo->isEnabled());
        QTRY_VERIFY(!undo->isEnabled());
        click(header, QStringLiteral("header-redo"));
        QVERIFY(window.document()->node(QStringLiteral("subject")).isEmpty());
        QTRY_VERIFY(undo->isEnabled());
        QTRY_VERIFY(!redo->isEnabled());
        // A disabled button takes no click.
        click(header, QStringLiteral("header-redo"));
        QVERIFY(window.document()->node(QStringLiteral("subject")).isEmpty());
    }

    void saveStateFollowsSession() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        auto *label = item(header, QStringLiteral("header-save-label"));
        auto *action = item(header, QStringLiteral("header-save-action"));
        QVERIFY(label);
        QVERIFY(action);
        QCOMPARE(label->property("text").toString(), QStringLiteral("Saved"));
        QVERIFY(!action->isVisible());

        auto *server = serve(&window, fixture());
        window.session()->setAutosaveDelay(60000);
        window.session()->connectToServer(server->url(), {});
        QTRY_VERIFY(window.session()->connected());
        window.session()->openWorkflow(server->workflow["id"].toString());
        QTRY_VERIFY(window.session()->serverBound());
        QTRY_COMPARE(window.documentSaveStatus(), QStringLiteral("saved"));
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Saved"));

        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        QVERIFY(view);
        QVERIFY(window.selectNode(QStringLiteral("subject")));
        settle();
        view->setFocus();
        QTest::keyClick(view->viewport(), Qt::Key_Delete);
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Unsaved changes"));

        server->holdSaves = true;
        window.session()->flushAutosave();
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Saving…"));
        QVERIFY(!item(header, QStringLiteral("header-save-dot"))->isVisible());
        server->releaseSaves();
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Saved"));
        QVERIFY(item(header, QStringLiteral("header-save-dot"))->isVisible());

        server->saveStatus = 500;
        QTest::keyClick(view->viewport(), Qt::Key_Z, Qt::ControlModifier);
        window.session()->flushAutosave();
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Not saved"));
        QTRY_VERIFY(action->isVisible());
        QCOMPARE(action->property("text").toString(), QStringLiteral("Retry"));
        // Retry saves through the server path.
        server->saveStatus = 200;
        const int before = server->saves;
        click(header, QStringLiteral("header-save-action"));
        QTRY_VERIFY(server->saves > before);
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Saved"));
        QVERIFY(!action->isVisible());

        server->saveStatus = 409;
        QTest::keyClick(view->viewport(), Qt::Key_Z, Qt::ControlModifier | Qt::ShiftModifier);
        window.session()->flushAutosave();
        QTRY_COMPARE(label->property("text").toString(), QStringLiteral("Server conflict"));
        QTRY_VERIFY(action->isVisible());
        QCOMPARE(action->property("text").toString(), QStringLiteral("Review"));
        QCOMPARE(window.documentSaveStatus(), QStringLiteral("conflict"));
    }

    void togglesOpenPanels() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        auto *inspector = item(header, QStringLiteral("header-inspector"));
        auto *chat = item(header, QStringLiteral("header-chat"));
        auto *map = item(header, QStringLiteral("header-mini-map"));
        QVERIFY(!window.inspectorVisible());
        QVERIFY(!inspector->property("active").toBool());
        QTRY_COMPARE(hover(header, QStringLiteral("header-inspector")), QStringLiteral("Show inspector"));
        click(header, QStringLiteral("header-inspector"));
        QTRY_VERIFY(window.inspectorVisible());
        QTRY_VERIFY(inspector->property("active").toBool());
        leave(header);
        QTRY_COMPARE(hover(header, QStringLiteral("header-inspector")), QStringLiteral("Hide inspector"));
        click(header, QStringLiteral("header-inspector"));
        QTRY_VERIFY(!window.inspectorVisible());

        QVERIFY(!window.chatVisible());
        QTRY_COMPARE(hover(header, QStringLiteral("header-chat")), QStringLiteral("Open chat"));
        click(header, QStringLiteral("header-chat"));
        QTRY_VERIFY(window.chatVisible());
        QTRY_VERIFY(chat->property("active").toBool());
        click(header, QStringLiteral("header-chat"));
        QTRY_VERIFY(!window.chatVisible());

        // The web hides the mini-map until the user turns it on.
        auto *miniMap = window.activeEditor()->findChild<QWidget *>(QStringLiteral("mini-map"));
        QVERIFY(miniMap);
        QVERIFY(!window.miniMapVisible());
        QVERIFY(!miniMap->isVisible());
        QTRY_COMPARE(hover(header, QStringLiteral("header-mini-map")), QStringLiteral("Mini map"));
        click(header, QStringLiteral("header-mini-map"));
        QTRY_VERIFY(window.miniMapVisible());
        QTRY_VERIFY(miniMap->isVisible());
        QTRY_VERIFY(map->property("active").toBool());
        click(header, QStringLiteral("header-mini-map"));
        QTRY_VERIFY(!miniMap->isVisible());

        // Graph is the only view. Chain says why it is off and ignores the click.
        auto *graph = item(header, QStringLiteral("header-mode-graph"));
        auto *chain = item(header, QStringLiteral("header-mode-chain"));
        QVERIFY(graph->property("selected").toBool());
        QVERIFY(!chain->property("available").toBool());
        QVERIFY(!item(header, QStringLiteral("header-mode-chain-button"))->isEnabled());
        QTRY_COMPARE(hover(header, QStringLiteral("header-mode-chain")),
                 QStringLiteral("The chain view is not available in the native editor yet."));
        click(header, QStringLiteral("header-mode-chain"));
        QVERIFY(graph->property("selected").toBool());
    }

    void moreOpensTheDocumentMenu() {
        EditorWindow window;
        open(window);
        auto *header = panel(window, QStringLiteral("HeaderRow.qml"));
        QVERIFY(header);
        QTRY_COMPARE(hover(header, QStringLiteral("header-more")), QStringLiteral("More actions"));
        click(header, QStringLiteral("header-more"));
        QQuickWidget *menu = nullptr;
        QTRY_VERIFY((menu = entry_menu::host(*window.activeEditor(), QStringLiteral("more"))));
        const auto labels = entry_menu::labels(menu);
        QTest::keyClick(menu, Qt::Key_Escape);
        QVERIFY2(labels.contains(QStringLiteral("Version history")), qPrintable(labels.join(", ")));
        // The toolbar no longer has Save, so the menu keeps the local file save.
        QVERIFY2(labels.contains(QStringLiteral("Save")), qPrintable(labels.join(", ")));
    }

    void toolbarStopsAndTimesASubmittedRun() {
        EditorWindow window;
        open(window);
        auto *server = serve(&window, fixture());
        window.session()->connectToServer(server->url(), {});
        QTRY_VERIFY(window.session()->connected());
        QTRY_VERIFY(server->peer);
        auto *toolbar = panel(window, QStringLiteral("Toolbar.qml"));
        QVERIFY(toolbar);
        auto *root = toolbar->rootObject();
        auto *stop = item(toolbar, QStringLiteral("toolbar-stop"));
        auto *elapsed = item(toolbar, QStringLiteral("run-elapsed"));
        QVERIFY(stop);
        QVERIFY(elapsed);
        QVERIFY(!stop->isVisible());
        QVERIFY(!elapsed->isVisible());
        const int idleWidth = toolbar->width();

        click(toolbar, QStringLiteral("run-workflow"));
        QTRY_COMPARE(server->commands.size(), 1);
        const auto job = server->commands.first()["data"].toObject()["job_id"].toString();
        QVERIFY(!job.isEmpty());
        QTRY_COMPARE(root->property("runLabel").toString(), QStringLiteral("Starting"));
        QTRY_VERIFY(stop->isVisible());
        QVERIFY(!elapsed->isVisible());

        server->update(job, QStringLiteral("running"));
        QTRY_COMPARE(root->property("runLabel").toString(), QStringLiteral("Running"));
        QTRY_VERIFY(elapsed->isVisible());
        QCOMPARE(elapsed->property("text").toString(), QStringLiteral("0:00"));
        QTRY_COMPARE_WITH_TIMEOUT(elapsed->property("text").toString(), QStringLiteral("0:01"), 3000);
        // Web: Stop then the "0:01 Running" pill, which no longer shows the play icon.
        settle();
        QVERIFY(toolbar->width() != idleWidth);
        QCOMPARE(bounds(item(toolbar, QStringLiteral("run-workflow"))).left() - bounds(stop).right(), 4.0);
        QTRY_COMPARE(hover(toolbar, QStringLiteral("toolbar-stop")), QStringLiteral("Stop workflow (Esc)"));

        click(toolbar, QStringLiteral("toolbar-stop"));
        QTRY_COMPARE(server->commands.size(), 2);
        QCOMPARE(server->commands.last()["command"].toString(), QStringLiteral("cancel_job"));
        QCOMPARE(server->commands.last()["data"].toObject()["job_id"].toString(), job);
        server->update(job, QStringLiteral("cancelled"));
        QTRY_VERIFY(!stop->isVisible());
        QTRY_VERIFY(!elapsed->isVisible());
        QCOMPARE(root->property("runLabel").toString(), QStringLiteral("Run entire workflow"));
    }
};

QTEST_MAIN(HeaderRowTest)
#include "HeaderRowTest.moc"
