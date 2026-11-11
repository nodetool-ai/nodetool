#pragma once

// Scene Edit Detection for the selected video clips: the analysis runs off the
// GUI thread, the dialog reads its progress and result, and applying is one
// document edit. Analysis never touches the document, so cancelling or closing
// leaves it as it was.
//
// The analysis keeps one difference per frame of each clip. Moving the
// sensitivity or the minimum shot length only re-runs the cheap cut search over
// those, so the dialog shows the new count at once.

#include "model/TimelineModel.h"
#include "scenedetect/SceneDetect.h"
#include "scenedetect/SceneEditPlan.h"

#include <QObject>
#include <QPointer>
#include <QThreadPool>
#include <QTimer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

class SceneEditController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    // "idle", "analyzing", "ready", "applied" or "failed".
    Q_PROPERTY(QString state READ state NOTIFY stateChanged)
    Q_PROPERTY(double progress READ progress NOTIFY progressChanged)
    Q_PROPERTY(QString status READ status NOTIFY progressChanged)
    Q_PROPERTY(double sensitivity READ sensitivity WRITE setSensitivity NOTIFY optionsChanged)
    Q_PROPERTY(int minShotFrames READ minShotFrames WRITE setMinShotFrames NOTIFY optionsChanged)
    // The cut points the current options find, over all analysed clips.
    Q_PROPERTY(int cutCount READ cutCount NOTIFY resultsChanged)
    // How many of them Apply Cuts can make now. It differs from cutCount when a
    // clip is locked, retimed or changed since the analysis.
    Q_PROPERTY(int cuttableCount READ cuttableCount NOTIFY resultsChanged)
    Q_PROPERTY(int clipCount READ clipCount NOTIFY resultsChanged)
    // One row per analysed clip: {name, cuts, note}.
    Q_PROPERTY(QVariantList clips READ clips NOTIFY resultsChanged)
    // What was found, in one sentence.
    Q_PROPERTY(QString summary READ summary NOTIFY resultsChanged)
    // Clips left out or not cuttable, and why. Empty when there are none.
    Q_PROPERTY(QString notice READ notice NOTIFY resultsChanged)
    // What applying did, after it ran.
    Q_PROPERTY(QString outcome READ outcome NOTIFY stateChanged)
    Q_PROPERTY(bool canApplyCuts READ canApplyCuts NOTIFY actionsChanged)
    Q_PROPERTY(bool canCreateMarkers READ canCreateMarkers NOTIFY actionsChanged)
public:
    explicit SceneEditController(QObject* parent = nullptr);
    ~SceneEditController() override;

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    QString state() const { return m_state; }
    double progress() const;
    QString status() const;
    double sensitivity() const { return m_options.sensitivity; }
    void setSensitivity(double value);
    int minShotFrames() const { return m_options.minShotFrames; }
    void setMinShotFrames(int frames);
    int cutCount() const { return m_cutCount; }
    int cuttableCount() const { return m_cuttable; }
    int clipCount() const { return static_cast<int>(m_clips.size()); }
    QVariantList clips() const { return m_rows; }
    QString summary() const { return m_summary; }
    QString notice() const { return m_notice; }
    QString outcome() const { return m_outcome; }
    bool canApplyCuts() const { return m_state == "ready" && m_cuttable > 0; }
    bool canCreateMarkers() const { return m_state == "ready" && m_cutCount > 0; }

    // Starts analysing the video clips among `clipIds`. Locked clips and clips
    // with no readable media are left out and named in `notice`. Returns false
    // when none is left.
    Q_INVOKABLE bool begin(const QStringList& clipIds);
    // Stops the analysis. Nothing in the document changed.
    Q_INVOKABLE void cancel();
    // One undo entry. Returns false when nothing was cut.
    Q_INVOKABLE bool applyCuts();
    Q_INVOKABLE bool createMarkers();
    // Back to idle. Cancels a running analysis.
    Q_INVOKABLE void reset();

    // For tests: waits for the analysis, on the calling thread's event loop.
    bool waitForAnalysis(int timeoutMs = 60000);

signals:
    void timelineChanged();
    void stateChanged();
    void progressChanged();
    void optionsChanged();
    void resultsChanged();
    void actionsChanged();
    void analysisFinished();

private:
    struct ClipScan {
        QString id;
        QString name;
        double startMs = 0.0;
        double durationMs = 0.0;
        double inPointMs = 0.0;
        double periodMs = 0.0;
        std::vector<float> diffs;
        QString error;
    };
    struct Job {
        ClipScan scan;
        nt::Clip clip;
        int frames = 0;
    };
    // What one analysis shares with its worker. A new analysis gets its own, so
    // a stopped one cannot move the progress of the next.
    struct Run {
        std::atomic<bool> cancel{false};
        std::atomic<qint64> done{0};
        qint64 total = 0;
    };
    void run(std::vector<Job> jobs, std::shared_ptr<Run> state, int generation);
    void finish(std::vector<ClipScan> scans, int generation, bool cancelled);
    void setState(const QString& state);
    void recompute();
    std::vector<int> cutsOf(const ClipScan& scan) const;
    std::vector<double> timesOf(const ClipScan& scan) const;
    std::vector<nt::shots::CutRequest> requests() const;
    static QString plural(int count, const QString& one, const QString& many);

    QPointer<TimelineModel> m_timeline;
    nt::shots::SceneOptions m_options;
    QString m_state = QStringLiteral("idle");
    std::vector<ClipScan> m_clips;
    QVariantList m_rows;
    QString m_summary;
    QString m_notice;
    QString m_outcome;
    QString m_skipped;  // the clips left out at begin()
    int m_cutCount = 0;
    int m_cuttable = 0;

    QThreadPool m_pool;
    QTimer m_poll;
    int m_generation = 0;
    std::shared_ptr<Run> m_run = std::make_shared<Run>();
    mutable std::mutex m_statusMutex;
    QString m_current;
};
