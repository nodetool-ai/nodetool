#pragma once
#include "model/TimelineModel.h"
#include <QImage>
#include <QMap>
#include <QPointer>
#include <QProcess>
#include <QTemporaryDir>
#include <QThreadPool>
#include <QTimer>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
#include <memory>

struct FrameCaptureResult {
    int requestId = 0;
    QImage image;
    double timeMs = 0;
    QString error;
    bool cancelled = false;
    bool ok() const { return !image.isNull(); }
};

class FrameCapture : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(int pending READ pending NOTIFY pendingChanged)
public:
    using Callback = std::function<void(const FrameCaptureResult&)>;
    explicit FrameCapture(QObject* parent = nullptr);
    ~FrameCapture() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    int pending() const { return m_requests.size(); }
    void setExecutable(const QString& path) { m_executable = path; }
    void setIdleInterval(int ms) { m_idle.setInterval(ms); }
    Q_INVOKABLE int captureSequence(double timeMs);
    Q_INVOKABLE int captureSource(const QString& path, double sourceTimeMs);
    int captureSequence(double timeMs, Callback callback);
    int captureSource(const QString& path, double sourceTimeMs, Callback callback);
    Q_INVOKABLE void cancel(int requestId);
    qint64 processId() const { return m_process.processId(); }
    void killChildForTest() { m_process.kill(); }
signals:
    void timelineChanged();
    void pendingChanged();
    void frameReady(int requestId, const QImage& image, double timeMs);
    void frameFailed(int requestId, const QString& error);
    void frameCancelled(int requestId);
private:
    struct Snapshot;
    struct Request {
        double timeMs = 0;
        QString path;
        Callback callback;
        std::shared_ptr<Snapshot> snapshot;
        FrameCaptureResult result;
        bool sequence = false;
        bool sent = false;
        bool ending = false;
    };
    int request(bool sequence, const QString& path, double timeMs, Callback callback);
    void prepareSnapshot();
    void sendRequests();
    void readResponses();
    void send(const QJsonObject& object);
    void complete(FrameCaptureResult result);
    void childFailed(const QString& error);
    void invalidateSnapshot();
    QPointer<TimelineModel> m_timeline;
    QProcess m_process;
    QTimer m_idle;
    QThreadPool m_pool;
    QTemporaryDir m_directory;
    QMap<int, Request> m_requests;
    std::shared_ptr<Snapshot> m_snapshot;
    QString m_executable;
    QByteArray m_stdout;
    QByteArray m_stderr;
    int m_nextId = 0;
    int m_snapshotSerial = 0;
    bool m_closing = false;
    bool m_destroying = false;
};
