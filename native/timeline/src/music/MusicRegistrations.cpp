// The music mode's app registrations (docs/MUSIC-MODE.md section 15): the
// track role edit (UI-3), File > New Music Project (UI-1) and the `--music`
// launch flag that opens the app on the New music project dialog (UI-5).

#include "app/CliModes.h"
#include "app/EditRegistry.h"
#include "app/MenuRegistry.h"
#include "app/Preferences/Preferences.h"
#include "music/MusicProject.h"
#include "server/BundledServer.h"
#include "server/TimelineList/TimelineListController.h"
#include "wiring/w/SceneItems.h"

#include <QEventLoop>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPointer>
#include <QProcess>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickView>
#include <QSaveFile>

#include <cstdio>

namespace {
const bool roleEdit = nt::app::registerEdit("music.setTrackRole", nt::music::setTrackRole);

// TimelineDocumentActions.qml holds the dialog, beside the controller that creates and opens.
QQuickItem* documentActions(const QVariantMap& context) {
    auto* gestures = qobject_cast<QQuickItem*>(context.value("gestures").value<QObject*>());
    return nt::wiring::w::windowItem(gestures, QStringLiteral("TimelineDocumentActions"));
}

const bool fileMenu = nt::app::registerShellMenuItem({
    // Its own group, first among the registered File items: it sits under New Timeline.
    QStringLiteral("File"), QStringLiteral("newMusicProject"), QStringLiteral("New Music Project…"), {}, {},
    QStringLiteral("new"), -1,
    [](const QVariantMap& context) { return documentActions(context) != nullptr; }, {},
    [](const QVariantMap& context) {
        auto* actions = documentActions(context);
        return actions && QMetaObject::invokeMethod(actions, "openNewMusicProject");
    },
    QStringLiteral("Open a timeline first.")});

// --music: the New music project dialog on its own. A created project opens
// in a child editor, which this process waits for, so a bundled server it
// started keeps running. NT_TIMELINE_SWITCH_CAPTURE names a file that gets
// the editor's arguments in place of the launch.
int musicCli(int argc, char** argv) {
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("nodetool-timeline"));
    QString serverError;
    if (const QUrl bundled = nt::server::startBundledServer(&serverError); !bundled.isEmpty()) {
        qputenv("NODETOOL_SERVER_URL", bundled.toString().toUtf8());
    } else if (!serverError.isEmpty()) {
        std::fprintf(stderr, "error: %s\n", qPrintable(serverError));
    }
    nt::server::TimelineListController controller;
    QQuickView view;
    view.setTitle(QStringLiteral("New music project"));
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setInitialProperties({{"controller", QVariant::fromValue(&controller)}});
    view.setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/Timeline/qml/music/MusicProjectWindow.qml")));
    if (view.status() != QQuickView::Ready) {
        return 1;
    }
    view.resize(480, 520);
    QString selected;
    QEventLoop loop;
    QObject::connect(&controller, &nt::server::TimelineListController::openRequested, &loop,
                     [&selected, &loop](const QString& source) {
                         selected = source;
                         loop.quit();
                     });
    QObject::connect(view.rootObject(), SIGNAL(dismissed()), &loop, SLOT(quit()));
    QObject::connect(&view, &QQuickWindow::visibleChanged, &loop, [&loop](bool visible) {
        if (!visible) {
            loop.quit();
        }
    });
    view.show();
    loop.exec();
    view.hide();
    if (selected.isEmpty()) {
        return 0;
    }
    const QUrl url(selected);
    const QVariantMap entry{{"kind", "server"},
                            {"server", url.adjusted(QUrl::RemoveFragment).toString()},
                            {"timelineId", url.fragment().sliced(QStringLiteral("timeline=").size())}};
    const auto arguments = nt::app::recentTimelineArguments(entry);
    if (arguments.isEmpty()) {
        return 1;
    }
    if (const auto capture = qEnvironmentVariable("NT_TIMELINE_SWITCH_CAPTURE"); !capture.isEmpty()) {
        QSaveFile file(capture);
        const auto bytes = QJsonDocument(QJsonArray::fromStringList(arguments)).toJson(QJsonDocument::Compact);
        return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit() ? 0 : 1;
    }
    QProcess editor;
    editor.setProgram(QCoreApplication::applicationFilePath());
    editor.setArguments(arguments);
    editor.setProcessChannelMode(QProcess::ForwardedChannels);
    QEventLoop running;
    QObject::connect(&editor, &QProcess::finished, &running, &QEventLoop::quit);
    QObject::connect(&editor, &QProcess::errorOccurred, &running, &QEventLoop::quit);
    editor.start();
    if (!editor.waitForStarted()) {
        std::fprintf(stderr, "error: could not open the music project\n");
        return 1;
    }
    running.exec();
    return editor.exitStatus() == QProcess::NormalExit ? editor.exitCode() : 1;
}
const bool cli = nt::app::registerCliMode({QStringLiteral("--music"), musicCli});
} // namespace
