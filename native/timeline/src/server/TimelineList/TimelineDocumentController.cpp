#include "TimelineDocumentController.h"
#include "TimelineLaunch.h"
#include "TimelineSession.h"
#include "app/Menus/ShellMenus.h"
#include "app/Preferences/Preferences.h"
#include "server/BundledServer.h"
#include "server/ServerSource.h"
#include "server/projectfolder/ProjectFolderState.h"
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
TimelineDocumentController::~TimelineDocumentController() = default;
QObject* TimelineDocumentController::session() const { return m_session; }
bool TimelineDocumentController::switching() const {
    return m_switching || (m_session && m_session->switching());
}
void TimelineDocumentController::setSession(QObject* object) {
    auto* session = qobject_cast<TimelineSession*>(object);
    if (m_session == session) {
        return;
    }
    if (m_session) {
        disconnect(m_session, nullptr, this, nullptr);
    }
    m_session = session;
    if (session) {
        connect(session, &TimelineSession::autosaveChanged, this, [this] {
            if (m_session) {
                watch(m_session->autosaveController());
            }
        });
        connect(session, &TimelineSession::switchingChanged, this, &TimelineDocumentController::switchingChanged);
        connect(session, &TimelineSession::switched, this, [this](const QString& id) {
            if (!m_error.isEmpty()) {
                m_error.clear();
                emit errorChanged();
            }
            emit switched(id);
        });
        connect(session, &TimelineSession::switchFailed, this, &TimelineDocumentController::fail);
        if (m_menus && m_menus->preferences()) {
            session->setPreferences(m_menus->preferences());
        }
        watch(session->autosaveController());
    }
    emit sessionChanged();
    emit switchingChanged();
}
QObject* TimelineDocumentController::accountServers() const { return m_servers; }
QObject* TimelineDocumentController::cloudBrowser() const { return m_cloud.get(); }
void TimelineDocumentController::setAccountServers(QObject* object) {
    namespace account = nodetool::account::qt;
    auto* servers = qobject_cast<account::AccountServers*>(object);
    if (m_servers == servers) {
        return;
    }
    if (m_servers) {
        disconnect(m_servers, nullptr, this, nullptr);
    }
    m_servers = servers;
    m_cloud.reset();
    if (servers) {
        m_cloud = std::make_unique<account::CloudBrowser>("timeline");
        m_cloud->setAccount(servers->current());
        connect(servers, &account::AccountServers::currentChanged, this, [this] {
            if (m_cloud && m_servers) {
                m_cloud->setAccount(m_servers->current());
            }
        });
        connect(m_cloud.get(), &account::CloudBrowser::openRequested, this,
                [this](const QString& kind, const QString& id, const QString&, const QString& role) {
                    if (kind == u"timeline") {
                        openCloud(id, role);
                    }
                });
    }
    emit cloudChanged();
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
void TimelineDocumentController::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (timeline) {
        connect(timeline, &TimelineModel::timelineChanged, this, &TimelineDocumentController::syncPreferredProject);
    }
    syncPreferredProject();
    emit timelineChanged();
}
void TimelineDocumentController::syncPreferredProject() {
    if (!m_timeline) {
        m_list.setPreferredProjectId({});
        return;
    }
    QString projectId = m_timeline->projectId();
    if (projectId.isEmpty() || projectId == u"default") {
        if (const auto local = ProjectFolderState::findEnclosingProjectFolder(m_timeline->sourcePath())) {
            projectId = local->id;
        }
    }
    m_list.setPreferredProjectId(projectId);
}
void TimelineDocumentController::prepareList() {
    syncPreferredProject();
    m_list.resetProjectSelection();
    m_list.refresh();
}
void TimelineDocumentController::setListShown(bool shown) {
    if (m_listShown == shown) {
        return;
    }
    m_listShown = shown;
    emit listShownChanged();
}
void TimelineDocumentController::watch(AutosaveController* autosave) {
    if (m_autosave == autosave) {
        return;
    }
    if (m_autosave) {
        disconnect(m_autosave, nullptr, this, nullptr);
    }
    m_autosave = autosave;
    if (autosave) {
        // A timeline file became invalid, went missing or is fine again. The
        // list has no socket of its own, so it hears of it here.
        connect(autosave, &AutosaveController::documentFileChanged, this, [this] {
            if (m_listShown && !m_switching && !m_list.busy() && !m_list.projects().isEmpty()) {
                m_list.refresh();
            }
        });
    }
}
AutosaveController* TimelineDocumentController::findAutosave() const {
    if (m_session) {
        return m_session->autosaveController();
    }
    for (auto* item = m_anchor.data(); item; item = item->parentItem()) {
        if (auto* save = qobject_cast<AutosaveController*>(item->property("autosave").value<QObject*>())) {
            return save;
        }
        if (auto* save = qobject_cast<AutosaveController*>(item->property("saver").value<QObject*>())) {
            return save;
        }
    }
    return nullptr;
}
void TimelineDocumentController::bind() {
    if (!m_anchor || !m_anchor->window()) {
        return;
    }
    watch(findAutosave());
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
        if (m_session && menus->preferences()) {
            m_session->setPreferences(menus->preferences());
        }
    }
}
void TimelineDocumentController::fail(const QString& error) {
    m_error = error;
    emit errorChanged();
}
void TimelineDocumentController::createAndOpen() {
    if (switching() || m_list.busy()) {
        return;
    }
    m_error.clear();
    emit errorChanged();
    syncPreferredProject();
    m_list.resetProjectSelection();
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
void TimelineDocumentController::createMusicAndOpen(const QVariantMap& settings) {
    if (switching() || m_list.busy()) {
        return;
    }
    m_error.clear();
    emit errorChanged();
    syncPreferredProject();
    m_list.resetProjectSelection();
    m_list.refresh();
    if (!m_list.error().isEmpty()) {
        fail(m_list.error());
        return;
    }
    const auto created = m_list.createMusicTimeline(settings);
    if (created.isEmpty()) {
        fail(m_list.error());
        return;
    }
    m_list.openTimeline(created.value("id").toString());
}
bool TimelineDocumentController::leaveCurrent() {
    bind();
    if (!m_menus || !m_menus->preferences()) {
        fail(QStringLiteral("Could not access timeline preferences. Try opening the timeline again."));
        return false;
    }
    if (auto* save = findAutosave(); save && !save->flushBeforeQuit(5000)) {
        fail(QStringLiteral("Could not save the current timeline. %1").arg(save->lastError()));
        return false;
    }
    return true;
}
void TimelineDocumentController::openCloud(const QString& id, const QString& role) {
    if (m_switching || !m_anchor || !m_anchor->window() || !m_servers || !m_servers->current()) {
        return;
    }
    const QScopedValueRollback switching(m_switching, true);
    if (m_servers->current()->state() != nodetool::account::qt::AccountController::State::SignedIn) {
        fail(QStringLiteral("Sign in to open a cloud timeline."));
        return;
    }
    if (!leaveCurrent()) {
        return;
    }
    QStringList arguments{QStringLiteral("--cloud-server"), m_servers->currentServer(), QStringLiteral("--cloud-timeline"),
                          id, QStringLiteral("--cloud-role"), role.isEmpty() ? QStringLiteral("owner") : role};
    // The new window keeps its drafts on this window's local server.
    auto environment = timelineLaunchEnvironment(listTarget());
    if (!listTarget().server.isEmpty()) {
        environment.insert(QStringLiteral("NODETOOL_SERVER_URL"), listTarget().server.toString());
    }
    launch(std::move(arguments), environment);
}
void TimelineDocumentController::switchTo(const QString& source) {
    if (switching() || !m_anchor || !m_anchor->window()) {
        return;
    }
    const QUrl url(source);
    const auto id = url.fragment().sliced(QStringLiteral("timeline=").size());
    const auto server = url.adjusted(QUrl::RemoveFragment);
    QString label = QStringLiteral("Untitled video");
    for (const auto& value : m_list.documents()) {
        const auto row = value.toMap();
        if (row.value("id").toString() == id && !row.value("name").toString().isEmpty()) {
            label = row.value("name").toString();
            break;
        }
    }
    if (m_session && m_session->canSwitchInPlace()) {
        bind();
        if (!m_error.isEmpty()) {
            m_error.clear();
            emit errorChanged();
        }
        const auto target = listTarget();
        m_session->switchToServerTimeline(server, id, target.token, target.expectedInstance, label,
                                          m_menus ? m_menus->preferences() : nullptr);
        return;
    }
    const QScopedValueRollback inProgress(m_switching, true);
    if (!leaveCurrent()) {
        return;
    }
    const QVariantMap entry{{"kind", "server"}, {"server", server.toString()}, {"timelineId", id}};
    auto arguments = nt::app::recentTimelineArguments(entry);
    m_menus->preferences()->addRecentServer(label, {server, {}, id, {}, {}});
    launch(std::move(arguments), timelineLaunchEnvironment(listTarget()));
}
void TimelineDocumentController::launch(QStringList arguments, const QProcessEnvironment& environment) {
    // The new window keeps this one's audio output and decoder, so a run
    // started with --audio null (no sound device) does not die at launch.
    const auto own = QCoreApplication::arguments();
    for (qsizetype i = 1; i < own.size(); ++i) {
        for (const auto& option : {QStringLiteral("audio"), QStringLiteral("decode")}) {
            if (own[i] == "--" + option && i + 1 < own.size()) {
                arguments << own[i] << own[i + 1];
            } else if (own[i].startsWith("--" + option + "=")) {
                arguments << own[i];
            }
        }
    }
    bool started = false;
    const auto capture = qEnvironmentVariable("NT_TIMELINE_SWITCH_CAPTURE");
    if (!capture.isEmpty() && qEnvironmentVariableIsSet("NT_TIMELINE_DOCUMENT_CHECK")) {
        // The real-app test owns the next launch, so no detached child can escape it.
        QSaveFile file(capture);
        const auto bytes = QJsonDocument(QJsonArray::fromStringList(arguments)).toJson(QJsonDocument::Compact);
        started = file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
    } else {
        // This process quits next, so the server must wait for the new window.
        nt::server::noteBundledServerHandoff();
        QProcess child;
        child.setProgram(nt::server::appRelaunchProgram());
        child.setArguments(arguments);
        child.setProcessEnvironment(environment);
        started = child.startDetached();
    }
    if (!started) {
        fail(QStringLiteral("Could not open the timeline in a new window. Try again."));
        return;
    }
    QCoreApplication::quit();
}
}
