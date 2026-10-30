#pragma once
#include "server/AutosaveController.h"
#include "model/TimelineModel.h"
#include "model/TrackWindowModel.h"
#include "assets/AssetMedia.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QUrl>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
#include <atomic>
#include <deque>
#include <memory>
#include <optional>

class AssetBrowser : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool configured READ configured CONSTANT)
    Q_PROPERTY(bool busy READ busy NOTIFY stateChanged)
    Q_PROPERTY(QString error READ error NOTIFY stateChanged)
    Q_PROPERTY(QVariantMap thumbnails READ thumbnails NOTIFY thumbnailsChanged)
    Q_PROPERTY(QVariantList assets READ assets NOTIFY assetsChanged)
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(QString searchText READ searchText WRITE setSearchText NOTIFY filtersChanged)
    Q_PROPERTY(QString typeFilter READ typeFilter WRITE setTypeFilter NOTIFY filtersChanged)
    Q_PROPERTY(QString tagFilter READ tagFilter WRITE setTagFilter NOTIFY filtersChanged)
    Q_PROPERTY(bool favoritesOnly READ favoritesOnly WRITE setFavoritesOnly NOTIFY filtersChanged)
    Q_PROPERTY(QString libraryScope READ libraryScope NOTIFY libraryScopeChanged)
    Q_PROPERTY(QVariantList breadcrumbs READ breadcrumbs NOTIFY folderChanged)
    Q_PROPERTY(QVariantList transfers READ transfers NOTIFY transfersChanged)
    Q_PROPERTY(QString folderId READ folderId WRITE setFolderId NOTIFY folderChanged)
public:
    explicit AssetBrowser(QObject* parent = nullptr);
    ~AssetBrowser() override;
    bool configured() const { return m_target.has_value(); }
    bool busy() const { return !m_thread.isNull(); }
    QString error() const { return m_error; }
    QVariantMap thumbnails() const { return m_thumbnails; }
    Q_INVOKABLE void requestThumbnail(const QString& assetId);
    QVariantList assets() const { return m_assets.toVariantList(); }
    QString searchText() const { return m_searchText; }
    QString typeFilter() const { return m_typeFilter; }
    QString tagFilter() const { return m_tagFilter; }
    bool favoritesOnly() const { return m_favoritesOnly; }
    void setSearchText(const QString& value);
    void setTypeFilter(const QString& value);
    void setTagFilter(const QString& value);
    void setFavoritesOnly(bool value);
    QString libraryScope() const;
    QVariantList breadcrumbs() const;
    QVariantList transfers() const { return m_transfers; }
    Q_INVOKABLE void createFolder(const QString& name);
    Q_INVOKABLE void renameAsset(const QString& id, const QString& name);
    Q_INVOKABLE void moveAsset(const QString& id, const QString& parentId);
    Q_INVOKABLE void deleteAsset(const QString& id);
    Q_INVOKABLE void setAssetTags(const QString& id, const QStringList& tags);
    Q_INVOKABLE void setFavorite(const QString& id, bool favorite);
    Q_INVOKABLE void retryImport(const QString& id);
    Q_INVOKABLE void clearFinishedTransfers();
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
    Q_INVOKABLE bool canDrop(const QVariantMap& asset, const QString& trackId) const;
    Q_INVOKABLE bool drop(const QVariantMap& asset, const QString& trackId, double startMs,
                          const QString& mode, double snapMs);
    Q_INVOKABLE void resolveClipMedia(const QVariantMap& asset, const QString& clipId);
    Q_INVOKABLE QUrl mediaUrl(const QString& path) const;
signals:
    void thumbnailsChanged();
    void filtersChanged();
    void libraryScopeChanged();
    void transfersChanged();
    void stateChanged();
    void assetsChanged();
    void timelineChanged();
    void folderChanged();
private:
    friend class TestAssetBrowser;
    friend class TestLibraryData;
    struct QueuedImport {
        QString file;
        QJsonObject fields;
        QString folder;
        QString id;
    };
    struct Result {
        QJsonArray assets;
        QString error;
        bool replace = false;
        QStringList failedWatchIds = {};
        QJsonObject settlement = {};
        std::optional<QString> folder = {};
        std::optional<nt::Clip> media = {};
        std::optional<quint64> queryGeneration = {};
        bool display = true;
    };
    void request(std::function<Result(nt::server::ServerClient&)> work,
                 std::function<void(const Result&)> done = {},
                 std::optional<quint64> documentEpoch = {},
                 std::shared_ptr<std::atomic_bool> queryCancel = {});
    void updateAsset(const QJsonObject& fields);
    QString projectId() const;
    void transferState(const QString& id, const QString& status, const QString& error = {});
    void importNext();
    QueuedImport takeNextImport();
    void pollProxies();
    void receive(const Result& result);
    bool applyDrop(const QJsonObject& payload);
    void queueMedia(const QJsonObject& asset, const QJsonObject& clip,
                    QPointer<TimelineModel> model, quint64 generation);
    void queueLinkedAudio(const QJsonObject& asset, const QString& audioClipId,
                          QPointer<TimelineModel> model, quint64 generation, quint64 token,
                          const QJsonObject& capturedResult, const QString& createdAudioTrackId);
    void resetDocumentState();
    void protectDocumentMedia();
    void reconcileLinkedAudio();
    struct AudioSettlement {
        quint64 token;
        QJsonObject payload;
        QJsonObject capturedDocument;
    };
    QHash<QString, AudioSettlement> m_settlements;
    std::shared_ptr<nt::assets::MediaProtection> m_mediaProtection = std::make_shared<nt::assets::MediaProtection>();
    bool m_reconciling = false;
    std::optional<nt::server::SaveTarget> m_target;
    QPointer<TimelineModel> m_timeline;
    QPointer<QThread> m_thread;
    QJsonArray m_assets;
    QVariantMap m_thumbnails;
    QHash<QString, int> m_pending;
    std::deque<QueuedImport> m_files;
    QString m_searchText;
    QString m_typeFilter;
    QString m_tagFilter;
    bool m_favoritesOnly = false;
    quint64 m_queryGeneration = 0;
    quint64 m_documentEpoch = 0;
    std::shared_ptr<std::atomic_bool> m_activeQueryCancel;
    bool m_hasQueried = false;
    QString m_libraryProject;
    QHash<QString, QString> m_folderNames;
    QVariantList m_transfers;
    QHash<QString, QueuedImport> m_imports;
    QString m_error;
    QString m_folderId;
    QStringList m_folderPath;
    struct Request {
        std::function<Result(nt::server::ServerClient&)> work;
        std::function<void(const Result&)> done;
        std::optional<quint64> documentEpoch;
        std::shared_ptr<std::atomic_bool> queryCancel;
    };
    std::deque<Request> m_requests;
    QTimer m_poll;
};
