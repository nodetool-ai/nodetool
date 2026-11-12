// The ChatWindow interface on its own. EditorChat.qml also needs a chat
// session, so EditorChatTest::geometryAndPersistence drives its drag and
// resize handles through the editor window. This test checks that the QML
// calls reach the owner as typed requests. The executable links only the
// interface library and the QML module.
#include "interfaces/ChatWindow.h"

#include <QGuiApplication>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::ChatWindow;

class ChatWindowComponentTest : public QObject {
    Q_OBJECT
private slots:
    void qmlCallsBecomeRequests() {
        ChatWindow frame;
        QSignalSpy begin(&frame, &ChatWindow::beginGeometryRequested);
        QSignalSpy change(&frame, &ChatWindow::changeGeometryRequested);
        QSignalSpy reset(&frame, &ChatWindow::resetPositionRequested);
        // The same calls EditorChat.qml makes, through the registered type.
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(
            "import QtQml\n"
            "import NodeTool.NodeEditor\n"
            "QtObject {\n"
            "    required property ChatWindow frame\n"
            "    Component.onCompleted: {\n"
            "        frame.beginGeometry()\n"
            "        frame.changeGeometry(-250, 50, 0, false)\n"
            "        frame.changeGeometry(-60, -70, 3, true)\n"
            "        frame.resetPosition()\n"
            "    }\n"
            "}\n",
            QUrl("qrc:/ChatWindowComponentTest.qml"));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"frame", QVariant::fromValue(&frame)}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        QCOMPARE(begin.size(), 1);
        QCOMPARE(change.size(), 2);
        QCOMPARE(change.at(0), (QList<QVariant>{-250, 50, 0, false}));
        QCOMPARE(change.at(1), (QList<QVariant>{-60, -70, 3, true}));
        QCOMPARE(reset.size(), 1);
    }
};

QTEST_MAIN(ChatWindowComponentTest)
#include "ChatWindowComponentTest.moc"
