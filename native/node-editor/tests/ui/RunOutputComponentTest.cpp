// The run output's helpers on their own: the TypeIcons and OutputStyle
// singletons through TypeIcon.qml and a Markdown text area, the RunState and
// StatusModel members RunOutput.qml reads, and QueueOverlay.qml with a fixture
// RunState. No EditorWindow, graph runner, QtNodes or media. RunOutput.qml
// builds media views, so EditorChatTest and RichOutputHostTest cover it in the
// window.
#include "interfaces/RunState.h"
#include "interfaces/StatusModel.h"

#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickTextDocument>
#include <QSignalSpy>
#include <QStandardItemModel>
#include <QTextBlock>
#include <QTextDocument>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>
#include <memory>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::RunState;
using nodetool::node_editor::StatusModel;

class RunOutputComponentTest : public QObject {
    Q_OBJECT
    // Repeater rows are visual children only, so findChild misses them.
    static QQuickItem *find(QQuickItem *root, const QString &name) {
        if (!root) { return nullptr; }
        if (root->objectName() == name) { return root; }
        for (auto *child : root->childItems()) {
            if (auto *found = find(child, name)) { return found; }
        }
        return nullptr;
    }
private slots:
    void typeIconDrawsTheSharedPaths() {
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/TypeIcon.qml"));
        std::unique_ptr<QObject> icon(component.createWithInitialProperties({{"name", "search"}}));
        QVERIFY2(icon, qPrintable(component.errorString()));
        QVERIFY(icon->property("pathData").toString().startsWith("M15.5 14h"));
        icon->setProperty("name", "no-such-icon");
        QCOMPARE(icon->property("pathData").toString(), QString());
    }

    void outputStyleColorsLinksAndCode() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(
            "import QtQuick\n"
            "import NodeTool.NodeEditor\n"
            "TextEdit {\n"
            "textFormat: TextEdit.MarkdownText\n"
            "text: \"[link](https://example.com) and `code`\"\n"
            "function style() { OutputStyle.styleMarkdown(textDocument, \"#ff0000\", \"#00ff00\", Qt.font({family: \"monospace\"})) }\n"
            "}\n"
            "\n",
            QUrl("qrc:/test/OutputStyleFixture.qml"));
        std::unique_ptr<QObject> edit(component.create());
        QVERIFY2(edit, qPrintable(component.errorString()));
        QVERIFY(QMetaObject::invokeMethod(edit.get(), "style"));
        auto *document = edit->property("textDocument").value<QQuickTextDocument *>()->textDocument();
        bool linkColored = false, codeColored = false;
        for (auto it = document->begin().begin(); !it.atEnd(); ++it) {
            const auto format = it.fragment().charFormat();
            linkColored |= format.isAnchor() && format.foreground().color() == QColor("#ff0000");
            codeColored |= format.background().color() == QColor("#00ff00");
        }
        QVERIFY(linkColored);
        QVERIFY(codeColored);
    }

    void runOutputRequestsAndMessage() {
        RunState runs;
        QSignalSpy agent(&runs, &RunState::agentRequested);
        runs.askAgent("job-1");
        QCOMPARE(agent.size(), 1);
        QCOMPARE(agent.first().first().toString(), "job-1");
        StatusModel status;
        QSignalSpy changed(&status, &StatusModel::statusChanged);
        status.setStatus({.message = "Workflow failed"});
        QCOMPARE(status.message(), "Workflow failed");
        QCOMPARE(changed.size(), 1);
    }

    void runStateCarriesTheRunOutput() {
        RunState runs;
        QSignalSpy output(&runs, &RunState::outputChanged);
        runs.setOutput({QVariantMap{{"jobId", "a"}, {"status", "running"}}}, "a");
        runs.setOutput({QVariantMap{{"jobId", "a"}, {"status", "running"}}}, "a");
        QCOMPARE(output.size(), 1);
        QCOMPARE(runs.selectedRunId(), "a");
        QCOMPARE(runs.outputRuns().size(), 1);
        QSignalSpy models(&runs, &RunState::outputModelsChanged);
        {
            QStandardItemModel collections, entries;
            runs.setOutputModels(&collections, &entries);
            QCOMPARE(models.size(), 1);
            QCOMPARE(runs.collections(), static_cast<QAbstractItemModel *>(&collections));
            QCOMPARE(runs.richEntries(), static_cast<QAbstractItemModel *>(&entries));
        }
        // The pointers do not own the models and clear when they go.
        QCOMPARE(runs.collections(), nullptr);
        QCOMPARE(runs.richEntries(), nullptr);
        QSignalSpy select(&runs, &RunState::selectRunRequested);
        QSignalSpy clear(&runs, &RunState::clearOutputRequested);
        QSignalSpy cancel(&runs, &RunState::cancelRequested);
        runs.selectRun("b");
        runs.clearOutput();
        runs.cancelJob("c");
        QCOMPARE(select.size(), 1);
        QCOMPARE(select.first().first().toString(), "b");
        QCOMPARE(clear.size(), 1);
        QCOMPARE(cancel.first().first().toString(), "c");
    }

    void queueOverlayReadsRunState() {
        RunState runs;
        runs.setConnected(true);
        runs.setWorkflowId("current");
        runs.setQueue({QVariantMap{{"jobId", "a"}, {"status", "running"}, {"name", "Workflow a"}, {"workflow_id", "current"}},
                       QVariantMap{{"jobId", "b"}, {"status", "running"}, {"name", "Workflow b"}, {"workflow_id", "other"}}});
        QSignalSpy select(&runs, &RunState::selectRunRequested);
        QSignalSpy cancel(&runs, &RunState::cancelRequested);
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/NodeEditor/QueueOverlay.qml"));
        std::unique_ptr<QObject> overlay(component.createWithInitialProperties({{"runs", QVariant::fromValue(&runs)}}));
        QVERIFY2(overlay, qPrintable(component.errorString()));
        auto *root = qobject_cast<QQuickItem *>(overlay.get());
        QVERIFY(root);
        QVERIFY(root->property("presented").toBool());
        auto *summary = find(root, "queue-summary");
        QVERIFY(summary);
        QCOMPARE(summary->property("text").toString(), QString("2 jobs running"));
        root->setProperty("expanded", true);
        QQuickItem *own = nullptr;
        QTRY_VERIFY((own = find(root, "queue-focus-0")));
        auto *other = find(root, "queue-focus-1");
        QVERIFY(other);
        // Only a run of the open workflow can be shown on the canvas.
        QVERIFY(own->property("focusable").toBool());
        QVERIFY(!other->property("focusable").toBool());
        QVERIFY(QMetaObject::invokeMethod(own, "activate"));
        QCOMPARE(select.size(), 1);
        QCOMPARE(select.first().first().toString(), "a");
        runs.setOutput({}, "a");
        QVERIFY(own->property("focused").toBool());
        auto *stop = find(root, "queue-stop-1");
        QVERIFY(stop);
        QVERIFY(stop->property("enabled").toBool());
        QVERIFY(QMetaObject::invokeMethod(stop, "clicked"));
        QCOMPARE(cancel.size(), 1);
        QCOMPARE(cancel.first().first().toString(), "b");
        runs.setConnected(false);
        QVERIFY(!stop->property("enabled").toBool());
    }
};

QTEST_MAIN(RunOutputComponentTest)
#include "RunOutputComponentTest.moc"
