// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#pragma once
#include "export/ExportController.h"
#include "export/ExportSettings.h"
#include <QAbstractListModel>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>
#include <vector>

class ExportQueue : public QAbstractListModel {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(int count READ rowCount NOTIFY countChanged)
    Q_PROPERTY(int activeCount READ activeCount NOTIFY countChanged)
    Q_PROPERTY(bool running READ running NOTIFY countChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
public:
    explicit ExportQueue(QObject* parent = nullptr);
    ~ExportQueue() override;
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    int activeCount() const;
    bool running() const { return !m_runningId.isEmpty(); }
    QString lastError() const { return m_lastError; }
    Q_INVOKABLE QString enqueue(const QString& output, const QVariantMap& settings, const QString& presetName = {});
    Q_INVOKABLE void cancel(const QString& id);
    Q_INVOKABLE void remove(const QString& id);
    Q_INVOKABLE void clearFinished();
    Q_INVOKABLE QVariantMap job(const QString& id) const;
    void setExecutable(const QString& path) { m_runner.setExecutable(path); }
signals:
    void timelineChanged();
    void countChanged();
    void lastErrorChanged();
private:
    struct Job {
        QString id;
        QString name;
        QString output;
        QString presetName;
        QString state = QStringLiteral("queued");
        QString phase;
        double ratio = 0;
        qint64 frame = 0;
        qint64 totalFrames = 0;
        QString error;
        nt::exporting::Settings settings;
        QJsonObject snapshot;
        std::vector<nt::server::AssetCache::Lease> leases;
        bool cancelRequested = false;
    };
    int findJob(const QString& id) const;
    QVariantMap values(const Job& job) const;
    void startNext();
    void updateProgress();
    void finish(bool success);
    void changed(int row);
    QString refuse(const QString& error);
    QPointer<TimelineModel> m_timeline;
    std::vector<Job> m_jobs;
    QString m_runningId;
    QString m_lastError;
    ExportController m_runner;
};
