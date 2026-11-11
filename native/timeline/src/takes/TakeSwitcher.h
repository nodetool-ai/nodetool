// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#pragma once

#include "model/TimelineTypes.h"
#include "takes/TakeSwitch.h"

#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QThread>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <memory>

class ClipGestureController;
class PlaybackClock;
class TimelineModel;

// What the number keys do on one timeline: switch or cut while stopped, and cut
// live during a recording pass. Keeps the media of the takes it can reach.
// The state here is view state. Only the commits reach the document.
class TakeSwitcher : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Use TakeInfo.switcherFor(timeline)")
    Q_PROPERTY(bool recording READ recording NOTIFY recordingChanged)
    Q_PROPERTY(QString message READ message NOTIFY messageChanged)
public:
    static constexpr int PAGE_SIZE = 9;
    // Runs on a worker thread. Returns a clip with its media paths set, or with none when it fails.
    using MediaResolver = std::function<nt::Clip(const QJsonObject& rawClip, const QString& assetId)>;

    explicit TakeSwitcher(TimelineModel* model);
    ~TakeSwitcher() override;
    static TakeSwitcher* forTimeline(TimelineModel* model);

    bool recording() const { return m_recording; }
    QString message() const { return m_message; }
    void setMediaResolver(MediaResolver resolver) { m_resolver = std::move(resolver); }

    // A number key or a grid cell, `number` from 1. The grid's page offsets it while the grid is open.
    bool press(ClipGestureController& gestures, int number, bool cut, bool autoRepeat);
    void toggleRecording(ClipGestureController& gestures);

    nt::takes::Lookup lookup(const ClipGestureController& gestures, double timeMs) const;
    // Asks for the media of the clip's takes. mediaResolved follows for each new one.
    void ensureMedia(const QJsonObject& clip);
    // The local picture or sound file for an asset, or empty while it is not known.
    QString mediaPath(const QString& assetId, bool audio) const;

    int page() const { return m_page; }
    void setPage(int page);
    void gridOpened() { ++m_openGrids; }
    void gridClosed();
signals:
    void recordingChanged();
    void messageChanged();
    void mediaResolved(const QString& assetId);
private:
    struct MediaRequest {
        QString assetId;
        QJsonObject rawClip;
    };
    void setMessage(const QString& message);
    void endPass();
    void commitPass(const QJsonArray& before, const QJsonArray& after);
    bool switchClips(ClipGestureController& gestures, int index, double timeMs);
    bool cutClip(ClipGestureController& gestures, int index, double timeMs, bool live);
    void resolveNext();
    TimelineModel* m_model;
    QPointer<PlaybackClock> m_clock;
    QTimer m_messageTimer;
    QString m_message;
    bool m_recording = false;
    quint64 m_passToken = 0;
    int m_page = 0;
    int m_openGrids = 0;
    MediaResolver m_resolver;
    QHash<QString, nt::Clip> m_resolved;
    QSet<QString> m_failed;
    QList<MediaRequest> m_mediaQueue;
    QString m_resolving;
    QThread* m_worker = nullptr;
};

// Takes for QML: the switcher of a timeline and a clip's badge text.
class TakeInfo : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit TakeInfo(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE TakeSwitcher* switcherFor(TimelineModel* timeline) const;
    Q_INVOKABLE QString badge(const QVariantMap& clip) const;
};
