// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#pragma once

#include "takes/TakeSwitcher.h"

#include <QElapsedTimer>
#include <QImage>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class FrameCapture;

// The Program monitor's take grid: the takes of the clip a number key would
// switch, one page at a time, each with its frame at the playhead.
class TakeGrid : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(ClipGestureController* gestures READ gestures WRITE setGestures NOTIFY gesturesChanged)
    Q_PROPERTY(FrameCapture* capture READ capture WRITE setCapture NOTIFY captureChanged)
    Q_PROPERTY(TakeSwitcher* switcher READ switcher NOTIFY gesturesChanged)
    Q_PROPERTY(QString clipId READ clipId NOTIFY changed)
    Q_PROPERTY(QString clipName READ clipName NOTIFY changed)
    Q_PROPERTY(QVariantList takes READ takes NOTIFY takesChanged)
    Q_PROPERTY(int takeCount READ takeCount NOTIFY changed)
    Q_PROPERTY(int page READ page NOTIFY changed)
    Q_PROPERTY(int pageCount READ pageCount NOTIFY changed)
    Q_PROPERTY(int framesRevision READ framesRevision NOTIFY framesChanged)
public:
    explicit TakeGrid(QObject* parent = nullptr);
    ~TakeGrid() override;
    ClipGestureController* gestures() const { return m_gestures; }
    void setGestures(ClipGestureController* gestures);
    FrameCapture* capture() const { return m_capture; }
    void setCapture(FrameCapture* capture);
    TakeSwitcher* switcher() const { return m_switcher; }
    QString clipId() const { return m_clipId; }
    QString clipName() const { return m_clip.value(u"name").toString(); }
    QVariantList takes() const { return m_takes; }
    int takeCount() const { return m_takeIds.size(); }
    int page() const { return m_switcher ? m_switcher->page() : 0; }
    int pageCount() const;
    int framesRevision() const { return m_framesRevision; }
    Q_INVOKABLE QImage frame(const QString& takeId) const { return m_frames.value(takeId); }
    // `number` is the cell's place on the page, from 1, the same number its key has.
    Q_INVOKABLE void choose(int number, bool cut);
    Q_INVOKABLE void toggleRecording();
    Q_INVOKABLE void nextPage();
    Q_INVOKABLE void previousPage();
signals:
    void gesturesChanged();
    void captureChanged();
    void changed();
    void takesChanged();
    void framesChanged();
private:
    void refresh();
    void timeMoved();
    void showPage(int page);
    void scheduleFrames();
    void startRound();
    void cancelRound();
    double playheadMs() const;
    QPointer<ClipGestureController> m_gestures;
    QPointer<FrameCapture> m_capture;
    QPointer<TakeSwitcher> m_switcher;
    QString m_clipId;
    QJsonObject m_clip;
    QStringList m_takeIds;
    QVariantList m_takes;
    bool m_selectedClip = false;
    double m_rangeStartMs = 0;
    double m_rangeEndMs = 0;
    QHash<QString, QImage> m_frames;
    QList<int> m_requests;
    int m_round = 0;
    int m_framesRevision = 0;
    QTimer m_settle;
    QElapsedTimer m_sinceRound;
    QElapsedTimer m_sinceSearch;
};
