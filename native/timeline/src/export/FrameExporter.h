// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#pragma once
#include "export/FrameCapture.h"
#include <QThread>
#include <QUrl>
#include <QVariantMap>
#include <functional>

class FrameExporter : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString state READ state NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    Q_PROPERTY(QImage image READ image NOTIFY changed)
    Q_PROPERTY(QSize frameSize READ frameSize NOTIFY changed)
    Q_PROPERTY(double timeMs READ timeMs NOTIFY changed)
    Q_PROPERTY(bool libraryAvailable READ libraryAvailable NOTIFY changed)
    Q_PROPERTY(QString savedPath READ savedPath NOTIFY changed)
    Q_PROPERTY(QVariantMap savedAsset READ savedAsset NOTIFY changed)
    Q_PROPERTY(QString lastFolder READ lastFolder NOTIFY changed)
public:
    explicit FrameExporter(QObject* parent = nullptr);
    ~FrameExporter() override;
    TimelineModel* timeline() const { return m_capture.timeline(); }
    void setTimeline(TimelineModel* model);
    QString state() const { return m_state; }
    QString error() const { return m_error; }
    QImage image() const { return m_image; }
    QSize frameSize() const { return m_image.size(); }
    double timeMs() const { return m_timeMs; }
    bool libraryAvailable() const;
    QString savedPath() const { return m_savedPath; }
    QVariantMap savedAsset() const { return m_savedAsset; }
    QString lastFolder() const;
    Q_INVOKABLE void captureProgram(double timeMs);
    Q_INVOKABLE void captureSource(const QVariantMap& asset, const QString& previewPath, double sourceMs);
    Q_INVOKABLE void saveToFile(const QUrl& file, const QString& format);
    Q_INVOKABLE void saveToLibrary(const QString& name, const QString& format, const QString& folderId = {});
    Q_INVOKABLE bool fileExists(const QUrl& file) const;
    Q_INVOKABLE QUrl fileUrl(const QString& folder, const QString& name, const QString& format) const;
    Q_INVOKABLE QString localPath(const QUrl& folder) const;
    Q_INVOKABLE QUrl folderUrl(const QString& folder) const;
    // The source.place payload that puts the saved Library frame at the end of the sequence.
    Q_INVOKABLE QVariantMap startFramePlacement() const;
    Q_INVOKABLE void reset();
    FrameCapture* captureForTest() { return &m_capture; }
    void startWorkerForTest(std::function<void()> work) { worker(std::move(work), [] {}); }
    void setSavedAssetForTest(const QVariantMap& asset) { m_savedAsset = asset; m_state = "saved"; emit changed(); }
signals:
    void changed();
    void timelineChanged();
    void saved();
private:
    void cancel();
    void beginCapture(double timeMs);
    void captured(const FrameCaptureResult& result, quint64 serial);
    void worker(std::function<void()> work, std::function<void()> finish);
    FrameCapture m_capture;
    QThread* m_worker = nullptr;
    QString m_state = "idle";
    QString m_error;
    QImage m_image;
    double m_timeMs = 0;
    QString m_savedPath;
    QVariantMap m_savedAsset;
    int m_request = 0;
    quint64 m_serial = 0;
};
