// Toolbar.qml, SelectionToolbar.qml and AuthoredControls.qml on their own:
// fixture EditorCommands, Selection and RunState, no EditorWindow, graph
// runner, QtNodes or media. The executable links only the interface library
// and the QML module.
#include "interfaces/EditorCommands.h"
#include "interfaces/RunState.h"
#include "interfaces/Selection.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::EditorCommands;
using nodetool::node_editor::RunState;
using nodetool::node_editor::Selection;

namespace {

QQuickItem *named(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = named(child, name)) {
            return found;
        }
    }
    return nullptr;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
                      item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

void show(QQuickView &view, const QVariantMap &properties, const QString &file) {
    view.setInitialProperties(properties);
    view.setResizeMode(QQuickView::SizeViewToRootObject);
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
    QCOMPARE(view.status(), QQuickView::Ready);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    QVERIFY(view.rootObject());
}

QVariantMap job(const QString &workflow, const QString &status, int order) {
    return {{"workflow_id", workflow}, {"status", status}, {"order", order}, {"terminal", false}};
}

}  // namespace

class ToolbarComponentTest : public QObject {
    Q_OBJECT
private slots:
    void toolbarRunsCommandsAndShowsTheQueue() {
        EditorCommands commands;
        RunState runs;
        runs.setConnected(true);
        runs.setWorkflowId("w1");
        QSignalSpy run(&commands, &EditorCommands::commandRequested);
        QSignalSpy theme(&commands, &EditorCommands::presentationRequested);
        QQuickView view;
        show(view, {{"commands", QVariant::fromValue(&commands)}, {"runs", QVariant::fromValue(&runs)}},
             "Toolbar.qml");
        // The toolbar sends the theme roles once it is complete.
        QCOMPARE(theme.size(), 1);
        QVERIFY(theme.first().first().toMap().contains("canvas"));
        auto *root = view.rootObject();
        QCOMPARE(root->property("runLabel").toString(), "Run entire workflow");
        click(view, named(root, "run-workflow"));
        QCOMPARE(run.size(), 1);
        QCOMPARE(run.takeFirst().first().toString(), "Run");
        click(view, named(root, "toolbar-auto-layout"));
        QCOMPARE(run.takeFirst().first().toString(), "Auto layout");

        // Only the open workflow's jobs count.
        runs.setQueue({job("w1", "running", 1), job("w1", "queued", 2), job("other", "queued", 3)});
        commands.setRunning(true);
        QCOMPARE(root->property("runLabel").toString(), "Running · 1 queued");
        QTRY_VERIFY(named(root, "toolbar-stop")->isVisible());

        // A disconnected server or a read-only document disables Run.
        runs.setConnected(false);
        QVERIFY(!named(root, "run-workflow")->isEnabled());
        runs.setConnected(true);
        QVERIFY(named(root, "run-workflow")->isEnabled());
        commands.setReadOnly(true);
        QVERIFY(!named(root, "run-workflow")->isEnabled());
        QVERIFY(!named(root, "toolbar-auto-layout")->isEnabled());
        QVERIFY(named(root, "toolbar-more")->isEnabled());
    }

    void selectionToolbarFollowsTheSelection() {
        EditorCommands commands;
        Selection selection;
        selection.setSelection(1, {{"kind", "node"}, {"childGraph", true}}, false, false);
        QSignalSpy run(&commands, &EditorCommands::commandRequested);
        QSignalSpy menu(&selection, &Selection::nodeMenuRequested);
        QQuickView view;
        show(view, {{"commands", QVariant::fromValue(&commands)}, {"selection", QVariant::fromValue(&selection)}},
             "SelectionToolbar.qml");
        auto *root = view.rootObject();
        QVERIFY(root->property("cardMode").toBool());
        QTRY_VERIFY(named(root, "selection-open-child"));
        click(view, named(root, "selection-disable-selected"));
        QCOMPARE(run.takeFirst().first().toString(), "Disable selected");
        click(view, named(root, "selection-more-node-actions"));
        QCOMPARE(menu.size(), 1);
        QVERIFY(run.isEmpty());

        // Two selected nodes, mostly disabled, show the canvas row.
        selection.setSelection(2, {}, false, true);
        QVERIFY(!root->property("cardMode").toBool());
        QTRY_VERIFY(named(root, "selection-link-selected"));
        QVERIFY(named(root, "selection-link-selected")->isEnabled());
        QVERIFY(named(root, "selection-enable-selected"));
        QVERIFY(named(root, "selection-run-selected")->isEnabled());
        commands.setRunning(true);
        QVERIFY(!named(root, "selection-run-selected")->isEnabled());
        commands.setReadOnly(true);
        QVERIFY(!named(root, "selection-group-selection")->isEnabled());
    }

    void groupControlsRunTheGroup() {
        EditorCommands commands;
        RunState runs;
        QSignalSpy authored(&runs, &RunState::authoredRequested);
        QQuickView view;
        show(view,
             {{"commands", QVariant::fromValue(&commands)},
              {"runs", QVariant::fromValue(&runs)},
              {"resourceId", "g1"},
              {"bypassed", false},
              {"hasChildren", true},
              {"group", true},
              {"epoch", QVariant::fromValue(quint64(4))},
              {"credentials", QVariant::fromValue(quint64(7))}},
             "AuthoredControls.qml");
        auto *root = view.rootObject();
        auto *runGroup = named(root, "group-run");
        QVERIFY(runGroup);
        QVERIFY(!runGroup->isEnabled());
        runs.setConnected(true);
        QVERIFY(runGroup->isEnabled());
        click(view, runGroup);
        QCOMPARE(authored.size(), 1);
        const auto arguments = authored.takeFirst();
        QCOMPARE(arguments.at(0).toString(), "g1");
        QCOMPARE(arguments.at(1).toString(), "run");
        QCOMPARE(arguments.at(2).toULongLong(), 4u);
        QCOMPARE(arguments.at(3).toULongLong(), 7u);
        commands.setRunning(true);
        QVERIFY(!runGroup->isEnabled());
        QCOMPARE(runGroup->property("accessibleName").toString(), "Group is running");
    }
};

QTEST_MAIN(ToolbarComponentTest)
#include "ToolbarComponentTest.moc"
