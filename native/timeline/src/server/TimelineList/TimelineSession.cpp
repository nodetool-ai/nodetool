#include "server/TimelineList/TimelineSession.h"

#include "app/Preferences/Preferences.h"
#include "model/TimelineJson.h"
#include "server/ServerSource.h"

#include <QFileInfo>
#include <utility>

namespace nt::server {

void TimelineSession::Loader::run() {
    result = openProbedServerTimeline(m_options);
}

TimelineSession::TimelineSession(TimelineModel& model, PlaybackClock& clock, AssetCacheRoot cache, bool cloudTimeline,
                                 QObject* parent)
    : QObject(parent), m_model(model), m_clock(clock), m_cache(std::move(cache)), m_cloudTimeline(cloudTimeline) {
    // One coarse connection serves the title and the Save availability.
    connect(&m_model, &TimelineModel::timelineChanged, this, [this] {
        updateWindowTitle();
        emit canSaveChanged();
    });
    connect(&m_model, &TimelineModel::readOnlyChanged, this, &TimelineSession::canSaveChanged);
    connect(this, &TimelineSession::switchingChanged, this, &TimelineSession::canSaveChanged);
    connect(this, &TimelineSession::autosaveChanged, this, &TimelineSession::canSaveChanged);
}

TimelineSession::~TimelineSession() {
    if (auto* loader = m_loader.data()) {
        disconnect(loader, nullptr, this, nullptr);
        loader->requestInterruption();
        if (!loader->wait(1000)) {
            // Loader owns only its value copies. Never delete a running thread:
            // let it delete itself once openProbedServerTimeline returns.
            loader->setParent(nullptr);
            connect(loader, &QThread::finished, loader, &QObject::deleteLater);
            if (loader->isFinished()) {
                loader->deleteLater();
            }
        }
    }
    teardownAutosave();
}

bool TimelineSession::canSave() const {
    return !m_model.timeline().raw.isEmpty() && !m_model.readOnly() && !m_switching && (m_autosave || m_flushLocal);
}

SaveDocumentResult TimelineSession::saveDocument() {
    if (!canSave()) {
        return {.ok = false, .error = QStringLiteral("Open a writable document first.")};
    }
    if (m_autosave) {
        return m_autosave->saveDocument();
    }
    const bool ok = m_flushLocal && m_flushLocal();
    QString error;
    if (!ok) {
        error = m_localSaveError ? m_localSaveError() : QString();
        if (error.isEmpty()) { error = QStringLiteral("Could not save the local document."); }
    }
    return {.ok = ok, .error = error};
}

void TimelineSession::setWindow(QQuickWindow* window) {
    m_window = window;
    updateWindowTitle();
}

void TimelineSession::setPreferences(nt::app::Preferences* preferences) {
    m_preferences = preferences;
}

void TimelineSession::updateWindowTitle() {
    if (!m_window) {
        return;
    }
    const QString name = m_model.name();
    m_window->setTitle(name.isEmpty() ? QStringLiteral("NodeTool Timeline")
                                      : QStringLiteral("NodeTool Timeline — %1").arg(name));
}

void TimelineSession::installAutosave(const SaveTarget& target, const QString& baseUpdatedAt) {
    m_autosave = std::make_unique<AutosaveController>(
        m_cache, target, m_model.undoStack(), [this]() { return m_model.timeline().raw; }, baseUpdatedAt);
    connect(&m_model, &TimelineModel::commandSettled, m_autosave.get(), &AutosaveController::documentChanged);
    connect(m_autosave.get(), &AutosaveController::projectChanged, &m_model, &TimelineModel::setProjectId);
    // The Library's project check can also move the document (AssetBrowser::receive).
    connect(&m_model, &TimelineModel::timelineChanged, m_autosave.get(), &AutosaveController::syncOpenProject);
    emit autosaveChanged();
}

void TimelineSession::teardownAutosave() {
    if (!m_autosave) {
        return;
    }
    auto old = std::move(m_autosave);
    old->disconnect(this);
    old->disconnect(&m_model);
    disconnect(&m_model, nullptr, old.get(), nullptr);
    // Notify QML before deleting so bindings drop the dying pointer first.
    emit autosaveChanged();
    old.reset();
}

void TimelineSession::attachInitialServer(const QString& baseUpdatedAt) {
    if (m_cloudTimeline) {
        return;
    }
    if (const auto target = serverSaveTarget()) {
        installAutosave(*target, baseUpdatedAt);
    }
}

void TimelineSession::fail(const QString& error) {
    if (m_switching) {
        m_switching = false;
        emit switchingChanged();
    }
    m_switchError = error;
    emit switchErrorChanged();
    emit switchFailed(error);
}

bool TimelineSession::switchToServerTimeline(const QUrl& server, const QString& timelineId, const QString& token,
                                             const QString& expectedInstance, const QString& label,
                                             nt::app::Preferences* preferences) {
    if (!canSwitchInPlace() || m_switching || !server.isValid() || timelineId.isEmpty()) {
        return false;
    }
    if (!m_switchError.isEmpty()) {
        m_switchError.clear();
        emit switchErrorChanged();
    }
    // Switching to the already-open timeline on the same server is a no-op.
    if (const auto current = serverSaveTarget();
        current && current->timelineId == timelineId &&
        current->server.adjusted(QUrl::StripTrailingSlash) == server.adjusted(QUrl::StripTrailingSlash)) {
        emit switched(timelineId);
        return true;
    }
    if (m_autosave && !m_autosave->flushBeforeQuit(5000)) {
        fail(QStringLiteral("Could not save the current timeline. %1").arg(m_autosave->lastError()));
        return false;
    }
    if (m_flushLocal && !m_flushLocal()) {
        fail(QStringLiteral("Could not save the current timeline."));
        return false;
    }

    ServerOpenOptions options;
    options.server = server;
    options.timelineId = timelineId;
    options.cacheRoot = m_cache;
    options.token = token;
    options.expectedInstance = expectedInstance;

    m_switching = true;
    emit switchingChanged();

    // Parented to this until QThread::finished deletes it.
    auto* loader = new Loader(std::move(options), this);
    m_loader = loader;
    const QPointer<nt::app::Preferences> prefsGuard(preferences ? preferences : m_preferences.data());
    connect(loader, &QThread::finished, this,
            [this, guard = QPointer<Loader>(loader), server, timelineId, token, label, prefsGuard]() {
                if (!guard) {
                    return;
                }
                ServerOpenResult opened = std::move(guard->result);
                m_loader.clear();
                guard->deleteLater();
                finishSwitch(server, timelineId, token, label, prefsGuard, std::move(opened));
            });
    loader->start();
    return true;
}

bool TimelineSession::switchToLocalFile(const QString& filePath, nt::app::Preferences* preferences) {
    if (!canSwitchInPlace() || m_switching || filePath.isEmpty()) {
        return false;
    }
    if (!m_switchError.isEmpty()) {
        m_switchError.clear();
        emit switchErrorChanged();
    }
    const QFileInfo info(filePath);
    const QString canonical = info.canonicalFilePath().isEmpty() ? info.absoluteFilePath() : info.canonicalFilePath();
    if (!m_model.sourcePath().isEmpty()) {
        const QFileInfo currentInfo(m_model.sourcePath());
        const QString currentCanonical =
            currentInfo.canonicalFilePath().isEmpty() ? currentInfo.absoluteFilePath() : currentInfo.canonicalFilePath();
        if (!currentCanonical.isEmpty() && currentCanonical == canonical) {
            emit switched(m_model.timelineId());
            return true;
        }
    }
    if (m_autosave && !m_autosave->flushBeforeQuit(5000)) {
        fail(QStringLiteral("Could not save the current timeline. %1").arg(m_autosave->lastError()));
        return false;
    }
    if (m_flushLocal && !m_flushLocal()) {
        fail(QStringLiteral("Could not save the current timeline."));
        return false;
    }

    const auto loaded = nt::loadTimelineFile(canonical);
    if (!loaded.timeline) {
        if (loaded.unsupportedColorSpaceVersion) {
            fail(QStringLiteral("This timeline uses color version %1. This version of NodeTool supports up to version "
                                "1. Update NodeTool to edit or export it.")
                     .arg(loaded.unsupportedColorSpaceVersionText));
        } else {
            fail(loaded.error.isEmpty() ? QStringLiteral("Could not open the timeline file.") : loaded.error);
        }
        return false;
    }

    m_clock.pause();
    teardownAutosave();
    clearActiveServerTarget();

    m_model.setReadOnly(false);
    m_model.setTimeline(std::move(*loaded.timeline));
    m_clock.setDurationMs(m_model.contentEndMs());
    m_clock.seek(0.0);

    if (m_attachLocal) {
        m_attachLocal(canonical);
    } else if (m_refreshMedia) {
        m_refreshMedia();
    }
    if (auto* prefs = preferences ? preferences : m_preferences.data()) {
        const QString title = m_model.name();
        prefs->addRecentFile(title.isEmpty() ? QFileInfo(canonical).completeBaseName() : title, canonical);
    }
    updateWindowTitle();
    emit switched(m_model.timelineId());
    return true;
}

void TimelineSession::finishSwitch(const QUrl& server, const QString& timelineId, const QString& token,
                                   const QString& label, QPointer<nt::app::Preferences> preferences,
                                   ServerOpenResult opened) {
    if (!opened.timeline) {
        if (opened.unsupportedColorSpaceVersion) {
            fail(QStringLiteral("This timeline uses color version %1. This version of NodeTool supports up to version "
                                "1. Update NodeTool to edit or export it.")
                     .arg(opened.unsupportedColorSpaceVersionText));
        } else {
            fail(opened.error.isEmpty() ? QStringLiteral("Could not open the timeline.") : opened.error);
        }
        return;
    }
    // Guard against any edit that landed while the next timeline was loading.
    if (m_autosave && m_autosave->dirty() && !m_autosave->flushBeforeQuit(5000)) {
        fail(QStringLiteral("Could not save the current timeline. %1").arg(m_autosave->lastError()));
        return;
    }
    if (m_flushLocal && !m_flushLocal()) {
        fail(QStringLiteral("Could not save the current timeline. %1")
                 .arg(m_localSaveError ? m_localSaveError() : QString()));
        return;
    }

    m_clock.pause();
    teardownAutosave();

    setActiveServerTarget(server, timelineId, token, m_cache.path());
    writeLoaderReport(server, timelineId, opened.report);

    m_model.setReadOnly(false);
    m_model.setTimeline(std::move(*opened.timeline));
    m_clock.setDurationMs(m_model.contentEndMs());
    m_clock.seek(0.0);

    if (m_refreshMedia) {
        m_refreshMedia();
    }
    if (const auto target = serverSaveTarget()) {
        installAutosave(*target, m_model.timeline().raw.value(u"updatedAt").toString());
        if (preferences) {
            const QString title = !label.isEmpty() ? label : m_model.name();
            preferences->addRecentServer(title.isEmpty() ? QStringLiteral("Untitled video") : title, *target);
        }
    }
    updateWindowTitle();

    m_switching = false;
    emit switchingChanged();
    emit switched(timelineId);
}

}  // namespace nt::server
