#include "TimelineDocumentController.h"
#include "TimelineLaunch.h"
#include "app/Menus/ShellMenus.h"
#include "app/Preferences/Preferences.h"
#include "server/ServerSource.h"
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QQuickWindow>
#include <QSaveFile>
#include <QScopedValueRollback>
#include <QTimer>

namespace nt::server {
namespace {
SaveTarget listTarget() {
    return serverSaveTarget().value_or(SaveTarget{QUrl(qEnvironmentVariable("NODETOOL_SERVER_URL")),
        qEnvironmentVariable("NODETOOL_API_TOKEN"), {}, {}, qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE")});
}
}
TimelineDocumentController::TimelineDocumentController(QObject* parent)
    : QObject(parent), m_list(listTarget().server, listTarget().token, listTarget().expectedInstance, this) {
    connect(&m_list, &TimelineListController::openRequested, this, &TimelineDocumentController::switchTo);
}
void TimelineDocumentController::setAnchor(QQuickItem* anchor) {
    if (m_anchor == anchor) {
        return;
    }
    if (m_anchor) {
        disconnect(m_anchor, nullptr, this, nullptr);
    }
    m_anchor = anchor;
    if (anchor) {
        connect(anchor, &QQuickItem::windowChanged, this, &TimelineDocumentController::bind);
    }
    QTimer::singleShot(0, this, &TimelineDocumentController::bind);
    emit anchorChanged();
}
void TimelineDocumentController::bind() {
    if (!m_anchor || !m_anchor->window()) {
        return;
    }
    QQuickItem* root = m_anchor;
    while (root->parentItem()) {
        root = root->parentItem();
    }
    const auto findMenus = [](auto&& self, QQuickItem* item) -> nt::app::ShellMenus* {
        for (auto* object : item->children()) {
            if (auto* menus = qobject_cast<nt::app::ShellMenus*>(object)) {
                return menus;
            }
        }
        for (auto* child : item->childItems()) {
            if (auto* menus = self(self, child)) {
                return menus;
            }
        }
        return nullptr;
    };
    auto* menus = findMenus(findMenus, root);
    if (m_menus == menus) {
        return;
    }
    if (m_menus) {
        disconnect(m_menus, nullptr, this, nullptr);
    }
    m_menus = menus;
    if (menus) {
        connect(menus, &nt::app::ShellMenus::openTimelineRequested, this, &TimelineDocumentController::openRequested);
        connect(menus, &nt::app::ShellMenus::newTimelineRequested, this, &TimelineDocumentController::createAndOpen);
    }
}
void TimelineDocumentController::fail(const QString& error) {
    m_error = error;
    emit errorChanged();
}
void TimelineDocumentController::createAndOpen() {
    if (m_switching || m_list.busy()) {
        return;
    }
    m_error.clear();
    emit errorChanged();
    m_list.refresh();
    if (!m_list.error().isEmpty()) {
        fail(m_list.error());
        return;
    }
    const auto created = m_list.createTimeline();
    if (created.isEmpty()) {
        fail(m_list.error());
        return;
    }
    m_list.openTimeline(created.value("id").toString());
}
void TimelineDocumentController::switchTo(const QString& source) {
    if (m_switching || !m_anchor || !m_anchor->window()) {
        return;
    }
    const QScopedValueRollback switching(m_switching, true);
    bind();
    if (!m_menus || !m_menus->preferences()) {
        fail(QStringLiteral("Could not access timeline preferences. Try opening the timeline again."));
        return;
    }
    for (auto* item = m_anchor.data(); item; item = item->parentItem()) {
        if (auto* save = qobject_cast<AutosaveController*>(item->property("autosave").value<QObject*>())) {
            if (!save->flushBeforeQuit(5000)) {
                fail(QStringLiteral("Could not save the current timeline. %1").arg(save->lastError()));
                return;
            }
            break;
        }
    }
    const QUrl url(source);
    const auto id = url.fragment().sliced(QStringLiteral("timeline=").size());
    const auto server = url.adjusted(QUrl::RemoveFragment);
    const QVariantMap entry{{"kind", "server"}, {"server", server.toString()}, {"timelineId", id}};
    const auto arguments = nt::app::recentTimelineArguments(entry);
    QString label = QStringLiteral("Untitled video");
    for (const auto& value : m_list.documents()) {
        const auto row = value.toMap();
        if (row.value("id").toString() == id && !row.value("name").toString().isEmpty()) {
            label = row.value("name").toString();
            break;
        }
    }
    m_menus->preferences()->addRecentServer(label, {server, {}, id, {}, {}});
    bool started = false;
    const auto capture = qEnvironmentVariable("NT_TIMELINE_SWITCH_CAPTURE");
    if (!capture.isEmpty() && qEnvironmentVariableIsSet("NT_TIMELINE_DOCUMENT_CHECK")) {
        // The real-app test owns the next launch, so no detached child can escape it.
        QSaveFile file(capture);
        const auto bytes = QJsonDocument(QJsonArray::fromStringList(arguments)).toJson(QJsonDocument::Compact);
        started = file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
    } else {
        QProcess child;
        child.setProgram(QCoreApplication::applicationFilePath());
        child.setArguments(arguments);
        child.setProcessEnvironment(timelineLaunchEnvironment(listTarget()));
        started = child.startDetached();
    }
    if (!started) {
        fail(QStringLiteral("Could not open the timeline in a new window. Try again."));
        return;
    }
    QCoreApplication::quit();
}
}
