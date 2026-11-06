#pragma once
#include "color/ScopeMath.h"
#include "color/ScopeNumbers.h"
#include "export/FrameCapture.h"
#include "playback/PlaybackClock.h"
#include <QColor>
#include <QImage>
#include <QVariantList>
#include <QJsonObject>
#include <QPointer>
#include <QThreadPool>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>

// Keeps the scope images of the frame at the playhead. It asks the editor's FrameCapture for one
// frame at a time and computes on its own worker thread. It reads the model and the clock and
// writes neither, so playback and seeks update nothing but the images here.
class ScopesController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(FrameCapture* capture READ capture WRITE setCapture NOTIFY inputsChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY inputsChanged)
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    Q_PROPERTY(QStringList scopes READ scopes WRITE setScopes NOTIFY scopesChanged)
    Q_PROPERTY(QImage waveform READ waveform NOTIFY imagesChanged)
    Q_PROPERTY(QImage parade READ parade NOTIFY imagesChanged)
    Q_PROPERTY(QImage vectorscope READ vectorscope NOTIFY imagesChanged)
    Q_PROPERTY(QImage histogram READ histogram NOTIFY imagesChanged)
    Q_PROPERTY(double frameTimeMs READ frameTimeMs NOTIFY imagesChanged)
    Q_PROPERTY(bool hasFrame READ hasFrame NOTIFY imagesChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    // A scope is an instrument reading the picture, so like media it stays dark in both schemes.
    Q_PROPERTY(QColor plateColor READ plateColor CONSTANT)
    Q_PROPERTY(QColor scaleColor READ scaleColor CONSTANT)
    Q_PROPERTY(QColor labelColor READ labelColor CONSTANT)
    Q_PROPERTY(QColor skinLineColor READ skinLineColor CONSTANT)
    Q_PROPERTY(double vectorExtent READ vectorExtent CONSTANT)
    Q_PROPERTY(double skinToneDeg READ skinToneDeg CONSTANT)
    Q_PROPERTY(QVariantList vectorTargets READ vectorTargets CONSTANT)
public:
    using NumbersCallback = std::function<void(const QJsonObject&)>;
    explicit ScopesController(QObject* parent = nullptr);
    ~ScopesController() override;
    FrameCapture* capture() const { return m_capture; }
    void setCapture(FrameCapture* capture);
    PlaybackClock* clock() const { return m_clock; }
    void setClock(PlaybackClock* clock);
    bool active() const { return m_active; }
    void setActive(bool active);
    QStringList scopes() const { return m_scopes; }
    void setScopes(const QStringList& scopes);
    QImage waveform() const { return m_images.waveform; }
    QImage parade() const { return m_images.parade; }
    QImage vectorscope() const { return m_images.vectorscope; }
    QImage histogram() const { return m_images.histogram; }
    double frameTimeMs() const { return m_images.timeMs; }
    bool hasFrame() const { return m_images.timeMs >= 0; }
    QString error() const { return m_error; }
    QColor plateColor() const { return QColor(0x0c, 0x0c, 0x0e); }
    QColor scaleColor() const { return QColor(0x4a, 0x4c, 0x52); }
    QColor labelColor() const { return QColor(0xa8, 0xab, 0xb2); }
    QColor skinLineColor() const { return QColor(0xb0, 0x7a, 0x5a); }
    double vectorExtent() const { return nt::scopes::kVectorExtent; }
    double skinToneDeg() const { return nt::scopes::kSkinToneDeg; }
    // The 75 percent color bar targets, as {name, x, y} in 0..1 of the plate, y down.
    QVariantList vectorTargets() const;
    // Scope data as numbers for the frame at a time, for the agent tools. The numbers are computed
    // on the worker. The callback runs on this object's thread, once, unless this object goes first.
    void readNumbers(double timeMs, const nt::scopes::NumbersOptions& options, NumbersCallback callback);
    // Computes the scopes of a frame that came from elsewhere, for a controller with no clock.
    Q_INVOKABLE void showFrame(const QImage& frame, double timeMs) { compute(frame, timeMs); }
    // Frames handed to the worker and the thread that last computed, for tests.
    int computedFramesForTest() const { return m_computedFrames; }
    Qt::HANDLE lastComputeThreadForTest() const { return m_lastComputeThread; }
    int playingIntervalMs() const { return m_playingIntervalMs; }
    void setPlayingIntervalMs(int ms) { m_playingIntervalMs = ms; }
signals:
    void inputsChanged();
    void activeChanged();
    void scopesChanged();
    void imagesChanged();
    void errorChanged();
private:
    struct Images {
        QImage waveform;
        QImage parade;
        QImage vectorscope;
        QImage histogram;
        double timeMs = -1;
        Qt::HANDLE thread = nullptr;
    };
    void markDirty();
    void documentChanged();
    void requestFrame();
    void compute(const QImage& frame, double timeMs);
    void startCompute();
    void finishCompute(const Images& images);
    void setError(const QString& error);
    QPointer<FrameCapture> m_capture;
    QPointer<PlaybackClock> m_clock;
    QPointer<TimelineModel> m_observed;
    QTimer m_timer;
    QStringList m_scopes{QStringLiteral("waveform"), QStringLiteral("parade"), QStringLiteral("vectorscope"), QStringLiteral("histogram")};
    Images m_images;
    QString m_error;
    QImage m_lastFrame;
    double m_lastFrameTime = -1;
    QImage m_nextFrame;
    double m_nextFrameTime = -1;
    double m_inFlightKey = -1;
    double m_doneKey = -1;
    quint64 m_documentSerial = 0;
    quint64 m_inFlightSerial = 0;
    quint64 m_doneSerial = 0;
    int m_requestId = 0;
    int m_playingIntervalMs = 200;
    int m_computedFrames = 0;
    Qt::HANDLE m_lastComputeThread = nullptr;
    bool m_active = false;
    bool m_dirty = false;
    bool m_computing = false;
    // Last: destroyed first, so no worker outlives the members above.
    QThreadPool m_pool;
};
