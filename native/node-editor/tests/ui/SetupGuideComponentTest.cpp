// SetupGuide.qml and OptionalPacksSection.qml on their own: a fixture
// FirstWorkflowGuide, NodeCatalog and PackSetup, no EditorWindow, graph
// runner, QtNodes or media. The executable links only the interface library
// and the QML module.
#include "interfaces/FirstWorkflowGuide.h"
#include "interfaces/NodeCatalog.h"
#include "server/PackSetup.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::FirstWorkflowGuide;
using nodetool::node_editor::NodeCatalog;
using nodetool::node_editor::PackSetup;

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
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
    QCOMPARE(view.status(), QQuickView::Ready);
    view.resize(720, 400);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    QVERIFY(view.rootObject());
}

}  // namespace

class SetupGuideComponentTest : public QObject {
    Q_OBJECT
private slots:
    void guideShowsItsStepsAndSendsActions() {
        FirstWorkflowGuide guide;
        guide.setState(false, false, {false, false, false, false, false});
        QSignalSpy actions(&guide, &FirstWorkflowGuide::actionRequested);
        QQuickView view;
        show(view, {{"guide", QVariant::fromValue(&guide)}}, "SetupGuide.qml");
        auto *root = view.rootObject();
        QVERIFY(!root->isVisible());
        guide.setState(true, false, {false, false, false, false, false});
        QVERIFY(root->isVisible());
        // The flow places its buttons once the guide shows.
        QTRY_VERIFY(named(root, "setup-choose")->x() >= named(root, "setup-starter")->width()
                    && named(root, "setup-templates")->x() >= named(root, "setup-choose")->x() + named(root, "setup-choose")->width());
        for (const auto &[name, action] : {std::pair{"setup-starter", "starter"}, {"setup-choose", "choose"},
                                           {"setup-templates", "templates"}}) {
            click(view, named(root, name));
            QCOMPARE(actions.size(), 1);
            QCOMPARE(actions.takeFirst().first().toString(), QString(action));
        }
        // A started guide lists its steps and offers Close.
        guide.setState(true, true, {true, true, false, false, false});
        QTRY_VERIFY(!named(root, "setup-starter")->isVisible());
        QVERIFY(named(root, "setup-readiness-0")->property("complete").toBool());
        QVERIFY(!named(root, "setup-readiness-2")->property("complete").toBool());
        click(view, named(root, "setup-guide-close"));
        QCOMPARE(actions.takeFirst().first().toString(), "close-guide");
    }

    void optionalPacksOpenRuntimes() {
        NodeCatalog catalog;
        catalog.setWindowHeight(900);
        PackSetup packs;
        QSignalSpy runtimes(&catalog, &NodeCatalog::runtimesRequested);
        QQuickView view;
        show(view, {{"catalog", QVariant::fromValue(&catalog)}, {"packSetup", QVariant::fromValue(&packs)}},
             "OptionalPacksSection.qml");
        auto *root = view.rootObject();
        click(view, named(root, "catalog-optional-packs"));
        // The popup opens in its own window, so its button is found through the popup.
        QQuickItem *button = nullptr;
        QTRY_VERIFY((button = view.contentItem()->findChild<QQuickItem *>("catalog-runtimes"))
                    || (button = root->findChild<QQuickItem *>("catalog-runtimes")));
        QVERIFY(QMetaObject::invokeMethod(button, "clicked"));
        QCOMPARE(runtimes.size(), 1);
    }
};

QTEST_MAIN(SetupGuideComponentTest)
#include "SetupGuideComponentTest.moc"
