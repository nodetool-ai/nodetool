#include "TimelineProjectFiles.h"

#include "server/AutosaveController.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include "server/TimelineList/TimelineSession.h"
#include "server/projectfolder/ProjectFolderState.h"

#include <QJsonObject>

void TimelineProjectFiles::LookupWorker::run() {
    nt::server::ServerClient client(m_server, m_token, 10000);
    client.setExpectedInstance(m_expectedInstance);
    const auto response = client.query(QStringLiteral("projects.documentByFile"),
                                       {{"id", m_projectId}, {"path", m_path}});
    if (!response.ok()) {
        error = QStringLiteral("Could not open timeline: %1").arg(response.describe());
        return;
    }
    if (!response.data.isObject()) {
        error = QStringLiteral("This file is not linked to a timeline in this project.");
        return;
    }
    const auto doc = response.data.toObject();
    const QString type = doc.value(u"type").toString();
    const QString ref = doc.value(u"ref").toString();
    if (type != u"timeline" || ref.isEmpty()) {
        error = QStringLiteral("This file is not linked to a timeline in this project.");
        return;
    }
    timelineId = ref;
    timelineName = doc.value(u"name").toString();
}

TimelineProjectFiles::TimelineProjectFiles(QObject* parent) : QObject(parent) {
    // A fixture timeline has no server, so the tree shows that it has no folder.
    if (const auto target = nt::server::serverSaveTarget()) {
        m_configuredOrigin = target->server;
        m_configuredToken = target->token;
        m_files.configure(target->server, target->token, {});
    }
    connect(&m_files, &nodetool::files::ProjectFiles::openFileRequested, this, &TimelineProjectFiles::openFile);
}

TimelineProjectFiles::~TimelineProjectFiles() {
    stopLookup();
    disconnect(m_folderConnection);
    disconnect(m_autosaveConnection);
    disconnect(m_sessionSwitched);
    disconnect(m_sessionFailed);
}

void TimelineProjectFiles::stopLookup() {
    ++m_lookupGeneration;
    if (auto* worker = m_lookup.data()) {
        disconnect(worker, nullptr, this, nullptr);
        worker->requestInterruption();
        if (!worker->wait(1000)) {
            worker->setParent(nullptr);
            connect(worker, &QThread::finished, worker, &QObject::deleteLater);
            if (worker->isFinished()) { worker->deleteLater(); }
        }
        m_lookup.clear();
    }
}

void TimelineProjectFiles::setFolder(ProjectFolderState* folder) {
    if (folder == m_folder) { return; }
    stopLookup();
    disconnect(m_folderConnection);
    m_folder = folder;
    if (folder) { m_folderConnection = connect(folder, &ProjectFolderState::changed, this, &TimelineProjectFiles::syncFolder); }
    syncFolder();
    emit folderChanged();
}

void TimelineProjectFiles::setAutosave(QObject* autosave) {
    if (autosave == m_autosave) { return; }
    disconnect(m_autosaveConnection);
    m_autosave = autosave;
    if (auto* controller = qobject_cast<nt::server::AutosaveController*>(autosave)) {
        m_autosaveConnection = connect(controller, &nt::server::AutosaveController::workspaceFilesChanged, &m_files,
                                       &nodetool::files::ProjectFiles::workspaceFilesChanged);
    }
    emit autosaveChanged();
}

QObject* TimelineProjectFiles::session() const { return m_session; }

void TimelineProjectFiles::setSession(QObject* object) {
    auto* session = qobject_cast<nt::server::TimelineSession*>(object);
    if (session == m_session) { return; }
    disconnect(m_sessionSwitched);
    disconnect(m_sessionFailed);
    m_session = session;
    if (session) {
        m_sessionSwitched = connect(session, &nt::server::TimelineSession::switched, this, [this](const QString&) {
            if (!m_awaitingSwitch && m_openError.isEmpty()) { return; }
            m_awaitingSwitch = false;
            m_openError.clear();
            emit openStateChanged();
        });
        m_sessionFailed = connect(session, &nt::server::TimelineSession::switchFailed, this, [this](const QString& err) {
            if (!m_awaitingSwitch) { return; }
            m_awaitingSwitch = false;
            m_openError = err;
            emit openStateChanged();
        });
    }
    emit sessionChanged();
}

void TimelineProjectFiles::clearOpenError() {
    if (m_openError.isEmpty()) { return; }
    m_openError.clear();
    emit openStateChanged();
}

void TimelineProjectFiles::setOpenError(const QString& error) {
    if (m_openError == error) { return; }
    m_openError = error;
    emit openStateChanged();
}

void TimelineProjectFiles::openFile(const QString& relativePath) {
    if (nodetool::files::ProjectFiles::previewKindOf(relativePath) != u"timeline") { return; }
    if (!m_session || !m_session->canSwitchInPlace() || m_session->switching() || m_lookup || !m_folder) { return; }
    clearOpenError();

    if (m_folder->isLocalFolder()) {
        const QString localPath = m_files.resolveLocalFile(relativePath);
        if (localPath.isEmpty()) {
            setOpenError(QStringLiteral("Could not locate this timeline file in the project folder."));
            return;
        }
        m_awaitingSwitch = true;
        emit openStateChanged();
        if (!m_session->switchToLocalFile(localPath)) {
            if (m_awaitingSwitch) {
                m_awaitingSwitch = false;
                if (m_openError.isEmpty()) { m_openError = m_session->switchError(); }
                emit openStateChanged();
            }
        }
        return;
    }

    const QUrl server = m_folder->serverUrl();
    const QString projectId = m_folder->projectId();
    if (!m_folder->configured() || !server.isValid() || server.isEmpty() || projectId.isEmpty()) {
        setOpenError(QStringLiteral("This project folder is not connected to a server."));
        return;
    }
    const QString token = m_folder->serverToken();
    QString expectedInstance = qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE");
    if (const auto live = nt::server::serverSaveTarget();
        live && live->server.adjusted(QUrl::StripTrailingSlash) == server.adjusted(QUrl::StripTrailingSlash)) {
        expectedInstance = live->expectedInstance;
    }

    const quint64 generation = ++m_lookupGeneration;
    auto* worker = new LookupWorker(server, token, expectedInstance, projectId, relativePath, this);
    m_lookup = worker;
    connect(worker, &QThread::finished, this,
            [this, guard = QPointer<LookupWorker>(worker), generation, server, token, expectedInstance] {
                if (!guard) { return; }
                const QString timelineId = guard->timelineId;
                const QString timelineName = guard->timelineName;
                const QString error = guard->error;
                m_lookup.clear();
                guard->deleteLater();
                if (generation != m_lookupGeneration) {
                    emit openStateChanged();
                    return;
                }
                if (!error.isEmpty()) {
                    m_openError = error;
                    emit openStateChanged();
                    return;
                }
                if (!m_session || !m_session->canSwitchInPlace()) {
                    emit openStateChanged();
                    return;
                }
                m_awaitingSwitch = true;
                emit openStateChanged();
                if (!m_session->switchToServerTimeline(server, timelineId, token, expectedInstance, timelineName)) {
                    if (m_awaitingSwitch) {
                        m_awaitingSwitch = false;
                        if (m_openError.isEmpty()) { m_openError = m_session->switchError(); }
                        emit openStateChanged();
                    }
                }
            });
    emit openStateChanged();
    worker->start();
}

void TimelineProjectFiles::retry() {
    if (!m_files.hasFolder() && m_folder) {
        m_folder->refresh();
        return;
    }
    m_files.refresh();
}

void TimelineProjectFiles::syncFolder() {
    if (!m_folder) {
        m_files.setFolderResolving(false);
        m_files.setFolderUnavailable(false);
        m_files.setFolderError({});
        m_files.setProject({});
        m_files.setProjectName({});
        m_files.setFolder({});
        return;
    }
    if (m_folder->configured() && !m_folder->serverUrl().isEmpty()
        && (m_folder->serverUrl() != m_configuredOrigin || m_folder->serverToken() != m_configuredToken)) {
        m_configuredOrigin = m_folder->serverUrl();
        m_configuredToken = m_folder->serverToken();
        m_files.configure(m_configuredOrigin, m_configuredToken, {});
    }
    if (m_folder->configured() && !m_folder->loaded() && m_folder->busy()) {
        m_files.setFolderResolving(true);
        m_files.setFolderUnavailable(false);
        m_files.setFolderError({});
        return;
    }
    m_files.setFolderResolving(false);
    if (!m_folder->loaded() && !m_folder->error().isEmpty()) {
        m_files.setFolderUnavailable(false);
        m_files.setFolderError(m_folder->error());
        m_files.setProject({});
        m_files.setProjectName({});
        m_files.setFolder({});
        return;
    }
    m_files.setFolderError({});
    m_files.setProject(m_folder->projectId());
    m_files.setProjectName(m_folder->projectName());
    if (m_folder->hasFolder() && !m_folder->folderAccessible()) {
        m_files.setFolderUnavailable(true);
        m_files.setFolder({});
        return;
    }
    m_files.setFolderUnavailable(false);
    if (m_folder->isLocalFolder()) {
        m_files.setLocalFolder(m_folder->folderPath());
        return;
    }
    // Reveal needs the folder on this machine, as ProjectFolderState::canReveal says.
    m_files.setFolder(m_folder->workspaceId(), m_folder->canReveal() ? m_folder->folderPath() : QString());
}
