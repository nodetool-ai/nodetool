#pragma once
#include "model/TimelineModel.h"
#include "server/AssetCache.h"
#include <QObject>
#include <QPointer>
#include <QProcess>
#include <QTemporaryDir>
#include <QtQmlIntegration/qqmlintegration.h>
#include <memory>
#include <vector>

namespace nt::exporting {
QJsonObject exportSnapshot(const TimelineModel& model);
QString unavailableOriginalMedia(const nt::Timeline& timeline, bool videoOutput = true);
}

class ExportController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(bool running READ running NOTIFY runningChanged)
    Q_PROPERTY(bool mp4Supported READ mp4Supported CONSTANT)
    Q_PROPERTY(QString phase READ phase NOTIFY progressChanged)
    Q_PROPERTY(qint64 frame READ frame NOTIFY progressChanged)
    Q_PROPERTY(qint64 totalFrames READ totalFrames NOTIFY progressChanged)
    Q_PROPERTY(double ratio READ ratio NOTIFY progressChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
    explicit ExportController(QObject* parent = nullptr);
    ~ExportController() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    bool running() const { return m_process.state() != QProcess::NotRunning; }
    bool mp4Supported() const;
    QString phase() const { return m_phase; }
    qint64 frame() const { return m_frame; }
    qint64 totalFrames() const { return m_total; }
    double ratio() const { return m_ratio; }
    QString error() const { return m_error; }
    void setExecutable(const QString& path) { m_executable = path; }
    Q_INVOKABLE void open();
    Q_INVOKABLE void start(const QString& output, const QString& format, bool alpha = false);
    Q_INVOKABLE void cancel();
signals:
    void openRequested();
    void timelineChanged();
    void runningChanged();
    void progressChanged();
    void errorChanged();
    void finished(bool success);
private:
    void readProgress();
    void fail(const QString& message);
    QPointer<TimelineModel> m_timeline;
    QProcess m_process;
    std::unique_ptr<QTemporaryDir> m_job;
    std::unique_ptr<QTemporaryDir> m_staging;
    std::vector<nt::server::AssetCache::Lease> m_mediaLeases;
    QString m_activityId;
    QString m_executable;
    QString m_phase;
    QString m_error;
    QByteArray m_pending;
    QByteArray m_diagnostics;
    qint64 m_frame = 0;
    qint64 m_total = 0;
    double m_ratio = 0;
    bool m_cancelled = false;
};
