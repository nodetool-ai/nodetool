// Inspector.qml on its own: a fixture NodeInspector, no EditorWindow, graph
// runner or QtNodes. The executable links the interface library, the QML
// module and the editor's media QML types.
#include "interfaces/NodeInspector.h"
#include "media/VideoFrameView.h"

#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)

using nodetool::node_editor::GenerationReplay;
using nodetool::node_editor::NodeInspector;
using nodetool::node_editor::PropertyHost;

namespace {

QVariantMap textField(const QString &name, const QString &value) {
    return {{"name", name}, {"label", name}, {"kind", "text"}, {"value", value}, {"editable", true}, {"hasValue", true}};
}

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

// The PropertyField for a descriptor name.
QQuickItem *field(QQuickItem *root, const QString &name) {
    if (root->property("descriptor").toMap().value("name").toString() == name && root->property("host").isValid()) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = field(child, name)) {
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

}  // namespace

class InspectorComponentTest : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() { nodetool::node_editor::registerMediaTypes(); }

    void fieldsCommitAndFooterRequestsGoUp() {
        NodeInspector inspector;
        inspector.setSelection("node-1");
        inspector.fields()->setSelection("node-1");
        inspector.setSelectionInfo({{"title", "Fixture node"}, {"icon", "str"}});
        inspector.setProperties({textField("prompt", "A lake"), textField("style", "Ink")});
        QSignalSpy commits(inspector.fields(), &PropertyHost::commitRequested);
        QSignalSpy cleared(&inspector, &NodeInspector::clearSelectionRequested);
        QSignalSpy runs(&inspector, &NodeInspector::runSelectedRequested);

        QQuickView view;
        view.setInitialProperties({{"inspector", QVariant::fromValue(&inspector)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/Inspector.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(350, 700);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QVERIFY(root);

        auto *title = named(root, "inspector-title");
        QVERIFY(title);
        QCOMPARE(title->property("text").toString(), QString("Fixture node"));
        auto *prompt = field(root, "prompt");
        QVERIFY(prompt);
        QVERIFY(field(root, "style"));
        QVERIFY(prompt->property("writable").toBool());

        // A field commits through its host, after the current event.
        QVERIFY(QMetaObject::invokeMethod(prompt, "immediate", Q_ARG(QVariant, QVariant("A sea"))));
        QTRY_COMPARE(commits.size(), 1);
        QCOMPARE(commits.first().at(0).toString(), QString("node-1"));
        QCOMPARE(commits.first().at(1).toString(), QString("prompt"));
        QCOMPARE(commits.first().at(2).toString(), QString("A sea"));

        // A read-only document blocks the field and shows why.
        inspector.setReadOnlyReason("This workflow is read-only.");
        inspector.fields()->setReadOnly(true);
        QTRY_VERIFY(!prompt->property("writable").toBool());
        QVERIFY(QMetaObject::invokeMethod(prompt, "immediate", Q_ARG(QVariant, QVariant("A river"))));
        QTest::qWait(20);
        QCOMPARE(commits.size(), 1);
        QCOMPARE(named(root, "inspector-message")->property("text").toString(), QString("This workflow is read-only."));
        inspector.setReadOnlyReason({});
        inspector.fields()->setReadOnly(false);

        click(view, named(root, "inspector-run-selected"));
        QTRY_COMPARE(runs.size(), 1);
        QCOMPARE(runs.first().first().toInt(), 1);
        click(view, named(root, "inspector-close"));
        QTRY_COMPARE(cleared.size(), 1);

        // No selection hides the node header.
        inspector.setSelection({});
        QTRY_VERIFY(!title->isVisible());
    }
};

QTEST_MAIN(InspectorComponentTest)
#include "InspectorComponentTest.moc"
