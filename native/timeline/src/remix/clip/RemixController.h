#pragma once

// The Remix dialog's model: analyses the music of one audio clip off the GUI
// thread, plans the cuts for a target length, auditions the result, and commits
// it as a baked take through the "clip.remix" edit (RemixEdit.h). Nothing here
// edits the document until Apply. The analysis is kept, so a new target or
// slider position only plans again.

#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "remix/RemixDsp.h"
#include "remix/clip/RemixBackend.h"
#include "remix/clip/RemixEdit.h"
#include "audio/AppAudio.h"

#include <QObject>
#include <QPointer>
#include <QTemporaryDir>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <memory>
#include <optional>

class QThread;

// Lets the key actions and menus open the dialog, which lives in an overlay panel.
class RemixSession : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit RemixSession(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE void requestOpen(const QString& clipId) { emit openRequested(clipId); }
    // A message for the user from an action that has no dialog.
    Q_INVOKABLE void requestRevert(const QString& clipId) { emit revertRequested(clipId); }
    Q_INVOKABLE void report(const QString& title, const QString& text) { emit reported(title, text); }
signals:
    void openRequested(const QString& clipId);
    void revertRequested(const QString& clipId);
    void reported(const QString& title, const QString& text);
};

// Carries a task from a worker thread to the controller's thread.
// native-rules #9: used across threads (carries tasks from worker threads to the controller thread) and declares no thread affinity at its top
class RemixRelay : public QObject {
    Q_OBJECT
public:
    using Task = std::function<void()>;
signals:
    void post(const RemixRelay::Task& task);
};
Q_DECLARE_METATYPE(RemixRelay::Task)

// native-rules #9: used across threads (QThread workers post back through RemixRelay) and declares no thread affinity at its top
class RemixController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QString clipId READ clipId NOTIFY changed)
    Q_PROPERTY(QString clipName READ clipName NOTIFY changed)
    // closed, analyzing, ready, rendering, applying or refused
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QString phase READ phase NOTIFY progressChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY progressChanged)
    // What went wrong while analysing, rendering or saving.
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // Why Apply is not possible now, such as a clip in the way. Empty when it is.
    Q_PROPERTY(QString refusal READ refusal NOTIFY changed)
    Q_PROPERTY(bool hasPlan READ hasPlan NOTIFY changed)
    Q_PROPERTY(bool canApply READ canApply NOTIFY changed)
    Q_PROPERTY(bool canListen READ canListen NOTIFY changed)
    Q_PROPERTY(bool isRemix READ isRemix NOTIFY changed)
    Q_PROPERTY(double sourceMs READ sourceMs NOTIFY changed)
    Q_PROPERTY(double currentMs READ currentMs NOTIFY changed)
    Q_PROPERTY(double bpm READ bpm NOTIFY changed)
    Q_PROPERTY(int beatCount READ beatCount NOTIFY changed)
    Q_PROPERTY(double targetMs READ targetMs NOTIFY changed)
    Q_PROPERTY(double segments READ segments NOTIFY changed)
    Q_PROPERTY(double variations READ variations NOTIFY changed)
    // How much faster (+) or slower (-) the music plays than the source, in percent,
    // to land on the target to the frame.
    Q_PROPERTY(double tempoChangePercent READ tempoChangePercent NOTIFY changed)
    Q_PROPERTY(int cutCount READ cutCount NOTIFY changed)
    // {srcFrom, srcTo, outFrom, outTo}: each piece of the result as fractions of the source and of the result.
    Q_PROPERTY(QVariantList pieces READ pieces NOTIFY changed)
    // The longest result that fits before the next clip on the track, or -1 for no limit.
    Q_PROPERTY(double gapMs READ gapMs NOTIFY changed)
    Q_PROPERTY(bool listening READ listening NOTIFY listeningChanged)
    Q_PROPERTY(double listenPositionMs READ listenPositionMs NOTIFY listeningChanged)
    Q_PROPERTY(QString audioMode READ audioMode WRITE setAudioMode NOTIFY changed)
public:
    explicit RemixController(QObject* parent = nullptr);
    ~RemixController() override;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    QString clipId() const { return m_clipId; }
    QString clipName() const { return m_clipName; }
    QString state() const { return m_state; }
    QString phase() const { return m_phase; }
    bool busy() const { return m_state == QLatin1String("analyzing") || m_state == QLatin1String("rendering") || m_state == QLatin1String("applying"); }
    double progress() const { return m_progress; }
    QString error() const { return m_error; }
    QString refusal() const;
    bool hasPlan() const { return m_plan.has_value(); }
    bool canApply() const;
    bool canListen() const;
    bool isRemix() const { return m_isRemix; }
    double sourceMs() const { return m_window.durationMs; }
    double currentMs() const { return m_currentMs; }
    double bpm() const { return m_analysis ? m_analysis->bpm : 0; }
    int beatCount() const { return m_analysis ? int(m_analysis->beats.size()) : 0; }
    double targetMs() const { return m_targetMs; }
    double segments() const { return m_segments; }
    double variations() const { return m_variations; }
    double tempoChangePercent() const;
    int cutCount() const { return m_plan ? int(m_plan->pieces.size()) - 1 : 0; }
    QVariantList pieces() const;
    double gapMs() const;
    bool listening() const;
    double listenPositionMs() const;
    QString audioMode() const { return m_audioMode; }
    void setAudioMode(const QString& mode);

    // Tests supply a backend that needs no server. Without one the controller uses the server the timeline came from.
    void setBackend(std::shared_ptr<nt::remix::Backend> backend);

    // Starts the analysis of the clip. Returns false, with the reason in `error`, when the clip cannot be remixed.
    Q_INVOKABLE bool begin(const QString& clipId);
    // Plans again for a new target (milliseconds) and sliders (0 to 100).
    Q_INVOKABLE void setSettings(double targetMs, double segments, double variations);
    Q_INVOKABLE void listen();
    Q_INVOKABLE void stopListening();
    Q_INVOKABLE void apply();
    // Puts a remixed clip back to its source. One undo entry. Returns "" or why not.
    Q_INVOKABLE QString revert(const QString& clipId);
    // Stops any work and forgets the clip.
    Q_INVOKABLE void close();

signals:
    void changed();
    void progressChanged();
    void listeningChanged();
    // The remix was committed to the document.
    void applied();
    // A revert finished or was refused: why, or "".
    void reverted(const QString& clipId, const QString& error);

private:
    struct Job;
    void setState(const QString& state);
    void cancelWork();
    void retireWorker();
    void replan();
    void startAnalysis(std::string path);
    void startBake(bool thenListen, bool thenApply);
    QJsonObject currentRaw() const;
    QJsonObject clipRaw(const QString& id) const;
    QString bakeKey() const;
    void finishApply(const nt::Clip& media, const QJsonObject& asset, const QString& wavPath, quint64 generation, quint64 serial);
    void loadListening(const QString& wavPath);
    std::shared_ptr<nt::remix::Backend> backend() const;
    QSet<QString> protectedPaths() const;
    QString staleReason() const;

    QPointer<TimelineModel> m_timeline;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<nt::remix::Backend> m_backend;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    mutable std::shared_ptr<nt::remix::Backend> m_serverBackend;
    mutable bool m_serverBackendResolved = false;
    bool m_backendSet = false;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<RemixRelay> m_relay;
    QString m_clipId, m_clipName, m_currentAsset;
    QString m_state = QStringLiteral("closed");
    QString m_phase, m_error, m_refusal;
    double m_progress = 0;
    nt::remix::SourceWindow m_window;
    double m_currentMs = 0, m_currentIn = 0;
    bool m_isRemix = false;
    bool m_reverting = false;
    QString m_sourcePath;
    quint64 m_generation = 0;
    quint64 m_serial = 0;
    double m_targetMs = 0, m_segments = 50, m_variations = 50;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<const nt::remix::Analysis> m_analysis;
    std::optional<nt::remix::Plan> m_plan;
    QString m_planError;
    QThread* m_worker = nullptr;
    QTemporaryDir m_dir;
    QString m_bakedKey, m_bakedPath;
    int m_bakes = 0;
    // The audition: its own silent-until-played document, clock and engine.
    TimelineModel* m_previewModel;
    PlaybackClock* m_previewClock;
    std::unique_ptr<nt::audio::AppAudio> m_audio;
    QString m_audioMode = QStringLiteral("system");
    QString m_loadedKey;
};
