#pragma once
#include "export/FrameCapture.h"
#include "playback/PlaybackClock.h"
#include <QImage>
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QThreadPool>
#include <QtQmlIntegration/qqmlintegration.h>
#include <atomic>
#include <memory>

namespace nt::color { struct MatchResult; }
namespace nt::colorpanel {
// A document with one clip on its own: no other clips, no placement, opacity, transition, caption
// or animation, and the given effects. What Match compares is the shot's own picture. The solver
// runs the track's effects itself after the correction, so a probe leaves them out, except a
// key, which the renderer runs before anything is graded.
QJsonObject isolatedClipDocument(const QJsonObject& snapshot, const QString& clipId, const QJsonArray& effects, bool trackEffects = true);
}

// Match: grades the selected shot toward a reference frame or shot. The frames come from the
// editor's FrameCapture, the solving runs on a worker thread, and the result is one patchClip
// edit, so one undo entry, of ordinary effect values.
class ColorMatchController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(FrameCapture* capture READ capture WRITE setCapture NOTIFY inputsChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY inputsChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY inputsChanged)
    Q_PROPERTY(bool protectSkin READ protectSkin WRITE setProtectSkin NOTIFY inputsChanged)
    Q_PROPERTY(QImage referenceImage READ referenceImage NOTIFY referenceChanged)
    Q_PROPERTY(bool hasReference READ hasReference NOTIFY referenceChanged)
    Q_PROPERTY(QString referenceClipName READ referenceClipName NOTIFY referenceChanged)
    Q_PROPERTY(double referenceTimeMs READ referenceTimeMs NOTIFY referenceChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
    Q_PROPERTY(QString error READ error NOTIFY stateChanged)
    Q_PROPERTY(QString status READ status NOTIFY stateChanged)
public:
    explicit ColorMatchController(QObject* parent = nullptr);
    ~ColorMatchController() override;
    FrameCapture* capture() const { return m_capture; }
    void setCapture(FrameCapture* capture);
    PlaybackClock* clock() const { return m_clock; }
    void setClock(PlaybackClock* clock);
    QString clipId() const { return m_clipId; }
    void setClipId(const QString& clipId);
    bool protectSkin() const { return m_protectSkin; }
    void setProtectSkin(bool protect);
    QImage referenceImage() const { return m_reference; }
    bool hasReference() const { return !m_reference.isNull(); }
    QString referenceClipName() const { return m_referenceClipName; }
    double referenceTimeMs() const { return m_referenceTimeMs; }
    bool busy() const { return m_step != Step::Idle; }
    QString error() const { return m_error; }
    QString status() const { return m_status; }
    // The frame at the playhead, as the Program monitor shows it.
    Q_INVOKABLE void useFrameAtPlayhead();
    // The middle frame of the selected clip, with its effects and without its placement.
    Q_INVOKABLE void useSelectedShot();
    Q_INVOKABLE void clearReference();
    Q_INVOKABLE void match();
    Q_INVOKABLE void cancel();
    double lastDifferenceBefore() const { return m_differenceBefore; }
    double lastDifferenceAfter() const { return m_differenceAfter; }
signals:
    void inputsChanged();
    void referenceChanged();
    void stateChanged();
    // One Match finished and wrote its edit.
    void matched();
private:
    enum class Step { Idle, Reference, Current, Solving };
    QJsonObject findClip(const QString& id) const;
    QJsonObject trackOf(const QJsonObject& clip) const;
    void finish(const QString& error, const QString& status = {});
    void capturedReference(const FrameCaptureResult& result, const QString& clipName, const QString& clipId);
    void capturedCurrent(const FrameCaptureResult& result);
    void solved(const nt::color::MatchResult& result);
    QPointer<FrameCapture> m_capture;
    QPointer<PlaybackClock> m_clock;
    QString m_clipId;
    QString m_targetId;
    QJsonObject m_targetClip;
    QJsonArray m_targetTrackEffects;
    QImage m_reference;
    QString m_referenceClipName;
    QString m_referenceClipId;
    QString m_error;
    QString m_status;
    double m_referenceTimeMs = -1;
    double m_differenceBefore = 0;
    double m_differenceAfter = 0;
    std::shared_ptr<std::atomic_bool> m_cancel;
    Step m_step = Step::Idle;
    int m_requestId = 0;
    int m_run = 0;
    bool m_protectSkin = true;
    // Last: destroyed first, so no worker outlives the members above.
    QThreadPool m_pool;
};
