// The run output's helpers on their own: the TypeIcons and OutputStyle
// singletons through TypeIcon.qml and a Markdown text area, and the RunState
// and StatusModel members RunOutput.qml reads. No EditorWindow, graph runner,
// QtNodes or media. RunOutput.qml itself still reads the runOutput context
// property, so EditorChatTest covers its Ask agent button in the window.
#include "interfaces/RunState.h"
#include "interfaces/StatusModel.h"

#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickTextDocument>
#include <QSignalSpy>
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
};

QTEST_MAIN(RunOutputComponentTest)
#include "RunOutputComponentTest.moc"
