// NodeMenu.qml on its own: a fixture NodeCatalog and a PackSetup, no
// EditorWindow, graph runner, QtNodes or media. The executable links only the
// interface library and the QML module.
#include "interfaces/NodeCatalog.h"
#include "server/PackSetup.h"

#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickView>
#include <QSettings>
#include <QSignalSpy>
#include <QtTest>
#include <QtQml/QQmlExtensionPlugin>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::NodeCatalog;
using nodetool::node_editor::PackSetup;

namespace {

QVariantMap fixtureNode(const QString &type, const QString &label, const QString &ns, const QString &description) {
    return {{"type", type}, {"label", label}, {"namespace", ns}, {"categories", QStringList{}},
            {"description", description}, {"deprecated", false}, {"inputTypes", QStringList{}},
            {"outputTypes", QStringList{"str"}}, {"provider", ""}, {"providerName", ""}, {"keyGate", ""},
            {"icon", "str"}, {"color", "#888888"}};
}

QStringList visibleTypes(QQuickItem *menu) {
    QStringList types;
    for (const auto &value : menu->property("visibleNodes").toList()) {
        types.append(value.toMap().value("type").toString());
    }
    return types;
}

}  // namespace

class NodeMenuComponentTest : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() {
        QCoreApplication::setOrganizationName("NodeToolTests");
        QCoreApplication::setApplicationName("node-menu-component");
        QSettings().clear();
    }

    void searchMovesHighlightAndAdds() {
        NodeCatalog catalog;
        catalog.setNodes({fixtureNode("text.Concat", "Concat Text", "nodetool.text", "Joins two strings."),
                          fixtureNode("text.Split", "Split Text", "nodetool.text", "Splits a string."),
                          fixtureNode("image.Resize", "Resize Image", "nodetool.image", "Scales an image.")});
        PackSetup packSetup;
        QSignalSpy added(&catalog, &NodeCatalog::addRequested);
        QSignalSpy closed(&catalog, &NodeCatalog::closeMenuRequested);

        QQuickView view;
        view.setInitialProperties({{"catalog", QVariant::fromValue(&catalog)},
                                   {"packSetup", QVariant::fromValue(&packSetup)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/NodeMenu.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(980, 620);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *menu = view.rootObject();
        QVERIFY(menu);
        QMetaObject::invokeMethod(menu, "reset");
        QMetaObject::invokeMethod(menu, "focusSearch");
        auto *search = menu->findChild<QQuickItem *>("nodeSearch");
        QVERIFY(search);
        QTRY_VERIFY(view.activeFocusItem());

        for (const char key : QByteArray("text")) {
            QTest::keyClick(&view, key);
        }
        QTRY_COMPARE(menu->property("query").toString(), QString("text"));
        const auto found = visibleTypes(menu);
        QCOMPARE(found.size(), 2);
        QVERIFY(found.contains("text.Concat"));
        QVERIFY(found.contains("text.Split"));

        QTest::keyClick(&view, Qt::Key_Down);
        QCOMPARE(menu->property("highlighted").toInt(), 0);
        QTest::keyClick(&view, Qt::Key_Down);
        QCOMPARE(menu->property("highlighted").toInt(), 1);
        QTest::keyClick(&view, Qt::Key_Return);
        QCOMPARE(added.size(), 1);
        QCOMPARE(added.first().first().toString(), found.at(1));

        // A read-only document takes no new nodes.
        catalog.setReadOnly(true);
        QTest::keyClick(&view, Qt::Key_Return);
        QCOMPARE(added.size(), 1);

        QTest::keyClick(&view, Qt::Key_Escape);
        QCOMPARE(closed.size(), 1);
    }
};

QTEST_MAIN(NodeMenuComponentTest)
#include "NodeMenuComponentTest.moc"
