#include "app/CliModes.h"
#include "server/TimelineList/TimelineListController.h"
#include <QCommandLineParser>
#include <QEventLoop>
#include <QGuiApplication>
#include <QPointer>
#include <QQuickView>
#include <QTimer>

namespace {
nt::app::StartupResult showTimelines(QCoreApplication&, QCommandLineParser&) {
    nt::server::TimelineListController controller;
    QQuickView view;
    view.setTitle(QStringLiteral("Timelines"));
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
    view.setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineListPanel.qml")));
    if (view.status() != QQuickView::Ready) {
        return 1;
    }
    view.resize(320, 640);
    QString selected;
    QEventLoop loop;
    QObject::connect(&controller, &nt::server::TimelineListController::openRequested, &loop,
        [&selected, &loop, guard = QPointer<QQuickView>(&view)](const QString& source) {
            selected = source;
            if (guard) {
                guard->hide();
            }
            loop.quit();
        });
    QObject::connect(&view, &QQuickWindow::visibleChanged, &loop, [&loop](bool visible) {
        if (!visible) {
            loop.quit();
        }
    });
    const bool quitOnClose = QGuiApplication::quitOnLastWindowClosed();
    QGuiApplication::setQuitOnLastWindowClosed(false);
    view.show();
    loop.exec();
    view.hide();
    QGuiApplication::setQuitOnLastWindowClosed(quitOnClose);
    return selected.isEmpty() ? nt::app::StartupResult{0} : nt::app::StartupResult{selected};
}
const bool startup = nt::app::registerDefaultStartup(showTimelines);
}
