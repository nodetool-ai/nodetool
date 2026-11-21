#pragma once

// Owns the active document's AutosaveController and switches server timelines
// in place inside the open window without restarting the process.
//
// Thread affinity: UI thread only. Background server loads run on one owned
// Loader QThread at a time, which reads only value-captured ServerOpenOptions
// and writes its own ServerOpenResult. The UI thread consumes the result after
// QThread::finished. The destructor interrupts and waits on any running loader.

#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "server/AssetCache.h"
#include "server/AutosaveController.h"
#include "server/ServerTimelineProbe.h"

#include <QObject>
#include <QPointer>
#include <QQuickWindow>
#include <QString>
#include <QThread>
#include <QUrl>

#include <functional>
#include <memory>

namespace nt::app {
class Preferences;
}

namespace nt::server {

class TimelineSession : public QObject {
    Q_OBJECT
    Q_PROPERTY(QObject* autosave READ autosave NOTIFY autosaveChanged)
    Q_PROPERTY(bool switching READ switching NOTIFY switchingChanged)
    Q_PROPERTY(QString switchError READ switchError NOTIFY switchErrorChanged)
    Q_PROPERTY(bool canSwitchInPlace READ canSwitchInPlace CONSTANT)

public:
    TimelineSession(TimelineModel& model, PlaybackClock& clock, AssetCacheRoot cache, bool cloudTimeline = false,
                    QObject* parent = nullptr);
    ~TimelineSession() override;

    void setWindow(QQuickWindow* window);
    void setPreferences(nt::app::Preferences* preferences);
    // Optional host callbacks for app-only resources (local file saver, matte
    // resolver) that live outside timeline_qml.
    void setFlushLocalCallback(std::function<bool()> callback) { m_flushLocal = std::move(callback); }
    void setAttachLocalCallback(std::function<void(const QString&)> callback) { m_attachLocal = std::move(callback); }
    void setRefreshMediaCallback(std::function<void()> callback) { m_refreshMedia = std::move(callback); }

    // Attaches the initial AutosaveController when serverSaveTarget() is set.
    void attachInitialServer(const QString& baseUpdatedAt);

    QObject* autosave() const { return m_autosave.get(); }
    AutosaveController* autosaveController() const { return m_autosave.get(); }
    bool switching() const { return m_switching; }
    QString switchError() const { return m_switchError; }
    bool canSwitchInPlace() const { return !m_cloudTimeline; }

    // Flushes the open document, fetches and probes the destination timeline
    // off the UI thread, and swaps it into the open window on success. On any
    // failure, leaves the open document untouched and emits switchFailed().
    bool switchToServerTimeline(const QUrl& server, const QString& timelineId, const QString& token,
                                const QString& expectedInstance, const QString& label,
                                nt::app::Preferences* preferences = nullptr);
    // Flushes the open document and loads a local .timeline.json file in place.
    // On any failure, leaves the open document untouched and emits switchFailed().
    bool switchToLocalFile(const QString& filePath, nt::app::Preferences* preferences = nullptr);

signals:
    void autosaveChanged();
    void switchingChanged();
    void switchErrorChanged();
    void switched(const QString& timelineId);
    void switchFailed(const QString& error);

private:
    class Loader : public QThread {
    public:
        Loader(ServerOpenOptions options, QObject* parent) : QThread(parent), m_options(std::move(options)) {}
        ServerOpenResult result;

    protected:
        void run() override;

    private:
        ServerOpenOptions m_options;
    };

    void installAutosave(const SaveTarget& target, const QString& baseUpdatedAt);
    void teardownAutosave();
    void updateWindowTitle();
    void fail(const QString& error);
    void finishSwitch(const QUrl& server, const QString& timelineId, const QString& token, const QString& label,
                      QPointer<nt::app::Preferences> preferences, ServerOpenResult opened);

    TimelineModel& m_model;
    PlaybackClock& m_clock;
    AssetCacheRoot m_cache;
    bool m_cloudTimeline = false;
    QPointer<QQuickWindow> m_window;
    QPointer<nt::app::Preferences> m_preferences;
    std::unique_ptr<AutosaveController> m_autosave;
    QPointer<Loader> m_loader;
    bool m_switching = false;
    QString m_switchError;
    std::function<bool()> m_flushLocal;
    std::function<void(const QString&)> m_attachLocal;
    std::function<void()> m_refreshMedia;
};

}  // namespace nt::server
