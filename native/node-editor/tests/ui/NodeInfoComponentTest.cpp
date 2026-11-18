// NodeInfoPanel.qml on its own: a fixture NodeInfo, no EditorWindow, graph
// runner, QtNodes or media. Also the documentation split the panel shows,
// which web stores/formatNodeDocumentation.ts defines.
#include "graph/NodeDocumentation.h"
#include "interfaces/NodeInfo.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::NodeInfo;
using nodetool::node_editor::splitNodeDocumentation;

namespace {

QList<QQuickItem *> allNamed(QQuickItem *root, const QString &name) {
    QList<QQuickItem *> found;
    if (root->objectName() == name) {
        found.append(root);
    }
    for (auto *child : root->childItems()) {
        found.append(allNamed(child, name));
    }
    return found;
}

QQuickItem *named(QQuickItem *root, const QString &name) {
    const auto found = allNamed(root, name);
    return found.isEmpty() ? nullptr : found.first();
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
                      item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

const char *const documentation =
    "Generates an image from a text prompt.\n"
    "image, generate, text-to-image\n"
    "\n"
    "Use cases:\n"
    "- Concept art\n"
    "- Product shots\n";

}  // namespace

class NodeInfoComponentTest : public QObject {
    Q_OBJECT
private slots:
    void documentationSplitsAsTheWebDoes() {
        const auto parts = splitNodeDocumentation(documentation);
        QCOMPARE(parts.description, "Generates an image from a text prompt.");
        QCOMPARE(parts.tags, (QStringList{"image", "generate", "text-to-image"}));
        QCOMPARE(parts.useCases, (QStringList{"Concept art", "Product shots"}));
        // Unbulleted use cases join into one entry.
        const auto prose = splitNodeDocumentation("Adds.\nmath\nUse cases:\nSum two\nnumbers");
        QCOMPARE(prose.useCases, QStringList{"Sum two numbers"});
        const auto bare = splitNodeDocumentation("Only a description");
        QCOMPARE(bare.description, "Only a description");
        QVERIFY(bare.tags.isEmpty());
        QVERIFY(bare.useCases.isEmpty());
    }

    void panelShowsTheNodeAndSendsRequests() {
        NodeInfo info;
        info.setNode("n1", "Text to Image", "nodetool.image", documentation, "Out of credits");
        QSignalSpy closed(&info, &NodeInfo::closeRequested);
        QSignalSpy focused(&info, &NodeInfo::focusRequested);
        QSignalSpy namespaces(&info, &NodeInfo::namespaceRequested);
        QSignalSpy tags(&info, &NodeInfo::tagSearchRequested);
        QQuickView view;
        view.setInitialProperties({{"info", QVariant::fromValue(&info)}});
        view.setResizeMode(QQuickView::SizeViewToRootObject);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/NodeInfoPanel.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QVERIFY(root);
        QCOMPARE(named(root, "node-info-title")->property("text").toString(), "Text to Image");
        QCOMPARE(named(root, "node-info-namespace")->property("text").toString(), "NT.image");
        QCOMPARE(named(root, "node-info-description")->property("text").toString(), "Generates an image from a text prompt.");
        QTRY_COMPARE(allNamed(root, "node-info-tag").size(), 3);
        QCOMPARE(allNamed(root, "node-info-tag").at(2)->property("text").toString(), "TEXT-TO-IMAGE");
        QVERIFY(named(root, "node-info-use-cases")->isVisible());
        QVERIFY(named(root, "node-info-error")->isVisible());

        click(view, named(root, "node-info-namespace"));
        QCOMPARE(namespaces.size(), 1);
        QCOMPARE(namespaces.first().first().toString(), "nodetool.image");
        click(view, allNamed(root, "node-info-tag").at(1));
        QCOMPARE(tags.size(), 1);
        QCOMPARE(tags.first().first().toString(), "generate");
        click(view, named(root, "node-info-focus"));
        QCOMPARE(focused.size(), 1);
        click(view, named(root, "node-info-close"));
        QCOMPARE(closed.size(), 1);

        // A node without tags, use cases or error hides those sections.
        info.setNode("n2", "Add", "nodetool.math", "Adds two numbers.", "");
        QVERIFY(!named(root, "node-info-tags")->isVisible());
        QVERIFY(!named(root, "node-info-use-cases")->isVisible());
        QVERIFY(!named(root, "node-info-error")->isVisible());

        // The owner caps the height to the room it has.
        const auto full = root->height();
        info.setMaximumHeight(full / 2);
        QCOMPARE(root->height(), full / 2);
    }
};

QTEST_MAIN(NodeInfoComponentTest)
#include "NodeInfoComponentTest.moc"
