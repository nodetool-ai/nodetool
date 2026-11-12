// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#pragma once
#include "export/FrameCapture.h"
#include "model/TimelineTypes.h"
#include "playback/PlaybackClock.h"
#include <QImage>
#include <QPointer>
#include <QTimer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
#include <memory>
#include <optional>

namespace nt::assets { class MediaProtection; }

// The frame the Reference panel and the Program monitor's comparison view show. It is a still from
// the editor's FrameCapture, so a reference holds no decoder and costs nothing while the playhead
// moves. Parked, it never connects to the clock. Ganged, it captures one frame at a time at the
// rate ScopesController uses, and only while something shows it.
//
// A document edit marks a parked frame stale and keeps its pixels: comparing a new take against the
// frame taken before it is the point of parking one. refresh() captures again on request. A ganged
// frame always shows the current document.
//
// Everything here is view state. It writes neither the document nor undo.
// native-rules #9: used across threads (QThread worker) and declares no thread affinity at its top
class ReferenceController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(FrameCapture* capture READ capture WRITE setCapture NOTIFY inputsChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY inputsChanged)
    // The editor's gesture controller, so a menu reaches the reference of its own editor.
    Q_PROPERTY(QObject* owner READ owner WRITE setOwner NOTIFY inputsChanged)
    Q_PROPERTY(bool shownInPanel READ shownInPanel WRITE setShownInPanel NOTIFY shownChanged)
    Q_PROPERTY(bool shownInView READ shownInView WRITE setShownInView NOTIFY shownChanged)
    Q_PROPERTY(bool ganged READ ganged WRITE setGanged NOTIFY stateChanged)
    Q_PROPERTY(bool hasReference READ hasReference NOTIFY stateChanged)
    // False while the timeline has no clips: there is no frame to take.
    Q_PROPERTY(bool hasContent READ hasContent NOTIFY stateChanged)
    Q_PROPERTY(double timeMs READ timeMs NOTIFY stateChanged)
    Q_PROPERTY(QString description READ description NOTIFY stateChanged)
    Q_PROPERTY(QString takeId READ takeId NOTIFY stateChanged)
    Q_PROPERTY(bool stale READ stale NOTIFY stateChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
    Q_PROPERTY(QString error READ error NOTIFY stateChanged)
    Q_PROPERTY(QImage image READ image NOTIFY imageChanged)
    Q_PROPERTY(bool hasImage READ hasImage NOTIFY imageChanged)
    Q_PROPERTY(double imageTimeMs READ imageTimeMs NOTIFY imageChanged)
    Q_PROPERTY(QString takeClipId READ takeClipId WRITE setTakeClipId NOTIFY takesChanged)
    Q_PROPERTY(QVariantList takes READ takes NOTIFY takesChanged)
public:
    // Fetches a take's media on a worker thread. A failure returns a clip with no picture path.
    using TakeMediaResolver = std::function<nt::Clip(const QString& assetId, const QJsonObject& clip)>;
    explicit ReferenceController(QObject* parent = nullptr);
    ~ReferenceController() override;
    static ReferenceController* forOwner(const QObject* owner);
    FrameCapture* capture() const { return m_capture; }
    void setCapture(FrameCapture* capture);
    PlaybackClock* clock() const { return m_clock; }
    void setClock(PlaybackClock* clock);
    QObject* owner() const { return m_owner; }
    void setOwner(QObject* owner);
    bool shownInPanel() const { return m_shownInPanel; }
    void setShownInPanel(bool shown);
    bool shownInView() const { return m_shownInView; }
    void setShownInView(bool shown);
    bool ganged() const { return m_ganged; }
    void setGanged(bool ganged);
    bool hasReference() const { return m_target.has_value(); }
    bool hasContent() const;
    double timeMs() const { return m_target ? m_target->timeMs : -1; }
    QString description() const { return m_target ? m_target->description : QString(); }
    QString takeId() const { return m_target ? m_target->takeId : QString(); }
    bool stale() const { return m_stale; }
    bool busy() const { return m_inFlight; }
    QString error() const { return m_error; }
    QImage image() const { return m_image; }
    bool hasImage() const { return !m_image.isNull(); }
    double imageTimeMs() const { return m_imageTimeMs; }
    // The clip whose takes are offered: the one set here, else the clip of the take showing.
    QString takeClipId() const;
    void setTakeClipId(const QString& clipId);
    QVariantList takes() const;
    // The other takes of a raw clip that can be shown: {value, label}. The clip's active take and a
    // take applyTake refuses, such as an extension still waiting for its timing, are left out.
    static QVariantList takesOf(const QJsonObject& clip);
    // Parks on the frame at the playhead, the frame nearest a time, or a number of frames away.
    Q_INVOKABLE void matchPlayhead();
    Q_INVOKABLE void parkAt(double timeMs);
    Q_INVOKABLE void stepFrames(int frames);
    Q_INVOKABLE bool useClipFrame(const QString& clipId, bool last);
    Q_INVOKABLE void useMarker(double timeMs, const QString& label);
    // Shows the take in place of the clip's current media, in the whole composite, so effects and
    // the source window stay as they are. Without a take id: the clip's next take.
    Q_INVOKABLE bool useTake(const QString& clipId, const QString& takeId = {});
    Q_INVOKABLE void refresh();
    void setTakeMediaResolverForTest(TakeMediaResolver resolver) { m_resolver = std::move(resolver); }
    int capturesForTest() const { return m_captures; }
signals:
    void inputsChanged();
    void shownChanged();
    void stateChanged();
    void imageChanged();
    void takesChanged();
    // A menu set the reference, so the panel should come forward unless the comparison view shows it.
    void revealRequested();
private:
    struct Target {
        double timeMs = 0;
        QString description;
        QString clipId;
        QString takeId;
    };
    TimelineModel* model() const { return m_capture ? m_capture->timeline() : nullptr; }
    double fps() const;
    void observeModel();
    void documentChanged();
    void clear();
    void syncFollowing();
    void markDirty();
    void followPlayhead();
    void setTarget(Target target);
    void requestCapture();
    void startTake(const Target& target);
    void captured(const FrameCaptureResult& result, const Target& target);
    void failed(const QString& error, const Target& target);
    void finishFlight();
    QPointer<FrameCapture> m_capture;
    QPointer<PlaybackClock> m_clock;
    QPointer<QObject> m_owner;
    QPointer<TimelineModel> m_observed;
    QTimer m_timer;
    std::optional<Target> m_target;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    TakeMediaResolver m_resolver;
    QImage m_image;
    double m_imageTimeMs = -1;
    QString m_imageTakeId;
    QString m_error;
    QString m_takeClipId;
    quint64 m_generation = 0;
    quint64 m_documentSerial = 0;
    quint64 m_doneSerial = 0;
    double m_doneTime = -1;
    quint64 m_run = 0;
    int m_requestId = 0;
    int m_captures = 0;
    bool m_hadContent = false;
    bool m_shownInPanel = false;
    bool m_shownInView = false;
    bool m_ganged = false;
    bool m_following = false;
    bool m_dirty = false;
    bool m_stale = false;
    bool m_inFlight = false;
    bool m_captureAgain = false;
};
