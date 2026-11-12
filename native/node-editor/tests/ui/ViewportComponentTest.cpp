// ViewportIndicator.qml, MiniMapControls.qml and MiniMapPopups.qml on their
// own: a fixture Viewport, no EditorWindow, graph runner, QtNodes or media.
// The executable links only the interface library and the QML module.
#include "interfaces/Viewport.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::node_editor::Viewport;

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

void show(QQuickView &view, const QVariantMap &properties, const QString &file, QQuickView::ResizeMode mode) {
    view.setInitialProperties(properties);
    view.setResizeMode(mode);
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
    QCOMPARE(view.status(), QQuickView::Ready);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    QVERIFY(view.rootObject());
}

}  // namespace

class ViewportComponentTest : public QObject {
    Q_OBJECT
private slots:
    void indicatorShowsTheZoomAndRunsViewCommands() {
        Viewport viewport;
        viewport.setZoom(137, false);
        QSignalSpy commands(&viewport, &Viewport::commandRequested);
        QQuickView view;
        show(view, {{"viewport", QVariant::fromValue(&viewport)}}, "ViewportIndicator.qml",
             QQuickView::SizeViewToRootObject);
        auto *root = view.rootObject();
        QCOMPARE(named(root, "zoom-label")->property("text").toString(), "137%");
        viewport.setZoom(50, true);
        QCOMPARE(named(root, "zoom-label")->property("text").toString(), "50%");
        for (const auto &[name, command] : {std::pair{"zoom-in", "Zoom in"}, {"zoom-out", "Zoom out"},
                                            {"zoom-reset", "Zoom presets"}, {"fit-selection", "Fit selection"},
                                            {"fit-view", "Fit"}}) {
            click(view, named(root, name));
            QCOMPARE(commands.size(), 1);
            QCOMPARE(commands.takeFirst().first().toString(), QString(command));
        }
    }

    void controlsOpenPopupsAndTheLegendFollowsTheMode() {
        Viewport viewport;
        QSignalSpy popups(&viewport, &Viewport::popupRequested);
        QQuickView view;
        view.resize(200, 80);
        show(view, {{"viewport", QVariant::fromValue(&viewport)}}, "MiniMapControls.qml",
             QQuickView::SizeRootObjectToView);
        auto *root = view.rootObject();
        QVERIFY(!named(root, "mini-map-legend")->isVisible());
        click(view, named(root, "mini-map-colors"));
        QCOMPARE(popups.size(), 1);
        QCOMPARE(popups.takeFirst().first().toString(), "colors");
        viewport.setMiniMapColorMode("type");
        // The row moves the color button aside for the legend button.
        QTRY_VERIFY(named(root, "mini-map-colors")->x() > 0);
        click(view, named(root, "mini-map-legend"));
        QCOMPARE(popups.takeFirst().first().toString(), "legend");
    }

    void popupChoosesAColorMode() {
        Viewport viewport;
        QSignalSpy chosen(&viewport, &Viewport::colorModeRequested);
        QSignalSpy closed(&viewport, &Viewport::closePopupRequested);
        QQuickView view;
        view.resize(400, 300);
        show(view, {{"viewport", QVariant::fromValue(&viewport)}, {"kind", "colors"}}, "MiniMapPopups.qml",
             QQuickView::SizeRootObjectToView);
        QVERIFY(QMetaObject::invokeMethod(view.rootObject(), "choose", Q_ARG(QVariant, "type")));
        QCOMPARE(chosen.size(), 1);
        QCOMPARE(chosen.first().first().toString(), "type");
        QCOMPARE(closed.size(), 1);
    }
};

QTEST_MAIN(ViewportComponentTest)
#include "ViewportComponentTest.moc"
