#pragma once
#include "server/AutosaveController.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
#include <deque>
#include <optional>

class AssetBrowser : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool configured READ configured CONSTANT)
    Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
    Q_PROPERTY(QString error READ error NOTIFY stateChanged)
    Q_PROPERTY(QVariantList assets READ assets NOTIFY assetsChanged)
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString folderId READ folderId WRITE setFolderId NOTIFY folderChanged)
public:
    explicit AssetBrowser(QObject* parent = nullptr);
    ~AssetBrowser() override;
    bool configured() const { return m_target.has_value(); }
    bool busy() const { return !m_thread.isNull(); }
    QString error() const { return m_error; }
    QVariantList assets() const { return m_assets.toVariantList(); }
    TimelineModel* timeline() const;
    void setTimeline(TimelineModel* model);
    QString folderId() const { return m_folderId; }
    void setFolderId(const QString& id);
    Q_INVOKABLE void openFolder(const QString& id);
    Q_INVOKABLE void goUp();
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void importFiles(const QList<QUrl>& urls);
    Q_INVOKABLE QString mediaType(const QVariantMap& asset) const;
    Q_INVOKABLE QString trackAt(TrackWindowModel* rows, double contentY) const;
    Q_INVOKABLE bool drop(const QVariantMap& asset, const QString& trackId, double startMs,
                          const QString& mode, double snapMs);
    Q_INVOKABLE QUrl mediaUrl(const QString& path) const;
signals:
    void stateChanged();
    void assetsChanged();
    void timelineChanged();
    void folderChanged();
private:
    struct Result {
        QJsonArray assets;
        QString error;
        bool replace = false;
        QStringList failedWatchIds = {};
        QJsonObject settlement = {};
        std::optional<QString> folder = {};
    };
    void request(std::function<Result(nt::server::ServerClient&)> work,
                 std::function<void(const Result&)> done = {});
    void importNext();
    void pollProxies();
    void receive(const Result& result);
    bool applyDrop(const QJsonObject& payload);
    void queueLinkedAudio(const QJsonObject& asset, const QString& audioClipId,
                          QPointer<TimelineModel> model, quint64 generation);
    std::optional<nt::server::SaveTarget> m_target;
    QPointer<TimelineModel> m_timeline;
    QPointer<QThread> m_thread;
    QJsonArray m_assets;
    QHash<QString, int> m_pending;
    QStringList m_files;
    QString m_error;
    QString m_folderId;
    QStringList m_folderPath;
    struct Request {
        std::function<Result(nt::server::ServerClient&)> work;
        std::function<void(const Result&)> done;
    };
    std::deque<Request> m_requests;
    QTimer m_poll;
};
